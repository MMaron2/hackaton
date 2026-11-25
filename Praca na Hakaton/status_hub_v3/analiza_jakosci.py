"""Jakość wykrywania na prawdziwych incydentach: Hub (silnik kart v3) i model NR kontra reakcja człowieka (Jira).

    python3 analiza_jakosci.py                  # tabele w Markdownie na stdout
    python3 analiza_jakosci.py --csv wyniki.csv # dodatkowo zapis wyników per incydent

Tylko biblioteka standardowa. Czyta data/replay.json i data/nr_model.json, a silnik Huba (server/engine.py) uruchamia na całym oknie
każdego incydentu, od początku do końca, bez udziału człowieka ("Symuluj dyżurnego" wyłączone).
Odniesienie czasowe ("start awarii") to początek wskazany przez właściciela danych, jeśli jest (tylko AIIT-2686), a w pozostałych
przypadkach początek z Jiry. Dla incydentów zgłoszonych ręcznie ten początek jest zwykle chwilą zauważenia, więc czasy reakcji ludzi
liczone od niego są DOLNĄ granicą (prawdziwy początek bywał wcześniej).
"""
import argparse
import csv
import json
import math
import sys
from datetime import timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "server"))
from engine import FMT, Demo, P  # noqa: E402

D = json.loads((HERE / "data" / "replay.json").read_text(encoding="utf-8"))
N = json.loads((HERE / "data" / "nr_model.json").read_text(encoding="utf-8"))
FULL = {"cms", "mht", "vaf", "eks", "v_cf", "v_alb"}          # karty z metrykami aplikacji, hostów i balanserów (nie tylko monitory syntetyczne)


def minutes(a, b):
    return int(round((a - b).total_seconds() / 60))


def wilson(k, n, z=1.96):
    """Przedział ufności Wilsona dla proporcji k/n (95%)."""
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def poisson_ci(k, t, alpha=0.05):
    """Dokładny przedział (Garwood) dla intensywności zdarzeń k na t dni."""
    def cdf(x, mu):
        return sum(math.exp(-mu + i * math.log(mu) - math.lgamma(i + 1)) for i in range(x + 1)) if mu > 0 else 1.0
    def bis(f, lo, hi):
        for _ in range(100):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if f(mid) else (lo, mid)
        return (lo + hi) / 2
    up = bis(lambda mu: cdf(k, mu) > alpha / 2, 0, 10 * (k + 5))
    lo = 0.0 if k == 0 else bis(lambda mu: 1 - cdf(k - 1, mu) < alpha / 2, 0, 10 * (k + 5))
    return (lo / t, up / t)


def run_hub():
    """Silnik Huba na całym oknie każdego scenariusza. Zwraca słownik id -> wyniki."""
    demo, out = Demo(D), {}
    for s in D["scenarios"]:
        sid = s["id"]
        demo.load(sid, -10 ** 6)                                  # od początku okna
        demo.cfg["auto_ack"] = False
        while not demo.at_end():
            demo.step()
        incs = ([demo.inc] if demo.inc else []) + demo.closed
        j = s["jira"]
        w0, w1 = P(s["ts"][0]), P(s["ts"][-1])
        hours = (w1 - w0).total_seconds() / 3600
        if not j:
            out[sid] = dict(sid=sid, quiet=True, incidents=len(incs), pagers=sum(1 for c in incs if c["page"]), window_h=hours, safe_h=hours)
            continue
        onset_owner = j.get("onset_owner")
        onset = P(onset_owner) if onset_owner not in (None, "None", "") else P(j["start"])
        lo_w, hi_w = onset - timedelta(hours=3), P(j["end"]) + timedelta(minutes=30)            # okno awarii: 3 h przed początkiem do 30 min po końcu
        near = [c for c in incs if lo_w <= c["head"] <= hi_w]
        far = [c for c in incs if c not in near]
        safe = hours - max(0.0, (min(w1, hi_w) - max(w0, lo_w)).total_seconds() / 3600)          # czas okna poza oknem awarii (tu każdy incydent jest fałszywy)
        hub = min(near, key=lambda c: c["head"]) if near else None
        det, start, ack = P(j["detected"]), P(j["start"]), P(j["ack"])
        out[sid] = dict(
            sid=sid, quiet=False, prio=j["prio"], cause=j["cause"], how=j["how"], onset=onset, onset_src="właściciel danych" if onset_owner not in (None, "None", "") else "Jira",
            full=bool(set(s["has"]) & FULL), cards=len(s["has"]),
            human_from_onset=minutes(det, onset), human_from_start=minutes(det, start), human_ack=minutes(ack, onset),
            hub_first=None if not hub else minutes(hub["head"], onset), hub_page=None if not hub or not hub["page"] else minutes(hub["page"], onset),
            hub_sev=None if not hub else hub["sev"], hub_hyp=None if not hub else (hub.get("hyps") or [{}])[0].get("title"),
            out_of_window=len(far), pagers_out=sum(1 for c in far if c["page"]), n_inc=len(incs), window_h=hours, safe_h=safe,
            far=[(c["head"].strftime("%d.%m %H:%M"), c["sev"], "pager" if c["page"] else "bez pagera") for c in far])
    return out


