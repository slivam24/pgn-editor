// Trénink pěšci proti pěšcům: pravidla hry, konec hry, výchozí postavení a série kol
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../app/src/main/assets/www/trenink/pesci.js');
const { Chess } = require('../app/src/main/assets/www/chess.js');

const pos = (white, black, turn, ep) => P.fromSquares({ white, black, turn, ep });
const tahy = p => P.legalMoves(p).map(P.moveText).sort();
const zahraj = (p, from, to) => {
  const m = P.findMove(p, from, to);
  assert.ok(m, 'tah ' + from + '-' + to + ' není legální');
  return P.play(p, m);
};

/* ---------- Výchozí postavení ---------- */

test('výchozí postavení: odebírají se sloupce a, h, b, g, c, f, d, e', () => {
  assert.deepEqual(P.startFiles(8), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  assert.deepEqual(P.startFiles(7), ['b', 'c', 'd', 'e', 'f', 'g', 'h']);
  assert.deepEqual(P.startFiles(6), ['b', 'c', 'd', 'e', 'f', 'g']);
  assert.deepEqual(P.startFiles(5), ['c', 'd', 'e', 'f', 'g']);
  assert.deepEqual(P.startFiles(4), ['c', 'd', 'e', 'f']);
  assert.deepEqual(P.startFiles(3), ['d', 'e', 'f']);
  assert.deepEqual(P.startFiles(2), ['d', 'e']);
  assert.deepEqual(P.startFiles(1), ['e']);
  assert.throws(() => P.startFiles(0), RangeError);
  assert.throws(() => P.startFiles(9), RangeError);
  assert.throws(() => P.startFiles(2.5), RangeError);
});

test('výchozí postavení: každá strana podle svého počtu, bílý na tahu', () => {
  const p = P.startPosition(6, 8);
  assert.deepEqual(P.squares(p, 'w'), ['b2', 'c2', 'd2', 'e2', 'f2', 'g2']);
  assert.deepEqual(P.squares(p, 'b'), ['a7', 'b7', 'c7', 'd7', 'e7', 'f7', 'g7', 'h7']);
  assert.equal(p.turn, 'w');
  assert.equal(p.ep, -1);
  assert.equal(p.white, 6);
  assert.equal(p.black, 8);
  assert.deepEqual(P.squares(P.startPosition(8, 3), 'b'), ['d7', 'e7', 'f7']);
  assert.equal(P.result(P.startPosition(8, 8)), null);
  assert.equal(P.legalMoves(P.startPosition(8, 8)).length, 16);
});

test('zadání pozice hlídá nesmyslná pole', () => {
  assert.throws(() => pos(['e1'], ['e7']), /nemůže stát/);
  assert.throws(() => pos(['e2'], ['e8']), /nemůže stát/);
  assert.throws(() => pos(['e2', 'e2'], ['e7']), /už pěšec stojí/);
  assert.throws(() => pos(['i2'], ['e7']), /Neplatné pole/);
});

/* ---------- Tahy ---------- */

test('tah o jedno a o dvě pole, zablokovaný pěšec', () => {
  assert.deepEqual(tahy(pos(['e2'], ['a7'])), ['e3', 'e4']);
  assert.deepEqual(tahy(pos(['e3'], ['a7'])), ['e4'], 'o dvě jen z výchozí řady');
  assert.deepEqual(tahy(pos(['e2'], ['e4'])), ['e3'], 'o dvě nejde na obsazené pole');
  assert.deepEqual(tahy(pos(['e2'], ['e3'])), [], 'přes pěšce se nepřeskakuje');
  assert.deepEqual(tahy(pos(['e2', 'e3'], ['a7'])), ['e4'], 'ani přes vlastního');
  assert.deepEqual(tahy(pos(['a2'], ['h7'], 'b')), ['h5', 'h6']);
  assert.deepEqual(tahy(pos(['h6'], ['h7'], 'b')), []);
  const p = zahraj(P.startPosition(8, 8), 'e2', 'e4');
  assert.equal(p.turn, 'b');
  assert.equal(P.name(p.ep), 'e3');
  assert.equal(P.pieceAt(p, 'e4'), 'w');
  assert.equal(P.pieceAt(p, 'e2'), null);
});

test('braní šikmo dopředu, není povinné, nepřetéká přes kraj', () => {
  assert.deepEqual(tahy(pos(['e4'], ['d5', 'f5'])), ['e5', 'exd5', 'exf5']);
  assert.deepEqual(tahy(pos(['a4'], ['b5', 'h5'])), ['a5', 'axb5']);
  assert.deepEqual(tahy(pos(['h4'], ['g5', 'a5'])), ['h5', 'hxg5']);
  assert.deepEqual(tahy(pos(['e4'], ['e5', 'd3', 'f3'])), [], 'dozadu se nebere');
  assert.deepEqual(tahy(pos(['e4', 'd2'], ['d3'])), ['e5'], 'vlastního pěšce nebere a zablokovaný stojí');
  assert.deepEqual(tahy(pos(['d4', 'e3'], ['e5'], 'b')), ['e4', 'exd4']);
  const p = zahraj(pos(['e4', 'a2'], ['d5', 'h7']), 'e4', 'd5');
  assert.equal(p.black, 1);
  assert.equal(p.white, 2);
  assert.equal(P.pieceAt(p, 'd5'), 'w');
  assert.equal(P.pieceAt(p, 'e4'), null);
});

test('tah nemění původní pozici', () => {
  const p = P.startPosition(8, 8), k = P.key(p);
  zahraj(p, 'd2', 'd4');
  assert.equal(P.key(p), k);
  assert.equal(P.findMove(p, 'd2', 'd5'), null);
  assert.equal(P.findMove(p, 'd7', 'd5'), null, 'černý není na tahu');
});

test('braní mimochodem jen hned po dvojkroku, pro obě strany', () => {
  // černý táhne d7-d5 vedle bílého pěšce na e5
  let p = zahraj(pos(['e5', 'a2'], ['d7', 'h7'], 'b'), 'd7', 'd5');
  assert.equal(P.name(p.ep), 'd6');
  assert.deepEqual(tahy(p), ['a3', 'a4', 'e6', 'exd6 e.p.']);
  const q = zahraj(p, 'e5', 'd6');
  assert.equal(P.pieceAt(q, 'd5'), null, 'sebraný pěšec zmizí');
  assert.equal(P.pieceAt(q, 'd6'), 'w');
  assert.equal(q.black, 1);
  // když bílý táhne jinam, možnost zmizí
  p = zahraj(zahraj(p, 'a2', 'a3'), 'h7', 'h6');
  assert.ok(!tahy(p).some(t => t.includes('e.p.')));
  // po dvou krocích o jedno pole se mimochodem nebere
  p = zahraj(zahraj(zahraj(pos(['e5', 'a2'], ['d7', 'h7'], 'b'), 'd7', 'd6'), 'a2', 'a3'), 'd6', 'd5');
  assert.ok(!tahy(p).some(t => t.includes('e.p.')));
  // černý bere mimochodem bílého, který táhl c2-c4, a to z obou stran
  p = zahraj(pos(['c2', 'h2'], ['d4', 'b4', 'a7']), 'c2', 'c4');
  assert.deepEqual(tahy(p).filter(t => t.includes('e.p.')), ['bxc3 e.p.', 'dxc3 e.p.']);
  const r = zahraj(p, 'd4', 'c3');
  assert.equal(P.pieceAt(r, 'c4'), null);
  assert.equal(P.pieceAt(r, 'c3'), 'b');
  assert.equal(r.white, 1);
});

test('braní mimochodem jako jediný tah: není to pat', () => {
  const p = zahraj(pos(['e5'], ['e6', 'd7'], 'b'), 'd7', 'd5');
  assert.deepEqual(tahy(p), ['exd6 e.p.']);
  assert.equal(P.result(p), null);
  // bez dvojkroku by bílý neměl tah
  assert.equal(P.result(pos(['e5'], ['e6', 'd5'], 'w')).reason, 'stalemate');
});

// Tahy pěšců porovnané s chess.js v náhodně dohraných partiích. Králové stojí na 1. a 8. řadě
// na polích, kde pěšcům nepřekážejí a nejsou v šachu (pěšec nemůže krále odkrýt, takže
// legální tahy pěšců jsou v šachu i v této hře stejné).
test('tahy odpovídají pravidlům šachu (porovnání s chess.js)', () => {
  let seed = 11;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >>> 16) % n; };
  const kingSquare = (p, rank, enemy, dir) => {
    for (const f of [0, 7, 1, 6, 2, 5, 3, 4]) {
      const i = f + (rank - 1) * 8, from = i - dir * 8; // pole, ze kterého by soupeřův pěšec na krále táhl
      const near = [from, from - 1, from + 1].filter(j => j >= 0 && j < 64 && Math.abs((j & 7) - f) <= 1);
      if (!near.some(j => P.pieceAt(p, j) === enemy)) return P.name(i);
    }
    return null;
  };
  const fen = (p, wk, bk) => {
    const rows = [];
    for (let r = 7; r >= 0; r--) {
      let row = '', empty = 0;
      for (let f = 0; f < 8; f++) {
        const sq = P.name(f + r * 8), pc = P.pieceAt(p, sq);
        const ch = pc === 'w' ? 'P' : pc === 'b' ? 'p' : sq === wk ? 'K' : sq === bk ? 'k' : '';
        if (!ch) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += ch;
      }
      rows.push(row + (empty || ''));
    }
    return rows.join('/') + ' ' + p.turn + ' - ' + (p.ep >= 0 ? P.name(p.ep) : '-') + ' 0 1';
  };
  let compared = 0, ep = 0;
  for (let g = 0; g < 400; g++) {
    let p = P.startPosition(1 + rnd(8), 1 + rnd(8));
    while (!P.result(p)) {
      const wk = kingSquare(p, 1, 'b', -1), bk = kingSquare(p, 8, 'w', 1);
      if (wk && bk) {
        const c = new Chess();
        assert.ok(c.load(fen(p, wk, bk)), fen(p, wk, bk));
        const want = [...new Set(c.moves({ verbose: true }).filter(m => m.piece === 'p').map(m => m.from + m.to))].sort();
        const got = P.legalMoves(p).map(m => P.name(m.from) + P.name(m.to)).sort();
        assert.deepEqual(got, want, fen(p, wk, bk));
        compared++;
      }
      const ms = P.legalMoves(p);
      const m = ms[rnd(ms.length)];
      if (m.enPassant) ep++;
      p = P.play(p, m);
    }
  }
  assert.ok(compared > 3000, 'porovnaných pozic: ' + compared);
  assert.ok(ep > 10, 'v náhodných partiích se mimochodem bralo ' + ep + '×');
});

