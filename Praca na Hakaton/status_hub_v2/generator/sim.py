"""Platform simulator + failure injector.

A small fictional media platform (services, servers, vendors, call center, web analytics) that produces the same kinds of data the
Status Hub would read in production, minute by minute, and lets you inject failures in real time.
EVERYTHING here is SIMULATED. Nothing is calibrated on real traffic numbers.
"""
import math
import random
import threading
from collections import deque
from datetime import datetime, timedelta

SERVICES = {
    "web":    dict(name="tvn24.pl",        base=20000, n=3, resp=180, vendors={"cdn": 1.0, "aws": 1.0, "dns": .7}, pattern="news"),
    "player": dict(name="Player / Live",   base=8000,  n=3, resp=250, vendors={"cdn": 1.0, "aws": 1.0, "redge": .5, "dns": .7}, pattern="evening"),
    "cms":    dict(name="CMS CUE",         base=2500,  n=2, resp=320, vendors={"aws": 1.0}, pattern="office"),
    "api":    dict(name="API publiczne",   base=12000, n=3, resp=120, vendors={"aws": 1.0, "dns": .7}, pattern="news"),
    "dam":    dict(name="DAM / wideo",     base=600,   n=2, resp=900, vendors={"aws": 1.0, "redge": 1.0}, pattern="office"),
    "search": dict(name="Wyszukiwarka",    base=3000,  n=2, resp=150, vendors={"aws": 1.0}, pattern="news"),
}
VENDORS = {"aws": "AWS", "cdn": "CDN (dostawca)", "redge": "Redge (wideo)", "dns": "DNS"}
TOPICS = {"player": "Player nie działa", "access": "Brak dostępu do serwisu", "account": "Logowanie i płatności", "other": "Inne"}
CALL_BASE = {"player": 0.5, "access": 0.4, "account": 0.8, "other": 1.2}
EVENT_TYPES = {"final": {"player": 3.0, "web": 2.0, "api": 1.6}, "premiere": {"player": 2.2, "web": 1.4}, "sport": {"player": 2.8, "web": 2.4, "api": 1.8}}
EVENT_LABEL = {"final": "Finał programu", "premiere": "Premiera", "sport": "Transmisja sportowa"}
FAILURE_TYPES = {
    "vendor_outage": "Awaria dostawcy", "host_cpu_spike": "Skok CPU na serwerze", "host_down": "Serwer niedostępny", "memory_leak": "Wyciek pamięci",
    "slow_db": "Wolna baza danych", "player_bug": "Błąd aplikacji playera (cichy)", "dns_outage": "Awaria DNS", "traffic_surge": "Nagły napływ ruchu"}
SOURCES = ["metrics", "callcenter", "analytics", "status"]
HOSTS = {k: [f"{k}-{i + 1:02d}" for i in range(v["n"])] for k, v in SERVICES.items()}
HOST_SVC = {h: k for k, hs in HOSTS.items() for h in hs}
MIN = timedelta(minutes=1)


def bump(h, c, w):
    d = abs(h - c)
    d = min(d, 24 - d)                                   # circular: evening traffic does not stop at midnight
    return math.exp(-((d / w) ** 2))


def pattern(kind, t):
    h, wd = t.hour + t.minute / 60, (t - timedelta(hours=6)).weekday()          # the "day" starts at 06:00
    if kind == "news":
        return (0.40 + 0.30 * bump(h, 8, 2.5) + 0.35 * bump(h, 13, 3) + 0.55 * bump(h, 20, 2.8)) * (0.9 if wd >= 5 else 1.0)
    if kind == "evening":
        return (0.25 + 0.15 * bump(h, 13, 3) + 1.0 * bump(h, 21, 2.5)) * (1.2 if wd >= 5 else 1.0)
    return 0.1 + (0.9 if wd < 5 else 0.25) * bump(h, 12, 4.5)


def event_mult(ev, svc, t):
    f = ev["factors"].get(svc)
    if not f:
        return 1.0
    s, e = ev["start"], ev["end"]
    if t < s - timedelta(minutes=20) or t > e + timedelta(minutes=30):
        return 1.0
    if t < s:
        shape = (t - (s - timedelta(minutes=20))).total_seconds() / 1200
    elif t <= e:
        shape = 1.0
    else:
        shape = 1 - (t - e).total_seconds() / 1800
    return 1 + (f - 1) * max(0.0, min(1.0, shape))


def make_event(rng, kind, title, start, dur):
    factors = {s: round(f * rng.uniform(0.85, 1.15), 2) for s, f in EVENT_TYPES[kind].items()}
    return dict(type=kind, title=title, start=start, end=start + timedelta(minutes=dur), factors=factors)


