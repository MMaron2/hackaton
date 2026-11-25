Stwórz elegancką prezentację na 5 minut (7 slajdów, 16:9) po polsku. Styl: nowoczesny, ciemny granat (#0B1F33) na slajdach tytułowym i końcowym, jasne tło (#F1F5F9) na pozostałych, akcenty turkusowy (#14B8A6) i bursztynowy (#F59E0B). Czcionki: Cambria (tytuły), Calibri (tekst). Na każdym slajdzie element wizualny (ikona, wykres, karta ze statystyką, schemat). Mało tekstu, duże liczby, bez długich akapitów. Bez linii pod tytułami. Dodaj notatki prelegenta z czasem (łącznie 5 minut).

SLAJD 1 (tytułowy, 0:00-0:20)
Tytuł: Status Hub
Podtytuł: Wiedzieć o awarii pierwsi: wcześniejsze powiadomienie zamiast prognozowania na ubogich danych
Dopisek: Wyzwanie: wczesne wykrywanie przeciążeń i awarii platformy (MTTD) | Hackathon 2026
Notatki: Dziś większość incydentów wykrywamy po zgłoszeniach użytkowników. Pokażę, co zrobiliśmy z danymi i ile minut to daje.

SLAJD 2 (0:20-1:10) Tytuł: Dane powiedziały nam, czego nie da się przewidzieć
Trzy karty ze statystyką:
- 10,3 mln: wierszy metryk New Relic (okna 10 min)
- 9: incydentów w Jirze, za mało na model nadzorowany
- 3 → 1: podejścia: predykcja, wykrywanie, szybkie powiadomienie
Pod kartami:
- Wniosek: model uczony na 9 przypadkach nie uogólni się, a reguła z bazową linią (ta sama pora doby, 7 dni) jest stabilniejsza.
- Zmiana celu: ograniczyć szkodę z późnego powiadomienia. W Jirze ludzie potwierdzali incydenty średnio po 45 min (402 min w sumie dla 9 incydentów).
Stopka: Dane: eksport New Relic i tabela incydentów Jira. Wyniki na 9 incydentach to ilustracja rzędu wielkości, nie statystyka.

SLAJD 3 (1:10-2:00) Tytuł: Jeden widok z czterech źródeł
Schemat od lewej do prawej ze strzałkami:
Źródła (4 karty): Metryki serwerów (CPU, odpowiedź, błędy); Statusy dostawców (AWS, CDN, DNS, vendorzy); Infolinia (skoki zgłoszeń wg tematu); Google Analytics (błędy playera po stronie widza)
→ Silnik Huba (ciemna karta): dowód → incydent P1-P3; hipotezy przyczyny z pewnością; model historyczny i kalendarz programów; eskalacja 5/15 min, wykrywanie martwych źródeł
→ Dyżurny: ostrzeżenie, pager, szkic komunikatu dla widzów; potwierdzenie w aplikacji
Stopka: Druga aplikacja: generator awarii (usługi, serwery, dostawcy) ze sterowaniem na żywo do testów i demo.
Notatki: Tu pokaż demo: wstrzyknij awarię CDN w generatorze, Hub pokazuje incydent po ok. 1 min z hipotezą "dostawca".

SLAJD 4 (2:00-3:00) Tytuł: Wynik na 9 prawdziwych incydentach
Wykres słupkowy grupowany: czas do potwierdzenia po starcie awarii [min], z etykietami wartości.
Kategorie: 2686, 3104, MIT-36, MIT-31, 3133, 3139, 3017, 2987, 3006
Seria "Ludzie (Jira)": 97, 120, 70, 35, 31, 25, 14, 5, 5 (szary)
Seria "Hub, wszystkie źródła": 8, 8, 8, 13, 8, 13, 9, 9, 9 (turkusowy)
Po prawej trzy karty:
- 402 → 77 min: łączny czas do potwierdzenia, symulacja
- 8 z 9: wykrytych już z metryk, 9 z 9 z infolinią
- 5 → 8 z 8: trafnych hipotez dzięki statusom dostawców
Stopka: Symulacja: odwzorowanie incydentów na awarie to nasze założenie; Hub = czas do pagera + 5 min reakcji; rozdzielczość ±3 min.
Notatki: Największy zysk dają trzy długie incydenty dostawców (97, 120, 70 min), czyli 263 z 325 zaoszczędzonych minut. Uczciwie: dla AIIT-2987 i AIIT-3006 Hub nie jest szybszy (ludzie 5 min).

SLAJD 5 (3:00-3:50) Tytuł: Wartość biznesowa: kto zyskuje i jak to policzyć
Lewa karta:
- Mechanizm zysku: mniej minut przerwy widzianej przez widza = niższy koszt incydentu i mniejszy odpływ.
- Kto: NOC i dyżur, właściciele serwisów, obsługa klienta, zespoły wydarzeń na żywo.
- Formuła: zaoszczędzone minuty × koszt minuty przerwy × liczba incydentów rocznie.
Prawe karty (ciemne, duże liczby):
- 325 min: mniej oczekiwania na reakcję w 9 incydentach (symulacja, 81% z 402 min)
- 75 min vs 3 min: ostrzeżenie przed finałem z kalendarzem i modelem historycznym vs bez; błędy playera ≥3%: 0 min vs 5 min (szczyt 7,8%)
Stopka: Koszt minuty przerwy musi podać biznes (przychód z reklam, SLA, odpływ); nie zakładamy tu żadnej kwoty.

SLAJD 6 (3:50-4:30) Tytuł: Wykonalność: co mamy, czego brakuje
Trzy kolumny z ikonami:
- Mamy: dane metryk już w New Relic, dostęp po API; adapter źródeł (podmiana jednego pliku); czysty Python bez zależności, 7 scenariuszy testów E2E
- Ryzyka: statusy dostawców, infolinia i GA nie mają jeszcze podpiętych API; RODO: infolinia i GA tylko zagregowane, bez danych osobowych; progi stroiliśmy na symulatorze, potrzebna kalibracja na prawdziwych danych
- Potrzebne: właściciel (zespół SRE/NOC); integracje New Relic, statusy dostawców, infolinia, GA; intake technologiczny i przegląd prawny przed użyciem produkcyjnym

SLAJD 7 (końcowy, 4:30-5:00) Tytuł: Plan wdrożenia i demo
Oś czasu z 4 numerowanymi krokami:
1. Tyg. 1-2: podłączenie New Relic na żywo, tryb cichy (bez pagera), pomiar fałszywych alarmów
2. Tyg. 3-6: statusy dostawców i infolinia; kalibracja progów na prawdziwych incydentach
3. Tyg. 7-10: pilotaż z dyżurem NOC, pager i szkice komunikatów, przegląd prawny i RODO
4. Dalej: GA, kalendarz programów, ocena MTTD po kwartale
Wyróżnione bursztynowo: Demo na żywo: generator awarii → Hub pokazuje incydent, hipotezę i alert
Stopka: Created using Anthropic Claude. Wersja robocza do weryfikacji przez człowieka.

Zachowaj wszystkie liczby dokładnie tak, jak podano. Nie dodawaj własnych kwot ani statystyk.

DODATKOWO: po slajdzie 3 dodaj dwa slajdy z miejscem na zrzuty ekranu aplikacji (zostaną wstawione ręcznie): "Aplikacja na żywo: awaria CDN wykryta w 1 minutę" (jeden duży obraz na środku) oraz "Incydent P1 z hipotezą i szkicem komunikatu" (dwa obrazy po lewej, po prawej liczby: 97% hipoteza dostawca CDN; P1 + pager, eskalacja po 5 min). Zrzuty są w folderze status_hub_v2/screens.
