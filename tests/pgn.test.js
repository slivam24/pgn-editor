// Testy čtení a zápisu PGN. Spouští se při každém sestavení: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('../app/src/main/assets/www/chess.js');
const PGN = require('../app/src/main/assets/www/pgn.js');

const HEAD = '[Event "Turnaj"]\n[Site "Praha"]\n[Date "2026.01.01"]\n[Round "1"]\n[White "Novák, Jan"]\n[Black "Dvořák, Petr"]\n[Result "1-0"]\n\n';
const MORPHY = '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0';

// Přečte text a vrátí první partii a její text po uložení
function round(text) {
  const r = PGN.parseFile(text);
  assert.ok(!r.error, r.error);
  return { r, g: r.games[0], out: PGN.buildPgn(r.games[0]) };
}
const moveText = pgn => pgn.split('\n\n').slice(1).join('\n\n').replace(/\s+/g, ' ').trim();
const mainLine = g => { const a = []; let n = g.root; while (n.ch.length) { n = n.ch[0]; a.push(n.s); } return a; };

test('běžná partie se přečte a uloží beze změny tahů', () => {
  const { g, out, r } = round(HEAD + MORPHY + '\n');
  assert.equal(r.firstError, null);
  assert.equal(mainLine(g).length, 33);
  assert.equal(moveText(out), MORPHY);
  assert.equal(g.headers.White, 'Novák, Jan');
});

test('do souboru jde jen ASCII, hlavička bez uvozovek a hranatých závorek', () => {
  const { out } = round('[Event "Přebor \\"A\\" [2026]"]\n[White "Žluťoučký, Kůň"]\n\n1. e4 {Španělská „hra“} *\n');
  assert.match(out, /\[Event "Prebor 'A' \(2026\)"\]/);
  assert.match(out, /\[White "Zlutoucky, Kun"\]/);
  assert.match(out, /\{Spanelska 'hra'\}/);
  assert.ok(/^[\x0A\x20-\x7E]*$/.test(out));
});

test('značky [%clk], [%eval] a [%cal] v komentářích zůstanou', () => {
  const { out } = round('[Event "R"]\n\n1. e4 { [%eval 0.3] [%clk 0:05:00] } 1... e5 { [%clk 0:04:58] } 2. Nf3 { [%cal Gf3e5] útok } *\n');
  assert.equal(moveText(out), '1. e4 {[%eval 0.3] [%clk 0:05:00]} 1... e5 {[%clk 0:04:58]} 2. Nf3 {[%cal Gf3e5] utok} *');
});

test('varianty, komentáře a hodnocení projdou tam a zpět', () => {
  const src = '1. e4 e5 (1... c5 2. Nf3 (2. c3 d5) 2... d6) 2. Nf3 $1 Nc6 {Hlavni pokracovani} 3. Bb5 a6 $6 (3... Nf6 4. O-O) 4. Ba4 *';
  const { out } = round('[Event "V"]\n\n' + src + '\n');
  assert.equal(moveText(out), src);
  // uložený text se přečte znovu stejně
  assert.equal(moveText(round(out).out), src);
});

test('hodnocení zapsaná znaky (!, ?!, +/-, =) se převedou na čísla', () => {
  const { out, r } = round('[Event "G"]\n\n1. e4! e5?! 2. Nf3 +/- Nc6 = *\n');
  assert.equal(r.firstError, null);
  assert.equal(moveText(out), '1. e4 $1 e5 $6 2. Nf3 $16 Nc6 $10 *');
});

test('nedbalý zápis: 0-0, e.p., dlouhá notace, zbytečné rozlišení', () => {
  const { g, r } = round('[Event "S"]\n\n1. e2-e4 d5 2. e5 f5 3. exf6e.p. Nf6 4. Ngf3 e6 5. Bc4 Be7 6. 0-0 0-0 *\n');
  assert.equal(r.firstError, null);
  assert.deepEqual(mainLine(g), ['e4', 'd5', 'e5', 'f5', 'exf6', 'Nxf6', 'Nf3', 'e6', 'Bc4', 'Be7', 'O-O', 'O-O']);
});

test('partie z pozice (FEN) s černým na tahu', () => {
  const { g, out } = round('[Event "F"]\n[SetUp "1"]\n[FEN "8/8/4k3/8/8/4K3/4P3/8 b - - 0 40"]\n\n40... Kd5 41. Kd3 *\n');
  assert.equal(g.startFen, '8/8/4k3/8/8/4K3/4P3/8 b - - 0 40');
  assert.equal(moveText(out), '40... Kd5 41. Kd3 *');
});

