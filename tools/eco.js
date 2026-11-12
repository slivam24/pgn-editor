// Vytvoří app/src/main/assets/www/eco.js: tabulku zahájení (kód ECO a název) podle pozice.
// Zdroj: https://github.com/lichess-org/chess-openings (soubory a.tsv až e.tsv, licence CC0).
// Použití: node tools/eco.js <složka se soubory tsv>
// Zahájení se hledá podle pozice, ne podle pořadí tahů, takže se pozná i po přehození tahů.
const fs = require('fs');
const path = require('path');
const { Chess } = require('../app/src/main/assets/www/chess.js');

// Krátký otisk pozice (53 bitů), aby tabulka nebyla zbytečně velká
function hash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
// Pozice bez pole pro braní mimochodem: chess.js ho uvádí po každém dvojkroku pěšce, takže by se
// stejná pozice dosažená jiným pořadím tahů nepoznala
const epd = chess => chess.fen().split(' ').slice(0, 3).join(' ');
const key = chess => hash(epd(chess));

const dir = process.argv[2];
if (!dir) { console.error('Použití: node tools/eco.js <složka se soubory tsv>'); process.exit(1); }
const rows = [], seen = new Map();
let maxPly = 0, dup = 0;
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const lines = fs.readFileSync(path.join(dir, f + '.tsv'), 'utf8').split('\n').slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const [eco, name, pgn] = line.split('\t');
    const chess = new Chess();
    const sans = pgn.replace(/\d+\.+/g, ' ').split(/\s+/).filter(Boolean);
    for (const s of sans) if (!chess.move(s)) throw new Error('Neplatný tah ' + s + ' v řádku: ' + line);
    const k = key(chess);
    if (seen.has(k)) { if (seen.get(k) !== epd(chess)) throw new Error('Kolize otisku: ' + line); dup++; continue; }
    seen.set(k, epd(chess));
    if (/[\t\n"\\]/.test(name)) throw new Error('Nečekaný znak v názvu: ' + name);
    rows.push(k + '\t' + eco + '\t' + name);
    maxPly = Math.max(maxPly, sans.length);
  }
}
const out = `/*
 * Tabulka šachových zahájení: kód ECO a název podle pozice.
 * Vytvořeno skriptem tools/eco.js z dat https://github.com/lichess-org/chess-openings (licence CC0).
 * Tento soubor neupravuj ručně.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ECO = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MAX_PLY = ${maxPly};
  const DATA = "${rows.join('\\n')}";
  let table = null;
  ${hash.toString()}
  // sans: tahy hlavní linie od základního postavení. Vrací { eco, name, ply } nejhlubší známé pozice, nebo null.
  // move(chess, san) může dodat rychlejší čtení tahu (PGN.sanMove), jinak se použije chess.js.
  function find(Chess, sans, move) {
    if (!table) { table = new Map(); DATA.split('\\n').forEach(r => { const p = r.split('\\t'); table.set(p[0], [p[1], p[2]]); }); }
    const chess = new Chess();
    let hit = null;
    for (let i = 0; i < sans.length && i < MAX_PLY; i++) {
      if (!(move ? move(chess, sans[i]) : chess.move(sans[i]))) break;
      const o = table.get(hash(chess.fen().split(' ').slice(0, 3).join(' ')));
      if (o) hit = { eco: o[0], name: o[1], ply: i + 1 };
    }
    return hit;
  }
  return { MAX_PLY, find };
});
`;
fs.writeFileSync(path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'eco.js'), out);
console.log(rows.length + ' pozic, ' + dup + ' opakovaných vynecháno, nejdelší linie ' + maxPly + ' půltahů, ' + Math.round(out.length / 1024) + ' kB');
