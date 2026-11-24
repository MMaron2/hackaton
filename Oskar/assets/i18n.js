// Języki: polski (źródłowy), angielski, niemiecki.
// Teksty na stronie są pisane po polsku; ten moduł tłumaczy je w locie (słownik + reguły dla tekstów z liczbami),
// także te dopisywane później przez skrypty (MutationObserver). Brak wpisu w słowniku = tekst zostaje po polsku.
// Wybór języka: localStorage "pw_lang" (pl | en | de), zmiana przeładowuje stronę.
(function () {
  const saved = localStorage.getItem("pw_lang");
  const LANG = ["pl", "en", "de"].includes(saved) ? saved : "pl";
  window.LANG = LANG;
  window.LOCALE = { pl: "pl-PL", en: "en-GB", de: "de-DE" }[LANG];   // format dat i liczb
  document.documentElement.lang = LANG;
  const I = LANG === "en" ? 0 : 1;
  const L = (en, de) => (I === 0 ? en : de);

  // polski → [angielski, niemiecki]
  const D = {
    // --- nagłówek, menu, stopka ---
    "Monitoring awarii i degradacji usług": ["Outage and service degradation monitoring", "Überwachung von Ausfällen und Dienststörungen"],
    "Monitoring awarii i degradacji usług.": ["Outage and service degradation monitoring.", "Überwachung von Ausfällen und Dienststörungen."],
    "Dane:": ["Data:", "Daten:"],
    "· Aktualizacja:": ["· Updated:", "· Aktualisiert:"],
    "PLACEHOLDER (Snowflake niepodłączony)": ["PLACEHOLDER (Snowflake not connected)", "PLATZHALTER (Snowflake nicht verbunden)"],
    "Szukaj usługi lub incydentu": ["Search service or incident", "Dienst oder Vorfall suchen"],
    "Zaloguj": ["Log in", "Anmelden"],
    "Zgłoś incydent": ["Report incident", "Vorfall melden"],
    "Powiadomienia": ["Notifications", "Benachrichtigungen"],
    "Oznacz jako przeczytane": ["Mark as read", "Als gelesen markieren"],
    "Włącz powiadomienia przeglądarki": ["Enable browser notifications", "Browser-Benachrichtigungen aktivieren"],
    "Brak powiadomień": ["No notifications", "Keine Benachrichtigungen"],
    "Przeglądarka: włączone": ["Browser: enabled", "Browser: aktiviert"],
    "Przeglądarka: zablokowane": ["Browser: blocked", "Browser: blockiert"],
    "Przełącz na tryb ciemny": ["Switch to dark mode", "Zum dunklen Modus wechseln"],
    "Przełącz na tryb jasny": ["Switch to light mode", "Zum hellen Modus wechseln"],
    "Przegląd": ["Overview", "Übersicht"], "Usługi": ["Services", "Dienste"], "Vendorzy": ["Vendors", "Anbieter"],
    "Obserwowane": ["Watchlist", "Beobachtet"], "Eventy": ["Events", "Events"], "Incydenty": ["Incidents", "Vorfälle"], "Model": ["Model", "Modell"],
    "Działy": ["Sections", "Bereiche"],
    "Created using Anthropic Claude – wersja robocza, do weryfikacji przez człowieka przed użyciem poza środowiskiem wewnętrznym.": [
      "Created using Anthropic Claude – draft, to be reviewed by a human before use outside the internal environment.",
      "Created using Anthropic Claude – Entwurf, vor der Verwendung außerhalb der internen Umgebung von einem Menschen zu prüfen."],
    // --- wyszukiwarka ---
    "Strona": ["Page", "Seite"], "Usługa": ["Service", "Dienst"], "Incydent": ["Incident", "Vorfall"], "Vendor": ["Vendor", "Anbieter"],
    "Kanał": ["Channel", "Sender"], "Święto": ["Holiday", "Feiertag"], "Event": ["Event", "Event"], "Historia": ["History", "Verlauf"],
    // --- statusy i odznaki ---
    "Działa": ["Operational", "In Betrieb"], "Degradacja": ["Degraded", "Beeinträchtigt"], "Awaria": ["Outage", "Ausfall"],
    "Brak danych": ["No data", "Keine Daten"], "Nie działa": ["Down", "Ausgefallen"], "Częściowa awaria": ["Partial outage", "Teilausfall"],
    "Prace serwisowe": ["Maintenance", "Wartung"], "Wysokie": ["High", "Hoch"], "Podwyższone": ["Elevated", "Erhöht"],
    "Krytyczne": ["Critical", "Kritisch"], "Do sprawdzenia": ["To check", "Zu prüfen"], "Wszystko działa": ["All systems working", "Alles funktioniert"],
    "Krytyczny": ["Critical", "Kritisch"], "Bez wpływu": ["No impact", "Keine Auswirkung"], "Niski wpływ": ["Low impact", "Geringe Auswirkung"], "Wysoki wpływ": ["High impact", "Hohe Auswirkung"],
    "Rozwiązany": ["Resolved", "Behoben"], "Badany": ["Investigating", "Wird untersucht"], "Zidentyfikowany": ["Identified", "Identifiziert"],
    "Monitorowany": ["Monitoring", "Wird beobachtet"], "Podsumowanie": ["Postmortem", "Nachbetrachtung"], "Aktualizacja": ["Update", "Aktualisierung"],
    "Zaplanowany": ["Scheduled", "Geplant"], "W toku": ["In progress", "Läuft"], "Zakończony": ["Completed", "Abgeschlossen"],
    "trwa": ["ongoing", "läuft"], "teraz": ["now", "jetzt"], "nasz region": ["our region", "unsere Region"],
    "Normalnie": ["Normal", "Normal"], "Wzrost zgłoszeń": ["Rise in reports", "Anstieg der Meldungen"], "Możliwa awaria": ["Possible outage", "Möglicher Ausfall"],
    // --- Przegląd ---
    "Wymaga uwagi": ["Needs attention", "Erfordert Aufmerksamkeit"],
    "Brak usterek – monitorowane usługi działają prawidłowo.": ["No faults – monitored services are working correctly.", "Keine Störungen – die überwachten Dienste funktionieren einwandfrei."],
    "Ryzyko awarii (30 min)": ["Outage risk (30 min)", "Ausfallrisiko (30 Min.)"], "max z wszystkich usług": ["max across all services", "Maximum aller Dienste"],
    "Aktywne alerty": ["Active alerts", "Aktive Warnungen"], "prognozy powyżej progu": ["forecasts above threshold", "Prognosen über dem Schwellenwert"],
    "Średni MTTD": ["Average MTTD", "Durchschnittliche MTTD"], "przed vs po wdrożeniu modelu": ["before vs after model rollout", "vor vs. nach Einführung des Modells"],
    "Nadchodzący event": ["Upcoming event", "Bevorstehendes Event"], "czas do startu": ["time to start", "Zeit bis zum Start"],
    "Eurosport 1 – transmisja live": ["Eurosport 1 – live broadcast", "Eurosport 1 – Live-Übertragung"],
    "KRYTYCZNE": ["CRITICAL", "KRITISCH"], "PODWYŻSZONE": ["ELEVATED", "ERHÖHT"], "NISKIE": ["LOW", "NIEDRIG"], "DO REAKCJI": ["ACTION NEEDED", "HANDLUNGSBEDARF"],
    "BRAK": ["NONE", "KEINE"], "W NORMIE": ["NORMAL", "IM NORMBEREICH"], "WYMAGA UWAGI": ["NEEDS ATTENTION", "PRÜFEN"], "ZA DŁUGO": ["TOO LONG", "ZU LANG"],
    "NA ŻYWO": ["LIVE", "LIVE"], "WKRÓTCE": ["SOON", "BALD"], "TRWA": ["LIVE", "LÄUFT"],
    "Top 5 kanałów na żywo": ["Top 5 live channels", "Top 5 Live-Sender"],
    "ostatnie 3 h, kropka = szczyt oglądalności": ["last 3 h, dot = viewership peak", "letzte 3 Std., Punkt = Zuschauerspitze"],
    "Prognoza ryzyka w czasie": ["Risk forecast over time", "Risikoprognose im Zeitverlauf"],
    "Wykres liniowy: ryzyko awarii vs czas (+ markery eventów i incydentów)": ["Line chart: outage risk vs time (+ event and incident markers)", "Liniendiagramm: Ausfallrisiko im Zeitverlauf (+ Markierungen für Events und Vorfälle)"],
    "Ryzyko per usługa": ["Risk per service", "Risiko pro Dienst"], "Heatmapa / ranking usług": ["Heatmap / service ranking", "Heatmap / Dienst-Ranking"],
    "Ruch / liczba widzów": ["Traffic / viewers", "Traffic / Zuschauerzahl"], "Wykres metryki": ["Metric chart", "Metrikdiagramm"],
    // --- alerty (dane przykładowe i pochodne) ---
    "Wysokie ryzyko: Streaming / CDN": ["High risk: Streaming / CDN", "Hohes Risiko: Streaming / CDN"],
    "Prognoza 72% w ciągu 30 min. Rosnący ruch na TVN24.": ["Forecast 72% within 30 min. Rising traffic on TVN24.", "Prognose 72 % innerhalb von 30 Min. Steigender Traffic bei TVN24."],
    "Wzrost latency p95: Autoryzacja": ["Latency p95 increase: Authentication", "Anstieg der p95-Latenz: Authentifizierung"],
    "Latency +35% względem normy dla tej godziny.": ["Latency +35% versus the norm for this hour.", "Latenz +35 % gegenüber dem Normalwert für diese Uhrzeit."],
    "Nadchodzący event za 2 h 15 min": ["Upcoming event in 2 h 15 min", "Bevorstehendes Event in 2 Std. 15 Min."],
    "Spodziewany wzrost ruchu na Eurosport 1.": ["Traffic increase expected on Eurosport 1.", "Erwarteter Traffic-Anstieg bei Eurosport 1."],
    "Pik oglądalności: TVN24": ["Viewership spike: TVN24", "Zuschauerspitze: TVN24"], "Obciążenie CDN przekroczyło 85%.": ["CDN load exceeded 85%.", "CDN-Auslastung hat 85 % überschritten."],
    "Player: niski bitrate": ["Player: low bitrate", "Player: niedrige Bitrate"], "Player: wysoki odsetek błędów": ["Player: high error rate", "Player: hohe Fehlerquote"],
    // --- usługi, incydenty ---
    "Stan usług": ["Service status", "Dienststatus"], "Ryzyko (30 min)": ["Risk (30 min)", "Risiko (30 Min.)"], "Główny czynnik": ["Main factor", "Hauptfaktor"],
    "Ryzyko usługi w czasie": ["Service risk over time", "Dienstrisiko im Zeitverlauf"], "Wykres po wybraniu usługi": ["Chart after selecting a service", "Diagramm nach Auswahl eines Dienstes"],
    "Zależności usług": ["Service dependencies", "Dienstabhängigkeiten"], "Graf zależności (CDN → origin → auth …)": ["Dependency graph (CDN → origin → auth …)", "Abhängigkeitsgraph (CDN → Origin → Auth …)"],
    "Autoryzacja (login)": ["Authentication (login)", "Authentifizierung (Login)"], "Autoryzacja": ["Authentication", "Authentifizierung"],
    "Koszyk / płatności": ["Cart / payments", "Warenkorb / Zahlungen"], "Wyszukiwarka": ["Search", "Suche"],
    "Rosnący ruch przed eventem": ["Rising traffic before the event", "Steigender Traffic vor dem Event"], "Wzrost latency p95": ["Latency p95 increase", "Anstieg der p95-Latenz"],
    "Historia incydentów": ["Incident history", "Vorfallverlauf"], "Wykrycie": ["Detected", "Erkannt"], "Wykryłby model?": ["Would the model detect it?", "Hätte das Modell es erkannt?"],
    "nie": ["no", "nein"], "Odtworzenie incydentu (replay)": ["Incident replay", "Vorfall-Wiedergabe (Replay)"],
    "Odtwarzacz historycznego incydentu: moment alarmu modelu vs zgłoszenia użytkowników": ["Historical incident player: model alert time vs user reports", "Wiedergabe eines früheren Vorfalls: Zeitpunkt des Modellalarms vs. Nutzermeldungen"],
    // --- Player ---
    "Telemetria playera": ["Player telemetry", "Player-Telemetrie"], "czas buforowania / czas oglądania": ["buffering time / watch time", "Pufferzeit / Wiedergabezeit"],
    "kliknięcie play → pierwsza klatka": ["play click → first frame", "Klick auf Play → erstes Bild"], "Śr. bitrate": ["Avg. bitrate", "Ø Bitrate"],
    "Błędy odtwarzania": ["Playback errors", "Wiedergabefehler"], "% sesji z błędem": ["% of sessions with an error", "% der Sitzungen mit Fehler"],
    "Aktywne sesje": ["Active sessions", "Aktive Sitzungen"], "równoległych widzów": ["concurrent viewers", "gleichzeitige Zuschauer"],
    "Podgląd playera": ["Player preview", "Player-Vorschau"], "źródło: telemetria playera": ["source: player telemetry", "Quelle: Player-Telemetrie"],
    "Tu można osadzić prawdziwy player (np. hls.js / Shaka / Video.js) i zbierać zdarzenia:": ["A real player (e.g. hls.js / Shaka / Video.js) can be embedded here to collect events:", "Hier kann ein echter Player (z. B. hls.js / Shaka / Video.js) eingebettet werden, um Ereignisse zu erfassen:"],
    ", zmiany jakości.": [", quality changes.", ", Qualitätswechsel."], "Zdarzenia playera (live)": ["Player events (live)", "Player-Ereignisse (live)"],
    "Rebuffering w czasie": ["Rebuffering over time", "Rebuffering im Zeitverlauf"], "Bitrate / zmiany jakości": ["Bitrate / quality changes", "Bitrate / Qualitätswechsel"],
    "Błędy wg CDN / regionu / urządzenia": ["Errors by CDN / region / device", "Fehler nach CDN / Region / Gerät"], "Wykres": ["Chart", "Diagramm"], "Wykres": ["Chart", "Diagramm"],
    // --- Model ---
    "Model predykcyjny": ["Predictive model", "Vorhersagemodell"], "Krzywa PR": ["PR curve", "PR-Kurve"], "Ważność cech": ["Feature importance", "Merkmalswichtigkeit"],
    "Lead time alarmów": ["Alert lead time", "Vorlaufzeit der Alarme"], "Histogram: ile minut przed incydentem": ["Histogram: minutes before the incident", "Histogramm: Minuten vor dem Vorfall"],
    "Miejsce na dowolną aplikację webową": ["Space for any web application", "Platz für eine beliebige Webanwendung"],
    "Wstaw tutaj iframe (Streamlit / Grafana / Power BI)": ["Insert an iframe here (Streamlit / Grafana / Power BI)", "Hier ein iframe einfügen (Streamlit / Grafana / Power BI)"],
    // --- Vendorzy ---
    "Status serwisów": ["Service status", "Dienststatus"], "Dostawcy": ["Providers", "Anbieter"],
    "Lista sortowana alfabetycznie. Rozwiń dostawcę, aby zobaczyć aktywne problemy z opisem od vendora oraz historię.": ["The list is sorted alphabetically. Expand a provider to see active issues with the vendor's description and the history.", "Die Liste ist alphabetisch sortiert. Klappen Sie einen Anbieter auf, um aktive Probleme mit der Beschreibung des Anbieters und den Verlauf zu sehen."],
    "brak aktywnych problemów": ["no active issues", "keine aktiven Probleme"], "Brak aktywnych problemów.": ["No active issues.", "Keine aktiven Probleme."],
    "Otwórz u vendora ↗": ["Open at vendor ↗", "Beim Anbieter öffnen ↗"], "Ładowanie historii…": ["Loading history…", "Verlauf wird geladen…"],
    "Strona statusu vendora ↗": ["Vendor status page ↗", "Statusseite des Anbieters ↗"], "Pełna historia u vendora ↗": ["Full history at vendor ↗", "Vollständiger Verlauf beim Anbieter ↗"],
    "Pełna historia w Downdetector ↗": ["Full history on Downdetector ↗", "Vollständiger Verlauf bei Downdetector ↗"],
    "Szukaj w historii": ["Search history", "Verlauf durchsuchen"],
    "Szukaj w historii (nazwa, opis, data)…": ["Search history (name, description, date)…", "Verlauf durchsuchen (Name, Beschreibung, Datum)…"],
    "Brak zdarzeń pasujących do zapytania.": ["No events match the query.", "Keine Ereignisse passen zur Suchanfrage."], "Brak zdarzeń w historii.": ["No events in the history.", "Keine Ereignisse im Verlauf."],
    "Pobieranie statusu…": ["Fetching status…", "Status wird abgerufen…"], "Brak źródła statusu.": ["No status source.", "Keine Statusquelle."], "Brak źródła historii.": ["No history source.", "Keine Verlaufsquelle."],
    "Brak aktywnych incydentów Azure.": ["No active Azure incidents.", "Keine aktiven Azure-Vorfälle."], "Brak aktywnych incydentów Google Cloud.": ["No active Google Cloud incidents.", "Keine aktiven Google-Cloud-Vorfälle."],
    "Nie udało się pobrać statusu (blokada CORS lub brak sieci). Uruchom stronę przez start-server.cmd, aby użyć lokalnego proxy.": ["Could not fetch the status (CORS block or no network). Start the site via start-server.cmd to use the local proxy.", "Der Status konnte nicht abgerufen werden (CORS-Sperre oder kein Netzwerk). Starten Sie die Seite über start-server.cmd, um den lokalen Proxy zu nutzen."],
    "Brak publicznego API statusu (status.okta.com wymaga logowania) – użyj własnych health-checków.": ["No public status API (status.okta.com requires login) – use your own health checks.", "Keine öffentliche Status-API (status.okta.com erfordert Anmeldung) – eigene Health-Checks verwenden."],
    "Nie udało się pobrać historii z przeglądarki (blokada CORS lub brak sieci) – wymaga proxy po stronie serwera.": ["Could not fetch the history from the browser (CORS block or no network) – a server-side proxy is required.", "Der Verlauf konnte nicht im Browser abgerufen werden (CORS-Sperre oder kein Netzwerk) – ein serverseitiger Proxy ist erforderlich."],
    "Kanał RSS Azure zawiera tylko aktywne incydenty – starsze są na stronie historii Azure.": ["The Azure RSS feed contains only active incidents – older ones are on the Azure history page.", "Der Azure-RSS-Feed enthält nur aktive Vorfälle – ältere stehen auf der Azure-Verlaufsseite."],
    "Azure (usługi chmurowe)": ["Azure (cloud services)", "Azure (Cloud-Dienste)"], "GCP (usługi chmurowe)": ["GCP (cloud services)", "GCP (Cloud-Dienste)"],
    "CDN (dostarczanie wideo)": ["CDN (video delivery)", "CDN (Videoauslieferung)"], "Hurtownia danych": ["Data warehouse", "Data Warehouse"], "Logowanie (SSO)": ["Login (SSO)", "Anmeldung (SSO)"],
    "Dane symulowane – Downdetector nie ma publicznego API. Podłącz własne źródło przez": ["Simulated data – Downdetector has no public API. Connect your own source via", "Simulierte Daten – Downdetector hat keine öffentliche API. Eigene Quelle anbinden über"],
    "w": ["in", "in"],
    "Zgłoszenia użytkowników": ["User reports", "Nutzermeldungen"], "Otwórz Downdetector ↗": ["Open Downdetector ↗", "Downdetector öffnen ↗"],
    // --- Obserwowane ---
    "Kanały": ["Channels", "Sender"], "Eventy i święta": ["Events and holidays", "Events und Feiertage"], "＋ Dodaj": ["＋ Add", "＋ Hinzufügen"], "Szukaj…": ["Search…", "Suchen…"],
    "Nic nie przypięto – kliknij „＋ Dodaj\".": ["Nothing pinned – click “＋ Add”.", "Nichts angeheftet – klicken Sie auf „＋ Hinzufügen“."],
    "Brak wyników.": ["No results.", "Keine Ergebnisse."], "Brak wyników": ["No results", "Keine Ergebnisse"], "Odepnij": ["Unpin", "Lösen"],
    "Wybór jest zapamiętywany w tej przeglądarce (localStorage). Kliknij „＋ Dodaj\", aby przypiąć pozycje. Krzyżyk przy pozycji ją odpina.": ["Your selection is saved in this browser (localStorage). Click “＋ Add” to pin items. The cross next to an item unpins it.", "Die Auswahl wird in diesem Browser gespeichert (localStorage). Klicken Sie auf „＋ Hinzufügen“, um Einträge anzuheften. Das Kreuz neben einem Eintrag löst ihn."],
    "Rozwiń wiersz vendora, aby zobaczyć opis problemu.": ["Expand the vendor row to see the issue description.", "Klappen Sie die Anbieterzeile auf, um die Problembeschreibung zu sehen."],
    "Obserwowani vendorzy działają prawidłowo": ["Watched vendors are working correctly", "Die beobachteten Anbieter funktionieren einwandfrei"],
    "Brak danych live (kanał poza Top 5 ruchu)": ["No live data (channel outside the traffic Top 5)", "Keine Live-Daten (Sender außerhalb der Traffic-Top-5)"],
    "dziś": ["today", "heute"], "jutro": ["tomorrow", "morgen"],
    // --- Eventy i kalendarz ---
    "Eventy i kalendarz": ["Events and calendar", "Events und Kalender"], "Kalendarz na kolejne 3 miesiące (święta i eventy)": ["Calendar for the next 3 months (holidays and events)", "Kalender für die nächsten 3 Monate (Feiertage und Events)"],
    "Wpływ eventów na ruch": ["Impact of events on traffic", "Einfluss von Events auf den Traffic"],
    "Ruch w trakcie eventów i dni wolnych vs baseline": ["Traffic during events and public holidays vs baseline", "Traffic während Events und Feiertagen vs. Baseline"],
    "Szukaj eventu lub święta (nazwa albo data, np. 24.12)…": ["Search event or holiday (name or date, e.g. 24.12)…", "Event oder Feiertag suchen (Name oder Datum, z. B. 24.12)…"],
    "Dzień wolny (święto)": ["Public holiday", "Gesetzlicher Feiertag"], "Dzień wolny": ["Public holiday", "Gesetzlicher Feiertag"], "Obchody": ["Observance", "Gedenktag"],
    "Weekend": ["Weekend", "Wochenende"], "Dziś": ["Today", "Heute"],
    "Data": ["Date", "Datum"], "Dzień": ["Day", "Tag"], "Nazwa": ["Name", "Name"], "Rodzaj": ["Type", "Art"], "Prognoza ruchu": ["Traffic forecast", "Traffic-Prognose"],
    "Podwyższony ruch (dzień wolny)": ["Higher traffic (public holiday)", "Erhöhter Traffic (Feiertag)"], "Normalny": ["Normal", "Normal"],
    "Pn": ["Mo", "Mo"], "Wt": ["Tu", "Di"], "Śr": ["We", "Mi"], "Cz": ["Th", "Do"], "Pt": ["Fr", "Fr"], "So": ["Sa", "Sa"], "Nd": ["Su", "So"],
    "Nowy Rok": ["New Year's Day", "Neujahr"], "Trzech Króli": ["Epiphany", "Heilige Drei Könige"], "Wielkanoc": ["Easter Sunday", "Ostersonntag"],
    "Poniedziałek Wielkanocny": ["Easter Monday", "Ostermontag"], "Pon. Wielkanocny": ["Easter Monday", "Ostermontag"], "Święto Pracy": ["Labour Day", "Tag der Arbeit"],
    "Święto Konstytucji 3 Maja": ["Constitution Day (3 May)", "Tag der Verfassung (3. Mai)"], "3 Maja": ["3 May", "3. Mai"], "Zielone Świątki": ["Pentecost", "Pfingstsonntag"],
    "Boże Ciało": ["Corpus Christi", "Fronleichnam"], "Wniebowzięcie NMP": ["Assumption of Mary", "Mariä Himmelfahrt"], "15 Sierpnia": ["15 August", "15. August"],
    "Wszystkich Świętych": ["All Saints' Day", "Allerheiligen"], "Narodowe Święto Niepodległości": ["Independence Day", "Unabhängigkeitstag"], "11 Listopada": ["11 November", "11. November"],
    "Wigilia Bożego Narodzenia": ["Christmas Eve", "Heiligabend"], "Wigilia": ["Christmas Eve", "Heiligabend"], "Boże Narodzenie": ["Christmas Day", "1. Weihnachtstag"],
    "Drugi dzień Bożego Narodzenia": ["Second Day of Christmas", "2. Weihnachtstag"], "Św. Szczepana": ["St Stephen's Day", "Stephanstag"],
    "Tłusty Czwartek": ["Fat Thursday", "Fetter Donnerstag"], "Środa Popielcowa": ["Ash Wednesday", "Aschermittwoch"], "Dzień Babci": ["Grandmother's Day", "Tag der Großmutter"],
    "Dzień Dziadka": ["Grandfather's Day", "Tag des Großvaters"], "Walentynki": ["Valentine's Day", "Valentinstag"], "Mikołajki": ["St Nicholas Day", "Nikolaustag"], "Sylwester": ["New Year's Eve", "Silvester"],
    "Event sportowy (przykład)": ["Sports event (example)", "Sportevent (Beispiel)"], "Event sportowy": ["Sports event", "Sportevent"],
    "Transmisja sylwestrowa (przykład)": ["New Year's Eve broadcast (example)", "Silvester-Übertragung (Beispiel)"], "Transmisja sylwestrowa": ["New Year's Eve broadcast", "Silvester-Übertragung"],
    "Turniej tenisowy – start (przykład)": ["Tennis tournament – start (example)", "Tennisturnier – Start (Beispiel)"], "Turniej tenisowy – start": ["Tennis tournament – start", "Tennisturnier – Start"],
    "Finał ligi (przykład)": ["League final (example)", "Ligafinale (Beispiel)"], "Finał ligi": ["League final", "Ligafinale"],
    "Spodziewany duży ruch na kanałach sportowych": ["High traffic expected on sports channels", "Hoher Traffic auf Sportsendern erwartet"], "Szczyt ruchu około północy": ["Traffic peak around midnight", "Traffic-Spitze um Mitternacht"],
    "Wzrost ruchu na Eurosport 1": ["Traffic increase on Eurosport 1", "Traffic-Anstieg bei Eurosport 1"], "Szczyt ruchu wieczorem": ["Traffic peak in the evening", "Traffic-Spitze am Abend"]
  };

  const MONTHS = { "Styczeń": ["January", "Januar"], "Luty": ["February", "Februar"], "Marzec": ["March", "März"], "Kwiecień": ["April", "April"], "Maj": ["May", "Mai"], "Czerwiec": ["June", "Juni"],
    "Lipiec": ["July", "Juli"], "Sierpień": ["August", "August"], "Wrzesień": ["September", "September"], "Październik": ["October", "Oktober"], "Listopad": ["November", "November"], "Grudzień": ["December", "Dezember"] };
  const CATS = { "Brak połączenia": ["No connection", "Keine Verbindung"], "Logowanie": ["Login", "Anmeldung"], "Strona / aplikacja": ["Website / app", "Website / App"], "Serwer": ["Server", "Server"],
    "Powolne działanie": ["Slow performance", "Langsame Leistung"], "Streaming": ["Streaming", "Streaming"] };
  const N = "([\\d.,\\s\\u00a0\\u202f]+)";   // liczba w dowolnym formacie lokalnym
  const sub = s => lookup(s) ?? s;

  // Teksty z liczbami i nazwami: wyrażenie → funkcja zwracająca tłumaczenie
  const RULES = [
    [/^InfoHub – (.+)$/, m => `InfoHub – ${sub(m[1])}`],
    [/^(\d+) krytyczne$/, m => L(`${m[1]} critical`, `${m[1]} kritisch`)],
    [/^(\d+) do sprawdzenia$/, m => L(`${m[1]} to check`, `${m[1]} zu prüfen`)],
    [/^(.+) temu$/, m => L(`${m[1]} ago`, `vor ${m[1]}`)],
    [new RegExp(`^szczyt ${N} \\((.+)\\)$`), m => L(`peak ${m[1].trim()} (${sub(m[2])})`, `Spitze ${m[1].trim()} (${sub(m[2])})`)],
    [/^od (.+) \((.+) temu\)$/, m => L(`since ${m[1]} (${m[2]} ago)`, `seit ${m[1]} (vor ${m[2]})`)],
    [/^\(od (.+)\)$/, m => L(`(for ${m[1]})`, `(seit ${m[1]})`)],
    [/^(\d+) aktywn(?:y problem|e problemy|ych problemów)$/, m => L(m[1] === "1" ? "1 active issue" : `${m[1]} active issues`, m[1] === "1" ? "1 aktives Problem" : `${m[1]} aktive Probleme`)],
    [/^(\d+) z aktywnymi problemami$/, m => L(`${m[1]} with active issues`, `${m[1]} mit aktiven Problemen`)],
    [/^Aktywne problemy \((\d+)\)$/, m => L(`Active issues (${m[1]})`, `Aktive Probleme (${m[1]})`)],
    [/^(Serwisy|Regiony\/usługi z ostatnich zdarzeń): (\d+) z problemami, (\d+) działa$/, m => {
      const what = m[1] === "Serwisy" ? L("Services", "Dienste") : L("Regions/services from recent events", "Regionen/Dienste aus letzten Ereignissen");
      return L(`${what}: ${m[2]} with issues, ${m[3]} operational`, `${what}: ${m[2]} mit Problemen, ${m[3]} in Betrieb`); }],
    [/^…i (\d+) więcej \(pełna lista na stronie statusu\)$/, m => L(`…and ${m[1]} more (full list on the status page)`, `…und ${m[1]} weitere (vollständige Liste auf der Statusseite)`)],
    [/^(\d+) z (\d+) pasuje$/, m => L(`${m[1]} of ${m[2]} match`, `${m[1]} von ${m[2]} passen`)],
    [/^(\d+) z (\d+)$/, m => L(`${m[1]} of ${m[2]}`, `${m[1]} von ${m[2]}`)],
    [/^Pokaż starsze \(\+(\d+)\)$/, m => L(`Show older (+${m[1]})`, `Ältere anzeigen (+${m[1]})`)],
    [/^trwał (.+)$/, m => L(`lasted ${m[1]}`, `Dauer ${m[1]}`)],
    [/^Brak aktywnych zdarzeń w regionach: (.+)\.$/, m => L(`No active events in regions: ${m[1]}.`, `Keine aktiven Ereignisse in den Regionen: ${m[1]}.`)],
    [/^(.+) nie działa$/, m => L(`${m[1]} is down`, `${m[1]} ist ausgefallen`)],
    [/^(.+) – degradacja$/, m => L(`${m[1]} – degraded`, `${m[1]} – beeinträchtigt`)],
    [/^Średni bitrate ([\d.,]+) Mbps \(próg (\d+) Mbps\)\.$/, m => L(`Average bitrate ${m[1]} Mbps (threshold ${m[2]} Mbps).`, `Durchschnittliche Bitrate ${m[1]} Mbps (Schwellenwert ${m[2]} Mbps).`)],
    [/^([\d.,]+)% sesji z błędem odtwarzania\.$/, m => L(`${m[1]}% of sessions with a playback error.`, `${m[1]} % der Sitzungen mit Wiedergabefehler.`)],
    [/^ryzyko (\d+)%$/, m => L(`risk ${m[1]}%`, `Risiko ${m[1]} %`)],
    [new RegExp(`^${N} widzów live$`), m => L(`${m[1].trim()} live viewers`, `${m[1].trim()} Live-Zuschauer`)],
    [new RegExp(`^${N} widzów$`), m => L(`${m[1].trim()} viewers`, `${m[1].trim()} Zuschauer`)],
    [/^(Styczeń|Luty|Marzec|Kwiecień|Maj|Czerwiec|Lipiec|Sierpień|Wrzesień|Październik|Listopad|Grudzień) (\d{4})$/, m => `${MONTHS[m[1]][I]} ${m[2]}`],
    [/^· aktualizacja (.+)$/, m => L(`· updated ${m[1]}`, `· aktualisiert ${m[1]}`)],
    [/^Znaleziono: (\d+)$/, m => L(`Found: ${m[1]}`, `Gefunden: ${m[1]}`)],
    [/^Brak wyników dla „(.*)"$/, m => L(`No results for “${m[1]}”`, `Keine Ergebnisse für „${m[1]}“`)],
    [/^za (\d+) dni$/, m => L(`in ${m[1]} days`, `in ${m[1]} Tagen`)],
    [/^(\d+) z obserwowanych vendorów ma problemy$/, m => L(`${m[1]} of the watched vendors have issues`, `${m[1]} der beobachteten Anbieter haben Probleme`)],
    [/^tak \(\+(\d+) min\)$/, m => L(`yes (+${m[1]} min)`, `ja (+${m[1]} Min.)`)],
    [/^Wyraźny wzrost zgłoszeń użytkowników względem normy\. Najczęściej zgłaszane problemy: (.+)\.$/, m => {
      const cats = m[1].replace(/([^,(]+?) \((\d+)%\)/g, (x, n, p) => `${(CATS[n.trim()] || [n, n])[I]} (${p}%)`);
      return L(`Clear rise in user reports versus the norm. Most reported problems: ${cats}.`, `Deutlicher Anstieg der Nutzermeldungen gegenüber dem Normalwert. Am häufigsten gemeldete Probleme: ${cats}.`); }],
    // „Komponent. Notatka" w treści alertów o vendorach
    [/^([^.]+(?:\([^)]*\))?)\. (.+)$/, m => (D[m[1]] ? `${D[m[1]][I]}. ${sub(m[2])}` : null)]
  ];

  function lookup(key) {
    if (D[key]) return D[key][I];
    for (const [re, fn] of RULES) { const m = key.match(re); if (m) { const out = fn(m); if (out != null) return out; } }
    if (key.startsWith("· ")) { const r = lookup(key.slice(2)); if (r != null) return "· " + r; }
    if (key.includes(" · ")) {
      const parts = key.split(" · "), tp = parts.map(sub);
      if (tp.some((p, k) => p !== parts[k])) return tp.join(" · ");
    }
    return null;
  }

  // T(tekst po polsku) → tekst w wybranym języku (z zachowaniem odstępów na brzegach)
  function T(raw) {
    if (LANG === "pl" || raw == null) return raw;
    const s = String(raw), key = s.replace(/\s+/g, " ").trim();
    if (!key) return s;
    const out = lookup(key);
    return out == null ? s : s.match(/^\s*/)[0] + out + s.match(/\s*$/)[0];
  }
  window.T = T;
  if (LANG === "pl") return;

  // Tłumaczenie drzewa DOM – także elementów dopisywanych później
  const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "TEXTAREA"]), ATTRS = ["placeholder", "title", "aria-label"];
  const done = new WeakMap(), doneAttr = new WeakMap();   // zapobiega ponownemu tłumaczeniu już przetłumaczonego tekstu
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
  new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === "childList") m.addedNodes.forEach(walk); else walk(m.target);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  document.addEventListener("DOMContentLoaded", () => { walk(document.body); document.title = T(document.title); });
})();
