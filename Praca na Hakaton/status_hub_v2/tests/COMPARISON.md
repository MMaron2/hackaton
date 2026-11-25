# Co zyskujemy: 9 prawdziwych incydentów z tabeli Jiry odtworzonych w symulatorze

> Odwzorowanie incydentu na awarię symulatora jest moim założeniem (po tytule i przyczynie). Źródła są symulowane, a reguły Huba pisane pod ten sam symulator. Porównanie pokazuje, ile mogą być warte dodatkowe źródła, a nie ile dostarczą. Czasy Huba to minuty symulacji (±3 min).

## Czas do pierwszego powiadomienia Huba [min od początku awarii] i oszacowany zysk (pager + 5 min reakcji; wiadomość + 20 min)

| incydent | przyczyna (Jira) | ludzie: do potwierdzenia | A | B | C | D | Hub D: potwierdzenie | zysk D |
|---|---|---|---|---|---|---|---|---|
| AIIT-2686 | System | 97 (Manual) | 4 ? | 3 ✓ | 2 ✓ | 1 ✓ | 8 | 89 |
| AIIT-2987 | Under investigation | 5 (Auto) | 3 ? | 1 ? | 1 ? | 2 ? | 9 | 0 |
| AIIT-3006 | Vendor | 5 (Auto) | 3 ? | 1 ✓ | 1 ✓ | 2 ✓ | 9 | 0 |
| AIIT-3017 | Under investigation | 14 (Manual) | 4 ✓ | 3 ✓ | 2 ✓ | 4 ✓ | 9 | 5 |
| AIIT-3104 | Infrastructure - External | 120 (Manual) | 3 ✓ | 1 ✓ | 2 ✓ | 1 ✓ | 8 | 112 |
| AIIT-3133 | Vendor | 31 (Manual) | 4 ✓ | 1 ✓ | 2 ✓ | 1 ✓ | 8 | 23 |
| AIIT-3139 | Infrastructure | 25 (Manual) | 6 ✓ | 6 ✓ | 7 ✓ | 6 ✓ | 13 | 12 |
| MIT-31 | CMS CUE | 35 (Manual) | brak | brak | 9 ✓ | 4 ✓ | 13 | 22 |
| MIT-36 | Vendor | 70 (Manual) | 3 ✓ | 1 ✓ | 1 ✓ | 1 ✓ | 8 | 62 |

✓ = trafna hipoteza przyczyny, ? = wykryto, ale hipoteza inna. 'brak' = Hub nie wykrył w 32 min symulacji.

## Podsumowanie konfiguracji

| konfiguracja | wykryte incydenty | trafna hipoteza | zaoszczędzone minuty do potwierdzenia (z 402 min u ludzi) |
|---|---|---|---|
| A: metryki serwerów (jak dziś) | 8 z 9 | 5 z 8 | 284 |
| B: + statusy dostawców i usług | 8 z 9 | 7 z 8 | 290 |
| C: + infolinia | 9 z 9 | 8 z 9 | 310 |
| D: + analityka (wszystkie źródła) | 9 z 9 | 8 z 9 | 325 |

## Wartość modelu historycznego: fałszywe incydenty podczas finału z odpowiednią pojemnością (ok. 12 h symulacji)

| model | fałszywe incydenty |
|---|---|
| z kalendarzem | 0 |
| bez kalendarza | 0 |

## Wartość modelu historycznego: finał programu BEZ wcześniejszego zwiększenia pojemności

Operator zwiększa pojemność playera ×2 w 5 minut po pierwszej wiadomości Huba (prognoza z ryzykiem albo incydent).

| model | pierwsza wiadomość względem startu finału [min] | minuty z błędami playera ≥ 3% | szczyt błędów |
|---|---|---|---|
| z kalendarzem | -75 | 0 | 0.1% |
| bez kalendarza | -3 | 5 | 7.8% |
