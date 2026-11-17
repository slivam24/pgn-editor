// Trénink vlci a ovečka: počítačový soupeř (minimax do konce hry s tabulkou pozic)
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../app/src/main/assets/www/trenink/vlci.js');
const E = require('../app/src/main/assets/www/trenink/vlci-engine.js');

const pos = (sheep, wolves, turn) => V.fromSquares({ sheep, wolves, turn });
// generátor náhody mulberry32: jednoduchý lineární generátor tu dával na některých semínkách zkreslené zápasy
const lcg = a => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const level = id => E.LEVELS.find(l => l.id === id);
const other = side => side === 'sheep' ? 'wolves' : 'sheep';

// Výsledek prostým prohledáním přes pravidla z vlci.js
function brute(p, memo) {
  const k = V.key(p);
  if (memo.has(k)) return memo.get(k);
  const r = V.result(p);
  const w = r ? r.winner : V.legalMoves(p).some(m => brute(V.play(p, m), memo) === p.turn) ? p.turn : other(p.turn);
  memo.set(k, w);
  return w;
}
// Hráči do zápasů: engine podle úrovně, naivní ovečka (leze nahoru), náhodný hráč
const engineP = (eng, lv, rnd) => p => eng.chooseMove(p, lv, rnd);
const naiveSheep = rnd => p => { const ms = V.legalMoves(p), up = ms.filter(m => m.to > m.from), pool = up.length ? up : ms; return pool[Math.floor(rnd() * pool.length)]; };
const randomP = rnd => p => { const ms = V.legalMoves(p); return ms[Math.floor(rnd() * ms.length)]; };
function game(start, sheepP, wolvesP) {
  let p = V.startPosition(start), r, plies = 0;
  while (!(r = V.result(p))) { p = V.play(p, (p.turn === 'sheep' ? sheepP : wolvesP)(p)); plies++; }
  return { winner: r.winner, plies };
}
const sheepWins = (n, rnd, sheepP, wolvesP) => { let k = 0; for (let i = 0; i < n; i++) if (game(E.chooseStart(rnd), sheepP, wolvesP).winner === 'sheep') k++; return k; };

test('při dokonalé hře vyhrají vlci, ať ovečka začne kdekoli', () => {
  const eng = E.createEngine();
  for (const sq of V.SHEEP_STARTS) {
    assert.deepEqual(eng.solve(V.startPosition(sq)), { winner: 'wolves', plies: 44 }, sq);
  }
  assert.equal(brute(V.startPosition('d1'), new Map()), 'wolves', 'prosté prohledání');
});

test('přesný výsledek souhlasí s prostým prohledáním v náhodných rozehraných pozicích', () => {
  const rnd = lcg(3), eng = E.createEngine(), memo = new Map();
  const seen = { sheep: 0, wolves: 0 };
  for (let g = 0; g < 300; g++) {
    let p = V.startPosition(V.SHEEP_STARTS[Math.floor(rnd() * 4)]);
    const plies = Math.floor(rnd() * 30);
    for (let i = 0; i < plies && !V.result(p); i++) { const ms = V.legalMoves(p); p = V.play(p, ms[Math.floor(rnd() * ms.length)]); }
    if (V.result(p)) continue;
    const w = brute(p, memo);
    assert.equal(eng.solve(p).winner, w, V.key(p));
    seen[w]++;
  }
  assert.ok(seen.sheep > 30 && seen.wolves > 30, JSON.stringify(seen));
});

test('rozbor tahů: hodnocení odpovídá výsledku po tahu, nejlepší tah první', () => {
  const eng = E.createEngine();
  const p = V.play(V.startPosition('d1'), V.findMove(V.startPosition('d1'), 'd1', 'e2'));
  const a = eng.analyse(p);
  assert.equal(a.length, V.legalMoves(p).length);
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].score >= a[i].score);
  for (const m of a) {
    const after = eng.solve(V.play(p, V.findMove(p, m.from, m.to)));
    assert.equal(m.score > 0, after.winner === 'wolves', V.name(m.from) + '-' + V.name(m.to));
    assert.equal(E.MATE - Math.abs(m.score), after.plies + 1);
  }
  assert.equal(eng.analyse(pos('e8', ['a2'], 'wolves')), null, 'po konci hry nic');
});

