# Jakość wykrywania i predykcji: Hub i model NR kontra reakcja człowieka

> Created using Anthropic Claude. Wersja robocza, wewnętrzna do czasu weryfikacji przez człowieka. Liczby poniżej to ilustracja na 9 incydentach, a nie dowód statystyczny: nie przedstawiaj ich jako ostatecznych faktów ani gwarancji skuteczności. Udostępniaj tylko osobom uprawnionym do danych źródłowych (New Relic, Jira).

Wszystkie liczby z sekcji 2–6 pochodzą ze skryptu [analiza_jakosci.py](../status_hub_v3/analiza_jakosci.py) (uruchomienie: `python3 status_hub_v3/analiza_jakosci.py --csv wyniki.csv`), który czyta `data/replay.json` i `data/nr_model.json` i uruchamia silnik Huba na całym oknie każdego incydentu, bez udziału człowieka. Wyniki per incydent są też w [wyniki_jakosci.csv](wyniki_jakosci.csv).

## 1. Najważniejsze wnioski

1. **To jest wykrywanie, nie przewidywanie.** Ani Hub, ani model NR nie dały sygnału przed prawdziwym początkiem awarii. Jedyny incydent ze znanym prawdziwym początkiem (AIIT-2686) dał sygnał 10 min po nim. Dodatnie „wyprzedzenie" względem Jiry (−87 min) wynika z tego, że wpis w Jirze powstał 97 min po początku.
2. **Skuteczność wykrywania jest zależna od danych:** Hub wykrył 3 z 9 incydentów (33%, przedział ufności 95%: 12–65%). W oknach z pełnymi metrykami (aplikacje, hosty, balansery) 3 z 3, w oknach tylko z monitorami syntetycznymi 0 z 6.
3. **Hub kontra człowiek (w 3 wykrytych oknach):** Hub wcześniej o 87 min (AIIT-2686), remis (AIIT-2987), ludzie wcześniej o 54 min (MIT-31). W 6 oknach brak sygnału Huba.
4. **Fałszywe alarmy są niskie, ale zmierzone na krótkim czasie:** 0 fałszywych pagerów w 60 h czasu bez awarii (górna granica 95%: ok. 1,5 na dobę) i 0 ostrzeżeń modelu NR w 180 dniach (górna granica: 0,02 na dobę).
5. **Próba jest mała, a progi dopasowano do tych samych incydentów.** Brak osobnego zbioru testowego, więc wyniki są optymistyczne.

## 2. Jak mierzono