/* ---------- Konec hry ---------- */

test('výhra dojitím na poslední řadu', () => {
  let p = zahraj(pos(['b7'], ['a2', 'h7']), 'b7', 'b8');
  assert.deepEqual(P.result(p), { winner: 'w', reason: 'lastRank' });
  p = zahraj(pos(['h4', 'a3'], ['b2'], 'b'), 'b2', 'b1');
  assert.deepEqual(P.result(p), { winner: 'b', reason: 'lastRank' });
  // rozhoduje, i když má soupeř víc pěšců a táhnout by mohl
  p = zahraj(pos(['g7'], ['a7', 'b7', 'c7']), 'g7', 'g8');
  assert.equal(P.result(p).winner, 'w');
});

test('výhra sebráním posledního pěšce, i mimochodem', () => {
  let p = zahraj(pos(['e4', 'a2'], ['d5']), 'e4', 'd5');
  assert.deepEqual(P.result(p), { winner: 'w', reason: 'noPawns' });
  p = zahraj(zahraj(pos(['e5', 'a2'], ['d7'], 'b'), 'd7', 'd5'), 'e5', 'd6');
  assert.deepEqual(P.result(p), { winner: 'w', reason: 'noPawns' });
  p = zahraj(pos(['e4'], ['d5', 'h7'], 'b'), 'd5', 'e4');
  assert.deepEqual(P.result(p), { winner: 'b', reason: 'noPawns' });
});

