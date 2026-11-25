"""Status Hub server: polls the sources, runs the engine, serves the dashboard.

    python3 server.py --port 8602 --source http://localhost:8601
"""
import json
import mimetypes
import threading
import time
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from engine import Engine, P, T as ENGINE_T, iso
from model import HistModel
from sources import HttpSource

HERE = Path(__file__).resolve().parent
WEB = HERE / "web"
NR_FILE = HERE.parent / "nr" / "data" / "nr_model.json"
NR = None


def nr_load():
    """Model trained on the REAL New Relic data (exported by nr/build_nr.py); None when the file has not been built."""
    global NR
    if NR is None and NR_FILE.exists():
        NR = json.loads(NR_FILE.read_text(encoding="utf-8"))
    return NR

EXPECT = {"vendor_outage": ("vendor",), "dns_outage": ("dns", "vendor:dns"), "host_cpu_spike": ("host:",), "host_down": ("host:",), "memory_leak": ("host:",), "slow_db": ("service_slow", "capacity"),
          "player_bug": ("player_app",), "traffic_surge": ("capacity",)}


class Hub:
    def __init__(self, base):
        self.src = HttpSource(base)
        self.base = base
        self.cond = threading.Condition()
        self.version = 0
        self.engine = None
        self.connected = False
        self.err = ""
        self.since = {}
        self.last_now = None
        self.truth, self.demo = [], True
        self.cfg = dict(auto_ack=False, page_ack=5, head_ack=20, use_calendar=True)
        self.model, self.valid, self.hist = None, None, None
        self.ping = {}
        self.n = 0

    # ------------------------------------------------------------------------------------------ bootstrap
    def bootstrap(self, now):
        """Start-up must survive a source that is down right now (it simply starts silent and stale)."""
        hist = self.src.get("/api/history", timeout=20)
        self.model = HistModel().train(hist)
        self.valid = HistModel.validate(hist)
        topo = self.src.get("/api/topology")
        self.engine = eng = Engine(self.model, topo)
        eng.cfg.update(self.cfg)
        eng.now = now
        safe = lambda path, default: (lambda: self._try(path, default))()
        eng.set_calendar(safe("/api/calendar", []))
        self.since = {}
        eng.silent = True                                       # replay the recent past without notifying
        m = safe("/api/metrics", None)
        if m is None:
            self.since["metrics"] = iso(now)
        else:
            for pt in m["points"]:
                eng.on_metrics(pt)
                self.since["metrics"] = pt["ts"]
        for k, fn in (("callcenter", eng.on_calls), ("analytics", eng.on_ga)):
            r = safe(f"/api/{k}", None)
            if r is None:
                self.since[k] = iso(now)
                continue
            fn(r["points"])
            self.since[k] = r["points"][-1]["ts"] if r["points"] else iso(now)
        st = safe("/api/status", None)
        if st is not None:
            eng.on_status(st)
        eng.tick(now)
        eng.silent = False
        self.last_now = now

    def _try(self, path, default):
        try:
            return self.src.get(path, timeout=20)
        except Exception:
            return default

    def poll(self):
        try:
            ping = self.src.get("/api/ping")
        except Exception as e:
            self.connected, self.err = False, str(e)
            return True
        self.ping = ping
        now = P(ping["now"])
        if not self.connected or self.engine is None or (self.last_now and now < self.last_now - timedelta(minutes=5)):
            try:
                self.bootstrap(now)
            except Exception as e:
                self.connected, self.err = False, f"bootstrap: {e}"
                return True
            self.connected, self.err = True, ""
            return True
        if now == self.last_now:
            return False
        eng = self.engine
        for key, ep, fn in (("metrics", "metrics", eng.on_metrics), ("callcenter", "callcenter", None), ("analytics", "analytics", None)):
            try:
                path = f"/api/{ep}" + (f"?since={self.since[key]}" if key in self.since else "")
                r = self.src.get(path)
            except Exception:
                continue                                           # a failing source goes stale inside the engine
            pts = r["points"]
            if key == "metrics":
                for pt in pts:
                    eng.on_metrics(pt)
            elif key == "callcenter":
                eng.on_calls(pts)
            else:
                eng.on_ga(pts)
            if pts:
                self.since[key] = pts[-1]["ts"]
        try:
            eng.on_status(self.src.get("/api/status"))
        except Exception:
            pass
        if self.n % 5 == 0:
            try:
                eng.set_calendar(self.src.get("/api/calendar"))
            except Exception:
                pass
        if self.demo:
            try:
                self.truth = self.src.get("/api/truth")
            except Exception:
                pass
        eng.cfg.update(self.cfg)
        eng.tick(now)
        self.last_now = now
        self.n += 1
        return True

    # ------------------------------------------------------------------------------------------ views
    def truth_view(self):
        eng = self.engine
        incs = ([eng.inc] if eng.inc else []) + eng.closed
        out = []
        for f in self.truth:
            fs, fe = P(f["start"]), P(f["end"])
            m = None
            for c in sorted(incs, key=lambda c: c["head"]):
                if fs - timedelta(minutes=1) <= c["head"] <= fe + timedelta(minutes=25):
                    m = c
                    break
            exp = EXPECT.get(f["type"], ())
            seen = list(m.get("seen", [])) if m else []
            out.append(dict(f, page_in=None if not (m and m["page"]) else int((m["page"] - fs).total_seconds() / 60), detected=bool(m), ttn=None if not m else int((m["head"] - fs).total_seconds() / 60), tta=None if not (m and m["ack"]) else int((m["ack"] - fs).total_seconds() / 60),
                            hyp_ok=bool(m) and any(k.startswith(e) for k in seen for e in exp), inc=None if not m else m["id"], waiting=int((eng.now - fs).total_seconds() / 60) if (eng.now and not m) else None))
        return out[-12:][::-1]

    def snapshot(self):
        base = dict(connected=self.connected, error=self.err, source=self.base, ping=self.ping, demo=self.demo, cfg=dict(self.cfg))
        if self.engine is None or self.engine.now is None:
            return dict(base, ready=False)
        s = self.engine.snapshot()
        s.update(base, ready=True, truth=self.truth_view() if self.demo else [])
        return s

    def model_view(self):
        m = self.model
        if not m:
            return {}
        return dict(info=m.info, mult=m.mult, validation=self.valid, bins=[dict(lo=a, hi=b) for a, b in zip(__import__("model").BINS[:-1], __import__("model").BINS[1:])],
                    bin_resp={s: [round(x, 2) for x in v] for s, v in m.bin_resp.items()}, bin_cpu={s: [round(x, 1) for x in v] for s, v in m.bin_cpu.items()},
                    topics=m.topics, svc=m.svcs)

    def bump(self):
        with self.cond:
            self.version += 1
            self.cond.notify_all()


