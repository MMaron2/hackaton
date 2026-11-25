"""Turns the REAL New Relic export (10.3M rows) into the replay the demo runs on.

    early-warning/.venv/bin/python status_hub_v3/build_replay.py [--clean path/to/metrics_clean.parquet]

Real entities (APM applications, hosts, AWS load balancers, CloudFront distributions, synthetic monitors) are grouped into cards:
internal services (CMS, Manhattan API, VAF servers, EKS containers, pages and widgets, player checks) and external providers
(CloudFront CDN, AWS load balancers, OneTrust CMP, ad and analytics SDKs). For each card and 5/10-min bucket it exports the real value, the
expected value (same time of day, previous 7 days), how many entities deviate (|z| > 6 from their own norm) and a status learned from data:
the threshold of every card is p99.9 of its deviating share on healthy windows. Nine windows around the real Jira incidents plus a quiet day are exported.
The call centre and Google Analytics do not exist in the export: they are SIMULATED from the real signals (user impact index), see simulate().
"""
import argparse
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser()
ap.add_argument("--clean", default=str(ROOT / "_archiwum/early-warning/data/clean/metrics_clean.parquet"))
a = ap.parse_args()
OUT = Path(__file__).resolve().parent / "data"
EW = ROOT / "early-warning" / "data"
Z = 6.0

# ------------------------------------------------------------------------------------------ cards (real entities -> card)
CARDS = {
    "cms": dict(name="CMS (publikacja i prezentacja)", kind="internal", desc="aplikacje APM CMS TVN24, DDTVN, EAL (Cook, Waiter, Publication, Presentation, Solr)"),
    "mht": dict(name="Manhattan: API i usługi", kind="internal", desc="aplikacje APM Manhattan (Public-API, formularze, quizy, głosowania, push, widgety)"),
    "vaf": dict(name="Serwery VAF", kind="internal", desc="hosty vaf*/var* (silniki, cache, Solr, benchmarki)"),
    "eks": dict(name="Kontenery EKS", kind="internal", desc="hosty ip-*.compute (węzły Kubernetes)"),
    "pages": dict(name="Strony i widgety", kind="internal", desc="monitory syntetyczne stron, widgetów, sitemap i usług Manhattan"),
    "player": dict(name="Player i wideo", kind="internal", desc="monitory syntetyczne odtwarzacza (Fakty, TVN24GO, livestream)"),
    "v_cf": dict(name="AWS CloudFront (CDN)", kind="vendor", desc="dystrybucje CloudFront (requests, błędy, transfer)"),
    "v_alb": dict(name="AWS Load Balancers", kind="vendor", desc="ALB i target groups (requests, błędy 4xx/5xx, unhealthy hosts, czas odpowiedzi)"),
    "v_cmp": dict(name="OneTrust (zgody CMP)", kind="vendor", desc="monitory OneTrust SDK"),
    "v_sdk": dict(name="SDK reklam i analityki", kind="vendor", desc="monitory SDK: AdOcean, Google IMA, at-app/at-services/at-cdntvn"),
}
USER_FACING = ["cms", "pages", "player", "v_cf", "v_alb"]


def card_of(fam, name):
    n = str(name).lower()
    if fam == "apm.application":
        return "cms" if "cms" in n else "mht" if "mht" in n else None
    if fam == "infra.host":
        return "eks" if (n.startswith("ip-") or n[:1].isdigit() or n.startswith("#")) else "vaf" if "grupa.iti" in n else None
    if fam == "synth.monitor":
        if "onetrust" in n: return "v_cmp"
        if any(k in n for k in ("adocean", "ima_sdk", "at-app", "at-services", "at-cdntvn", "sdk-prod", "premiumdigitalsdk")): return "v_sdk"
        if any(k in n for k in ("odtwarzacz", "tvn24go", "player", "livestream")): return "player"
        return "pages"
    if fam == "infra.awscloudfrontdistribution": return "v_cf"
    if fam in ("infra.awsalb", "infra.awsalbtargetgroup"): return "v_alb"
    return None


