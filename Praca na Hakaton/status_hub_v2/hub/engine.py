"""Status Hub engine: five sources -> evidence -> incidents with hypotheses -> notifications.

Sources: servers (metrics), status (vendors and service health), calls (call center), analytics (player), model (history-based load forecast).
Every number is compared with what the historical model EXPECTS at that moment (time of week, calendar events, load), so a finale that
doubles traffic is not an incident, while errors during it are.
Rules are explicit and explainable; thresholds are in one place (T).
"""
import math
import statistics
from collections import deque
from datetime import datetime, timedelta

M = lambda x: timedelta(minutes=x)
P = lambda s: datetime.strptime(s, "%Y-%m-%dT%H:%M")
iso = lambda t: None if t is None else t.strftime("%Y-%m-%dT%H:%M")
SRC_NAME = {"servers": "Serwery", "status": "Statusy", "calls": "Infolinia", "analytics": "Analityka", "model": "Model obciążenia"}
TOPIC_SVC = {"player": "player", "access": "web", "account": "api", "other": None}
TOPIC_NAME = {"player": "Player nie działa", "access": "Brak dostępu do serwisu", "account": "Logowanie i płatności", "other": "Inne"}
ACTION = {
    "vendor": "Sprawdź zgłoszenie u dostawcy, przełącz na zapas (np. zapasowy CDN), poinformuj redakcję i producentów.",
    "vendor_silent": "Dostawca jeszcze nie ogłosił problemu: otwórz zgłoszenie u dostawcy i przygotuj przełączenie na zapas.",
    "player_app": "Sprawdź ostatnie wdrożenie playera i konsolę błędów klienta; rozważ rollback. Serwery wyglądają zdrowo.",
    "host": "Wyłącz serwer z puli lub zrestartuj go, sprawdź procesy i zużycie pamięci.",
    "capacity": "Zwiększ pojemność usługi (skalowanie), włącz cache, ogranicz funkcje niekrytyczne na czas zwiększonego ruchu.",
    "dns": "Sprawdź rekordy i dostawcę DNS, przełącz na zapasowy rezolwer.",
    "service_slow": "Sprawdź bazę danych i zależności usługi, wolne zapytania i ostatnie zmiany.",
    "unknown": "Przyczyna nieustalona: sprawdź dziennik zmian i panele usług, zbierz więcej danych."}
T = dict(err=3.0, resp_ratio=1.8, cpu_sat=90.0, drop=0.75, host_hot=30.0, mem=88.0, calls_z=4.0, calls_min=12, ga_rate=0.06, ga_ratio=0.6, rise=2.0)
INFO_KINDS = {"unplanned_rise", "event_live", "forecast"}


