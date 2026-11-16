// Pěšci proti pěšcům: teoretický výsledek při dokonalé hře pro každou dvojici počtů pěšců
// (bílý a, černý b, 1 až 8) a co z toho plyne pro sérii kol (vítěz hraje příště s menším počtem).
//
// Spuštění:  node tools/pesci-analyza.js [--limit 600] [--odhad 20] [--vlakna 4] [--tt 24] [--md tools/pesci-analyza.md]
//   --limit   nejvýš sekund na přesné vyřešení jedné dvojice (pak se dvojice označí jako nevyřešená)
//   --odhad   sekund pro odhad enginu u nevyřešené dvojice
//   --vlakna  kolik dvojic se počítá současně
//   --tt      velikost tabulky pozic (2^tt řádků po dvou místech, 24 ≈ 740 MB na vlákno)
//   --md      kam uložit výsledek jako Markdown
//   --znovu   nepoužít uložené výsledky a spočítat vše znovu
// Výsledky se průběžně ukládají do tools/pesci-analyza.json, další spuštění na ně naváže
// (nevyřešené dvojice zkusí znovu, když je zadaný delší limit).
const path = require('path');
const fs = require('fs');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const P = require('../app/src/main/assets/www/trenink/pesci.js');
const E = require('../app/src/main/assets/www/trenink/pesci-engine.js');

if (!isMainThread) {
  // Vlákno: jedna tabulka pozic na celé vlákno, mezi dvojicemi se jen vymaže
  const eng = E.createEngine({ ttBits: workerData.ttBits });
  parentPort.on('message', job => {
    eng.clear();
    const t = Date.now();
    const r = eng.solve(P.startPosition(job.a, job.b), { timeLimit: job.limit * 1000 });
    const out = { a: job.a, b: job.b, limit: job.limit, ms: Date.now() - t };
    if (r) Object.assign(out, { winner: r.winner, nodes: r.nodes, exact: true });
    else {
      const est = eng.analyse(P.startPosition(job.a, job.b), { depth: Infinity, timeLimit: job.estimate * 1000 });
      // hodnocení je z pohledu bílého (ve výchozím postavení je bílý na tahu)
      Object.assign(out, { exact: false, estimate: est.score, estimateDepth: est.depth, estimateWinner: est.score > 0 ? 'w' : 'b' });
    }
    parentPort.postMessage(out);
  });
  return;
}

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf('--' + name); return i === -1 ? def : args[i + 1]; };
const LIMIT = +arg('limit', 600), ESTIMATE = +arg('odhad', 20), THREADS = +arg('vlakna', 4), TT = +arg('tt', 24);
const MD = arg('md', null);
const CACHE = path.join(__dirname, 'pesci-analyza.json');
const MIN = P.MIN_PAWNS;

let cache = {};
if (!args.includes('--znovu')) try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) {}
const saveCache = () => fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1) + '\n');

const jobs = [];
for (let a = 1; a <= 8; a++) for (let b = 1; b <= 8; b++) {
  const c = cache[a + 'v' + b];
  if (c && (c.exact || c.limit >= LIMIT)) continue;
  jobs.push({ a, b, limit: LIMIT, estimate: ESTIMATE });
}
// od nejmenších pozic, ty jsou hotové hned
jobs.sort((x, y) => (x.a + x.b) - (y.a + y.b) || Math.max(x.a, x.b) - Math.max(y.a, y.b));

const t0 = Date.now();
const log = s => process.stderr.write('[' + Math.round((Date.now() - t0) / 1000) + ' s] ' + s + '\n');
const running = Math.min(THREADS, jobs.length);
let done = 0;
if (!running) report();
for (let w = 0; w < running; w++) {
  const worker = new Worker(__filename, { workerData: { ttBits: TT } });
  const next = () => { const j = jobs.shift(); if (j) worker.postMessage(j); else { worker.terminate(); if (++done === running) report(); } };
  worker.on('message', r => {
    cache[r.a + 'v' + r.b] = r;
    saveCache();
    log(r.a + ' proti ' + r.b + ': ' + (r.exact ? (r.winner === 'w' ? 'bílý' : 'černý') + ' (' + r.nodes + ' uzlů, ' + r.ms + ' ms)' : 'nevyřešeno za ' + r.limit + ' s, odhad ' + r.estimate));
    next();
  });
  worker.on('error', e => { console.error(e); process.exit(1); });
  next();
}

