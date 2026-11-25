"""Demo engine: replays a REAL incident window (built from the New Relic export) bucket by bucket and does what the Status Hub does:
evidence from the sources -> incident (P1-P3) with hypotheses -> heads-up, page, escalation, acknowledgement.

Sources: real metrics (cards of internal services and external providers), the learned NR model (risk), and the SIMULATED call centre and
Google Analytics (generated from the real signals in build_replay.py). Standard library only.
"""
from datetime import datetime, timedelta

FMT = "%Y-%m-%d %H:%M"
P = lambda s: datetime.strptime(s, FMT)
LANE = {"cms": "servers", "mht": "servers", "vaf": "servers", "eks": "servers", "pages": "synth", "player": "synth", "v_cf": "vendors", "v_alb": "vendors", "v_cmp": "vendors", "v_sdk": "vendors"}
LANE_NAME = {"servers": "Aplikacje i serwery", "synth": "Monitoring syntetyczny", "vendors": "Dostawcy (pomiar)", "calls": "Infolinia (symulacja)", "analytics": "Analityka (symulacja)", "model": "Model NR"}
CFG = dict(calls_z=4.0, calls_min=12, ga_rate=0.06, ga_ratio=0.6, page_lanes=2, safeguard_min=15, esc1_min=5, esc2_min=15, close_min=10, persistence=2, alarm_ratio=2.0, auto_ack_min=5)
HYP = {"v_cf": ("Dostawca: AWS CloudFront (CDN)", "Sprawdź AWS Health i zgłoszenie u dostawcy, rozważ przełączenie ruchu na zapasową dystrybucję, poinformuj redakcję."),
       "v_alb": ("Dostawca: AWS Load Balancers (błędy 5xx, niezdrowe hosty)", "Sprawdź AWS Health i target groups, zweryfikuj zdrowie hostów za balanserem, rozważ przekierowanie ruchu."),
       "v_ext": ("Dostawca zewnętrzny: SDK lub CMP (zgody, reklamy, analityka)", "Sprawdź stronę statusu dostawcy SDK; rozważ wyłączenie ładowania skryptu."),
       "servers": ("Przeciążenie lub awaria serwerów (VAF, EKS)", "Sprawdź obciążenie i procesy na wskazanych hostach, rozważ restart lub skalowanie."),
       "app": ("Aplikacja CMS lub Manhattan: wolne odpowiedzi, błędy", "Sprawdź logi aplikacji i ostatnie wdrożenia, rozważ rollback."),
       "synth": ("Awaria widoczna dla użytkownika (monitoring syntetyczny)", "Sprawdź wskazane strony i odtwarzacz; porównaj z metrykami serwerów."),
       "nr": ("Nietypowe zachowanie metryk (model NR)", "Model widzi odchylenie od normy w wielu encjach naraz; sprawdź wskazane grupy metryk.")}


