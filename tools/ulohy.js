// Vytvoří sbírku úloh app/src/main/assets/www/vyuka/ulohy.txt z databáze úloh Lichessu.
// Zdroj: https://database.lichess.org/#puzzles (soubor lichess_db_puzzle.csv.zst, licence CC0).
// Použití (soubor je zabalený formátem zstd, rozbalený text se pošle skriptu):
//   zstd -dc lichess_db_puzzle.csv.zst | node tools/ulohy.js
//
// Výběr: v každém pásmu obtížnosti (po 100 bodech) se vezmou nejlépe hodnocené úlohy, které vyřešilo
// hodně hráčů, a hlídá se, aby žádné téma nepřevážilo. Pro děti a začátečníky je úloh víc.
//
// Řádek souboru: id|FEN|tahy (UCI, první táhne soupeř)|obtížnost|témata (čísla podle THEMES)
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Témata, podle kterých jde v aplikaci vybírat (pořadí = číslo v souboru). Názvy jsou v index.html.
const THEMES = ['mateIn1', 'mateIn2', 'mateIn3', 'fork', 'pin', 'discoveredAttack', 'doubleCheck', 'backRankMate',
  'sacrifice', 'deflection', 'attraction', 'hangingPiece', 'trappedPiece', 'promotion', 'quietMove', 'defensiveMove',
  'intermezzo', 'zugzwang', 'opening', 'middlegame', 'endgame', 'pawnEndgame', 'rookEndgame', 'skewer'];
const TACTIC = new Set(THEMES.slice(0, 18).concat(['skewer']));
// kolik úloh v pásmu obtížnosti (spodní hranice pásma)
const target = r => r < 400 ? 0 : r < 2000 ? 320 : r < 2400 ? 220 : r < 2700 ? 90 : 0;

// stabilní pořadí bez náhody: otisk id úlohy
const h = s => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };

// nejlepší úlohy dřív, ze stejně dobrých rozhodne otisk id (pestřejší výběr než první v souboru)
const better = (x, y) => (Math.round(y.score) - Math.round(x.score)) || (x.hash - y.hash);

(async () => {
  const bins = new Map();
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let first = true, n = 0;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    const f = line.split(',');
    const rating = +f[3], dev = +f[4], pop = +f[5], plays = +f[6];
    const b = Math.floor(rating / 100) * 100;
    if (!target(b)) continue;
    // u nejsnazších úloh je kvalitních málo, proto mírnější podmínky
    const easy = rating < 900;
    if (dev > (easy ? 100 : 80) || pop < (easy ? 70 : 85) || plays < (easy ? 200 : 500)) continue;
    const themes = f[7].split(' ');
    const ids = themes.map(t => THEMES.indexOf(t)).filter(i => i !== -1);
    if (!bins.has(b)) bins.set(b, []);
    const list = bins.get(b);
    list.push({ id: f[0], fen: f[1].split(' ').slice(0, 4).join(' '), moves: f[2], rating, ids, key: themes.find(t => TACTIC.has(t)) || 'jine', score: pop + Math.log10(plays) * 5, hash: h(f[0]) });
    // v paměti se drží jen nejlepší kandidáti každého pásma, celá databáze by se nevešla
    if (list.length > 40 * target(b)) { list.sort(better); list.length = 15 * target(b); }
    n++;
  }
  const out = [];
  for (const b of [...bins.keys()].sort((x, y) => x - y)) {
    const want = target(b), cap = Math.ceil(want * 0.22), per = {};
    const list = bins.get(b).sort(better);
    let taken = 0;
    for (const p of list) {
      if (taken >= want) break;
      if ((per[p.key] || 0) >= cap) continue;
      per[p.key] = (per[p.key] || 0) + 1;
      out.push(p); taken++;
    }
  }
  out.sort((x, y) => x.rating - y.rating || x.hash - y.hash);
  const text = out.map(p => [p.id, p.fen, p.moves, p.rating, p.ids.join(',')].join('|')).join('\n') + '\n';
  const dest = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'vyuka', 'ulohy.txt');
  fs.writeFileSync(dest, text);
  const counts = THEMES.map((t, i) => t + ' ' + out.filter(p => p.ids.includes(i)).length).join(', ');
  console.log('vybráno', out.length, 'úloh z', n, 'vhodných,', Math.round(text.length / 1024), 'kB');
  console.log(counts);
})();