/* ---------- Vyhodnocení ---------- */
function report() {
  const R = (a, b) => cache[a + 'v' + b];
  const name = w => w === 'w' ? 'bílý' : 'černý';
  const cell = r => !r ? '' : r.exact ? (r.winner === 'w' ? 'B' : 'Č') : '?' + (r.estimateWinner === 'w' ? 'b' : 'č');
  const lines = [];
  const out = s => lines.push(s === undefined ? '' : s);

  out('# Pěšci proti pěšcům: výsledky při dokonalé hře');
  out();
  out('Bílý táhne první. Řádky: počet bílých pěšců, sloupce: počet černých. Výchozí postavení podle pravidel tréninku');
  out('(odebírají se sloupce a, h, b, g, c, f, d, e).');
  out();
  out('**B** vyhraje bílý, **Č** vyhraje černý (přesně vyřešeno). **?b** / **?č**: nevyřešeno v časovém limitu,');
  out('za otazníkem je jen odhad enginu, kdo stojí lépe, ne teoretický výsledek.');
  out();
  out('| bílý \\ černý | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |');
  out('|---|---|---|---|---|---|---|---|---|');
  for (let a = 1; a <= 8; a++) {
    const row = [];
    for (let b = 1; b <= 8; b++) row.push(cell(R(a, b)));
    out('| **' + a + '** | ' + row.join(' | ') + ' |');
  }
  out();
  const diag = [];
  for (let n = 1; n <= 8; n++) { const r = R(n, n); diag.push(n + ' proti ' + n + ': ' + (!r ? '–' : r.exact ? name(r.winner) : 'nevyřešeno (odhad ' + name(r.estimateWinner) + ')')); }
  out('Stejný počet pěšců: ' + diag.join(', ') + '.');
  out();
  const unsolved = Object.values(cache).filter(r => !r.exact).map(r => r.a + ' proti ' + r.b);
  if (unsolved.length) out('Nevyřešeno: ' + unsolved.join(', ') + '.');
  const slow = Object.values(cache).filter(r => r.exact).sort((x, y) => y.ms - x.ms).slice(0, 5);
  out('Nejdelší výpočty: ' + slow.map(r => r.a + ' proti ' + r.b + ' ' + fmtTime(r.ms) + ' (' + fmtNum(r.nodes) + ' uzlů)').join(', ') + '.');
  out();

  // Série: z každého stavu (a, b) vede výhra bílého do (a-1, b), výhra černého do (a, b-1);
  // kdo vyhraje kolo s MIN pěšci, vyhrál sérii. Bílý = hráč, černý = počítač.
  out('## Série kol při dokonalé hře obou stran');
  out();
  const winnerOf = (a, b) => { const r = R(a, b); return !r ? null : r.exact ? r.winner : null; };
  let s = P.newSeries(), path = [], ok = true;
  while (!s.winner) {
    const w = winnerOf(s.white, s.black);
    if (!w) { ok = false; path.push(s.white + '-' + s.black + ' (nevyřešeno)'); break; }
    path.push(s.white + '-' + s.black + ' ' + (w === 'w' ? 'B' : 'Č'));
    s = P.nextRound(s, w);
  }
  out('Průběh od 8-8 (počty bílý-černý a vítěz kola): ' + path.join(', ') + '.');
  if (ok) out('Sérii vyhraje **' + name(s.winner) + '** po ' + (s.round - 1) + ' kolech (' + s.wins.w + ' : ' + s.wins.b + ' na kola).');
  out();

  // Pravděpodobnost výhry v sérii, když teoretický vítěz kola opravdu vyhraje s pravděpodobností p
  // (model nedokonalé hry). U nevyřešených dvojic se použije odhad enginu.
  out('## Série při nedokonalé hře (model)');
  out();
  out('Předpoklad: kolo vyhraje strana, která má pozici teoreticky vyhranou, s pravděpodobností p, jinak soupeř.');
  out('U nevyřešených dvojic se bere odhad enginu. Tabulka ukazuje pravděpodobnost, že sérii od 8-8 vyhraje bílý.');
  out();
  out('| p | bílý vyhraje sérii | průměrný počet kol |');
  out('|---|---|---|');
  for (const p of [0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
    const m = seriesOdds(p);
    out('| ' + p.toFixed(1) + ' | ' + (100 * m.white).toFixed(1) + ' % | ' + m.rounds.toFixed(1) + ' |');
  }
  out();
  function seriesOdds(p) {
    const memo = new Map();
    const go = (a, b) => { // { white: P(bílý vyhraje sérii), rounds: střední počet zbývajících kol }
      const k = a + ',' + b;
      if (memo.has(k)) return memo.get(k);
      const r = R(a, b);
      const tw = r ? (r.exact ? r.winner : r.estimateWinner) : 'w';
      const pw = tw === 'w' ? p : 1 - p; // pravděpodobnost, že kolo vyhraje bílý
      const ifW = a - 1 < MIN ? { white: 1, rounds: 0 } : go(a - 1, b);
      const ifB = b - 1 < MIN ? { white: 0, rounds: 0 } : go(a, b - 1);
      const v = { white: pw * ifW.white + (1 - pw) * ifB.white, rounds: 1 + pw * ifW.rounds + (1 - pw) * ifB.rounds };
      memo.set(k, v);
      return v;
    };
    return go(8, 8);
  }

  const text = lines.join('\n') + '\n';
  process.stdout.write(text);
  if (MD) fs.writeFileSync(MD, text);
}
function fmtTime(ms) { return ms < 1000 ? ms + ' ms' : ms < 120000 ? (ms / 1000).toFixed(1) + ' s' : (ms / 60000).toFixed(1) + ' min'; }
function fmtNum(n) { return n >= 1e9 ? (n / 1e9).toFixed(1) + ' mld.' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' mil.' : String(n); }