def make_history(start, weeks=10, seed=3):
    """Hourly history for the model: seasonality + past events (what New Relic / the data warehouse would provide)."""
    rng = random.Random(seed)
    t0 = start - timedelta(weeks=weeks)
    events = []
    first_fri = t0 + timedelta(days=(4 - t0.weekday()) % 7)
    for k, w in enumerate([1, 3, 4, 6, 8]):                                    # past finals on Fridays 20:00
        events.append(make_event(rng, "final", f"Finał programu (archiwum {k + 1})", first_fri.replace(hour=20, minute=0) + timedelta(weeks=w - 1), 120))
    for k, d in enumerate([12, 33, 54]):
        events.append(make_event(rng, "premiere", f"Premiera (archiwum {k + 1})", (t0 + timedelta(days=d)).replace(hour=21, minute=0), 90))
    for k, d in enumerate([19, 47]):
        events.append(make_event(rng, "sport", f"Transmisja sportowa (archiwum {k + 1})", (t0 + timedelta(days=d)).replace(hour=18, minute=0), 120))
    hourly = {k: [] for k in SERVICES}
    calls, ga = [], []
    t = t0.replace(minute=0)
    while t < start:
        tm = t + timedelta(minutes=30)
        mult_all = {}
        for k, sv in SERVICES.items():
            ev = 1.0
            for e in events:
                ev = max(ev, event_mult(e, k, tm))
            rpm = sv["base"] * pattern(sv["pattern"], tm) * ev * rng.uniform(0.94, 1.06)
            cap = sv["base"] * 2.2 / sv["n"]
            util = rpm / sv["n"] / cap
            cpu = min(100, 12 + 55 * util + rng.uniform(-2, 2))
            resp = sv["resp"] * (1 + 0.5 * util ** 2) * (1 + max(0, util - 1) * 5) * rng.uniform(0.96, 1.04)
            hourly[k].append(dict(ts=t.strftime("%Y-%m-%dT%H:%M"), rpm=round(rpm, 1), cpu=round(cpu, 1), resp=round(resp, 1), err=round(0.05 + max(0, (util - 1.25) * 35), 2)))
            mult_all[k] = ev
        tf = math.sqrt(mult_all["player"])
        row = {tp: round(CALL_BASE[tp] * 60 * (0.3 + pattern("news", tm)) * tf * rng.uniform(0.85, 1.15), 1) for tp in TOPICS}
        calls.append(dict(ts=t.strftime("%Y-%m-%dT%H:%M"), **row))
        ga.append(dict(ts=t.strftime("%Y-%m-%dT%H:%M"), starts=round(hourly["player"][-1]["rpm"] * 0.55 * 60, 0), err_rate=0.015))
        t += timedelta(hours=1)
    return dict(start=t0.strftime("%Y-%m-%dT%H:%M"), end=start.strftime("%Y-%m-%dT%H:%M"), hourly=hourly, calls=calls, ga=ga,
                events=[dict(type=e["type"], title=e["title"], start=e["start"].strftime("%Y-%m-%dT%H:%M"), end=e["end"].strftime("%Y-%m-%dT%H:%M"), services=list(e["factors"])) for e in events])


