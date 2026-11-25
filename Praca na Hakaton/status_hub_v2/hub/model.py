"""Historical load model: what traffic, CPU and latency to EXPECT for a service at a given time, given the calendar.

Learned from history (weekly seasonality + past events), no hand-set constants for traffic levels:
  baseline[service][hour-of-week]   median of non-event hours  -> 'normal' traffic
  mult[event type][service]         median ratio observed in past events -> how much a finale/premiere/match lifts traffic
  load bins                         how latency and CPU behaved historically at 1x, 2x, 3x... normal load
  calls / starts baselines          what the call center and the player analytics look like normally
Assumption (cannot be learned from hourly data): traffic ramps up over 20 min before an event and decays over 30 min after it.
"""
import statistics
from datetime import datetime, timedelta

BINS = [0.0, 0.8, 1.25, 1.75, 2.5, 3.5, 99.0]
P = lambda s: datetime.strptime(s, "%Y-%m-%dT%H:%M")


def how(t):
    return t.weekday() * 24 + t.hour


def med(xs, default=0.0):
    return statistics.median(xs) if xs else default


def shape(start, end, t):
    if t < start - timedelta(minutes=20) or t > end + timedelta(minutes=30):
        return 0.0
    if t < start:
        return (t - (start - timedelta(minutes=20))).total_seconds() / 1200
    if t <= end:
        return 1.0
    return max(0.0, 1 - (t - end).total_seconds() / 1800)


