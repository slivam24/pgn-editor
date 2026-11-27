// Matové koncovky: výpočet délky matu (tools/koncovky.js) a sbírka výchozích pozic (vyuka/koncovky.txt)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const K = require('../tools/koncovky.js');
const { Chess } = require('../app/src/main/assets/www/chess.js');

const TXT = fs.readFileSync(path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'vyuka', 'koncovky.txt'), 'utf8');
const lines = TXT.trim().split('\n').filter(l => l && l[0] !== '#').map(l => { const [v, fen, dtm] = l.split('|'); return { v, fen, dtm: +dtm }; });
const header = {};
TXT.split('\n').forEach(l => { const m = /^# (\w+): .*nejdelší mat (\d+)/.exec(l); if (m) header[m[1]] = +m[2]; });
const idx = sq => 'abcdefgh'.indexOf(sq[0]) + (+sq[1] - 1) * 8;
const lcg = a => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// Index pozice v tabulce z FEN (bílý král, černý král, figury v pořadí varianty)
function indexOf(fen, pieces) {
  const c = new Chess(fen), sq = { K: [], k: [], Q: [], R: [], B: [], N: [] };
  c.board().forEach((row, r) => row.forEach((p, f) => { if (p) sq[p.color === 'w' ? p.type.toUpperCase() : p.type].push(f + (7 - r) * 8); }));
  let i = sq.K[0] | (sq.k[0] << 6);
  const used = {};
  pieces.forEach((p, k) => { const t = p.toUpperCase(); used[t] = (used[t] || 0) + 1; i |= sq[t][used[t] - 1] << (12 + 6 * k); });
  return i;
}

test('nejdelší maty odpovídají teorii koncovek', () => {
  assert.equal(K.solve(['q']).max, 10);
  assert.equal(K.solve(['r']).max, 16);
  // čtyřkamenové tabulky se počítají přes minutu, ověří se z hlavičky sbírky (zapisuje ji nástroj)
  assert.deepEqual(header, { q: 10, r: 16, rr: 7, qr: 6, bb: 19, bn: 33 });
});

// Nezávislá kontrola tabulky: tahy generuje chess.js. Bílý na tahu s matem za d: některý tah vede
// do pozice, kde černý prohrává za d - 1, a žádný kratší. Černý na tahu prohrávající za d: žádný
// jeho tah neunikne (ani braním) a nejdelší obrana vede do pozice s matem právě za d.
test('tabulka dámy a věže souhlasí s tahy podle chess.js', () => {
  for (const p of ['q', 'r']) {
    const res = K.solve([p]), rnd = lcg(p === 'q' ? 1 : 2);
    let checked = 0;
    while (checked < 300) {
      const i = Math.floor(rnd() * res.size), d = res.wtm[i];
      if (!d) continue;
      const fen = K.fen(i, [p]), c = new Chess(fen);
      const after = c.moves({ verbose: true }).map(m => { c.move(m); const f = c.fen(); const q = indexOf(f.replace(' b ', ' w '), [p]); c.undo(); return { m, q }; });
      const lost = after.map(x => res.btm[x.q]).filter(v => v > 0).map(v => v - 1);
      assert.equal(Math.min(...lost), d - 1, fen);
      // za nejlepším tahem bílého: černý na tahu
      const best = after.find(x => res.btm[x.q] === d);
      c.move(best.m);
      if (d === 1) assert.ok(c.in_checkmate(), fen + ' ' + best.m.san);
      else {
        const replies = c.moves({ verbose: true });
        assert.ok(replies.length && !replies.some(m => m.captured), 'černý neunikne: ' + c.fen());
        const vals = replies.map(m => { c.move(m); const v = res.wtm[indexOf(c.fen(), [p])]; c.undo(); return v; });
        assert.ok(vals.every(v => v > 0), 'každá obrana prohrává: ' + c.fen());
        assert.equal(Math.max(...vals), d - 1, c.fen());
      }
      checked++;
    }
  }
});

test('sbírka: šest variant po 40 pozicích, všechny platné a bílý na tahu', () => {
  const by = {};
  lines.forEach(l => { (by[l.v] = by[l.v] || []).push(l); });
  assert.deepEqual(Object.keys(by), ['q', 'r', 'rr', 'qr', 'bb', 'bn']);
  const material = { q: 'Q', r: 'R', rr: 'RR', qr: 'QR', bb: 'BB', bn: 'BN' };
  for (const [v, list] of Object.entries(by)) {
    assert.equal(list.length, 40, v);
    assert.equal(new Set(list.map(l => l.fen)).size, 40, v + ': pozice se opakují');
    for (const l of list) {
      const c = new Chess();
      assert.ok(c.load(l.fen), 'platná pozice ' + l.fen);
      assert.equal(c.turn(), 'w');
      assert.ok(!c.in_check() && !c.game_over(), l.fen);
      const pcs = [], bk = [];
      c.board().forEach((row, r) => row.forEach((p, f) => { if (!p) return; const sq = f + (7 - r) * 8; if (p.color === 'b') { assert.equal(p.type, 'k'); bk.push(sq); } else if (p.type !== 'k') pcs.push({ t: p.type.toUpperCase(), sq }); }));
      assert.equal(pcs.map(x => x.t).sort().join(''), material[v].split('').sort().join(''), l.fen);
      // žádná bílá figura nestojí vedle černého krále (nevisí hned na začátku)
      assert.ok(pcs.every(x => Math.max(Math.abs((x.sq & 7) - (bk[0] & 7)), Math.abs((x.sq >> 3) - (bk[0] >> 3))) > 1), l.fen);
      if (v === 'bb') assert.notEqual(((pcs[0].sq & 7) + (pcs[0].sq >> 3)) % 2, ((pcs[1].sq & 7) + (pcs[1].sq >> 3)) % 2, 'střelci na různobarevných polích');
    }
  }
});

test('sbírka: jezdec se střelcem do 20 tahů, ostatní nejtěžší nebo skoro nejtěžší pozice', () => {
  for (const l of lines) {
    if (l.v === 'bn') assert.ok(l.dtm >= 17 && l.dtm <= 20, l.fen + ' ' + l.dtm);
    else assert.ok(l.dtm >= header[l.v] - 1 && l.dtm <= header[l.v], l.v + ' ' + l.dtm);
  }
  // u dámy a věže se délka matu přepočítá
  for (const p of ['q', 'r']) {
    const res = K.solve([p]);
    for (const l of lines.filter(x => x.v === p)) assert.equal(res.wtm[indexOf(l.fen, [p])], l.dtm, l.fen);
  }
});

test('pozice z tabulky je správně převedená do FEN', () => {
  const i = idx('e1') | (idx('e8') << 6) | (idx('a1') << 12) | (idx('h1') << 18);
  assert.equal(K.fen(i, ['r', 'r']), '4k3/8/8/8/8/8/8/R3K2R w - - 0 1');
  assert.equal(indexOf('4k3/8/8/8/8/8/8/R3K2R w - - 0 1', ['r', 'r']), i);
});

/* ---------- Pravidla cvičení (vyuka/koncovky.js) ---------- */
const KC = require('../app/src/main/assets/www/vyuka/koncovky.js');
const hrej = (pos, from, to) => {
  const m = KC.findMove(pos, KC.idx(from), KC.idx(to));
  assert.ok(m, 'tah ' + from + '-' + to + ' není legální v ' + pos.fen);
  return KC.play(pos, m);
};

test('cvičení: varianty odpovídají sbírce a každá má 40 pozic', () => {
  const set = KC.parse(TXT);
  assert.deepEqual(KC.VARIANTS.map(v => v.id).sort(), Object.keys(set).sort());
  for (const v of KC.VARIANTS) {
    assert.equal(set[v.id].length, 40, v.id);
    assert.ok(v.name && v.tip, v.id);
    // materiál varianty sedí s figurami ve výchozí pozici
    const c = new Chess(set[v.id][0].fen), pcs = [];
    c.board().forEach(row => row.forEach(p => { if (p && p.color === 'w' && p.type !== 'k') pcs.push(p.type); }));
    assert.equal(pcs.sort().join(''), v.pieces.split('').sort().join(''), v.id);
  }
});

test('cvičení: tahy podle chess.js, počítají se jen tahy bílého', () => {
  let p = KC.startPosition('8/8/8/4k3/8/8/8/K6Q w - - 0 1');
  assert.equal(KC.legalMoves(p).length, new Chess(p.fen).moves().length);
  assert.equal(KC.findMove(p, KC.idx('h1'), KC.idx('a3')), null, 'dáma netáhne jako jezdec');
  p = hrej(p, 'h1', 'h5');
  assert.equal(p.n, 1); assert.equal(p.turn, 'b');
  assert.ok(KC.legalMoves(p).every(m => m.color === 'b'));
  p = hrej(p, 'e5', 'e6');
  assert.equal(p.n, 1); assert.equal(p.turn, 'w');
  assert.equal(KC.result(p), null);
  assert.deepEqual(KC.pieceAt(p, KC.idx('h5')), { color: 'w', type: 'q' });
  assert.equal(KC.pieceAt(p, KC.idx('h1')), null);
  assert.deepEqual(KC.fromUci('h5g6'), { from: KC.idx('h5'), to: KC.idx('g6') });
  assert.equal(KC.fromUci('(none)'), null);
});

test('cvičení: mat, pat, ztráta figury a 50 tahů', () => {
  // mat dámou
  let p = hrej(KC.startPosition('k7/8/1K6/8/8/8/8/7Q w - - 0 1'), 'h1', 'h8');
  assert.deepEqual(KC.result(p), { winner: 'w', reason: 'mate' });
  // pat
  p = hrej(KC.startPosition('k7/8/1K6/8/8/8/8/1Q6 w - - 0 1'), 'b1', 'b5');
  assert.equal(KC.result(p), null);
  p = hrej(KC.startPosition('k7/8/1K6/8/8/8/8/2Q5 w - - 0 1'), 'c1', 'c7');
  assert.deepEqual(KC.result(p), { winner: 'b', reason: 'stalemate' });
  // černý král sebere nekrytou věž
  p = hrej(KC.startPosition('8/8/8/3k4/8/8/8/K3R3 w - - 0 1'), 'e1', 'e4');
  p = hrej(p, 'd5', 'e4');
  assert.deepEqual(KC.result(p), { winner: 'b', reason: 'capture', piece: 'r' });
  // 50. tah bílého bez matu: remíza podle pravidla 50 tahů
  p = Object.assign(KC.startPosition('8/8/8/4k3/8/8/8/K6Q w - - 0 1'), { n: 49 });
  p = hrej(p, 'h1', 'h2');
  assert.equal(p.n, 50);
  assert.deepEqual(KC.result(p), { winner: 'b', reason: 'fifty' });
  // mat 50. tahem platí
  p = hrej(Object.assign(KC.startPosition('k7/8/1K6/8/8/8/8/7Q w - - 0 1'), { n: 49 }), 'h1', 'h8');
  assert.deepEqual(KC.result(p), { winner: 'w', reason: 'mate' });
});

test('cvičení: hvězdy podle počtu tahů a nápověd', () => {
  assert.deepEqual(KC.starLimits(10), [12, 17]);
  assert.equal(KC.stars(10, 10, 0), 3);
  assert.equal(KC.stars(12, 10, 0), 3);
  assert.equal(KC.stars(13, 10, 0), 2);
  assert.equal(KC.stars(17, 10, 0), 2);
  assert.equal(KC.stars(18, 10, 0), 1);
  assert.equal(KC.stars(50, 20, 0), 1);
  assert.deepEqual(KC.starLimits(33), [35, 51]);
  assert.equal(KC.stars(10, 10, 1), 2, 'nápověda ubere hvězdu');
  assert.equal(KC.stars(10, 10, 5), 1, 'za mat je vždy aspoň jedna hvězda');
});

test('cvičení: náhradní obrana bere nekrytou figuru a vyhýbá se matu', () => {
  const tah = fen => { const m = KC.defend(fen); return KC.name(m.from) + KC.name(m.to); };
  assert.equal(tah('8/8/8/3k4/4R3/8/8/K7 b - - 0 1'), 'd5e4');
  // vždy legální tah, dokud nějaký je
  const rnd = lcg(7), set = KC.parse(TXT);
  let checked = 0;
  for (let k = 0; k < 60; k++) {
    const list = set[KC.VARIANTS[k % 6].id], c = new Chess(list[Math.floor(rnd() * list.length)].fen);
    c.move(c.moves()[Math.floor(rnd() * c.moves().length)]);
    if (c.game_over()) continue;
    const m = KC.defend(c.fen()), fen = c.fen();
    const mv = c.moves({ verbose: true }).find(x => KC.idx(x.from) === m.from && KC.idx(x.to) === m.to);
    assert.ok(mv, fen);
    // když má černý tah, po kterém bílý nedá mat hned, náhradní obrana takový tah najde
    const mates = x => { c.move(x); const r = c.moves({ verbose: true }).some(w => { c.move(w); const t = c.in_checkmate(); c.undo(); return t; }); c.undo(); return r; };
    if (c.moves({ verbose: true }).some(x => !mates(x))) assert.ok(!mates(mv), 'obrana jde do matu: ' + fen + ' ' + mv.san);
    checked++;
  }
  assert.ok(checked > 30);
});
