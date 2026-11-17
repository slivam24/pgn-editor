// Trénink vlci a ovečka: pravidla hry, výchozí postavení a konec hry
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../app/src/main/assets/www/trenink/vlci.js');

const pos = (sheep, wolves, turn) => V.fromSquares({ sheep, wolves, turn });
const tahy = p => V.legalMoves(p).map(V.moveText).sort();
const kam = p => V.legalMoves(p).map(m => V.name(m.to)).sort();
const zahraj = (p, from, to) => {
  const m = V.findMove(p, from, to);
  assert.ok(m, 'tah ' + from + '-' + to + ' není legální');
  return V.play(p, m);
};

test('bílá pole: b1, d1, f1, h1 na první řadě, a8, c8, e8, g8 na osmé', () => {
  const light = r => 'abcdefgh'.split('').map(f => f + r).filter(sq => V.isLight(V.idx(sq)));
  assert.deepEqual(light(1), V.SHEEP_STARTS);
  assert.deepEqual(light(8), V.WOLF_STARTS);
  assert.ok(!V.isLight(V.idx('a1')));
  assert.ok(V.isLight(V.idx('e4')));
});

test('výchozí postavení: vlci na osmé řadě, ovečka na zvoleném poli první řady, začíná ovečka', () => {
  for (const sq of V.SHEEP_STARTS) {
    const p = V.startPosition(sq);
    assert.equal(V.name(p.sheep), sq);
    assert.deepEqual(p.wolves.map(V.name), ['a8', 'c8', 'e8', 'g8']);
    assert.equal(p.turn, 'sheep');
    assert.equal(V.result(p), null);
  }
  assert.throws(() => V.startPosition('a1'), /bílém poli/);
  assert.throws(() => V.startPosition('e4'), /první řadě/);
  assert.throws(() => V.startPosition('x1'), /Neplatné pole/);
});

test('zadání pozice hlídá černá pole a obsazená pole', () => {
  assert.throws(() => pos('d2', ['a8']), /bílém poli/);
  assert.throws(() => pos('e4', ['a7']), /bílém poli/);
  assert.throws(() => pos('e4', ['c8', 'c8']), /už vlk stojí/);
  assert.throws(() => pos('e4', ['e4']), /stojí vlk/);
});

test('ovečka táhne o jedno pole šikmo všemi směry', () => {
  assert.deepEqual(kam(V.startPosition('d1')), ['c2', 'e2']);
  assert.deepEqual(kam(V.startPosition('h1')), ['g2']);
  assert.deepEqual(kam(pos('e4', ['a8'])), ['d3', 'd5', 'f3', 'f5']);
  assert.deepEqual(kam(pos('a2', ['g8'])), ['b1', 'b3'], 'na kraji jen dvě pole');
  assert.deepEqual(kam(pos('h7', ['a8'])), ['g6', 'g8']);
});

test('vlci táhnou jen šikmo dopředu, tedy dolů', () => {
  const p = zahraj(V.startPosition('d1'), 'd1', 'e2');
  assert.equal(p.turn, 'wolves');
  assert.deepEqual(tahy(p), ['a8-b7', 'c8-b7', 'c8-d7', 'e8-d7', 'e8-f7', 'g8-f7', 'g8-h7']);
  assert.deepEqual(kam(pos('a2', ['e4'], 'wolves')), ['d3', 'f3']);
  assert.deepEqual(kam(pos('a2', ['h3'], 'wolves')), ['g2']);
  assert.deepEqual(tahy(pos('a2', ['d1'], 'wolves')), [], 'na první řadě už vlk táhnout nemůže');
});

test('nebere se: na obsazené pole táhnout nejde', () => {
  assert.deepEqual(kam(pos('e4', ['d5', 'f5'])), ['d3', 'f3'], 'ovečka nepřeskočí ani nesebere vlka');
  assert.deepEqual(kam(pos('e4', ['d5'], 'wolves')), ['c4'], 'vlk nesebere ovečku');
  assert.deepEqual(kam(pos('a2', ['d5', 'c4'], 'wolves')), ['b3', 'd3', 'e4'], 'vlk nestoupne na vlka');
});

