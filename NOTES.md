# PGN editor: přehled projektu

## Hotovo (verze 0.28, v `main`, poslední PR slivam24/pgn-editor#7)
- Editor PGN pro Android (WebView): zápis tahů, varianty, komentáře, hodnocení, časy `[%clk]`, hlavička vč. Elo/ECO, více partií v souboru (výběr, řazení, duplicity), uložení zpět do souboru, záloha, tisk/PDF, QR kód partie i FEN, stažení z Lichess/Chess.com, Stockfish (rozbor, kontrola partie, graf).
- Výuka: úlohy: 6 270 úloh z databáze Lichess (CC0), obtížnost 400–2600, témata, vlastní úroveň (Elo), opakování chybných, předtah, rozbor se Stockfishem z pohledu řešitele.
- Výuka: tahy figur: 36 pevných úrovní (6 figur × 6) a Trénink bez konce: `FIGURY.generate` vymýšlí řešitelná cvičení (lehké/střední/těžké), pěšec podle náhodné cesty; hvězdy podle nejkratšího řešení (BFS `solve`).

## Rozpracované
- Nic otevřeného v kódu. Neověřeno na skutečném telefonu: tisk, stažení z odkazu, snímání QR fotoaparátem, odsazení od lišt a gesto Zpět na Androidu 15/16.

## Zbývá / nápady
- Výuka pro nejmenší: šach a mat (mat 1 tahem, dáma/věž proti králi), „ubraň figuru“, rošáda/mimochodem/proměna.
- Hádání tahů v komentovaných partiích, dohrávání koncovek proti Stockfishi, výsledky studentů trenérovi (zatím nechtěné).
- Google Play: podklady ve `play/`, účet a nahrání `.aab` dělá uživatel.

## Klíčová rozhodnutí
- Jedna stránka `www/index.html` + moduly testovatelné v Node: `pgn.js` (čtení/zápis PGN), `eco.js`, `vyuka/figury.js`, `vyuka/ulohy.txt` (z `tools/ulohy.js`), `qr/`. Java (`MainActivity`) jen most pro soubory, tisk, HTTP, fotoaparát.
- Data v IndexedDB po partiích; partie ze souboru se čtou líně. PGN se zapisuje v ASCII, tahy anglicky (česká notace jen zobrazení/vstup).
- Chybná nebo cizí data se nezahazují (zbytek do komentáře, srozumitelné hlášení); čtení nesmí zamrznout (fuzz test).
- Volitelné funkce jsou ve výchozím stavu vypnuté. UI česky, pro děti 8–15 let. Internet jen pro stažení z odkazu.
- GPL 3: jen svobodné knihovny (jsQR místo čtečky Googlu). Podpisový klíč jen v GitHub Secrets.
- Postup: větev → PR → CI (testy Node, prohlížeč, emulátor) → po zelené Claude sám slučuje do `main`. Verze na 3 místech hlídá test.