test('výhru jedním tahem nevynechá, ani když má chybovat', () => {
  const eng = E.createEngine(), sloppy = { mistakes: 1 };
  // ovečka může hned na osmou řadu
  const p = pos('d7', ['b7', 'f7', 'h7', 'a8']);
  for (let s = 1; s <= 20; s++) assert.equal(V.rank(eng.chooseMove(p, sloppy, lcg(s)).to), 8);
  // vlk může ovečku hned chytit
  const q = pos('h1', ['h3', 'a8', 'c8', 'e8'], 'wolves');
  for (let s = 1; s <= 20; s++) assert.equal(V.moveText(eng.chooseMove(q, sloppy, lcg(s))), 'h3-g2');
});

test('chyba: z vyhrané pozice zahraje tah, po kterém prohrává, jinak vždy vyhrávající', () => {
  const eng = E.createEngine();
  const p = V.play(V.startPosition('d1'), V.findMove(V.startPosition('d1'), 'd1', 'e2')); // vlci na tahu, vyhrávají
  for (let s = 1; s <= 20; s++) {
    const bad = eng.chooseMove(p, { mistakes: 1 }, lcg(s));
    assert.equal(eng.solve(V.play(p, bad)).winner, 'sheep', 'chyba pustí ovečku');
    const good = eng.chooseMove(p, level('perfect'), lcg(s));
    assert.equal(eng.solve(V.play(p, good)).winner, 'wolves');
  }
  // chybovost podle strany na tahu
  for (let s = 1; s <= 20; s++) {
    const m = eng.chooseMove(p, { mistakes: { wolves: 0, sheep: 1 } }, lcg(s));
    assert.equal(eng.solve(V.play(p, m)).winner, 'wolves', 'vlci s nulovou chybovostí nechybují');
  }
  assert.equal(eng.chooseMove(pos('e8', ['a2'], 'wolves'), level('normal')), null, 'po konci hry žádný tah');
});

test('úrovně: Normální a Dokonalá', () => {
  assert.deepEqual(E.LEVELS.map(l => [l.id, l.name]), [['normal', 'Normální'], ['perfect', 'Dokonalá']]);
  assert.deepEqual(level('perfect').mistakes, { wolves: 0, sheep: 0 });
  const n = level('normal').mistakes;
  assert.ok(n.wolves > 0 && n.sheep > n.wolves, 'ovečka musí chybovat víc, jinak ji dítě nechytí');
});

test('dokonalí vlci vyhrají vždy, i proti dokonalé ovečce, ta se brání co nejdéle', () => {
  const rnd = lcg(5), eng = E.createEngine(), perfect = engineP(eng, level('perfect'), rnd);
  for (const sq of V.SHEEP_STARTS) assert.deepEqual(game(sq, perfect, perfect), { winner: 'wolves', plies: 44 }, sq);
  assert.equal(sheepWins(100, rnd, naiveSheep(rnd), perfect), 0);
  assert.equal(sheepWins(100, rnd, randomP(rnd), perfect), 0);
});

test('normální úroveň jde porazit za ovečku i za vlky', () => {
  const rnd = lcg(9), eng = E.createEngine();
  const normal = engineP(eng, level('normal'), rnd), perfect = engineP(eng, level('perfect'), rnd);
  // za ovečku: dokonalá ovečka vyhraje skoro vždy, naivní (jen leze nahoru) aspoň občas
  assert.ok(sheepWins(100, rnd, perfect, normal) >= 85);
  assert.ok(sheepWins(200, rnd, naiveSheep(rnd), normal) >= 100);
  // za vlky: vlci, kteří chybují v 10 % tahů, normální ovečku většinou chytí
  const kidWolves = engineP(eng, { mistakes: 0.1 }, rnd);
  assert.ok(200 - sheepWins(200, rnd, normal, kidWolves) >= 110);
  // dokonalí vlci normální ovečku chytí vždy
  assert.equal(sheepWins(50, rnd, normal, perfect), 0);
});

test('počítač za ovečku vybírá výchozí pole náhodně ze čtyř', () => {
  const rnd = lcg(2), seen = new Set();
  for (let i = 0; i < 100; i++) { const sq = E.chooseStart(rnd); assert.ok(V.SHEEP_STARTS.includes(sq)); seen.add(sq); }
  assert.equal(seen.size, 4);
});
