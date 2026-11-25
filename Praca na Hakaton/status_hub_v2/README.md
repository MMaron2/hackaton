# Status Hub v2 + Generator awarii

Dwie aplikacje, które razem pokazują cały obieg: **generator** symuluje platformę i pozwala wstrzykiwać awarie w czasie rzeczywistym, a **Hub** czyta
z niej tak samo jak czytałby z produkcji i na żywo pokazuje, co się dzieje.

```
generator/   aplikacja 2: symulowana platforma + API źródeł + panel sterowania awariami   (port 8601)
hub/         aplikacja 1: silnik, model historyczny i dashboard na żywo                    (port 8602)
tests/e2e.py test end-to-end: wstrzykuje awarie i mierzy wykrycie
```

## Uruchomienie (dwa terminale)

```bash
cd /Users/asiemiat/Desktop/hackatlon2026/status_hub_v2/generator && python3 server.py --port 8601     # http://localhost:8601
```
```bash
cd /Users/asiemiat/Desktop/hackatlon2026/status_hub_v2/hub && python3 server.py --port 8602 --source http://localhost:8601     # http://localhost:8602
```

Obie aplikacje używają tylko biblioteki standardowej Pythona (3.9+). Zegar symulacji idzie 60× szybciej niż rzeczywisty (przełącznik 1×–300× w generatorze).

## Źródła danych Huba

| źródło | co czyta | w prototypie | na produkcji |
|---|---|---|---|
| **Statusy** | strony statusu dostawców (AWS, CDN, Redge, DNS) i kontrole zdrowia usług | `/api/status` generatora | AWS Health, Statuspage, endpointy `/health` |
| **Serwery** | CPU, pamięć, czas odpowiedzi p95, błędy 5xx, ruch (usługa i każdy serwer) | `/api/metrics` | New Relic (NRQL) lub CloudWatch |
| **Infolinia** | połączenia wg tematu, czas oczekiwania, rezygnacje | `/api/callcenter` | system telefoniczny / CRM |
| **Analityka** | aktywni użytkownicy, starty i błędy playera | `/api/analytics` | Google Analytics Realtime API |
| **Model obciążenia** | oczekiwany ruch, CPU i opóźnienia z historii i kalendarza programu | `/api/history`, `/api/calendar` | hurtownia danych, ramówka |

Wymiana na prawdziwe źródła dotyczy tylko `hub/sources.py`. Silnik, reguły i dashboard zostają.

## Model oparty na danych historycznych (`hub/model.py`)

Uczy się z 10 tygodni historii: mediany ruchu dla każdej godziny tygodnia, mnożnika ruchu dla typu wydarzenia (finał, premiera, transmisja) i usługi,
oraz tego, jak rosną czasy odpowiedzi i CPU przy ×2, ×3 normalnego ruchu. Używany jest na dwa sposoby:
- **zapowiedź:** przed wydarzeniem z kalendarza Hub ogłasza „zwiększona aktywność wkrótce” z przewidywanym CPU i ostrzega o ryzyku przeciążenia,
- **odróżnianie normy od awarii:** wszystkie progi są liczone względem tego, czego model się spodziewa teraz. Finał podwajający ruch nie jest incydentem,
  a błędy podczas finału są.

Dokładność (pominięcie jednego wydarzenia na raz): błąd prognozy ruchu w czasie wydarzeń spada z 28–50% (sama sezonowość) do ok. 3–5% (z kalendarzem).
**Historia jest wygenerowana przez generator**, więc to dowód działania metody, a nie dokładności na prawdziwym ruchu.

## Jak Hub rozumuje

1. Każde źródło daje **dowody** (np. błędy 5xx powyżej progu przez 3 min, kontrola zdrowia „down”, 22 połączenia „Player nie działa” zamiast 3, błędy playera 29%).
2. Dowody łączą się w **incydent** z wagą P1–P3 (ile niezależnych źródeł się zgadza, jak duże błędy).
3. Hub podaje **hipotezy przyczyny** z pewnością i zaleceniem: dostawca (także gdy jego strona statusu milczy), błąd aplikacji playera (serwery zdrowe),
   konkretny serwer, przeciążenie przy większym ruchu, awaria DNS, problem w usłudze.
4. Powiadomienia: wiadomość na kanał, pager przy zgodności 2 źródeł lub P1, eskalacja po 5 i 15 min, awans wiadomości bez reakcji po 15 min,
   alert gdy samo źródło milczy. Dowolne źródło można wyłączyć w generatorze.

## Generator awarii

Panel pokazuje platformę na żywo (6 usług, 15 serwerów, 4 dostawców, infolinię i analitykę). Można:
- wstrzyknąć awarię: dostawca (CDN, AWS, Redge), DNS, skok CPU, serwer niedostępny, wyciek pamięci, wolna baza, cichy błąd playera, nagły napływ ruchu,
  z nasileniem, czasem trwania, narastaniem i sposobem komunikatu dostawcy (po N min albo milczy),
- uruchomić gotowy scenariusz jednym kliknięciem, dodać wydarzenie do kalendarza, zmienić pojemność usługi (skalowanie),
- wyłączyć źródło danych (metryki, infolinia, analityka, statusy) i zobaczyć alert o milczącym źródle.

W Hubie tryb **Demo: pokaż prawdę z generatora** zestawia wstrzyknięte awarie z wykryciem (czas wykrycia, trafność hipotezy).

## Wyniki testu end-to-end (`tests/E2E_RESULTS.md`, czasy w minutach symulacji)

