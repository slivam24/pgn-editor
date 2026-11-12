/*
 * Photo-to-PGN: přečtení partiáře z fotky nebo skenu přes Claude API.
 *
 * Potřebuje přibalené Anthropic SDK (vendor/anthropic-sdk.js, globální AnthropicSDK).
 * Fotky se zmenší na nejvyšší rozlišení, které model využije (2576 px na delší straně),
 * a pošlou se spolu s návodem, co z partiáře přečíst. Odpověď má pevnou strukturu (JSON schema),
 * takže se nemusí složitě rozebírat. Kontrolu tahů podle pravidel pak dělá scoresheet-core.js.
 *
 * Licence: GNU GPL 3 nebo novější.
 */
(function (root) {
  'use strict';

  const MODEL = 'claude-opus-5-5';
  const MAX_EDGE = 2576;        // nejdelší strana obrázku, kterou model ještě využije
  const MAX_PIXELS = 3.75e6;    // a nejvyšší počet pixelů
  const MAX_FILES = 4;

  const NOTATIONS = ['czech', 'slovak', 'english', 'german', 'polish', 'hungarian', 'french', 'spanish', 'italian', 'dutch', 'russian', 'figurine', 'unknown'];

  const str = { type: 'string' };
  const SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['headers', 'notation', 'plies', 'notes'],
    properties: {
      headers: {
        type: 'object',
        additionalProperties: false,
        required: ['white', 'black', 'white_elo', 'black_elo', 'event', 'site', 'date', 'round', 'result'],
        properties: { white: str, black: str, white_elo: str, black_elo: str, event: str, site: str, date: str, round: str, result: str }
      },
      notation: { type: 'string', enum: NOTATIONS },
      plies: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['move_number', 'color', 'written', 'san', 'alternatives', 'confidence'],
          properties: {
            move_number: { type: 'integer' },
            color: { type: 'string', enum: ['w', 'b'] },
            written: str,
            san: str,
            alternatives: { type: 'array', items: str },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] }
          }
        }
      },
      notes: str
    }
  };

  const SYSTEM = [
    'You transcribe handwritten chess scoresheets from photos or scans into structured data.',
    '',
    'A scoresheet is usually a printed form with a header (players, event, date, round, result) and numbered rows,',
    'often in several columns (for example 1-30 and 31-60), sometimes continued on another page. Each row has a cell',
    'for White\'s move and a cell for Black\'s move. Read the rows strictly by move number, across columns and pages.',
    '',
    'For every filled move cell return one ply:',
    '- move_number and color ("w" for the White cell, "b" for the Black cell) taken from the row.',
    '- written: exactly what is handwritten, keeping the original piece letters of the language used',
    '  (Czech/Slovak K D V S J, German K D T L S, English K Q R B N, and so on), capture signs (x or :), check signs,',
    '  long notation (e2-e4), castling as written (0-0). Do not translate or correct it here.',
    '  If a move is crossed out and replaced, use the replacement. If a cell is empty, leave that ply out.',
    '- san: your reading of that move as a legal move in standard English SAN. Replay the game on a board as you go',
    '  and use the position to resolve unclear handwriting (S vs 5, b vs 6, 1 vs 7, c vs e, missing capture or',
    '  disambiguation). If the written move is illegal, give the most plausible legal move the player meant.',
    '- alternatives: up to 3 other plausible readings of the handwriting, written the same way as `written`;',
    '  an empty list when the reading is clear.',
    '- confidence: "high" when the handwriting is clear and the move fits the position, "medium" when you had to',
    '  choose between readings, "low" when you are guessing.',
    '',
    'notation: the language of the piece letters (use "figurine" for piece symbols, "unknown" if you cannot tell).',
    'headers: copy names as written ("Surname, Firstname" when both are given), event or tournament, site,',
    'date as YYYY.MM.DD when it can be determined, round, Elo ratings, and result as 1-0, 0-1 or 1/2-1/2',
    'when it is marked on the sheet. Use an empty string for anything that is not on the sheet.',
    'notes: one or two short sentences in Czech for the user about problems worth checking',
    '(unreadable moves, skipped rows, a different result than the moves suggest), or an empty string.'
  ].join('\n');

  /* ---------- Příprava souborů ---------- */

  function readAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Soubor se nepodařilo přečíst.'));
      r.readAsDataURL(blob);
    });
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Obrázek se nepodařilo otevřít.'));
      img.src = url;
    });
  }

  /**
   * Připraví fotku nebo PDF k odeslání. Fotky zmenší a převede do JPEG.
   * Vrací { kind: 'image'|'pdf', mediaType, data (base64), preview (URL pro náhled), name }.
   */
  async function prepareFile(file) {
    const name = file.name || 'partiar';
    if (file.type === 'application/pdf' || /\.pdf$/i.test(name)) {
      if (file.size > 30 * 1024 * 1024) throw new Error('PDF je příliš velké (nejvýš 30 MB).');
      const url = await readAsDataUrl(file);
      return { kind: 'pdf', mediaType: 'application/pdf', data: url.split(',')[1], preview: null, name };
    }
    const srcUrl = URL.createObjectURL(file);
    try {
      const img = await loadImage(srcUrl); // prohlížeč sám otočí fotku podle údajů z fotoaparátu
      const w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) throw new Error('Obrázek je prázdný.');
      const scale = Math.min(1, MAX_EDGE / Math.max(w, h), Math.sqrt(MAX_PIXELS / (w * h)));
      const cw = Math.round(w * scale), ch = Math.round(h * scale);
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      const url = canvas.toDataURL('image/jpeg', 0.9);
      return { kind: 'image', mediaType: 'image/jpeg', data: url.split(',')[1], preview: url, name, width: cw, height: ch };
    } finally {
      URL.revokeObjectURL(srcUrl);
    }
  }

  /** Otočí připravený obrázek o 90° (když fotka leží na boku). */
  async function rotateImage(prepared, clockwise) {
    if (prepared.kind !== 'image') return prepared;
    const img = await loadImage(prepared.preview);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalHeight; canvas.height = img.naturalWidth;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((clockwise === false ? -1 : 1) * Math.PI / 2);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const url = canvas.toDataURL('image/jpeg', 0.9);
    return Object.assign({}, prepared, { data: url.split(',')[1], preview: url, width: canvas.width, height: canvas.height });
  }

  /* ---------- Volání Claude API ---------- */

  function sdk() {
    const S = root.AnthropicSDK;
    if (!S || !S.Anthropic) throw new Error('Chybí knihovna Anthropic SDK (anthropic-sdk.js).');
    return S;
  }

  function friendlyError(err) {
    const S = root.AnthropicSDK || {};
    const status = err && err.status;
    if (S.AuthenticationError && err instanceof S.AuthenticationError) return 'Klíč k Claude API nebyl přijat. Zkontroluj ho v nastavení.';
    if (S.PermissionDeniedError && err instanceof S.PermissionDeniedError) return 'Klíč nemá k tomuto modelu přístup.';
    if (S.RateLimitError && err instanceof S.RateLimitError) return 'Příliš mnoho požadavků najednou. Zkus to za chvíli znovu.';
    if (S.APIUserAbortError && err instanceof S.APIUserAbortError) return 'Čtení zrušeno.';
    if (S.APIConnectionError && err instanceof S.APIConnectionError) return 'Nepodařilo se spojit se serverem. Je telefon připojený k internetu?';
    if (S.BadRequestError && err instanceof S.BadRequestError) {
      const m = String(err.message || '');
      if (/credit balance/i.test(m)) return 'Na účtu Claude API došel kredit. Dobij ho na platform.claude.com.';
      return 'Server požadavek odmítl: ' + m;
    }
    if (status === 529 || (S.InternalServerError && err instanceof S.InternalServerError)) return 'Server je teď přetížený. Zkus to za chvíli znovu.';
    return (err && err.message) ? err.message : 'Neznámá chyba.';
  }

  /**
   * Pošle připravené soubory Claudovi a vrátí přečtený partiář.
   * opts: { apiKey, files: [prepareFile()...], onProgress(text), signal (AbortSignal) }
   * Vrací { data: { headers, notation, plies, notes }, usage, model }.
   */
  async function read(opts) {
    const S = sdk();
    const files = (opts.files || []).slice(0, MAX_FILES);
    if (!files.length) throw new Error('Nejdřív přidej fotku partiáře.');
    if (!opts.apiKey) throw new Error('Chybí klíč k Claude API.');
    const progress = opts.onProgress || function () {};

    const client = new S.Anthropic({ apiKey: opts.apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 2 });
    const content = [];
    files.forEach((f, i) => {
      if (files.length > 1) content.push({ type: 'text', text: 'Strana ' + (i + 1) + ':' });
      if (f.kind === 'pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.data } });
      else content.push({ type: 'image', source: { type: 'base64', media_type: f.mediaType, data: f.data } });
    });
    content.push({ type: 'text', text: files.length > 1 ? 'Přepiš tento partiář (strany jsou ve správném pořadí).' : 'Přepiš tento partiář.' });

    progress('Odesílám…');
    let message;
    try {
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',            // při odmítnutí bezpečnostním filtrem zkusí server jiný model
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: 'user', content }]
      }, { signal: opts.signal });
      let chars = 0, phase = '';
      stream.on('streamEvent', ev => {
        if (ev.type === 'content_block_start') {
          const t = ev.content_block && ev.content_block.type;
          if (t === 'thinking' && phase !== 'think') { phase = 'think'; progress('Claude prohlíží partiář…'); }
          if (t === 'text' && phase !== 'text') { phase = 'text'; progress('Claude zapisuje tahy…'); }
        } else if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') {
          chars += ev.delta.text.length;
          const n = (ev.delta.text.match(/"move_number"/g) || []).length;
          if (n || chars % 400 < ev.delta.text.length) progress('Claude zapisuje tahy… (' + Math.round(chars / 1000 * 10) / 10 + ' kB)');
        }
      });
      message = await stream.finalMessage();
    } catch (err) {
      throw new Error(friendlyError(err));
    }

    if (message.stop_reason === 'refusal') throw new Error('Claude odmítl obrázek zpracovat. Zkus jinou fotku.');
    if (message.stop_reason === 'max_tokens') throw new Error('Odpověď byla příliš dlouhá a nedokončila se. Zkus poslat méně stran najednou.');
    const text = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('Odpověď se nepodařilo přečíst. Zkus to znovu.'); }
    if (!data || !Array.isArray(data.plies)) throw new Error('V odpovědi chybí tahy.');
    return { data, usage: message.usage, model: message.model };
  }

  /** Přibližná cena v USD podle spotřeby (Claude Opus 5.5: 4 $ / 20 $ za milion tokenů). */
  function estimateCost(usage) {
    if (!usage) return null;
    const inTok = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) * 1.25 + (usage.cache_read_input_tokens || 0) * 0.1;
    return (inTok * 4 + (usage.output_tokens || 0) * 20) / 1e6;
  }

  root.ScoresheetReader = { MODEL, SCHEMA, SYSTEM, MAX_FILES, prepareFile, rotateImage, read, estimateCost };
})(typeof self !== 'undefined' ? self : this);
