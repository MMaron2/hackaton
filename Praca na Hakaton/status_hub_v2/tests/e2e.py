"""End-to-end check: inject failures in the generator, see how fast and how correctly the Hub reacts.

    # terminal 1: python3 generator/server.py --port 8601
    # terminal 2: cd hub && python3 server.py --port 8602 --source http://127.0.0.1:8601
    python3 tests/e2e.py            -> prints a table and writes tests/E2E_RESULTS.md
Times are SIMULATED minutes (the generator runs 120x faster than real time during the test).
"""
import json
import time
import urllib.request as u
from pathlib import Path

GEN, HUB = "http://127.0.0.1:8601", "http://127.0.0.1:8602"
g = lambda base, p: json.load(u.urlopen(base + p, timeout=10))
post = lambda b: json.load(u.urlopen(u.Request(GEN + "/api/control", data=json.dumps(b).encode(), headers={"Content-Type": "application/json"}), timeout=10))


def fresh(speed=120):
    post({"action": "reset"})
    post({"action": "speed", "value": speed})
    time.sleep(3.5)


rows = []
for name, label, secs in (("cdn_silent", "Awaria CDN, dostawca milczy 12 min", 13), ("player_bug", "Cichy błąd playera", 12), ("mem_leak", "Wyciek pamięci cms-01", 16), ("slow_db", "Wolna baza CMS", 12),
                          ("dns", "Awaria DNS", 14), ("hosts", "Serwer niedostępny + skok CPU", 10)):
    fresh()
    post({"action": "scenario", "name": name})
    time.sleep(secs)
    s = g(HUB, "/api/state")
    for t in s["truth"]:
        rows.append((label, t["label"], t["target"], t["ttn"], t["tta"], t["hyp_ok"], (s["incident"] or (s["closed"][0] if s["closed"] else {})).get("sev", "-")))
# finale without scaling
fresh(120)
time.sleep(52)
s = g(HUB, "/api/state")
inc = s["incident"] or (s["closed"][0] if s["closed"] else None)
fin = ("Finał programu bez skalowania", "wydarzenie z kalendarza", "player", "ostrzeżenie " + ("tak" if any(n["risk"] for n in s["notices"]) or any("ryzyko" in n["text"] for n in s["notes"]) else "nie"),
       None, bool(inc and any(h["key"].startswith("capacity") for h in inc["hyps"])), inc["sev"] if inc else "-")
rows.append(fin)
# quiet period with enough capacity: false alarms
fresh(600)
for sv, f in (("player", 2), ("web", 1.5), ("api", 1.5)):
    post({"action": "scale", "service": sv, "factor": f})
time.sleep(75)
s = g(HUB, "/api/state")
fa = len(s["closed"]) + (1 if s["incident"] else 0)
out = ["# Wyniki testu end-to-end (czasy w minutach symulowanych)\n", "| scenariusz | wstrzyknięto | cel | wykrycie po [min] | do potwierdzenia | trafna hipoteza | waga |", "|---|---|---|---|---|---|---|"]
for r in rows:
    out.append("| " + " | ".join("-" if x is None else ("tak" if x is True else "nie" if x is False else str(x)) for x in r) + " |")
out += ["", f"Fałszywe incydenty w ok. {s['clock'][5:10]} ({(600 * 75) // 60 // 60} h symulacji z finałem i odpowiednią pojemnością): **{fa}**", ""]
Path(__file__).with_name("E2E_RESULTS.md").write_text("\n".join(out))
print("\n".join(out))
