/*
 * Výuka: matové koncovky. Pravidla cvičení, bez vazby na vzhled aplikace.
 *
 * Bílý (hráč) má krále a jednu nebo dvě figury, černý (počítač) jen krále. Bílý má dát mat do 50 tahů,
 * jinak cvičení končí remízou podle pravidla 50 tahů. Neúspěch je i pat a ztráta figury (černý král
 * ji sebere). Výchozí pozice jsou ve vyuka/koncovky.txt i s délkou nejkratšího matu při nejlepší
 * obraně, kterou spočítal tools/koncovky.js. Podle ní se dávají hvězdy, každá nápověda jednu ubere.
 *
 * Tahy a konec hry hlídá chess.js. Pozice: { fen, turn: 'w' | 'b', n: počet tahů bílého,
 * captured: sebraná figura ('q', 'r', 'b', 'n') nebo null }. Pole jsou indexy 0 = a1 až 63 = h8.
 * Pozice se nemění, play() vrací novou.
 * V prohlížeči je dostupné jako window.KONCOVKY, v Node přes require().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../chess.js').Chess);
  else root.KONCOVKY = factory(root.Chess);
})(typeof self !== 'undefined' ? self : this, function (Chess) {
  'use strict';

  const FILES = 'abcdefgh';
  const MAX_MOVES = 50;
  const idx = sq => FILES.indexOf(sq[0]) + (+sq[1] - 1) * 8;
  const name = i => FILES[i & 7] + ((i >> 3) + 1);

  // Varianty v pořadí od nejlehčí, jak je mají děti procházet. Id odpovídá prvnímu sloupci sbírky.
  const VARIANTS = [
    { id: 'qr', name: 'Dáma a věž', pieces: 'qr', tip: 'Dáma a věž se střídají jako po schodech: jedna hlídá řadu, druhá dává šach o řadu dál. Král pomáhat nemusí.' },
    { id: 'rr', name: 'Dvě věže', pieces: 'rr', tip: 'Věže se střídají jako po schodech a zatlačí krále na okraj. Když se král k věži přiblíží, odveď ji na druhý konec řady.' },
    { id: 'q', name: 'Dáma', pieces: 'q', tip: 'Dámou zmenšuj prostor krále, třeba tahem o skok jezdce od něj. Pak přiveď svého krále. Pozor na pat!' },
    { id: 'r', name: 'Věž', pieces: 'r', tip: 'Věží odřízni krále od zbytku šachovnice a přiveď svého krále naproti němu. Pak věží šachuj.' },
    { id: 'bb', name: 'Dva střelci', pieces: 'bb', tip: 'Střelci vedle sebe tvoří zeď, přes kterou král nepřejde. Zatlač ho do rohu, tvůj král musí pomáhat.' },
    { id: 'bn', name: 'Jezdec a střelec', pieces: 'bn', tip: 'Nejtěžší mat. Dát ho jde jen v rohu, který má barvu tvého střelce. Nejdřív zatlač krále na okraj.' }
  ];

  // Sbírka z vyuka/koncovky.txt: { id varianty: [{ fen, dtm }] }
  function parse(txt) {
    const out = {};
    for (const line of String(txt).split('\n')) {
      if (!line || line[0] === '#') continue;
      const [v, fen, dtm] = line.trim().split('|');
      if (!v || !fen || !(+dtm > 0)) continue;
      (out[v] = out[v] || []).push({ fen, dtm: +dtm });
    }
    return out;
  }

  const startPosition = fen => ({ fen, turn: 'w', n: 0, captured: null });

  function legalMoves(pos) {
    const c = new Chess(pos.fen);
    return c.moves({ verbose: true }).map(m => ({
      from: idx(m.from), to: idx(m.to), capture: !!m.captured, captured: m.captured || null,
      color: m.color, piece: m.piece, san: m.san, promotion: m.promotion
    }));
  }
  const findMove = (pos, from, to) => legalMoves(pos).find(m => m.from === from && m.to === to) || null;

  function play(pos, m) {
    const c = new Chess(pos.fen);
    const r = c.move({ from: name(m.from), to: name(m.to), promotion: m.promotion || 'q' });
    if (!r) throw new Error('Neplatný tah ' + name(m.from) + '-' + name(m.to));
    return { fen: c.fen(), turn: c.turn(), n: pos.n + (r.color === 'w' ? 1 : 0), captured: r.captured || pos.captured };
  }

  // Konec cvičení: { winner: 'w' | 'b', reason: 'mate' | 'stalemate' | 'capture' | 'fifty', piece }
  function result(pos) {
    if (pos.captured) return { winner: 'b', reason: 'capture', piece: pos.captured };
    const c = new Chess(pos.fen);
    if (c.in_checkmate()) return { winner: 'w', reason: 'mate' };
    if (c.in_stalemate()) return { winner: 'b', reason: 'stalemate' };
    if (pos.turn === 'b' && pos.n >= MAX_MOVES) return { winner: 'b', reason: 'fifty' };
    return null;
  }

  function pieceAt(pos, i) {
    const p = new Chess(pos.fen).get(name(i));
    return p ? { color: p.color, type: p.type } : null;
  }

  const moveText = m => m.san;
  // Tah ve formátu UCI (e2e4) jako { from, to }
  const fromUci = u => (u && /^[a-h][1-8][a-h][1-8]/.test(u)) ? { from: idx(u.slice(0, 2)), to: idx(u.slice(2, 4)) } : null;

  // Hvězdy: ★★★ nejvýš o 2 tahy víc než nejkratší mat, ★★ nejvýš o polovinu víc (plus 2 tahy),
  // ★ mat do 50 tahů. Každá nápověda ubere hvězdu, za mat je ale vždy aspoň jedna.
  const starLimits = dtm => [dtm + 2, Math.floor(dtm * 1.5) + 2];
  function stars(moves, dtm, hints) {
    const [a, b] = starLimits(dtm);
    const base = moves <= a ? 3 : moves <= b ? 2 : 1;
    return Math.max(1, base - (hints || 0));
  }

  // Náhradní obrana, když Stockfish nejde spustit: černý král sebere nekrytou figuru, vyhne se matu
  // jedním tahem a drží se co nejdál od okraje a od bílého krále.
  function defend(fen) {
    const c = new Chess(fen);
    let best = null, bestScore = -Infinity;
    for (const m of c.moves({ verbose: true })) {
      let score;
      if (m.captured) score = 1e6;
      else {
        c.move(m);
        if (c.in_stalemate()) score = 1e5; // pat nabízí bílý, černému se hodí
        else {
          const mateIn1 = c.moves({ verbose: true }).some(w => { c.move(w); const mate = c.in_checkmate(); c.undo(); return mate; });
          const f = idx(m.to) & 7, r = idx(m.to) >> 3;
          let wk = null;
          c.board().forEach((row, ri) => row.forEach((p, fi) => { if (p && p.type === 'k' && p.color === 'w') wk = [fi, 7 - ri]; }));
          const edge = Math.max(Math.abs(f - 3.5), Math.abs(r - 3.5));
          const dist = wk ? Math.max(Math.abs(f - wk[0]), Math.abs(r - wk[1])) : 0;
          score = (mateIn1 ? -1e4 : 0) - 10 * edge + dist + c.moves().length * 0.1;
        }
        c.undo();
      }
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best ? { from: idx(best.from), to: idx(best.to) } : null;
  }

  return { FILES, MAX_MOVES, VARIANTS, idx, name, parse, startPosition, legalMoves, findMove, play, result, pieceAt, moveText, fromUci, starLimits, stars, defend };
});
