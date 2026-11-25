"""What do we gain? The 9 REAL incidents from the Jira table are mapped to the generator's failure types and replayed against the Hub with
more and more sources switched on. Compared with how long people really needed (Jira: onset -> acknowledgement).

    python3 tests/compare.py --gen 8621 --hub 8622        (generator and hub must be running; ~7 min)

IMPORTANT: the mapping from a real incident to a simulated failure is my assumption (by title and cause), the simulated sources are
fabricated, and the Hub rules were written against the same simulator. The comparison shows what the extra sources could be worth, not what they will deliver.
"""
import argparse
import csv
import json
import time
import urllib.request as u
from datetime import datetime
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument("--gen", type=int, default=8621)
ap.add_argument("--hub", type=int, default=8622)
ap.add_argument("--speed", type=int, default=240)
ap.add_argument("--wait", type=float, default=8.0)
ap.add_argument("--resume-log", help="reuse the per-run lines of an earlier (interrupted) run instead of repeating them")
a = ap.parse_args()
GEN, HUB = f"http://127.0.0.1:{a.gen}", f"http://127.0.0.1:{a.hub}"
g = lambda base, p: json.load(u.urlopen(base + p, timeout=15))
post = lambda b, base=GEN, p="/api/control": json.load(u.urlopen(u.Request(base + p, data=json.dumps(b).encode(), headers={"Content-Type": "application/json"}), timeout=15))
hub_ctl = lambda b: post(b, HUB)

# real human timeline from the Jira table (onset -> acknowledgement); AIIT-2686 onset 06:50 given by the data owner
T = lambda s: datetime.strptime(s[:16], "%Y-%m-%d %H:%M")
human = {}
for r in csv.DictReader(open(Path(__file__).resolve().parents[2] / "early-warning" / "data" / "incidents.csv", encoding="utf-8")):
    if r.get("KLUCZ"):
        onset = T("2025-12-31 06:50") if r["KLUCZ"] == "AIIT-2686" else T(r["DATA_ROZPOCZECIA"])
        human[r["KLUCZ"]] = (r["TYTUL"], r["PRZYCZYNA"], r["WYKRYCIE"], int((T(r["MTTA"]) - onset).total_seconds() / 60))

# mapping: real incident -> simulated failure(s)   (assumption)
MAP = [("AIIT-2686", [("vendor_outage", "aws", 0.6, "auto")]), ("AIIT-2987", [("slow_db", "web", 0.9, "auto"), ("slow_db", "cms", 0.9, "auto")]), ("AIIT-3006", [("vendor_outage", "aws", 0.5, "auto")]),
       ("AIIT-3017", [("slow_db", "cms", 0.6, "auto")]), ("AIIT-3104", [("vendor_outage", "redge", 0.8, "auto")]), ("AIIT-3133", [("vendor_outage", "redge", 0.8, "auto")]),
       ("AIIT-3139", [("dns_outage", "dns", 0.8, "auto")]), ("MIT-31", [("player_bug", "player", 0.8, "auto")]), ("MIT-36", [("vendor_outage", "redge", 0.7, "auto")])]
# sources switched on in each configuration (the others are switched off in the generator = the Hub never sees them)
CONFIGS = [("A: metryki serwerów (jak dziś)", ["callcenter", "analytics", "status"]), ("B: + statusy dostawców i usług", ["callcenter", "analytics"]),
           ("C: + infolinia", ["analytics"]), ("D: + analityka (wszystkie źródła)", [])]


def fresh(off, calendar=True):
    post({"action": "reset"})
    post({"action": "speed", "value": a.speed})
    hub_ctl({"use_calendar": calendar, "demo": True})
    for src in ("metrics", "callcenter", "analytics", "status"):
        post({"action": "outage", "source": src, "on": src in off})
    time.sleep(4.0)


