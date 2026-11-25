# Status Hub: pokaz na prawdziwych danych New Relic

Finalna pokazówka. **Zamiast symulatora awarii działa tu odtwarzacz prawdziwego eksportu New Relic (10,3 mln wierszy).** Usługi wewnętrzne i dostawcy to prawdziwe encje z danych, a incydenty to dziewięć prawdziwych incydentów z Jiry. Nie ma generatora: scenariusz wybiera się z listy, a odtwarzanie ma przyciski start/pauza, prędkość (60×–600×) i „od początku”.

**Karta „Usługi zewnętrzne” działa na żywo**, niezależnie od odtwarzania: pokazuje bieżące awarie i statusy dostawców (AWS, Microsoft Azure, Microsoft 365 / Entra ID, Google Cloud, Cloudflare, GitHub, Anthropic, OpenAI, Atlassian, Discord, Vercel) z oficjalnych feedów statusowych i z sond osiągalności. Źródłem jest moduł `server/status_uslug.py` (jeden plik, biblioteka standardowa). Na stronie głównej karta pokazuje tylko aktywne awarie i zdarzenia; pełna lista dostawców z sondami oraz pomiary po naszej stronie (CloudFront, ALB, SDK) są w zakładce „Usługi zewnętrzne” na górnym pasku.

**Źródło danych dashboardu przełącza się w pasku sterowania.** „Odtwarzanie New Relic” (domyślnie) to prawdziwe dane. „Generator awarii” to symulowana platforma z `status_hub_v2`: usługi wewnętrzne, dostawcy, infolinia, analityka i incydenty reagują na awarie wstrzykiwane w panelu generatora (przycisk „Panel generatora” w pasku). Tryb Generator wymaga działających generatora (port 8641) i Huba v2 (port 8642), czyli `start_all.command`; v3 pokazuje wtedy stan Huba v2, a nie własnego silnika.

## Uruchomienie

```bash
cd status_hub_v3/server && python3 server.py --port 8700      # http://localhost:8700  (Python 3, bez bibliotek)
```

Opcje modułu statusów dostawców na żywo:

```bash
python3 server.py --port 8700 --no-external                    # bez połączeń do internetu (karta pokaże, że moduł jest wyłączony)
python3 server.py --port 8700 --external-interval 5            # odświeżanie co 5 s zamiast domyślnych 8 s
python3 server.py --port 8700 --external-providers moje.json   # własna lista dostawców (wzorzec: python3 status_uslug.py providers > moje.json)
python3 server.py --port 8700 --generator http://localhost:8641 --generator-hub http://localhost:8642   # adresy trybu Generator (to wartości domyślne, jak w start_all.command)
```

Dane do odtwarzania są gotowe w `data/replay.json`. Odbudowa z eksportu (potrzebuje pandas, np. `early-warning/.venv`):

```bash
early-warning/.venv/bin/python status_hub_v3/build_replay.py          # czyta oczyszczoną tabelę z _archiwum/early-warning/data/clean
```

## Co jest prawdziwe, a co symulowane

| Element | Źródło | Status |
|---|---|---|
| Usługi wewnętrzne: CMS, Manhattan API (aplikacje APM), serwery VAF, kontenery EKS (hosty), strony i widgety, player (monitory syntetyczne) | prawdziwe encje i metryki New Relic | **prawdziwe** |
| **Usługi zewnętrzne: awarie i statusy dostawców** (AWS, Microsoft, Google Cloud, Cloudflare…) | oficjalne feedy statusów dostawców i sondy HTTP z tego komputera, odświeżane co 8 s (`status_uslug.py`) | **prawdziwe, na żywo** (nie z odtwarzanego okna) |
| Pomiary po naszej stronie: AWS CloudFront, AWS Load Balancers, OneTrust, SDK reklam i analityki | prawdziwe metryki New Relic (nie komunikaty dostawców); druga karta w zakładce „Usługi zewnętrzne” | **prawdziwe pomiary** (odtwarzanie) |
| Normy, progi, ryzyko (model NR) | uczone z danych: norma z tej samej pory doby (7 dni), progi p99,5 odsetka encji poza normą w zdrowych oknach | **z danych** |
| Infolinia, Google Analytics | generowane z prawdziwego wpływu na użytkowników (wzór dobowy z ruchu CloudFront, wzrost po sygnałach, opóźnienie 10 min) | **symulacja** |
| **Tryb „Generator awarii”**: usługi, dostawcy, infolinia, analityka, incydenty | `status_hub_v2`: generator symuluje platformę, Hub v2 liczy incydenty, v3 pokazuje jego stan | **symulacja** |
| Eskalacja, wagi P1–P3, progi infolinii i GA | reguły ręczne | założenia |

