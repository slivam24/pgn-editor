// Matové koncovky: přesná délka matu (DTM) pro bílého s králem a figurami proti samotnému černému
// králi a výběr výchozích pozic pro výuku do app/src/main/assets/www/vyuka/koncovky.txt.
//
// Spuštění:  node tools/koncovky.js            (spočítá všech šest variant a zapíše sbírku pozic)
//
// Výpočet je zpětná analýza (retrográdní): začne od všech matů a po tazích zpět hledá pozice, odkud
// bílý vynutí mat. Délka matu je počet tahů bílého při nejlepší obraně černého.
// Podle pravidel cvičení je ztráta figury neúspěch: pozice, kde černý král může sebrat figuru,
// se nepočítá jako vyhraná (černý tím unikne). Pat je remíza.
// Výběr pozic: u jezdce se střelcem mat nejvýš do 20 tahů, u ostatních nejtěžší nebo skoro nejtěžší
// pozice. Bílý je na tahu, černý král není v šachu a žádná bílá figura nestojí vedle něj.
// Pozice se vybírají náhodně s pevným semínkem, takže každé spuštění dá stejnou sbírku.
// Jako modul (require) nabízí solve() pro zkoušky.
const fs = require('fs');
const path = require('path');

const FILES = 'abcdefgh';
const name = i => FILES[i & 7] + ((i >> 3) + 1);
const file = i => i & 7, rank = i => i >> 3;

// Předpočítané vztahy polí: sousedé, skok jezdce, stejná řada nebo sloupec, stejná diagonála,
// pole mezi dvěma poli (BTW[a * 4096 + b * 64 + c]: c leží mezi a a b na přímce)
const ADJ = new Uint8Array(4096), KNIGHT = new Uint8Array(4096), ORTHO = new Uint8Array(4096), DIAG = new Uint8Array(4096);
const BTW = new Uint8Array(64 * 64 * 64);
const KING_N = [], KNIGHT_N = [], RAYS = []; // RAYS[s][d]: pole ve směru d (0-3 rovně, 4-7 šikmo)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
for (let a = 0; a < 64; a++) {
  KING_N.push([]); KNIGHT_N.push([]); RAYS.push([]);
  for (let b = 0; b < 64; b++) {
    if (a === b) continue;
    const df = file(b) - file(a), dr = rank(b) - rank(a);
    if (Math.max(Math.abs(df), Math.abs(dr)) === 1) { ADJ[a * 64 + b] = 1; KING_N[a].push(b); }
    if ((Math.abs(df) === 1 && Math.abs(dr) === 2) || (Math.abs(df) === 2 && Math.abs(dr) === 1)) { KNIGHT[a * 64 + b] = 1; KNIGHT_N[a].push(b); }
    if (df === 0 || dr === 0) ORTHO[a * 64 + b] = 1;
    if (Math.abs(df) === Math.abs(dr)) DIAG[a * 64 + b] = 1;
    if (ORTHO[a * 64 + b] || DIAG[a * 64 + b]) {
      const sf = Math.sign(df), sr = Math.sign(dr);
      for (let f = file(a) + sf, r = rank(a) + sr; f !== file(b) || r !== rank(b); f += sf, r += sr) BTW[a * 4096 + b * 64 + f + r * 8] = 1;
    }
  }
  for (const [df, dr] of DIRS) {
    const ray = [];
    for (let f = file(a) + df, r = rank(a) + dr; f >= 0 && f < 8 && r >= 0 && r < 8; f += df, r += dr) ray.push(f + r * 8);
    RAYS[a].push(ray);
  }
}
const SLIDE_DIRS = { q: [0, 1, 2, 3, 4, 5, 6, 7], r: [0, 1, 2, 3], b: [4, 5, 6, 7] };