test('neplatný tah v hlavní linii: přečtená část zůstane, zbytek je v komentáři', () => {
  const { g, out, r } = round(HEAD + '1. e4 e5 2. Nf3 Nc6 3. Qxh7 Kg7 4. d4 1-0\n');
  assert.equal(r.firstError.kind, 'move');
  assert.equal(r.firstError.label, '3. Qxh7');
  assert.deepEqual(mainLine(g), ['e4', 'e5', 'Nf3', 'Nc6']);
  assert.equal(moveText(out), '1. e4 e5 2. Nf3 Nc6 {Nelze precist tah Qxh7. Zbytek zapisu: 3. Qxh7 Kg7 4. d4 1-0} 1-0');
  assert.match(PGN.errorText(r.firstError), /Tah 3\. Qxh7 není v pozici možný/);
  // po uložení a novém otevření se už nic dalšího neztratí
  const again = round(out);
  assert.equal(again.r.firstError, null);
  assert.equal(again.out, out);
});

test('neplatný hned první tah a chyba u tahu černého', () => {
  const a = round(HEAD + '1. e5 e6 *\n');
  assert.equal(a.r.firstError.label, '1. e5');
  assert.equal(moveText(a.out), '{Nelze precist tah e5. Zbytek zapisu: 1. e5 e6 *} 1-0');
  const b = round(HEAD + '1. e4 e4 2. d4 *\n');
  assert.equal(b.r.firstError.label, '1... e4');
});

