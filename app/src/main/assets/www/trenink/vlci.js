/*
 * Trénink: vlci a ovečka. Pravidla hry, bez vazby na vzhled aplikace.
 *
 * Hraje se jen na bílých polích šachovnice. Čtyři vlci začínají na a8, c8, e8 a g8, ovečka na jednom
 * bílém poli první řady (b1, d1, f1 nebo h1). Začíná ovečka (jako bílý v šachu). Ovečka i vlci táhnou
 * vždy o jedno pole šikmo, ovečka všemi směry, vlci jen dopředu (k první řadě). Nebere se, na obsazené
 * pole se táhnout nedá.
 * Ovečka vyhraje, když dojde na osmou řadu. Vlci vyhrají, když ovečka na tahu nemá kam táhnout.
 * Když nemají tah vlci, vyhrává ovečka (vlkům už utekla). Remíza není: vlci táhnou jen dopředu,
 * takže hra skončí nejpozději po 28 tazích vlků.
 * Při dokonalé hře vyhrají vždy vlci, ať ovečka začne kdekoli.
 *
 * Pozice: { sheep: pole ovečky, wolves: pole vlků (seřazená), turn: 'sheep' | 'wolves' }, pole jsou
 * indexy 0 až 63 (0 = a1, 63 = h8). Pozice se nemění, play() vrací novou.
 * V prohlížeči je dostupné jako window.VLCI, v Node přes require().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VLCI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FILES = 'abcdefgh';
  const SHEEP_STARTS = ['b1', 'd1', 'f1', 'h1'];
  const WOLF_STARTS = ['a8', 'c8', 'e8', 'g8'];

  const idx = sq => FILES.indexOf(sq[0]) + (+sq[1] - 1) * 8;
  const name = i => FILES[i & 7] + ((i >> 3) + 1);
  const sqIndex = sq => typeof sq === 'number' ? sq : idx(sq);
  // Bílé pole: a1 je černé, b1 bílé
  const isLight = i => ((i & 7) + (i >> 3)) % 2 === 1;
  const rank = i => (i >> 3) + 1;

  function checkSquare(sq, what) {
    if (typeof sq !== 'number' && !/^[a-h][1-8]$/.test(sq)) throw new Error('Neplatné pole ' + sq);
    const i = sqIndex(sq);
    if (!(i >= 0 && i < 64)) throw new Error('Neplatné pole ' + sq);
    if (!isLight(i)) throw new Error(what + ' musí stát na bílém poli, ' + name(i) + ' je černé');
    return i;
  }
  function make(sheep, wolves, turn) {
    const w = wolves.slice().sort((a, b) => a - b);
    for (let k = 1; k < w.length; k++) if (w[k] === w[k - 1]) throw new Error('Na poli ' + name(w[k]) + ' už vlk stojí');
    if (w.indexOf(sheep) !== -1) throw new Error('Na poli ' + name(sheep) + ' stojí vlk');
    if (turn !== 'sheep' && turn !== 'wolves') throw new Error('Na tahu musí být sheep nebo wolves');
    return { sheep, wolves: w, turn };
  }
  // Výchozí postavení: ovečka na zvoleném poli první řady, vlci na a8, c8, e8, g8, táhne ovečka
  function startPosition(sheepSquare) {
    const s = checkSquare(sheepSquare, 'Ovečka');
    if (rank(s) !== 1) throw new Error('Ovečka začíná na první řadě, ne na ' + name(s));
    return make(s, WOLF_STARTS.map(idx), 'sheep');
  }
  // Libovolná pozice: { sheep: 'e4', wolves: ['d5', 'f5'], turn: 'wolves' }
  function fromSquares(o) {
    return make(checkSquare(o.sheep, 'Ovečka'), (o.wolves || []).map(w => checkSquare(w, 'Vlk')), o.turn || 'sheep');
  }

  // Sousední pole šikmo o jednu řadu nahoru (dr = 1) nebo dolů (dr = -1)
  function diagonal(i, dr) {
    const out = [], f = i & 7, r = (i >> 3) + dr;
    if (r < 0 || r > 7) return out;
    if (f > 0) out.push(f - 1 + r * 8);
    if (f < 7) out.push(f + 1 + r * 8);
    return out;
  }
  // Legální tahy strany na tahu: { from, to } (indexy polí). Nekontroluje, jestli hra už neskončila.
  function legalMoves(pos) {
    const out = [], busy = t => t === pos.sheep || pos.wolves.indexOf(t) !== -1;
    if (pos.turn === 'sheep') {
      for (const t of diagonal(pos.sheep, 1).concat(diagonal(pos.sheep, -1))) if (!busy(t)) out.push({ from: pos.sheep, to: t });
    } else {
      for (const w of pos.wolves) for (const t of diagonal(w, -1)) if (!busy(t)) out.push({ from: w, to: t });
    }
    return out.sort((a, b) => a.from - b.from || a.to - b.to);
  }
  function findMove(pos, from, to) {
    const f = sqIndex(from), t = sqIndex(to);
    return legalMoves(pos).find(m => m.from === f && m.to === t) || null;
  }
  // Nová pozice po tahu (tah musí pocházet z legalMoves)
  function play(pos, m) {
    if (pos.turn === 'sheep') return { sheep: m.to, wolves: pos.wolves.slice(), turn: 'wolves' };
    const wolves = pos.wolves.map(w => w === m.from ? m.to : w).sort((a, b) => a - b);
    return { sheep: pos.sheep, wolves, turn: 'sheep' };
  }
  // Výsledek: null (hraje se dál) nebo { winner: 'sheep' | 'wolves', reason }.
  // reason: 'escaped' (ovečka na osmé řadě), 'trapped' (ovečka nemá tah), 'wolvesStuck' (vlci nemají tah)
  function result(pos) {
    if (rank(pos.sheep) === 8) return { winner: 'sheep', reason: 'escaped' };
    if (!legalMoves(pos).length) return pos.turn === 'sheep' ? { winner: 'wolves', reason: 'trapped' } : { winner: 'sheep', reason: 'wolvesStuck' };
    return null;
  }
  // Zápis tahu: d1-e2
  const moveText = m => name(m.from) + '-' + name(m.to);
  const key = pos => pos.sheep + ':' + pos.wolves.join(',') + ':' + (pos.turn === 'sheep' ? 's' : 'w');

  return {
    FILES, SHEEP_STARTS, WOLF_STARTS, idx, name, isLight, rank, diagonal,
    startPosition, fromSquares, legalMoves, findMove, play, result, moveText, key
  };
});