| scenariusz | wykrycie po | trafna hipoteza | waga |
|---|---|---|---|
| Awaria CDN, dostawca milczy 12 min | 1 min | tak | P1 |
| Cichy błąd playera (serwery zdrowe) | 3 min | tak | P2 |
| Wyciek pamięci cms-01 | 13 min | tak | P3 |
| Wolna baza CMS | 2 min | tak | P2 |
| Awaria DNS | 6 min | tak | P1 |
| Serwer niedostępny + skok CPU | 2 min | tak | P3 |
| Finał bez skalowania | ostrzeżenie przed startem + incydent: przeciążenie | tak | P1 |

Bez awarii, przez ok. 12 godzin symulacji z finałem i odpowiednią pojemnością: **0 fałszywych incydentów**.

## Zastrzeżenia

- **Wszystkie dane są symulowane.** Reguły Huba pisałem pod ten sam świat, który generuje dane, więc wyniki powyżej są optymistyczne. Na prawdziwych danych
  trzeba przejść kalibrację progów i pomiar fałszywych alarmów.
- Wyciek pamięci i wolna baza wykrywane są później lub słabiej, gdy objawy narastają powoli.
- Nie ma uwierzytelniania, trwałego stanu (restart zeruje Hub), wysokiej dostępności ani wysyłki powiadomień poza aplikacją.
- Prawdziwa infolinia i Google Analytics wymagają własnych adapterów i uprawnień. Dane osobowe (numery dzwoniących, identyfikatory użytkowników) powinny zostać u źródła,
  a do Huba trafiać tylko agregaty.

*Created using Anthropic Claude. Wersja robocza, wewnętrzna do czasu weryfikacji przez człowieka.*

## Model wytrenowany na prawdziwych danych New Relic (zakładka „Model z danych NR”)

Hub ma osobną zakładkę, w której model z `early-warning` (uczony na 10,3 mln wierszy New Relic) liczy ryzyko z prawdziwych metryk i pokazuje, **co odbiega od normy**.

- `nr/build_nr.py` (uruchamiać interpreterem z `early-warning/.venv`) eksportuje wyniki do `nr/data/nr_model.json`: progi nauczone na zdrowych dniach (p99,9 szerokości odchylenia każdej grupy metryk), ramki ryzyka wokół 9 incydentów, ranking encji odbiegających od normy (norma = mediana z tej samej pory doby, 7 poprzednich dni), podobieństwo do znanych incydentów.
- Hub serwuje je pod `/api/nr/model` i `/api/nr/replay?id=…`, a widok pozwala odtworzyć incydent i porównać pierwszy sygnał modelu z startem w Jirze i wykryciem przez ludzi.
- Wynik (prawdziwe dane): sygnał z metryk dla 2 z 9 okien (AIIT-2686: ostrzeżenie 77 min przed startem z Jiry, 20 min po początku wskazanym przez właściciela danych; AIIT-2987: sygnał „obserwuj” w chwili startu). Pozostałe okna to głównie monitory syntetyczne, w których awaria nie zmieniła mierzonych metryk. Fałszywe ostrzeżenia w dniach bez awarii: 0 na dobę (167 dni okna NB).
- Ograniczenia: 9 incydentów, brak etykiet przyczyn, więc model wskazuje *co* odbiega, a nie *dlaczego*; progi uczone na zdrowych fragmentach tych samych bloków danych (nie na osobnym zbiorze); to powtórka historii, nie strumień na żywo. Silnik incydentów (dashboard) nadal działa na danych z generatora.

## Interfejs: zakładka „Progi” i tryb demo

- Zakładka **Progi** pokazuje 20 progów wyuczonych z prawdziwych danych New Relic (p99,9 odsetka odbiegających encji w zdrowych oknach, ze statystykami zdrowych okien) oraz osobno progi ustawione ręcznie (silnik alarmów i parametry modelu NR). Dane z `/api/thresholds`.
- Elementy testowe (przełącznik „Demo: pokaż prawdę z generatora”, „Symuluj dyżurnego”, tabela z prawdą z generatora) są ukryte. Włącza je adres z `?demo=1`, np. `http://localhost:8642/?demo=1`.
- Z kart usług usunięto powielone komunikaty prognozy (zostają w „Komunikatach modelu”), a z kart dostawców listę zależności.

## Układ dashboardu (dwie kolumny)

- **Lewa kolumna: usługi wewnętrzne** (tvn24.pl, Player / Live, CMS CUE, API, DAM, wyszukiwarka): ruch rzeczywisty kontra oczekiwany z modelu, czas odpowiedzi, błędy, CPU.
- **Prawa kolumna: usługi zewnętrzne** (AWS, CDN, Redge, DNS): karta z plakietką statusu ze strony dostawcy, liczbą zależnych usług, ruchem, maksymalnymi błędami i wykresem w tym samym stylu co usługi wewnętrzne. Wykres to **efekt u zależnych usług** (suma ruchu usług zależnych od dostawcy kontra oczekiwana), a nie metryka samego dostawcy, bo takiej Hub nie dostaje. Gdy dostawca zgłosi problem, na wykresie pojawia się pionowy znacznik chwili zgłoszenia.
- **Pod kolumnami: zgłoszenia i sygnały od użytkowników** (infolinia wg tematu, czas oczekiwania, porzucone; Google Analytics: użytkownicy, starty i błędy playera).
- **Niżej, także w dwóch kolumnach:** centrum incydentów i prognoza obciążenia po lewej; źródła sygnałów, komunikaty modelu i dziennik powiadomień po prawej.
