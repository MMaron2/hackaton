# Wyniki testu end-to-end (czasy w minutach symulowanych)

| scenariusz | wstrzyknięto | cel | wykrycie po [min] | do potwierdzenia | trafna hipoteza | waga |
|---|---|---|---|---|---|---|
| Awaria CDN, dostawca milczy 12 min | Awaria dostawcy | cdn | 1 | - | tak | P1 |
| Cichy błąd playera | Błąd aplikacji playera (cichy) | player | 3 | - | tak | P2 |
| Wyciek pamięci cms-01 | Wyciek pamięci | cms-01 | 13 | - | tak | P3 |
| Wolna baza CMS | Wolna baza danych | cms | 2 | - | tak | P2 |
| Awaria DNS | Awaria DNS | dns | 6 | - | tak | P1 |
| Serwer niedostępny + skok CPU | Skok CPU na serwerze | web-01 | 2 | - | tak | P3 |
| Serwer niedostępny + skok CPU | Serwer niedostępny | api-02 | 2 | - | tak | P3 |
| Finał programu bez skalowania | wydarzenie z kalendarza | player | ostrzeżenie tak | - | tak | P1 |

Fałszywe incydenty w ok. 11-28 (12 h symulacji z finałem i odpowiednią pojemnością): **0**
