"""Status Hub demo server (real New Relic data replay + simulated call centre and analytics + LIVE external provider statuses).

    python3 server/server.py --port 8700
    python3 server/server.py --port 8700 --no-external          # bez modułu statusów dostawców na żywo (np. brak dostępu do internetu)
    python3 server/server.py --port 8700 --generator http://localhost:8641 --generator-hub http://localhost:8642   # źródło „Generator awarii”
"""
import json
import mimetypes
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from engine import CFG, Demo

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
WEB = ROOT / "web"
DATA = json.loads((ROOT / "data" / "replay.json").read_text(encoding="utf-8"))
NR = json.loads((ROOT / "data" / "nr_model.json").read_text(encoding="utf-8"))
DEMO = Demo(DATA)
LOCK = threading.RLock()
COND = threading.Condition()
VERSION = [0]

# Statusy dostawców zewnętrznych NA ŻYWO (moduł status_uslug.py). Działają niezależnie od odtwarzanego okna New Relic i nie wpływają na incydenty Huba.
EXT = {"mon": None, "note": "moduł jeszcze nie uruchomiony"}
XCOND = threading.Condition()
XVERSION = [0]

# Tryb „Generator awarii”: Hub v2 (status_hub_v2/hub) czyta generator awarii (status_hub_v2/generator); v3 tylko przekazuje jego stan do interfejsu.
GEN = {"hub": "http://localhost:8642", "generator": "http://localhost:8641"}


def gen_call(base, path, body=None, timeout=3):
    req = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="GET" if body is None else "POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)


def gen_state():
    try:
        st = gen_call(GEN["hub"], "/api/state")
        st["offline"] = False
        try:                                      # prędkość zegara generatora (do podświetlenia przycisku i opisu czasu w interfejsie)
            st["gen_speed"] = gen_call(GEN["generator"], "/api/ping", timeout=2).get("speed")
        except Exception:
            st["gen_speed"] = None
    except Exception as e:                       # Hub generatora nie działa: interfejs pokaże, jak go uruchomić
        st = {"offline": True, "error": f"Hub generatora ({GEN['hub']}) nie odpowiada ({type(e).__name__}). Uruchom ./start_all.command (generator 8641 i Hub 8642)."}
    st["gen_urls"] = dict(GEN)
    return st


def bump():
    with COND:
        VERSION[0] += 1
        COND.notify_all()


def runner():
    while True:
        with LOCK:
            paused, sp, iv = DEMO.paused, DEMO.speed, DEMO.iv
            if not paused and not DEMO.at_end():
                DEMO.step()
        bump()
        time.sleep(0.3 if (paused or DEMO.at_end()) else iv * 60.0 / max(1, sp))


def ext_runner(mon):
    """Budzi strumień SSE po każdym zakończonym sprawdzeniu, najwyżej raz na sekundę."""
    while True:
        if not mon.dirty.wait(1.0):
            continue
        mon.dirty.clear()
        with XCOND:
            XVERSION[0] += 1
            XCOND.notify_all()
        time.sleep(1.0)


def start_external(enabled, interval, providers_path):
    if not enabled:
        EXT["note"] = "wyłączony parametrem --no-external"
        return
    try:
        from status_uslug import Monitor
        providers = json.loads(Path(providers_path).read_text(encoding="utf-8")) if providers_path else None
        mon = Monitor(providers=providers, interval_s=interval)
        mon.start()
    except Exception as e:                      # brak pliku, zła konfiguracja itp.: reszta aplikacji ma działać dalej
        EXT["note"] = f"nie udało się uruchomić modułu ({type(e).__name__}: {e})"
        return
    EXT["mon"], EXT["note"] = mon, None
    threading.Thread(target=ext_runner, args=(mon,), daemon=True).start()


def ext_snapshot():
    mon = EXT["mon"]
    return mon.snapshot() if mon else {"disabled": True, "note": EXT["note"]}


