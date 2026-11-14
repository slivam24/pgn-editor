# Podklady pro Google Play

Tady je všechno, co je potřeba vyplnit a nahrát v Google Play Console, kdyby aplikace šla do Obchodu Play.

| Soubor | Kam patří v Play Console |
|---|---|
| `popis.md` | Název, krátký popis a úplný popis (Hlavní záznam v obchodu) |
| `ikona-512.png` | Ikona aplikace (512 × 512) |
| `hlavni-obrazek-1024x500.png` | Hlavní obrázek (1024 × 500) |
| `snimky/` | Snímky obrazovky telefonu (1080 × 1920) |
| `zasady-ochrany-soukromi.md` | Zásady ochrany soukromí. Play chce odkaz, stačí adresa tohoto souboru na GitHubu. |

## Postup

1. Založ účet vývojáře v [Google Play Console](https://play.google.com/console) (jednorázový poplatek 25 USD, ověření totožnosti).
2. Vytvoř aplikaci: název PGN editor, výchozí jazyk čeština, aplikace, zdarma.
3. Vyplň záznam v obchodu podle tabulky výše.
4. V části Obsah aplikace vyplň dotazníky. Odpovědi podle `zasady-ochrany-soukromi.md`: aplikace neshromažďuje žádné údaje, nemá reklamy, je pro všechny věkové skupiny.
5. V části Vydání nahraj soubor `pgn-editor-X.Y.aab` z [Releases](https://github.com/slivam24/pgn-editor/releases) (vydání z větve `main`). Play nabídne Podepisování aplikací Play, potvrď ho. Klíč z GitHub Secrets se tím stane klíčem pro nahrávání.
6. Nový osobní účet musí nejdřív projít uzavřeným testem (aktuálně 12 testerů po dobu 14 dnů), teprve potom jde aplikaci zveřejnit.

## Co je připraveno v aplikaci

- Cílí na Android 16 (`targetSdk 36`), což Play pro nové aplikace vyžaduje.
- Sestavení vytváří vedle APK i balíček `.aab`.
- Aplikace je podepsaná vlastním klíčem, který není v repozitáři.
- Licence GPL 3 a seznam použitých součástí jsou v aplikaci v menu O aplikaci, Licence.

Obrázky v této složce vytvořil skript ze stejné stránky, která běží v aplikaci. Po větší změně vzhledu je potřeba je vytvořit znovu.
