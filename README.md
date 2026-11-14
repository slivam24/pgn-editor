# PGN editor pro Android

Aplikace pro zápis a úpravu šachových partií ve formátu PGN. Je to webová stránka (`app/src/main/assets/www/index.html`) zabalená do aplikace pro Android. Funguje bez internetu, ukládá soubory `.pgn` a partii umí poslat e-mailem i s přílohou.

## Kde vzít aplikaci

V [Releases](https://github.com/slivam24/pgn-editor/releases) je u každého vydání soubor `pgn-editor-X.Y.apk`. Otevři stránku v telefonu, soubor stáhni a nainstaluj. Android se zeptá, jestli smí prohlížeč instalovat aplikace, povol to. Pokud se ozve Play Protect, zvol **Přesto nainstalovat**: aplikace není z Obchodu Play, proto to hlásí.

Novou verzi stačí nainstalovat přes starou, partie i nastavení zůstanou. Pro jistotu jde v Nastavení udělat zálohu všech partií a nastavení do jednoho souboru.

## Jak vzniká nová verze

1. Změny se dělají na vedlejší větvi. Každé odeslání na GitHub spustí sestavení (záložka **Actions**).
2. Sestavení nejdřív pustí testy, pak vytvoří APK a zveřejní ho v Releases. Vedle toho se aplikace zkouší na emulátoru Androidu.
3. Když všechno projde, větev se sloučí do `main` a vznikne běžné vydání.

Při změně verze se číslo mění na třech místech: `versionCode` a `versionName` v `app/build.gradle`, v panelu O aplikaci a ve Verze a změny. Test hlídá, že se shodují.

## Testy

Při každém sestavení na GitHubu běží tři sady zkoušek. Když první dvě neprojdou, APK se nevytvoří.

- `tests/pgn.test.js` zkouší čtení a zápis PGN: varianty, komentáře, chybné partie, FEN, českou notaci, názvy zahájení, odkazy na partie. `tests/verze.test.js` hlídá shodu čísla verze.
- `tests/prohlizec.js` otevře aplikaci v prohlížeči Chrome a zkouší ukládání do paměti telefonu, velké soubory, seznam partií, zálohu, tisk a další funkce.
- `app/src/androidTest/` jsou zkoušky na emulátoru Androidu: start aplikace ve skutečném WebView, otevření souboru z jiné aplikace, uložení zpět do souboru a uložení partie přes restart. Běží jako samostatná úloha `android`, takže APK vznikne, i kdyby emulátor na GitHubu zrovna nenaběhl. Snímek obrazovky z emulátoru se ukládá do vydání `nahled`.

Ruční spuštění v počítači s nainstalovaným Node.js:

```bash
node --test tests/pgn.test.js tests/verze.test.js
```

## Vydání a zkušební sestavení

Sestavení z hlavní větve `main` je běžné vydání. Sestavení z jakékoli jiné větve se v **Releases** označí jako zkušební (Pre-release) a zůstává jich posledních pět, starší se mažou samy. U každého vydání je i soubor `.aab`, což je balíček pro Google Play (podklady pro Play jsou ve složce `play/`).

## Podpisový klíč

Aplikaci podepisuje klíč. Díky stejnému klíči jde každá další verze nainstalovat přes předchozí bez ztráty partií a nastavení.

Klíč není v repozitáři. Sestavení na GitHubu ho bere z tajných hodnot repozitáře (**Settings > Secrets and variables > Actions**):

| Název | Obsah |
|---|---|
| `KEYSTORE_BASE64` | soubor s klíčem převedený na text (base64) |
| `KEYSTORE_PASSWORD` | heslo ke klíči |
| `KEY_ALIAS` | název klíče v souboru |

Bez nich sestavení na GitHubu skončí chybou. Klíč a heslo měj uložené i mimo GitHub: kdyby se ztratily, další verze by nešla nainstalovat přes starou. Otisk klíče SHA-256 je `D0:D0:5F:D3:29:32:A2:83:D1:4A:27:36:1B:28:35:D7:25:F7:0E:21:5C:59:C6:5C:34:7F:D9:D1:38:77:25:5B`.

Do verze 0.23 byl v repozitáři starší klíč (veřejně čitelný). Aplikace podepsaná starým klíčem se musí před instalací nové verze jednou odinstalovat.

Při sestavení v počítači (Android Studio, **Build > Generate App Bundles or APKs**) se bez klíče použije zkušební klíč Androidu. Takové APK jde nainstalovat, ale ne přes vydanou verzi.

## Co je kde

| Soubor | K čemu je |
|---|---|
| `app/src/main/assets/www/index.html` | aplikace (vzhled i logika) |
| `app/src/main/assets/www/pgn.js` | čtení a zápis PGN (tahy, varianty, komentáře, FEN) |
| `app/src/main/assets/www/eco.js` | tabulka zahájení (kód ECO a název), vytváří ji `tools/eco.js` |
| `app/src/main/assets/www/chess.js` | pravidla šachu (chess.js 0.10.3) |
| `app/src/main/assets/www/fonts/` | písma IBM Plex |
| `app/src/main/java/.../MainActivity.java` | obal: otevírání a ukládání souborů, schránka, e-mail, tisk, stahování z odkazu, tlačítko Zpět |
| `tests/` | testy čtení PGN a zkoušky v prohlížeči |
| `app/src/androidTest/` | zkoušky na emulátoru Androidu |
| `tools/eco.js` | vytvoří tabulku zahájení z dat Lichessu |
| `play/` | podklady pro Google Play (texty, ikona, snímky, zásady soukromí) |
| `app/build.gradle` | číslo verze, podpis, cílová verze Androidu |
| `.github/workflows/build.yml` | návod pro GitHub, jak APK sestavit |

## Licence

PGN editor je svobodný software pod licencí **GNU GPL verze 3** (soubor `LICENSE`). Kdo aplikaci šíří, například na Google Play, musí k ní přiložit licenci a zpřístupnit zdrojový kód.

| Součást | Autor | Licence |
|---|---|---|
| Stockfish 19 | T. Romstad, M. Costalba, J. Kiiski, G. Linscott a další | GPL 3 |
| Stockfish.js 19, odlehčená jednovláknová verze (`assets/www/engine/`) | Chess.com, LLC, Nathan Rugg; síť nn-61e7af4bb97d od Chrise Baa | GPL 3 |
| chess.js 0.10.3 | Jeff Hlywa | BSD |
| Figury cburnett (z projektu chessground) | Colin M. L. Burnett | GPL 3 |
| Písma IBM Plex Sans a Mono | IBM Corp. | SIL OFL 1.1 |
| Tabulka zahájení (chess-openings) | Lichess | CC0 |
| AndroidX Core | The Android Open Source Project | Apache 2.0 |

Texty licencí jsou ve složce `app/src/main/assets/www/licence/` a v aplikaci v menu Licence. Zdrojový kód Stockfishe: https://github.com/official-stockfish/Stockfish, Stockfish.js: https://github.com/nmrugg/stockfish.js.