def nr_rows():
    """Model NR: pierwszy sygnał per incydent (po jednym oknie na incydent: to, w którym jest sygnał, a w razie braku to z najwyższym ryzykiem)."""
    best = {}
    for r in N["valid"]["incidents"]:
        sig = r.get("warning") or r.get("watch")
        cur = best.get(r["key"])
        if cur is None or (sig and not (cur.get("warning") or cur.get("watch"))) or (bool(sig) == bool(cur.get("warning") or cur.get("watch")) and (r.get("max_risk") or 0) > (cur.get("max_risk") or 0)):
            best[r["key"]] = r
    return best


def fmt(v, plus=False):
    if v is None:
        return "brak"
    return (f"+{v}" if plus and v > 0 else str(v))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", help="zapisz wyniki per incydent do pliku CSV")
    a = ap.parse_args()
    H, NR = run_hub(), nr_rows()
    inc = [v for v in H.values() if not v["quiet"]]
    quiet = next(v for v in H.values() if v["quiet"])

    print("## A. Wyniki per incydent (minuty od początku awarii; ujemne = przed początkiem; „potwierdzenie” = ktoś przejął sprawę)\n")
    print("| Incydent | Prio | Zgłoszenie | Okno z pełnymi metrykami | Ludzie: wykrycie | Ludzie: potwierdzenie | Hub: pierwszy sygnał | Hub: pager | Hub wcześniej o | Model NR: pierwszy sygnał | Hub: hipoteza |")
    print("|---|---|---|---|---|---|---|---|---|---|---|")
    csv_rows = []
    for v in inc:
        nr = NR.get(v["sid"], {})
        sigs = [x for x in (nr.get("watch"), nr.get("warning")) if x]
        nr_min = None if not sigs else minutes(P(min(sigs)), v["onset"])
        delta = None if v["hub_first"] is None else v["human_from_onset"] - v["hub_first"]
        print(f"| {v['sid']} | {v['prio']} | {v['how']} | {'tak' if v['full'] else 'nie'} | {fmt(v['human_from_onset'])} | {v['human_ack']} | {fmt(v['hub_first'])} | {fmt(v['hub_page'])} | {fmt(delta, True)} | {fmt(nr_min)} | {v['hub_hyp'] or '—'} |")
        csv_rows.append(dict(incydent=v["sid"], prio=v["prio"], zgloszenie=v["how"], przyczyna_jira=v["cause"], odniesienie_poczatku=v["onset_src"], okno_pelne_metryki=v["full"],
                             ludzie_wykrycie_min=v["human_from_onset"], ludzie_potwierdzenie_min=v["human_ack"], hub_pierwszy_sygnal_min=v["hub_first"], hub_pager_min=v["hub_page"],
                             hub_wczesniej_o_min=delta, model_nr_pierwszy_sygnal_min=nr_min, hub_hipoteza=v["hub_hyp"], incydenty_poza_oknem_awarii=v["out_of_window"]))

    n = len(inc)
    full = [v for v in inc if v["full"]]
    hub_det = [v for v in inc if v["hub_first"] is not None]
    hub_det_full = [v for v in full if v["hub_first"] is not None]
    nr_sig = [k for k, r in NR.items() if (r.get("warning") or r.get("watch"))]
    print("\n## B. Skuteczność wykrywania (95% przedziały ufności Wilsona)\n")
    print("| Miara | Wynik | Przedział 95% |")
    print("|---|---|---|")
    for name, k, m in [("Hub wykrył incydent (wszystkie okna)", len(hub_det), n), ("Hub wykrył incydent (okna z pełnymi metrykami)", len(hub_det_full), len(full)),
                       ("Hub wykrył incydent (okna tylko z monitorami syntetycznymi)", len(hub_det) - len(hub_det_full), n - len(full)),
                       ("Model NR dał sygnał (wszystkie okna)", len(nr_sig), n)]:
        lo, hi = wilson(k, m)
        print(f"| {name} | {k} z {m} ({100 * k / m:.0f}%) | {100 * lo:.0f}% do {100 * hi:.0f}% |")

    print("\n## C. Hub kontra człowiek w oknach, które Hub wykrył (minuty od początku awarii)\n")
    print("| Incydent | Ludzie | Hub | Różnica (dodatnia = Hub wcześniej) | Werdykt |")
    print("|---|---|---|---|---|")
    wins = ties = loss = 0
    for v in hub_det:
        d = v["human_from_onset"] - v["hub_first"]
        verdict = "Hub wcześniej" if d > 5 else "remis (±5 min)" if d >= -5 else "ludzie wcześniej"
        wins += d > 5; ties += -5 <= d <= 5; loss += d < -5
        print(f"| {v['sid']} | {v['human_from_onset']} | {v['hub_first']} | {d:+d} | {verdict} |")
    print(f"\nPodsumowanie: Hub wcześniej {wins}, remis {ties}, ludzie wcześniej {loss}, brak sygnału Huba {n - len(hub_det)} (z {n}).")

    print("\n## D. Czy to jest PRZEWIDYWANIE (sygnał przed prawdziwym początkiem)?\n")
    owner = [v for v in inc if v["onset_src"] == "właściciel danych"]
    for v in owner:
        nr = NR.get(v["sid"], {})
        print(f"- {v['sid']}: początek wg właściciela danych {v['onset']:%H:%M}; Hub pierwszy sygnał {fmt(v['hub_first'], True)} min, model NR (obserwuj/ostrzeżenie) {nr.get('watch', '')[11:]}/{nr.get('warning', '')[11:]}, ludzie {v['human_from_onset']} min po początku.")
    before_jira = []
    for v in inc:
        if v["hub_first"] is None:
            continue
        j_start = next(s["jira"]["start"] for s in D["scenarios"] if s["id"] == v["sid"])
        first_dt = v["onset"] + timedelta(minutes=v["hub_first"])
        before_jira.append((v["sid"], minutes(first_dt, P(j_start))))
    print(f"- Pierwszy sygnał Huba względem początku z Jiry (min): " + ", ".join(f"{s} {m:+d}" for s, m in before_jira))
    nrj = [(k, minutes(P(min(x for x in (r.get("watch"), r.get("warning")) if x)), P(next(s["jira"]["start"] for s in D["scenarios"] if s["id"] == k)))) for k, r in NR.items() if (r.get("watch") or r.get("warning"))]
    print("- Pierwszy sygnał modelu NR względem początku z Jiry (min): " + ", ".join(f"{k} {m:+d}" for k, m in nrj))
    print(f"- Incydenty, w których sygnał Huba pojawił się PRZED prawdziwym początkiem: 0 z {len(owner)} (jedyny incydent ze znanym prawdziwym początkiem).")

    print("\n## E. Fałszywe alarmy\n")
    safe_h = sum(v["safe_h"] for v in list(inc) + [quiet])
    far = [(v["sid"], x) for v in inc for x in v["far"]]
    n_far, n_pg = len(far) + quiet["incidents"], sum(v["pagers_out"] for v in inc) + quiet["pagers"]
    lo, hi = poisson_ci(n_far, safe_h / 24)
    lo2, hi2 = poisson_ci(n_pg, safe_h / 24)
    print(f"- Poziom incydentu (silnik Huba na pełnych oknach, bez udziału człowieka): {safe_h:.1f} h czasu bez awarii (poza oknem awarii oraz spokojny dzień {quiet['window_h']:.1f} h).")
    print(f"  - fałszywe incydenty: {n_far} ({n_far / (safe_h / 24):.2f} na dobę, 95%: {lo:.2f} do {hi:.2f})" + (": " + "; ".join(f"{sid} {t} {sev}, {pg}" for sid, (t, sev, pg) in far) if far else "") + ".")
    print(f"  - fałszywe pagery: {n_pg} (95% górna granica: {hi2:.2f} na dobę).")
    cue = [h for h in D["healthy"] if h["block"] != "NB"]
    nb = [h for h in D["healthy"] if h["block"] == "NB"]
    for name, grp in (("okna CUE (aplikacje, hosty, balansery)", cue), ("okno NB (monitory syntetyczne)", nb)):
        d, e = sum(h["days"] for h in grp), sum(h["episodes"] for h in grp)
        lo, hi = poisson_ci(e, d)
        print(f"- Karty, pojedynczy sygnał bez potwierdzenia (daje tylko ostrzeżenie na kanale), {name}: {e} epizodów w {d:.1f} zdrowych dni = {e / d:.2f} na dobę (95%: {lo:.2f} do {hi:.2f}).")
    for lvl in ("watch", "warning"):
        rows = [r for r in N["valid"]["false_alarms"] if r["level"] == lvl]
        d, e = sum(r["healthy_days"] for r in rows), sum(r["episodes"] for r in rows)
        lo, hi = poisson_ci(e, d)
        print(f"- Model NR, poziom „{'obserwuj' if lvl == 'watch' else 'ostrzeżenie'}”: {e} epizodów w {d:.1f} zdrowych dni = {e / d:.3f} na dobę (95%: {lo:.3f} do {hi:.3f}).")

    print("\n## F. Reakcja człowieka (z Jiry)\n")
    det = sorted(v["human_from_start"] for v in inc)
    ack = sorted(v["human_ack"] for v in inc)
    med = lambda x: x[len(x) // 2] if len(x) % 2 else (x[len(x) // 2 - 1] + x[len(x) // 2]) / 2
    print(f"- Wykrycie względem początku z Jiry: mediana {med(det):g} min, zakres {det[0]} do {det[-1]} min (n={n}); ręczne zgłoszenia: {sum(v['how'] == 'Manual' for v in inc)}, automatyczne: {sum(v['how'] == 'Auto' for v in inc)}.")
    print(f"- Potwierdzenie (ktoś przejął sprawę) od początku awarii: mediana {med(ack):g} min, zakres {ack[0]} do {ack[-1]} min; suma {sum(ack)} min (n={n}).")
    print(f"- Wykrycie liczone od prawdziwego początku znamy tylko dla {len(owner)} incydentu: " + ", ".join(f"{v['sid']} {v['human_from_onset']} min" for v in owner) + ".")

    if a.csv:
        with open(a.csv, "w", newline="", encoding="utf-8-sig") as f:      # BOM: Excel poprawnie czyta polskie znaki
            w = csv.DictWriter(f, fieldnames=list(csv_rows[0]))
            w.writeheader()
            w.writerows(csv_rows)
        print(f"\nZapisano {a.csv}", file=sys.stderr)


if __name__ == "__main__":
    main()
