/*
 * Trénink: pěšci proti pěšcům. Pravidla hry a série kol, bez vazby na vzhled aplikace.
 *
 * Pravidla: na šachovnici jsou jen pěšci. Táhnou a berou jako v šachu, z výchozí řady i o dvě pole,
 * platí braní mimochodem (en passant). Braní není povinné, proměna není. Vyhrává, kdo první dojde
 * pěšcem na poslední řadu nebo komu soupeř nemá žádného pěšce. Když strana na tahu nemá žádný tah
 * (pat), při stejném počtu pěšců vyhrává černý, při nestejném strana s menším počtem. Remíza není.
 * Pořadí: poslední řada, pak žádný pěšec, pak pat. Bílý táhne první.
 *
 * Série kol: začíná se 8 proti 8. Vítězi kola se počet pěšců pro další kolo sníží o jednoho,
 * poražený si počet ponechá. Kdo vyhraje kolo s nejmenším povoleným počtem (minPawns, 4),
 * vyhrál celou sérii. Proč 4: bílý se 4 pěšci vyhraje při dokonalé hře 4 proti 4, černý se 4 pěšci
 * nevyhraje proti 4 a více bílým, takže hráč (bílý) má na konci série výhodu. Při konci se 3 pěšci
 * by ji měl počítač (3 proti 3 vyhraje černý), viz tools/pesci-analyza.md.
 *
 * Pozice: { board: Int8Array(64) (1 bílý pěšec, -1 černý, 0 prázdné; index 0 = a1, 63 = h8),
 *           turn: 'w' | 'b', ep: pole pro braní mimochodem nebo -1, white, black: počty pěšců }.
 * Pozice se nemění, play() vrací novou.
 * V prohlížeči je dostupné jako window.PESCI, v Node přes require().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PESCI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FILES = 'abcdefgh';
  const W = 1, B = -1;
  // Při menším počtu pěšců se odebírají celé sloupce v tomto pořadí
  const REMOVE_ORDER = 'ahbgcfde';
  const MIN_PAWNS = 4;

  const idx = sq => FILES.indexOf(sq[0]) + (+sq[1] - 1) * 8;
  const name = i => FILES[i & 7] + ((i >> 3) + 1);
  const sqIndex = sq => typeof sq === 'number' ? sq : idx(sq);

  function checkCount(n) {
    if (!Number.isInteger(n) || n < 1 || n > 8) throw new RangeError('Počet pěšců musí být 1 až 8, ne ' + n);
  }
  // Sloupce, na kterých stojí pěšci při daném počtu (6 pěšců: b až g)
  function startFiles(n) {
    checkCount(n);
    const removed = REMOVE_ORDER.slice(0, 8 - n);
    return FILES.split('').filter(f => removed.indexOf(f) === -1);
  }
  // Výchozí postavení: bílí pěšci na 2. řadě, černí na 7., každá strana podle svého počtu
  function startPosition(white, black) {
    const board = new Int8Array(64);
    startFiles(white).forEach(f => { board[FILES.indexOf(f) + 8] = W; });
    startFiles(black).forEach(f => { board[FILES.indexOf(f) + 48] = B; });
    return { board, turn: 'w', ep: -1, white, black };
  }
  // Libovolná pozice z názvů polí: { white: ['e5'], black: ['d5'], turn: 'w', ep: 'd6' }
  function fromSquares(o) {
    const board = new Int8Array(64);
    const put = (list, v, bad) => (list || []).forEach(sq => {
      if (!/^[a-h][1-8]$/.test(sq)) throw new Error('Neplatné pole ' + sq);
      const i = idx(sq);
      if (board[i]) throw new Error('Na poli ' + sq + ' už pěšec stojí');
      if (sq[1] === bad) throw new Error((v === W ? 'Bílý' : 'Černý') + ' pěšec nemůže stát na ' + sq);
      board[i] = v;
    });
    put(o.white, W, '1');
    put(o.black, B, '8');
    return { board, turn: o.turn || 'w', ep: o.ep ? idx(o.ep) : -1, white: (o.white || []).length, black: (o.black || []).length };
  }
  function pieceAt(pos, sq) {
    const v = pos.board[sqIndex(sq)];
    return v === W ? 'w' : v === B ? 'b' : null;
  }
  // Pole s pěšci jedné strany, např. ['d2', 'e2']
  function squares(pos, color) {
    const v = color === 'w' ? W : B, out = [];
    for (let i = 0; i < 64; i++) if (pos.board[i] === v) out.push(name(i));
    return out;
  }

  // Legální tahy strany na tahu: { from, to, capture, enPassant, double } (from a to jsou indexy polí).
  // Nekontroluje, jestli hra už neskončila, to dělá result().
  function legalMoves(pos) {
    const out = [], b = pos.board, s = pos.turn === 'w' ? W : B;
    const dir = s === W ? 8 : -8, home = s === W ? 1 : 6;
    const add = (from, to, capture, enPassant, double) => out.push({ from, to, capture, enPassant, double });
    for (let i = 0; i < 64; i++) {
      if (b[i] !== s) continue;
      const f = i & 7, one = i + dir;
      if (one < 0 || one > 63) continue; // pěšec na poslední řadě (hra už skončila)
      if (b[one] === 0) {
        add(i, one, false, false, false);
        if ((i >> 3) === home && b[one + dir] === 0) add(i, one + dir, false, false, true);
      }
      for (const t of [f > 0 ? one - 1 : -1, f < 7 ? one + 1 : -1]) {
        if (t < 0) continue;
        if (b[t] === -s) add(i, t, true, false, false);
        else if (t === pos.ep) add(i, t, true, true, false);
      }
    }
    return out;
  }
  // Tah z pole na pole, pokud je legální (pole jako 'e2' nebo index), jinak null
  function findMove(pos, from, to) {
    const f = sqIndex(from), t = sqIndex(to);
    return legalMoves(pos).find(m => m.from === f && m.to === t) || null;
  }
  // Nová pozice po tahu (tah musí pocházet z legalMoves)
  function play(pos, m) {
    const board = pos.board.slice(), s = board[m.from];
    board[m.from] = 0;
    board[m.to] = s;
    if (m.enPassant) board[m.to - (s === W ? 8 : -8)] = 0;
    let white = pos.white, black = pos.black;
    if (m.capture) { if (s === W) black--; else white--; }
    return { board, turn: pos.turn === 'w' ? 'b' : 'w', ep: m.double ? (m.from + m.to) / 2 : -1, white, black };
  }

  // Výsledek pozice: null (hraje se dál) nebo { winner: 'w' | 'b', reason }.
  // reason: 'lastRank' (pěšec na poslední řadě), 'noPawns' (soupeř nemá pěšce),
  // 'stalemate' (strana na tahu nemá tah; stalemated = kdo je patovaný).
  function result(pos) {
    const b = pos.board;
    for (let f = 0; f < 8; f++) {
      if (b[56 + f] === W) return { winner: 'w', reason: 'lastRank' };
      if (b[f] === B) return { winner: 'b', reason: 'lastRank' };
    }
    if (pos.black === 0) return { winner: 'w', reason: 'noPawns' };
    if (pos.white === 0) return { winner: 'b', reason: 'noPawns' };
    if (!legalMoves(pos).length) return { winner: stalemateWinner(pos.white, pos.black), reason: 'stalemate', stalemated: pos.turn };
    return null;
  }
  // Pat: při stejném počtu vyhrává černý, jinak strana s menším počtem pěšců
  const stalemateWinner = (white, black) => white < black ? 'w' : 'b';

  // Zápis tahu: e4, dxe5, dxe6 e.p.
  function moveText(m) {
    const to = name(m.to);
    if (!m.capture) return to;
    return FILES[m.from & 7] + 'x' + to + (m.enPassant ? ' e.p.' : '');
  }
  // Textový klíč pozice (pro zkoušky a ladění)
  function key(pos) {
    let s = '';
    for (let i = 0; i < 64; i++) s += pos.board[i] === W ? 'P' : pos.board[i] === B ? 'p' : '.';
    return s + ' ' + pos.turn + ' ' + (pos.ep >= 0 ? name(pos.ep) : '-');
  }

  /* ---------- Série kol ---------- */
  // { white, black: počty pěšců v příštím kole, round: číslo příštího kola, wins: { w, b } vyhraná kola,
  //   history: [{ white, black, winner }], winner: vítěz série nebo null, minPawns }
  function newSeries(opts) {
    const o = opts || {};
    const white = o.white === undefined ? 8 : o.white, black = o.black === undefined ? 8 : o.black;
    const minPawns = o.minPawns === undefined ? MIN_PAWNS : o.minPawns;
    checkCount(white); checkCount(black); checkCount(minPawns);
    if (white < minPawns || black < minPawns) throw new RangeError('Série nemůže začít s méně než ' + minPawns + ' pěšci');
    return { white, black, round: 1, wins: { w: 0, b: 0 }, history: [], winner: null, minPawns };
  }
  // Série po odehraném kole (původní série se nemění)
  function nextRound(series, winner) {
    if (winner !== 'w' && winner !== 'b') throw new Error('Vítěz kola musí být w nebo b');
    if (series.winner) throw new Error('Série už skončila');
    const s = {
      white: series.white, black: series.black, round: series.round + 1,
      wins: { w: series.wins.w, b: series.wins.b }, history: series.history.concat([{ white: series.white, black: series.black, winner }]),
      winner: null, minPawns: series.minPawns
    };
    s.wins[winner]++;
    const k = winner === 'w' ? 'white' : 'black';
    if (s[k] - 1 < s.minPawns) s.winner = winner; // vyhrál s nejmenším počtem: konec série
    else s[k]--;
    return s;
  }

  return {
    FILES, REMOVE_ORDER, MIN_PAWNS, idx, name, startFiles, startPosition, fromSquares, pieceAt, squares,
    legalMoves, findMove, play, result, stalemateWinner, moveText, key, newSeries, nextRound
  };
});
