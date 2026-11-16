// Trénink pěšci proti pěšcům: počítačový soupeř (minimax s alfa-beta a tabulkou pozic)
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../app/src/main/assets/www/trenink/pesci.js');
const E = require('../app/src/main/assets/www/trenink/pesci-engine.js');

const pos = (white, black, turn, ep) => P.fromSquares({ white, black, turn, ep });
const lcg = s => () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s >>> 8) / 0x800000; };
const pick = (rnd, n) => Math.floor(rnd() * n);
// Úrovně bez časového limitu, s pevným počtem uzlů: zkoušky dopadnou pokaždé stejně
const level = (id, extra) => Object.assign({}, E.LEVELS.find(l => l.id === id), { timeLimit: 0, maxNodes: 60000 }, extra);

// Výsledek při dokonalé hře prostým prohledáním přes pravidla z pesci.js (pomalé, jen pro malé pozice)
function brute(p, memo) {
  const k = P.key(p);
  if (memo.has(k)) return memo.get(k);
  const r = P.result(p);
  let w;
  if (r) w = r.winner;
  else w = P.legalMoves(p).some(m => brute(P.play(p, m), memo) === p.turn) ? p.turn : (p.turn === 'w' ? 'b' : 'w');
  memo.set(k, w);
  return w;
}
// Náhodné pozice z rozehraných partií
function randomPositions(rnd, count, maxW, maxB) {
  const out = [];
  while (out.length < count) {
    let p = P.startPosition(1 + pick(rnd, maxW), 1 + pick(rnd, maxB));
    const plies = pick(rnd, 12);
    for (let i = 0; i < plies && !P.result(p); i++) { const ms = P.legalMoves(p); p = P.play(p, ms[pick(rnd, ms.length)]); }
    if (!P.result(p)) out.push(p);
  }
  return out;
}

test('vlastní generátor tahů enginu odpovídá pravidlům', () => {
  const rnd = lcg(5);
  let n = 0;
  for (let g = 0; g < 200; g++) {
    let p = P.startPosition(1 + pick(rnd, 8), 1 + pick(rnd, 8));
    while (!P.result(p)) {
      const want = P.legalMoves(p).map(m => {
        const r = P.result(P.play(p, m));
        const win = !!r && r.winner === p.turn && r.reason !== 'stalemate';
        return m.from + '-' + m.to + (win ? '!' : '');
      }).sort();
      const got = E.moveList(p).map(m => m.from + '-' + m.to + (m.win ? '!' : '')).sort();
      assert.deepEqual(got, want, P.key(p));
      n++;
      const ms = P.legalMoves(p);
      p = P.play(p, ms[pick(rnd, ms.length)]);
    }
  }
  assert.ok(n > 2000);
});

test('přesný výsledek souhlasí s prostým prohledáním: výchozí postavení do 3 pěšců', () => {
  const eng = E.createEngine({ ttBits: 16 });
  for (let a = 1; a <= 3; a++) for (let b = 1; b <= 3; b++) {
    const p = P.startPosition(a, b);
    assert.equal(eng.solve(p).winner, brute(p, new Map()), a + ' proti ' + b);
  }
});

test('přesný výsledek souhlasí s prostým prohledáním: náhodné rozehrané pozice', () => {
  const eng = E.createEngine({ ttBits: 16 });
  const memo = new Map();
  for (const p of randomPositions(lcg(21), 150, 4, 3)) {
    assert.equal(eng.solve(p).winner, brute(p, memo), P.key(p));
    const d = eng.solve(p, { distance: true });
    assert.equal(d.winner, brute(p, memo), 'se vzdáleností ' + P.key(p));
  }
});

test('známé výsledky: 2 proti 2 a 3 proti 3 černý, 4 proti 4 bílý', () => {
  assert.equal(E.solve(P.startPosition(2, 2)).winner, 'b');
  assert.equal(E.solve(P.startPosition(3, 3)).winner, 'b');
  assert.equal(E.solve(P.startPosition(4, 4)).winner, 'w');
  assert.equal(E.solve(P.startPosition(4, 5)).winner, 'b');
});

test('počet půltahů do konce a nejrychlejší výhra', () => {
  assert.equal(E.solve(pos(['b7'], ['a7'], 'w'), { distance: true }).plies, 1);
  // bílý vyhraje hned tahem g8, nebo později pěšcem a: engine volí g8
  const p = pos(['g7', 'a5'], ['h3'], 'w');
  const a = E.analyse(p, { depth: Infinity });
  assert.ok(a.exact);
  assert.deepEqual(a.best.map(P.moveText), ['g8']);
  assert.equal(a.score, E.MATE - 1);
  // černý vyhraje za 3 půltahy (h2, h1), bílý nestihne nic
  const q = pos(['a4'], ['h3'], 'b');
  assert.equal(E.solve(q, { distance: true }).plies, 3);
});

test('zastaví soupeřova pěšce, který by došel na poslední řadu', () => {
  // černý d3 hrozí d2 a d1 nebo braním na c2; vyhrává jen cxd3, všechny ostatní tahy prohrají
  const p = pos(['c2', 'g4'], ['d3', 'g5', 'h7'], 'w');
  for (const m of P.legalMoves(p)) assert.equal(E.solve(P.play(p, m)).winner, P.moveText(m) === 'cxd3' ? 'w' : 'b', P.moveText(m));
  for (const id of ['medium', 'hard']) assert.equal(P.moveText(E.createEngine().chooseMove(p, level(id), lcg(1))), 'cxd3', id);
});

