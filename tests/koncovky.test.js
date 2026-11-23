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