HUB = None


def runner():
    while True:
        try:
            changed = HUB.poll()
        except Exception as e:                                       # never let the loop die
            HUB.err = f"poll: {e}"
            changed = True
        if changed:
            HUB.bump()
        time.sleep(0.5)


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False, default=str).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        p = urlparse(self.path).path
        if p == "/api/state":
            return self.send_json(HUB.snapshot())
        if p == "/api/model":
            return self.send_json(HUB.model_view())
        if p == "/api/thresholds":
            nr = nr_load() or {}
            return self.send_json(dict(learned=nr.get("learned", []), meta=nr.get("meta", {}), manual=ENGINE_T))
        if p in ("/api/nr/model", "/api/nr/replay"):
            nr = nr_load()
            if nr is None:
                return self.send_json({"error": "brak nr/data/nr_model.json: uruchom nr/build_nr.py"}, 404)
            if p == "/api/nr/model":
                return self.send_json(dict({k: v for k, v in nr.items() if k != "replays"}, replays=[{k: v for k, v in r.items() if k != "frames"} for r in nr["replays"]]))
            rid = parse_qs(urlparse(self.path).query).get("id", [""])[0]
            r = next((r for r in nr["replays"] if r["id"] == rid), None)
            return self.send_json(r if r else {"error": "nieznany incydent"}, 200 if r else 404)
        if p == "/api/stream":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            last = -1
            try:
                while True:
                    with HUB.cond:
                        if HUB.version == last:
                            HUB.cond.wait(timeout=10)
                        v = HUB.version
                    if v != last:
                        self.wfile.write(f"data: {json.dumps(HUB.snapshot(), ensure_ascii=False, default=str)}\n\n".encode())
                    else:
                        self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
                    last = v
            except (BrokenPipeError, ConnectionResetError, OSError):
                return
        rel = "index.html" if p in ("/", "") else p.lstrip("/")
        f = (WEB / rel).resolve()
        if WEB.resolve() not in f.parents or not f.is_file():
            return self.send_json({"error": "not found"}, 404)
        b = f.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", (mimetypes.guess_type(str(f))[0] or "application/octet-stream") + ("; charset=utf-8" if f.suffix in (".html", ".js", ".css") else ""))
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        p = urlparse(self.path).path
        if p == "/api/ack" and HUB.engine:
            ok = HUB.engine.ack(HUB.engine.now, "dyżurny (kliknięcie w aplikacji)")
            HUB.bump()
            return self.send_json(dict(ok=ok))
        if p == "/api/control":
            for k in ("auto_ack", "page_ack", "head_ack", "use_calendar"):
                if k in body:
                    HUB.cfg[k] = body[k]
            if "demo" in body:
                HUB.demo = bool(body["demo"])
            if HUB.engine:
                HUB.engine.cfg.update(HUB.cfg)
                HUB.engine.apply_calendar()
            HUB.bump()
            return self.send_json(dict(ok=True))
        self.send_json({"error": "not found"}, 404)


def main():
    import argparse
    global HUB
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8602)
    ap.add_argument("--source", default="http://localhost:8601")
    a = ap.parse_args()
    HUB = Hub(a.source)
    threading.Thread(target=runner, daemon=True).start()
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), H)
    srv.daemon_threads = True
    print(f"Status Hub: http://localhost:{a.port}  (źródło: {a.source})", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