## Wyniki na prawdziwych incydentach (odtworzenie całego okna)

| Incydent | Hub: pierwszy sygnał | Ludzie (Jira) | Hipoteza Huba | Uwagi |
|---|---|---|---|---|
| AIIT-2686 (AWS) | **10 min po początku** (07:00, pager 07:10) | 97 min | AWS Load Balancers ✓ (Jira: AWS) | początek 06:50 wg właściciela danych |
| AIIT-2987 (tvn24.pl i CMS CUE) | w chwili startu (20:30, pager 20:30) | 1 min (automat) | serwery VAF/EKS | remis |
| MIT-31 (błąd 701 livestream) | 75 min po początku | 21 min | CloudFront ✗ | Hub spóźniony; metryki prawie nie widzą tej awarii |
| AIIT-3006, 3017, 3104, 3133, 3139, MIT-36 | brak sygnału | 0–25 min | | eksport ma tylko monitory syntetyczne, awarie nie zostawiły śladu |
| Spokojny dzień | 0 incydentów | | | test fałszywych alarmów |

Wniosek bez upiększeń: **na prawdziwych danych Hub wyraźnie wyprzedza ludzi w jednym incydencie (AIIT-2686, o 87 min), remisuje w jednym, przegrywa w jednym, a w sześciu nie ma sygnału**, bo eksport nie zawiera właściwych metryk.

## Zastrzeżenia

