# Pěšci proti pěšcům: výsledky při dokonalé hře

Bílý táhne první. Řádky: počet bílých pěšců, sloupce: počet černých. Výchozí postavení podle pravidel tréninku
(odebírají se sloupce a, h, b, g, c, f, d, e).

**B** vyhraje bílý, **Č** vyhraje černý (přesně vyřešeno). **?b** / **?č**: nevyřešeno v časovém limitu,
za otazníkem je jen odhad enginu, kdo stojí lépe, ne teoretický výsledek.

| bílý \ černý | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| **1** | Č | Č | Č | Č | Č | Č | Č | Č |
| **2** | B | Č | Č | Č | Č | Č | Č | Č |
| **3** | B | B | Č | Č | Č | Č | Č | Č |
| **4** | B | B | B | B | Č | Č | Č | Č |
| **5** | B | B | B | B | Č | Č | Č | Č |
| **6** | B | B | B | B | B | B | Č | Č |
| **7** | B | B | B | B | B | B | ?č | ?č |
| **8** | B | B | B | B | B | B | ?b | ?b |

Stejný počet pěšců: 1 proti 1: černý, 2 proti 2: černý, 3 proti 3: černý, 4 proti 4: bílý, 5 proti 5: černý, 6 proti 6: bílý, 7 proti 7: nevyřešeno (odhad černý), 8 proti 8: nevyřešeno (odhad bílý).

Nevyřešeno: 7 proti 7, 7 proti 8, 8 proti 7, 8 proti 8.
Nejdelší výpočty: 6 proti 8 14.4 min (1.4 mld. uzlů), 8 proti 6 5.4 min (516.1 mil. uzlů), 6 proti 7 63.8 s (97.6 mil. uzlů), 6 proti 6 39.4 s (58.6 mil. uzlů), 7 proti 6 38.3 s (60.2 mil. uzlů).

## Série kol při dokonalé hře obou stran

Série začíná 8-8 (bílý-černý), vítězi kola ubude pěšec, kdo vyhraje kolo s nejmenším počtem pěšců, vyhrál sérii.
Bílý je hráč, černý počítač. Pro srovnání i varianta, kdy série končí výhrou se 4 pěšci.
Nevyřešené dvojice (7 proti 7, 7 proti 8, 8 proti 7, 8 proti 8) se berou ve všech 16 možných výsledcích.

### Série končí výhrou se 3 pěšci

Bílý se 3 pěšci vyhraje proti žádnému povolenému počtu černých, černý se 3 pěšci vyhraje proti 3 bílým.

- 4 z 16 možností: 8-8 Č, 8-7 Č, 8-6 B, 7-6 B, 6-6 B, 5-6 Č, 5-5 Č, 5-4 B, 4-4 B, 3-4 Č, 3-3 Č → sérii vyhraje **černý** po 11 kolech.
- 2 z 16 možností: 8-8 Č, 8-7 B, 7-7 Č, 7-6 B, 6-6 B, 5-6 Č, 5-5 Č, 5-4 B, 4-4 B, 3-4 Č, 3-3 Č → sérii vyhraje **černý** po 11 kolech.
- 2 z 16 možností: 8-8 Č, 8-7 B, 7-7 B, 6-7 Č, 6-6 B, 5-6 Č, 5-5 Č, 5-4 B, 4-4 B, 3-4 Č, 3-3 Č → sérii vyhraje **černý** po 11 kolech.
- 2 z 16 možností: 8-8 B, 7-8 Č, 7-7 Č, 7-6 B, 6-6 B, 5-6 Č, 5-5 Č, 5-4 B, 4-4 B, 3-4 Č, 3-3 Č → sérii vyhraje **černý** po 11 kolech.
- 2 z 16 možností: 8-8 B, 7-8 Č, 7-7 B, 6-7 Č, 6-6 B, 5-6 Č, 5-5 Č, 5-4 B, 4-4 B, 3-4 Č, 3-3 Č → sérii vyhraje **černý** po 11 kolech.
- 4 z 16 možností: 8-8 B, 7-8 B, 6-8 Č, 6-7 Č, 6-6 B, 5-6 Č, 5-5 Č, 5-4 B, 4-4 B, 3-4 Č, 3-3 Č → sérii vyhraje **černý** po 11 kolech.

### Série končí výhrou se 4 pěšci

Bílý se 4 pěšci vyhraje proti 4 černým, černý se 4 pěšci vyhraje proti žádnému povolenému počtu bílých.

- 4 z 16 možností: 8-8 Č, 8-7 Č, 8-6 B, 7-6 B, 6-6 B, 5-6 Č, 5-5 Č, 5-4 B, 4-4 B → sérii vyhraje **bílý** po 9 kolech.
- 2 z 16 možností: 8-8 Č, 8-7 B, 7-7 Č, 7-6 B, 6-6 B, 5-6 Č, 5-5 Č, 5-4 B, 4-4 B → sérii vyhraje **bílý** po 9 kolech.
- 2 z 16 možností: 8-8 Č, 8-7 B, 7-7 B, 6-7 Č, 6-6 B, 5-6 Č, 5-5 Č, 5-4 B, 4-4 B → sérii vyhraje **bílý** po 9 kolech.
- 2 z 16 možností: 8-8 B, 7-8 Č, 7-7 Č, 7-6 B, 6-6 B, 5-6 Č, 5-5 Č, 5-4 B, 4-4 B → sérii vyhraje **bílý** po 9 kolech.
- 2 z 16 možností: 8-8 B, 7-8 Č, 7-7 B, 6-7 Č, 6-6 B, 5-6 Č, 5-5 Č, 5-4 B, 4-4 B → sérii vyhraje **bílý** po 9 kolech.
- 4 z 16 možností: 8-8 B, 7-8 B, 6-8 Č, 6-7 Č, 6-6 B, 5-6 Č, 5-5 Č, 5-4 B, 4-4 B → sérii vyhraje **bílý** po 9 kolech.

## Série při nedokonalé hře (model)

Předpoklad: kolo vyhraje strana, která má pozici teoreticky vyhranou, s pravděpodobností p, jinak soupeř
(p = 0,5 je hra náhodná, p = 1 dokonalá). U nevyřešených dvojic se bere odhad enginu.
Tabulka ukazuje pravděpodobnost, že sérii od 8-8 vyhraje bílý, a průměrný počet kol.

| p | konec se 3 pěšci | kol | konec se 4 pěšci | kol |
|---|---|---|---|---|
| 0.5 | 50.0 % | 9.3 | 50.0 % | 7.5 |
| 0.6 | 47.7 % | 9.9 | 54.1 % | 8.0 |
| 0.7 | 41.1 % | 10.4 | 60.1 % | 8.4 |
| 0.8 | 30.9 % | 10.7 | 69.4 % | 8.7 |
| 0.9 | 17.5 % | 10.9 | 82.6 % | 8.9 |
| 1.0 | 0.0 % | 11.0 | 100.0 % | 9.0 |