def control(b):
    with LOCK:
        if "scenario" in b:
            DEMO.load(b["scenario"], int(b.get("offset", -90)))
        if "speed" in b:
            DEMO.speed = max(10, min(1200, int(b["speed"])))
        if "pause" in b:
            DEMO.paused = bool(b["pause"])
        if "restart" in b:
            DEMO.load(DEMO.s["id"], int(b.get("offset", -90)))
        if "auto_ack" in b:
            DEMO.cfg["auto_ack"] = bool(b["auto_ack"])
    bump()
    return {"ok": True}


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

    def snap(self):
        with LOCK:
            return DEMO.snapshot()

    def stream(self, get, cond, version):
        """Server-Sent Events: pełna migawka po każdej zmianie, w ciszy komentarz „ping” co 10 s."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        last = -1
        try:
            while True:
                with cond:
                    if version[0] == last:
                        cond.wait(timeout=10)
                    v = version[0]
                if v != last:
                    self.wfile.write(f"data: {json.dumps(get(), ensure_ascii=False, default=str)}\n\n".encode())
                else:
                    self.wfile.write(b": ping\n\n")
                self.wfile.flush()
                last = v
        except (BrokenPipeError, ConnectionResetError, OSError):
            return

    def do_GET(self):
        u = urlparse(self.path)
        p = u.path
        if p == "/api/state":
            return self.send_json(self.snap())
        if p == "/api/scenarios":
            with LOCK:
                return self.send_json(DEMO.scenarios())
        if p == "/api/thresholds":
            return self.send_json(dict(learned=DATA["thresholds"], cards={k: dict(name=v["name"], kind=v["kind"], desc=v["desc"]) for k, v in DATA["cards"].items()}, manual=CFG, nr=NR.get("learned", []), meta=NR.get("meta", {}), quant=DATA.get("quant", 0.999), healthy=DATA.get("healthy", [])))
        if p in ("/api/nr/model", "/api/nr/replay"):
            if p == "/api/nr/model":
                return self.send_json(dict({k: v for k, v in NR.items() if k != "replays"}, replays=[{k: v for k, v in r.items() if k != "frames"} for r in NR["replays"]]))
            rid = parse_qs(u.query).get("id", [""])[0]
            r = next((r for r in NR["replays"] if r["id"] == rid), None)
            return self.send_json(r if r else {"error": "nieznany incydent"}, 200 if r else 404)
        if p == "/api/external":
            return self.send_json(ext_snapshot())
        if p == "/api/gen/state":
            return self.send_json(gen_state())
        if p == "/api/stream":
            return self.stream(self.snap, COND, VERSION)
        if p == "/api/external/stream":
            return self.stream(ext_snapshot, XCOND, XVERSION)
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
        if p == "/api/ack":
            with LOCK:
                ok = DEMO.ack(DEMO.idx[DEMO.i], "dyżurny (kliknięcie w aplikacji)")
            bump()
            return self.send_json(dict(ok=ok))
        if p == "/api/control":
            try:
                return self.send_json(control(body))
            except Exception as e:
                return self.send_json({"ok": False, "error": str(e)}, 400)
        if p in ("/api/gen/ack", "/api/gen/control", "/api/gen/generator"):
            try:
                if p == "/api/gen/ack":
                    return self.send_json(gen_call(GEN["hub"], "/api/ack", {}))
                if p == "/api/gen/control":
                    return self.send_json(gen_call(GEN["hub"], "/api/control", {k: body[k] for k in ("auto_ack",) if k in body}))
                if body.get("action") != "speed":     # z v3 wolno tylko zmienić prędkość generatora; awarie wstrzykuje się w jego własnym panelu
                    return self.send_json({"ok": False, "error": "niedozwolona akcja"}, 400)
                return self.send_json(gen_call(GEN["generator"], "/api/control", {"action": "speed", "value": int(body["value"])}))
            except Exception as e:
                return self.send_json({"ok": False, "error": f"{type(e).__name__}: {e}"}, 502)
        self.send_json({"error": "not found"}, 404)


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8700)
    ap.add_argument("--no-external", action="store_true", help="nie uruchamiaj modułu statusów dostawców na żywo (brak połączeń wychodzących do internetu)")
    ap.add_argument("--external-interval", type=float, default=8.0, help="odstęp odświeżeń statusów dostawców w sekundach (domyślnie 8)")
    ap.add_argument("--external-providers", metavar="PLIK.json", help="własna lista dostawców zamiast domyślnej (wzorzec: python3 status_uslug.py providers)")
    ap.add_argument("--generator", default=GEN["generator"], help="adres generatora awarii (panel i prędkość symulacji w trybie Generator)")
    ap.add_argument("--generator-hub", default=GEN["hub"], help="adres Huba v2 czytającego generator (stan w trybie Generator)")
    a = ap.parse_args()
    GEN["generator"], GEN["hub"] = a.generator.rstrip("/"), a.generator_hub.rstrip("/")
    start_external(not a.no_external, a.external_interval, a.external_providers)
    threading.Thread(target=runner, daemon=True).start()
    srv = ThreadingHTTPServer(("127.0.0.1", a.port), H)
    srv.daemon_threads = True
    print(f"Status Hub (pokaz na prawdziwych danych): http://localhost:{a.port}", flush=True)
    mon = EXT["mon"]
    print(f"Usługi zewnętrzne na żywo: {f'{len(mon.providers)} dostawców, {mon.n_sources} źródeł, odświeżanie co {mon.interval_s:g} s' if mon else EXT['note']}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
