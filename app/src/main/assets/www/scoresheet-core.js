/*
 * Photo-to-PGN: jádro, které z přečtených zápisů tahů složí platnou partii.
 *
 * Claude přečte z fotky, co je na partiáři napsáno (a k tomu svůj odhad tahu).
 * Ručně psaný zápis ale bývá nejednoznačný (S/5, b/6, 1/7, chybějící braní, přeskočený tah).
 * Tady se proto každý přečtený tah porovná se všemi tahy, které jsou v dané pozici
 * podle pravidel možné, a prohledávání s několika souběžnými variantami (beam search)
 * vybere posloupnost legálních tahů, která přečtenému textu odpovídá nejlépe.
 * Nejisté tahy se označí, aby je člověk mohl zkontrolovat a opravit.
 *
 * Funguje v prohlížeči (window.Scoresheet) i v Node.js (require). Potřebuje chess.js 0.10.x
 * (globální Chess, nebo předaný v options.Chess).
 *
 * Licence: GNU GPL 3 nebo novější.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Scoresheet = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  /* ---------- Notace v různých jazycích ---------- */

  // Písmena figur -> anglická notace (prázdný řetězec = pěšec)
  const LANGS = {
    english:   { K: 'K', Q: 'Q', R: 'R', B: 'B', N: 'N', P: '' },
    czech:     { K: 'K', D: 'Q', V: 'R', S: 'B', J: 'N', P: '' },
    slovak:    { K: 'K', D: 'Q', V: 'R', S: 'B', J: 'N', P: '' },
    german:    { K: 'K', D: 'Q', T: 'R', L: 'B', S: 'N', B: '' },
    polish:    { K: 'K', H: 'Q', W: 'R', G: 'B', S: 'N', P: '' },
    hungarian: { K: 'K', V: 'Q', B: 'R', F: 'B', H: 'N', G: '' },
    french:    { R: 'K', D: 'Q', T: 'R', F: 'B', C: 'N', P: '' },
    spanish:   { R: 'K', D: 'Q', T: 'R', A: 'B', C: 'N', P: '' },
    italian:   { R: 'K', D: 'Q', T: 'R', A: 'B', C: 'N', P: '' },
    dutch:     { K: 'K', D: 'Q', T: 'R', L: 'B', P: 'N' },
    russian:   { 'Кр': 'K', 'Ф': 'Q', 'Л': 'R', 'С': 'B', 'К': 'N', 'п': '' }
  };
  const LANG_NAMES = Object.keys(LANGS);
  const FIGURINES = { '♔': 'K', '♚': 'K', '♕': 'Q', '♛': 'Q', '♖': 'R', '♜': 'R', '♗': 'B', '♝': 'B', '♘': 'N', '♞': 'N', '♙': '', '♟': '' };

  /**
   * Upraví zapsaný tah do jednotného tvaru v anglické notaci bez znaků braní a šachu:
   * "Jf3" -> "Nf3", "S:c4" -> "Bc4", "e2-e4" -> "e2e4", "exd5" -> "ed5", "e8D" -> "e8Q", "0-0" -> "O-O".
   * Vrací pole možných výkladů (u neznámého jazyka se vyzkouší všechny).
   */
  function normalizeWritten(text, lang) {
    let t = String(text == null ? '' : text).trim();
    if (!t) return [];
    t = t.replace(/[♔♚♕♛♖♜♗♝♘♞♙♟]/g, ch => FIGURINES[ch]);
    t = t.replace(/\s*e\.\s*p\.?\s*$/i, '').replace(/\s+ep$/i, '');
    t = t.replace(/[+#†‡!?]/g, '').replace(/\s+/g, '');
    if (/^[0OoО]-?[0OoО]-?[0OoО]$/.test(t)) return ['O-O-O'];
    if (/^[0OoО]-?[0OoО]$/.test(t)) return ['O-O'];
    t = t.replace(/[x×:Xх]/g, '').replace(/[-–—=/()]/g, '');
    if (!t) return [];
    const langs = lang && LANGS[lang] ? [lang] : LANG_NAMES;
    const out = [];
    langs.forEach(l => {
      const map = LANGS[l];
      let s = t;
      // Písmeno figury na začátku (výjimečně psané malým písmenem, pokud nejde o sloupec a–h)
      let piece = null;
      if (l === 'russian' && s.startsWith('Кр')) { piece = 'K'; s = s.slice(2); }
      else {
        const c = s[0];
        if (Object.prototype.hasOwnProperty.call(map, c)) { piece = map[c]; s = s.slice(1); }
        else if (/[A-Z]/.test(c) && 'KQRBN'.includes(c) && l === 'english') { piece = c; s = s.slice(1); }
        else if (/[i-z]/.test(c) && Object.prototype.hasOwnProperty.call(map, c.toUpperCase())) { piece = map[c.toUpperCase()]; s = s.slice(1); }
      }
      // Proměna: písmeno figury za řadou 1 nebo 8
      s = s.replace(/([18])([A-Za-zА-Яа-я]{1,2})$/, (all, rank, p) => {
        const up = p.length === 1 ? p.toUpperCase() : p;
        const m = Object.prototype.hasOwnProperty.call(map, up) ? map[up] : (l === 'english' && 'QRBN'.includes(up) ? up : null);
        return m ? rank + m : all;
      });
      const key = (piece || '') + s;
      if (key && !out.includes(key)) out.push(key);
    });
    return out;
  }

  /* ---------- Klíče legálního tahu ---------- */

  // Všechny podoby, jak lze daný legální tah zapsat, s vahou (1 = přesný zápis)
  function moveKeys(m) {
    if (m.flags.includes('k')) return [['O-O', 1]];
    if (m.flags.includes('q')) return [['O-O-O', 1]];
    const P = m.piece === 'p' ? '' : m.piece.toUpperCase();
    const promo = m.promotion ? m.promotion.toUpperCase() : '';
    const san = m.san.replace(/[+#=x]/g, '');
    const keys = [[san, 1], [P + m.from + m.to + promo, 1]];
    const add = (k, w) => { if (!keys.some(x => x[0] === k)) keys.push([k, w]); };
    if (m.piece === 'p') {
      if (m.captured) {
        add(m.from[0] + m.to[0] + promo, 0.9);          // "ed" místo "exd5"
        add(m.to + promo, 0.55);                        // chybí sloupec braní
      }
      if (promo) add(san.replace(/[QRBN]$/, ''), promo === 'Q' ? 0.85 : 0.4); // chybí proměněná figura
    } else {
      add(P + m.to, 0.92);                              // chybí rozlišení (Jf3 místo Jgf3)
      add(P + m.from[0] + m.to, 0.95);                  // přebytečné rozlišení
      add(P + m.from[1] + m.to, 0.95);
      add(m.from + m.to, 0.7);                          // dlouhá notace bez figury
      add(m.to, 0.3);                                   // jen cílové pole
    }
    return keys;
  }

  /* ---------- Podobnost řetězců s ohledem na záměny v rukopisu ---------- */

  const CONFUSE = {};
  ['17', '38', '56', '6b', '49', '9g', '0O', '0D', '0Q', '5S', '5B', '5N', '2Z', '8B', 'ad', 'ce', 'hb', 'hk', 'ft', 'gq', 'eo', 'co', 'uv', 'NK', 'RB', 'QO', 'ef', 'ae', 'oa', '23', '35', '14', '1l']
    .forEach(p => { CONFUSE[p[0] + p[1]] = 0.35; CONFUSE[p[1] + p[0]] = 0.35; });
  function subCost(a, b) {
    if (a === b) return 0;
    if (a.toLowerCase() === b.toLowerCase()) return 0.25;
    return CONFUSE[a + b] || 1;
  }
  // Damerau-Levenshteinova vzdálenost s levnějšími záměnami podobných znaků
  function distance(a, b) {
    const n = a.length, m = b.length;
    if (!n) return m;
    if (!m) return n;
    const d = [];
    for (let i = 0; i <= n; i++) { d.push(new Array(m + 1).fill(0)); d[i][0] = i; }
    for (let j = 0; j <= m; j++) d[0][j] = j;
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + subCost(a[i - 1], b[j - 1]));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 0.5);
        d[i][j] = v;
      }
    }
    return d[n][m];
  }
  function similarity(cand, keys) {
    let best = 0;
    for (const [k, w] of keys) {
      if (cand === k) { if (w > best) best = w; continue; }
      if (w < 0.9) continue; // přibližné porovnání jen s plnými tvary tahu
      const dist = distance(cand, k);
      const len = Math.max(cand.length, k.length);
      const s = w * 0.8 * Math.max(0, 1 - dist / Math.max(2, len * 0.75));
      if (s > best) best = s;
    }
    return best;
  }

  /* ---------- Hodnocení legálních tahů v pozici ---------- */

  // Kandidáti jednoho půltahu: [{ keys: [...], weight }]
  function plyCandidates(ply, lang) {
    const best = new Map(); // stejné klíče sloučit, ponechat nejvyšší váhu
    const push = (keys, w) => keys.forEach(k => { if (!best.has(k) || best.get(k) < w) best.set(k, w); });
    if (ply.san) push(normalizeWritten(ply.san, 'english'), 1);
    if (ply.written) push(normalizeWritten(ply.written, lang), 0.98);
    (ply.alternatives || []).forEach(a => {
      push(normalizeWritten(a, lang), 0.85);
      if (lang !== 'english') push(normalizeWritten(a, 'english'), 0.8);
    });
    return [...best.entries()];
  }
  function scoreMoves(moves, cands) {
    return moves.map(m => {
      const keys = moveKeys(m);
      let s = 0;
      for (const [k, w] of cands) {
        if (w <= s) continue;
        const v = w * similarity(k, keys);
        if (v > s) s = v;
      }
      return { m, s };
    }).sort((a, b) => b.s - a.s);
  }

  function getChess(options) {
    const C = (options && options.Chess) || (typeof Chess !== 'undefined' ? Chess : null); // eslint-disable-line no-undef
    if (!C) throw new Error('Chybí knihovna chess.js.');
    return C;
  }

  /**
   * Seřadí přečtené půltahy podle čísla tahu a barvy a doplní prázdná místa (přeskočené tahy).
   * Vstup: [{ move_number, color: 'w'|'b', written, san, alternatives, confidence }]
   */
  function orderPlies(plies, startFen) {
    const firstBlack = startFen && startFen.split(' ')[1] === 'b';
    const firstNum = startFen ? (parseInt(startFen.split(' ')[5], 10) || 1) : 1;
    const idx = p => (p.move_number - firstNum) * 2 + (p.color === 'b' ? 1 : 0) - (firstBlack ? 1 : 0);
    const valid = (plies || []).filter(p => p && Number.isFinite(+p.move_number) && (p.written || p.san));
    valid.forEach(p => { p.move_number = +p.move_number; p.color = p.color === 'b' ? 'b' : 'w'; });
    const last = valid.reduce((mx, p) => Math.max(mx, idx(p)), -1);
    const out = [];
    for (let i = 0; i <= last; i++) {
      const num = firstNum + Math.floor((i + (firstBlack ? 1 : 0)) / 2);
      const color = (i + (firstBlack ? 1 : 0)) % 2 ? 'b' : 'w';
      const p = valid.find(q => idx(q) === i);
      out.push(p ? Object.assign({}, p) : { move_number: num, color, written: '', san: '', alternatives: [], confidence: 'low', missing: true });
    }
    return out;
  }

  const MIN_SCORE = 0.5;
  // Zastavit přepis stojí za každý nepřiřazený půltah tolik jako shoda s jistotou STOP_SCORE.
  // Cesta se slabými shodami tak prohraje s cestou, která se poctivě zastaví a zeptá.
  const STOP_SCORE = 0.6;

  /**
   * Hlavní funkce: z přečtených půltahů složí nejpravděpodobnější platnou partii.
   * options: { Chess, startFen, lang, forced: { [indexPůltahu]: 'SAN' }, beam }
   * Vrací { plies: [...], stoppedAt, fen } — stoppedAt je index prvního půltahu, který nešel
   * přiřadit k žádnému legálnímu tahu (nebo -1, když prošla celá partie).
   */
  function reconcile(plies, options) {
    options = options || {};
    const ChessC = getChess(options);
    const startFen = options.startFen || START_FEN;
    const forced = options.forced || {};
    const lang = options.lang && LANGS[options.lang] ? options.lang : null;
    const width = options.beam || 10;
    const list = plies;
    const cands = list.map(p => plyCandidates(p, lang));

    let beams = [{ fen: startFen, logp: 0, path: [] }];
    let done = [];
    for (let i = 0; i < list.length; i++) {
      const next = [];
      for (const b of beams) {
        const g = new ChessC(b.fen);
        const moves = g.moves({ verbose: true });
        let scored;
        if (forced[i]) {
          const f = normalizeWritten(forced[i], 'english')[0];
          scored = moves.filter(m => m.san === forced[i] || moveKeys(m)[0][0] === f).map(m => ({ m, s: 1 }));
        }
        // Ručně vybraný tah, který po dřívější opravě není legální, se nahradí čtením z papíru
        if (!forced[i] || !scored.length) {
          scored = scoreMoves(moves, cands[i]).filter(x => x.s >= MIN_SCORE).slice(0, 4);
          // Jasná shoda: druhou možnost není třeba zkoumat (výrazně zrychlí čisté zápisy)
          if (scored.length > 1 && scored[0].s >= 0.95 && scored[1].s < 0.7) scored = scored.slice(0, 1);
        }
        if (!scored.length) { done.push(b); continue; }
        for (const x of scored) {
          const g2 = new ChessC(b.fen);
          g2.move(x.m.san);
          next.push({ fen: g2.fen(), logp: b.logp + Math.log(x.s), path: b.path.concat([{ san: x.m.san, s: x.s }]) });
        }
      }
      if (!next.length) break;
      // Stejné pozice sloučit, nechat nejlepší
      const seen = new Map();
      next.sort((a, b) => b.logp - a.logp).forEach(n => { const k = n.fen.split(' ').slice(0, 4).join(' '); if (!seen.has(k)) seen.set(k, n); });
      // Varianty výrazně horší než nejlepší (víc než 10krát méně pravděpodobné) dál nesledovat
      const top = next[0].logp;
      beams = [...seen.values()].filter(n => n.logp >= top - 2.3).slice(0, width);
    }
    done = done.concat(beams);
    const total = b => b.logp + (list.length - b.path.length) * Math.log(STOP_SCORE);
    done.sort((a, b) => (total(b) - total(a)) || (b.path.length - a.path.length));
    const best = done[0];

    // Výsledek po půltazích, s nabídkou dalších tahů pro opravu
    const g = new ChessC(startFen);
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const moves = g.moves({ verbose: true });
      const scored = scoreMoves(moves, cands[i]);
      const chosen = best.path[i];
      const item = {
        index: i, move_number: p.move_number, color: p.color,
        written: p.written || '', claude: p.san || '', confidence: p.confidence || '',
        missing: !!p.missing,
        san: chosen ? chosen.san : null,
        score: chosen ? chosen.s : 0,
        forced: !!(forced[i] && chosen && chosen.san === forced[i]),
        options: scored.slice(0, 8).filter(x => x.s > 0.05).map(x => ({ san: x.m.san, score: Math.round(x.s * 100) / 100 })),
        legal: moves.map(m => m.san)
      };
      if (chosen) {
        const second = scored.find(x => x.m.san !== chosen.san);
        const margin = chosen.s - (second ? second.s : 0);
        item.flagged = !item.forced && (chosen.s < 0.9 || margin < 0.08 || p.confidence === 'low' || p.confidence === 'medium' || !!p.missing ||
          (p.san && normalizeWritten(p.san, 'english')[0] !== moveKeys(moves.find(m => m.san === chosen.san))[0][0]));
        g.move(chosen.san);
      } else {
        item.flagged = true;
      }
      out.push(item);
      if (!chosen) {
        // Zbytek jen jako přečtený text, bez pozice
        for (let j = i + 1; j < list.length; j++) {
          const q = list[j];
          out.push({ index: j, move_number: q.move_number, color: q.color, written: q.written || '', claude: q.san || '',
            confidence: q.confidence || '', missing: !!q.missing, san: null, score: 0, flagged: true, forced: !!forced[j], options: [], legal: [] });
        }
        break;
      }
    }
    const stoppedAt = out.findIndex(x => !x.san);
    return { plies: out, stoppedAt, fen: g.fen(), gameOver: g.game_over() };
  }

  /* ---------- PGN ---------- */

  const RESULTS = ['1-0', '0-1', '1/2-1/2', '*'];
  function normResult(r) {
    const t = String(r || '').replace(/\s+/g, '').replace(/½/g, '1/2').replace(/:/g, '-');
    if (t === '1/2' || t === '0.5-0.5' || t === '1/2-1/2' || t === 'remis' || t === '=') return '1/2-1/2';
    return RESULTS.includes(t) ? t : '*';
  }
  function normDate(d) {
    const t = String(d || '').trim();
    if (!t) return '????.??.??';
    let m = t.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
    if (m) return m[1] + '.' + m[2].padStart(2, '0') + '.' + m[3].padStart(2, '0');
    m = t.match(/^(\d{1,2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{4})$/);
    if (m) return m[3] + '.' + m[2].padStart(2, '0') + '.' + m[1].padStart(2, '0');
    m = t.match(/^(\d{4})$/);
    if (m) return m[1] + '.??.??';
    return '????.??.??';
  }
  function pgnEsc(v) { return String(v == null || v === '' ? '?' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"'); }

  /** Sestaví PGN z hlavičky a seznamu tahů v SAN. */
  function buildPgn(headers, sans, options) {
    headers = headers || {};
    const h = {
      Event: headers.event, Site: headers.site, Date: normDate(headers.date), Round: headers.round,
      White: headers.white, Black: headers.black, Result: normResult(headers.result)
    };
    let txt = Object.keys(h).map(k => '[' + k + ' "' + pgnEsc(h[k]) + '"]').join('\n') + '\n';
    if (headers.white_elo) txt += '[WhiteElo "' + pgnEsc(headers.white_elo) + '"]\n';
    if (headers.black_elo) txt += '[BlackElo "' + pgnEsc(headers.black_elo) + '"]\n';
    const startFen = options && options.startFen;
    if (startFen && startFen !== START_FEN) txt += '[SetUp "1"]\n[FEN "' + startFen + '"]\n';
    const comments = (options && options.comments) || {};
    const firstBlack = startFen && startFen.split(' ')[1] === 'b';
    let num = startFen ? (parseInt(startFen.split(' ')[5], 10) || 1) : 1;
    const parts = [];
    sans.forEach((san, i) => {
      const black = (i + (firstBlack ? 1 : 0)) % 2 === 1;
      if (!black) parts.push(num + '.');
      else if (i === 0) parts.push(num + '...');
      parts.push(san);
      if (comments[i]) parts.push('{' + String(comments[i]).replace(/[{}]/g, '') + '}');
      if (black) num++;
    });
    parts.push(h.Result);
    let line = '', body = '';
    parts.forEach(p => { if (line && line.length + 1 + p.length > 79) { body += line + '\n'; line = p; } else line = line ? line + ' ' + p : p; });
    body += line;
    return txt + '\n' + body + '\n';
  }

  return { START_FEN, LANGS, normalizeWritten, moveKeys, distance, orderPlies, reconcile, buildPgn, normResult, normDate };
});
