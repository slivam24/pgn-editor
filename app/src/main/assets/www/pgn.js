/*
 * PGN editor: čtení a zápis PGN.
 * Samostatný soubor bez vazby na stránku, aby šel zkoušet i mimo aplikaci (složka tests/).
 * V prohlížeči je dostupný jako window.PGN, v Node přes require().
 *
 * Partie je strom tahů: uzel { s: tah, c: komentář, n: [hodnocení], ch: [pokračování] }.
 * ch[0] je hlavní pokračování, další prvky jsou varianty.
 *
 * Partie z otevřeného souboru se nečte celá hned. Dokud ji nikdo neotevře, drží se jen
 * hlavička a původní text tahů (g.raw). Tahy se zpracují až při otevření partie (materialize)
 * nebo při ukládání souboru (gamePgn).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./chess.js').Chess);
  else root.PGN = factory(root.Chess);
})(typeof self !== 'undefined' ? self : this, function (Chess) {
  'use strict';

  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const TAGS = ['Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result'];
  const DEFAULTS = { Event: '?', Site: '?', Date: '????.??.??', Round: '?', White: '?', Black: '?', Result: '*' };

  function newNode(san) { const n = { c: '', n: [], ch: [] }; if (san) n.s = san; return n; }
  function freshState() {
    return { headers: Object.assign({}, DEFAULTS), extra: {}, startFen: START, root: newNode(), path: [], ply: 0, flipped: false };
  }
  function isLazy(g) { return typeof g.raw === 'string'; }

  /* ---------- Zápis do PGN ---------- */
  // Do souboru jde jen čisté ASCII: bez diakritiky a bez znaků, které
  // ChessBase a jiné programy v hlavičce špatně čtou (uvozovky, zpětné lomítko, hranaté závorky).
  // V komentářích hranaté závorky zůstávají, jsou v nich značky [%clk], [%eval], [%cal] a [%csl].
  const SPECIAL = { 'ß': 'ss', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ø': 'o', 'Ø': 'O', 'æ': 'ae', 'Æ': 'AE', 'œ': 'oe', 'Œ': 'OE', 'ı': 'i', 'þ': 'th', 'ð': 'd',
    '–': '-', '—': '-', '…': '...', ' ': ' ' };
  function toAscii(v, keepBrackets) {
    let s = String(v)
      .replace(/[ßłŁđĐøØæÆœŒıþð–—… ]/g, ch => SPECIAL[ch])
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/["“”„«»]/g, "'")
      .replace(/[‘’‚]/g, "'")
      .replace(/\\/g, '/');
    if (!keepBrackets) s = s.replace(/\[/g, '(').replace(/\]/g, ')');
    return s
      .replace(/[\t\r\n]+/g, ' ')
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/ {2,}/g, ' ')
      .trim();
  }
  function esc(v) { return toAscii(v) || '?'; }

  function buildPgn(g) {
    const fp = g.startFen.split(' ');
    const sTurn = fp[1] || 'w', sNum = parseInt(fp[5], 10) || 1;
    const num = i => sNum + Math.floor((i + (sTurn === 'b' ? 1 : 0)) / 2);
    const white = i => sTurn === 'w' ? i % 2 === 0 : i % 2 === 1;
    const lines = TAGS.map(t => '[' + t + ' "' + esc(g.headers[t] || DEFAULTS[t]) + '"]');
    Object.keys(g.extra).forEach(k => lines.push('[' + k + ' "' + esc(g.extra[k]) + '"]'));
    const tokens = [];
    const pushComment = node => {
      const c = node.c ? toAscii(node.c, true).replace(/[{}]/g, m => m === '{' ? '(' : ')') : '';
      if (!c) return false;
      const words = c.split(' ');
      words[0] = '{' + words[0];
      words[words.length - 1] += '}';
      words.forEach(w => tokens.push(w));
      return true;
    };
    const pushMove = (node, i, needNum) => {
      if (white(i)) tokens.push(num(i) + '.');
      else if (needNum) tokens.push(num(i) + '...');
      tokens.push(node.s);
      (node.n || []).forEach(x => tokens.push('$' + x));
      return pushComment(node);
    };
    const walk = (node, depth, needNum) => {
      while (node.ch.length) {
        const main = node.ch[0];
        needNum = pushMove(main, depth, needNum);
        for (let v = 1; v < node.ch.length; v++) {
          tokens.push('(');
          const nn = pushMove(node.ch[v], depth, true);
          walk(node.ch[v], depth + 1, nn);
          tokens.push(')');
          needNum = true;
        }
        node = main; depth++;
      }
    };
    pushComment(g.root);
    walk(g.root, 0, true);
    tokens.push(g.headers.Result);
    const out = [];
    let cur = '', prev = '';
    tokens.forEach(tok => {
      const glue = prev === '(' || tok === ')';
      if (cur && !glue && (cur.length + 1 + tok.length) > 79) { out.push(cur); cur = tok; }
      else cur = cur ? cur + (glue ? '' : ' ') + tok : tok;
      prev = tok;
    });
    if (cur) out.push(cur);
    return lines.join('\n') + '\n\n' + out.join('\n') + '\n';
  }

  /* ---------- FEN ---------- */
  // Doplní chybějící části FEN (stačí rozestavení figur) a ověří pozici
  function normalizeFen(raw) {
    const parts = raw.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
    if (!parts.length) return { error: 'Vlož FEN.' };
    const def = ['', 'w', '-', '-', '0', '1'];
    for (let i = parts.length; i < 6; i++) parts.push(def[i]);
    if (parts.length > 6) return { error: 'FEN má víc částí, než by měl.' };
    if (parts[1] !== 'w' && parts[1] !== 'b') return { error: 'Druhá část FEN musí být w (táhne bílý) nebo b (táhne černý).' };
    let fen = parts.join(' ');
    const place = parts[0];
    const wk = (place.match(/K/g) || []).length, bk = (place.match(/k/g) || []).length;
    if (wk !== 1 || bk !== 1) return { error: 'Na šachovnici musí být právě jeden bílý a jeden černý král.' };
    const rows = place.split('/');
    if (rows.length === 8 && /[pP]/.test(rows[0] + rows[7])) return { error: 'Pěšec nemůže stát na první ani na poslední řadě.' };
    if (rows.length === 8) {
      const at = sq => { const r = rows[8 - +sq[1]].replace(/\d/g, d => '.'.repeat(+d)); return r['abcdefgh'.indexOf(sq[0])] || '.'; };
      const need = { K: ['e1', 'K', 'h1', 'R'], Q: ['e1', 'K', 'a1', 'R'], k: ['e8', 'k', 'h8', 'r'], q: ['e8', 'k', 'a8', 'r'] };
      const c = parts[2] === '-' ? '' : parts[2].split('').filter(x => need[x] && at(need[x][0]) === need[x][1] && at(need[x][2]) === need[x][3]).join('');
      parts[2] = c || '-';
    }
    fen = parts.join(' ');
    const v = new Chess().validate_fen(fen);
    if (!v.valid) return { error: 'FEN není platný. Zkontroluj rozestavení figur: 8 řad oddělených lomítkem, v každé 8 polí.' };
    const g = new Chess(fen);
    const opp = g.turn() === 'w' ? 'b' : 'w';
    const test = new Chess(fen.replace(/ [wb] /, ' ' + opp + ' ').replace(/ \S+ (\d+) (\d+)$/, ' - $1 $2'));
    if (test.in_check()) return { error: 'V této pozici je v šachu hráč, který právě netáhne. Taková pozice nemůže nastat.' };
    return { fen };
  }

  /* ---------- Rychlé čtení tahu ---------- */
  // chess.js hledá tah v zápisu tak, že vygeneruje všechny tahy a každý převede na text, což je pomalé.
  // Běžný tah (Nf3, exd5, Rad1, e8=Q, O-O) proto nejdřív zkusíme najít přímo: podle figury a cílového
  // pole vybereme výchozí pole a tah necháme chess.js jen ověřit. Když si nejsme jistí, použije se
  // původní pomalá cesta, takže výsledek je vždy stejný.
  const FILES = 'abcdefgh';
  const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]], ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const sqName = (f, r) => FILES[f] + (r + 1);
  function reaches(chess, type, f, r, tf, tr) {
    const df = tf - f, dr = tr - r;
    if (type === 'n') return KNIGHT.some(d => d[0] === df && d[1] === dr);
    if (type === 'k') return Math.max(Math.abs(df), Math.abs(dr)) === 1;
    const dirs = type === 'b' ? DIAG : type === 'r' ? ORTHO : DIAG.concat(ORTHO);
    for (const d of dirs) {
      let x = f + d[0], y = r + d[1];
      while (x >= 0 && x < 8 && y >= 0 && y < 8) {
        if (x === tf && y === tr) return true;
        if (chess.get(sqName(x, y))) break;
        x += d[0]; y += d[1];
      }
    }
    return false;
  }
  const SAN_RE = /^([NBRQK])?([a-h])?([1-8])?(x)?([a-h])([1-8])(?:=?([NBRQ]))?[+#]?$/;
  function fastMove(chess, san) {
    const turn = chess.turn();
    const cs = /^O-O(-O)?[+#]?$/.exec(san);
    if (cs) {
      const rank = turn === 'w' ? '1' : '8';
      const k = chess.get('e' + rank);
      if (!k || k.type !== 'k' || k.color !== turn) return null; // na e1 může stát i věž, pro kterou by to byl běžný tah
      return chess.move({ from: 'e' + rank, to: (cs[1] ? 'c' : 'g') + rank });
    }
    const m = SAN_RE.exec(san);
    if (!m) return null;
    const tf = FILES.indexOf(m[5]), tr = +m[6] - 1, to = m[5] + m[6];
    const promotion = m[7] ? m[7].toLowerCase() : undefined;
    if (!m[1]) { // pěšec
      if (m[3]) return null;
      const dir = turn === 'w' ? 1 : -1;
      const last = tr === (turn === 'w' ? 7 : 0);
      if (last !== !!promotion) return null;
      let from = null;
      const own = sq => { const p = chess.get(sq); return p && p.type === 'p' && p.color === turn; };
      if (m[2] && m[2] !== m[5]) { // braní
        const ff = FILES.indexOf(m[2]);
        if (Math.abs(ff - tf) !== 1) return null;
        from = sqName(ff, tr - dir);
      } else if (!m[4]) {
        const r1 = tr - dir, r2 = tr - 2 * dir;
        if (r1 < 0 || r1 > 7) return null;
        if (own(sqName(tf, r1))) from = sqName(tf, r1);
        else if (tr === (turn === 'w' ? 3 : 4) && !chess.get(sqName(tf, r1)) && own(sqName(tf, r2))) from = sqName(tf, r2);
      }
      if (!from || !own(from)) return null;
      return chess.move(promotion ? { from, to, promotion } : { from, to });
    }
    if (promotion) return null;
    const type = m[1].toLowerCase();
    let found = null;
    for (let f = 0; f < 8; f++) {
      if (m[2] && FILES[f] !== m[2]) continue;
      for (let r = 0; r < 8; r++) {
        if (m[3] && r !== +m[3] - 1) continue;
        const p = chess.get(sqName(f, r));
        if (!p || p.type !== type || p.color !== turn) continue;
        if (!reaches(chess, type, f, r, tf, tr)) continue;
        if (found) return null; // víc možností (jedna může být ve vazbě), rozhodne pomalá cesta
        found = sqName(f, r);
      }
    }
    if (!found) return null;
    return chess.move({ from: found, to });
  }
  function sanMove(chess, san) {
    return fastMove(chess, san) || chess.move(san, { sloppy: true });
  }

  /* ---------- Čtení PGN ---------- */
  const SUFFIX_NAG = { '!': 1, '?': 2, '!!': 3, '??': 4, '!?': 5, '?!': 6 };
  // Hodnocení pozice zapsané znaky místo čísla ($14 apod.), jak ho píšou starší programy
  const GLYPH = { '=': 10, '+=': 14, '=+': 15, '+/=': 14, '=/+': 15, '+/-': 16, '-/+': 17, '+-': 18, '-+': 19,
    '\u221E': 13, '\u2A72': 14, '\u2A71': 15, '\u00B1': 16, '\u2213': 17, '+\u2212': 18, '\u2212+': 19 };
  const TAG_LINE = /^\[\s*\w+\s+"/;
  function splitGames(text) {
    const games = [];
    let cur = null, inMoves = false;
    text.split('\n').forEach(line => {
      const t = line.trim();
      const isTag = TAG_LINE.test(t);
      if (isTag && (!cur || inMoves)) { cur = { tags: [], moves: [] }; games.push(cur); inMoves = false; }
      if (!cur) { cur = { tags: [], moves: [] }; games.push(cur); }
      if (isTag && !inMoves) cur.tags.push(t);
      else if (t) { cur.moves.push(line); inMoves = true; }
      else if (inMoves) cur.moves.push('');
    });
    return games.filter(g => g.tags.length || g.moves.join('').trim());
  }
  // Každý prvek nese pozici v textu (pos), aby šel při chybě zachovat nepřečtený zbytek
  function tokenize(src) {
    const out = [];
    let i = 0, numPos = -1;
    while (i < src.length) {
      const ch = src[i];
      if (ch === '{') {
        const e = src.indexOf('}', i), end = e === -1 ? src.length : e;
        out.push({ type: 'comment', v: src.slice(i + 1, end).replace(/\s+/g, ' ').trim(), pos: i });
        i = end + 1; numPos = -1; continue;
      }
      if (ch === ';') {
        const e = src.indexOf('\n', i), end = e === -1 ? src.length : e;
        out.push({ type: 'comment', v: src.slice(i + 1, end).trim(), pos: i });
        i = end; numPos = -1; continue;
      }
      if (ch === '%' && (i === 0 || src[i - 1] === '\n')) { const e = src.indexOf('\n', i); i = e === -1 ? src.length : e; continue; }
      if (ch === '(' || ch === ')') { out.push({ type: ch, pos: i }); i++; numPos = -1; continue; }
      if (/\s/.test(ch)) { i++; continue; }
      let j = i;
      while (j < src.length && !/[\s{}();]/.test(src[j])) j++;
      let w = src.slice(i, j);
      const pos = i;
      i = j;
      if (/^\$\d+$/.test(w)) { out.push({ type: 'nag', v: +w.slice(1), pos }); continue; }
      if (/^(1-0|0-1|1\/2-1\/2|½-½|\*)$/.test(w)) { out.push({ type: 'result', v: w === '½-½' ? '1/2-1/2' : w, pos }); numPos = -1; continue; }
      w = w.replace(/^\d+\.+/, '');
      if (!w || /^\d+$/.test(w)) { numPos = pos; continue; } // číslo tahu
      if (/^[!?]+$/.test(w)) { if (SUFFIX_NAG[w]) out.push({ type: 'nag', v: SUFFIX_NAG[w], pos }); continue; }
      if (GLYPH[w]) { out.push({ type: 'nag', v: GLYPH[w], pos }); continue; }
      out.push({ type: 'move', v: w, pos: numPos !== -1 ? numPos : pos });
      numPos = -1;
    }
    return out;
  }

  // Hlavička partie. Tahy zůstanou jako text v g.raw, dokud partii nikdo neotevře.
  function stubGame(raw) {
    const g = { headers: Object.assign({}, DEFAULTS), extra: {}, startFen: START, raw: raw.moves.join('\n'), path: [], ply: 1e9, flipped: false };
    const tagRe = /\[\s*(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]/g;
    const tagStr = raw.tags.join('\n');
    let m;
    while ((m = tagRe.exec(tagStr))) {
      const k = m[1], v = m[2].replace(/\\(.)/g, '$1');
      if (TAGS.indexOf(k) !== -1) g.headers[k] = v || DEFAULTS[k]; else g.extra[k] = v;
    }
    return g;
  }

  const squeeze = s => s.replace(/\s+/g, ' ').trim();
  const addComment = (node, text) => { node.c = node.c ? node.c + ' ' + text : text; };

  // Přečte tahy partie do stromu. Vrací { root, startFen, extra, result, moves, error }.
  // Čtení nikdy nic nezahodí: co nejde přečíst (neplatný tah, neplatná výchozí pozice),
  // zůstane jako text v komentáři a error popisuje, co se stalo.
  function parseMoves(src, extra) {
    extra = Object.assign({}, extra);
    const root = newNode();
    const res = { root, startFen: START, extra, result: null, moves: 0, error: null };
    if (extra.FEN) {
      const r = normalizeFen(extra.FEN);
      if (r.error) {
        res.error = { kind: 'fen' };
        const rest = squeeze(src);
        root.c = 'Neplatná výchozí pozice (FEN ' + extra.FEN + ').' + (rest ? ' Zápis partie: ' + rest : '');
        delete extra.FEN; delete extra.SetUp;
        const rm = /(?:^|\s)(1-0|0-1|1\/2-1\/2)\s*$/.exec(rest);
        if (rm) res.result = rm[1];
        return res;
      }
      res.startFen = r.fen;
    }
    const fenOf = new Map([[root, res.startFen]]);
    const parentOf = new Map();
    let chess = new Chess(res.startFen);
    let parent = root, last = null, pre = '';
    let skip = null;   // chybná varianta: { depth, from, anchor, san }
    let broken = false; // chyba v hlavní linii, dál se už jen hledá výsledek
    let depth = 0;
    const stack = [];
    const close = () => {
      if (!stack.length) return;
      ({ parent, last } = stack.pop());
      chess = new Chess(fenOf.get(parent));
    };
    const endSkip = rest => {
      if (skip.anchor && rest) addComment(skip.anchor, (skip.san ? 'Nelze přečíst tah ' + skip.san + '. Zbytek varianty: ' : 'Nepřečtená varianta: ') + rest);
      skip = null;
    };
    const fp = res.startFen.split(' ');
    const label = (i, san) => { // číslo tahu před tah, např. 25. Nxh7 nebo 25... Kg7
      const black = (fp[1] === 'b') !== (i % 2 === 1);
      return ((parseInt(fp[5], 10) || 1) + Math.floor((i + (fp[1] === 'b' ? 1 : 0)) / 2)) + (black ? '... ' : '. ') + san;
    };
    for (const t of tokenize(src)) {
      if (broken) {
        if (t.type === '(') depth++;
        else if (t.type === ')') depth = Math.max(0, depth - 1);
        else if (t.type === 'result' && depth === 0 && t.v !== '*') res.result = t.v;
        continue;
      }
      if (skip) { // zbytek chybné varianty se uloží do komentáře
        if (t.type === '(') skip.depth++;
        else if (t.type === ')' && --skip.depth === 0) {
          const rest = squeeze(src.slice(skip.from, t.pos));
          endSkip(rest);
          close();
        }
        continue;
      }
      if (t.type === 'comment') {
        if (!t.v) continue;
        if (last) addComment(last, t.v);
        else if (parent === root && !stack.length) addComment(root, t.v);
        else pre = pre ? pre + ' ' + t.v : t.v;
      } else if (t.type === 'nag') {
        if (last && last.n.indexOf(t.v) === -1) last.n.push(t.v);
      } else if (t.type === 'move') {
        let san = t.v, suffix = '';
        const sm = san.match(/^(.*?)([!?]{1,2})$/);
        if (sm) { san = sm[1]; suffix = sm[2]; }
        san = san.replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O').replace(/e\.p\.$/, '');
        const mv = sanMove(chess, san);
        if (!mv) {
          if (stack.length) {
            // varianta: přečtené tahy zůstanou, zbytek jde do komentáře u posledního z nich,
            // nebo u tahu, ke kterému varianta patří
            skip = { depth: 1, from: t.pos, anchor: last || stack[stack.length - 1].last, san: t.v };
            if (res.error === null) res.error = { kind: 'variant', san: t.v };
            continue;
          }
          const rest = squeeze(src.slice(t.pos));
          addComment(last || root, 'Nelze přečíst tah ' + t.v + '. Zbytek zápisu: ' + rest);
          res.error = { kind: 'move', san: t.v, at: res.moves, label: label(res.moves, t.v) };
          broken = true;
          continue;
        }
        const node = newNode(mv.san);
        if (pre) { node.c = pre; pre = ''; }
        if (SUFFIX_NAG[suffix]) node.n.push(SUFFIX_NAG[suffix]);
        parent.ch.push(node);
        parentOf.set(node, parent);
        fenOf.set(node, chess.fen());
        last = node; parent = node;
        if (!stack.length) res.moves++;
      } else if (t.type === '(') {
        if (!last) { // varianta bez tahu, ke kterému by patřila
          skip = { depth: 1, from: t.pos + 1, anchor: stack.length ? null : root, san: '' };
          if (res.error === null) res.error = { kind: 'variant', san: '' };
          stack.push({ parent, last });
          continue;
        }
        stack.push({ parent, last });
        parent = parentOf.get(last); last = null; pre = '';
        chess = new Chess(fenOf.get(parent));
      } else if (t.type === ')') {
        close();
      } else if (t.type === 'result') {
        if (!stack.length && t.v !== '*') res.result = t.v;
      }
    }
    if (skip) endSkip(squeeze(src.slice(skip.from))); // varianta bez ukončovací závorky
    return res;
  }

  // Zpracuje tahy neotevřené partie přímo v objektu g. Vrací popis chyby (nebo null).
  function materialize(g) {
    if (!isLazy(g)) return null;
    const r = parseMoves(g.raw, g.extra);
    g.root = r.root; g.startFen = r.startFen; g.extra = r.extra;
    if (g.headers.Result === '*' && r.result) g.headers.Result = r.result;
    delete g.raw;
    g.path = []; g.ply = 1e9; // otevřít na konci hlavní linie
    return r.error;
  }
  // Text partie pro uložení do souboru. Neotevřenou partii zpracuje bokem a nechá ji, jak je.
  function gamePgn(g) {
    if (!isLazy(g)) return { pgn: buildPgn(g), error: null };
    const r = parseMoves(g.raw, g.extra);
    const headers = Object.assign({}, g.headers);
    if (headers.Result === '*' && r.result) headers.Result = r.result;
    return { pgn: buildPgn({ headers, extra: r.extra, startFen: r.startFen, root: r.root }), error: r.error };
  }
  // Počet půltahů hlavní linie neotevřené partie (jen pro seznam partií, bez kontroly pravidel)
  function countMoves(src) {
    let n = 0, depth = 0;
    for (const t of tokenize(src)) {
      if (t.type === '(') depth++;
      else if (t.type === ')') depth = Math.max(0, depth - 1);
      else if (t.type === 'move' && depth === 0) n++;
    }
    return n;
  }
  function mainLength(g) {
    if (isLazy(g)) return countMoves(g.raw);
    let n = 0, x = g.root;
    while (x.ch.length) { x = x.ch[0]; n++; }
    return n;
  }

  /* ---------- Čas na hodinách ---------- */
  // Čas, který hráči po tahu zbývá, se ukládá do komentáře tahu jako značka [%clk 1:25:00].
  // Stejně ho zapisuje Lichess i ChessBase.
  const CLK_RE = /\[%clk\s+(\d+):(\d\d?)(?::(\d\d?)(?:\.\d+)?)?\]/;
  // Čas napsaný ručně: 1:25 nebo 1.25 jsou hodiny a minuty, 1:25:30 i se sekundami, samotné číslo jsou minuty.
  // Vrací sekundy, nebo null, když zápisu nejde rozumět.
  function parseClock(text) {
    const t = String(text || '').trim().replace(/[.,;\s]+/g, ':');
    if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return null;
    const p = t.split(':').map(Number);
    if (p.length === 1) return p[0] <= 5999 ? p[0] * 60 : null;
    if (p[1] > 59 || (p.length === 3 && p[2] > 59) || p[0] > 99) return null;
    return p[0] * 3600 + p[1] * 60 + (p[2] || 0);
  }
  function clockTag(sec) { // značka do souboru, vždy hodiny:minuty:sekundy
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60;
    return '[%clk ' + h + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0') + ']';
  }
  function fmtClock(sec) { // zobrazení: 1:25, sekundy jen když nejsou nulové
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), x = sec % 60;
    return h + ':' + String(m).padStart(2, '0') + (x ? ':' + String(x).padStart(2, '0') : '');
  }
  function getClock(comment) {
    const m = CLK_RE.exec(comment || '');
    return m ? +m[1] * 3600 + +m[2] * 60 + (+m[3] || 0) : null;
  }
  // Vrátí komentář s nastaveným časem (sec = null čas odebere). Ostatní text komentáře zůstane.
  function setClock(comment, sec) {
    const rest = String(comment || '').replace(new RegExp(CLK_RE.source, 'g'), ' ').replace(/\s+/g, ' ').trim();
    if (sec === null || sec === undefined) return rest;
    return clockTag(sec) + (rest ? ' ' + rest : '');
  }

  // Věta do upozornění, když partii nešlo přečíst celou
  function errorText(e) {
    if (!e) return '';
    if (e.kind === 'fen') return 'Partie má neplatnou výchozí pozici (FEN). Zápis tahů zůstal jako text v komentáři na začátku partie.';
    if (e.kind === 'variant') return 'V partii je varianta, kterou nejde přečíst celou' + (e.san ? ' (tah ' + e.san + ' v ní není možný)' : '') + '. Přečtená část zůstala, zbytek je jako text v komentáři.';
    return 'Tah ' + e.label + ' není v pozici možný. ' +
      (e.at ? 'Tahy před ním se načetly, zbytek zápisu je jako text v komentáři u posledního načteného tahu.' : 'Zápis je jako text v komentáři na začátku partie.');
  }

  // Přečte soubor: všechny partie jako neotevřené, první se zpracuje hned (a ověří se tím, že jde o PGN)
  function parseFile(text) {
    text = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    if (!text.trim()) return { error: 'Text je prázdný.' };
    const raws = splitGames(text);
    if (!raws.length) return { error: 'Tento text se nepodařilo přečíst jako PGN.' };
    const games = raws.map(stubGame);
    const first = games[0];
    const firstError = materialize(first);
    if (!raws.some(r => r.tags.length) && !first.root.ch.length) {
      return { error: 'Tento text se nepodařilo přečíst jako PGN.' + (firstError && firstError.san ? ' Tah ' + firstError.san + ' není v pozici platný.' : '') };
    }
    return { games, firstError };
  }

  return { START, TAGS, DEFAULTS, newNode, freshState, isLazy, toAscii, buildPgn, normalizeFen, sanMove, fastMove,
    splitGames, tokenize, stubGame, parseMoves, materialize, gamePgn, countMoves, mainLength, errorText, parseFile,
    parseClock, fmtClock, getClock, setClock };
});