# (label, unit, [(family, metric)], agg, scale)   first entry of 'main' is the charted series
MAIN = {"cms": ("apm.application", "responseTimeMs", "mean"), "mht": ("apm.application", "responseTimeMs", "mean"), "vaf": ("infra.host", "cpuUsage", "mean"), "eks": ("infra.host", "cpuUsage", "mean"),
        "pages": ("synth.monitor", "medianDurationS", "mean"), "player": ("synth.monitor", "medianDurationS", "mean"), "v_cmp": ("synth.monitor", "medianDurationS", "mean"), "v_sdk": ("synth.monitor", "medianDurationS", "mean"),
        "v_cf": ("infra.awscloudfrontdistribution", "requests", "sum"), "v_alb": ("infra.awsalb", "requests", "sum")}
MAINU = {"cms": "ms", "mht": "ms", "vaf": "% CPU", "eks": "% CPU", "pages": "s", "player": "s", "v_cmp": "s", "v_sdk": "s", "v_cf": "req / okno", "v_alb": "req / okno"}
APM = [("Czas odpowiedzi", "ms", [("apm.application", "responseTimeMs")], "mean", 1), ("Błędy", "%", [("apm.application", "errorRate")], "mean", 100), ("Maks. czas odp.", "ms", [("apm.application", "responseTimeMs")], "max", 1)]
HOST = [("CPU średnio", "%", [("infra.host", "cpuUsage")], "mean", 1), ("CPU maks.", "%", [("infra.host", "cpuUsage")], "max", 1), ("Ruch wychodzący", "MB/s", [("infra.host", "networkTrafficTx")], "sum", 1e-6)]
MON = [("Czas odpowiedzi", "s", [("synth.monitor", "medianDurationS")], "mean", 1), ("Niepowodzenia", "", [("synth.monitor", "failures")], "sum", 1), ("Maks. czas odp.", "s", [("synth.monitor", "medianDurationS")], "max", 1)]
NUMS = {"cms": APM, "mht": APM, "vaf": HOST, "eks": HOST, "pages": MON, "player": MON, "v_cmp": MON, "v_sdk": MON,
        "v_cf": [("Żądania", "", [("infra.awscloudfrontdistribution", "requests")], "sum", 1), ("Błędy", "%", [("infra.awscloudfrontdistribution", "totalErrorRate")], "mean", 1), ("Pobrane", "GB", [("infra.awscloudfrontdistribution", "bytesDownloaded")], "sum", 1e-9)],
        "v_alb": [("Żądania", "", [("infra.awsalb", "requests")], "sum", 1), ("Błędy 4xx/5xx", "", [("infra.awsalb", "serverErrors4XxAnd5Xx"), ("infra.awsalbtargetgroup", "serverErrors4XxAnd5Xx")], "sum", 1),
                  ("Niezdrowe hosty", "", [("infra.awsalbtargetgroup", "unhealthyHosts")], "sum", 1)]}

# ------------------------------------------------------------------------------------------ load
d = pd.read_parquet(a.clean, columns=["ts", "window_id", "family", "metric", "entity_short", "val_avg", "z_robust", "baseline"])
d["family"] = d["family"].astype(str)
d["metric"] = d["metric"].astype(str)
d["block"] = d["window_id"].astype(str)
ent = d[["family", "entity_short"]].drop_duplicates()
ent["card"] = [card_of(f, e) for f, e in zip(ent.family, ent.entity_short.astype(str))]
d = d.merge(ent, on=["family", "entity_short"], how="left")
d = d[d.card.notna()].drop(columns=["window_id"])
print("wiersze w kartach:", len(d), d.groupby("card").entity_short.nunique().to_dict(), flush=True)

inc = pd.read_csv(EW / "incidents.csv", dtype=str)
inc = inc[inc.KLUCZ.notna()].copy()
for c in ("DATA_ROZPOCZECIA", "DATA_ZAKONCZENIA", "MTTD", "MTTA"):
    inc[c] = pd.to_datetime(inc[c])
