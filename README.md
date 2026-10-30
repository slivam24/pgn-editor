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

## Podpisový klíč

Soubor `app/pgn-editor.keystore` podepisuje aplikaci. Díky němu jde každá další verze nainstalovat přes předchozí. Neztrať ho a repozitář nech soukromý, heslo je přímo v `app/build.gradle`. Bez tohoto klíče by šlo novou verzi nainstalovat jen po odinstalování staré (a tím i ztrátě uložené partie a nastavení).

## Co je kde

| Soubor | K čemu je |
|---|---|
| `app/src/main/assets/www/index.html` | celá aplikace (vzhled i logika) |
| `app/src/main/assets/www/chess.js` | pravidla šachu (chess.js 0.10.3) |
| `app/src/main/assets/www/fonts/` | písma IBM Plex a Noto Sans Symbols 2 |
| `app/src/main/java/.../MainActivity.java` | obal: otevírání a ukládání souborů, schránka, e-mail, tlačítko Zpět |
| `app/build.gradle` | číslo verze, podpis |
| `.github/workflows/build.yml` | návod pro GitHub, jak APK sestavit |

Licence použitých knihoven a písem jsou ve složce `app/src/main/assets/www/licence/`.

Alternativa ke GitHubu: projekt jde otevřít v Android Studiu a sestavit přes **Build > Generate App Bundles or APKs > Build APK(s)**.