test('žádný pěšec rozhoduje dřív než pat', () => {
  // bílý nemá pěšce, a tedy ani tah; podle patu by s menším počtem vyhrál, ale prohrál
  assert.deepEqual(P.result(pos([], ['e5'], 'w')), { winner: 'b', reason: 'noPawns' });
  assert.deepEqual(P.result(pos(['e4'], [], 'b')), { winner: 'w', reason: 'noPawns' });
});

test('pat při stejném počtu pěšců vyhrává černý, ať je patovaný kdokoli', () => {
  // bílý táhne e3-e4 a černý zůstane bez tahu
  let p = zahraj(pos(['e3', 'a4'], ['e5', 'a5']), 'e3', 'e4');
  assert.deepEqual(P.result(p), { winner: 'b', reason: 'stalemate', stalemated: 'b' });
  // černý táhne e7-e5 a bílý zůstane bez tahu
  p = zahraj(pos(['e4'], ['e7'], 'b'), 'e7', 'e5');
  assert.deepEqual(P.result(p), { winner: 'b', reason: 'stalemate', stalemated: 'w' });
  // když jde brát, pat to není
  assert.equal(P.result(pos(['e4', 'd4'], ['e5', 'd5'], 'b')), null);
});

test('pat při nestejném počtu vyhrává strana s menším počtem pěšců', () => {
  // bílý má méně a je patovaný
  assert.deepEqual(P.result(pos(['a4'], ['a5', 'h5'], 'w')), { winner: 'w', reason: 'stalemate', stalemated: 'w' });
  // bílý má méně, patovaný je černý (h6 stojí za vlastním pěšcem)
  assert.deepEqual(P.result(pos(['h4'], ['h5', 'h6'], 'b')), { winner: 'w', reason: 'stalemate', stalemated: 'b' });
  // černý má méně a je patovaný
  assert.deepEqual(P.result(pos(['a4', 'a3'], ['a5'], 'b')), { winner: 'b', reason: 'stalemate', stalemated: 'b' });
  // černý má méně, patovaný je bílý
  assert.deepEqual(P.result(pos(['a4', 'a3'], ['a5'], 'w')), { winner: 'b', reason: 'stalemate', stalemated: 'w' });
  assert.equal(P.stalemateWinner(3, 3), 'b');
  assert.equal(P.stalemateWinner(2, 3), 'w');
  assert.equal(P.stalemateWinner(3, 2), 'b');
});

