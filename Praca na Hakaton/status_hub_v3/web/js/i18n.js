/* Języki dla stron Status Hub: polski (źródłowy), angielski, niemiecki.
   Teksty w aplikacji zostają po polsku; ten moduł tłumaczy je w locie (słownik + reguły dla tekstów z liczbami),
   także te dopisywane później przez skrypty. Brak wpisu w słowniku = tekst zostaje po polsku
   (dotyczy m.in. opisów generowanych przez serwer: hipotez, dowodów, komunikatów dostawców).
   Wybór języka: localStorage "hub-lang" (pl | en | de), zmiana przeładowuje stronę. */
(function () {
  let saved = null; try { saved = localStorage.getItem('hub-lang'); } catch (e) { /* tryb prywatny */ }
  const LANG = ['pl', 'en', 'de'].includes(saved) ? saved : 'pl';
  window.IH_LANG = LANG;
  document.documentElement.lang = LANG;
  const I = LANG === 'en' ? 0 : 1, L = (en, de) => (I === 0 ? en : de);

  // polski → [angielski, niemiecki]
  const D = {
    // nagłówek i dodatki InfoHub
    'pokaz na danych New Relic': ['demo on New Relic data', 'Demo mit New-Relic-Daten'], 'centrum dowodzenia platformą': ['platform command centre', 'Leitstand der Plattform'],
    'Generator awarii': ['Failure generator', 'Störungsgenerator'], 'symulowana platforma i wstrzykiwanie usterek': ['simulated platform and fault injection', 'simulierte Plattform und Fehlerinjektion'],
    'ODTWARZANIE': ['REPLAY', 'WIEDERGABE'], 'GENERATOR · SYMULACJA': ['GENERATOR · SIMULATION', 'GENERATOR · SIMULATION'], 'SYMULACJA': ['SIMULATION', 'SIMULATION'], 'SYM.': ['SIM.', 'SIM.'], 'NA ŻYWO': ['LIVE', 'LIVE'],
    'łączenie…': ['connecting…', 'Verbindung…'], 'Łączenie z Hubem…': ['Connecting to the Hub…', 'Verbindung zum Hub…'], 'Łączenie z symulatorem…': ['Connecting to the simulator…', 'Verbindung zum Simulator…'],
    'Usługi zewnętrzne': ['External services', 'Externe Dienste'], 'Model z danych NR': ['Model from NR data', 'Modell aus NR-Daten'], 'Model obciążenia': ['Load model', 'Lastmodell'],
    'Progi': ['Thresholds', 'Schwellenwerte'], 'Dane i źródła': ['Data and sources', 'Daten und Quellen'], 'Źródła': ['Sources', 'Quellen'],
    'Szukaj usługi, dostawcy, zakładki…': ['Search service, provider, tab…', 'Dienst, Anbieter, Tab suchen…'], 'Brak wyników': ['No results', 'Keine Ergebnisse'],
    'Powiadomienia': ['Notifications', 'Benachrichtigungen'], 'Brak powiadomień': ['No notifications', 'Keine Benachrichtigungen'], 'Włącz powiadomienia przeglądarki': ['Enable browser notifications', 'Browser-Benachrichtigungen aktivieren'],
    'Przełącz na tryb ciemny': ['Switch to dark mode', 'Zum dunklen Modus wechseln'], 'Przełącz na tryb jasny': ['Switch to light mode', 'Zum hellen Modus wechseln'],
    'Zakładka': ['Tab', 'Tab'], 'Usługa': ['Service', 'Dienst'], 'Dostawca': ['Provider', 'Anbieter'], 'Dostawca (pomiar)': ['Provider (measurement)', 'Anbieter (Messung)'], 'Incydent': ['Incident', 'Vorfall'], 'Okno': ['Panel', 'Bereich'],
    'Wstrzyknięta awaria': ['Injected failure', 'Injizierte Störung'],
    // pasek sterowania
    'Odtwarzanie New Relic': ['New Relic replay', 'New-Relic-Wiedergabe'], '❚❚ Pauza': ['❚❚ Pause', '❚❚ Pause'], '▶ Wznów': ['▶ Resume', '▶ Fortsetzen'], '↻ Jeszcze raz': ['↻ Once more', '↻ Noch einmal'],
    '▶ Odtwórz': ['▶ Play', '▶ Abspielen'], '↺ Reset': ['↺ Reset', '↺ Zurücksetzen'], 'Symuluj dyżurnego': ['Simulate on-call engineer', 'Bereitschaftsdienst simulieren'],
    'Demo: pokaż prawdę z generatora': ['Demo: show ground truth from the generator', 'Demo: tatsächlichen Zustand aus dem Generator zeigen'],
    'Panel generatora: wstrzykiwanie awarii ↗': ['Generator panel: inject failures ↗', 'Generator-Panel: Störungen injizieren ↗'],
    // dashboard
    'Usługi wewnętrzne': ['Internal services', 'Interne Dienste'],
    'prawdziwe encje z New Relic: wartość (linia) i norma z tej samej pory doby (przerywana)': ['real New Relic entities: value (line) and the norm for the same time of day (dashed)', 'echte New-Relic-Entitäten: Wert (Linie) und Normalwert zur gleichen Tageszeit (gestrichelt)'],
    'symulacja z generatora awarii: ruch (linia) kontra oczekiwany z modelu historycznego (przerywana)': ['simulation from the failure generator: traffic (line) versus expected from the historical model (dashed)', 'Simulation aus dem Störungsgenerator: Traffic (Linie) gegenüber dem Erwartungswert des historischen Modells (gestrichelt)'],
    'statusy i awarie dostawców, sondy osiągalności': ['provider statuses and outages, reachability probes', 'Status und Ausfälle der Anbieter, Erreichbarkeitsprüfungen'],
    'Zgłoszenia i sygnały od użytkowników': ['User reports and signals', 'Meldungen und Signale von Nutzern'],
    'Generowane z prawdziwych sygnałów (wpływ na użytkowników). Eksport New Relic ich nie zawiera.': ['Generated from real signals (user impact). The New Relic export does not include them.', 'Aus echten Signalen erzeugt (Auswirkung auf Nutzer). Der New-Relic-Export enthält sie nicht.'],
    'Infolinia i Google Analytics z generatora awarii (symulacja).': ['Helpline and Google Analytics from the failure generator (simulation).', 'Hotline und Google Analytics aus dem Störungsgenerator (Simulation).'],
    'Źródła sygnałów': ['Signal sources', 'Signalquellen'], 'Dziennik powiadomień': ['Notification log', 'Benachrichtigungsprotokoll'], 'czas odtwarzania': ['replay time', 'Wiedergabezeit'], 'czas symulacji': ['simulation time', 'Simulationszeit'],
    'Centrum incydentów': ['Incident centre', 'Vorfallzentrale'], 'Brak otwartych incydentów': ['No open incidents', 'Keine offenen Vorfälle'],
    'Hub porównuje wszystkie źródła z normą i odezwie się, gdy coś się rozjedzie.': ['The Hub compares all sources with the norm and will speak up when something drifts.', 'Der Hub vergleicht alle Quellen mit dem Normalwert und meldet sich, wenn etwas abweicht.'],
    'Ostatnio zamknięte': ['Recently closed', 'Zuletzt geschlossen'], 'Waga': ['Severity', 'Schwere'], 'Od': ['Since', 'Seit'], 'Przyczyna': ['Cause', 'Ursache'], 'Do potwierdzenia': ['Time to acknowledge', 'Bis zur Bestätigung'],
    'Hipotezy przyczyny': ['Root-cause hypotheses', 'Ursachenhypothesen'], 'Szkic komunikatu dla interesariuszy': ['Draft message for stakeholders', 'Entwurf einer Mitteilung für Stakeholder'], 'kopiuj': ['copy', 'kopieren'],
    'Potwierdzam: zajmuję się tym': ["Acknowledge: I'm on it", 'Bestätigen: Ich kümmere mich darum'],
    'Wszystko w normie': ['Everything is normal', 'Alles im Normbereich'], 'Wszystko działa': ['Everything works', 'Alles funktioniert'], 'Awaria': ['Outage', 'Ausfall'], 'Problem': ['Problem', 'Problem'], 'Sygnały ustały': ['Signals have stopped', 'Signale sind abgeklungen'],
    'Podwyższona aktywność': ['Elevated activity', 'Erhöhte Aktivität'], 'otwarte incydenty': ['open incidents', 'offene Vorfälle'], 'zamknięte': ['closed', 'geschlossen'], 'kart poza normą': ['cards out of norm', 'Karten außerhalb der Norm'], 'usług z problemem': ['services with a problem', 'Dienste mit Problem'],
    'w normie': ['normal', 'im Normbereich'], 'poza normą': ['out of norm', 'außerhalb der Norm'], 'alarm': ['alarm', 'Alarm'], 'brak danych': ['no data', 'keine Daten'], 'działa': ['working', 'in Betrieb'], 'problem': ['problem', 'Problem'], 'awaria': ['outage', 'Ausfall'],
    'ALARM': ['ALARM', 'ALARM'], 'UWAGA': ['WATCH', 'ACHTUNG'], 'NIE ODPOWIADA': ['NOT RESPONDING', 'ANTWORTET NICHT'], 'skok zgłoszeń': ['spike in reports', 'sprunghafter Anstieg der Meldungen'], 'rosnące zgłoszenia': ['rising reports', 'steigende Meldungen'],
    'Infolinia': ['Helpline', 'Hotline'], 'zachowanie widzów': ['viewer behaviour', 'Zuschauerverhalten'], 'Brak powiadomień.': ['No notifications.', 'Keine Benachrichtigungen.'], 'Cisza. Wszystko w normie.': ['All quiet. Everything is normal.', 'Ruhe. Alles im Normbereich.'],
    'Aplikacje i serwery': ['Applications and servers', 'Anwendungen und Server'], 'Monitoring': ['Monitoring', 'Monitoring'], 'Dostawcy': ['Providers', 'Anbieter'], 'Analityka': ['Analytics', 'Analytik'], 'Model NR': ['NR model', 'NR-Modell'],
    'Serwery': ['Servers', 'Server'], 'Statusy': ['Statuses', 'Status'], 'Model': ['Model', 'Modell'],
    // statusy dostawców na żywo
    'Sprawny': ['Operational', 'In Betrieb'], 'Konserwacja': ['Maintenance', 'Wartung'], 'Pogorszenie': ['Degraded', 'Beeinträchtigt'], 'Awaria częściowa': ['Partial outage', 'Teilausfall'], 'Poważna awaria': ['Major outage', 'Schwerer Ausfall'], 'Sprawdzanie…': ['Checking…', 'Wird geprüft…'],
    'oficjalny status ↗': ['official status ↗', 'offizieller Status ↗'], 'Aktywne awarie i zdarzenia': ['Active outages and events', 'Aktive Ausfälle und Ereignisse'], '✓ Brak zgłoszonych awarii dostawców': ['✓ No provider outages reported', '✓ Keine gemeldeten Anbieterausfälle'],
    'przed chwilą': ['just now', 'gerade eben'], 'wyłączone': ['disabled', 'deaktiviert'], 'sprawdzanie…': ['checking…', 'wird geprüft…'], 'brak łączności hosta': ['host has no connectivity', 'Host ohne Verbindung'],
    // panel generatora
    'Platforma na żywo': ['Live platform', 'Plattform live'], 'Infolinia i analityka': ['Helpline and analytics', 'Hotline und Analytik'], 'Wstrzyknij awarię': ['Inject a failure', 'Störung injizieren'],
    'Gotowe scenariusze': ['Ready-made scenarios', 'Fertige Szenarien'], 'Aktywne awarie': ['Active failures', 'Aktive Störungen'], 'Kalendarz programu': ['Programme calendar', 'Programmkalender'], 'Zakończone': ['Finished', 'Beendet']
  };
  const sub = s => lookup(s) ?? s;
  const RULES = [
    [/^(\d+) z (\d+) poza normą$/, m => L(`${m[1]} of ${m[2]} out of norm`, `${m[1]} von ${m[2]} außerhalb der Norm`)],
    [/^(\d+) z (\d+) w normie$/, m => L(`${m[1]} of ${m[2]} normal`, `${m[1]} von ${m[2]} im Normbereich`)],
    [/^(\d+) z (\d+) sprawnych$/, m => L(`${m[1]} of ${m[2]} operational`, `${m[1]} von ${m[2]} in Betrieb`)],
    [/^(\d+) z (\d+) z awarią$/, m => L(`${m[1]} of ${m[2]} with an outage`, `${m[1]} von ${m[2]} mit Ausfall`)],
    [/^(\d+) z (\d+) z pogorszeniem$/, m => L(`${m[1]} of ${m[2]} degraded`, `${m[1]} von ${m[2]} beeinträchtigt`)],
    [/^(\d+) z (\d+) działa$/, m => L(`${m[1]} of ${m[2]} working`, `${m[1]} von ${m[2]} in Betrieb`)],
    [/^(\d+) z (\d+) z problemem$/, m => L(`${m[1]} of ${m[2]} with a problem`, `${m[1]} von ${m[2]} mit Problem`)],
    [/^(\d+) s temu$/, m => L(`${m[1]} s ago`, `vor ${m[1]} s`)],
    [/^Incydent #(\d+)$/, m => L(`Incident #${m[1]}`, `Vorfall #${m[1]}`)],
    [/^Incydent #(\d+) \(zamknięty\)$/, m => L(`Incident #${m[1]} (closed)`, `Vorfall #${m[1]} (geschlossen)`)]
  ];
  function lookup(key) {
    if (D[key]) return D[key][I];
    for (const [re, fn] of RULES) { const m = key.match(re); if (m) return fn(m); }
    return null;
  }
  function T(raw) {
    if (LANG === 'pl' || raw == null) return raw;
    const s = String(raw), key = s.replace(/\s+/g, ' ').trim();
    if (!key) return s;
    const out = lookup(key);
    return out == null ? s : s.match(/^\s*/)[0] + out + s.match(/\s*$/)[0];
  }
  window.IH_T = T;
  if (LANG === 'pl') return;

  const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'TEXTAREA']), ATTRS = ['placeholder', 'title', 'aria-label'];
  const done = new WeakMap(), doneAttr = new WeakMap();   // nie tłumaczymy drugi raz tego, co już przetłumaczone
  function walk(node) {
    if (node.nodeType === 3) {
      const p = node.parentNode;
      if (!p || SKIP.has(p.nodeName) || done.get(node) === node.nodeValue) return;
      const t = T(node.nodeValue);
      if (t !== node.nodeValue) { done.set(node, t); node.nodeValue = t; }
      return;
    }
    if (node.nodeType !== 1 || SKIP.has(node.nodeName)) return;
    for (const a of ATTRS) {
      if (!node.hasAttribute(a)) continue;
      const v = node.getAttribute(a), seen = doneAttr.get(node) || {};
      if (seen[a] === v) continue;
      const t = T(v);
      if (t !== v) { seen[a] = t; doneAttr.set(node, seen); node.setAttribute(a, t); }
    }
    for (const c of node.childNodes) walk(c);
  }
  new MutationObserver(muts => { for (const m of muts) { if (m.type === 'childList') m.addedNodes.forEach(walk); else walk(m.target); } })
    .observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  const start = () => walk(document.body);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