class HistModel:
    def __init__(self):
        self.trained = False
        self.info = {}

    # ------------------------------------------------------------------------------------------ training
    def train(self, hist):
        events = [dict(type=e["type"], title=e["title"], start=P(e["start"]), end=P(e["end"]), services=e["services"]) for e in hist["events"]]
        self.svcs = list(hist["hourly"])
        rows = {s: [dict(t=P(r["ts"]) + timedelta(minutes=30), **{k: r[k] for k in ("rpm", "cpu", "resp", "err")}) for r in v] for s, v in hist["hourly"].items()}
        near = lambda t, s: any(s in e["services"] and e["start"] - timedelta(minutes=40) <= t <= e["end"] + timedelta(minutes=70) for e in events)
        self.base = {s: [0.0] * 168 for s in self.svcs}
        self.base_cpu, self.base_resp = {s: [0.0] * 168 for s in self.svcs}, {s: [0.0] * 168 for s in self.svcs}
        for s in self.svcs:
            by = {i: [] for i in range(168)}
            byc, byr = {i: [] for i in range(168)}, {i: [] for i in range(168)}
            for r in rows[s]:
                if not near(r["t"], s):
                    h = how(r["t"] - timedelta(minutes=30))
                    by[h].append(r["rpm"]); byc[h].append(r["cpu"]); byr[h].append(r["resp"])
            allm = med([x for v in by.values() for x in v], 1.0)
            for i in range(168):
                self.base[s][i], self.base_cpu[s][i], self.base_resp[s][i] = med(by[i], allm), med(byc[i], 30), med(byr[i], 100)
        # event multipliers
        obs = {}
        for e in events:
            for s in e["services"]:
                best = 0.0
                for r in rows[s]:
                    if e["start"] <= r["t"] <= e["end"]:
                        best = max(best, r["rpm"] / max(1.0, self.base[s][how(r["t"] - timedelta(minutes=30))]))
                if best:
                    obs.setdefault((e["type"], s), []).append(best)
        self.mult = {}
        for (ty, s), v in obs.items():
            self.mult.setdefault(ty, {})[s] = dict(value=round(med(v), 2), n=len(v), lo=round(min(v), 2), hi=round(max(v), 2))
        # load bins: latency and cpu at a given load ratio
        self.bin_resp, self.bin_cpu = {s: [None] * (len(BINS) - 1) for s in self.svcs}, {s: [None] * (len(BINS) - 1) for s in self.svcs}
        for s in self.svcs:
            acc = [[] for _ in BINS[:-1]]
            for r in rows[s]:
                h = how(r["t"] - timedelta(minutes=30))
                lr = r["rpm"] / max(1.0, self.base[s][h])
                b = next(i for i in range(len(BINS) - 1) if BINS[i] <= lr < BINS[i + 1])
                acc[b].append((r["resp"] / max(1.0, self.base_resp[s][h]), r["cpu"] - self.base_cpu[s][h]))
            last_r, last_c = 1.0, 0.0
            for i, a in enumerate(acc):
                if len(a) >= 2:
                    last_r, last_c = med([x[0] for x in a], 1.0), med([x[1] for x in a], 0.0)
                self.bin_resp[s][i], self.bin_cpu[s][i] = last_r, last_c
        # call center and analytics
        self.topics = [k for k in hist["calls"][0] if k != "ts"]
        cb = {tp: {i: [] for i in range(168)} for tp in self.topics}
        gb, ge = {i: [] for i in range(168)}, []
        for c in hist["calls"]:
            h = how(P(c["ts"]))
            if not near(P(c["ts"]) + timedelta(minutes=30), "player"):
                for tp in self.topics:
                    cb[tp][h].append(c[tp])
        for g in hist["ga"]:
            if not near(P(g["ts"]) + timedelta(minutes=30), "player"):
                gb[how(P(g["ts"]))].append(g["starts"]); ge.append(g["err_rate"])
        self.calls_base = {tp: [med(cb[tp][i], 20) for i in range(168)] for tp in self.topics}
        self.starts_base = [med(gb[i], 100) for i in range(168)]
        self.err_base = med(ge, 0.015)
        self.info = dict(weeks=(P(hist["end"]) - P(hist["start"])).days // 7, hours=sum(len(v) for v in rows.values()), events=len(events), trained_on=hist["end"])
        self.trained = True
        return self

    # ------------------------------------------------------------------------------------------ queries
    def _interp(self, arr, t):
        pos = how(t) + (t.minute - 30) / 60.0
        i0 = int(pos // 1) % 168
        f = pos - (pos // 1)
        return arr[i0] * (1 - f) + arr[(i0 + 1) % 168] * f

    def base_rpm(self, s, t):
        return self._interp(self.base[s], t)

    def event_factor(self, s, t, events):
        f = 1.0
        for e in events:
            if s in e["services"]:
                m = self.mult.get(e["type"], {}).get(s)
                if m:
                    f = max(f, 1 + (m["value"] - 1) * shape(e["start"], e["end"], t))
        return f

    def expected_rpm(self, s, t, events):
        return self.base_rpm(s, t) * self.event_factor(s, t, events)

    def _bin(self, lr):
        return next(i for i in range(len(BINS) - 1) if BINS[i] <= lr < BINS[i + 1])

    def resp_expected(self, s, t, lr):
        return max(1.0, self._interp(self.base_resp[s], t)) * self.bin_resp[s][self._bin(lr)]

    def cpu_expected(self, s, t, lr):
        return max(1.0, min(100.0, self._interp(self.base_cpu[s], t) + self.bin_cpu[s][self._bin(lr)]))

    def calls_expected_5min(self, tp, t, player_lr):
        return self._interp(self.calls_base[tp], t) / 12.0 * max(1.0, player_lr) ** 0.5

    def starts_per_min_base(self, t):
        return self._interp(self.starts_base, t) / 60.0

    # ------------------------------------------------------------------------------------------ validation
    @staticmethod
    def validate(hist):
        """Leave-one-event-out: forecast the hours of each past event using multipliers learned from the OTHER events,
        compared with seasonality alone (no calendar). Also reports the error on normal hours."""
        out = {s: dict(event_hours=0, cal=[], base=[]) for s in hist["hourly"]}
        normal = {s: [] for s in hist["hourly"]}
        for k, e in enumerate(hist["events"]):
            h2 = dict(hist)
            h2["events"] = [x for j, x in enumerate(hist["events"]) if j != k]
            m = HistModel().train(h2)
            ev = dict(type=e["type"], title=e["title"], start=P(e["start"]), end=P(e["end"]), services=e["services"])
            for s in e["services"]:
                for r in hist["hourly"][s]:
                    t = P(r["ts"]) + timedelta(minutes=30)
                    if ev["start"] - timedelta(minutes=30) <= t <= ev["end"] + timedelta(minutes=30):
                        act = max(1.0, r["rpm"])
                        out[s]["event_hours"] += 1
                        out[s]["cal"].append(abs(m.expected_rpm(s, t, [ev]) - act) / act)
                        out[s]["base"].append(abs(m.base_rpm(s, t) - act) / act)
                    elif k == 0:
                        pass
        m = HistModel().train(hist)
        evs = [dict(type=e["type"], title=e["title"], start=P(e["start"]), end=P(e["end"]), services=e["services"]) for e in hist["events"]]
        for s in hist["hourly"]:
            for r in hist["hourly"][s]:
                t = P(r["ts"]) + timedelta(minutes=30)
                if not any(s in e["services"] and e["start"] - timedelta(minutes=70) <= t <= e["end"] + timedelta(minutes=90) for e in evs):
                    normal[s].append(abs(m.base_rpm(s, t) - max(1.0, r["rpm"])) / max(1.0, r["rpm"]))
        res = {}
        for s, o in out.items():
            res[s] = dict(event_hours=o["event_hours"], mape_event_with_calendar=round(100 * med(o["cal"]), 1) if o["cal"] else None,
                          mape_event_baseline_only=round(100 * med(o["base"]), 1) if o["base"] else None, mape_normal=round(100 * med(normal[s]), 1))
        return res
