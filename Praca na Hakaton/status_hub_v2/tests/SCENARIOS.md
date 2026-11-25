# Nowe scenariusze: co wykrywa szybciej, model czy zgłoszenia od ludzi?

> Scenariusze są nowe (nie są 9 incydentami z Jiry ani gotowymi scenariuszami generatora): różne typy awarii, cele, nasilenia i godziny doby. Infolinia i analityka są **symulowane**; to, ilu ludzi dzwoni, jest założeniem generatora. Czasy w minutach od startu awarii (±3 min).

| godz. | scenariusz | Hub (1. wiadomość) | serwery (model) | statusy | analityka | infolinia (ludzie) | pager | trafna przyczyna (1. hipoteza) |
|---|---|---|---|---|---|---|---|---|
| 03:10 | noc: cichy błąd playera | **3** | brak | brak | 3 | 27 | 15 | Błąd aplikacji playera (serwery wyglądają zdrowo) |
| 03:40 | noc: AWS awaria, dostawca milczy | **2** | 3 | 2 | 4 | 6 | 4 | Problem w usłudze API publiczne (baza lub aplikacja) |
| 04:30 | noc: serwer CMS niedostępny | **1** | 1 | brak | brak | brak | 17 | Serwer cms-02: niedostępny |
| 07:50 | rano: wolna baza wyszukiwarki | **2** | 3 | 2 | brak | brak | 4 | Problem w usłudze Wyszukiwarka (baza lub aplikacja) |
| 08:30 | rano: subtelny błąd playera (0,35) | **6** | brak | brak | 6 | 22 | 14 | Błąd aplikacji playera (serwery wyglądają zdrowo) |
| 10:15 | przedpołudnie: CDN częściowa awaria (0,3) | **1** | 3 | 1 | 5 | 9 | 3 | Dostawca: CDN (dostawca) |
| 11:00 | południe: wyciek pamięci web-02 | **18** | 18 | brak | brak | brak | 33 | Serwer web-02: kończy się pamięć |
| 12:20 | południe: nagły napływ ruchu na API | **1** | 3 | 1 | brak | 10 | 4 | Przeciążenie przy większym ruchu: API publiczne |
| 13:40 | popołudnie: skok CPU na DAM | **brak** | brak | brak | brak | brak | brak | - |
| 14:30 | popołudnie: częściowa awaria DNS (0,4) | **19** | brak | 19 | brak | 25 | 25 | Dostawca: DNS |
| 15:20 | popołudnie: wolna baza API + błąd playera | **3** | 3 | 3 | 6 | 10 | 3 | Błąd aplikacji playera (serwery wyglądają zdrowo) |
| 16:10 | popołudnie: Redge, komunikat po 25 min | **1** | 3 | 1 | 7 | 23 | 3 | Dostawca: Redge (wideo) |
| 17:00 | popołudnie: wolna baza DAM | **2** | 3 | 2 | brak | brak | 4 | Problem w usłudze DAM / wideo (baza lub aplikacja) |
| 19:00 | wieczór: AWS awaria całkowita (0,9) | **1** | 3 | 1 | 5 | 5 | 3 | Dostawca: AWS |
| 21:00 | wieczór (szczyt): błąd playera (0,5) | **5** | brak | brak | 5 | 29 | 11 | Błąd aplikacji playera (serwery wyglądają zdrowo) |
| 22:30 | noc: serwer playera + skok CPU web | **2** | 1 | brak | brak | brak | 18 | Serwer player-01: niedostępny |

## Podsumowanie

- Hub wykrył **15 z 16** scenariuszy; mediana czasu do pierwszej wiadomości: **2 min**.
- Szybciej zareagowały źródła automatyczne (serwery, statusy, analityka) niż infolinia: **10**; infolinia szybciej: **0**; remis: **0**.
- Tylko źródła automatyczne dały sygnał: **5**; tylko infolinia: **0**; nikt: **1**.
- Mediana pierwszego sygnału: automaty **2 min**, infolinia **22 min**.