class Demo:
    def __init__(self, data):
        self.d = data
        self.cards_def = data["cards"]
        self.topics = data["topics"]
        self.scen = {s["id"]: s for s in data["scenarios"]}
        self.cfg = dict(CFG, auto_ack=False)
        self.speed, self.paused = 120, False
        self.load(next(iter(self.scen)))

    # ------------------------------------------------------------------------------------------ scenario
    def load(self, sid, start_offset_min=-90):
        s = self.s = self.scen[sid]
        self.idx = [P(t) for t in s["ts"]]
        self.iv = s["interval"]
        j = s["jira"]
        t0 = P(j["start"]) + timedelta(minutes=start_offset_min) if j else self.idx[36]
        start = max(2, next((i for i, t in enumerate(self.idx) if t >= t0), 2))
        self.ev, self.inc, self.closed, self.notes, self.n_inc = {}, None, [], [], 0
        self.i = -1
        self.silent = True
        for _ in range(start):
            self.step(advance=True)
        self.silent = False
        self.paused = False

    def at_end(self):
        return self.i >= len(self.idx) - 1

    # ------------------------------------------------------------------------------------------ one bucket
    def conds(self, i):
        s, out = self.s, []
        for ck, C in s["cards"].items():
            st = C["st"][i]
            top = C["top"].get(s["ts"][i])
            if top:
                q = top[0]
                det = f"{self.cards_def[ck]['name']}: {q['e']}, {q['m']} {q['z']:+.0f}σ (wartość {q['v']:g}, norma {q['b'] if q['b'] is not None else '—'})"
            else:
                det = f"{self.cards_def[ck]['name']}: {C['na'][i]} z {C['nt'][i]} encji poza normą"
            out.append((("card", ck), LANE[ck], ck, "alarm" if st == 2 else "warn", st > 0, 2.0 if st == 2 else 1.0, det))
        lvl = s["lvl"][i]
        out.append((("nr",), "model", "nr", "nr_risk", lvl >= 1, float(lvl), f"model NR: ryzyko {s['risk'][i]:.0f}/100 ({['OK', 'obserwuj', 'ostrzeżenie', 'alarm'][lvl]}), najsilniej: {s['nr_top'][i] or '—'}"))
        sim = s["sim"]
        for tp, name in self.topics.items():
            n, exp = sim["calls"][tp][i], sim["calls_exp"][tp][i]
            z = (n - exp) / (exp + 2) ** 0.5
            out.append((("calls", tp), "calls", tp, "calls", z >= self.cfg["calls_z"] and n >= self.cfg["calls_min"] * self.iv / 5, z / self.cfg["calls_z"], f"infolinia „{name}”: {n} połączeń / {self.iv} min (norma ok. {exp:.0f})"))
        st_, er = max(1, sim["starts"][i]), sim["errs"][i]
        rate = er / st_
        out.append((("ga", "err"), "analytics", "player", "ga_errors", rate >= self.cfg["ga_rate"], rate / self.cfg["ga_rate"], f"analityka: błędy playera {rate * 100:.1f}% (norma ok. 1,5%)"))
        out.append((("ga", "starts"), "analytics", "player", "ga_starts", sim["starts_exp"][i] > 300 and sim["starts"][i] / max(1, sim["starts_exp"][i]) <= self.cfg["ga_ratio"], 1.0,
                    f"analityka: starty playera {sim['starts'][i]} zamiast ok. {sim['starts_exp'][i]}"))
        return out

    def step(self, advance=True):
        if self.i >= len(self.idx) - 1:
            return False
        self.i += 1
        i, now = self.i, self.idx[self.i]
        for key, lane, ck, kind, active, strength, det in self.conds(i):
            e = self.ev.get(key)
            if active:
                if e is None or not e["active"]:
                    self.ev[key] = e = dict(key=key, lane=lane, ck=ck, kind=kind, start=now, active=True, peak=strength)
                e.update(last=now, detail=det, strength=strength, peak=max(e["peak"], strength))
            elif e and e["active"]:
                e["active"], e["end"] = False, now
        self._incident(now)
        return True

    # ------------------------------------------------------------------------------------------ incident lifecycle
    def note(self, ts, level, tag, text, sub=""):
        if not self.silent:
            self.notes.append(dict(ts=ts.strftime(FMT), level=level, tag=tag, text=text, sub=sub))

    def _incident(self, now):
        act = [e for e in self.ev.values() if e["active"]]
        c = self.inc
        if c is None:
            if not act:
                return
            self.n_inc += 1
            first = min(e["start"] for e in act)
            c = self.inc = dict(id=self.n_inc, start=first, head=now, page=None, ack=None, ack_by=None, esc=0, sev="P3", keys=set(), end=None, last=now)
            self.note(now, "headsup", "WIADOMOŚĆ NA KANAŁACH", act[0]["detail"], "Pierwszy sygnał. Hub sprawdza, czy potwierdzają go inne źródła.")
        c["keys"] |= {e["key"] for e in act}
        if act:
            c["last"] = now
        lanes = {e["lane"] for e in act}
        alarm = any(e["strength"] >= 2 and e["lane"] in ("servers", "synth", "vendors", "model") for e in act)
        sev = "P1" if (len(lanes) >= 3 or (len(lanes) >= 2 and alarm)) else "P2" if (len(lanes) >= 2 or alarm) else "P3"
        c["sev"] = min(c["sev"], sev)                                   # worst seen (P1 < P2 < P3)
        hyps = self.hyps(c)
        c["hyps"] = hyps
        if c["page"] is None and not c["ack"] and ((len(lanes) >= self.cfg["page_lanes"]) or (now - c["head"]).total_seconds() / 60 >= self.cfg["safeguard_min"]):
            c["page"] = now
            top = hyps[0] if hyps else None
            self.note(now, "page", "PAGER DO DYŻURNEGO", f"{c['sev']}: zgodność źródeł ({', '.join(LANE_NAME[x] for x in sorted(lanes))}). Najbardziej prawdopodobne: {top['title'] if top else 'ustalam'} ({int(top['conf'] * 100) if top else 0}%).", top["action"] if top else "")
        if c["page"] and not c["ack"]:
            m = (now - c["page"]).total_seconds() / 60
            if self.cfg["auto_ack"] and m >= self.cfg["auto_ack_min"]:
                self.ack(now, "dyżurny (symulacja)")
            elif c["esc"] < 2 and m >= self.cfg["esc2_min"]:
                c["esc"] = 2
                self.note(now, "page", "ESKALACJA: KIEROWNIK", f"Brak potwierdzenia pagera przez {self.cfg['esc2_min']} min.")
            elif c["esc"] < 1 and m >= self.cfg["esc1_min"]:
                c["esc"] = 1
                self.note(now, "page", "ESKALACJA: II LINIA", f"Brak potwierdzenia pagera przez {self.cfg['esc1_min']} min.")
        if not act and (now - c["last"]).total_seconds() / 60 >= self.cfg["close_min"]:
            c["end"] = c["last"]
            tt = f"{int((c['ack'] - c['start']).total_seconds() / 60)} min" if c["ack"] else "brak potwierdzenia"
            self.note(now, "close", "INCYDENT ZAMKNIĘTY", f"#{c['id']}: sygnały ustały o {c['last']:%H:%M}. Czas do potwierdzenia: {tt}.")
            self.closed.append(c)
            self.inc = None

    def ack(self, now, who="dyżurny"):
        c = self.inc
        if not c or c["ack"]:
            return False
        c["ack"], c["ack_by"] = now, who
        self.note(now, "ack", "POTWIERDZONO", f"{who} zajął się incydentem #{c['id']} po {int((now - c['start']).total_seconds() / 60)} min od pierwszego sygnału.")
        return True

    def hyps(self, c):
        ev = [e for e in self.ev.values() if e["key"] in c["keys"]]
        act = {e["ck"] for e in ev if e["lane"] in ("servers", "synth", "vendors") and e["active"]} or {e["ck"] for e in ev if e["lane"] in ("servers", "synth", "vendors")}
        lanes = {e["lane"] for e in ev}
        human = bool(lanes & {"calls", "analytics"})
        H = {}
        if "v_cf" in act: H["v_cf"] = 0.8 + 0.1 * bool(act & {"pages", "player", "cms"})
        if "v_alb" in act: H["v_alb"] = 0.78 + 0.1 * bool(act & {"pages", "player", "cms", "mht"})
        if act & {"v_cmp", "v_sdk"}: H["v_ext"] = 0.6 + 0.1 * bool(act & {"pages", "player"})
        if act & {"vaf", "eks"}: H["servers"] = 0.7 + 0.1 * bool(act & {"cms", "mht"})
        if act & {"cms", "mht"}: H["app"] = 0.72 if not (act & {"vaf", "eks"}) else 0.6
        if act & {"pages", "player"} and not (act - {"pages", "player"}): H["synth"] = 0.55
        if "model" in lanes and self.i is not None:                       # the group the learned NR model reacts to most points at a card
            top = self.s["nr_top"][self.i].lower()
            nrc = [k for pat, k in (("awsalb", "v_alb"), ("cloudfront", "v_cf"), ("host", "vaf"), ("apm", "cms"), ("synth", "pages")) if pat in top]
            if nrc and nrc[0] not in act:
                key = {"v_alb": "v_alb", "v_cf": "v_cf", "vaf": "servers", "cms": "app", "pages": "synth"}[nrc[0]]
                H[key] = max(H.get(key, 0), 0.62)
        if not H and "model" in lanes: H["nr"] = 0.4
        out = []
        for k, v in sorted(H.items(), key=lambda x: -x[1]):
            title, action = HYP[k]
            related = [e for e in ev if (e["ck"] in ({"v_cf": ["v_cf"], "v_alb": ["v_alb"], "v_ext": ["v_cmp", "v_sdk"], "servers": ["vaf", "eks"], "app": ["cms", "mht"], "synth": ["pages", "player"], "nr": []}[k]) and e["lane"] in ("servers", "synth", "vendors"))]
            bullets = [e["detail"] for e in sorted(related, key=lambda x: -x["peak"])[:2]]
            if human: bullets.append("zgłoszenia lub błędy po stronie użytkowników (infolinia, analityka) potwierdzają wpływ")
            out.append(dict(key=k, title=title, conf=round(min(0.97, v + (0.05 if human else 0)), 2), why=bullets, action=action))
        return out[:3]

    # ------------------------------------------------------------------------------------------ views
    def inc_view(self, c):
        keys = c["keys"]
        evs = sorted([e for e in self.ev.values() if e["key"] in keys], key=lambda e: (not e["active"], e["start"]))
        now = self.idx[self.i]
        return dict(id=c["id"], start=c["start"].strftime(FMT), head=c["head"].strftime(FMT), page=c["page"] and c["page"].strftime(FMT), ack=c["ack"] and c["ack"].strftime(FMT), ack_by=c["ack_by"], esc=c["esc"], sev=c["sev"],
                    end=c["end"] and c["end"].strftime(FMT), hyps=c.get("hyps", []), active_n=sum(1 for e in evs if e["active"]), srcs=sorted({e["lane"] for e in evs}), elapsed=int((now - c["start"]).total_seconds() / 60),
                    evidence=[dict(lane=e["lane"], detail=e["detail"], start=e["start"].strftime(FMT), end=e.get("end") and e["end"].strftime(FMT), active=e["active"]) for e in evs],
                    tta=None if not c["ack"] else int((c["ack"] - c["start"]).total_seconds() / 60))

    def truth(self):
        j = self.s["jira"]
        if not j:
            return None
        st = P(j["onset_owner"] if j.get("onset_owner") else j["start"])
        incs = ([self.inc] if self.inc else []) + self.closed
        near = [c for c in incs if st - timedelta(hours=3) <= c["head"] <= P(j["end"]) + timedelta(minutes=30)]
        hub = min(near, key=lambda c: c["head"]) if near else None
        now = self.idx[self.i]
        return dict(jira=j, onset=st.strftime(FMT), hub=None if not hub else dict(id=hub["id"], first=hub["start"].strftime(FMT), head=hub["head"].strftime(FMT), ttn=int((hub["head"] - st).total_seconds() / 60), page=hub["page"] and hub["page"].strftime(FMT),
                                                                                  hyp=(hub.get("hyps") or [{}])[0].get("title")), human_min=int((P(j["detected"]) - st).total_seconds() / 60),
                    started=now >= st, waiting=int((now - st).total_seconds() / 60) if now >= st else None)

    def snapshot(self):
        s, i = self.s, self.i
        now = self.idx[i]
        lo = max(0, i - 149)
        cards = []
        for ck, df in self.cards_def.items():
            C = s["cards"].get(ck)
            if C is None:
                cards.append(dict(key=ck, name=df["name"], kind=df["kind"], desc=df["desc"], nodata=True, status="nodata", nums=[], unit=self.d["units"][ck], series=dict(t=[], a=[], e=[])))
                continue
            st = C["st"][i]
            top = C["top"].get(s["ts"][i])
            nums = [dict(l=lab, v=C["nums"][k][i], u=u) for k, (lab, u) in enumerate(self.d["nums"][ck])]
            nums.append(dict(l="Poza normą", v=f"{C['na'][i]}/{C['nt'][i]}" if C["nt"][i] else "—", u="encji"))
            cards.append(dict(key=ck, name=df["name"], kind=df["kind"], desc=df["desc"], nodata=False, status=["ok", "warn", "bad"][st], nums=nums, unit=self.d["units"][ck], ratio=C["ratio"][i],
                              why=None if not st else (f"{top[0]['e']}: {top[0]['m']} {top[0]['z']:+.0f}σ" if top else f"{C['na'][i]} z {C['nt'][i]} encji poza normą"),
                              series=dict(t=[x[11:] for x in s["ts"][lo:i + 1]], a=C["a"][lo:i + 1], e=C["e"][lo:i + 1])))
        sim = s["sim"]
        calls = {tp: dict(name=name, n=sim["calls"][tp][i], exp=sim["calls_exp"][tp][i]) for tp, name in self.topics.items()}
        for v in calls.values():
            v["z"] = round((v["n"] - v["exp"]) / (v["exp"] + 2) ** 0.5, 1)
        er = sim["errs"][i] / max(1, sim["starts"][i])
        ga = dict(users=sim["users"][i], users_exp=sim["users_exp"][i], starts=sim["starts"][i], starts_exp=sim["starts_exp"][i], rate=round(er, 4))
        act = [e for e in self.ev.values() if e["active"]]
        tiles = {}
        for lane, name in LANE_NAME.items():
            al = [e for e in act if e["lane"] == lane]
            tiles[lane] = dict(name=name, state="alert" if al else "ok", text=(f"{len(al)} aktywnych sygnałów: " + al[0]["detail"][:90]) if al else "w normie", sim=lane in ("calls", "analytics"))
        return dict(clock=now.strftime(FMT), idx=i, n=len(self.idx), speed=self.speed, paused=self.paused, ended=self.at_end(), scenario=dict(id=s["id"], jira=s["jira"], block=s["block"], interval=self.iv, t0=s["ts"][0], t1=s["ts"][-1]), cards=cards, tiles=tiles,
                    incident=self.inc and self.inc_view(self.inc), closed=[self.inc_view(c) for c in self.closed[-6:]][::-1], notes=self.notes[-60:], calls=dict(topics=calls, wait=sim["wait"][i], aband=sim["aband"][i]), ga=ga,
                    nr=dict(risk=s["risk"][i], lvl=s["lvl"][i], top=s["nr_top"][i], match=s["sim_match"][i]), truth=self.truth(), cfg=dict(self.cfg))

    def scenarios(self):
        out = []
        for sid, s in self.scen.items():
            j = s["jira"]
            out.append(dict(id=sid, title=(j["title"] if j else "Spokojny dzień (bez awarii): test fałszywych alarmów"), jira=j, has=s["has"], block=s["block"], n=len(s["ts"]), interval=s["interval"],
                            signal=bool(any(any(C["st"]) for C in s["cards"].values()) or any(s["lvl"]))))
        return out