inc["block"] = np.where(inc.MA_METRYKI_CUE.str.upper() == "TRUE", inc.KLUCZ, "NB")
tl = pd.read_parquet(EW / "processed" / "timeline.parquet")


def regular(s, interval):
    return s.reindex(pd.date_range(s.index.min(), s.index.max(), freq=f"{interval}min"))


def expected(s, interval):
    slot = s.index.hour * 60 + s.index.minute
    return s.groupby(slot).transform(lambda x: x.shift(1).rolling(7, min_periods=3).median())


def agg(x, how):
    return getattr(x, how)()


blocks = {}
for b, db in d.groupby("block"):
    interval = int(db.groupby("ts").size().index.to_series().diff().dropna().mode().iloc[0].total_seconds() / 60)
    cards = {}
    for ck in CARDS:
        dc = db[db.card == ck]
        if dc.empty:
            continue
        fam, met, how = MAIN[ck]
        m = dc[(dc.family == fam) & (dc.metric == met)]
        if m.empty:
            continue
        main = regular(agg(m.groupby("ts").val_avg, how), interval)
        rows = dc[dc.z_robust.notna()]
        shares = {}
        for mt, rm in rows.groupby("metric"):
            if rm.entity_short.nunique() >= 4:                  # a share of 1-3 entities is too coarse to learn a threshold from
                gz = rm.groupby("ts").z_robust
                sh = regular(gz.apply(lambda z: float((z.abs() > Z).mean())), interval)
                cnt = regular(gz.count(), interval)
                shares[mt] = sh.where(cnt >= 4)
        na = regular(rows[rows.z_robust.abs() > Z].groupby("ts").entity_short.nunique(), interval).fillna(0)
        nt = regular(dc.groupby("ts").entity_short.nunique(), interval)
        nums = []
        for lab, unit, fm, how2, sc in NUMS[ck]:
            sel = dc[[(f, mt) in fm for f, mt in zip(dc.family, dc.metric)]]
            nums.append(regular(agg(sel.groupby("ts").val_avg, how2), interval) * sc if len(sel) else pd.Series(np.nan, index=main.index))
        cards[ck] = dict(main=main, exp=expected(main, interval), shares=shares, na=na, nt=nt, nums=nums)
    blocks[b] = dict(interval=interval, cards=cards, rows=db)
    print(b, "interval", interval, {k: len(v["main"]) for k, v in cards.items()}, flush=True)

# ------------------------------------------------------------------------------------------ thresholds learned on healthy windows (per card and metric)
import os
QUANT = float(os.environ.get('QUANT', '0.995'))
thr = {}
kind_of = lambda b: "NB" if b == "NB" else "CUE"
for ck in CARDS:
    for kind in ("CUE", "NB"):
        for mt in sorted({m for b, B in blocks.items() if kind_of(b) == kind and ck in B["cards"] for m in B["cards"][ck]["shares"]}):
            parts = []
            for b, B in blocks.items():
                if kind_of(b) != kind or ck not in B["cards"] or mt not in B["cards"][ck]["shares"]:
                    continue
                s = B["cards"][ck]["shares"][mt].dropna()
                bad = pd.Series(False, index=s.index)
                for r in inc[inc.block == b].itertuples():
                    bad |= (s.index >= r.DATA_ROZPOCZECIA - pd.Timedelta(minutes=180)) & (s.index <= r.DATA_ZAKONCZENIA + pd.Timedelta(minutes=120))
                parts.append(s[~bad])
            h = pd.concat(parts)
            iv = 10 if kind == "NB" else 5
            thr[f"{ck}|{mt}|{kind}"] = dict(card=ck, metric=mt, kind=kind, thr=float(np.ceil(max(0.03, float(h.quantile(QUANT))) * 1e4) / 1e4), med=round(float(h.median()), 3), p99=round(float(h.quantile(0.99)), 3), n=int(len(h)), days=round(len(h) * iv / 1440, 1))