// Spočítá délky matu pro bílý materiál pieces (např. ['q'], ['b', 'n']). Index pozice:
// bílý král + 64 × černý král + 4096 × první figura + 262144 × druhá figura.
// Vrací { pieces, wtm: Int8Array (bílý na tahu: 0 = nevyhraje, jinak mat za tolik tahů),
//         btm: Int8Array (černý na tahu: k + 1 = prohrává, mat za k tahů; -1 = unikne, pat; 0 = nevyhraje), max }
function solve(pieces) {
  const n = pieces.length, size = 1 << (6 * (2 + n));
  const wtm = new Int8Array(size), btm = new Int8Array(size), count = new Uint8Array(size);
  const ps = new Int8Array(n);
  let wk = 0, bk = 0;
  const decode = idx => { wk = idx & 63; bk = (idx >> 6) & 63; for (let k = 0; k < n; k++) ps[k] = (idx >> (12 + 6 * k)) & 63; };
  const encode = () => { let idx = wk | (bk << 6); for (let k = 0; k < n; k++) idx |= ps[k] << (12 + 6 * k); return idx; };
  const valid = () => { // různá pole a králové nestojí vedle sebe
    if (wk === bk || ADJ[wk * 64 + bk]) return false;
    for (let k = 0; k < n; k++) {
      if (ps[k] === wk || ps[k] === bk) return false;
      for (let j = 0; j < k; j++) if (ps[j] === ps[k]) return false;
    }
    return true;
  };
  // Napadá bílý pole t? Černý král neblokuje (z napadeného pole uhýbá), figura skip je sebraná.
  function attacked(t, skip) {
    if (ADJ[wk * 64 + t]) return true;
    for (let k = 0; k < n; k++) {
      if (k === skip) continue;
      const s = ps[k], p = pieces[k], st = s * 64 + t;
      if (s === t) continue;
      let line = false;
      if (p === 'n') { if (KNIGHT[st]) return true; continue; }
      if ((p === 'q' || p === 'r') && ORTHO[st]) line = true;
      if ((p === 'q' || p === 'b') && DIAG[st]) line = true;
      if (!line) continue;
      const base = s * 4096 + t * 64;
      let blocked = BTW[base + wk] === 1;
      for (let j = 0; j < n && !blocked; j++) if (j !== k && j !== skip && BTW[base + ps[j]]) blocked = true;
      if (!blocked) return true;
    }
    return false;
  }
  const pieceAt = t => { for (let k = 0; k < n; k++) if (ps[k] === t) return k; return -1; };

  // 1. Všechny pozice s černým na tahu: maty, paty, únik braním a počet tahů černého
  let level = [];
  for (let idx = 0; idx < size; idx++) {
    decode(idx);
    if (!valid()) continue;
    let moves = 0, escape = false;
    for (const t of KING_N[bk]) {
      if (ADJ[wk * 64 + t]) continue;
      const k = pieceAt(t);
      if (k >= 0) { if (!attacked(t, k)) escape = true; continue; }
      if (!attacked(t, -1)) moves++;
    }
    if (escape) { btm[idx] = -1; continue; }
    if (moves === 0) { if (attacked(bk, -1)) { btm[idx] = 1; level.push(idx); } else btm[idx] = -1; continue; }
    count[idx] = moves;
  }
  // 2. Po úrovních: tahy bílého zpět k matu, pak tahy černého zpět
  let depth = 0, max = 0;
  while (level.length) {
    const won = [];
    for (const q of level) { // q: černý na tahu, prohrává; předchůdci: bílý tah zpět
      decode(q);
      const tryPred = () => {
        if (attacked(bk, -1)) return; // černý král nesmí být v šachu, když je bílý na tahu
        const p = encode();
        if (wtm[p]) return;
        wtm[p] = depth + 1; won.push(p);
      };
      // král
      const w0 = wk;
      for (const s of KING_N[w0]) {
        if (s === bk || ADJ[s * 64 + bk] || pieceAt(s) >= 0) continue;
        wk = s; tryPred(); wk = w0;
      }
      for (let k = 0; k < n; k++) {
        const t = ps[k], p = pieces[k];
        const origins = [];
        if (p === 'n') { for (const s of KNIGHT_N[t]) origins.push(s); }
        else for (const d of SLIDE_DIRS[p]) for (const s of RAYS[t][d]) { if (s === wk || s === bk || pieceAt(s) >= 0) break; origins.push(s); }
        for (const s of origins) {
          if (s === wk || s === bk || pieceAt(s) >= 0) continue;
          ps[k] = s; tryPred(); ps[k] = t;
        }
      }
    }
    depth++;
    if (won.length) max = depth;
    const next = [];
    for (const p of won) { // p: bílý na tahu, vyhrává za depth; předchůdci: tah černého zpět
      decode(p);
      const b0 = bk;
      for (const t of KING_N[b0]) {
        if (t === wk || ADJ[wk * 64 + t] || pieceAt(t) >= 0) continue;
        bk = t;
        const q = encode();
        bk = b0;
        if (btm[q] !== 0 || !count[q]) continue;
        if (--count[q] === 0) { btm[q] = depth + 1; next.push(q); }
      }
    }
    level = next;
  }
  return { pieces, wtm, btm, max, size };
}