test('těžká úroveň v malých pozicích vždy zvolí vyhrávající tah, když nějaký je', () => {
  const memo = new Map(), eng = E.createEngine({ ttBits: 16 });
  let wins = 0;
  for (const p of randomPositions(lcg(33), 150, 4, 3)) {
    if (brute(p, memo) !== p.turn) continue;
    wins++;
    const m = eng.chooseMove(p, level('hard', { maxNodes: 0 }), lcg(wins));
    assert.equal(brute(P.play(p, m), memo), p.turn, P.key(p) + ' ' + P.moveText(m));
  }
  assert.ok(wins > 30, 'vyhraných pozic: ' + wins);
});

test('výhru jedním tahem nevynechá ani nejlehčí úroveň, i když by měla chybovat', () => {
  const p = pos(['b7', 'e2'], ['a7', 'h7'], 'w');
  for (let s = 1; s <= 30; s++) assert.equal(P.moveText(E.chooseMove(p, level('easy', { blunder: 1 }), lcg(s))), 'b8');
  // sebrání posledního pěšce je také výhra jedním tahem
  const q = pos(['e4', 'a2'], ['d5'], 'w');
  for (let s = 1; s <= 10; s++) assert.equal(P.moveText(E.chooseMove(q, level('easy', { blunder: 1 }), lcg(s))), 'exd5');
});

test('chyba: s pravděpodobností blunder zahraje horší tah, jinak nejlepší', () => {
  const p = pos(['c2', 'g4'], ['d3', 'g5', 'h7'], 'w');
  const eng = E.createEngine();
  for (let s = 1; s <= 20; s++) assert.notEqual(P.moveText(eng.chooseMove(p, level('medium', { blunder: 1 }), lcg(s))), 'cxd3');
  for (let s = 1; s <= 20; s++) assert.equal(P.moveText(eng.chooseMove(p, level('medium', { blunder: 0 }), lcg(s))), 'cxd3');
  // každý vrácený tah je legální tah z pravidel
  const m = eng.chooseMove(P.startPosition(8, 8), level('easy'), lcg(3));
  assert.ok(P.legalMoves(P.startPosition(8, 8)).some(x => x.from === m.from && x.to === m.to));
  assert.equal(eng.chooseMove(pos(['b8'], ['a7'], 'b'), level('easy')), null, 'po konci hry žádný tah');
});

test('v malé pozici hledá do konce, ve velké skončí podle limitu', () => {
  const a = E.createEngine().analyse(P.startPosition(4, 4), { depth: Infinity });
  assert.ok(a.exact, '4 proti 4 se prohledá celé');
  assert.ok(a.score > E.MATE - 100, 'bílý vyhrává');
  const b = E.createEngine().analyse(P.startPosition(8, 8), { depth: Infinity, maxNodes: 50000 });
  assert.ok(!b.exact && b.depth >= 2 && b.nodes < 60000, JSON.stringify({ d: b.depth, n: b.nodes }));
  const c = E.createEngine().analyse(P.startPosition(8, 8), { depth: 3 });
  assert.equal(c.depth, 3);
  assert.equal(E.createEngine().solve(P.startPosition(8, 8), { maxNodes: 20000 }), null, 'nedořešeno v limitu');
  // časový limit
  const t = Date.now();
  E.createEngine().analyse(P.startPosition(8, 8), { depth: Infinity, timeLimit: 100 });
  assert.ok(Date.now() - t < 1000);
});

test('úrovně: od lehké k těžké roste hloubka a ubývá chyb', () => {
  assert.deepEqual(E.LEVELS.map(l => l.id), ['easy', 'medium', 'hard']);
  for (let i = 1; i < E.LEVELS.length; i++) {
    assert.ok(E.LEVELS[i].depth > E.LEVELS[i - 1].depth);
    assert.ok(E.LEVELS[i].blunder < E.LEVELS[i - 1].blunder);
  }
});

// Partie dvou enginů; vrací vítěze
function game(a, b, lw, lb, rnd) {
  const ew = E.createEngine({ ttBits: 16 }), eb = E.createEngine({ ttBits: 16 });
  let p = P.startPosition(a, b);
  while (!P.result(p)) p = P.play(p, (p.turn === 'w' ? ew : eb).chooseMove(p, p.turn === 'w' ? lw : lb, rnd));
  return P.result(p).winner;
}
const score = (n, a, b, lw, lb, seed) => { const rnd = lcg(seed); let w = 0; for (let k = 0; k < n; k++) if (game(a, b, lw, lb, rnd) === 'w') w++; return w; };

test('nejlehčí úroveň jde porazit', () => {
  // obyčejné hledání o dva půltahy bez chyb vyhraje bílými proti nejlehčí úrovni většinu partií
  const d2 = { depth: 2, blunder: 0, maxNodes: 60000 };
  assert.ok(score(16, 8, 8, d2, level('easy'), 7) >= 10, '8 proti 8');
  // 3 proti 3 je při dokonalé hře výhra černého, nejlehčí úroveň ji ale pustí
  assert.equal(score(8, 3, 3, level('hard'), level('easy'), 8), 8);
});

test('silnější úroveň porazí slabší', () => {
  assert.ok(score(10, 8, 8, level('hard'), level('easy'), 11) >= 9, 'těžká bílými proti lehké');
  assert.ok(score(10, 8, 8, level('easy'), level('hard'), 12) <= 1, 'lehká bílými proti těžké');
  assert.ok(score(10, 8, 8, level('medium'), level('easy'), 13) >= 6, 'střední bílými proti lehké');
});