print("progi:", {k: v["thr"] for k, v in thr.items()}, flush=True)


def status_series(C, ck, idx_full, kind):
    """card status from the learned thresholds: worst metric ratio; two consecutive buckets above the threshold to raise (persistence);
    2x the threshold or two metrics above it = alarm"""
    rs = pd.DataFrame({mt: (s / thr[f"{ck}|{mt}|{kind}"]["thr"]) for mt, s in C["shares"].items() if thr[f"{ck}|{mt}|{kind}"]["thr"] < 0.99}).reindex(idx_full).fillna(0)   # a threshold of ~100% can never be crossed: metric switched off
    if rs.empty:
        return pd.Series(0.0, index=idx_full), np.zeros(len(idx_full), dtype=int), rs
    r1 = rs.max(axis=1)
    r2 = rs.apply(lambda row: sorted(row.to_numpy())[-2] if rs.shape[1] > 1 else 0.0, axis=1)
    sm = np.minimum(r1, r1.shift(1).fillna(0))
    sm2 = np.minimum(r2, r2.shift(1).fillna(0))
    return r1, np.where((sm >= 2) | (sm2 > 1), 2, np.where(sm > 1, 1, 0)), rs


HEALTHY = []
# healthy false-alert rate with these thresholds (buckets with any card above its threshold, episodes separated by >=30 min)
for b, B in blocks.items():
    full = None
    stt = {}
    for ck, C in B["cards"].items():
        full = C["main"].index
        stt[ck] = pd.Series(status_series(C, ck, full, kind_of(b))[1], index=full)
    S_ = pd.DataFrame(stt)
    bad = pd.Series(False, index=full)
    for r in inc[inc.block == b].itertuples():
        bad |= (full >= r.DATA_ROZPOCZECIA - pd.Timedelta(minutes=180)) & (full <= r.DATA_ZAKONCZENIA + pd.Timedelta(minutes=120))
    warm = pd.Series(full >= full[0] + pd.Timedelta(days=3), index=full)
    h = S_[~bad & warm]
    anyalert = (h > 0).any(axis=1)
    ep, last = 0, None
    for ts_ in h.index[anyalert]:
        if last is None or (ts_ - last) > pd.Timedelta(minutes=30):
            ep += 1
        last = ts_
    HEALTHY.append(dict(block=b, days=round(len(h) * B['interval'] / 1440, 1), episodes=ep, per_day=round(ep / (len(h) * B['interval'] / 1440), 2), cards={k: int((h[k] > 0).sum()) for k in h.columns if (h[k] > 0).sum()}))
    print(f"   zdrowe okna {b}: {len(h) * B['interval'] / 1440:.1f} dnia, epizody alertu: {ep} ({ep / (len(h) * B['interval'] / 1440):.2f}/dobę), per karta:", {k: int((h[k] > 0).sum()) for k in h.columns if (h[k] > 0).sum()}, flush=True)

# ------------------------------------------------------------------------------------------ simulated call centre and Google Analytics
TOPICS = {"player": "Player nie działa", "access": "Brak dostępu do serwisu", "account": "Logowanie i płatności", "other": "Inne"}


