"""New scenarios that are NOT the 9 replayed Jira incidents and NOT the preset scenarios: different failure types, targets, severities, hours of the day.
Question: which signal speaks first, the automated sources (server metrics + model, statuses, analytics) or the people (call-centre reports)?

    python3 tests/scenarios.py --gen 8641 --hub 8642        (~5 min; the generator must have the 'advance'/'no_events' actions)

The call centre and analytics are SIMULATED: how many people call per minute is an assumption of the generator, so 'people' here means that assumption.
"""
import argparse
import json
import time
import urllib.request as u
from datetime import datetime, timedelta
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--gen", type=int, default=8641)
ap.add_argument("--hub", type=int, default=8642)
ap.add_argument("--speed", type=int, default=240)
a = ap.parse_args()
GEN, HUB = f"http://127.0.0.1:{a.gen}", f"http://127.0.0.1:{a.hub}"
g = lambda base, p: json.load(u.urlopen(base + p, timeout=20))
post = lambda b, base=GEN, p="/api/control": json.load(u.urlopen(u.Request(base + p, data=json.dumps(b).encode(), headers={"Content-Type": "application/json"}), timeout=20))
T = lambda s: datetime.strptime(s[:16].replace("T", " "), "%Y-%m-%d %H:%M")

# (name, clock, [(type, target, severity, announce)], duration)
SC = [("noc: cichy błąd playera", "03:10", [("player_bug", "player", .8, "auto")], 35),
      ("noc: AWS awaria, dostawca milczy", "03:40", [("vendor_outage", "aws", .6, "silent")], 35),
      ("noc: serwer CMS niedostępny", "04:30", [("host_down", "cms-02", 1.0, "auto")], 35),
      ("rano: wolna baza wyszukiwarki", "07:50", [("slow_db", "search", .7, "auto")], 35),
      ("rano: subtelny błąd playera (0,35)", "08:30", [("player_bug", "player", .35, "auto")], 35),
      ("przedpołudnie: CDN częściowa awaria (0,3)", "10:15", [("vendor_outage", "cdn", .3, "auto")], 35),
      ("południe: wyciek pamięci web-02", "11:00", [("memory_leak", "web-02", 1.0, "auto")], 60),
      ("południe: nagły napływ ruchu na API", "12:20", [("traffic_surge", "api", .8, "auto")], 35),
      ("popołudnie: skok CPU na DAM", "13:40", [("host_cpu_spike", "dam-01", .7, "auto")], 35),
      ("popołudnie: częściowa awaria DNS (0,4)", "14:30", [("dns_outage", "dns", .4, "auto")], 35),
      ("popołudnie: wolna baza API + błąd playera", "15:20", [("slow_db", "api", .6, "auto"), ("player_bug", "player", .6, "auto")], 35),
      ("popołudnie: Redge, komunikat po 25 min", "16:10", [("vendor_outage", "redge", .5, 25)], 35),
      ("popołudnie: wolna baza DAM", "17:00", [("slow_db", "dam", .6, "auto")], 35),
      ("wieczór: AWS awaria całkowita (0,9)", "19:00", [("vendor_outage", "aws", .9, "auto")], 35),
      ("wieczór (szczyt): błąd playera (0,5)", "21:00", [("player_bug", "player", .5, "auto")], 35),
      ("noc: serwer playera + skok CPU web", "22:30", [("host_down", "player-01", 1.0, "auto"), ("host_cpu_spike", "web-03", .8, "auto")], 35)]
LANES = {"servers": "serwery (model metryk)", "status": "statusy dostawców", "analytics": "analityka GA", "calls": "infolinia (ludzie)"}


def now():
    return T(g(GEN, "/api/ping")["now"])


def advance_to(clock):
    h, m = map(int, clock.split(":"))
    n = now()
    tgt = n.replace(hour=h, minute=m)
    if tgt <= n + timedelta(minutes=30):
        tgt += timedelta(days=1)
    post({"action": "advance", "minutes": int((tgt - n).total_seconds() / 60)})


post({"action": "reset"})
post({"action": "no_events"})
post({"action": "speed", "value": a.speed})
post({"action": "scale", "service": "player", "factor": 1})
for s in ("metrics", "callcenter", "analytics", "status"):
    post({"action": "outage", "source": s, "on": False})
