/*
 * Výuka tahů figur: úrovně a pravidla pohybu.
 * Na šachovnici je jedna bílá figura. Sbírá hvězdičky na prázdných polích, bere černé figury
 * (ty se nehýbou) nebo se má dostat na cílové pole. V úrovních s ochranou nesmí bílá figura
 * stoupnout na pole, které hlídá některá černá figura.
 * Nejmenší počet tahů se počítá prohledáním všech možností (solve), takže úroveň jde ohodnotit
 * hvězdami a zkouška v tests/ ověří, že každá úroveň jde vyřešit.
 * V prohlížeči je dostupné jako window.FIGURY, v Node přes require().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FIGURY = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FILES = 'abcdefgh';
  const idx = sq => FILES.indexOf(sq[0]) + (+sq[1] - 1) * 8;
  const name = i => FILES[i % 8] + (Math.floor(i / 8) + 1);
  const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const KING = ROOK.concat(BISHOP);
  const on = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

  // Pole, kam může figura táhnout. black: { pole: typ } (blokují cestu, dají se brát), white = 'w' pro
  // bílou figuru (pěšec táhne nahoru), 'b' pro černou (černý pěšec bere směrem dolů).
  function targets(type, from, black, color) {
    const f0 = from % 8, r0 = Math.floor(from / 8), out = [];
    const occ = i => black[name(i)] !== undefined;
    const ray = dirs => dirs.forEach(([df, dr]) => {
      let f = f0 + df, r = r0 + dr;
      while (on(f, r)) { const i = f + r * 8; out.push(i); if (occ(i)) break; f += df; r += dr; }
    });
    const step = dirs => dirs.forEach(([df, dr]) => { if (on(f0 + df, r0 + dr)) out.push(f0 + df + (r0 + dr) * 8); });
    if (type === 'r') ray(ROOK);
    else if (type === 'b') ray(BISHOP);
    else if (type === 'q') ray(KING);
    else if (type === 'n') step(KNIGHT);
    else if (type === 'k') step(KING);
    else if (type === 'p') {
      const d = color === 'b' ? -1 : 1;
      if (color === 'b') { step([[-1, d], [1, d]]); return out; } // černý pěšec jen hlídá pole šikmo před sebou
      const one = f0 + (r0 + d) * 8;
      if (on(f0, r0 + d) && !occ(one)) {
        out.push(one);
        const two = f0 + (r0 + 2 * d) * 8;
        if (r0 === 1 && !occ(two)) out.push(two);
      }
      [[-1, d], [1, d]].forEach(([df, dr]) => { if (on(f0 + df, r0 + dr) && occ(f0 + df + (r0 + dr) * 8)) out.push(f0 + df + (r0 + dr) * 8); });
    }
    return out;
  }
  // Pole hlídaná černými figurami (pole s černou figurou, kterou kryje jiná černá figura, se počítá také)
  function guarded(black) {
    const g = new Set();
    Object.keys(black).forEach(sq => {
      const others = Object.assign({}, black);
      targets(black[sq], idx(sq), others, 'b').forEach(i => g.add(i));
    });
    return g;
  }
  // Tahy bílé figury v dané situaci: { to, capture, unsafe }
  function moves(level, sq, black) {
    const g = level.safe ? guarded(black) : null;
    return targets(level.piece, sq, black, 'w').map(i => ({ to: i, capture: black[name(i)] !== undefined, unsafe: !!(g && g.has(i)) }));
  }
  function done(level, sq, stars, black) {
    if (stars.length || (level.goal === 'capture' && Object.keys(black).length)) return false;
    if (level.target) return name(sq) === level.target || (level.target === '8' && sq >= 56);
    return !Object.keys(black).length || level.goal !== 'capture';
  }
  // Nejmenší počet tahů (prohledání do šířky). Vrací Infinity, když úroveň vyřešit nejde.
  function solve(level) {
    const S = level.stars || [], B = Object.keys(level.black || {});
    const startKey = idx(level.start) + ':' + ((1 << (S.length + B.length)) - 1);
    let queue = [[idx(level.start), (1 << (S.length + B.length)) - 1]], seen = new Set([startKey]), depth = 0;
    const unpack = mask => {
      const stars = S.filter((_, i) => mask & (1 << i)), black = {};
      B.forEach((sq, i) => { if (mask & (1 << (S.length + i))) black[sq] = level.black[sq]; });
      return { stars, black };
    };
    while (queue.length && depth < 64) {
      const next = [];
      for (const [sq, mask] of queue) {
        const { stars, black } = unpack(mask);
        if (done(level, sq, stars, black)) return depth;
        for (const m of moves(level, sq, black)) {
          if (m.unsafe) continue;
          let nm = mask;
          const t = name(m.to), si = S.indexOf(t), bi = B.indexOf(t);
          if (si !== -1) nm &= ~(1 << si);
          if (bi !== -1) nm &= ~(1 << (S.length + bi));
          const key = m.to + ':' + nm;
          if (!seen.has(key)) { seen.add(key); next.push([m.to, nm]); }
        }
      }
      queue = next; depth++;
    }
    return Infinity;
  }

  // Kapitoly a úrovně. goal: 'stars' (posbírat hvězdičky), 'capture' (sebrat všechny černé figury),
  // target: cílové pole ('8' = kterékoli pole poslední řady). safe: nestoupat na hlídaná pole.
  const CHAPTERS = [
    { piece: 'r', name: 'Věž', rule: 'Věž táhne rovně: dopředu, dozadu i do stran, o kolik polí chce. Přes jiné figury přeskakovat nesmí.', levels: [
      { start: 'd2', stars: ['d6'] },
      { start: 'a1', stars: ['a8', 'h8'] },
      { start: 'c3', stars: ['c7', 'g7', 'g2', 'b2'] },
      { start: 'a1', goal: 'capture', black: { a6: 'p', e6: 'p', e1: 'p' } },
      { start: 'h1', goal: 'capture', black: { h5: 'p', c5: 'n', c2: 'b', f2: 'p' } },
      { start: 'a5', goal: 'capture', safe: true, black: { e5: 'p', d4: 'p', b8: 'n' } }
    ] },
    { piece: 'b', name: 'Střelec', rule: 'Střelec táhne šikmo, o kolik polí chce. Zůstává pořád na polích stejné barvy.', levels: [
      { start: 'c1', stars: ['g5'] },
      { start: 'f1', stars: ['a6', 'c8'] },
      { start: 'c1', stars: ['h6', 'e7', 'a3', 'b8'] },
      { start: 'f1', goal: 'capture', black: { b5: 'p', d7: 'n', h3: 'p' } },
      { start: 'c1', goal: 'capture', black: { e3: 'p', g5: 'p', a3: 'n', d6: 'r', f8: 'p' } },
      { start: 'a1', goal: 'capture', safe: true, black: { e5: 'p', d6: 'n', h8: 'r' } }
    ] },
    { piece: 'q', name: 'Dáma', rule: 'Dáma umí všechno, co věž a střelec dohromady: táhne rovně i šikmo, o kolik polí chce.', levels: [
      { start: 'd1', stars: ['d7', 'h3'] },
      { start: 'a1', stars: ['h8', 'h1', 'a8', 'e4'] },
      { start: 'd1', goal: 'capture', black: { d6: 'p', a4: 'n', g4: 'b', g7: 'p' } },
      { start: 'e1', goal: 'capture', black: { b4: 'p', e5: 'p', h4: 'n', c7: 'r', f7: 'b', a8: 'p' } },
      { start: 'h1', goal: 'capture', safe: true, black: { c6: 'p', d5: 'p', g6: 'n', b8: 'r' } },
      { start: 'a4', goal: 'capture', safe: true, black: { d7: 'p', c6: 'p', f4: 'b', h6: 'n', e2: 'p' } }
    ] },
    { piece: 'k', name: 'Král', rule: 'Král táhne o jedno pole kterýmkoli směrem. Nesmí nikdy stoupnout na pole, které hlídá soupeř.', levels: [
      { start: 'e1', stars: ['e3'] },
      { start: 'e1', stars: ['h4', 'e5', 'b3'] },
      { start: 'd4', goal: 'capture', black: { f6: 'p', b6: 'p', b2: 'n', f2: 'b' } },
      { start: 'a1', target: 'h8', safe: true, black: { e5: 'p', d6: 'p', g4: 'n' } },
      { start: 'e1', goal: 'capture', safe: true, black: { e4: 'p', c4: 'p', g6: 'n' } },
      { start: 'h1', goal: 'capture', safe: true, black: { e4: 'p', d5: 'p', b6: 'n', g5: 'p' } }
    ] },
    { piece: 'n', name: 'Jezdec', rule: 'Jezdec skáče do tvaru písmene L: dvě pole rovně a jedno do strany. Jako jediná figura umí přeskočit jiné figury.', levels: [
      { start: 'b1', stars: ['c3'] },
      { start: 'g1', stars: ['f3', 'g5', 'e4'] },
      { start: 'a1', target: 'h8' },
      { start: 'h1', target: 'a8', black: { b6: 'p', c7: 'p', d6: 'p', e5: 'p', c5: 'p' }, stars: ['d4'] },
      { start: 'd4', goal: 'capture', black: { f5: 'p', e7: 'p', c6: 'n', b4: 'p', d3: 'b' } },
      { start: 'b1', goal: 'capture', safe: true, black: { d4: 'p', f5: 'p', e7: 'b', g4: 'p' } }
    ] },
    { piece: 'p', name: 'Pěšec', rule: 'Pěšec táhne rovně dopředu o jedno pole, z výchozího pole může o dvě. Bere šikmo dopředu. Když dojde na poslední řadu, promění se třeba v dámu.', levels: [
      { start: 'e2', stars: ['e4'] },
      { start: 'e2', target: '8' },
      { start: 'd2', goal: 'capture', black: { e3: 'p', f4: 'n', g5: 'p' } },
      { start: 'c2', target: '8', black: { c5: 'p', d5: 'p', d6: 'n', e6: 'b' } },
      { start: 'b2', goal: 'capture', black: { c3: 'p', b4: 'p', c5: 'n', d6: 'p' } },
      { start: 'g2', target: '8', black: { g3: 'p', f3: 'p', f5: 'b', e5: 'n' } }
    ] }
  ];
  CHAPTERS.forEach((ch, c) => ch.levels.forEach((lv, l) => {
    lv.piece = ch.piece; lv.stars = lv.stars || []; lv.black = lv.black || {};
    lv.goal = lv.goal || (lv.target ? 'target' : 'stars');
    lv.key = ch.piece + (l + 1);
    lv.chapter = c; lv.n = l + 1;
  }));

  return { CHAPTERS, idx, name, targets, guarded, moves, done, solve };
});