def simulate(idx, impact, traffic, traffic_exp, seed):
    """Neither the call centre nor Google Analytics is in the export. They are generated from the REAL signals:
    traffic (CloudFront requests) sets the daily pattern, the user-impact index (how far user-facing cards are above their learned
    thresholds, delayed by 10 min) raises calls and player errors. The numbers are an assumption, not a measurement."""
    rng = np.random.default_rng(seed)
    n = len(idx)
    tn = np.nan_to_num(traffic / max(np.nanmedian(traffic), 1e-9), nan=1.0).clip(0.1, 4)
    te = np.nan_to_num(traffic_exp / max(np.nanmedian(traffic), 1e-9), nan=1.0).clip(0.1, 4)
    lag = np.roll(impact, 2)
    lag[:2] = 0
    base = lambda x: 3.0 + 6.0 * x
    w = dict(player=impact_player_w(lag, idx), access=lag, account=0.35 * lag, other=0.1 * lag)
    calls = {k: rng.poisson(base(tn) * share * (1 + 9 * w[k])).astype(int).tolist() for k, share in (("player", .25), ("access", .3), ("account", .2), ("other", .25))}
    exp_calls = {k: [round(float(base(x) * share), 1) for x in te] for k, share in (("player", .25), ("access", .3), ("account", .2), ("other", .25))}
    users = (3000 * tn * rng.normal(1, .02, n) * (1 - 0.25 * lag)).round().astype(int)
    users_e = (3000 * te).round().astype(int)
    starts = (users * 0.55 * (1 - 0.5 * w["player"]) * rng.normal(1, .02, n)).round().astype(int)
    starts_e = (users_e * 0.55).round().astype(int)
    errs = (starts * (0.015 + 0.35 * w["player"]) * rng.normal(1, .05, n)).round().astype(int)
    wait = (25 + 140 * lag + rng.normal(0, 3, n)).round().astype(int)
    aband = (0.02 + 0.2 * lag).round(3)
    return dict(calls=calls, calls_exp=exp_calls, users=users.tolist(), users_exp=users_e.tolist(), starts=starts.tolist(), starts_exp=starts_e.tolist(), errs=errs.tolist(), wait=wait.tolist(), aband=aband.tolist())


def impact_player_w(lag, idx):
    return lag


# ------------------------------------------------------------------------------------------ scenarios
def clean(x):
    return [None if (v is None or (isinstance(v, float) and np.isnan(v))) else round(float(v), 3) for v in x]