time.sleep(5)
rows = []
for name, clock, fails, dur in SC:
    advance_to(clock)
    time.sleep(5)
    s0 = g(HUB, "/api/state")
    n_closed0 = len(s0["closed"])
    t0 = now()
    for ty, tg, sv, an in fails:
        post({"action": "inject", "type": ty, "target": tg, "severity": sv, "duration": dur, "ramp": 2, "announce": an})
    time.sleep((dur + 1) * 60 / a.speed + 2)
    s = g(HUB, "/api/state")
    incs = ([s["incident"]] if s["incident"] else []) + s["closed"]
    mine = [c for c in incs if t0 - timedelta(minutes=1) <= T(c["head"]) <= t0 + timedelta(minutes=dur + 10) and T(c["start"]) >= t0 - timedelta(minutes=2)]
    lane = {k: None for k in LANES}
    head = page = None
    hyp = "-"
    sev = "-"
    for c in sorted(mine, key=lambda c: c["head"]):
        head = T(c["head"]) if head is None else min(head, T(c["head"]))
        if c["page"] and (page is None or T(c["page"]) < page):
            page = T(c["page"])
        for e in c["evidence"]:
            if e["source"] in lane:
                ts = T(e["start"])
                lane[e["source"]] = ts if lane[e["source"]] is None else min(lane[e["source"]], ts)
        if hyp == "-" and c["hyps"]:
            hyp, sev = c["hyps"][0]["title"], c["sev"]
    mn = lambda x: None if x is None else int((x - t0).total_seconds() / 60)
    rows.append(dict(name=name, clock=clock, head=mn(head), page=mn(page), hyp=hyp, sev=sev, lanes={k: mn(v) for k, v in lane.items()}, n_inc=len(mine)))
    print(f"{clock} {name:46s} Hub={mn(head)} page={mn(page)} " + " ".join(f"{k[:4]}={mn(v)}" for k, v in lane.items()) + f" hyp={hyp[:40]}", flush=True)
    post({"action": "clear"})
    post({"action": "advance", "minutes": 20})
    time.sleep(4)

# ---- report
f = lambda v: "brak" if v is None else str(v)
out = ["# Nowe scenariusze: co wykrywa szybciej, model czy zgłoszenia od ludzi?\n",
       "> Scenariusze są nowe (nie są 9 incydentami z Jiry ani gotowymi scenariuszami generatora): różne typy awarii, cele, nasilenia i godziny doby. Infolinia i analityka są **symulowane**; to, ilu ludzi dzwoni, jest założeniem generatora. Czasy w minutach od startu awarii (±3 min).\n",
       "| godz. | scenariusz | Hub (1. wiadomość) | serwery (model) | statusy | analityka | infolinia (ludzie) | pager | trafna przyczyna (1. hipoteza) |", "|---|---|---|---|---|---|---|---|---|"]
for r in rows:
    L = r["lanes"]
    out.append(f"| {r['clock']} | {r['name']} | **{f(r['head'])}** | {f(L['servers'])} | {f(L['status'])} | {f(L['analytics'])} | {f(L['calls'])} | {f(r['page'])} | {r['hyp']} |")
det = [r for r in rows if r["head"] is not None]
auto = lambda r: min([v for k, v in r["lanes"].items() if k != "calls" and v is not None], default=None)
wins = dict(auto=0, people=0, tie=0, only_auto=0, only_people=0, none=0)
for r in rows:
    A, P = auto(r), r["lanes"]["calls"]
    if A is None and P is None: wins["none"] += 1
    elif P is None: wins["only_auto"] += 1
    elif A is None: wins["only_people"] += 1
    elif A < P: wins["auto"] += 1
    elif A > P: wins["people"] += 1
    else: wins["tie"] += 1
med = lambda xs: sorted(xs)[len(xs) // 2] if xs else None
out += ["", "## Podsumowanie\n", f"- Hub wykrył **{len(det)} z {len(rows)}** scenariuszy; mediana czasu do pierwszej wiadomości: **{f(med([r['head'] for r in det]))} min**.",
        f"- Szybciej zareagowały źródła automatyczne (serwery, statusy, analityka) niż infolinia: **{wins['auto']}**; infolinia szybciej: **{wins['people']}**; remis: **{wins['tie']}**.",
        f"- Tylko źródła automatyczne dały sygnał: **{wins['only_auto']}**; tylko infolinia: **{wins['only_people']}**; nikt: **{wins['none']}**.",
        f"- Mediana pierwszego sygnału: automaty **{f(med([auto(r) for r in rows if auto(r) is not None]))} min**, infolinia **{f(med([r['lanes']['calls'] for r in rows if r['lanes']['calls'] is not None]))} min**.", ""]
Path(__file__).with_name("SCENARIOS.md").write_text("\n".join(out) + "\n")
print("\n".join(out[-8:]))