// FEN pozice s bílým na tahu
function fen(idx, pieces) {
  const board = new Array(64).fill('');
  board[idx & 63] = 'K'; board[(idx >> 6) & 63] = 'k';
  pieces.forEach((p, k) => { board[(idx >> (12 + 6 * k)) & 63] = p.toUpperCase(); });
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = '', e = 0;
    for (let f = 0; f < 8; f++) { const c = board[f + r * 8]; if (!c) { e++; continue; } if (e) { row += e; e = 0; } row += c; }
    rows.push(row + (e || ''));
  }
  return rows.join('/') + ' w - - 0 1';
}

// Varianty cvičení: materiál bílého a rozsah délky matu pro výběr pozic (od, do; null = nejdelší mat)
const VARIANTS = [
  { id: 'q', name: 'Dáma', pieces: ['q'], from: -1 },
  { id: 'r', name: 'Věž', pieces: ['r'], from: -1 },
  { id: 'rr', name: 'Dvě věže', pieces: ['r', 'r'], from: -1 },
  { id: 'qr', name: 'Dáma a věž', pieces: ['q', 'r'], from: -1 },
  { id: 'bb', name: 'Dva střelci', pieces: ['b', 'b'], from: -1 },
  { id: 'bn', name: 'Jezdec a střelec', pieces: ['b', 'n'], from: 17, to: 20 }
];
const PER_VARIANT = 40;

function pick(v, res, rnd) {
  const n = v.pieces.length, lo = v.from < 0 ? res.max + v.from : v.from, hi = v.to || res.max;
  const cand = [];
  for (let idx = 0; idx < res.size; idx++) {
    const d = res.wtm[idx];
    if (d < lo || d > hi) continue;
    const bk = (idx >> 6) & 63, ps = [];
    for (let k = 0; k < n; k++) ps.push((idx >> (12 + 6 * k)) & 63);
    if (ps.some(s => ADJ[s * 64 + bk])) continue; // žádná figura vedle černého krále
    if (n === 2 && v.pieces[0] === v.pieces[1] && ps[0] > ps[1]) continue; // stejné figury jen jednou
    cand.push(idx);
  }
  // náhodný výběr s pevným semínkem (Fisher–Yates na začátku pole)
  const out = [];
  for (let k = 0; k < Math.min(PER_VARIANT, cand.length); k++) {
    const j = k + Math.floor(rnd() * (cand.length - k));
    [cand[k], cand[j]] = [cand[j], cand[k]];
    out.push({ fen: fen(cand[k], v.pieces), dtm: res.wtm[cand[k]] });
  }
  return { lo, hi, candidates: cand.length, positions: out.sort((a, b) => b.dtm - a.dtm || (a.fen < b.fen ? -1 : 1)) };
}

if (require.main === module) {
  let seed = 20261123;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const lines = [
    '# Matové koncovky: výchozí pozice pro výuku. Vytváří tools/koncovky.js, ručně neupravovat.',
    '# Řádek: varianta|FEN|nejkratší mat při nejlepší obraně (tahy bílého)',
    '# Ztráta figury se počítá jako neúspěch, pozice s možností sebrat figuru proto nejsou vyhrané.'
  ];
  const body = [];
  for (const v of VARIANTS) {
    const t = Date.now();
    const res = solve(v.pieces);
    let won = 0;
    for (let i = 0; i < res.size; i++) if (res.wtm[i]) won++;
    const sel = pick(v, res, rnd);
    lines.push('# ' + v.id + ': ' + v.name + ', nejdelší mat ' + res.max + ', vybráno ' + sel.positions.length + ' z ' + sel.candidates + ' pozic s matem za ' + sel.lo + (sel.hi > sel.lo ? ' až ' + sel.hi : '') + ' tahů');
    sel.positions.forEach(p => body.push(v.id + '|' + p.fen + '|' + p.dtm));
    process.stderr.write(v.id + ': nejdelší mat ' + res.max + ', vyhraných pozic ' + won + ', ' + ((Date.now() - t) / 1000).toFixed(1) + ' s\n');
  }
  const out = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'vyuka', 'koncovky.txt');
  fs.writeFileSync(out, lines.concat(body).join('\n') + '\n');
  process.stderr.write('zapsáno ' + body.length + ' pozic do ' + path.relative(process.cwd(), out) + '\n');
}

module.exports = { solve, fen, VARIANTS, name };
