/*
 * Trénink: vlci a ovečka. Počítačový soupeř, bez vazby na vzhled aplikace.
 *
 * Hra je malá, takže engine vždy zná přesný výsledek: prohledá ji do konce (minimax) a každou pozici
 * si zapamatuje v tabulce (ovečka na jednom z 32 bílých polí × rozestavení vlků × kdo je na tahu).
 * Pozice se nemůže opakovat (vlci táhnou jen dopředu), takže tabulka je vždy přesná.
 *
 * Hodnocení je z pohledu strany na tahu: MATE - n znamená výhru za n půltahů, -(MATE - n) prohru.
 * Dokonalá hra: vyhrávající strana volí nejrychlejší výhru, prohrávající se brání co nejdéle.
 *
 * Úrovně: Normální dělá chyby (s pravděpodobností mistakes zahraje horší tah), Dokonalá hraje
 * vždy nejlépe. Výhru jedním tahem engine nevynechá nikdy.
 * Chybovost Normální úrovně je pro každou stranu jiná, protože hra je nesymetrická: vlkům stačí
 * jedna chyba a dobrá ovečka uteče, ovečka naopak musí chybovat často, aby ji dítě za vlky chytilo.
 * Ze zápasů: normální vlky porazí dokonalá ovečka skoro vždy, ovečka, která jen leze nahoru,
 * zhruba v 60 % her. Normální ovečku chytí vlci, kteří chybují v 10 % tahů, asi v 70 % her.
 * Pravidla bere z vlci.js. V prohlížeči je dostupné jako window.VLCI_ENGINE, v Node přes require().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vlci.js'));
  else root.VLCI_ENGINE = factory(root.VLCI);
})(typeof self !== 'undefined' ? self : this, function (V) {
  'use strict';

  const MATE = 1000;
  const LEVELS = [
    { id: 'normal', name: 'Normální', mistakes: { wolves: 0.15, sheep: 0.5 } },
    { id: 'perfect', name: 'Dokonalá', mistakes: { wolves: 0, sheep: 0 } }
  ];

  // Bílá pole očíslovaná 0 až 31, sousedé šikmo nahoru a dolů
  const LIGHT = [], LIGHT_OF = new Int8Array(64).fill(-1);
  for (let i = 0; i < 64; i++) if (V.isLight(i)) { LIGHT_OF[i] = LIGHT.length; LIGHT.push(i); }
  const UP = [], DOWN = [];
  for (let i = 0; i < 64; i++) { UP.push(V.diagonal(i, 1)); DOWN.push(V.diagonal(i, -1)); }
  // Kombinační čísla pro pořadí rozestavení vlků (C(n, k), n < 33, k <= 4)
  const C = [];
  for (let n = 0; n <= 32; n++) { C.push([1]); for (let k = 1; k <= 4; k++) C[n].push(n === 0 ? 0 : C[n - 1][k - 1] + C[n - 1][k]); }

  function createEngine() {
    const tables = {}; // podle počtu vlků: Int16Array, 0 = ještě nespočítáno
    let sheep = 0, turn = 0, n = 0, nodes = 0; // turn 0 = ovečka, 1 = vlci
    const wolves = new Int8Array(4), sorted = new Int8Array(4);

    function index() {
      // vlci seřazení podle čísla bílého pole, pořadí rozestavení v kombinační soustavě
      for (let k = 0; k < n; k++) sorted[k] = LIGHT_OF[wolves[k]];
      for (let a = 1; a < n; a++) { const x = sorted[a]; let b = a - 1; while (b >= 0 && sorted[b] > x) { sorted[b + 1] = sorted[b]; b--; } sorted[b + 1] = x; }
      let comb = 0;
      for (let k = 0; k < n; k++) comb += C[sorted[k]][k + 1];
      return (comb * 32 + LIGHT_OF[sheep]) * 2 + turn;
    }
    const busy = t => { if (t === sheep) return true; for (let k = 0; k < n; k++) if (wolves[k] === t) return true; return false; };

    // Hodnocení pozice z pohledu strany na tahu
    function search(table) {
      if (turn === 1 && sheep >= 56) return -MATE; // ovečka došla na osmou řadu
      const ix = index();
      const known = table[ix];
      if (known) return known;
      nodes++;
      let best = -MATE, any = false;
      if (turn === 0) {
        const s = sheep;
        for (const t of UP[s].concat(DOWN[s])) {
          if (busy(t)) continue;
          any = true;
          sheep = t; turn = 1;
          let v = -search(table);
          sheep = s; turn = 0;
          v = v > 0 ? v - 1 : v + 1;
          if (v > best) best = v;
        }
      } else {
        for (let k = 0; k < n; k++) {
          const w = wolves[k];
          for (const t of DOWN[w]) {
            if (busy(t)) continue;
            any = true;
            wolves[k] = t; turn = 0;
            let v = -search(table);
            wolves[k] = w; turn = 1;
            v = v > 0 ? v - 1 : v + 1;
            if (v > best) best = v;
          }
        }
      }
      if (!any) best = -MATE; // strana na tahu nemá tah a prohrává
      table[ix] = best;
      return best;
    }
    function load(pos) {
      sheep = pos.sheep; turn = pos.turn === 'sheep' ? 0 : 1; n = pos.wolves.length;
      if (n < 1 || n > 4) throw new Error('Vlků musí být 1 až 4');
      for (let k = 0; k < n; k++) wolves[k] = pos.wolves[k];
      if (!tables[n]) tables[n] = new Int16Array(C[32][n] * 64);
      return tables[n];
    }
    // Hodnocení pozice z pohledu strany na tahu (0 se nevrací: každá pozice je pro někoho vyhraná)
    function score(pos) {
      const r = V.result(pos);
      if (r) return -MATE; // hra skončila, strana na tahu prohrála
      return search(load(pos));
    }

    // Všechny tahy s hodnocením z pohledu strany na tahu: [{ from, to, score }], nejlepší první.
    function analyse(pos) {
      if (V.result(pos)) return null;
      return V.legalMoves(pos).map(m => {
        const v = -score(V.play(pos, m));
        return { from: m.from, to: m.to, score: v > 0 ? v - 1 : v + 1 };
      }).sort((a, b) => b.score - a.score);
    }
    // Teoretický výsledek: { winner: 'sheep' | 'wolves', plies: za kolik půltahů hra skončí }
    function solve(pos) {
      const r = V.result(pos);
      if (r) return { winner: r.winner, plies: 0 };
      const v = score(pos);
      const me = pos.turn, other = me === 'sheep' ? 'wolves' : 'sheep';
      return { winner: v > 0 ? me : other, plies: MATE - Math.abs(v) };
    }

    // Tah počítače podle úrovně ({ mistakes: číslo, nebo { wolves, sheep } podle strany na tahu }).
    // rnd: funkce náhody (pro zkoušky). Vrací tah z V.legalMoves.
    // Chyba: tah s horším výsledkem (z výhry prohra), a když jsou všechny tahy stejně vyhrané
    // nebo prohrané, aspoň pomalejší výhra nebo rychlejší prohra.
    function chooseMove(pos, level, rnd) {
      rnd = rnd || Math.random;
      level = level || LEVELS[LEVELS.length - 1];
      const a = analyse(pos);
      if (!a || !a.length) return null;
      const top = a[0].score;
      let pool = a.filter(m => m.score === top);
      const mistakes = typeof level.mistakes === 'number' ? level.mistakes : (level.mistakes || {})[pos.turn] || 0;
      if (top === MATE - 1) { /* výhra jedním tahem: tu engine nevynechá nikdy */ }
      else if (mistakes && rnd() < mistakes) {
        const flip = a.filter(m => (m.score > 0) !== (top > 0));
        const worse = flip.length ? flip : a.filter(m => m.score < top);
        if (worse.length) pool = worse;
      }
      const pick = pool[Math.floor(rnd() * pool.length)];
      return V.findMove(pos, pick.from, pick.to);
    }
    function stats() { return { nodes }; }
    function clear() { for (const k in tables) delete tables[k]; nodes = 0; }

    return { analyse, solve, chooseMove, score, stats, clear };
  }

  // Výchozí pole ovečky, když za ni hraje počítač: náhodně jedno ze čtyř
  function chooseStart(rnd) {
    rnd = rnd || Math.random;
    return V.SHEEP_STARTS[Math.floor(rnd() * V.SHEEP_STARTS.length)];
  }

  const engine = createEngine();
  return {
    MATE, LEVELS, createEngine, chooseStart,
    analyse: engine.analyse, solve: engine.solve, chooseMove: engine.chooseMove, score: engine.score, clear: engine.clear
  };
});
