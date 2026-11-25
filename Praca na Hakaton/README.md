# Temat 17: wczesne wykrywanie awarii platformy (Status Hub)

Pokazówka na prawdziwych danych New Relic (10,3 mln wierszy): prawdziwe usługi wewnętrzne i dostawcy, 9 prawdziwych incydentów z Jiry, infolinia i Google Analytics symulowane z prawdziwych sygnałów.

## Szybki start na Macu (wszystko naraz)

- **`start_all.command`**: uruchamia pokazówkę (8700), generator awarii (8641) i Hub z generatorem (8642), uruchamia generator z `--realtime` (zegar symulacji startuje od bieżącej godziny i idzie w czasie rzeczywistym, 1×) i otwiera trzy karty w przeglądarce. Dwuklik w Finderze albo `./start_all.command` (z `--no-open` bez otwierania przeglądarki).
- **`stop_all.command`**: zatrzymuje wszystkie trzy aplikacje z tego folderu. Procesów spoza tego folderu nie rusza.
- Logi są w `logs/`. Jeśli port jest już zajęty, start to zgłasza i nie uruchamia drugiej kopii.
- Przy pierwszym dwukliku macOS może zapytać o zgodę (Gatekeeper). Wtedy kliknij prawym przyciskiem → „Otwórz”, albo uruchom z Terminala: `bash start_all.command`.

## Uruchomienie ręczne (Python 3, bez dodatkowych bibliotek)

```bash
cd status_hub_v3/server
python3 server.py --port 8700
```

Potem otwórz http://localhost:8700. Scenariusz wybierasz z listy u góry, a odtwarzaniem sterujesz przyciskami (start/pauza, 60×–600×, „⏮” od początku okna).

## Wersja z generatorem awarii (status_hub_v2)

Druga aplikacja: generator awarii (symulowana platforma ze sterowaniem w czasie rzeczywistym: wstrzykiwanie awarii, gotowe scenariusze, zdarzenia z kalendarza) oraz Hub, który czyta jego dane. Uruchamiaj w dwóch terminalach (najpierw generator):

```bash
cd status_hub_v2/generator && python3 server.py --port 8641 --realtime                              # panel generatora: http://localhost:8641
cd status_hub_v2/hub && python3 server.py --port 8642 --source http://localhost:8641     # Hub: http://localhost:8642
```

Z `--realtime` generator idzie w czasie rzeczywistym (1×), a jego zegar zgadza się z prawdziwym. Do szybkiej prezentacji podnieś prędkość (np. 60×) przyciskami w pokazówce (tryb Generator) albo w panelu generatora; po przyspieszeniu zegar generatora wyprzedza czas rzeczywisty, a „reset” w jego panelu lub restart go wyrównuje. Bez `--realtime` generator startuje od stałej daty z 27.11 na 60×. W panelu generatora wybierasz gotowy scenariusz (np. „Awaria CDN, dostawca milczy”) albo wstrzykujesz własną awarię, a Hub pokazuje incydent. Opis i wyniki testów: `status_hub_v2/README.md` i `status_hub_v2/tests/`.

## Zawartość

| Folder | Co to jest |
|---|---|
| `status_hub_v3/` | aplikacja: serwer, silnik, interfejs, gotowe dane do odtwarzania (`data/replay.json`, `data/nr_model.json`), opis w `status_hub_v3/README.md` |
| `status_hub_v2/` | aplikacja z generatorem awarii (`generator/`) i Hubem (`hub/`), model z danych NR (`nr/`), testy porównawcze (`tests/`) |
| `prezentacja/` | prezentacja na 5 minut (`.pptx`), prompt do Copilota, zrzuty ekranu |
| `dokumentacja/` | pełna dokumentacja (`DOKUMENTACJA.md`), jakość predykcji (`JAKOSC_PREDYKCJI.md`) i wyniki analizy (`wyniki_jakosci.csv`) |

Skrypty `start_all.command` i `stop_all.command` zostają w głównym folderze, bo uruchamia się je dwuklikiem. Foldery aplikacji nie zmieniły położenia, więc ścieżki w skryptach i w kodzie działają bez zmian.

## Dodatki interfejsu (InfoHub)

Każda z trzech stron (pokazówka v3, Hub v2, panel generatora) ładuje te same trzy pliki dodatków ze swojego folderu `web/`:

| Plik | Co robi |
|---|---|
| `web/css/infohub.css` | kolorystyka (tryb ciemny i jasny) oraz style narzędzi w nagłówku |
| `web/js/infohub.js` | wyszukiwarka, dzwonek powiadomień z toastami, przełącznik motywu, podświetlanie znalezionego elementu |
| `web/js/i18n.js` | przełącznik języka PL / EN / DE (słownik głównych napisów) |

Dodatki nie zmieniają kodu aplikacji (`hub.js`, `gen.js`) ani układu okien. Dane biorą z tych samych połączeń, których używa aplikacja. Pliki są w trzech kopiach, bo każdy serwer podaje tylko własny folder `web/`; po zmianie trzeba skopiować plik do pozostałych dwóch. Żeby wyłączyć dodatki, wystarczy usunąć trzy linie z `index.html` (jeden `<link>` i dwa `<script>`).

## Odbudowa danych (opcjonalnie)

`data/replay.json` jest gotowy. Aby zbudować go od nowa, potrzebny jest oczyszczony eksport (`metrics_clean.parquet`, nie ma go w tym folderze) i pandas:

```bash
python3 status_hub_v3/build_replay.py --clean /sciezka/do/metrics_clean.parquet
```

Skrypt czyta też tabelę incydentów i wyniki modelu (`early-warning/data/incidents.csv`, `early-warning/data/processed/timeline.parquet`), których nie dołączono, więc odbudowa wymaga pełnego projektu `hackatlon2026`.

## Uwagi

- Infolinia i Google Analytics są symulowane; eksport New Relic ich nie zawiera.
- Karta „Usługi zewnętrzne” w pokazówce (8700) pokazuje **na żywo** awarie dostawców (AWS, Microsoft, Google Cloud, Cloudflare…) z ich oficjalnych stron statusu i sond osiągalności. Wymaga to połączeń wychodzących do internetu; bez nich uruchom `python3 server.py --port 8700 --no-external`. Szczegóły: `status_hub_v3/README.md`.
- Po aktualizacji uruchom pokazówkę ponownie (`./stop_all.command`, potem `./start_all.command`), bo działający proces nie wczyta nowego kodu.
- Dashboard v3 (8700) ma przełącznik źródła w pasku sterowania: „Odtwarzanie New Relic” (domyślnie) albo „Generator awarii”. W trybie Generator usługi, dostawcy, infolinia i incydenty pochodzą z generatora (8641) przez Hub v2 (8642), a awarie wstrzykujesz w panelu generatora. Oba muszą działać (`start_all.command`).
- Dane zawierają wewnętrzne nazwy hostów i numery zgłoszeń. Udostępniaj tylko osobom uprawnionym.

*Created using Anthropic Claude. Wersja robocza, wewnętrzna do czasu weryfikacji przez człowieka.*
