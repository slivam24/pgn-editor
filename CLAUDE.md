# PGN editor – konvence

## Moduly
- `index.html`: vzhled a logika aplikace; `pgn.js`: čtení a zápis PGN; `eco.js`: zahájení (generuje `tools/eco.js`); `chess.js`: pravidla; `vyuka/`: výuka a úlohy.
- `MainActivity.java` je jen tenký obal Androidu: soubory, schránka, e-mail, tisk, stahování, tlačítko Zpět. Logika patří do webové části.

## Pravidla
- Partie a nastavení se ukládají do IndexedDB.
- PGN se zapisuje jen v čistém ASCII (`toAscii` v `pgn.js`).
- Chybná nebo nečitelná data se nezahazují, zachovají se.
- Volitelné funkce jsou ve výchozím stavu vypnuté.
- Jen svobodné knihovny slučitelné s GPL 3; každou zapsat do tabulky licencí v README a do `www/licence/`.
- Podpisový klíč je jen v GitHub Secrets, nikdy v repozitáři.
- Číslo verze měnit na všech třech místech (`app/build.gradle`, O aplikaci, Verze a změny).

## Postup
- Vedlejší větev → PR → CI (testy, APK, emulátor) → sloučení do `main`.