scenarios = []
plan = [(r.KLUCZ, r.block, r.DATA_ROZPOCZECIA, r.DATA_ZAKONCZENIA, r) for r in inc.itertuples()]
plan.append(("QUIET", "AIIT-2686", pd.Timestamp("2025-12-28 06:00"), pd.Timestamp("2025-12-28 20:00"), None))
for key, b, s0, s1, r in plan:
    B = blocks[b]
    interval = B["interval"]
    w0, w1 = s0 - pd.Timedelta(minutes=360), s1 + pd.Timedelta(minutes=120)
    idx = pd.date_range(w0.ceil(f"{interval}min"), w1, freq=f"{interval}min")
    cards = {}
    impact = np.zeros(len(idx))
    for ck, C in B["cards"].items():
        full = C["main"].index
        ratio, st, rs = status_series(C, ck, full, kind_of(b))
        st = pd.Series(st, index=full).reindex(idx).fillna(0).astype(int)
        ratio = ratio.reindex(idx).fillna(0)
        if ck in USER_FACING:
            impact = np.maximum(impact, ((ratio.to_numpy() - 1).clip(0, 3) / 3))
        rows = B["rows"]
        top = {}
        alert_ts = [t for t in idx[st.to_numpy() > 0]]
        if alert_ts:
            sub = rows[(rows.card == ck) & rows.ts.isin(alert_ts) & (rows.z_robust.abs() > Z)].copy()
            sub["az"] = sub.z_robust.abs()
            for ts_, x in sub.sort_values("az", ascending=False).groupby("ts"):
                top[str(ts_)[:16]] = [dict(e=str(q.entity_short)[:60], m=q.metric, z=round(float(np.sign(q.z_robust) * min(q.az, 100)), 1), v=round(float(q.val_avg), 3), b=None if pd.isna(q.baseline) else round(float(q.baseline), 3)) for q in x.head(3).itertuples()]
        cards[ck] = dict(a=clean(C["main"].reindex(idx)), e=clean(C["exp"].reindex(idx)), nums=[clean(n.reindex(idx)) for n in C["nums"]], na=[int(v) for v in C["na"].reindex(idx).fillna(0)],
                         nt=[None if np.isnan(v) else int(v) for v in C["nt"].reindex(idx)], ratio=clean(ratio), st=st.tolist(), top=top)
    cf = B["cards"].get("v_cf")
    traffic = cf["main"].reindex(idx).to_numpy() if cf else np.full(len(idx), np.nan)
    traffic_e = cf["exp"].reindex(idx).to_numpy() if cf else np.full(len(idx), np.nan)
    if not cf:                                              # NB windows have monitors only: traffic pattern from another real CloudFront window (same time of day)
        ref = blocks["AIIT-2686"]["cards"]["v_cf"]["main"]
        slot = ref.groupby(ref.index.hour * 60 + ref.index.minute).median()
        traffic = np.array([slot.get(t.hour * 60 + t.minute // 5 * 5, np.nan) for t in idx])
        traffic_e = traffic
    tb = tl[(tl.block == b) & tl.ts.isin(idx)].set_index("ts")
    if len(tb):                                              # the learned NR model also counts as user impact when its risk is high
        impact = np.maximum(impact, ((tb.risk.reindex(idx).fillna(0).to_numpy() - 50) / 50).clip(0, 1))
    sim = simulate(idx, impact, traffic, traffic_e, int(re.sub(r'\D', '', key) or 7) % 10_000)
    risk = tb.risk.reindex(idx).fillna(0) if len(tb) else pd.Series(0.0, index=idx)
    lvl = tb.level.reindex(idx).fillna(0).astype(int) if len(tb) else pd.Series(0, index=idx)
    scenarios.append(dict(id=key, block=b, interval=interval, ts=[str(t)[:16] for t in idx], cards=cards, risk=clean(risk), lvl=lvl.tolist(), nr_top=[str(x).replace('CUE.', '').replace('NB.', '') for x in tb.top_group.reindex(idx).fillna('')] if len(tb) else [''] * len(idx), sim_match=[str(x) if isinstance(x, str) else "" for x in tb.match.reindex(idx).fillna("")] if len(tb) else [""] * len(idx),
                          has=list(cards), sim=sim, jira=None if r is None else dict(title=r.TYTUL, prio=r.PRIORYTET, cause=r.PRZYCZYNA, service=r.SERWIS, start=str(r.DATA_ROZPOCZECIA)[:16], end=str(r.DATA_ZAKONCZENIA)[:16],
                                                                                    detected=str(r.MTTD)[:16], ack=str(r.MTTA)[:16], how=r.WYKRYCIE, onset_owner="2025-12-31 06:50" if key == "AIIT-2686" else None)))
    if key in ("AIIT-2686", "AIIT-2987", "MIT-31"):                 # diagnostics: which card-metrics react around the real incident
        lo, hi = s0 - pd.Timedelta(minutes=120), s1
        diag = []
        for ck, C in B["cards"].items():
            for mt, s in C["shares"].items():
                x = s[(s.index >= lo) & (s.index <= hi)] / thr[f"{ck}|{mt}|{kind_of(b)}"]["thr"]
                diag.append((round(float(x.max()), 2), int((x > 1).sum()), f"{ck}|{mt}"))
        print("   reakcje:", sorted(diag, reverse=True)[:8], flush=True)
    stc = {k: int((np.array(v["st"]) > 0).sum()) for k, v in cards.items()}
    print(key, b, len(idx), "okien; okna w alarmie wg karty:", stc, flush=True)

(OUT / "replay.json").write_text(json.dumps(dict(cards={k: dict(v, has=True) for k, v in CARDS.items()}, topics=TOPICS, thresholds=thr, units=MAINU, nums={k: [(l, u) for l, u, *_ in v] for k, v in NUMS.items()},
                                                 scenarios=scenarios, z=Z, quant=QUANT, healthy=HEALTHY), ensure_ascii=False))
print("zapisano", round((OUT / "replay.json").stat().st_size / 1e6, 2), "MB;", len(scenarios), "scenariuszy")