res = {}
RESUME = {}
FA_RESUME = {}
if a.resume_log:
    import ast
    import re
    for line in open(a.resume_log, encoding="utf-8"):
        m = re.match(r"^([ABCD]): (\S+)\s+detected=(\w+) ttn=(\S+) page=(\S+) hyp_ok=(\w+)", line)
        if m:
            nm = next(c[0] for c in CONFIGS if c[0].startswith(m.group(1)))
            toint = lambda x: None if x == "None" else int(x)
            RESUME[(nm, m.group(2))] = dict(ttn=toint(m.group(4)), page=toint(m.group(5)), hyp=m.group(6) == "True")
        m = re.match(r"^(z kalendarzem|bez kalendarza) (\[.*\])$", line.strip())
        if m:
            FA_RESUME[m.group(1)] = ast.literal_eval(m.group(2))
for cname, off in CONFIGS:
    for key, fails in MAP:
        if (cname, key) in RESUME:
            res[(cname, key)] = RESUME[(cname, key)]
            continue
        fresh(off)
        for ty, tg, sv, an in fails:
            post({"action": "inject", "type": ty, "target": tg, "severity": sv, "duration": 40, "ramp": 2, "announce": an})
        time.sleep(a.wait)
        s = g(HUB, "/api/state")
        t = s["truth"]
        det = [x for x in t if x["detected"]]
        ttn = min((x["ttn"] for x in det), default=None)
        page = min((x["page_in"] for x in det if x["page_in"] is not None), default=None)
        res[(cname, key)] = dict(ttn=ttn, page=page, hyp=any(x["hyp_ok"] for x in det))
        print(f"{cname[:2]} {key:10s} detected={bool(det)} ttn={ttn} page={page} hyp_ok={res[(cname, key)]['hyp']}", flush=True)

# value of the history model: false incidents during a well-provisioned finale, with and without calendar knowledge
fa = {}
for label, cal in (("z kalendarzem", True), ("bez kalendarza", False)):
    if label in FA_RESUME:
        fa[label] = FA_RESUME[label]
        continue
    post({"action": "reset"})
    post({"action": "speed", "value": 600})
    hub_ctl({"use_calendar": cal, "demo": False})
    for src in ("metrics", "callcenter", "analytics", "status"):
        post({"action": "outage", "source": src, "on": False})
    for sv, f in (("player", 2), ("web", 1.5), ("api", 1.5)):
        post({"action": "scale", "service": sv, "factor": f})
    time.sleep(78)
    s = g(HUB, "/api/state")
    incs = ([s["incident"]] if s["incident"] else []) + s["closed"]
    fa[label] = [(c["id"], c["sev"], c["start"][11:], c["hyps"][0]["title"] if c["hyps"] else "-") for c in incs]
    print(label, fa[label], flush=True)

# value of the history model for an UNSCALED finale: how early does the Hub speak, and how many minutes do users see errors if the operator
# scales the player 5 minutes after the first Hub message (forecast or incident)?
def finale(cal):
    post({"action": "reset"})
    post({"action": "speed", "value": 240})
    hub_ctl({"use_calendar": cal, "demo": False})
    for src in ("metrics", "callcenter", "analytics", "status"):
        post({"action": "outage", "source": src, "on": False})
    time.sleep(4.0)
    first, scaled, start = None, False, None
    while True:
        now = T(g(GEN, "/api/ping")["now"].replace("T", " "))
        s_ = g(HUB, "/api/state")
        if start is None:
            ev = g(GEN, "/api/calendar")
            if ev:
                start = T(ev[0]["start"].replace("T", " "))
        msgs = [n for n in s_["notes"] if n["level"] == "headsup" or (n["level"] == "forecast" and "ryzyko" in n["text"])]
        if first is None and msgs:
            first = T(msgs[0]["ts"].replace("T", " "))
        if first is not None and not scaled and (now - first).total_seconds() >= 300:
            post({"action": "scale", "service": "player", "factor": 2})
            scaled = True
        if now >= T("2026-11-27 22:40"):
            break
        time.sleep(0.5)
    pts = g(GEN, "/api/metrics")["points"]
    err_min = sum(1 for p_ in pts if p_["services"]["player"]["err"] >= 3.0)
    peak = max(p_["services"]["player"]["err"] for p_ in pts)
    return dict(first=None if first is None else int((first - start).total_seconds() / 60), err_min=err_min, peak=round(peak, 1))