class World:
    def __init__(self, seed=7, realtime=False):
        self.lock = threading.RLock()
        self.seed = seed
        self.realtime = realtime        # True: zegar symulacji startuje od bieżącej chwili i idzie 1× (czas rzeczywisty); False: stały piątkowy wieczór, 60×
        self.reset()

    # ------------------------------------------------------------------------------------------ setup
    def reset(self):
        with self.lock:
            self.rng = random.Random(self.seed)
            self.start = datetime.now().replace(second=0, microsecond=0) if self.realtime else datetime(2026, 11, 27, 18, 30)   # domyślnie piątkowy wieczór
            self.t = self.start - timedelta(minutes=180)
            self.failures, self.fid, self.eid = [], 0, 0
            self.events = []
            self.scale = {k: 1.0 for k in SERVICES}
            self.scale_target = dict(self.scale)
            self.outage = {s: False for s in SOURCES}
            self.pub = {v: dict(status="operational", since=self.t, message="") for v in VENDORS}
            self.pending = []
            self.mem = {h: 0.0 for h in HOST_SVC}
            self.smooth = {tp: 0.0 for tp in TOPICS}
            self.noise = {k: 0.0 for k in SERVICES}
            self.metrics, self.calls, self.ga = deque(maxlen=1500), deque(maxlen=1500), deque(maxlen=1500)
            self.history = None
            self.add_event("final", 'Finał programu "Top Model" (symulacja)', 95, 120)
            self.add_event("premiere", "Premiera serialu (symulacja)", 26 * 60, 90)
            for _ in range(180):                                              # warm start: three hours of normal operation
                self.tick()
            self.speed, self.paused = (1 if self.realtime else 60), False

    def add_event(self, kind, title, in_min, dur):
        self.eid += 1
        e = make_event(self.rng, kind, title, self.start + timedelta(minutes=in_min) if self.t <= self.start else self.t + timedelta(minutes=in_min), dur)
        e["id"] = self.eid
        self.events.append(e)
        return e

    def get_history(self):
        if self.history is None:
            self.history = make_history(self.start)
        return self.history

    # ------------------------------------------------------------------------------------------ failures
    def inject(self, typ, target, severity=0.8, duration=20, ramp=2, announce="auto"):
        with self.lock:
            self.fid += 1
            f = dict(id=self.fid, type=typ, target=target, sev=float(severity), start=self.t, end=self.t + timedelta(minutes=float(duration)), ramp=max(0.5, float(ramp)), announce=announce, announced=False, active=True)
            self.failures.append(f)
            if typ in ("vendor_outage", "dns_outage"):
                v = target if typ == "vendor_outage" else "dns"
                if announce != "silent":
                    delay = self.rng.uniform(8, 25) if announce == "auto" else float(announce)
                    self.pending.append(dict(at=self.t + timedelta(minutes=delay), vendor=v, status="outage" if severity >= 0.7 else "degraded", fid=f["id"],
                                             message=f"Zgłoszono problem po stronie dostawcy ({VENDORS[v]}). Trwa analiza."))
            return f

    def stop(self, fid):
        with self.lock:
            for f in self.failures:
                if f["id"] == fid and f["active"]:
                    f["end"] = self.t
                    f["active"] = False

    def clear(self):
        with self.lock:
            for f in self.failures:
                if f["active"]:
                    f["end"], f["active"] = self.t, False

    def intensity(self, f):
        if self.t < f["start"]:
            return 0.0
        up = min(1.0, (self.t - f["start"]).total_seconds() / 60 / f["ramp"])
        if self.t > f["end"]:
            return 0.0
        if f["type"] == "memory_leak":
            up = min(1.0, (self.t - f["start"]).total_seconds() / max(60.0, (f["end"] - f["start"]).total_seconds()))
        return f["sev"] * up

    # ------------------------------------------------------------------------------------------ one simulated minute
    def tick(self):
        with self.lock:
            self.t += MIN
            t, rng = self.t, self.rng
            eff = dict(reach={k: 1.0 for k in SERVICES}, lat={k: 0.0 for k in SERVICES}, err={k: 0.0 for k in SERVICES}, cpu_s={k: 0.0 for k in SERVICES}, surge={k: 0.0 for k in SERVICES},
                       cpu_h={h: 0.0 for h in HOST_SVC}, lat_h={h: 0.0 for h in HOST_SVC}, err_h={h: 0.0 for h in HOST_SVC}, down=set(), mem_h={h: 0.0 for h in HOST_SVC}, player_err=0.0)
            for f in self.failures:
                i = self.intensity(f)
                if f["active"] and t > f["end"]:
                    f["active"] = False
                if i <= 0:
                    continue
                ty, tg = f["type"], f["target"]
                if ty == "vendor_outage":
                    for k, sv in SERVICES.items():
                        w = sv["vendors"].get(tg, 0)
                        if w:
                            eff["reach"][k] *= 1 - 0.45 * i * w
                            eff["err"][k] += 40 * i * w
                            eff["lat"][k] += 2.0 * i * w
                elif ty == "dns_outage":
                    for k in SERVICES:
                        eff["reach"][k] *= 1 - 0.35 * i
                elif ty == "host_cpu_spike":
                    eff["cpu_h"][tg] += 55 * i
                    eff["lat_h"][tg] += 1.5 * i
                elif ty == "host_down" and i >= 0.5:
                    eff["down"].add(tg)
                elif ty == "memory_leak":
                    eff["mem_h"][tg] += 60 * i
                elif ty == "slow_db":
                    eff["lat"][tg] += 3.5 * i
                    eff["err"][tg] += 12 * i
                    eff["cpu_s"][tg] += 8 * i
                elif ty == "player_bug":
                    eff["player_err"] += 0.7 * i
                elif ty == "traffic_surge":
                    eff["surge"][tg] += 7 * i
            # published vendor statuses (vendors announce late, or never)
            for p in list(self.pending):
                if t >= p["at"]:
                    self.pub[p["vendor"]] = dict(status=p["status"], since=t, message=p["message"])
                    self.pending.remove(p)
            for v, pb in self.pub.items():
                if pb["status"] != "operational":
                    src = [f for f in self.failures if f["type"] in ("vendor_outage", "dns_outage") and (f["target"] == v or (f["type"] == "dns_outage" and v == "dns"))]
                    if src and all(not f["active"] and t > f["end"] + timedelta(minutes=5) for f in src):
                        self.pub[v] = dict(status="operational", since=t, message="Problem rozwiązany.")
            # services
            svc_pts, tot_users, health = {}, 0.0, {}
            for k, sv in SERVICES.items():
                self.noise[k] = 0.85 * self.noise[k] + rng.gauss(0, 0.025)
                ev = 1.0
                for e in self.events:
                    ev = max(ev, event_mult(e, k, t))
                offered = sv["base"] * pattern(sv["pattern"], t) * ev * (1 + eff["surge"][k]) * (1 + self.noise[k])
                served = max(0.0, offered * eff["reach"][k])
                cur = self.scale[k]
                tgt = self.scale_target[k]
                self.scale[k] = cur + (tgt - cur) * 0.3
                up_hosts = [h for h in HOSTS[k] if h not in eff["down"]]
                cap_h = sv["base"] * 2.2 / sv["n"] * self.scale[k]
                hosts = {}
                for h in HOSTS[k]:
                    if h not in up_hosts:
                        hosts[h] = dict(up=False, rpm=0, cpu=0, mem=0, resp=0, err=100.0)
                        continue
                    rpm_h = served / len(up_hosts) * rng.uniform(0.94, 1.06)
                    util = rpm_h / cap_h
                    cpu = min(100.0, max(2.0, 12 + 55 * util + eff["cpu_h"][h] + eff["cpu_s"][k] + rng.gauss(0, 1.6)))
                    self.mem[h] = 0.8 * self.mem[h] + 0.2 * eff["mem_h"][h]
                    mem = min(100.0, 52 + 4 * math.sin(t.hour / 3.8) + self.mem[h] + rng.gauss(0, 0.6))
                    lat = eff["lat"][k] + eff["lat_h"][h] + (1.2 if mem > 93 else 0)
                    resp = sv["resp"] * (1 + 0.5 * util ** 2) * (1 + lat) * (1 + max(0, util - 1.0) * 5) * rng.uniform(0.96, 1.05)
                    err = min(100.0, 0.05 + max(0, (util - 1.25) * 35) + eff["err"][k] + (8 if mem > 93 else 0) + rng.uniform(0, 0.08))
                    hosts[h] = dict(up=True, rpm=round(rpm_h, 1), cpu=round(cpu, 1), mem=round(mem, 1), resp=round(resp, 1), err=round(err, 2))
                ups = [x for x in hosts.values() if x["up"]]
                w = sum(x["rpm"] for x in ups) or 1.0
                pt = dict(rpm=round(served, 1), resp=round(sum(x["resp"] * x["rpm"] for x in ups) / w, 1) if ups else 0, err=round(sum(x["err"] * x["rpm"] for x in ups) / w, 2) if ups else 100.0,
                          cpu=round(sum(x["cpu"] for x in ups) / len(ups), 1) if ups else 0, mem=round(sum(x["mem"] for x in ups) / len(ups), 1) if ups else 0, hosts_up=len(ups), hosts=hosts, scale=round(self.scale[k], 2))
                svc_pts[k] = pt
                tot_users += served / 7
                base_resp = sv["resp"]
                health[k] = "down" if (not ups or pt["err"] >= 30) else "degraded" if (pt["err"] >= 5 or pt["resp"] > base_resp * 3) else "up"
            self.health = health
            self.metrics.append(dict(ts=t.strftime("%Y-%m-%dT%H:%M"), services=svc_pts))
            # call center: customers call a few minutes after they notice a problem
            def visible(k):
                p = svc_pts[k]
                return max(0.0, min(1.0, p["err"] / 50 + (1 - eff["reach"][k]) * 1.5 + eff["lat"][k] / 8))
            u = {"player": max(visible("player"), eff["player_err"]), "access": visible("web"), "account": visible("api"), "other": 0.0}
            gain = {"player": 12, "access": 10, "account": 8, "other": 0}
            tf = math.sqrt(max(1.0, svc_pts["player"]["rpm"] / (SERVICES["player"]["base"] * pattern("evening", t))))
            counts = {}
            for tp in TOPICS:
                self.smooth[tp] = 0.8 * self.smooth[tp] + 0.2 * u[tp]
                lam = CALL_BASE[tp] * (0.3 + pattern("news", t)) * tf * (1 + gain[tp] * self.smooth[tp])
                counts[tp] = self.poisson(lam)
            total = sum(counts.values())
            self.calls.append(dict(ts=t.strftime("%Y-%m-%dT%H:%M"), calls=counts, wait_s=int(25 + 6 * max(0, total - 3) ** 1.1), abandoned=round(min(0.6, 0.02 + 0.015 * max(0, total - 4)), 3)))
            # web analytics (player)
            starts = svc_pts["player"]["rpm"] * 0.55
            err_rate = min(0.95, 0.015 + eff["player_err"] + svc_pts["player"]["err"] / 100 * 0.8)
            self.ga.append(dict(ts=t.strftime("%Y-%m-%dT%H:%M"), active_users=int(tot_users), player_starts=int(starts), player_errors=int(starts * err_rate), player_err_rate=round(err_rate, 4),
                                pageviews=int(svc_pts["web"]["rpm"] * 0.8)))

    def poisson(self, lam):
        L, k, p = math.exp(-min(lam, 600)), 0, 1.0
        if lam > 40:
            return max(0, int(self.rng.gauss(lam, math.sqrt(lam))))
        while True:
            k += 1
            p *= self.rng.random()
            if p <= L:
                return k - 1

    # ------------------------------------------------------------------------------------------ API views (what a real source would return)
    def since(self, dq, since):
        out = [x for x in dq if (since is None or x["ts"] > since)]
        return out[-600:]

    def status_view(self):
        return dict(now=self.t.strftime("%Y-%m-%dT%H:%M"),
                    vendors=[dict(key=k, name=VENDORS[k], status=p["status"], since=p["since"].strftime("%Y-%m-%dT%H:%M"), message=p["message"]) for k, p in self.pub.items()],
                    services=[dict(key=k, name=SERVICES[k]["name"], health=self.health.get(k, "up")) for k in SERVICES])

    def truth_view(self):
        return [dict(id=f["id"], type=f["type"], label=FAILURE_TYPES[f["type"]], target=f["target"], severity=f["sev"], start=f["start"].strftime("%Y-%m-%dT%H:%M"),
                     end=f["end"].strftime("%Y-%m-%dT%H:%M"), active=f["active"], announce=f["announce"]) for f in self.failures]

    def calendar_view(self):
        lo, hi = self.t - timedelta(hours=12), self.t + timedelta(hours=48)
        return [dict(id=e["id"], type=e["type"], title=e["title"], start=e["start"].strftime("%Y-%m-%dT%H:%M"), end=e["end"].strftime("%Y-%m-%dT%H:%M"), services=list(e["factors"]))
                for e in self.events if e["end"] >= lo and e["start"] <= hi]

    def gui_state(self):
        last = self.metrics[-1]
        svcs = []
        for k, sv in SERVICES.items():
            p = last["services"][k]
            svcs.append(dict(key=k, name=sv["name"], health=self.health.get(k, "up"), rpm=p["rpm"], resp=p["resp"], err=p["err"], cpu=p["cpu"], scale=p["scale"],
                             hosts=[dict(id=h, **v) for h, v in p["hosts"].items()], spark=[m["services"][k]["rpm"] for m in list(self.metrics)[-60:]],
                             spark_err=[m["services"][k]["err"] for m in list(self.metrics)[-60:]], vendors=list(sv["vendors"]), base=sv["base"]))
        true_state = {v: 0.0 for v in VENDORS}
        for f in self.failures:
            if f["active"]:
                i = self.intensity(f)
                if f["type"] == "vendor_outage":
                    true_state[f["target"]] = max(true_state[f["target"]], i)
                if f["type"] == "dns_outage":
                    true_state["dns"] = max(true_state["dns"], i)
        return dict(clock=self.t.strftime("%Y-%m-%dT%H:%M"), speed=self.speed, paused=self.paused, services=svcs,
                    vendors=[dict(key=k, name=VENDORS[k], true=round(true_state[k], 2), pub=self.pub[k]["status"], since=self.pub[k]["since"].strftime("%H:%M")) for k in VENDORS],
                    failures=self.truth_view()[-30:], events=self.calendar_view(), outage=dict(self.outage), types=FAILURE_TYPES, event_types=EVENT_LABEL,
                    targets=dict(vendor=list(VENDORS), host=list(HOST_SVC), service=list(SERVICES)), vendor_names=VENDORS, service_names={k: v["name"] for k, v in SERVICES.items()},
                    calls=list(self.calls)[-1]["calls"], ga=list(self.ga)[-1])