test('tah nemění původní pozici, na tahu se střídají', () => {
  const p = V.startPosition('f1'), k = V.key(p);
  const q = zahraj(p, 'f1', 'g2');
  assert.equal(V.key(p), k);
  assert.equal(q.turn, 'wolves');
  assert.equal(V.findMove(q, 'g2', 'h3'), null, 'ovečka není na tahu');
  const r = zahraj(q, 'c8', 'd7');
  assert.equal(r.turn, 'sheep');
  assert.deepEqual(r.wolves.map(V.name), ['d7', 'a8', 'e8', 'g8'].map(V.idx).sort((a, b) => a - b).map(V.name));
});

test('ovečka vyhraje, když dojde na osmou řadu', () => {
  const p = zahraj(pos('d7', ['b7', 'f7', 'h7', 'a8']), 'd7', 'e8');
  assert.deepEqual(V.result(p), { winner: 'sheep', reason: 'escaped' });
  assert.deepEqual(V.result(pos('c8', ['a2'], 'wolves')), { winner: 'sheep', reason: 'escaped' });
});

test('vlci vyhrají, když ovečka nemá kam táhnout', () => {
  assert.deepEqual(V.result(pos('e4', ['d5', 'f5', 'd3', 'f3'], 'sheep')), { winner: 'wolves', reason: 'trapped' });
  assert.deepEqual(V.result(pos('h1', ['g2'], 'sheep')), { winner: 'wolves', reason: 'trapped' });
  assert.deepEqual(V.result(pos('a2', ['b1', 'b3'], 'sheep')), { winner: 'wolves', reason: 'trapped' });
  // když jsou na tahu vlci, ovečka ještě chycená není
  assert.equal(V.result(pos('e4', ['d5', 'f5', 'd3', 'f3'], 'wolves')), null);
  // poslední tah vlka ovečku chytí
  const p = zahraj(pos('h1', ['h3', 'a8'], 'wolves'), 'h3', 'g2');
  assert.deepEqual(V.result(p), { winner: 'wolves', reason: 'trapped' });
});

test('když vlci nemají tah, vyhrává ovečka', () => {
  assert.deepEqual(V.result(pos('e4', ['b1', 'd1', 'f1', 'h1'], 'wolves')), { winner: 'sheep', reason: 'wolvesStuck' });
  // vlk zablokovaný ovečkou a krajem
  assert.deepEqual(V.result(pos('g2', ['h3'], 'wolves')), { winner: 'sheep', reason: 'wolvesStuck' });
  // ovečka na tahu se stejnými vlky: hraje se dál
  assert.equal(V.result(pos('e4', ['b1', 'd1', 'f1', 'h1'], 'sheep')), null);
});

test('náhodné partie: všechno na bílých polích, vlci nejvýš 28 tahů, hra vždy skončí', () => {
  let seed = 17;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >>> 16) % n; };
  const wins = { sheep: 0, wolves: 0 }, reasons = new Set();
  for (let g = 0; g < 2000; g++) {
    let p = V.startPosition(V.SHEEP_STARTS[rnd(4)]), wolfMoves = 0, r;
    while (!(r = V.result(p))) {
      const ms = V.legalMoves(p);
      if (p.turn === 'wolves') wolfMoves++;
      p = V.play(p, ms[rnd(ms.length)]);
      assert.ok(V.isLight(p.sheep) && p.wolves.every(V.isLight));
      assert.equal(new Set(p.wolves.concat(p.sheep)).size, 5);
      assert.ok(wolfMoves <= 28);
    }
    wins[r.winner]++; reasons.add(r.reason);
  }
  assert.ok(wins.sheep > 0 && wins.wolves > 0, JSON.stringify(wins));
  assert.ok(reasons.has('escaped') && reasons.has('trapped'), [...reasons].join());
});