test('neplatný tah ve variantě: hlavní linie i začátek varianty zůstanou', () => {
  const { g, out, r } = round('[Event "N"]\n\n1. e4 e5 2. Nf3 Nc6 (2... d6 3. d4 -- 4. Nc3 (4. c3) Nf6) 3. Bb5 a6 *\n');
  assert.equal(r.firstError.kind, 'variant');
  assert.deepEqual(mainLine(g), ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  assert.equal(moveText(out), '1. e4 e5 2. Nf3 Nc6 (2... d6 3. d4 {Nelze precist tah --. Zbytek varianty: -- 4. Nc3 (4. c3) Nf6}) 3. Bb5 a6 *');
});

test('neplatný FEN: zápis zůstane jako text', () => {
  const { g, out, r } = round('[Event "F"]\n[FEN "nesmysl"]\n\n1. e4 e5 1-0\n');
  assert.equal(r.firstError.kind, 'fen');
  assert.equal(g.root.ch.length, 0);
  assert.equal(moveText(out), '{Neplatna vychozi pozice (FEN nesmysl). Zapis partie: 1. e4 e5 1-0} 1-0');
  assert.equal(g.headers.Result, '1-0');
  assert.ok(!('FEN' in g.extra));
});

test('text, který není PGN, se odmítne', () => {
  assert.ok(PGN.parseFile('').error);
  assert.ok(PGN.parseFile('Dobrý den, posílám partii.').error);
  assert.ok(!PGN.parseFile('1. e4 e5 2. Nf3').error); // samotné tahy bez hlavičky stačí
});

test('soubor s více partiemi: nic se nezahodí a nečte se, dokud to není potřeba', () => {
  const bad = '[Event "Spatna"]\n[White "X"]\n[Result "0-1"]\n\n1. e4 e5 2. Ke3 Nf6 0-1\n\n';
  const text = HEAD + MORPHY + '\n\n' + bad + '[Event "Treti"]\n[Result "*"]\n\n1. d4 {koment} d5 *\n';
  const r = PGN.parseFile(text);
  assert.equal(r.games.length, 3);
  assert.ok(!PGN.isLazy(r.games[0]));
  assert.ok(PGN.isLazy(r.games[1]) && PGN.isLazy(r.games[2]));
  assert.equal(r.games[1].headers.Event, 'Spatna');
  assert.equal(PGN.mainLength(r.games[1]), 4);
  assert.equal(PGN.mainLength(r.games[2]), 2);
  // uložení neotevřené partie ji nezmění a chybná partie v souboru zůstane
  const o = PGN.gamePgn(r.games[1]);
  assert.equal(o.error.label, '2. Ke3');
  assert.match(o.pgn, /\[Event "Spatna"\]/);
  assert.equal(moveText(o.pgn), '1. e4 e5 {Nelze precist tah Ke3. Zbytek zapisu: 2. Ke3 Nf6 0-1} 0-1');
  assert.ok(PGN.isLazy(r.games[1]));
  // otevření partie dá stejný výsledek jako uložení neotevřené
  const before = PGN.gamePgn(r.games[2]).pgn;
  assert.equal(PGN.materialize(r.games[2]), null);
  assert.equal(PGN.buildPgn(r.games[2]), before);
});

test('výsledek z konce zápisu se doplní, když v hlavičce chybí', () => {
  const { g } = round('[Event "R"]\n\n1. e4 e5 1/2-1/2\n');
  assert.equal(g.headers.Result, '1/2-1/2');
});

test('konce řádků Windows a značka BOM nevadí', () => {
  const { g } = round('﻿' + (HEAD + MORPHY + '\n').replace(/\n/g, '\r\n'));
  assert.equal(mainLine(g).length, 33);
});

// Rychlé hledání tahu musí dát stejný tah jako původní pomalá cesta chess.js. Navíc smí přečíst jen
// zápis, který chess.js odmítá kvůli zbytečnému rozlišení (N1d2), a i tehdy musí sedět figura a pole.
test('rychlé čtení tahů se shoduje s chess.js na náhodných partiích', () => {
  let seed = 12345;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const variants = san => {
    const v = [san, san.replace(/[+#]/g, ''), san.replace('x', ''), san.replace('=', '')];
    const m = /^([NBRQ])([a-h][1-8])/.exec(san);
    if (m) v.push(san[0] + 'a' + san.slice(1), san[0] + '1' + san.slice(1)); // (někdy chybné) rozlišení
    if (/^[a-h]x/.test(san)) v.push(san.replace('x', ''));
    v.push(san.toLowerCase(), 'Nf9', 'Qh4', 'e5', 'O-O', 'O-O-O', 'exd5', 'Rd1', 'Nd2', 'Bb5', 'Kg1');
    return v;
  };
  let checked = 0, extra = 0;
  for (let game = 0; game < 10; game++) {
    const c = new Chess();
    for (let ply = 0; ply < 120 && !c.game_over(); ply++) {
      const legal = c.moves();
      const san = legal[rnd(legal.length)];
      for (const s of variants(san)) {
        const a = new Chess(c.fen()), b = new Chess(c.fen());
        const fast = PGN.sanMove(a, s), slow = b.move(s, { sloppy: true });
        const where = 'tah ' + s + ' v pozici ' + c.fen();
        if (slow) {
          assert.equal(fast && fast.san, slow.san, where);
          assert.equal(a.fen(), b.fen(), where);
        } else if (fast) {
          const m = /^([NBRQK])?[a-h]?[1-8]?x?([a-h][1-8])/.exec(s);
          assert.ok(m, where);
          assert.equal(fast.piece, (m[1] || 'p').toLowerCase(), where);
          assert.equal(fast.to, m[2], where);
          extra++;
        }
        checked++;
      }
      c.move(san);
    }
  }
  assert.ok(checked > 5000);
  assert.ok(extra < checked / 20, 'rychlá cesta čte podezřele mnoho tahů, které chess.js odmítá: ' + extra);
});

// Tabulka zahájení (eco.js): hledá se podle pozice, takže se zahájení pozná i po přehození tahů
test('zahájení podle tahů: kód ECO a název', () => {
  const ECO = require('../app/src/main/assets/www/eco.js');
  const find = s => ECO.find(Chess, s.split(' '), PGN.sanMove);
  assert.deepEqual(find('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'), { eco: 'B90', name: 'Sicilian Defense: Najdorf Variation', ply: 10 });
  assert.equal(find('e4 e5 Nf3 d6 d4 Bg4').eco, 'C41');
  // královská indická přes 1. Nf3 dojde do stejné pozice jako přes 1. d4
  assert.equal(find('Nf3 Nf6 c4 g6 Nc3 Bg7 e4 d6 d4').eco, find('d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3').eco);
  assert.match(find('Nf3 Nf6 c4 g6 Nc3 Bg7 e4 d6 d4').name, /^King's Indian Defense/);
  assert.equal(find(''), null);
  // stejný výsledek s rychlým i pomalým čtením tahů
  assert.deepEqual(ECO.find(Chess, 'd4 d5 c4 e6 Nc3 Nf6'.split(' ')), find('d4 d5 c4 e6 Nc3 Nf6'));
});

test('čas na hodinách: ruční zápis, značka [%clk] a zachování komentáře', () => {
  assert.equal(PGN.parseClock('1:25'), 5100);
  assert.equal(PGN.parseClock('1.25'), 5100);
  assert.equal(PGN.parseClock('1,25'), 5100);
  assert.equal(PGN.parseClock('85'), 5100);
  assert.equal(PGN.parseClock('0:05:30'), 330);
  assert.equal(PGN.parseClock('1:75'), null);
  assert.equal(PGN.parseClock('abc'), null);
  assert.equal(PGN.parseClock(''), null);
  assert.equal(PGN.fmtClock(5100), '1:25');
  assert.equal(PGN.fmtClock(330), '0:05:30');
  assert.equal(PGN.setClock('', 5100), '[%clk 1:25:00]');
  assert.equal(PGN.setClock('dobrý tah [%clk 0:10:00] [%eval 0.3]', 5100), '[%clk 1:25:00] dobrý tah [%eval 0.3]');
  assert.equal(PGN.setClock('[%clk 1:25:00] dobrý tah', null), 'dobrý tah');
  assert.equal(PGN.getClock('[%clk 1:25:00] dobrý tah'), 5100);
  assert.equal(PGN.getClock('{[%clk 0:04:58.3]}'), 298);
  assert.equal(PGN.getClock('bez času'), null);
  // čas projde uložením a novým otevřením
  const g = PGN.parseFile('[Event "C"]\n\n1. e4 e5 *\n').games[0];
  g.root.ch[0].c = PGN.setClock(g.root.ch[0].c, 5100);
  const again = PGN.parseFile(PGN.buildPgn(g)).games[0];
  assert.equal(PGN.getClock(again.root.ch[0].c), 5100);
});

test('osamocená závorka } a vnořený komentář aplikaci nezaseknou', () => {
  // osamocená } se přeskočí
  assert.deepEqual(mainLine(round('[Event "Z"]\n\n1. e4 } e5 2. Nf3 Nc6 *\n').g), ['e4', 'e5', 'Nf3', 'Nc6']);
  // vnořený komentář: text za vnitřní } se nezahodí, zůstane v komentáři
  const { g, out } = round('[Event "Z"]\n\n1. e4 e5 2. Nf3 {a {b} c} Nc6 *\n');
  assert.deepEqual(mainLine(g), ['e4', 'e5', 'Nf3']);
  assert.match(out, /2\. Nf3 \{a \(b .* c\) Nc6 \*\}/);
});

// Žádný vstup nesmí čtení zacyklit: náhodně poskládané kousky PGN se musí přečíst rychle
test('náhodně poškozené soubory se přečtou bez zamrznutí', () => {
  const parts = ['e4', ' ', '\n', '{', '}', '(', ')', ';', '%', '$1', '1.', '1...', '!', '?', '[', ']', '"', 'Nf3', 'O-O', '1-0', '*', '\r', '\t', 'x', '#', '+', '=', '0-0', 'a', '\\', '½-½', '[Event "x"]\n'];
  let seed = 99;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let k = 0; k < 4000; k++) {
    let s = '[Event "x"]\n\n';
    for (let i = 0, l = rnd(60); i < l; i++) s += parts[rnd(parts.length)];
    const t0 = Date.now();
    const r = PGN.parseFile(s);
    if (r.games) r.games.forEach(x => PGN.gamePgn(x));
    assert.ok(Date.now() - t0 < 1000, 'pomalé čtení: ' + JSON.stringify(s));
  }
});

test('soubor, který není PGN, se odmítne se srozumitelným důvodem', () => {
  // jiný typ souboru: řídicí znaky jako v obrázku, PDF nebo archivu
  const png = '‰PNG\r\n\u001a\n\u0000\u0000\u0000\rIHDR\u0000\u0000\u0004:\u0000\u0000\b\u009a\b\u0006\u0000\u0000\u0000}{()x';
  assert.equal(PGN.parseFile(png).kind, 'binary');
  assert.equal(PGN.parseFile('PK\u0003\u0004\u0014\u0000\u0000\u0000\b\u0000 [Event "x"]\n\n1. e4').kind, 'binary');
  // obyčejný text bez partií
  for (const t of ['Dobrý den,\nposílám výsledky turnaje.\n1. Novák 5 bodů', '<html><body><p>Partie</p></body></html>', '{"games":[{"white":"A"}]}', '# Nadpis\n\ntext']) {
    const r = PGN.parseFile(t);
    assert.equal(r.kind, 'text', t);
    assert.match(r.error, /žádné partie ve formátu PGN/);
  }
  assert.equal(PGN.parseFile('  \n ').kind, 'empty');
  // skutečný PGN s diakritikou a tabulátory binární není
  assert.ok(!PGN.looksBinary('[Event "Přebor"]\n[White "Žluťoučký,\tKůň"]\n\n1. e4 *'));
  assert.ok(!PGN.parseFile('[Event "Přebor"]\r\n[White "Žluťoučký"]\r\n\r\n1. e4 *\r\n').error);
});
