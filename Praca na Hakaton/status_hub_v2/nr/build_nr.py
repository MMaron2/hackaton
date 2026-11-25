"""Export the model trained on the REAL New Relic data (early-warning pipeline) into a compact file the Hub can replay.

    early-warning/.venv/bin/python status_hub_v2/nr/build_nr.py

Reads (not modifies) early-warning/data/processed: thresholds.csv (learned on healthy windows), shares.parquet, anomalies.parquet,
timeline.parquet, evaluation.csv, false_alarms.csv, library.csv and the Jira table. Writes nr/data/nr_model.json.
What the model learned from the 10.3M rows: the norm of every entity (same time of day, previous 7 days), the healthy breadth
threshold of every metric group (p99.9) and the fingerprints of known incidents. What it does NOT have: cause labels (9 incidents).
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

EW = Path(__file__).resolve().parents[2] / "early-warning"
sys.path.insert(0, str(EW / "src"))
from ewarn.incidents import load_incidents, targets  # noqa: E402
from ewarn.scoring import _in_windows, _windows  # noqa: E402

P = EW / "data" / "processed"
OUT = Path(__file__).resolve().parent / "data" / "nr_model.json"
PRE, POST = 180, 60


def short(e):
    e = re.sub(r"^\(Terra\)\s*", "", str(e))
    e = re.sub(r"https?://", "", e)
    return e[:52]


def metric_of(g):
    p = g.split(".")
    return f"{p[1]}.{p[2]}: {p[3]}" if len(p) >= 4 else g


inc = load_incidents()
tg = targets(inc)
thr = pd.read_csv(P / "thresholds.csv").set_index("group")
shares = pd.read_parquet(P / "shares.parquet")
an = pd.read_parquet(P / "anomalies.parquet")
tl = pd.read_parquet(P / "timeline.parquet")
ev = pd.read_csv(P / "evaluation.csv")
fa = pd.read_csv(P / "false_alarms.csv")
shares["ratio"] = shares["share"] / shares["group"].map(thr["threshold"]).clip(lower=1e-6)
LV = ["OK", "Obserwuj", "Ostrzeżenie", "Alarm"]

replays, lift_rows = [], {}
for t in tg.itertuples():
    a0, a1 = t.DATA_ROZPOCZECIA - pd.Timedelta(minutes=PRE), t.DATA_ZAKONCZENIA + pd.Timedelta(minutes=POST)
    tb = tl[(tl.block == t.BLOCK) & (tl.ts >= a0) & (tl.ts <= a1)].sort_values("ts")
    if tb.empty:
        continue
    ab = an[(an.block == t.BLOCK) & (an.ts >= a0) & (an.ts <= a1)].copy()
    ab["az"] = ab["z"].abs().clip(upper=100)
    sb = shares[(shares.block == t.BLOCK) & (shares.ts >= a0) & (shares.ts <= a1)]
    ab_by, sb_by = dict(tuple(ab.groupby("ts"))), dict(tuple(sb.groupby("ts")))
    frames = []
    for r in tb.itertuples():
        ents = []
        if r.ts in ab_by:
            x = ab_by[r.ts].sort_values("az", ascending=False).head(60)
            seen = set()
            for q in x.itertuples():
                k = (q.entity, q.group)
                if k in seen:
                    continue
                seen.add(k)
                ents.append(dict(e=short(q.entity), m=metric_of(q.group), z=round(float(np.sign(q.z) * q.az), 1), v=round(float(q.value), 4), b=None if pd.isna(q.baseline) else round(float(q.baseline), 4)))
                if len(ents) == 8:
                    break
        grp = []
        if r.ts in sb_by:
            x = sb_by[r.ts].sort_values("ratio", ascending=False).head(4)
            grp = [dict(g=metric_of(q.group), r=round(float(q.ratio), 2), n=int(q.n_anom), of=int(q.n_valid)) for q in x.itertuples() if q.ratio > 0]
        frames.append(dict(ts=str(r.ts)[:16], risk=round(float(r.risk), 1), lvl=int(r.level), sim=round(float(r.similarity), 2), match=r.match or "", ents=ents, grp=grp,
                           n_anom=int(len(ab_by[r.ts])) if r.ts in ab_by else 0))
    # what deviated at the onset (+-30 min): which metric groups crossed their healthy threshold
    on = sb[(sb.ts >= t.DATA_ROZPOCZECIA - pd.Timedelta(minutes=30)) & (sb.ts <= t.DATA_ROZPOCZECIA + pd.Timedelta(minutes=30))]
    for g, x in on.groupby("group"):
        lift_rows.setdefault(g, []).append(dict(inc=f"{t.KLUCZ}|{t.BLOCK}", hit=bool((x["ratio"] >= 1).any()), peak=float(x["ratio"].max())))
    e = ev[(ev.incident == t.KLUCZ) & (ev.block == t.BLOCK)].iloc[0]
    first = lambda c: None if pd.isna(e[c]) else str(e[c])[:16]
    replays.append(dict(id=f"{t.KLUCZ}|{t.BLOCK}", key=t.KLUCZ, block=t.BLOCK, title=t.TYTUL, prio=t.PRIORYTET, cause=t.PRZYCZYNA, service=t.SERWIS, detection=t.DETECTION_TYPE,
                        onset_owner=("2025-12-31 06:50" if t.KLUCZ == "AIIT-2686" else None), start=str(t.DATA_ROZPOCZECIA)[:16], end=str(t.DATA_ZAKONCZENIA)[:16], detected=str(t.DETECTED_AT)[:16], ack=str(t.ACK_AT)[:16],
                        signal=round(float(e.signal_norm), 2) if not pd.isna(e.signal_norm) else None, max_risk=round(float(e.max_risk), 1) if not pd.isna(e.max_risk) else None,
                        watch=first("watch_ts"), warning=first("warning_ts"), alarm=first("alarm_ts"), interval=int(round((tb.ts.diff().dropna().median()).total_seconds() / 60)), frames=frames))

# which metric groups reacted around the onset of known incidents (hit = crossed its healthy p99.9 breadth threshold)
healthy_rate = {}
for g, x in shares.groupby("group"):
    healthy_rate[g] = float((x["ratio"] >= 1).mean())
leads = []
for g, rows in lift_rows.items():
    n, h = len(rows), sum(r["hit"] for r in rows)
    leads.append(dict(g=metric_of(g), hits=h, n=n, peak=round(max(r["peak"] for r in rows), 1), healthy=round(100 * healthy_rate.get(g, 0), 2)))
leads.sort(key=lambda x: (-x["hits"] / max(1, x["n"]), -x["peak"]))

# learned thresholds with the statistics of healthy windows they were learned from (windows of incidents +-3 h/2 h are excluded)
ls = []
for g, thr_row in thr.iterrows():
    parts = []
    for b, s in shares[shares.group == g].groupby("block"):
        s = s[s.n_valid >= 5]
        parts.append(s[~_in_windows(pd.DatetimeIndex(s["ts"]), _windows(tg, b))])
    h = pd.concat(parts)
    ls.append(dict(g=metric_of(g), win=g.split(".")[0], thr=round(float(thr_row["threshold"]), 3), thr_drift=round(float(thr_row["threshold3"]), 3), floor=bool(abs(thr_row["threshold"] - 0.03) < 1e-9),
                   n_ent=int(h["n_valid"].median()), ent_at_thr=round(float(thr_row["threshold"] * h["n_valid"].median()), 1), med=round(float(h["share"].median()), 3), p99=round(float(h["share"].quantile(0.99)), 3),
                   n_win=int(len(h)), days=round(len(h) * (5 if g.startswith("CUE") else 10) / 1440, 1)))
ls.sort(key=lambda x: x["thr"])

meta = dict(rows=int(json.loads((P / "profile.json").read_text())["rows"]), rows_valued=int(json.loads((P / "profile.json").read_text())["rows_with_value"]),
            groups=int(len(thr)), entities=int(an["entity"].nunique()), blocks=sorted(map(str, tl.block.unique())),
            span=[str(tl.ts.min())[:10], str(tl.ts.max())[:10]], z_anom=6.0, thr_q=0.999, baseline="mediana z tej samej pory doby, 7 poprzednich dni")
valid = dict(
    false_alarms=[dict(r) for r in fa.to_dict("records")],
    incidents=[dict(id=r["id"], key=r["key"], block=r["block"], title=r["title"], cause=r["cause"], signal=r["signal"], max_risk=r["max_risk"], watch=r["watch"], warning=r["warning"], alarm=r["alarm"], start=r["start"], detected=r["detected"]) for r in replays])
OUT.write_text(json.dumps(dict(meta=meta, thresholds={metric_of(g): round(float(v), 3) for g, v in thr["threshold"].items()}, learned=ls, leads=leads, valid=valid, replays=replays), ensure_ascii=False))
print("zapisano", OUT, round(OUT.stat().st_size / 1e6, 2), "MB;", len(replays), "powtórek;", sum(len(r["frames"]) for r in replays), "ramek")
for r in replays:
    print(r["id"], "ramki", len(r["frames"]), "sygnał", r["signal"], "max_risk", r["max_risk"], "watch", r["watch"], "warning", r["warning"], "alarm", r["alarm"])
print("sygnały wyprzedzające (top 8):", leads[:8])
