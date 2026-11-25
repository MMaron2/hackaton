# Status Hub: dokumentacja

> Created using Anthropic Claude. Wersja robocza, wewnętrzna do czasu weryfikacji przez człowieka. Udostępniaj tylko osobom uprawnionym do danych źródłowych (New Relic, Jira): dane zawierają wewnętrzne nazwy hostów i numery zgłoszeń.

## 1. Co to jest

Status Hub to pokazówka (hackathon 2026, temat 17) wczesnego wykrywania przeciążeń i awarii platformy. Zbiera sygnały z kilku źródeł (metryki usług, statusy dostawców, infolinia, analityka), łączy je w **incydent** z wagą P1–P3 i **hipotezami przyczyny**, a potem wysyła ostrzeżenie, pager i eskaluje, jeśli nikt nie potwierdzi.

**Co aplikacja robi, a czego nie.** Wykrywa wcześnie i szybko powiadamia. Nie przewiduje awarii przed jej początkiem: 9 incydentów z Jiry to za mało na model nadzorowany, więc zamiast prognozy działa porównanie z normą i łączenie źródeł.

Wymagania: Python 3 (tylko biblioteka standardowa), przeglądarka, internet (opcjonalnie, tylko dla karty „Usługi zewnętrzne" na żywo). Skrypty startowe są dla macOS.

## 2. Architektura

```
                      przeglądarka
                           │
         ┌─────────────────▼──────────────────┐
         │  v3  :8700   serwer + interfejs    │◄── internet: statusy AWS, Azure, M365, GCP…
         │  (status_hub_v3)                   │     (moduł status_uslug.py, na żywo)
         │   tryb „Odtwarzanie” ◄─ data/replay.json (prawdziwy eksport New Relic)
         │   tryb „Generator”   ─┐            │
         └───────────────────────┼────────────┘
                                 │ przekazuje stan i sterowanie
                    ┌────────────▼───────────┐      ┌────────────────────────┐
                    │ Hub v2  :8642          │◄─────│ Generator awarii :8641 │
                    │ silnik, model, reguły  │      │ symulowana platforma   │
                    └────────────────────────┘      └────────────────────────┘
```

| Port | Aplikacja | Rola |
|---|---|---|
| 8700 | `status_hub_v3` | główna pokazówka: odtwarzanie prawdziwych danych, statusy dostawców na żywo, przełącznik na generator |
| 8641 | `status_hub_v2/generator` | symulowana platforma (6 usług, 15 serwerów, 4 dostawców, infolinia, analityka) i panel wstrzykiwania awarii |
| 8642 | `status_hub_v2/hub` | silnik incydentów czytający generator; w trybie Generator v3 pokazuje jego stan |

## 3. Uruchomienie

**Wszystko naraz (macOS):**

```bash
./start_all.command            # z --no-open bez otwierania przeglądarki
./stop_all.command             # zatrzymuje tylko procesy z tego folderu
```

Dwuklik w Finderze też działa (przy pierwszym razie: prawy przycisk → „Otwórz"). Logi są w `logs/`. Jeśli port jest zajęty, start zgłasza to i nie uruchamia drugiej kopii, więc po zmianie kodu zrób najpierw `stop_all`. Restart zeruje symulację generatora.

**Ręcznie:**

```bash
cd status_hub_v3/server && python3 server.py --port 8700
cd status_hub_v2/generator && python3 server.py --port 8641 --realtime
cd status_hub_v2/hub && python3 server.py --port 8642 --source http://localhost:8641
```

**Opcje serwera v3:**

| Opcja | Znaczenie |
|---|---|
| `--no-external` | bez statusów dostawców na żywo (brak połączeń do internetu) |
| `--external-interval N` | odświeżanie statusów dostawców co N s (domyślnie 8) |
| `--external-providers plik.json` | własna lista dostawców (wzorzec: `python3 status_uslug.py providers`) |
| `--generator URL`, `--generator-hub URL` | adresy generatora i jego Huba (domyślnie 8641 i 8642) |

Generator z `--realtime` startuje od bieżącej godziny i idzie w czasie rzeczywistym (1×). Bez tej opcji startuje od stałej daty z 27.11 na 60×.

## 4. Interfejs

Górny pasek ma zakładki; zegar po prawej to czas rzeczywisty. Plakietka obok logo mówi, w jakim trybie jest dashboard.

| Zakładka | Zawartość |
|---|---|
| **Dashboard** | baner stanu, usługi wewnętrzne, aktywne awarie dostawców, infolinia i Google Analytics, centrum incydentów (hipotezy, dowody, szkic komunikatu), źródła sygnałów, dziennik powiadomień |
| **Usługi zewnętrzne** | pełna lista dostawców na żywo (statusy z ich stron i sondy osiągalności) oraz pomiary po naszej stronie (CloudFront, ALB, SDK) |
| **Model z danych NR** | model wytrenowany na prawdziwych danych: ryzyko w czasie, co odbiega od normy, walidacja na 9 incydentach |
| **Progi** | które progi są wyuczone z danych, a które ustawione ręcznie |
| **Dane i źródła** | co jest prawdziwe, co symulowane, lista scenariuszy |

### Dwa tryby dashboardu

Przełącznik „Odtwarzanie New Relic / Generator awarii" jest na lewo w pasku sterowania (wybór zapamiętuje przeglądarka).

- **Odtwarzanie New Relic** (domyślnie): odtwarza jedno z 9 prawdziwych okien incydentów albo „spokojny dzień" (test fałszywych alarmów). Pasek ma wybór scenariusza, start/pauzę, prędkość 60×–600×, „⏮" od początku okna i „Symuluj dyżurnego" (automatyczne potwierdzenie). Po końcu okna przycisk zmienia się na „↻ Jeszcze raz".
- **Generator awarii**: usługi, dostawcy, infolinia, analityka i incydenty pochodzą z generatora przez Hub v2. Awarie wstrzykuje się w panelu generatora (przycisk w pasku): dostawca (CDN, AWS, Redge), DNS, skok CPU, serwer niedostępny, wyciek pamięci, wolna baza, cichy błąd playera, nagły ruch, albo gotowy scenariusz. Z v3 można zmienić tylko prędkość generatora (1×, 10×, 60×, 300×) i „Symuluj dyżurnego". Pasek pokazuje prędkość i to, czy zegar generatora zgadza się z czasem rzeczywistym.

**Daty odtwarzania są przesunięte na dziś, tylko w wyświetlaniu.** Pasek pokazuje np. „czas odtwarzania: 24.11.2026 07:15 (oryginał: 31.12.2025)". Godziny i dane są prawdziwe z lat 2025–2026. Przy prezentacji mów wprost, że to odtwarzanie historii.

## 5. Skąd pochodzą dane

| Element | Źródło | Status |
|---|---|---|
| Usługi wewnętrzne (CMS, Manhattan, serwery VAF, kontenery EKS, strony i widgety, player) | eksport New Relic, 10,3 mln wierszy (aplikacje APM, hosty, monitory syntetyczne) | prawdziwe, odtwarzane |
| Pomiary dostawców po naszej stronie (CloudFront, ALB, OneTrust, SDK) | ten sam eksport; to widzą nasze systemy, nie komunikat dostawcy | prawdziwe, odtwarzane |
| 9 incydentów i czasy reakcji ludzi | tabela z Jiry | prawdziwe |
| Normy, progi, ryzyko (model NR) | uczone z eksportu: norma z tej samej pory doby z 7 dni, próg p99,5 odsetka encji poza normą w zdrowych oknach | z danych |
| **Statusy i awarie dostawców zewnętrznych** | oficjalne strony statusu i sondy HTTP z tego komputera (moduł `status_uslug.py`) | prawdziwe, **na żywo** |
| Infolinia, Google Analytics (tryb odtwarzania) | generowane z prawdziwego wpływu na użytkowników (ruch CloudFront, opóźnienie 10 min) | symulacja |
| Wszystko w trybie Generator | `status_hub_v2` | symulacja |
| Eskalacja, wagi P1–P3, progi infolinii i GA | reguły ręczne | założenia procesu |

**Karta „Usługi zewnętrzne" na żywo** niezależnie od odtwarzania pokazuje 11 dostawców (AWS, Azure, Microsoft 365 / Entra ID, Google Cloud, Cloudflare, GitHub, Anthropic, OpenAI, Atlassian, Discord, Vercel). Poziom dostawcy to najgorszy z dwóch źródeł: statusu publikowanego przez dostawcę i sond osiągalności (jedna porażka sondy to „pogorszenie", trzy z rzędu to „poważna awaria"). Moduł robi ok. 24 lekkie zapytania na 8 s do publicznych adresów, bez danych firmowych. Nie wpływa na incydenty Huba: łączenie bieżących statusów z odtwarzanym oknem sprzed miesięcy byłoby mylące.

## 6. Jak Hub wyciąga wnioski

1. Każde źródło daje **dowody** (np. karta usługi poza normą, ryzyko modelu NR, skok połączeń na infolinii, błędy playera w GA).
2. Dowody łączą się w **incydent**. Waga: P1 gdy zgadzają się ≥3 źródła albo 2 źródła z alarmem; P2 gdy 2 źródła albo alarm; P3 gdy jedno źródło.
3. Hub podaje do 3 **hipotez przyczyny** z pewnością i zaleceniem (dostawca, serwery, aplikacja, monitoring syntetyczny, odchylenie wg modelu).
4. **Powiadomienia:** wiadomość na kanale po pierwszym sygnale, pager gdy zgadzają się 2 źródła (albo po 15 min samego ostrzeżenia), eskalacja do II linii po 5 min i do kierownika po 15 min bez potwierdzenia, zamknięcie po 10 min bez sygnałów.

Ręczne progi silnika v3 (`CFG` w `server/engine.py`): infolinia ≥ 4σ i ≥ 12 połączeń na 5 min, błędy playera ≥ 6% lub starty < 60% normy, karta zmienia stan po 2 kolejnych oknach ponad progiem, „alarm" przy 2× progu.

## 7. API serwera v3 (port 8700)

| Metoda i adres | Opis |
|---|---|
| `GET /api/state`, `GET /api/stream` (SSE) | stan odtwarzania |
| `GET /api/scenarios`, `GET /api/thresholds` | scenariusze, progi |
| `GET /api/nr/model`, `GET /api/nr/replay?id=…` | model z danych NR i powtórka incydentu |
| `GET /api/external`, `GET /api/external/stream` (SSE) | statusy dostawców na żywo |
| `GET /api/gen/state` | stan Huba v2 (tryb Generator), z prędkością generatora |
| `POST /api/control` | `scenario`, `speed` (10–1200), `pause`, `restart`, `auto_ack` |
| `POST /api/ack` | potwierdzenie incydentu w trybie odtwarzania |
| `POST /api/gen/ack`, `/api/gen/control`, `/api/gen/generator` | potwierdzenie, `auto_ack` i zmiana prędkości generatora (inne akcje generatora są zablokowane) |

Serwery nasłuchują tylko na `127.0.0.1` i nie mają uwierzytelniania.

## 8. Wyniki i ograniczenia

Szczegółowe liczby (przedziały ufności, fałszywe alarmy, porównanie z reakcją człowieka) są w [JAKOSC_PREDYKCJI.md](JAKOSC_PREDYKCJI.md); odtwarza je `python3 status_hub_v3/analiza_jakosci.py`.

**Na prawdziwych danych (odtwarzanie okien incydentów):**

| Incydent | Pierwszy sygnał Huba | Ludzie (Jira) |
|---|---|---|
| AIIT-2686 (AWS) | 10 min po początku wg właściciela danych, hipoteza „AWS Load Balancers" zgodna z Jirą | 97 min |
| AIIT-2987 (tvn24.pl, CMS) | w chwili startu | 1 min (automat), remis |
| MIT-31 (błąd 701) | 75 min po początku, hipoteza błędna (CloudFront) | 21 min, Hub przegrywa |
| AIIT-3006, 3017, 3104, 3133, 3139, MIT-36 | brak sygnału: eksport ma tylko monitory syntetyczne | 0–25 min |
| spokojny dzień | 0 incydentów | |

Fałszywe alerty kart: 0,4–1,9 epizodu na dobę w oknach CUE i 0,1 na dobę w oknie NB (167 dni). Pojedyncza karta bez potwierdzenia daje tylko ostrzeżenie, pager po 15 min.

**Symulacja (Hub v2, nie dowód na produkcji):** w testach end-to-end Hub wykrył 15 z 16 nowych scenariuszy (mediana 2 min), a automaty były szybsze od infolinii w 10 przypadkach. Szczegóły: `status_hub_v2/tests/`.

**Ograniczenia, o których trzeba mówić wprost:**
- Wyraźna przewaga nad ludźmi jest w jednym incydencie z dziewięciu, w sześciu eksport nie zawiera metryk, które awaria zmieniła.
- Progi i reguły dostrajano na tych samych 9 incydentach, na których je oceniamy, więc wynik to ilustracja, nie statystyka.
- To odtwarzanie historii. Na produkcji potrzebny jest strumień New Relic oraz prawdziwe źródła: statusy dostawców, infolinia, Google Analytics.
- Brak uwierzytelniania, trwałego stanu (restart zeruje symulację) i wysyłki powiadomień poza aplikacją.
- Strony statusu dostawców aktualizują ludzie, więc bywają spóźnione o minuty. Microsoft 365 nie ma publicznego API statusu (oceniany tylko sondami).

## 9. Struktura folderu

| Ścieżka | Co to jest |
|---|---|
| `start_all.command`, `stop_all.command` | uruchomienie i zatrzymanie wszystkich aplikacji |
| `status_hub_v3/` | pokazówka: `server/` (serwer, silnik, moduł statusów dostawców), `web/` (interfejs), `data/` (gotowy `replay.json`, `nr_model.json`), `build_replay.py` |
| `status_hub_v2/` | generator awarii (`generator/`), Hub z silnikiem i modelem (`hub/`), model z danych NR (`nr/`), testy (`tests/`) |
| `prezentacja/` | prezentacja na 5 minut (`.pptx`), prompt do Copilota, zrzuty ekranu |
| `dokumentacja/` | ten dokument, `JAKOSC_PREDYKCJI.md` i wyniki analizy jakości (`wyniki_jakosci.csv`) |
| `logs/` | logi aplikacji uruchomionych przez `start_all` |

`data/replay.json` jest gotowy. Jego odbudowa (`build_replay.py`) wymaga pandas i oczyszczonego eksportu, którego nie ma w tym folderze.

## 10. Gdy coś nie działa

| Objaw | Przyczyna i rozwiązanie |
|---|---|
| Dashboard stoi, „Wszystko w normie", przycisk „↻ Jeszcze raz" | odtwarzane okno dobiegło końca; kliknij przycisk albo „⏮" |
| Wstrzyknięta awaria nic nie zmienia na 8700 | dashboard jest w trybie „Odtwarzanie"; przełącz na „Generator awarii" |
| „Brak połączenia z Hubem generatora" | nie działa Hub v2 (8642) lub generator (8641); uruchom `start_all.command` |
| „Serwer pokazówki działa ze starym kodem" | zrób `stop_all.command`, potem `start_all.command` |
| Pasek generatora: „czas nie zgadza się z rzeczywistym" | generator był przyspieszany albo wystartował bez `--realtime`; reset w jego panelu lub restart wyrównuje |
| Karta „Usługi zewnętrzne": „brak łączności hosta" | sondy zawodzą na poziomie sieci (np. `tls-cert` za proxy z podmianą certyfikatów: ustaw `SSL_CERT_FILE` na firmowe CA); bez internetu uruchom z `--no-external` |
| „Port jest już zajęty" przy starcie | aplikacja już działa; `stop_all.command`, jeśli chcesz zrestartować |

## 11. Co dalej (z samooceny)

Największa luka to **wartość biznesowa** (samoocena 2/5): brakuje tabeli scenariuszy kosztowych (koszt minuty przerwy × zaoszczędzone minuty × incydenty rocznie, założenia jawne). Dalej: slajd o wykonalności (źródła danych i dostęp, RODO, koszt utrzymania, właściciel), pełne metryki dla większej liczby incydentów, prawdziwe źródła infolinii i GA oraz pilotaż w trybie cichym (bez pagera) przez kilka miesięcy z pomiarem fałszywych alarmów i czasu wykrycia.