fin = {label: finale(cal) for label, cal in (("z kalendarzem", True), ("bez kalendarza", False))}
print(fin, flush=True)
hub_ctl({"use_calendar": True, "demo": True})

# ----------------------------------------------------------------------------- report
PAGE_ACK = 5
out = ["# Co zyskujemy: 9 prawdziwych incydentów z tabeli Jiry odtworzonych w symulatorze\n",
       "> Odwzorowanie incydentu na awarię symulatora jest moim założeniem (po tytule i przyczynie). Źródła są symulowane, a reguły Huba pisane pod ten sam symulator. "
       "Porównanie pokazuje, ile mogą być warte dodatkowe źródła, a nie ile dostarczą. Czasy Huba to minuty symulacji (±3 min).\n",
       f"## Czas do pierwszego powiadomienia Huba [min od początku awarii] i oszacowany zysk (pager + {PAGE_ACK} min reakcji; wiadomość + 20 min)\n",
       "| incydent | przyczyna (Jira) | ludzie: do potwierdzenia | " + " | ".join(c[0][:1] for c in CONFIGS) + " | Hub D: potwierdzenie | zysk D |", "|---|---|---|" + "---|" * len(CONFIGS) + "---|---|"]
tot = {c[0]: 0 for c in CONFIGS}
cov = {c[0]: 0 for c in CONFIGS}
hy = {c[0]: 0 for c in CONFIGS}
for key, _ in MAP:
    title, cause, how, hd = human[key]
    cells = []
    for cname, _ in CONFIGS:
        r = res[(cname, key)]
        cells.append("brak" if r["ttn"] is None else f"{r['ttn']}" + (" ✓" if r["hyp"] else " ?"))
        if r["ttn"] is not None:
            cov[cname] += 1
            hy[cname] += bool(r["hyp"])
            ack = (r["page"] + PAGE_ACK) if r["page"] is not None else r["ttn"] + 20
            tot[cname] += max(0, hd - ack)
    rd = res[(CONFIGS[-1][0], key)]
    ackd = None if rd["ttn"] is None else ((rd["page"] + PAGE_ACK) if rd["page"] is not None else rd["ttn"] + 20)
    out.append(f"| {key} | {cause} | {hd} ({how}) | " + " | ".join(cells) + f" | {'-' if ackd is None else ackd} | {'-' if ackd is None else max(0, hd - ackd)} |")
hsum = sum(v[3] for v in human.values())
out += ["", "✓ = trafna hipoteza przyczyny, ? = wykryto, ale hipoteza inna. 'brak' = Hub nie wykrył w 32 min symulacji.\n", "## Podsumowanie konfiguracji\n",
       f"| konfiguracja | wykryte incydenty | trafna hipoteza | zaoszczędzone minuty do potwierdzenia (z {hsum} min u ludzi) |", "|---|---|---|---|"]
for cname, _ in CONFIGS:
    out.append(f"| {cname} | {cov[cname]} z {len(MAP)} | {hy[cname]} z {cov[cname]} | {tot[cname]} |")
out += ["", "## Wartość modelu historycznego: fałszywe incydenty podczas finału z odpowiednią pojemnością (ok. 12 h symulacji)\n", "| model | fałszywe incydenty |", "|---|---|"]
for k, v in fa.items():
    out.append(f"| {k} | {len(v)}" + (": " + "; ".join(f"#{i} {sv} o {t} ({h})" for i, sv, t, h in v) if v else "") + " |")
out += ["", "## Wartość modelu historycznego: finał programu BEZ wcześniejszego zwiększenia pojemności\n",
        "Operator zwiększa pojemność playera ×2 w 5 minut po pierwszej wiadomości Huba (prognoza z ryzykiem albo incydent).\n",
        "| model | pierwsza wiadomość względem startu finału [min] | minuty z błędami playera ≥ 3% | szczyt błędów |", "|---|---|---|---|"]
for k, v in fin.items():
    out.append(f"| {k} | {'brak' if v['first'] is None else v['first']} | {v['err_min']} | {v['peak']}% |")
(Path(__file__).with_name("COMPARISON.md")).write_text("\n".join(out) + "\n")
print("\n".join(out))
