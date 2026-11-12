# PGN editor pro Android

Aplikace je stejná webová stránka jako dosud (`app/src/main/assets/www/index.html`), jen zabalená do Android aplikace. Funguje bez internetu, ukládá rovnou soubory `.pgn` a e-mail posílá přes poštovní aplikaci v telefonu i s přílohou.

## Jak z toho dostat soubor APK přes GitHub (bez instalace čehokoli do počítače)

1. Založ si zdarma účet na [github.com](https://github.com).
2. Vpravo nahoře klikni na **+** a **New repository**. Název třeba `pgn-editor`, zvol **Private** a klikni na **Create repository**.
3. Na stránce nového repozitáře klikni na odkaz **uploading an existing file**.
4. Rozbal tenhle zip v počítači a do okna prohlížeče přetáhni **obsah** složky `pgn-editor-android` (složky `.github`, `app`, `gradle` a ostatní soubory, ne složku samotnou). Dole klikni na **Commit changes**.
5. Otevři záložku **Actions**. Sestavení se spustí samo a trvá zhruba 3 až 5 minut. Zelená fajfka znamená hotovo.
6. Na hlavní stránce repozitáře vpravo najdeš **Releases**. V nejnovějším vydání je soubor `pgn-editor-0.9.apk`.
7. Otevři tu stránku v telefonu (přihlášený na GitHub), APK stáhni a otevři. Android se zeptá, jestli smí prohlížeč instalovat aplikace, povol to. Pokud se ozve Play Protect, zvol **Přesto nainstalovat**, aplikace není z Obchodu Play, proto to hlásí.

## Nová verze

1. Uprav soubory (hlavně `app/src/main/assets/www/index.html`).
2. V `app/build.gradle` zvyš `versionCode` o 1 a změň `versionName`. Stejné číslo verze patří i do panelů O aplikaci a Verze a změny.
3. Nahraj změněné soubory do repozitáře stejně jako v kroku 4. GitHub postaví nové APK samo.
4. Nové APK nainstaluj přes staré. Partie i nastavení zůstanou.

## Testy

Při každém sestavení na GitHubu se nejdřív spustí testy. Když neprojdou, APK se nevytvoří a v záložce **Actions** je vidět, který test selhal.

- `tests/pgn.test.js` zkouší čtení a zápis PGN: varianty, komentáře, chybné partie, FEN, názvy zahájení.
- `tests/verze.test.js` hlídá, že je číslo verze stejné v `app/build.gradle`, v O aplikaci i ve Verze a změny.
- `tests/prohlizec.js` otevře aplikaci v prohlížeči Chrome a zkouší ukládání rozpracovaného souboru do paměti telefonu, velký soubor a přechod ze starší verze.

Ruční spuštění v počítači s nainstalovaným Node.js:

```bash
node --test tests/pgn.test.js tests/verze.test.js
```

## Vydání a zkušební sestavení

Sestavení z hlavní větve `main` je běžné vydání. Sestavení z jakékoli jiné větve se v **Releases** označí jako zkušební (Pre-release) a zůstává jich posledních pět, starší se mažou samy.

## Podpisový klíč

Aplikaci podepisuje klíč. Díky stejnému klíči jde každá další verze nainstalovat přes předchozí bez ztráty partií a nastavení.

**Pozor:** klíč `app/pgn-editor.keystore` i jeho heslo (v `app/build.gradle`) jsou součástí repozitáře a repozitář je veřejný. Kdokoli si je tedy může stáhnout a podepsat jimi vlastní APK, které se bude tvářit jako aktualizace PGN editoru. Dokud aplikaci instaluješ jen z vlastních Releases, nic se neděje. Pokud ji ale budeš šířit dál nebo ji dáš na Google Play, je potřeba nový klíč, který v repozitáři není.

### Přechod na tajný klíč

Sestavení je na to připravené. Když v repozitáři na GitHubu existují tajné hodnoty (**Settings > Secrets and variables > Actions > New repository secret**), použijí se místo klíče z repozitáře:

| Název | Obsah |
|---|---|
| `KEYSTORE_BASE64` | soubor s klíčem převedený na text (base64) |
| `KEYSTORE_PASSWORD` | heslo ke klíči |
| `KEY_ALIAS` | název klíče v souboru |

U každého vydání v Releases je napsáno, kterým klíčem je podepsané. Nový klíč připravený v listopadu 2026 má otisk SHA-256 `D0:D0:5F:D3:29:32:A2:83:D1:4A:27:36:1B:28:35:D7:25:F7:0E:21:5C:59:C6:5C:34:7F:D9:D1:38:77:25:5B`.

Nový klíč znamená jednorázově aplikaci odinstalovat a nainstalovat znovu, protože Android nedovolí přeinstalovat aplikaci podepsanou jiným klíčem. Před tím si partie ulož do souboru. Starý klíč pak může z repozitáře pryč.

## Co je kde

| Soubor | K čemu je |
|---|---|
| `app/src/main/assets/www/index.html` | aplikace (vzhled i logika) |
| `app/src/main/assets/www/pgn.js` | čtení a zápis PGN (tahy, varianty, komentáře, FEN) |
| `app/src/main/assets/www/eco.js` | tabulka zahájení (kód ECO a název), vytváří ji `tools/eco.js` |
| `app/src/main/assets/www/chess.js` | pravidla šachu (chess.js 0.10.3) |
| `app/src/main/assets/www/fonts/` | písma IBM Plex |
| `app/src/main/java/.../MainActivity.java` | obal: otevírání a ukládání souborů, schránka, e-mail, tlačítko Zpět |
| `tests/` | automatické testy, běží při každém sestavení |
| `app/build.gradle` | číslo verze, podpis |
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

Alternativa ke GitHubu: projekt jde otevřít v Android Studiu a sestavit přes **Build > Generate App Bundles or APKs > Build APK(s)**.