- Dziewięć incydentów to ilustracja, nie statystyka. Hipotezy i progi dopasowano na tych samych danych, na których je oceniamy.
- **Fałszywe alerty kart:** przy progach p99,5 w zdrowych oknach ok. 0,4–1,9 epizodu na dobę (okna CUE) i 0,1 na dobę (okno NB, 167 dni). Pojedyncza karta bez potwierdzenia daje tylko ostrzeżenie na kanałach, pager po 15 min.
- Karta „Player i wideo” ma próg 100%: tylko kilka monitorów, które w zdrowych dniach zawodzą naraz, więc praktycznie nie alarmuje.
- Infolinia i analityka są symulowane. Opóźnienie ich reakcji i skala to założenia, nie pomiary.
- To odtwarzanie historii. Na produkcji model liczyłby ryzyko z bieżącego strumienia New Relic, a infolinia i GA przyszłyby z prawdziwych systemów (wymiana źródeł w jednym miejscu).
- **Daty odtwarzania są przesunięte na dziś, wyłącznie w wyświetlaniu.** Zegar w nagłówku pokazuje czas rzeczywisty, a pasek sterowania „czas odtwarzania: dd.mm.rrrr gg:mm (oryginał: …)” pokazuje dzień incydentu przesunięty na dzisiejszy, z oryginalną datą w nawiasie. Godziny, dane i wyniki są niezmienione i pochodzą z prawdziwych incydentów z lat 2025–2026. Daty zgłoszeń w selektorze scenariuszy i w zakładce „Dane i źródła” to oryginalne daty z Jiry. Przy prezentacji mów wprost, że to odtwarzanie historii.
- **Tryb Generator to symulacja i osobny silnik.** Incydenty, hipotezy i pager liczy Hub v2 (reguły z `status_hub_v2`), a nie silnik v3, więc ich wyników nie należy porównywać z incydentami z Jiry. Awarie wstrzykuje się wyłącznie w panelu generatora; z v3 można zmienić tylko prędkość symulacji i „Symuluj dyżurnego”. Generator uruchomiony z `--realtime` (robi tak `start_all.command`) idzie w czasie rzeczywistym (1×) i ma zegar zgodny z prawdziwym; po przyspieszeniu jego zegar wyprzedza czas rzeczywisty (pasek w v3 pokazuje prędkość i to, czy czas się zgadza). Generator bez tej opcji startuje od stałej daty z 27.11 na 60×, a v3 przesuwa wtedy daty na dziś, z oryginalną datą w nawiasie. Restart przez `stop_all.command` zeruje symulację generatora. W tym trybie karta „Usługi zewnętrzne” pokazuje dodatkowo awarie dostawców z generatora, oznaczone SYMULACJA.
- **Usługi zewnętrzne na żywo nie są częścią odtwarzania.** Zegar karty to czas rzeczywisty, a silnik incydentów (dowody, hipotezy, pager) ich nie używa: łączenie bieżących statusów z odtwarzanym oknem sprzed miesięcy byłoby mylące. Przy prawdziwym wdrożeniu byłyby kolejnym źródłem dowodów obok New Relic, infolinii i GA.
- Strony statusu dostawców aktualizują ludzie, więc bywają spóźnione o minuty; sondy pokazują osiągalność z tego komputera teraz. Microsoft 365 nie ma publicznego API statusu bez logowania (oceniany tylko sondami), a feed Azure (RSS) nie niesie dotkliwości, więc aktywny wpis jest ostrożnie traktowany jako „pogorszenie”. Zdarzenia AWS są regionalne i część to długotrwałe zdarzenia, a nie awaria całego AWS.
- Moduł wykonuje ok. 24 lekkie zapytania na 8 s do publicznych adresów dostawców (bez danych firmowych, z generycznym User-Agent). W sieci z ograniczonym ruchem wychodzącym uzgodnij to z administratorami; za proxy z podmianą certyfikatów ustaw `SSL_CERT_FILE` (karta zgłosi wtedy problem po stronie hosta zamiast fałszywej awarii dostawców). Bez internetu uruchom z `--no-external`.

## Struktura

| Plik | Rola |
|---|---|
| `build_replay.py` | prawdziwe dane → karty, normy, progi, okna wokół 9 incydentów i spokojny dzień, symulacja infolinii i GA |
| `data/replay.json`, `data/nr_model.json` | gotowe dane odtwarzania i wyniki modelu NR |
| `server/engine.py` | dowody → incydent P1–P3 → hipotezy → ostrzeżenie, pager, eskalacja, potwierdzenie |
| `server/server.py` | serwer HTTP i SSE, sterowanie odtwarzaniem, `/api/external` i `/api/external/stream` (statusy dostawców na żywo), `/api/gen/state` i `/api/gen/*` (przekazywanie stanu i sterowania do Huba v2 oraz generatora w trybie Generator) |
| `server/status_uslug.py` | moduł statusów dostawców zewnętrznych (feedy + sondy), kopia samodzielnego modułu z folderu `status_uslug`; własny opis i testy są przy oryginale |
| `web/` | interfejs: dashboard w dwóch kolumnach (wewnętrzne po lewej, aktywne awarie dostawców po prawej), zakładka Usługi zewnętrzne, model NR, progi, dane i źródła; `web/css/external.css` to styl karty usług zewnętrznych |

Starsza aplikacja z generatorem awarii (`status_hub_v2`) została jako narzędzie testowe.

*Created using Anthropic Claude. Wersja robocza, wewnętrzna do czasu weryfikacji przez człowieka. Udostępniaj tylko osobom uprawnionym do danych źródłowych (New Relic, Jira).*