class Engine:
    def __init__(self, model, topo):
        self.model, self.topo = model, topo
        self.events, self.svc_names = [], {k: v["name"] for k, v in topo["services"].items()}
        self.pts = {s: deque(maxlen=400) for s in topo["services"]}
        self.ev, self.st, self.evlog = {}, {}, []
        self.inc, self.closed, self.notes, self._nid, self._iid = None, [], [], 0, 0
        self.now, self.silent = None, False
        self.src = {k: dict(last=None, stale=False) for k in ("servers", "status", "calls", "analytics")}
        self.cfg = dict(auto_ack=False, page_ack=5, head_ack=20, use_calendar=True)
        self.raw_events = []
        self.calls_win = {tp: deque(maxlen=5) for tp in TOPIC_NAME}
        self.calls_info = {tp: dict(sum5=0, exp=0.0) for tp in TOPIC_NAME}
        self.ga_win, self.ga_info = deque(maxlen=5), dict(rate=0.0, users=0, starts=0, exp_starts=0.0)
        self.status = dict(vendors=[], services=[])
        self.notices = {}
        self.cool = {}
        self.hmem = {}
        self.wait = dict(wait_s=0, abandoned=0.0)

    # ------------------------------------------------------------------------------------------ helpers
    def _note(self, ts, level, tag, text, sub="", inc=None):
        if self.silent:
            return
        self._nid += 1
        self.notes.append(dict(id=self._nid, ts=ts, level=level, tag=tag, text=text, sub=sub, inc=inc))

    def _sig(self, key, source, service, kind, cond, strength, detail, persist, host=None, extra=None):
        st = self.st.setdefault(key, dict(hits=0, clear=0))
        e = self.ev.get(key)
        if cond:
            st["hits"] += 1
            st["clear"] = 0
            if e is not None and e["active"]:
                e.update(last=self.now, strength=strength, detail=detail, extra=extra or e["extra"])
                e["peak"] = max(e["peak"], strength)
            elif st["hits"] >= persist:
                self.ev[key] = dict(key=key, source=source, service=service, host=host, kind=kind, active=True, start=self.now, last=self.now, strength=strength, peak=strength, detail=detail, extra=extra or {})
                self.evlog.append(dict(ts=self.now, source=source, service=service, kind=kind, detail=detail))
        else:
            st["hits"] = 0
            if e is not None and e["active"]:
                st["clear"] += 1
                if st["clear"] >= 3:
                    e["active"], e["end"] = False, self.now

    def _ev_factor(self, s, t):
        return self.model.event_factor(s, t, self.events)

    # ------------------------------------------------------------------------------------------ ingest
    def set_calendar(self, events):
        self.raw_events = [dict(id=e["id"], type=e["type"], title=e["title"], start=P(e["start"]), end=P(e["end"]), services=e["services"]) for e in events]
        self.apply_calendar()

    def apply_calendar(self):
        """use_calendar=False is an experiment switch: the model then knows nothing about scheduled events."""
        self.events = self.raw_events if self.cfg.get("use_calendar", True) else []

    def on_metrics(self, pt):
        ts = P(pt["ts"])
        self.now = max(self.now or ts, ts)
        self.src["servers"]["last"] = ts
        mdl = self.model
        for s, p in pt["services"].items():
            base = mdl.base_rpm(s, ts)
            lr = p["rpm"] / max(1.0, base)
            exp = mdl.expected_rpm(s, ts, self.events)
            rr = p["rpm"] / max(1.0, exp)
            rexp = mdl.resp_expected(s, ts, lr)
            rratio = p["resp"] / rexp
            self.pts[s].append(dict(ts=pt["ts"], rpm=p["rpm"], exp=round(exp, 1), base=round(base, 1), resp=p["resp"], resp_exp=round(rexp, 1), err=p["err"], cpu=p["cpu"], mem=p["mem"], lr=round(lr, 2), hosts_up=p["hosts_up"], scale=p.get("scale", 1)))
            nm = self.svc_names[s]
            x = dict(lr=round(lr, 2))
            self._sig(("servers", s, "errors"), "servers", s, "errors", p["err"] >= T["err"], p["err"] / T["err"], f"{nm}: błędy 5xx {p['err']:.1f}%", 3, extra=x)
            self._sig(("servers", s, "latency"), "servers", s, "latency", rratio >= T["resp_ratio"], rratio / T["resp_ratio"], f"{nm}: czas odpowiedzi {p['resp']:.0f} ms (oczekiwane {rexp:.0f} ms)", 3, extra=x)
            self._sig(("servers", s, "saturation"), "servers", s, "saturation", p["cpu"] >= T["cpu_sat"], p["cpu"] / T["cpu_sat"], f"{nm}: CPU {p['cpu']:.0f}% przy ruchu ×{lr:.1f} normalnego", 3, extra=x)
            self._sig(("servers", s, "traffic_drop"), "servers", s, "traffic_drop", exp > 300 and rr <= T["drop"], T["drop"] / max(rr, 0.05), f"{nm}: ruch {p['rpm']:.0f}/min zamiast oczekiwanych {exp:.0f}", 5, extra=x)
            hs = p["hosts"]
            ups = [h for h in hs.values() if h["up"]]
            mc = statistics.median([h["cpu"] for h in ups]) if ups else 0
            for hid, h in hs.items():
                self._sig(("servers", hid, "host_down"), "servers", s, "host_down", not h["up"], 1.5, f"serwer {hid} nie odpowiada", 1, host=hid)
                self._sig(("servers", hid, "host_hot"), "servers", s, "host_hot", h["up"] and len(ups) >= 2 and h["cpu"] - mc >= T["host_hot"], (h["cpu"] - mc) / T["host_hot"], f"serwer {hid}: CPU {h['cpu']:.0f}% przy średniej usługi {mc:.0f}%", 3, host=hid)
                hm = self.hmem.setdefault(hid, deque(maxlen=20))
                hm.append(h["mem"])
                trend = h["mem"] - hm[-16] if len(hm) >= 16 else 0.0
                leak = h["up"] and (h["mem"] >= T["mem"] or (trend >= 12 and h["mem"] >= 62))
                self._sig(("servers", hid, "memory"), "servers", s, "memory", leak, max(h["mem"] / T["mem"], trend / 12), f"serwer {hid}: pamięć {h['mem']:.0f}%" + (f", rośnie o {trend:.0f} pkt / 15 min" if trend >= 12 else ""), 3, host=hid)
            if rr >= T["rise"] and self._ev_factor(s, ts) <= 1.05 and not self.cool.get(("rise", s)):
                self.cool[("rise", s)] = ts + M(45)
                self._notice(ts, "rise", f"rise:{s}", "NIEPLANOWANY WZROST RUCHU", f"{nm}: ruch ×{rr:.1f} względem oczekiwanego, brak wydarzenia w kalendarzu.", "warn", s)

    def on_status(self, snap):
        now = P(snap["now"])
        self.now = max(self.now or now, now)
        self.src["status"]["last"] = now
        self.status = snap
        for v in snap["vendors"]:
            bad = v["status"] != "operational"
            self._sig(("status", v["key"], "vendor"), "status", None, "vendor", bad, 2.0 if v["status"] == "outage" else 1.0, f"{v['name']}: strona statusu pokazuje „{v['status']}”", 1)
        for s in snap["services"]:
            self._sig(("status", s["key"], "health"), "status", s["key"], "health", s["health"] != "up", 2.0 if s["health"] == "down" else 1.0, f"{s['name']}: kontrola zdrowia „{s['health']}”", 1)

    def on_calls(self, points, topics=None):
        for p in points:
            ts = P(p["ts"])
            self.now = max(self.now or ts, ts)
            self.src["calls"]["last"] = ts
            self.wait = dict(wait_s=p["wait_s"], abandoned=p["abandoned"])
            plr = (self.pts["player"][-1]["lr"] if self.pts["player"] else 1.0)
            for tp, n in p["calls"].items():
                self.calls_win[tp].append(n)
                s5 = sum(self.calls_win[tp])
                exp = self.model.calls_expected_5min(tp, ts, plr)
                z = (s5 - exp) / math.sqrt(exp + 2)
                self.calls_info[tp] = dict(sum5=s5, exp=round(exp, 1), z=round(z, 1))
                self._sig(("calls", tp), "calls", TOPIC_SVC[tp], "calls", z >= T["calls_z"] and s5 >= T["calls_min"], z / T["calls_z"], f"„{TOPIC_NAME[tp]}”: {s5} połączeń / 5 min (norma ok. {exp:.0f})", 2)

    def on_ga(self, points):
        for p in points:
            ts = P(p["ts"])
            self.now = max(self.now or ts, ts)
            self.src["analytics"]["last"] = ts
            self.ga_win.append(p)
            starts = sum(x["player_starts"] for x in self.ga_win) or 1
            errs = sum(x["player_errors"] for x in self.ga_win)
            rate = errs / starts
            exp_starts = self.model.expected_rpm("player", ts, self.events) * 0.55
            users_exp = sum(self.model.expected_rpm(s, ts, self.events) for s in self.topo["services"]) / 7
            self.ga_info = dict(rate=round(rate, 4), users=p["active_users"], starts=p["player_starts"], exp_starts=round(exp_starts), users_exp=round(users_exp), base_rate=self.model.err_base)
            self._sig(("analytics", "player_err"), "analytics", "player", "ga_errors", rate >= max(T["ga_rate"], 4 * self.model.err_base), rate / T["ga_rate"], f"błędy playera {rate * 100:.1f}% (norma {self.model.err_base * 100:.1f}%)", 3)
            self._sig(("analytics", "player_starts"), "analytics", "player", "ga_starts_drop", exp_starts > 300 and p["player_starts"] / max(1.0, exp_starts) <= T["ga_ratio"], T["ga_ratio"] / max(0.05, p["player_starts"] / max(1.0, exp_starts)), f"starty playera {p['player_starts']}/min zamiast {exp_starts:.0f}", 5)
            self._sig(("analytics", "users"), "analytics", None, "ga_users_drop", users_exp > 1500 and p["active_users"] / max(1.0, users_exp) <= T["ga_ratio"], T["ga_ratio"] / max(0.05, p["active_users"] / max(1.0, users_exp)), f"{p['active_users']} aktywnych użytkowników zamiast {users_exp:.0f}", 5)

    # ------------------------------------------------------------------------------------------ model notices
    def _notice(self, ts, key, dedupe, tag, text, level, svc=None, risk=False, until=None):
        if dedupe in self.notices:
            return
        n = dict(key=dedupe, ts=ts, tag=tag, text=text, level=level, service=svc, risk=risk, until=until or ts + M(60))
        self.notices[dedupe] = n
        self._note(ts, "forecast" if key in ("fc", "live") else "info", tag, text, "Prognoza z modelu historycznego." if key == "fc" else "", None)

    def _forecast(self, now):
        mdl = self.model
        for e in self.events:
            lead = (e["start"] - now).total_seconds() / 60
            for s in e["services"]:
                m = mdl.mult.get(e["type"], {}).get(s)
                if not m:
                    continue
                nm = self.svc_names[s]
                if 0 < lead <= 75 and (e["id"], s, "fc") not in self.notices:
                    peak_t = e["start"] + M(30)
                    fr = m["value"]
                    fc_rpm = mdl.base_rpm(s, peak_t) * fr
                    cpu_pred = mdl.cpu_expected(s, peak_t, fr)
                    last = self.pts[s][-1] if self.pts[s] else None
                    lin = last["cpu"] * fc_rpm / max(1.0, last["rpm"]) / max(0.2, last["scale"]) if last else 0
                    risk = cpu_pred >= 80 or lin >= 90
                    txt = (f"O {e['start']:%H:%M}: {e['title']}. Historycznie ruch ×{fr:.1f} dla {nm} (ok. {fc_rpm:.0f}/min). Przewidywane CPU {max(cpu_pred, min(lin, 100)):.0f}%"
                           + (": ryzyko przeciążenia, rozważ zwiększenie pojemności przed startem." if risk else ": bez ryzyka przeciążenia."))
                    self._notice(now, "fc", (e["id"], s, "fc"), "ZWIĘKSZONA AKTYWNOŚĆ WKRÓTCE", txt, "warn" if risk else "info", s, risk, e["end"] + M(30))
                if e["start"] <= now <= e["end"] and (e["id"], s, "live") not in self.notices and self.pts[s] and self.pts[s][-1]["lr"] >= 1.3:
                    self._notice(now, "live", (e["id"], s, "live"), "TRWA ZWIĘKSZONA AKTYWNOŚĆ", f"{nm}: ruch ×{self.pts[s][-1]['lr']:.1f} normalnego, zgodnie z kalendarzem ({e['title']}). To nie jest awaria.", "info", s, False, e["end"] + M(30))
        for k in [k for k, n in self.notices.items() if now > n["until"]]:
            del self.notices[k]

    # ------------------------------------------------------------------------------------------ hypotheses
    def _hyps(self, act):
        H = []
        topo = self.topo["services"]
        srv = [e for e in act if e["source"] == "servers"]
        statv = [e for e in act if e["source"] == "status" and e["kind"] == "vendor"]
        stath = [e for e in act if e["source"] == "status" and e["kind"] == "health"]
        calls = [e for e in act if e["source"] == "calls"]
        ga = [e for e in act if e["source"] == "analytics"]
        aff = {e["service"] for e in srv if e["kind"] in ("errors", "latency", "saturation", "traffic_drop") and e["service"]} | {e["service"] for e in stath if e["service"]}
        host_ev = [e for e in srv if e["kind"] in ("host_down", "host_hot", "memory")]
        explained = set()
        vname = self.topo["vendors"]
        for e in statv:
            v = e["key"][1]
            deps_all = [s for s in topo if v in topo[s]["vendors"]]
            deps = [s for s in aff if v in topo[s]["vendors"]]
            reasons = [f"strona statusu dostawcy: „{self.status_of(v)}”"] + ([f"błędy lub spowolnienie u {len(deps)} usług zależnych od dostawcy"] if deps else []) + (["telefony od klientów"] if calls else [])
            H.append(dict(key=f"vendor:{v}", title=f"Dostawca: {vname[v]}", conf=min(0.97, 0.55 + 0.12 * len(deps) + (0.1 if calls else 0) + (0.1 if e["strength"] >= 2 else 0)), reasons=reasons, action=ACTION["vendor"], services=sorted(deps_all)))
            explained |= set(deps)
        if not statv and len(aff) >= 2 and not host_ev:
            best = None
            for v in vname:
                dep = {s for s in topo if v in topo[s]["vendors"]}
                jac = len(aff & dep) / max(1, len(aff | dep))
                if aff <= dep and (best is None or jac > best[0]):
                    best = (jac, v, dep)
            if best and best[0] >= 0.3 and not (len(aff) >= 5):
                H.append(dict(key=f"vendor_silent:{best[1]}", title=f"Prawdopodobnie dostawca: {vname[best[1]]} (strona statusu milczy)", conf=round(0.4 + 0.3 * best[0] + (0.1 if calls else 0), 2),
                              reasons=[f"problem u {len(aff)} usług, które łączy zależność od: {vname[best[1]]}", "brak komunikatu na stronie statusu dostawcy"], action=ACTION["vendor_silent"], services=sorted(aff)))
                explained |= aff
        player_srv = any(e["service"] == "player" and e["kind"] in ("errors", "latency", "saturation", "host_down", "host_hot", "memory") for e in srv)
        if (ga or any(c["service"] == "player" for c in calls)) and not player_srv and not any(h["key"].startswith("vendor") and "player" in h["services"] for h in H):
            H.append(dict(key="player_app", title="Błąd aplikacji playera (serwery wyglądają zdrowo)", conf=min(0.95, 0.45 + 0.2 * bool(ga) + 0.2 * any(c["service"] == "player" for c in calls) + 0.1 * (len(ga) > 1)),
                          reasons=(["analityka: rośnie odsetek błędów odtwarzania"] if ga else []) + (["klienci dzwonią, że player nie działa"] if any(c["service"] == "player" for c in calls) else []) + ["metryki serwerów playera w normie"], action=ACTION["player_app"], services=["player"]))
        for e in host_ev:
            H.append(dict(key=f"host:{e['host']}", title=f"Serwer {e['host']}: {({'host_down': 'niedostępny', 'host_hot': 'przeciążony', 'memory': 'kończy się pamięć'})[e['kind']]}", conf=0.95 if e["kind"] == "host_down" else 0.85,
                          reasons=[e["detail"]], action=ACTION["host"], services=[e["service"]]))
            explained.add(e["service"])
        for e in srv:
            if e["kind"] == "saturation" or (e["kind"] in ("latency", "errors") and e["extra"].get("lr", 1) >= 1.6):
                s = e["service"]
                lr = e["extra"].get("lr", 1)
                evn = next((x for x in self.events if s in x["services"] and x["start"] - M(30) <= self.now <= x["end"] + M(30)), None)
                H.append(dict(key=f"capacity:{s}", title=f"Przeciążenie przy większym ruchu: {self.svc_names[s]}", conf=0.85, reasons=[f"ruch ×{lr:.1f} normalnego" + (f", zgodnie z kalendarzem ({evn['title']})" if evn else ", bez wydarzenia w kalendarzu"), e["detail"]], action=ACTION["capacity"], services=[s]))
                explained.add(s)
        drops = [e for e in srv if e["kind"] == "traffic_drop"]
        if len(drops) >= 3 and not any(e["kind"] == "errors" for e in srv):
            H.append(dict(key="dns", title="Awaria DNS lub dostępu do sieci", conf=0.6 + 0.1 * bool(calls), reasons=[f"ruch spadł u {len(drops)} usług przy braku błędów po stronie serwerów"] + (["telefony: brak dostępu"] if calls else []), action=ACTION["dns"], services=sorted({d['service'] for d in drops})))
            explained |= {d["service"] for d in drops}
        for s in sorted(aff - explained):
            es = [e for e in srv if e["service"] == s]
            H.append(dict(key=f"service_slow:{s}", title=f"Problem w usłudze {self.svc_names[s]} (baza lub aplikacja)", conf=0.6, reasons=[e["detail"] for e in es][:3] or ["kontrola zdrowia"], action=ACTION["service_slow"], services=[s]))
        if not H:
            H.append(dict(key="unknown", title="Przyczyna nieustalona", conf=0.2, reasons=[e["detail"] for e in act][:3], action=ACTION["unknown"], services=sorted({e["service"] for e in act if e["service"]})))
        seen, out = set(), []
        for h in sorted(H, key=lambda x: -x["conf"]):
            if h["key"] not in seen:
                seen.add(h["key"])
                out.append(dict(h, conf=round(h["conf"], 2)))
        return out

    def status_of(self, v):
        return next((x["status"] for x in self.status.get("vendors", []) if x["key"] == v), "?")

    # ------------------------------------------------------------------------------------------ incidents
    def tick(self, now):
        self.now = max(self.now or now, now)
        now = self.now
        for name, s in self.src.items():
            if s["last"] is not None:
                late = (now - s["last"]).total_seconds() / 60
                if late >= 3 and not s["stale"]:
                    s["stale"] = True
                    self._note(now, "source", "ŹRÓDŁO NIE ODPOWIADA", f"{SRC_NAME[name]}: brak nowych danych od {late:.0f} min. Monitoring jest ślepy na ten tor.", "Sprawdź połączenie ze źródłem (API, New Relic, strona statusu).")
                elif late < 3 and s["stale"]:
                    s["stale"] = False
                    self._note(now, "info", "ŹRÓDŁO WRÓCIŁO", f"{SRC_NAME[name]}: dane znowu napływają.")
        for e in self.ev.values():                                  # evidence of a silent source cannot clear itself
            if e["active"] and (now - e["last"]) > M(12):
                e["active"], e["end"] = False, now
        for k in [k for k, e in self.ev.items() if not e["active"] and now - e.get("end", now) > M(120)]:
            del self.ev[k]
        self._forecast(now)
        act = [e for e in self.ev.values() if e["active"] and e["kind"] not in INFO_KINDS]
        if self.inc is None and act and not self.silent:
            if self.closed and now - self.closed[-1]["end"] <= M(20):
                self.inc = self.closed.pop()
                self.inc["end"] = None
                self._note(now, "info", "PONOWNY SYGNAŁ", f"Sygnały wróciły w trakcie incydentu #{self.inc['id']}.", "", self.inc["id"])
            else:
                self._iid += 1
                top = max(act, key=lambda e: e["strength"])
                self.inc = dict(id=self._iid, start=now, head=now, page=None, ack=None, ack_by=None, esc=0, end=None, keys=set(), sev="P3", hyps=[], first=top["detail"], first_src=top["source"])
                self._note(now, "headsup", "WIADOMOŚĆ NA KANALE", f"{SRC_NAME[top['source']]}: {top['detail']}", "Pierwszy sygnał. Hub sprawdza, czy potwierdzają go inne źródła.", self.inc["id"])
        c = self.inc
        if c is None:
            return
        for e in act:
            c["keys"].add(e["key"])
        srcs = {e["source"] for e in act}
        allev = [e for e in self.ev.values() if e["key"] in c["keys"] and e["kind"] not in INFO_KINDS]
        c["hyps"] = self._hyps(allev) if allev else c["hyps"]               # explain everything seen in this incident, not only what is still active
        c.setdefault("seen", set()).update(h["key"] for h in c["hyps"])
        c["srcs"] = sorted(srcs)
        sev = "P1" if (len(srcs) >= 3 or any(e["kind"] == "errors" and e["strength"] >= 3.3 for e in act) or any(e["kind"] == "health" and e["strength"] >= 2 for e in act)) else "P2" if len(srcs) >= 2 else "P3"
        c["sev"] = min(c["sev"], sev)                                       # worst seen so far (P1 < P2 < P3 as strings)
        if c["page"] is None and (len(srcs) >= 2 or c["sev"] == "P1") and not self.silent:
            c["page"] = now
            top = c["hyps"][0] if c["hyps"] else None
            self._note(now, "page", "PAGER DO DYŻURNEGO", f"{c['sev']}: zgodność źródeł ({' + '.join(SRC_NAME[s] for s in sorted(srcs))}). " + (f"Najbardziej prawdopodobne: {top['title']} ({top['conf'] * 100:.0f}%)." if top else ""),
                       top["action"] if top else "", c["id"])
        if self.cfg["auto_ack"] and c["ack"] is None:
            at = c["page"] + M(self.cfg["page_ack"]) if c["page"] else c["head"] + M(self.cfg["head_ack"])
            if now >= at:
                self.ack(at, "dyżurny (symulacja)")
        if c["ack"] is None and c["page"] is None and now - c["head"] >= M(15) and not self.silent:
            c["page"] = now
            self._note(now, "page", "PAGER DO DYŻURNEGO", "Wiadomość bez reakcji przez 15 min: awans do pagera.", "", c["id"])
        if c["ack"] is None and c["page"] is not None and not self.silent:
            if c["esc"] < 1 and now - c["page"] >= M(5):
                c["esc"] = 1
                self._note(now, "page", "ESKALACJA: II LINIA", "Brak potwierdzenia pagera przez 5 min.", "", c["id"])
            if c["esc"] < 2 and now - c["page"] >= M(15):
                c["esc"] = 2
                self._note(now, "page", "ESKALACJA: KIEROWNIK", "Brak potwierdzenia przez 15 min.", "", c["id"])
        if not act:
            last = max([e.get("end", c["start"]) for e in self.ev.values() if e["key"] in c["keys"]] + [c["start"]])
            if now - last >= M(10):
                c["end"] = last
                tt = f"{int((c['ack'] - c['start']).total_seconds() / 60)} min" if c["ack"] else "brak potwierdzenia"
                self._note(now, "close", "INCYDENT ZAMKNIĘTY", f"#{c['id']}: sygnały ustały o {last:%H:%M}. Czas do potwierdzenia: {tt}.", "", c["id"])
                self.closed.append(c)
                self.inc = None

    def ack(self, now, who="dyżurny"):
        c = self.inc
        if not c or c["ack"] is not None:
            return False
        c["ack"], c["ack_by"] = now, who
        self._note(now, "ack", "POTWIERDZONO", f"{who} zajął się incydentem #{c['id']} po {int((now - c['start']).total_seconds() / 60)} min od pierwszego sygnału.", "", c["id"])
        return True

    # ------------------------------------------------------------------------------------------ snapshot for the dashboard
    def _inc_view(self, c):
        keys = c["keys"]
        evs = [e for e in self.ev.values() if e["key"] in keys]
        ev_out = sorted([dict(source=e["source"], service=e["service"], host=e["host"], kind=e["kind"], detail=e["detail"], strength=round(e["strength"], 2), start=iso(e["start"]), end=iso(e.get("end")), active=e["active"]) for e in evs], key=lambda x: (not x["active"], x["start"]))
        return dict(id=c["id"], start=iso(c["start"]), head=iso(c["head"]), page=iso(c["page"]), ack=iso(c["ack"]), ack_by=c["ack_by"], esc=c["esc"], end=iso(c.get("end")), sev=c["sev"], srcs=sorted({e["source"] for e in evs}), active_n=sum(1 for e in evs if e["active"]),
                    hyps=c["hyps"], evidence=ev_out, seen=sorted(c.get("seen", [])), first=c["first"], elapsed=int((self.now - c["start"]).total_seconds() / 60), ttn=int((c["head"] - c["start"]).total_seconds() / 60),
                    tta=None if c["ack"] is None else int((c["ack"] - c["start"]).total_seconds() / 60))

    def svc_status(self, s):
        act = [e for e in self.ev.values() if e["active"] and e["service"] == s and e["kind"] not in INFO_KINDS]
        last = self.pts[s][-1] if self.pts[s] else None
        if not act:
            return "ok"
        if (last and last["err"] >= 10) or any(e["kind"] in ("host_down",) and last and last["hosts_up"] == 0 for e in act) or any(e["kind"] == "health" and e["strength"] >= 2 for e in act):
            return "bad"
        return "warn"

    def snapshot(self):
        now = self.now
        svcs = []
        for s, tp in self.topo["services"].items():
            pts = list(self.pts[s])[-150:]
            last = pts[-1] if pts else None
            act = [e for e in self.ev.values() if e["active"] and e["service"] == s and e["kind"] not in INFO_KINDS]
            note = next((n for n in self.notices.values() if n["service"] == s), None)
            svcs.append(dict(key=s, name=tp["name"], status=self.svc_status(s), last=last, reasons=[e["detail"] for e in act][:3], notice=None if note is None else dict(text=note["text"], risk=note["risk"]),
                             series=dict(t=[p["ts"][11:] for p in pts], rpm=[p["rpm"] for p in pts], exp=[p["exp"] for p in pts], resp=[p["resp"] for p in pts], err=[p["err"] for p in pts], cpu=[p["cpu"] for p in pts]),
                             vendors=list(tp["vendors"])))
        vendors = []
        for v in self.status.get("vendors", []):
            deps = [s for s, tp in self.topo["services"].items() if v["key"] in tp["vendors"]]
            suspect = any(h["key"] == f"vendor_silent:{v['key']}" for h in (self.inc["hyps"] if self.inc else []))
            vendors.append(dict(v, services=deps, suspect=suspect))
        # forecast: past 3 h from data, next 4 h from the model
        fc = {}
        for s in self.topo["services"]:
            past = list(self.pts[s])[-180:]
            fut = []
            t = now
            for i in range(1, 25):
                t = now + M(10 * i)
                fut.append(dict(ts=iso(t), exp=round(self.model.expected_rpm(s, t, self.events), 1), base=round(self.model.base_rpm(s, t), 1)))
            fc[s] = dict(past=dict(t=[p["ts"] for p in past[::3]], rpm=[p["rpm"] for p in past[::3]], exp=[p["exp"] for p in past[::3]], base=[p["base"] for p in past[::3]]), future=fut,
                         cap_cpu=None)
        src = {}
        for name, s in self.src.items():
            age = None if s["last"] is None else int((now - s["last"]).total_seconds() / 60)
            src[name] = dict(name=SRC_NAME[name], last=iso(s["last"]), age=age, stale=s["stale"])
        act_all = [e for e in self.ev.values() if e["active"] and e["kind"] not in INFO_KINDS]
        by = lambda k: [e for e in act_all if e["source"] == k]
        tiles = dict(
            servers=dict(state="alert" if by("servers") else "ok", text=(f"{len(by('servers'))} aktywnych sygnałów" if by("servers") else "metryki w normie")),
            status=dict(state="alert" if by("status") else "ok", text=(", ".join(e["detail"] for e in by("status")[:2]) if by("status") else "wszyscy dostawcy i usługi działają")),
            calls=dict(state="alert" if by("calls") else ("watch" if any(v["z"] >= 2 for v in self.calls_info.values() if "z" in v) else "ok"),
                       text=f"{sum(v['sum5'] for v in self.calls_info.values())} połączeń / 5 min, oczekiwane {sum(v['exp'] for v in self.calls_info.values()):.0f}; czekanie {self.wait['wait_s']} s"),
            analytics=dict(state="alert" if by("analytics") else "ok", text=f"błędy playera {self.ga_info['rate'] * 100:.1f}% (norma {self.model.err_base * 100:.1f}%), {self.ga_info['users']} użytkowników"),
            model=dict(state="watch" if self.notices else "ok", text=(f"{len(self.notices)} komunikatów o aktywności" if self.notices else "ruch zgodny z prognozą")))
        return dict(clock=iso(now), services=svcs, vendors=vendors, sources=src, tiles=tiles, incident=None if self.inc is None else self._inc_view(self.inc), closed=[self._inc_view(c) for c in self.closed[-6:]][::-1],
                    notes=[dict(n, ts=iso(n["ts"])) for n in self.notes[-80:]], notices=[dict(ts=iso(n["ts"]), tag=n["tag"], text=n["text"], level=n["level"], service=n["service"], risk=n["risk"]) for n in self.notices.values()],
                    forecast=fc, events=[dict(id=e["id"], title=e["title"], type=e["type"], start=iso(e["start"]), end=iso(e["end"]), services=e["services"]) for e in self.events],
                    calls=dict(info={tp: dict(v, name=TOPIC_NAME[tp]) for tp, v in self.calls_info.items()}, wait=self.wait), ga=self.ga_info,
                    cfg=dict(self.cfg))