| Pojęcie | Definicja |
|---|---|
| Początek awarii | czas wskazany przez właściciela danych, jeśli jest (tylko AIIT-2686: 06:50), w pozostałych przypadkach początek z Jiry |
| Wykrycie przez ludzi | pole „wykryto" z Jiry (zgłoszenie ręczne albo automat) |
| Potwierdzenie | chwila przejęcia sprawy (pole „potwierdzono" z Jiry) |
| Pierwszy sygnał Huba | początek pierwszego incydentu Huba w oknie od 3 h przed początkiem do 30 min po końcu awarii |
| Pager Huba | moment wysłania pagera: gdy zgadzają się ≥2 źródła albo po 15 min samego ostrzeżenia |
| Przedziały ufności | Wilson (proporcje), Garwood (intensywność zdarzeń na dobę) |

**Ważne zastrzeżenie o czasach ludzi:** dla zgłoszeń ręcznych początek z Jiry to zwykle chwila zauważenia awarii, więc „wykrycie po 0 min" jest dolną granicą. Prawdziwe opóźnienie znamy tylko dla AIIT-2686 (97 min).

## 3. Wyniki per incydent

Minuty od początku awarii; wartość ujemna oznacza przed początkiem. „Hub wcześniej o" = czas wykrycia przez ludzi minus pierwszy sygnał Huba.

| Incydent | Zgłoszenie | Pełne metryki | Ludzie: wykrycie | Ludzie: potwierdzenie | Hub: pierwszy sygnał | Hub: pager | Hub wcześniej o | Model NR | Hipoteza Huba |
|---|---|---|---|---|---|---|---|---|---|
| AIIT-2686 | ręczne | tak | 97 | 97 | 10 | 20 | **+87** | 10 | AWS Load Balancers |
| AIIT-2987 | automat | tak | −1 | 5 | 0 | 0 | −1 | 0 | serwery VAF/EKS |
| AIIT-3006 | automat | nie | 0 | 5 | brak | brak | brak | brak | — |
| AIIT-3017 | ręczne | nie | 0 | 14 | brak | brak | brak | brak | — |
| AIIT-3104 | ręczne | nie | 0 | 120 | brak | brak | brak | brak | — |
| AIIT-3133 | ręczne | nie | 0 | 31 | brak | brak | brak | brak | — |
| AIIT-3139 | ręczne | nie | 25 | 25 | brak | brak | brak | brak | — |
| MIT-31 | ręczne | tak | 21 | 35 | 75 | 85 | **−54** | brak | AWS CloudFront (błędna) |
| MIT-36 | ręczne | nie | 20 | 70 | brak | brak | brak | brak | — |

Hipotezę Huba oceniono tylko tam, gdzie była znana przyczyna: AIIT-2686 zgodna z opisem w Jirze (AWS), MIT-31 błędna (przyczyna w Jirze: CMS CUE). Dla AIIT-2987 przyczyna w Jirze to „under investigation".

## 4. Jakość wykrywania

| Miara | Wynik | Przedział 95% |
|---|---|---|
| Hub wykrył incydent (wszystkie okna) | 3 z 9 (33%) | 12% do 65% |
| Hub wykrył incydent (okna z pełnymi metrykami) | 3 z 3 (100%) | 44% do 100% |
| Hub wykrył incydent (okna tylko z monitorami syntetycznymi) | 0 z 6 (0%) | 0% do 39% |
| Model NR dał sygnał (wszystkie okna) | 2 z 9 (22%) | 6% do 55% |

**Dlaczego 6 incydentów bez sygnału.** W tych oknach eksport zawiera wyłącznie monitory syntetyczne, w których awaria prawie nie zostawiła śladu (AIIT-3006 nie ma żadnych metryk). To ograniczenie danych, nie błąd odtwarzania. Z samych liczb nie wynika, czy z pełnymi metrykami Hub wykryłby je też, więc „3 z 3" w oknach z metrykami jest obiecujące, ale to n=3 (przedział zaczyna się od 44%).

**MIT-31:** sygnał dopiero po 75 min i z błędną hipotezą (CloudFront). Metryki prawie nie widzą tej awarii.

## 5. Czy to jest przewidywanie?

| Poziom | Wynik |
|---|---|
| Sygnał **przed** prawdziwym początkiem | 0 z 1 (jedyny incydent z wiarygodnym początkiem; sygnał +10 min po początku) |
| Sygnał przed wpisem w Jirze | AIIT-2686: −87 min (Hub i model NR), AIIT-2987: 0 min. To artefakt późnego wpisu w Jirze, nie predykcja |
| Sygnał przed zauważeniem przez ludzi | 1 z 9 wyraźnie (AIIT-2686), 1 remis, 1 po ludziach, 6 bez sygnału |

**Szansa przewidzenia awarii.** Z tych danych nie da się jej oszacować: jest jeden incydent ze znanym początkiem i w nim sygnał był po fakcie. Żeby oszacować ją z przedziałem ±20 punktów procentowych, potrzeba ok. 24 incydentów ze znanym, niezależnie ustalonym początkiem (np. z monitoringu, a nie z wpisu w Jirze).

**Jedyny element naprawdę predykcyjny** to model obciążenia z kalendarzem programu w Hubie v2: zapowiada przeciążenie przed wydarzeniem. W symulacji pierwsza wiadomość przed finałem programu bez zwiększonej pojemności pojawia się 75 min przed startem (z kalendarzem) kontra 3 min (bez kalendarza), co daje 0 kontra 5 min z błędami playera ≥3%. Błąd prognozy ruchu w czasie wydarzeń spada z 28–50% do ok. 3–5% z kalendarzem. To **symulacja** (historię wygenerował ten sam generator), więc wynik pokazuje działanie metody, nie jej dokładność na prawdziwym ruchu.

## 6. Fałszywe alarmy

| Poziom | Wynik | Przedział 95% |
|---|---|---|
| Incydent Huba w czasie bez awarii (60,1 h: poza oknami awarii i spokojny dzień 22 h) | 1 fałszywy incydent (P3, bez pagera, MIT-31 o 04:15) = 0,40 na dobę | 0,01 do 2,22 na dobę |
| Fałszywy pager Huba | 0 | górna granica 1,47 na dobę |
| Pojedyncza karta poza normą, okna CUE (13,8 dnia) | 18 epizodów = 1,30 na dobę | 0,77 do 2,06 |
| Pojedyncza karta poza normą, okno NB (167 dni) | 17 epizodów = 0,10 na dobę | 0,06 do 0,16 |
| Model NR, „obserwuj" (180,3 dnia) | 8 epizodów = 0,044 na dobę | 0,019 do 0,087 |
| Model NR, „ostrzeżenie" (180,3 dnia) | 0 | górna granica 0,020 na dobę |

Pojedyncza karta bez potwierdzenia z innego źródła daje tylko wiadomość na kanale, a pager dopiero po zgodzie dwóch źródeł albo po 15 min. Dlatego karty alarmują często, a pagery rzadko. Okres bez awarii dla poziomu incydentu to tylko 60 godzin, więc górna granica jest szeroka.

## 7. Człowiek a wyuczony model

| Aspekt | Człowiek (dane z Jiry) | Hub i model NR |
|---|---|---|
| Wykrycie | mediana 0 min od początku z Jiry (zakres −1 do 25), ale to dolna granica; w jedynym znanym przypadku 97 min | 3 z 9: 10, 0 i 75 min po początku |
| Przejęcie sprawy | mediana 31 min, zakres 5–120 min, razem 402 min dla 9 incydentów | pager 20, 0 i 85 min po początku w 3 oknach; czas do potwierdzenia zależy od dyżurnego (w demo symulowany) |
| Pokrycie | widzi to, co widać użytkownikom i automatom (7 zgłoszeń ręcznych, 2 automaty) | widzi tylko mierzone metryki: 3 z 9 okien miało właściwe metryki |
| Fałszywe alarmy | nie dotyczy (zgłasza po zauważeniu skutku) | 0 pagerów w 60 h, ale 1,3 sygnału karty na dobę w oknach CUE |
| Przyczyna | wie z kontekstu i rozmów | hipoteza z pewnością; trafna 1 z 2 ocenionych (AIIT-2686 tak, MIT-31 nie) |
| Czas pracy i skala | zależy od dyżuru | działa ciągle, porównuje tysiące encji z normą |
| Czego nie umie | patrzeć jednocześnie na wszystkie metryki | nazwać przyczyny przy 9 incydentach, wykryć awarię, która nie zmienia mierzonych metryk |

**Wniosek:** model nie zastępuje człowieka, tylko skraca czas, gdy awaria zostawia ślad w metrykach, które monitoruje. Gdy ślad jest, zysk bywa duży (87 min w AIIT-2686). Gdy go nie ma, człowiek (albo automat zgłoszeń) jest jedyny. W symulacji Hub z wszystkimi źródłami wykrywa 9 z 9 odtworzonych incydentów i oszczędza 325 z 402 min do potwierdzenia, ale to symulacja z regułami pisanymi pod ten sam symulator, więc liczba pokazuje potencjał dodatkowych źródeł, a nie obietnicę.

## 8. Ograniczenia interpretacji

- **n = 9**, z czego tylko 3 okna z pełnymi metrykami. Przedziały ufności są szerokie i nie pozwalają na wnioski o rozkładzie.
- **Progi i reguły dopasowano na tych samych 9 incydentach**, na których je oceniamy, więc wyniki są optymistyczne. Nie ma zbioru testowego.
- **Początek awarii znamy niezależnie tylko dla jednego incydentu**, więc czasy ludzi i „wyprzedzenie" względem Jiry są obarczone opóźnieniem wpisu.
- **Okna wokół incydentów to nie losowa próba czasu**, więc częstość fałszywych incydentów (60 h) jest słabo wyznaczona. Najdłuższy zdrowy okres (167 dni) dotyczy tylko okna z monitorami syntetycznymi.
- **Hipotezy oceniono dla 2 incydentów.** Pozostałe mają przyczynę „under investigation" albo brak sygnału.
- **Wyniki symulacji (Hub v2) nie są dowodem na produkcji.**

**Co zmieniłoby wiarygodność:** osobny zbiór testowy (progi stałe, nowe incydenty), więcej incydentów z pełnymi metrykami, niezależny początek awarii (z monitoringu), pilotaż w trybie cichym (bez pagera) przez kilka miesięcy z pomiarem fałszywych alarmów i czasu wykrycia.