/* ---------- Série kol ---------- */

test('série: příklad 8-8, bílý, 7-8, bílý, 6-8, černý, 6-7', () => {
  const s0 = P.newSeries();
  assert.deepEqual([s0.white, s0.black, s0.round, s0.winner], [8, 8, 1, null]);
  const s1 = P.nextRound(s0, 'w');
  assert.deepEqual([s1.white, s1.black], [7, 8]);
  const s2 = P.nextRound(s1, 'w');
  assert.deepEqual([s2.white, s2.black], [6, 8]);
  const s3 = P.nextRound(s2, 'b');
  assert.deepEqual([s3.white, s3.black], [6, 7]);
  assert.deepEqual(s3.wins, { w: 2, b: 1 });
  assert.equal(s3.round, 4);
  assert.equal(s3.winner, null);
  assert.deepEqual(s3.history, [{ white: 8, black: 8, winner: 'w' }, { white: 7, black: 8, winner: 'w' }, { white: 6, black: 8, winner: 'b' }]);
  // předchozí stav série se nemění
  assert.deepEqual([s0.white, s0.black, s0.wins.w, s0.history.length], [8, 8, 0, 0]);
});

test('série: kdo vyhraje kolo se třemi pěšci, vyhrál sérii', () => {
  let s = P.newSeries({ white: 3, black: 5 });
  s = P.nextRound(s, 'b');
  assert.deepEqual([s.white, s.black, s.winner], [3, 4, null], 'poražený si počet ponechá');
  s = P.nextRound(s, 'w');
  assert.equal(s.winner, 'w');
  assert.deepEqual([s.white, s.black], [3, 4], 'po konci série se počty nemění');
  assert.deepEqual(s.wins, { w: 1, b: 1 });
  assert.throws(() => P.nextRound(s, 'b'), /skončila/);
  assert.equal(P.nextRound(P.newSeries({ white: 4, black: 3 }), 'b').winner, 'b');
});

test('série: nejmenší počet jde změnit, chybné zadání se odmítne', () => {
  assert.equal(P.newSeries().minPawns, 3);
  const s = P.nextRound(P.newSeries({ white: 2, black: 2, minPawns: 1 }), 'w');
  assert.deepEqual([s.white, s.winner], [1, null]);
  assert.equal(P.nextRound(s, 'w').winner, 'w');
  assert.throws(() => P.newSeries({ white: 2 }), RangeError);
  assert.throws(() => P.newSeries({ black: 9 }), RangeError);
  assert.throws(() => P.nextRound(P.newSeries(), 'x'), /w nebo b/);
});

test('série od 8-8 vždy skončí po 6 až 11 kolech', () => {
  let seed = 3;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >>> 16) % 2; };
  for (let k = 0; k < 500; k++) {
    let s = P.newSeries();
    while (!s.winner) {
      s = P.nextRound(s, rnd() ? 'w' : 'b');
      assert.ok(s.white >= 3 && s.black >= 3);
    }
    const rounds = s.round - 1;
    assert.ok(rounds >= 6 && rounds <= 11, 'kol: ' + rounds);
    assert.equal(s.wins[s.winner], 6, 'vítěz série vyhrál šest kol');
  }
});
