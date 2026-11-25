"""Failure generator: simulated platform + the APIs a real monitoring stack would expose + a control panel.

    python3 server.py --port 8601

Source-like APIs (what the Status Hub reads): /api/status /api/metrics /api/callcenter /api/analytics /api/calendar /api/history /api/truth
Control: POST /api/control   Control panel: http://localhost:8601
"""
import json
import mimetypes
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import sim

HERE = Path(__file__).resolve().parent
WEB = HERE / "web"
W = sim.World()
COND = threading.Condition()
VERSION = [0]

SCENARIOS = {
    "cdn_silent": ("Awaria CDN, dostawca milczy 12 min", [("vendor_outage", "cdn", 0.9, 25, 2, 12)]),
    "player_bug": ("Cichy błąd playera (serwery zdrowe)", [("player_bug", "player", 0.8, 25, 2, "auto")]),
    "mem_leak": ("Wyciek pamięci na cms-01", [("memory_leak", "cms-01", 1.0, 30, 2, "auto")]),
    "slow_db": ("Wolna baza CMS, brak komunikatu", [("slow_db", "cms", 0.8, 20, 2, "auto")]),
    "dns": ("Awaria DNS", [("dns_outage", "dns", 0.8, 20, 2, 15)]),
    "hosts": ("Serwer niedostępny + skok CPU", [("host_down", "api-02", 1.0, 20, 1, "auto"), ("host_cpu_spike", "web-01", 0.8, 20, 2, "auto")]),
}


def bump():
    with COND:
        VERSION[0] += 1
        COND.notify_all()


def control(b):
    a = b.get("action")
    with W.lock:
        if a == "speed":
            W.speed = max(1, min(600, int(b["value"])))
        elif a == "pause":
            W.paused = bool(b["value"])
        elif a == "reset":
            W.reset()
        elif a == "inject":
            ann = b.get("announce", "auto")
            ann = ann if ann in ("auto", "silent") else float(ann)
            W.inject(b["type"], b["target"], b.get("severity", 0.8), b.get("duration", 20), b.get("ramp", 2), ann)
        elif a == "stop":
            W.stop(int(b["id"]))
        elif a == "clear":
            W.clear()
        elif a == "event":
            W.add_event(b["type"], b.get("title") or f"{sim.EVENT_LABEL[b['type']]} (symulacja)", float(b.get("in_min", 30)), float(b.get("duration", 90)))
        elif a == "scale":
            W.scale_target[b["service"]] = float(b["factor"])
        elif a == "outage":
            W.outage[b["source"]] = bool(b["on"])
        elif a == "scenario":
            for ty, tg, sv, du, ra, an in SCENARIOS[b["name"]][1]:
                W.inject(ty, tg, sv, du, ra, an)
            if b["name"] == "final_soon":
                pass
        elif a == "advance":                                    # test tool: fast-forward N simulated minutes (no failures are added)
            for _ in range(int(b["minutes"])):
                W.tick()
        elif a == "no_events":                                  # test tool: empty calendar (no finale/premiere)
            W.events = []
        elif a == "final_soon":
            W.add_event("final", 'Finał programu "Top Model" (symulacja)', 25, 60)
    bump()
    return {"ok": True}


def runner():
    while True:
        with W.lock:
            paused, speed = W.paused, W.speed
        if paused:
            time.sleep(0.2)
            continue
        with W.lock:
            W.tick()
        bump()
        time.sleep(60.0 / max(1, speed))


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        since = q.get("since", [None])[0]
        p = u.path
        if p.startswith("/api/") and p != "/api/stream":
            with W.lock:
                src = {"/api/metrics": "metrics", "/api/callcenter": "callcenter", "/api/analytics": "analytics", "/api/status": "status"}.get(p)
                if src and W.outage[src]:
                    return self.send_json({"error": "source unavailable (simulated outage)"}, 503)
                if p == "/api/ping":
                    return self.send_json(dict(now=W.t.strftime("%Y-%m-%dT%H:%M"), speed=W.speed, paused=W.paused))
                if p == "/api/status":
                    return self.send_json(W.status_view())
                if p == "/api/metrics":
                    return self.send_json(dict(now=W.t.strftime("%Y-%m-%dT%H:%M"), points=W.since(W.metrics, since)))
                if p == "/api/callcenter":
                    return self.send_json(dict(now=W.t.strftime("%Y-%m-%dT%H:%M"), topics=sim.TOPICS, points=W.since(W.calls, since)))
                if p == "/api/analytics":
                    return self.send_json(dict(now=W.t.strftime("%Y-%m-%dT%H:%M"), points=W.since(W.ga, since)))
                if p == "/api/calendar":
                    return self.send_json(W.calendar_view())
                if p == "/api/history":
                    return self.send_json(W.get_history())
                if p == "/api/topology":
                    return self.send_json(dict(services={k: dict(name=v["name"], vendors=v["vendors"], hosts=sim.HOSTS[k], base=v["base"]) for k, v in sim.SERVICES.items()}, vendors=sim.VENDORS))
                if p == "/api/truth":
                    return self.send_json(W.truth_view())
                if p == "/api/gui":
                    return self.send_json(dict(W.gui_state(), scenarios={k: v[0] for k, v in SCENARIOS.items()}))
            return self.send_json({"error": "not found"}, 404)
        if p == "/api/stream":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            last = -1
            try:
                while True:
                    with COND:
                        if VERSION[0] == last:
                            COND.wait(timeout=10)
                        v = VERSION[0]
                    if v != last:
                        with W.lock:
                            data = json.dumps(dict(W.gui_state(), scenarios={k: v_[0] for k, v_ in SCENARIOS.items()}), ensure_ascii=False)
                        self.wfile.write(f"data: {data}\n\n".encode())
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
        ct = mimetypes.guess_type(str(f))[0] or "application/octet-stream"
        self.send_header("Content-Type", ct + ("; charset=utf-8" if f.suffix in (".html", ".js", ".css") else ""))
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        if urlparse(self.path).path == "/api/control":
            try:
                return self.send_json(control(body))
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, 400)
        self.send_json({"error": "not found"}, 404)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()


def main():
    import argparse
    global W
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8601)
    ap.add_argument("--realtime", action="store_true", help="zegar symulacji startuje od bieżącej chwili i idzie w czasie rzeczywistym (1×) zamiast od stałej daty z 60×")
    a = ap.parse_args()
    if a.realtime:
        W = sim.World(realtime=True)
    threading.Thread(target=runner, daemon=True).start()
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), H)
    srv.daemon_threads = True
    print(f"Generator awarii: http://localhost:{a.port}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
