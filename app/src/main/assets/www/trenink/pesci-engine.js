/*
 * Trénink: pěšci proti pěšcům. Počítačový soupeř (engine), bez vazby na vzhled aplikace.
 *
 * Minimax s alfa-beta ořezáváním (negamax) a tabulkou už spočítaných pozic (transposition table).
 * Hledá postupně do větší hloubky (iterative deepening). Když hledání v nějaké hloubce nikde
 * nepotřebovalo odhad pozice, je výsledek přesný (hra prohledaná do konce) a hledání skončí:
 * v pozicích s málo pěšci tak engine hraje dokonale, ve větších hledá do zadané hloubky
 * nebo do vypršení času a pozice na konci odhadne.
 *
 * Odhad pozice: náskok nejpokročilejšího pěšce (kolik mu chybí na poslední řadu proti soupeři),
 * počet pěšců a kdo je na tahu.
 *
 * Obtížnost: { depth: hloubka v půltazích (Infinity = co nejhlouběji), blunder: pravděpodobnost,
 * že engine zahraje horší tah než nejlepší, timeLimit: ms na tah }. Výhru jedním tahem nevynechá nikdy.
 *
 * Hodnocení je z pohledu strany na tahu: MATE - n znamená výhru za n půltahů, -(MATE - n) prohru.
 * Pravidla bere z pesci.js. V prohlížeči je dostupné jako window.PESCI_ENGINE, v Node přes require().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pesci.js'));
  else root.PESCI_ENGINE = factory(root.PESCI);
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';

  const W = 1, B = -1;
  const MATE = 10000, WIN_MIN = MATE - 500; // hodnocení nad WIN_MIN je jistá výhra
  const INF = 30000;
  const EXACT = 255; // hloubka „do konce“; partie má nejvýš 80 půltahů, takže se nevyčerpá
  const MAXPLY = 120, MAXM = 40;
  // příznaky tahu
  const CAP = 1, EPF = 2, DBL = 4, LAST = 8;
  // váhy odhadu
  const RACE = 40, COUNT = 12, TEMPO = 10;

  const LEVELS = [
    { id: 'easy', name: 'Lehká', depth: 1, blunder: 0.35, timeLimit: 300 },
    { id: 'medium', name: 'Střední', depth: 4, blunder: 0.1, timeLimit: 500 },
    { id: 'hard', name: 'Těžká', depth: Infinity, blunder: 0, timeLimit: 1500 }
  ];

  // Náhodná čísla pro klíč pozice (Zobrist), pevné semínko, aby se engine choval vždy stejně
  let zs = 0x2545f491;
  const rand32 = () => { zs ^= zs << 13; zs ^= zs >>> 17; zs ^= zs << 5; return zs | 0; };
  const ZW = new Int32Array(64), ZB = new Int32Array(64), ZEP = new Int32Array(64);
  for (let i = 0; i < 64; i++) { ZW[i] = rand32(); ZB[i] = rand32(); ZEP[i] = rand32(); }
  const ZTURN = rand32();
  // Pěšci mimo konec hry stojí jen na 2. až 7. řadě: bit i - 8 v 48bitovém čísle (přesné v double)
  const POW = new Float64Array(64);
  for (let i = 8; i < 56; i++) POW[i] = Math.pow(2, i - 8);

  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  function createEngine(opts) {
    const bits = (opts && opts.ttBits) || 18;
    const size = 2 << bits, mask = (1 << bits) - 1; // dvě místa v každém řádku tabulky
    const tKeyW = new Float64Array(size), tKeyB = new Float64Array(size);
    const tVal = new Int16Array(size), tDepth = new Uint8Array(size), tFlag = new Uint8Array(size), tMove = new Int16Array(size);
    const T_EXACT = 1, T_LOWER = 2, T_UPPER = 3;

    const board = new Int8Array(64);
    let side = W, ep = -1, cw = 0, cb = 0, wmask = 0, bmask = 0, hash = 0;
    const mFrom = new Int8Array(MAXPLY * MAXM), mTo = new Int8Array(MAXPLY * MAXM), mFlag = new Int8Array(MAXPLY * MAXM);
    const mOrd = new Int16Array(MAXPLY * MAXM);
    const uEp = new Int8Array(MAXPLY), uCap = new Int8Array(MAXPLY), uHash = new Int32Array(MAXPLY);
    const uW = new Float64Array(MAXPLY), uB = new Float64Array(MAXPLY);
    let nodes = 0, maxNodes = Infinity, deadline = Infinity, aborted = false, horizon = false, canAbort = false;

    function load(pos) {
      cw = 0; cb = 0; wmask = 0; bmask = 0; hash = 0;
      for (let i = 0; i < 64; i++) {
        const v = pos.board[i];
        board[i] = v;
        if (v === W) { cw++; wmask += POW[i]; hash ^= ZW[i]; }
        else if (v === B) { cb++; bmask += POW[i]; hash ^= ZB[i]; }
      }
      side = pos.turn === 'w' ? W : B;
      ep = pos.ep;
      if (ep >= 0) hash ^= ZEP[ep];
      if (side === B) hash ^= ZTURN;
    }

    // Tahy strany na tahu do polí pro danou hloubku, vrací jejich počet
    function genMoves(ply) {
      const base = ply * MAXM, s = side, dir = s === W ? 8 : -8, home = s === W ? 1 : 6, last = s === W ? 7 : 0;
      const enemyLeft = s === W ? cb : cw;
      let n = 0;
      for (let i = 8; i < 56; i++) {
        if (board[i] !== s) continue;
        const f = i & 7, one = i + dir, r1 = one >> 3;
        const adv = s === W ? r1 : 7 - r1; // jak daleko pěšec po tahu bude
        if (board[one] === 0) {
          const fl = r1 === last ? LAST : 0;
          mFrom[base + n] = i; mTo[base + n] = one; mFlag[base + n] = fl; mOrd[base + n] = fl ? 1000 : adv; n++;
          if ((i >> 3) === home && board[one + dir] === 0) { mFrom[base + n] = i; mTo[base + n] = one + dir; mFlag[base + n] = DBL; mOrd[base + n] = adv + 1; n++; }
        }
        for (let k = 0; k < 2; k++) {
          if (k === 0 ? f === 0 : f === 7) continue;
          const t = k === 0 ? one - 1 : one + 1;
          let fl = 0;
          if (board[t] === -s) fl = CAP;
          else if (t === ep) fl = CAP | EPF;
          else continue;
          if (r1 === last) fl |= LAST; // na poslední řadě soupeřův pěšec nestojí, ale pro jistotu
          if (enemyLeft === 1) fl |= LAST; // sebrání posledního pěšce = výhra
          mFrom[base + n] = i; mTo[base + n] = t; mFlag[base + n] = fl; mOrd[base + n] = (fl & LAST) ? 1000 : 500 + adv; n++;
        }
      }
      return n;
    }

    function make(ply, from, to, fl) {
      const s = side;
      uEp[ply] = ep; uHash[ply] = hash; uW[ply] = wmask; uB[ply] = bmask;
      board[from] = 0; board[to] = s;
      if (s === W) { wmask += POW[to] - POW[from]; hash ^= ZW[from] ^ ZW[to]; }
      else { bmask += POW[to] - POW[from]; hash ^= ZB[from] ^ ZB[to]; }
      if (fl & CAP) {
        const cs = fl & EPF ? to - (s === W ? 8 : -8) : to;
        uCap[ply] = cs;
        if (fl & EPF) board[cs] = 0;
        if (s === W) { bmask -= POW[cs]; hash ^= ZB[cs]; cb--; } else { wmask -= POW[cs]; hash ^= ZW[cs]; cw--; }
      }
      if (ep >= 0) hash ^= ZEP[ep];
      ep = fl & DBL ? (from + to) >> 1 : -1;
      if (ep >= 0) hash ^= ZEP[ep];
      side = -s; hash ^= ZTURN;
    }
    function unmake(ply, from, to, fl) {
      side = -side;
      const s = side;
      board[to] = 0; board[from] = s;
      if (fl & CAP) { board[uCap[ply]] = -s; if (s === W) cb++; else cw++; }
      ep = uEp[ply]; hash = uHash[ply]; wmask = uW[ply]; bmask = uB[ply];
    }

    // Odhad pozice z pohledu strany na tahu
    function evaluate() {
      let dW = 9, dB = 9;
      for (let i = 8; i < 56; i++) {
        const v = board[i];
        if (v === W) { const d = 7 - (i >> 3); if (d < dW) dW = d; }
        else if (v === B) { const d = i >> 3; if (d < dB) dB = d; }
      }
      const sc = RACE * (dB - dW) + COUNT * (cw - cb);
      return (side === W ? sc : -sc) + TEMPO;
    }

    const keyB = () => bmask * 18 + (side === W ? 0 : 9) + (ep < 0 ? 0 : (ep & 7) + 1);
    const toTT = (v, ply) => v > WIN_MIN ? v + ply : v < -WIN_MIN ? v - ply : v;
    const fromTT = (v, ply) => v > WIN_MIN ? v - ply : v < -WIN_MIN ? v + ply : v;

    function search(depth, alpha, beta, ply) {
      nodes++;
      if (canAbort && (nodes & 1023) === 0 && (nodes >= maxNodes || now() > deadline)) aborted = true;
      if (aborted) return 0;
      const n = genMoves(ply), base = ply * MAXM;
      if (n === 0) { // pat: při stejném počtu vyhrává černý, jinak strana s menším počtem
        const winner = cw < cb ? W : B;
        return winner === side ? MATE - ply : -(MATE - ply);
      }
      for (let k = 0; k < n; k++) if (mFlag[base + k] & LAST) return MATE - ply - 1; // výhra hned
      if (depth <= 0) { horizon = true; return evaluate(); }

      const kW = wmask, kB = keyB(), slot = (hash & mask) << 1;
      let ttMove = -1, j = -1;
      if (tFlag[slot] && tKeyW[slot] === kW && tKeyB[slot] === kB) j = slot;
      else if (tFlag[slot + 1] && tKeyW[slot + 1] === kW && tKeyB[slot + 1] === kB) j = slot + 1;
      if (j >= 0) {
        ttMove = tMove[j];
        if (tDepth[j] >= depth) {
          const v = fromTT(tVal[j], ply), fl = tFlag[j];
          if (fl === T_EXACT || (fl === T_LOWER && v >= beta) || (fl === T_UPPER && v <= alpha)) {
            if (tDepth[j] !== EXACT) horizon = true;
            return v;
          }
        }
      }
      if (ttMove >= 0) for (let k = 0; k < n; k++) if (((mFrom[base + k] << 6) | mTo[base + k]) === ttMove) { mOrd[base + k] = 2000; break; }

      const savedHorizon = horizon;
      horizon = false;
      const a0 = alpha;
      let best = -INF, bestMove = -1;
      for (let k = 0; k < n; k++) {
        // nejnadějnější tah dopředu (výběrem)
        let bi = k;
        for (let q = k + 1; q < n; q++) if (mOrd[base + q] > mOrd[base + bi]) bi = q;
        if (bi !== k) {
          let t = mFrom[base + k]; mFrom[base + k] = mFrom[base + bi]; mFrom[base + bi] = t;
          t = mTo[base + k]; mTo[base + k] = mTo[base + bi]; mTo[base + bi] = t;
          t = mFlag[base + k]; mFlag[base + k] = mFlag[base + bi]; mFlag[base + bi] = t;
          t = mOrd[base + k]; mOrd[base + k] = mOrd[base + bi]; mOrd[base + bi] = t;
        }
        const from = mFrom[base + k], to = mTo[base + k], fl = mFlag[base + k];
        make(ply, from, to, fl);
        const v = -search(depth - 1, -beta, -alpha, ply + 1);
        unmake(ply, from, to, fl);
        if (aborted) return 0;
        if (v > best) {
          best = v; bestMove = (from << 6) | to;
          if (v > alpha) { alpha = v; if (alpha >= beta) break; }
        }
      }
      const nodeHorizon = horizon;
      horizon = savedHorizon || nodeHorizon;

      const flag = best <= a0 ? T_UPPER : best >= beta ? T_LOWER : T_EXACT;
      const d = nodeHorizon ? depth : EXACT;
      const w = (tFlag[slot] === 0 || (tKeyW[slot] === kW && tKeyB[slot] === kB) || d >= tDepth[slot]) ? slot : slot + 1;
      tKeyW[w] = kW; tKeyB[w] = kB; tVal[w] = toTT(best, ply); tDepth[w] = d; tFlag[w] = flag; tMove[w] = bestMove;
      return best;
    }

    function start(o) {
      nodes = 0; aborted = false; horizon = false; canAbort = false;
      maxNodes = o.maxNodes || Infinity;
      deadline = o.timeLimit ? now() + o.timeLimit : Infinity;
    }

    // Prohledání všech tahů v pozici. Vrací { best: [tahy], worse: [tahy], score, depth, exact, nodes, win1 },
    // tah je { from, to } (indexy polí). Tahy v best mají stejné, nejlepší hodnocení.
    // win1: tah, kterým strana vyhraje hned. null, když strana na tahu nemá tah nebo hra skončila.
    function analyse(pos, o) {
      o = o || {};
      if (P.result(pos)) return null;
      load(pos);
      start(o);
      const n = genMoves(0);
      const moves = [];
      for (let k = 0; k < n; k++) moves.push({ from: mFrom[k], to: mTo[k], fl: mFlag[k], score: 0 });
      const win1 = moves.find(m => m.fl & LAST);
      if (win1) return { best: [strip(win1)], worse: moves.filter(m => m !== win1).map(strip), score: MATE - 1, depth: 1, exact: true, nodes: 1, win1: strip(win1) };
      const maxDepth = o.depth === undefined || o.depth === Infinity ? EXACT : o.depth;
      let result = null;
      for (let d = 1; d <= maxDepth; d++) {
        horizon = false;
        let alpha = -INF;
        const best = [];
        for (const m of moves) {
          make(0, m.from, m.to, m.fl);
          // okno o jedna širší dolů, aby se poznaly tahy stejně dobré jako dosud nejlepší
          const v = -search(d - 1, -INF, alpha === -INF ? INF : -(alpha - 1), 1);
          unmake(0, m.from, m.to, m.fl);
          if (aborted) break;
          m.score = v;
          if (v > alpha) { alpha = v; best.length = 0; best.push(m); } else if (v === alpha) best.push(m);
        }
        if (aborted) break;
        const exact = !horizon;
        result = { best: best.map(strip), worse: moves.filter(m => best.indexOf(m) === -1).map(strip), score: alpha, depth: d, exact, nodes, win1: null };
        // příště se začne nejlepším tahem
        moves.sort((a, b) => (best.indexOf(b) !== -1) - (best.indexOf(a) !== -1) || b.score - a.score);
        canAbort = true; // první hloubka se dopočítá vždy
        if (exact) break;
      }
      if (result) result.nodes = nodes;
      return result;
    }
    const strip = m => ({ from: m.from, to: m.to });

    // Tah počítače podle obtížnosti. rnd: funkce náhody (pro zkoušky). Vrací tah z P.legalMoves.
    function chooseMove(pos, level, rnd) {
      rnd = rnd || Math.random;
      level = level || LEVELS[LEVELS.length - 1];
      const a = analyse(pos, level);
      if (!a) return null;
      let pick;
      if (a.win1) pick = a.win1;
      else if (a.worse.length && rnd() < (level.blunder || 0)) pick = a.worse[Math.floor(rnd() * a.worse.length)];
      else pick = a.best[Math.floor(rnd() * a.best.length)];
      return P.findMove(pos, pick.from, pick.to);
    }

    // Teoretický výsledek pozice při dokonalé hře obou stran: { winner: 'w' | 'b', nodes },
    // s distance: true i { plies } (za kolik půltahů hra skončí). null, když se nevešlo do maxNodes / timeLimit.
    function solve(pos, o) {
      o = o || {};
      const r = P.result(pos);
      if (r) return { winner: r.winner, plies: 0, nodes: 0 };
      load(pos);
      start(o);
      canAbort = true;
      const v = o.distance ? search(EXACT, -INF, INF, 0) : search(EXACT, -1, 1, 0);
      if (aborted) return null;
      const me = side === W ? 'w' : 'b', other = me === 'w' ? 'b' : 'w';
      const out = { winner: v > 0 ? me : other, nodes };
      if (o.distance) out.plies = MATE - Math.abs(v);
      return out;
    }

    // Odhad pozice (z pohledu strany na tahu), pro zkoušky a ladění
    function staticEval(pos) { load(pos); return evaluate(); }
    // Tahy z vlastního generátoru enginu, pro porovnání s pravidly v pesci.js
    function moveList(pos) {
      load(pos);
      const n = genMoves(0), out = [];
      for (let k = 0; k < n; k++) out.push({ from: mFrom[k], to: mTo[k], win: !!(mFlag[k] & LAST) });
      return out;
    }
    function clear() { tFlag.fill(0); }

    return { analyse, chooseMove, solve, staticEval, moveList, clear };
  }

  const engine = createEngine();
  return {
    MATE, LEVELS, createEngine,
    analyse: engine.analyse, chooseMove: engine.chooseMove, solve: engine.solve,
    staticEval: engine.staticEval, moveList: engine.moveList, clear: engine.clear
  };
});
