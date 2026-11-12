/*
 * Photo-to-PGN: kontrola a oprava přečteného partiáře.
 *
 * Zobrazí hlavičku a tahy, nejisté tahy zvýrazní a po klepnutí na tah nabídne
 * pozici před tahem, co je na papíře, a legální tahy k výběru. Každá oprava
 * znovu přepočítá zbytek partie (scoresheet-core.js).
 *
 * Používá barvy z CSS proměnných hostitelské stránky (--bg, --surface, --fg, --muted,
 * --line, --accent, --accent-fg, --accent-soft, --warn, --font-mono).
 *
 * Licence: GNU GPL 3 nebo novější.
 */
(function (root) {
  'use strict';

  const CSS = `
.ss { display: grid; gap: 12px; }
.ss-sum { margin: 0; font-size: 14px; }
.ss-sum b { font-weight: 600; }
.ss-sum.bad { color: var(--warn); }
.ss-notes { margin: 0; font-size: 13px; color: var(--muted); }
.ss-head { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ss-head label { display: grid; gap: 3px; font-size: 13px; color: var(--muted); }
.ss-head input, .ss-head select { font: inherit; color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 7px 9px; width: 100%; min-width: 0; }
.ss-moves { display: grid; grid-template-columns: auto 1fr 1fr; gap: 3px 4px; align-items: stretch; font-family: var(--font-mono); font-size: 14px; }
.ss-num { color: var(--muted); padding: 6px 4px 0 0; text-align: right; font-size: 13px; }
.ss-mv { font: inherit; text-align: left; color: var(--fg); background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 5px 8px; min-height: 34px; cursor: pointer; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.ss-mv small { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ss-mv.flag { border-color: var(--warn); background: color-mix(in srgb, var(--warn) 10%, var(--surface)); }
.ss-mv.ok { border-color: var(--accent); }
.ss-mv.stop { border-style: dashed; border-color: var(--warn); color: var(--muted); font-style: italic; }
.ss-mv.cur { outline: 2px solid var(--accent); outline-offset: 1px; }
.ss-mv:disabled { opacity: .55; cursor: default; }
.ss-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--muted); margin: 0; }
.ss-legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; border: 1px solid var(--line); vertical-align: -2px; margin-right: 4px; background: var(--surface); }
.ss-legend i.flag { border-color: var(--warn); background: color-mix(in srgb, var(--warn) 15%, var(--surface)); }
.ss-legend i.ok { border-color: var(--accent); }
.ss-detail { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); padding: 12px; display: grid; gap: 10px; }
.ss-detail h4 { margin: 0; font-size: 15px; font-weight: 600; }
.ss-detail p { margin: 0; font-size: 14px; }
.ss-detail .ss-written { font-family: var(--font-mono); font-weight: 600; }
.ss-row { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
.ss-board { display: grid; grid-template-columns: repeat(8, 1fr); width: 184px; aspect-ratio: 1; border: 1px solid var(--line); flex: none; }
.ss-board div { display: flex; align-items: center; justify-content: center; font-size: 19px; line-height: 1; color: #000; }
.ss-board .l { background: #eeeed2; } .ss-board .d { background: #b5c79a; }
.ss-board .from { box-shadow: inset 0 0 0 3px rgba(47,107,79,.55); } .ss-board .to { box-shadow: inset 0 0 0 3px rgba(47,107,79,.95); }
.ss-board .w { color: #fff; -webkit-text-stroke: 1.2px #000; paint-order: stroke fill; }
.ss-opts { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; min-width: 160px; align-content: flex-start; }
.ss-opt { font: inherit; font-family: var(--font-mono); font-size: 14px; color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 6px 10px; cursor: pointer; }
.ss-opt small { color: var(--muted); font-family: var(--font-ui, inherit); font-size: 11px; margin-left: 4px; }
.ss-opt[aria-pressed="true"] { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
.ss-opt[aria-pressed="true"] small { color: inherit; }
.ss-detail select { font: inherit; font-family: var(--font-mono); color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; }
.ss-acts { display: flex; flex-wrap: wrap; gap: 8px; }
.ss-btn { font: inherit; font-weight: 500; font-size: 14px; color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 7px 12px; cursor: pointer; min-height: 38px; }
.ss-btn.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
.ss-btn:disabled { opacity: .45; cursor: default; }
@media (max-width: 380px) { .ss-head { grid-template-columns: 1fr; } .ss-board { width: 160px; } }
`;

  const CZ = { N: 'J', B: 'S', R: 'V', Q: 'D', K: 'K' };
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const RESULTS = [['*', 'neznámý (*)'], ['1-0', '1-0'], ['0-1', '0-1'], ['1/2-1/2', '½-½']];
  const HEAD_FIELDS = [['white', 'Bílý'], ['black', 'Černý'], ['event', 'Turnaj'], ['site', 'Místo'], ['date', 'Datum'], ['round', 'Kolo']];

  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(k => {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (children || []).forEach(c => { if (c != null) e.append(c); });
    return e;
  }

  let cssAdded = false;
  function addCss() {
    if (cssAdded) return;
    cssAdded = true;
    document.head.append(el('style', { text: CSS }));
  }

  /**
   * Vytvoří kontrolu partiáře v daném prvku.
   * options: { Chess, czech (zobrazit českou notaci), onChange() }
   */
  function create(container, options) {
    addCss();
    options = options || {};
    const Core = root.Scoresheet;
    const ChessC = options.Chess || root.Chess;
    let czech = !!options.czech;
    let data = null;      // odpověď od Clauda
    let plies = [];       // seřazené půltahy
    let forced = {};      // ručně vybrané tahy { index: SAN }
    let res = null;       // výsledek Scoresheet.reconcile
    let cur = -1;         // vybraný půltah
    let headers = {};

    const show = san => (czech && san) ? san.replace(/[NBRQK]/g, c => CZ[c]) : (san || '');

    function recompute() {
      res = Core.reconcile(plies, { Chess: ChessC, lang: data.notation && data.notation !== 'unknown' && data.notation !== 'figurine' ? data.notation : null, forced });
      // Ruční volby, které po dřívější opravě přestaly být legální, zapomenout
      Object.keys(forced).forEach(k => { if (!res.plies[k] || !res.plies[k].forced) delete forced[k]; });
    }
    function changed() { if (options.onChange) options.onChange(); }

    function firstProblem(from) {
      if (!res) return -1;
      const n = res.plies.length;
      for (let k = 0; k < n; k++) {
        const i = (from + 1 + k) % n;
        const p = res.plies[i];
        if (!p.san || (p.flagged && !forced[i])) return i;
      }
      return -1;
    }

    function load(readData) {
      data = readData;
      headers = Object.assign({ white: '', black: '', event: '', site: '', date: '', round: '', result: '' }, data.headers || {});
      headers.result = Core.normResult(headers.result);
      headers.date = Core.normDate(headers.date) === '????.??.??' ? (headers.date || '') : Core.normDate(headers.date);
      plies = Core.orderPlies(data.plies || []);
      forced = {};
      recompute();
      cur = res.stoppedAt >= 0 ? res.stoppedAt : firstProblem(-1);
      render();
    }

    function setForced(i, san) {
      if (san) forced[i] = san; else delete forced[i];
      // ruční volby za opraveným tahem, které už nejsou legální, se zahodí v reconcile (spadne na čtení)
      recompute();
      render();
      changed();
    }

    function stats() {
      const done = res.plies.filter(p => p.san).length;
      const flagged = res.plies.filter((p, i) => p.san && p.flagged && !forced[i]).length;
      return { done, total: res.plies.length, flagged, stopped: res.stoppedAt };
    }

    function moveLabel(p) {
      return p.move_number + (p.color === 'w' ? '. bílý' : '. černý');
    }

    function renderBoard(fen, move) {
      const b = el('div', { class: 'ss-board', 'aria-hidden': 'true' });
      const rows = fen.split(' ')[0].split('/');
      rows.forEach((row, r) => {
        let f = 0;
        for (const ch of row) {
          if (/\d/.test(ch)) { for (let k = 0; k < +ch; k++) { b.append(sq(r, f, '')); f++; } }
          else { b.append(sq(r, f, ch)); f++; }
        }
      });
      function sq(r, f, p) {
        const name = 'abcdefgh'[f] + (8 - r);
        let cls = (r + f) % 2 ? 'd' : 'l';
        if (move && move.from === name) cls += ' from';
        if (move && move.to === name) cls += ' to';
        const d = el('div', { class: cls });
        if (p) { d.textContent = GLYPH[p.toLowerCase()]; if (p === p.toUpperCase()) d.classList.add('w'); }
        return d;
      }
      return b;
    }

    function positionBefore(i) {
      const g = new ChessC();
      for (let k = 0; k < i; k++) { if (!res.plies[k].san || !g.move(res.plies[k].san)) return null; }
      return g;
    }

    function renderDetail() {
      if (cur < 0 || !res.plies[cur]) return null;
      const p = res.plies[cur];
      const g = positionBefore(cur);
      const box = el('div', { class: 'ss-detail', 'aria-live': 'polite' });
      box.append(el('h4', { text: 'Tah ' + moveLabel(p) }));
      const w = p.written ? el('span', { class: 'ss-written', text: '„' + p.written + '“' }) : el('span', { text: 'nic (prázdné políčko)' });
      const line = el('p', null, ['Na papíře: ', w]);
      if (p.claude && Core.normalizeWritten(p.claude, 'english')[0] !== Core.normalizeWritten(p.san || '', 'english')[0]) line.append(', Claude četl ' + show(p.claude));
      box.append(line);
      if (!g) {
        box.append(el('p', { text: 'Nejdřív oprav dřívější tah, u kterého se přepis zastavil.' }));
        return box;
      }
      const legal = g.moves({ verbose: true });
      const chosen = p.san ? legal.find(m => m.san === p.san) : null;
      if (!p.san) box.append(el('p', { text: 'Tento zápis neodpovídá žádnému tahu, který je v pozici možný. Vyber správný tah, přepis pak pokračuje dál.' }));
      else if (forced[cur]) box.append(el('p', { text: 'Tah jsi potvrdil(a) ručně.' }));
      else if (p.flagged) box.append(el('p', { text: 'Čtení není jisté. Zkontroluj tah podle fotky.' }));

      const opts = el('div', { class: 'ss-opts' });
      const shown = new Set();
      (p.options || []).slice(0, 6).forEach(o => {
        shown.add(o.san);
        opts.append(el('button', { class: 'ss-opt', type: 'button', 'aria-pressed': String(o.san === p.san), onclick: () => setForced(cur, o.san) },
          [show(o.san), el('small', { text: Math.round(o.score * 100) + ' %' })]));
      });
      if (p.san && !shown.has(p.san)) opts.prepend(el('button', { class: 'ss-opt', type: 'button', 'aria-pressed': 'true' }, [show(p.san)]));
      const sel = el('select', { 'aria-label': 'Jiný tah', onchange: e => { if (e.target.value) setForced(cur, e.target.value); } },
        [el('option', { value: '', text: 'Jiný tah…' })].concat(legal.map(m => m.san).sort().map(s => el('option', { value: s, text: show(s) }))));
      opts.append(sel);
      box.append(el('div', { class: 'ss-row' }, [renderBoard(g.fen(), chosen), opts]));

      const acts = el('div', { class: 'ss-acts' });
      if (p.san && !forced[cur]) acts.append(el('button', { class: 'ss-btn primary', type: 'button', onclick: () => { setForced(cur, p.san); goNext(); } }, ['Tah je správně']));
      if (forced[cur]) acts.append(el('button', { class: 'ss-btn', type: 'button', onclick: () => setForced(cur, null) }, ['Vrátit původní čtení']));
      const nx = firstProblem(cur);
      acts.append(el('button', { class: 'ss-btn', type: 'button', disabled: nx < 0 || nx === cur, onclick: goNext }, ['Další k ověření']));
      box.append(acts);
      return box;
    }

    function goNext() {
      const nx = firstProblem(cur);
      if (nx >= 0) { cur = nx; render(); scrollToCur(); }
    }
    function scrollToCur() {
      const b = container.querySelector('.ss-mv.cur');
      if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
    }

    function render() {
      container.textContent = '';
      if (!res) return;
      const wrap = el('div', { class: 'ss' });
      const s = stats();

      let sum;
      if (s.stopped >= 0) {
        const p = res.plies[s.stopped];
        sum = el('p', { class: 'ss-sum bad' }, ['Přepis se zastavil u tahu ', el('b', { text: moveLabel(p) }), '. Vyber správný tah, zbytek partie se pak doplní.']);
      } else if (s.flagged) {
        sum = el('p', { class: 'ss-sum' }, ['Přečteno ', el('b', { text: s.done + ' půltahů' }), ', k ověření ', el('b', { text: String(s.flagged) }), ' (zvýrazněné).']);
      } else {
        sum = el('p', { class: 'ss-sum' }, ['Přečteno ', el('b', { text: s.done + ' půltahů' }), ', všechny tahy odpovídají pravidlům.']);
      }
      wrap.append(sum);
      if (data.notes) wrap.append(el('p', { class: 'ss-notes', text: 'Poznámka ke čtení: ' + data.notes }));

      const head = el('div', { class: 'ss-head' });
      HEAD_FIELDS.forEach(([k, label]) => {
        head.append(el('label', null, [label, el('input', { value: headers[k] || '', autocomplete: 'off', oninput: e => { headers[k] = e.target.value; changed(); } })]));
      });
      head.append(el('label', null, ['Výsledek', el('select', { onchange: e => { headers.result = e.target.value; changed(); } },
        RESULTS.map(([v, t]) => { const o = el('option', { value: v, text: t }); if (headers.result === v) o.selected = true; return o; }))]));
      wrap.append(head);

      const detail = renderDetail();
      const moves = el('div', { class: 'ss-moves', role: 'list', 'aria-label': 'Přečtené tahy' });
      res.plies.forEach((p, i) => {
        if (p.color === 'w' || i === 0) {
          moves.append(el('span', { class: 'ss-num', text: p.move_number + '.' }));
          if (p.color === 'b') moves.append(el('span'));
        }
        let cls = 'ss-mv';
        if (!p.san) cls += ' stop';
        else if (forced[i]) cls += ' ok';
        else if (p.flagged) cls += ' flag';
        if (i === cur) cls += ' cur';
        const kids = [p.san ? show(p.san) : (p.written || '—')];
        if (p.san && p.flagged && !forced[i] && p.written) kids.push(el('small', { text: p.written }));
        const blocked = res.stoppedAt >= 0 && i > res.stoppedAt;
        moves.append(el('button', { class: cls, type: 'button', role: 'listitem', disabled: blocked,
          'aria-label': moveLabel(p) + ': ' + (p.san ? show(p.san) : 'nepřečteno') + (p.flagged && !forced[i] ? ', k ověření' : ''),
          onclick: () => { cur = i; render(); } }, kids));
      });
      if (cur >= 0 && detail) wrap.append(detail);
      wrap.append(moves);
      wrap.append(el('p', { class: 'ss-legend' }, [
        el('span', null, [el('i', { class: 'flag' }), 'k ověření']),
        el('span', null, [el('i', { class: 'ok' }), 'potvrzeno']),
        el('span', { text: 'Klepnutím na tah ho zkontroluješ nebo změníš.' })
      ]));
      container.append(wrap);
    }

    function getSans() {
      if (!res) return [];
      const out = [];
      for (const p of res.plies) { if (!p.san) break; out.push(p.san); }
      return out;
    }
    function getComments() {
      const c = {};
      if (!res) return c;
      res.plies.forEach((p, i) => { if (p.san && p.flagged && !forced[i]) c[i] = 'nejisté čtení: ' + (p.written || '?'); });
      return c;
    }
    function getHeaders() { return Object.assign({}, headers); }
    function getPgn(opts) {
      return Core.buildPgn(headers, getSans(), { comments: opts && opts.markUncertain ? getComments() : null });
    }
    function getStats() { return res ? stats() : null; }
    function setCzech(v) { czech = !!v; render(); }

    return { load, render, getSans, getHeaders, getPgn, getComments, getStats, setCzech };
  }

  root.ScoresheetReview = { create };
})(typeof self !== 'undefined' ? self : this);
