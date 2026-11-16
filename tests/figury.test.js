// Výuka tahů figur: každá úroveň musí jít vyřešit a pravidla pohybu musí odpovídat šachu
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../app/src/main/assets/www/vyuka/figury.js');
const { Chess } = require('../app/src/main/assets/www/chess.js');

test('každá úroveň jde vyřešit a nezačíná na hlídaném poli', () => {
  let n = 0;
  for (const ch of F.CHAPTERS) {
    assert.equal(ch.levels.length, 6, ch.name);
    for (const lv of ch.levels) {
      const opt = F.solve(lv);
      assert.ok(Number.isFinite(opt) && opt >= 1, ch.name + ' ' + lv.n + ' nejde vyřešit');
      assert.ok(opt <= 15, ch.name + ' ' + lv.n + ' je moc dlouhá: ' + opt);
      const all = [lv.start].concat(lv.stars, Object.keys(lv.black), lv.target && lv.target !== '8' ? [lv.target] : []);
      assert.equal(new Set(all).size, all.length, ch.name + ' ' + lv.n + ': dvě věci na stejném poli');
      if (lv.safe) assert.ok(!F.guarded(lv.black).has(F.idx(lv.start)), ch.name + ' ' + lv.n + ' začíná na hlídaném poli');
      n++;
    }
  }
  assert.equal(n, 36);
});

test('jezdec z rohu do rohu potřebuje 6 tahů', () => {
  assert.equal(F.solve({ piece: 'n', start: 'a1', target: 'h8', stars: [], black: {}, goal: 'target' }), 6);
});

// Pohyb figury na šachovnici bez krále porovnaný s chess.js (bílý král stranou na h1, černý na a8)
test('tahy figur odpovídají pravidlům šachu', () => {
  let seed = 4;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let k = 0; k < 400; k++) {
    const piece = 'rbqnkp'[k % 6];
    const free = [];
    for (let i = 0; i < 64; i++) if (!['h1', 'a8', 'h2', 'g1', 'g2', 'a7', 'b8', 'b7'].includes(F.name(i))) free.push(i);
    let from = free[rnd(free.length)];
    if (piece === 'p') from = 8 + rnd(40); // pěšec na 2. až 6. řadě
    const black = {};
    for (let j = 0; j < 5; j++) { const t = free[rnd(free.length)]; if (t !== from) black[F.name(t)] = 'nbrqp'[rnd(5)]; }
    Object.keys(black).forEach(sq => { if (black[sq] === 'p' && (sq[1] === '1' || sq[1] === '8')) delete black[sq]; });
    if (F.name(from) in black) delete black[F.name(from)];
    const c = new Chess();
    c.clear();
    // bílý král stojí stranou, jen když se nezkouší sám král (dva bílí králové být nesmějí)
    if (piece !== 'k') c.put({ type: 'k', color: 'w' }, 'h1');
    c.put({ type: 'k', color: 'b' }, 'a8');
    assert.ok(c.put({ type: piece, color: 'w' }, F.name(from)));
    Object.keys(black).forEach(sq => c.put({ type: black[sq], color: 'b' }, sq));
    const want = c.moves({ square: F.name(from), verbose: true, legal: false }).map(m => m.to).filter((v, i, a) => a.indexOf(v) === i).sort();
    const got = F.targets(piece, from, black, 'w').map(F.name).filter(sq => sq !== 'h1' && sq !== 'a8').sort();
    // chess.js nepustí figuru na pole s vlastním králem ani ho nepřeskočí; ta pole jsou z porovnání vynechaná
    const near = sq => ['h1', 'a8'].some(kq => sq === kq);
    assert.deepEqual(got.filter(x => want.includes(x) || !near(x)), want.filter(x => !near(x)), piece + ' z ' + F.name(from) + ' ' + JSON.stringify(black));
  }
});

test('trénink: vymyšlená cvičení jdou vyřešit a odpovídají obtížnosti', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
  const range = { 1: [2, 5], 2: [3, 7], 3: [4, 9] };
  for (const pc of 'rbqknp') for (const d of [1, 2, 3]) for (let k = 0; k < 25; k++) {
    const lv = F.generate(pc, d, rnd);
    assert.ok(lv, 'nevymyšleno: ' + pc + ' ' + d);
    const opt = F.solve(lv);
    assert.equal(opt, lv.opt);
    assert.ok(opt >= range[d][0] && opt <= range[d][1], pc + ' ' + d + ': ' + opt);
    if (lv.safe) assert.ok(!F.guarded(lv.black).has(F.idx(lv.start)), 'začíná na hlídaném poli');
    const all = [lv.start].concat(lv.stars, Object.keys(lv.black));
    assert.equal(new Set(all).size, all.length, 'dvě věci na stejném poli ' + JSON.stringify(lv));
    if (pc === 'b') { const c = sq => (F.idx(sq) % 8 + Math.floor(F.idx(sq) / 8)) % 2; lv.stars.forEach(s => assert.equal(c(s), c(lv.start))); }
    Object.entries(lv.black).forEach(([sq, t]) => { if (t === 'p') assert.ok(sq[1] !== '1' && sq[1] !== '8', 'pěšec na kraji'); });
  }
});
