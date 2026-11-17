// Zkouška aplikace ve skutečném prohlížeči (Chrome): ukládání rozpracovaného souboru do paměti,
// velký soubor, chybná partie a přechod ze starší verze. Spouští se při sestavení: node tests/prohlizec.js
// Potřebuje balíček puppeteer-core a Chrome (cesta jde změnit proměnnou CHROME).
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const WWW = path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const MOVES = '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0';
const game = (i, moves) => '[Event "Turnaj"]\n[Round "' + (i % 9 + 1) + '"]\n[White "Novák, Jan ' + i + '"]\n[Black "Dvořák, Petr"]\n[Result "1-0"]\n\n' + (moves || MOVES) + '\n\n';
// soubor uložený verzí 0.18 a starší
const OLD = JSON.stringify({ games: [{ headers: { Event: 'Stary', Site: '?', Date: '????.??.??', Round: '?', White: 'Starý, Jan', Black: '?', Result: '*' }, extra: {},
  startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', root: { c: '', n: [], ch: [{ c: '', n: [], ch: [], s: 'e4' }] }, path: [0], ply: 1, flipped: false }], cur: 0, name: 'stary' });

(async () => {
  let puppeteer, browser;
  const server = http.createServer((req, res) => {
    const file = path.join(WWW, decodeURIComponent(req.url.split(/[?#]/)[0]));
    if (!file.startsWith(WWW) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const URL = 'http://127.0.0.1:' + server.address().port + '/index.html';
  try {
    puppeteer = require('puppeteer-core');
    browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  } catch (e) {
    // chybějící prohlížeč není chyba aplikace, sestavení kvůli němu nepadá
    console.log('Zkouška v prohlížeči přeskočena, prohlížeč se nepodařilo spustit: ' + e.message);
    server.close();
    return;
  }
  let failed = 0;
  const step = async (name, fn) => {
    const ctx = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewport({ width: 412, height: 915 });
    try {
      await fn(page);
      assert.deepEqual(errors, [], 'chyby na stránce');
      console.log('ok   ' + name);
    } catch (e) { failed++; console.log('CHYBA ' + name + '\n     ' + String(e.message).split('\n').join('\n     ')); }
    await ctx.close();
  };
  // Pomocné funkce: stránka je připravená, až zmizí třída booting
  const open = async page => { await page.goto(URL, { waitUntil: 'load' }); await page.waitForFunction(() => !document.body.classList.contains('booting')); };
  const text = (page, id) => page.$eval('#' + id, e => e.textContent);
  const click = (page, id) => page.$eval('#' + id, e => e.click());
  const tap = (page, sq) => page.$eval('[data-sq="' + sq + '"]', e => e.click());
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const paste = async (page, pgn) => { // vložení textu přes menu PGN text
    await page.$eval('#pgnText', (e, t) => { e.value = t; }, pgn);
    await click(page, 'loadText');
    await pause(50);
    if (await page.$eval('#modal', e => !e.hidden) && await page.$eval('#modalOk', e => e.textContent === 'Načíst')) await click(page, 'modalOk');
  };
  const pgnOut = page => page.$eval('#pgnText', e => e.value.replace(/\s+/g, ' '));

  await step('první spuštění ukáže ukázkovou partii', async page => {
    await open(page);
    assert.match(await text(page, 'counter'), /17 z 17/);
    assert.equal(await page.$eval('#fileWarn', e => e.hidden), true);
  });

  await step('tah se uloží a vydrží znovunačtení stránky', async page => {
    await open(page);
    await paste(page, game(1, '1. e4 e5 *'));
    await tap(page, 'g1'); await tap(page, 'f3');
    assert.match(await pgnOut(page), /1\. e4 e5 2\. Nf3 /);
    assert.equal(await text(page, 'fileWarn'), 'Neuložené změny');
    await pause(300);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.body.classList.contains('booting'));
    assert.match(await pgnOut(page), /1\. e4 e5 2\. Nf3 /);
    assert.equal(await text(page, 'fileWarn'), 'Neuložené změny');
  });

  await step('velký soubor se otevře rychle a po znovunačtení je celý', async page => {
    await open(page);
    let big = '';
    for (let i = 0; i < 6000; i++) big += game(i);
    const t0 = Date.now();
    await paste(page, big);
    await page.waitForFunction(() => /6000 partií/.test(document.getElementById('fileInfo').textContent), { timeout: 15000 });
    const ms = Date.now() - t0;
    assert.ok(ms < 10000, 'otevření trvalo ' + ms + ' ms');
    assert.equal(await page.$eval('#modal', e => e.hidden), true, 'nečekané upozornění: ' + await text(page, 'modalText'));
    await pause(1500);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.body.classList.contains('booting'));
    assert.match(await text(page, 'fileInfo'), /6000 partií/);
    assert.equal(await page.evaluate(() => localStorage.getItem('pgn-editor-file-v2')), null);
  });

  await step('partie s neplatným tahem se načte po chybu a upozorní na to', async page => {
    await open(page);
    await paste(page, game(1, '1. e4 e5 2. Ke3 Nf6 1-0'));
    assert.equal(await text(page, 'modalTitle'), 'Partii nejde přečíst celou');
    assert.match(await text(page, 'modalText'), /Tah 2\. Ke3 není v pozici možný/);
    await click(page, 'modalOk');
    assert.match(await pgnOut(page), /1\. e4 e5 \{Nelze precist tah Ke3\. Zbytek zapisu: 2\. Ke3 Nf6 1-0\} 1-0/);
  });

  await step('soubor ze starší verze se převezme a staré úložiště se uvolní', async page => {
    await page.goto(URL.replace('index.html', 'licence/apache-2.0.txt'));
    await page.evaluate(o => localStorage.setItem('pgn-editor-file-v2', o), OLD);
    await open(page);
    assert.match(await text(page, 'fileInfo'), /^stary\.pgn, 1 partie/);
    assert.match(await pgnOut(page), /\[White "Stary, Jan"\] .*1\. e4 \*/);
    await pause(500);
    assert.equal(await page.evaluate(() => localStorage.getItem('pgn-editor-file-v2')), null);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.body.classList.contains('booting'));
    assert.match(await text(page, 'fileInfo'), /^stary\.pgn, 1 partie/);
  });

  await step('zahájení podle tahů a další údaje v hlavičce se zapíšou do PGN', async page => {
    await open(page);
    await page.evaluate(() => { for (const id of ['optMoreTags', 'optOpening']) { const e = document.getElementById(id); e.checked = true; e.dispatchEvent(new Event('change')); } });
    await paste(page, game(1, '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 *'));
    await tap(page, 'a7'); await tap(page, 'a6');
    assert.match(await text(page, 'movesSum'), /B90 Sicilian Defense: Najdorf Variation/);
    await page.$eval('#xWhiteElo', e => { e.value = '2150'; e.dispatchEvent(new Event('input')); });
    const out = await pgnOut(page);
    assert.match(out, /\[ECO "B90"\] \[Opening "Sicilian Defense: Najdorf Variation"\]/);
    assert.match(out, /\[WhiteElo "2150"\]/);
  });

  await step('graf průběhu partie z hodnocení v souboru, klepnutí skočí na tah', async page => {
    await open(page);
    await page.evaluate(() => { const e = document.getElementById('optEngine'); e.checked = true; e.dispatchEvent(new Event('change')); });
    await paste(page, game(1, '1. e4 { [%eval 0.3] } e5 { [%eval 0.2] } 2. Nf3 { [%eval 0.3] } Nc6 { [%eval 0.2] } 3. Bc4 { [%eval 0.1] } Nd4 { [%eval 1.4] } *'));
    assert.equal(await page.$eval('#graph', e => e.hidden), false);
    const r = await page.$eval('#graphPlot', e => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
    await page.mouse.click(r.x + r.w / 3, r.y + r.h / 2);
    await page.waitForFunction(() => /2 z 3|1 z 3/.test(document.getElementById('counter').textContent));
    assert.match(await text(page, 'graphVal'), /1\.\.\. e5\s+\+0,20/);
    // bez hodnocení se graf neukazuje
    await paste(page, game(2, '1. d4 d5 *'));
    assert.equal(await page.$eval('#graph', e => e.hidden), true);
  });

  await step('čas na hodinách se zapíše k tahu, ukáže u hráče a uloží do PGN', async page => {
    await open(page);
    await page.evaluate(() => { const e = document.getElementById('optClock'); e.checked = true; e.dispatchEvent(new Event('change')); });
    await paste(page, game(1, '1. e4 e5 { [%clk 1:28:00] } *'));
    assert.equal(await page.$eval('#playerTop .clk', e => e.textContent), '1:28'); // čas ze souboru
    await click(page, 'navPrev');
    await click(page, 'clockBtn');
    assert.equal(await text(page, 'kTitle'), 'Čas po tahu 1. e4');
    await page.$eval('#kText', e => { e.value = 'nesmysl'; });
    await click(page, 'kSave');
    assert.match(await text(page, 'kMsg'), /nerozumím/);
    await page.$eval('#kText', e => { e.value = '1.25'; });
    await click(page, 'kSave');
    assert.equal(await page.$eval('#kModal', e => e.hidden), true);
    assert.equal(await page.$eval('#playerBottom .clk', e => e.textContent), '1:25');
    assert.equal(await page.$('#playerTop .clk'), null); // černý ještě netáhl
    assert.match(await pgnOut(page), /1\. e4 \{\[%clk 1:25:00\]\} 1\.\.\. e5 \{\[%clk 1:28:00\]\}/);
  });

  await step('soubor, který není PGN, se odmítne a rozpracovaný soubor zůstane', async page => {
    const os = require('os');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pgn-test-'));
    const img = path.join(dir, 'obrazek.png'), txt = path.join(dir, 'dopis.txt');
    fs.writeFileSync(img, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]), Buffer.from('IHDR}{()x'), Buffer.alloc(300, 7)]));
    fs.writeFileSync(txt, 'Dobrý den,\nposílám výsledky turnaje.\n');
    await open(page);
    for (const [file, why] of [[img, /Není to soubor PGN/], [txt, /žádné partie ve formátu PGN/]]) {
      await (await page.$('#fileInput')).uploadFile(file);
      await page.waitForFunction(() => !document.getElementById('modal').hidden, { timeout: 5000 });
      assert.equal(await text(page, 'modalTitle'), 'Soubor nejde otevřít');
      assert.match(await text(page, 'modalText'), why);
      await click(page, 'modalOk');
      assert.match(await text(page, 'counter'), /17 z 17/); // ukázková partie zůstala
    }
  });

  await step('před otevřením velkého souboru přijde upozornění', async page => {
    const os = require('os');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pgn-test-')), 'velky.pgn');
    let big = '';
    for (let i = 0; i < 1200; i++) big += game(i, '1. e4 e5 1-0');
    fs.writeFileSync(file, big);
    await open(page);
    await (await page.$('#fileInput')).uploadFile(file);
    await page.waitForFunction(() => !document.getElementById('modal').hidden, { timeout: 10000 });
    assert.equal(await text(page, 'modalTitle'), 'Velký soubor');
    assert.match(await text(page, 'modalText'), /1200 partií.*menších souborů/);
    await click(page, 'modalCancel');
    assert.match(await text(page, 'fileInfo'), /^1 partie/); // zrušením se nic neotevře
    await (await page.$('#fileInput')).uploadFile(file);
    await page.waitForFunction(() => !document.getElementById('modal').hidden, { timeout: 10000 });
    await click(page, 'modalOk');
    await page.waitForFunction(() => /1200 partií/.test(document.getElementById('fileInfo').textContent), { timeout: 10000 });
  });

  // Napodobený obal Androidu: zachytí ukládání souborů, tisk a stahování z odkazu
  const fakeAndroid = page => page.evaluateOnNewDocument(() => {
    window.__saved = {}; window.__print = null; window.__urls = [];
    window.Android = { takeMigratedStorage: () => null, vibrate() {}, takeOpenedUri: () => '', setTheme() {},
      saveFile: (name, text) => { window.__saved[name] = text; setTimeout(() => window.onAndroidSaved(true, name, ''), 10); },
      printHtml: (title, html) => { window.__print = { title, html }; },
      httpGet: (id, url) => { window.__urls.push(url); setTimeout(() => window.onHttp(id, /q7ZvsdUF/.test(url) ? 200 : 404, '[Event "Z odkazu"]\n[White "Lance"]\n[Black "Trying"]\n[Result "*"]\n\n1. d4 d5 *\n'), 20); } };
  });
  const rows = page => page.$$eval('#gamesList .game', els => els.map(e => e.querySelector('.t').textContent + (e.classList.contains('on') ? '[x]' : '')).join(' ; '));
  const four = game(3, '1. e4 e5 2. Nf3 *').replace('Jan 3', 'Cyril') + game(0, '1. d4 d5 *').replace('Jan 0', 'Adam') + game(3, '1. e4 e5 2. Nf3 *').replace('Jan 3', 'Cyril') + game(1, '1. c4 *').replace('Jan 1', 'Boris');

  await step('seznam partií: řazení, duplicity, výběr, uložení výběru a smazání', async page => {
    await fakeAndroid(page);
    await open(page);
    await paste(page, four);
    await click(page, 'menuBtn');
    await page.$eval('[data-page=pgGames]', e => e.click());
    await pause(350);
    assert.equal(await rows(page), 'Novák - Dvořák ; Novák - Dvořák ; Novák - Dvořák ; Novák - Dvořák');
    await click(page, 'gSort');
    await page.$$eval('#chBtns button', b => b[2].click()); // podle bílého hráče (jména se liší křestním jménem)
    await pause(200);
    assert.match(await text(page, 'toast'), /seřazené podle bílého/);
    await click(page, 'gDup');
    await page.waitForFunction(() => !document.getElementById('modal').hidden);
    assert.match(await text(page, 'modalText'), /je 1 partie se stejnými hráči/);
    await click(page, 'modalOk');
    assert.equal(await text(page, 'selCount'), 'Vybráno: 1 z 4');
    await click(page, 'selSave');
    await page.waitForFunction(() => Object.keys(window.__saved).length === 1);
    const saved = await page.evaluate(() => Object.values(window.__saved)[0]);
    assert.equal((saved.match(/\[Event /g) || []).length, 1);
    assert.match(saved, /1\. e4 e5 2\. Nf3/);
    await click(page, 'selDel');
    await click(page, 'modalOk');
    await pause(200);
    assert.match(await text(page, 'fileInfo'), /^3 partie/);
    assert.equal(await page.$eval('#selFoot', e => e.hidden), true);
  });

  await step('záloha a obnova: partie i nastavení', async page => {
    await fakeAndroid(page);
    await open(page);
    await page.evaluate(() => { for (const [id, v] of [['optUndo', true], ['czNotation', true]]) { const e = document.getElementById(id); e.checked = v; e.dispatchEvent(new Event('change')); } });
    await paste(page, four);
    await click(page, 'backupSave');
    await page.waitForFunction(() => Object.keys(window.__saved).some(k => /^pgn-editor-zaloha-.*\.json$/.test(k)));
    const backup = await page.evaluate(() => Object.values(window.__saved)[0]);
    assert.equal(JSON.parse(backup).app, 'pgn-editor');
    // smazat všechno a obnovit ze zálohy
    await page.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('pgn-editor'); });
    await open(page);
    assert.match(await text(page, 'counter'), /17 z 17/);
    const os = require('os');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pgn-test-')), 'zaloha.json');
    fs.writeFileSync(file, backup);
    await (await page.$('#fileInput')).uploadFile(file);
    await page.waitForFunction(() => !document.getElementById('modal').hidden && document.getElementById('modalTitle').textContent === 'Obnovit ze zálohy?', { timeout: 5000 });
    await click(page, 'modalOk');
    await page.waitForFunction(() => !document.body.classList.contains('booting') && /^4 partie/.test(document.getElementById('fileInfo').textContent) && !document.getElementById('undo').hidden, { timeout: 10000 });
    assert.equal(await page.$eval('#czNotation', e => e.checked), true);
  });

  await step('tisk: stránka s tahy, variantou, komentářem a diagramy', async page => {
    await fakeAndroid(page);
    await open(page);
    await paste(page, game(1, '1. e4 e5 2. Nf3 Nc6 {dobrý tah} (2... d6 3. d4) 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 *'));
    await page.$eval('#printEvery', e => { e.value = '5'; });
    await click(page, 'printGo');
    await page.waitForFunction(() => window.__print, { timeout: 15000 });
    const pr = await page.evaluate(() => window.__print);
    assert.match(pr.html, /<h1>Jan 1 Novák – Petr Dvořák/);
    assert.match(pr.html, /<b>Nc6<\/b> <i>dobrý tah<\/i>/);
    assert.match(pr.html, /\(2\.\.\.\u00a0d6 3\.\u00a0d4\)/);
    assert.equal((pr.html.match(/<figure>/g) || []).length, 2); // po 5. tahu a konečná pozice
    assert.match(pr.html, /Pozice po tahu 5\.\.\. Be7/);
  });

  await step('stažení partie z odkazu a neplatný odkaz', async page => {
    await fakeAndroid(page);
    await open(page);
    await page.$eval('#linkIn', e => { e.value = 'tohle není odkaz'; });
    await click(page, 'linkGo');
    assert.match(await text(page, 'linkMsg'), /odkazu nerozumím/);
    await page.$eval('#linkIn', e => { e.value = 'https://lichess.org/q7ZvsdUF/black'; });
    await click(page, 'linkGo');
    await page.waitForFunction(() => !document.getElementById('chModal').hidden, { timeout: 5000 });
    assert.deepEqual(await page.evaluate(() => window.__urls), ['https://lichess.org/game/export/q7ZvsdUF?clocks=true&evals=true']);
    await page.$$eval('#chBtns button', b => b[0].click()); // přidat do otevřeného souboru
    await page.waitForFunction(() => /^2 partie/.test(document.getElementById('fileInfo').textContent), { timeout: 5000 });
    assert.match(await pgnOut(page), /\[Event "Z odkazu"\].*1\. d4 d5/);
    await page.$eval('#linkIn', e => { e.value = 'https://lichess.org/abcdefgh'; });
    await click(page, 'linkGo');
    await page.waitForFunction(() => !document.getElementById('modal').hidden, { timeout: 5000 });
    assert.match(await text(page, 'modalText'), /není, nebo není veřejná/);
  });

  // QR kód z aplikace přečte nezávislá čtečka (jsQR v Node), obsah musí přesně odpovídat
  const readQr = async page => {
    const jsQR = require('jsqr');
    const r = await page.evaluate(async () => {
      const img = document.getElementById('qrImg'); await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      return { w: c.width, h: c.height, data: Array.from(x.getImageData(0, 0, c.width, c.height).data) };
    });
    const q = jsQR(Uint8ClampedArray.from(r.data), r.w, r.h);
    return q ? q.data : null;
  };
  await step('QR kód: partie a pozice se dají přečíst, načtení z obrázku', async page => {
    await open(page);
    await paste(page, game(1, '1. e4 e5 2. Nf3 Nc6 {koment} (2... d6) 3. Bb5 *'));
    await click(page, 'menuBtn');
    await page.$eval('[data-page=pgQr]', e => e.click());
    await page.waitForFunction(() => document.getElementById('qrImg').src.startsWith('data:image/png'), { timeout: 10000 });
    assert.equal(await readQr(page), await page.$eval('#pgnText', e => e.value));
    await click(page, 'qrPos');
    await page.waitForFunction(() => /Pozice/.test(document.getElementById('qrNote').textContent));
    const fen = await page.$eval('#fenCur', e => e.value);
    assert.equal(await readQr(page), fen);
    // obrázek s QR kódem pozice se načte do nové partie
    const os = require('os');
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pgn-test-')), 'qr.png');
    fs.writeFileSync(file, Buffer.from((await page.$eval('#qrImg', e => e.src)).split(',')[1], 'base64'));
    await (await page.$('#qrFile')).uploadFile(file);
    await page.waitForFunction(() => document.getElementById('modalTitle').textContent === 'Nová partie z pozice?' && !document.getElementById('modal').hidden, { timeout: 10000 });
    await click(page, 'modalOk');
    await page.waitForFunction(() => /^2 partie/.test(document.getElementById('fileInfo').textContent), { timeout: 5000 });
    assert.equal(await page.$eval('#fenCur', e => e.value), fen);
  });

  await step('QR kód: příliš dlouhá partie se zkrátí bez komentářů a jde přečíst', async page => {
    await open(page);
    const { Chess } = require('../app/src/main/assets/www/chess.js');
    const c = new Chess(); let mv = '', seed = 9;
    const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let i = 0; i < 160 && !c.game_over(); i++) { const m = c.moves(); const s = m[rnd(m.length)]; c.move(s); mv += (i % 2 ? '' : (i / 2 + 1) + '. ') + s + ' {dlouhy komentar k tomuto tahu} '; }
    await paste(page, game(1, mv + '*'));
    await click(page, 'menuBtn');
    await page.$eval('[data-page=pgQr]', e => e.click());
    await page.waitForFunction(() => /bez komentářů/.test(document.getElementById('qrNote').textContent), { timeout: 10000 });
    const t = await readQr(page);
    assert.ok(t && !/komentar/.test(t) && /\[White "Novak, Jan 1"\]/.test(t), 'zkrácená partie z QR kódu');
  });

  await step('výuka: úloha se vyřeší, chyba se pozná, úroveň a opakování chybných', async page => {
    await open(page);
    // vždy stejná úloha: náhodný výběr nahradí první úloha z nabídky
    await page.evaluate(() => { Math.random = () => 0; });
    await click(page, 'menuBtn');
    await page.$eval('[data-page=pgLearn]', e => e.click());
    await page.waitForFunction(() => /úloh ve sbírce/.test(document.getElementById('lvCount').textContent), { timeout: 10000 });
    await click(page, 'lvStart');
    await page.waitForFunction(() => !document.getElementById('chModal').hidden);
    assert.equal(await text(page, 'chTitle'), 'Jak silně hraješ?');
    await page.$$eval('#chBtns button', b => b[1].click()); // úroveň 800
    await page.waitForFunction(() => /Najdi nejlepší tah/.test(document.getElementById('puzMsg').textContent), { timeout: 10000 });
    // zadání úlohy podle titulku a pozice
    const lines = fs.readFileSync(path.join(WWW, 'vyuka', 'ulohy.txt'), 'utf8').trim().split('\n').map(l => l.split('|'));
    const title = await text(page, 'puzTitle');
    const rating = /obtížnost (\d+)/.exec(title)[1];
    const cand = lines.filter(l => l[3] === rating);
    const { Chess } = require('../app/src/main/assets/www/chess.js');
    const boardFen = await page.$eval('#fenCur', e => e.value); // FEN se při úloze nemění, poznáme úlohu přes šachovnici
    const pieces = await page.$$eval('#board .sq', els => els.map(e => e.dataset.sq + (e.querySelector('.piece') ? e.querySelector('.piece').className.slice(-2) : '')).sort().join(','));
    const task = cand.find(l => { const c = new Chess(l[1] + ' 0 1'); const u = l[2].split(' ')[0]; c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' });
      const a = []; c.board().forEach((row, r) => row.forEach((p, f) => a.push('abcdefgh'[f] + (8 - r) + (p ? p.color + p.type : '')))); return a.sort().join(',') === pieces; });
    assert.ok(task, 'úloha na šachovnici ' + boardFen);
    const mv = task[2].split(' ');
    // chybný tah
    const c = new Chess(task[1] + ' 0 1'); c.move({ from: mv[0].slice(0, 2), to: mv[0].slice(2, 4), promotion: 'q' });
    const wrong = c.moves({ verbose: true }).find(m => m.from + m.to !== mv[1].slice(0, 4) && !m.san.endsWith('#'));
    await tap(page, wrong.from); await tap(page, wrong.to);
    assert.match(await text(page, 'puzMsg'), /To není ono/);
    // správné řešení
    for (let i = 1; i < mv.length; i += 2) {
      await page.waitForFunction(() => !/Pokračuj…/.test(document.getElementById('puzMsg').textContent));
      await tap(page, mv[i].slice(0, 2)); await tap(page, mv[i].slice(2, 4));
      if (mv[i][4]) { await pause(100); await page.$$eval('#promoRow button', (b, t) => b[{ q: 0, r: 1, b: 2, n: 3 }[t]].click(), mv[i][4]); }
      await pause(700);
    }
    await page.waitForFunction(() => /Hotovo/.test(document.getElementById('puzMsg').textContent), { timeout: 5000 });
    await click(page, 'puzEnd');
    const lvData = await page.evaluate(() => JSON.parse(localStorage.getItem('pgn-vyuka')));
    assert.equal(lvData.n, 1);
    assert.deepEqual(lvData.wrong, [task[0]]);
    assert.ok(lvData.rating < 800, 'úroveň po chybě klesne: ' + lvData.rating);
    // opakování chybné úlohy
    await click(page, 'menuBtn');
    await page.$eval('[data-page=pgLearn]', e => e.click());
    await page.waitForFunction(() => !document.getElementById('lvRetry').hidden);
    await click(page, 'lvRetry');
    await page.waitForFunction(() => /Opakování úlohy/.test(document.getElementById('puzInfo').textContent), { timeout: 5000 });
    assert.equal(await text(page, 'puzTitle'), title);
  });

  await step('tahy figur: jezdec z rohu do rohu, hvězdy, hlídané pole', async page => {
    await open(page);
    await click(page, 'menuBtn');
    await page.$eval('[data-page=pgDrill]', e => e.click());
    await page.waitForFunction(() => document.querySelectorAll('.dr-levels .btn').length === 36);
    await page.$$eval('.dr-levels .btn', b => b[26].click()); // jezdec, úroveň 3
    assert.match(await text(page, 'drMsg'), /Dojdi jezdcem na pole h8/);
    await tap(page, 'a3');
    assert.match(await text(page, 'drMsg'), /nemůže/);
    for (const sq of ['c2', 'a1', 'b3', 'c5', 'd7', 'f8', 'g6', 'h8']) await tap(page, sq);
    assert.match(await text(page, 'drInfo'), /Tahů: 8\. Nejkratší cesta má 6 tahů/);
    assert.match(await text(page, 'drMsg'), /★★☆/);
    await click(page, 'drAgain');
    for (const sq of ['b3', 'c5', 'd7', 'f8', 'g6', 'h8']) await tap(page, sq);
    assert.match(await text(page, 'drMsg'), /★★★/);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('pgn-figury'))), { n3: 3 });
    // věž, úroveň 6: na pole hlídané pěšcem nepustí
    await click(page, 'drEnd');
    await page.$$eval('.dr-levels .btn', b => b[5].click());
    await tap(page, 'a4'); await tap(page, 'd4');
    assert.match(await text(page, 'drMsg'), /sebrala černá figura/);
    assert.deepEqual(await page.$$eval('#board .sq.warn', e => e.map(x => x.dataset.sq).sort()), ['d4', 'e5']);
  });

  await step('úloha: předtah a rozbor se Stockfishem', async page => {
    await open(page);
    await page.evaluate(() => { localStorage.setItem('pgn-vyuka', JSON.stringify({ rating: 1500 })); });
    await open(page);
    await page.evaluate(() => { Math.random = () => 0; });
    await click(page, 'menuBtn');
    await page.$eval('[data-page=pgLearn]', e => e.click());
    await page.waitForFunction(() => /úloh ve sbírce/.test(document.getElementById('lvCount').textContent), { timeout: 10000 });
    await click(page, 'lvStart');
    // zadání úlohy se pozná podle obtížnosti a figur před tahem soupeře
    const title = await text(page, 'puzTitle');
    const pieces = await page.$$eval('#board .sq', els => els.map(e => e.dataset.sq + (e.querySelector('.piece') ? e.querySelector('.piece').className.slice(-2) : '')).sort().join(','));
    const { Chess } = require('../app/src/main/assets/www/chess.js');
    const lines = fs.readFileSync(path.join(WWW, 'vyuka', 'ulohy.txt'), 'utf8').trim().split('\n').map(l => l.split('|'));
    const task = lines.filter(l => l[3] === /(\d+)$/.exec(title)[1]).find(l => { const c = new Chess(l[1] + ' 0 1'); const a = [];
      c.board().forEach((row, r) => row.forEach((p, f) => a.push('abcdefgh'[f] + (8 - r) + (p ? p.color + p.type : '')))); return a.sort().join(',') === pieces; });
    assert.ok(task, 'úloha na šachovnici');
    const mv = task[2].split(' ');
    // předtah: první tah řešení dřív, než soupeř táhne
    await tap(page, mv[1].slice(0, 2)); await tap(page, mv[1].slice(2, 4));
    await page.waitForFunction(() => /Správně|Vyřešeno/.test(document.getElementById('puzMsg').textContent), { timeout: 5000 });
    // zbytek s jedním chybným tahem
    const c = new Chess(task[1] + ' 0 1'); mv.slice(0, 3).forEach(u => c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }));
    for (let i = 3; i < mv.length; i += 2) {
      await page.waitForFunction(() => /Najdi další tah/.test(document.getElementById('puzMsg').textContent), { timeout: 5000 });
      if (i === 3) { const w = c.moves({ verbose: true }).find(m => m.from + m.to !== mv[3].slice(0, 4) && !m.san.endsWith('#')); await tap(page, w.from); await tap(page, w.to); }
      await tap(page, mv[i].slice(0, 2)); await tap(page, mv[i].slice(2, 4));
      if (mv[i][4]) { await pause(100); await page.$$eval('#promoRow button', (b, t) => b[{ q: 0, r: 1, b: 2, n: 3 }[t]].click(), mv[i][4]); }
    }
    await page.waitForFunction(() => /Hotovo|Vyřešeno/.test(document.getElementById('puzMsg').textContent), { timeout: 5000 });
    await click(page, 'puzAna');
    await page.waitForFunction(() => /[+−0-9]|mat/.test(document.getElementById('anaScore').textContent) && document.getElementById('anaBest').textContent, { timeout: 60000 });
    assert.match(await text(page, 'anaScore'), /vyhráváš|stojíš|vyrovnané|prohráváš|^Mat|^Remíza/);
    if (mv.length > 4) { // rozbor začne chybným tahem: porovnání s řešením z pohledu řešitele
      await page.waitForFunction(() => !document.getElementById('anaCmp').hidden && /horší|stejně dobrý|k matu/.test(document.getElementById('cmpWhy').textContent), { timeout: 60000 });
      assert.match(await text(page, 'cmpMyVal'), /^[+−]?\d|mat/);
    }
    const n = await page.$$eval('#anaLine .mv', e => e.length);
    await click(page, 'anaPv');
    assert.equal(await page.$$eval('#anaLine .mv', e => e.length), n + 1);
  });

  await step('tahy figur: trénink vymýšlí řešitelná cvičení', async page => {
    await open(page);
    await click(page, 'menuBtn');
    await page.$eval('[data-page=pgDrill]', e => e.click());
    await page.waitForFunction(() => document.querySelectorAll('#trPieces button').length === 6);
    await page.$eval('#trPieces button[data-pc="n"]', e => e.click());
    await page.$eval('.dr-diff .btn[data-diff="2"]', e => e.click());
    await click(page, 'trStart');
    assert.match(await text(page, 'puzTitle'), /Trénink · Jezdec · střední/);
    // vyřešit nejkratší cestou spočítanou stejným prohledáním jako v aplikaci
    const path = await page.evaluate(() => {
      const F = window.FIGURY, lv = drillState().lv;
      const S = lv.stars, B = Object.keys(lv.black), all = (1 << (S.length + B.length)) - 1;
      const start = [F.idx(lv.start), all], prev = new Map([[start.join(':'), null]]);
      let q = [start];
      while (q.length) {
        const nq = [];
        for (const [sq, m] of q) {
          const stars = S.filter((_, i) => m & (1 << i)), black = {}; B.forEach((b, i) => { if (m & (1 << (S.length + i))) black[b] = lv.black[b]; });
          if (F.done(lv, sq, stars, black)) { const out = []; let k = sq + ':' + m; while (prev.get(k)) { out.unshift(F.name(+k.split(':')[0])); k = prev.get(k); } return out; }
          for (const mv of F.moves(lv, sq, black)) { if (mv.unsafe) continue; let nm = m; const t = F.name(mv.to);
            if (S.indexOf(t) !== -1) nm &= ~(1 << S.indexOf(t)); if (B.indexOf(t) !== -1) nm &= ~(1 << (S.length + B.indexOf(t)));
            const key = mv.to + ':' + nm; if (!prev.has(key)) { prev.set(key, sq + ':' + m); nq.push([mv.to, nm]); } }
        }
        q = nq;
      }
      return null;
    });
    assert.ok(path && path.length >= 3, 'cesta ' + JSON.stringify(path));
    for (const sq of path) await tap(page, sq);
    assert.match(await text(page, 'drMsg'), /★★★/);
    assert.equal(await text(page, 'drNext'), 'Další cvičení');
    await click(page, 'drNext');
    assert.match(await text(page, 'drInfo'), /Tahy: 0/);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('pgn-trenink')).n2), { n: 1, s3: 1 });
  });

  await step('menu: výuka a trénink na samostatné stránce, zpět se vrací na ni', async page => {
    await open(page);
    await click(page, 'menuBtn');
    const main = await page.$$eval('#pgMain [data-page]', e => e.map(x => x.dataset.page));
    assert.ok(main.includes('pgTeach'));
    for (const pg of ['pgLearn', 'pgDrill', 'pgPawns', 'pgWolves']) assert.ok(!main.includes(pg), pg + ' nemá být v hlavním menu');
    await page.$eval('#pgMain [data-page=pgTeach]', e => e.click());
    assert.deepEqual(await page.$$eval('#pgTeach [data-page]', e => e.map(x => x.dataset.page)), ['pgLearn', 'pgDrill', 'pgPawns', 'pgWolves']);
    await page.$eval('#pgTeach [data-page=pgWolves]', e => e.click());
    assert.ok(await page.$eval('#pgWolves', e => !e.hidden));
    await page.$eval('#pgWolves [data-back]', e => e.click());
    assert.ok(await page.$eval('#pgTeach', e => !e.hidden), 'šipka zpět vede na Výuku a trénink');
    await page.$eval('#pgTeach [data-page=pgLearn]', e => e.click());
    assert.equal(await page.evaluate(() => androidBack()), true);
    assert.ok(await page.$eval('#pgTeach', e => !e.hidden), 'tlačítko Zpět v Androidu také');
    await page.$eval('#pgTeach [data-back]', e => e.click());
    assert.ok(await page.$eval('#pgMain', e => !e.hidden));
  });

  await step('pěšci proti pěšcům: tahy, odpověď počítače, konec kola, uložení a konec série', async page => {
    await open(page);
    await click(page, 'menuBtn');
    await page.$eval('[data-page=pgPawns]', e => e.click());
    assert.match(await text(page, 'pwSeriesInfo'), /Kolo 1: ty 8\spěšců, počítač 8\spěšců/);
    assert.equal(await text(page, 'pwPlay'), 'Hrát kolo 1');
    await click(page, 'pwPlay');
    assert.match(await text(page, 'puzTitle'), /Pěšci proti pěšcům · kolo 1/);
    const pawnsOn = (page, c) => page.$$eval('#board .p-' + c + 'p', e => e.map(x => x.parentElement.dataset.sq).sort());
    assert.equal((await pawnsOn(page, 'w')).length, 8);
    assert.equal((await pawnsOn(page, 'b')).length, 8);
    // výběr pěšce ukáže, kam může táhnout
    await tap(page, 'e2');
    assert.deepEqual(await page.$$eval('#board .sq .dot', e => e.map(x => x.parentElement.dataset.sq).sort()), ['e3', 'e4']);
    await tap(page, 'e4');
    await page.waitForFunction(() => hraState().moves.length === 2 && /Jsi na tahu/.test(document.getElementById('hraMsg').textContent), { timeout: 15000 });
    assert.equal(await page.evaluate(() => hraState().engine), 'worker', 'počítač přemýšlí ve vlákně');
    assert.match(await text(page, 'hraInfo'), /^Počítač: /);
    assert.ok((await pawnsOn(page, 'w')).includes('e4'));
    // obtížnost se uloží, rozehrané kolo vydrží znovunačtení
    await page.$eval('#hraLevels .btn[data-level="medium"]', e => e.click());
    await open(page);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pgn-pesci')).level), 'medium');
    await click(page, 'menuBtn');
    await page.$eval('[data-page=pgPawns]', e => e.click());
    assert.equal(await text(page, 'pwPlay'), 'Pokračovat v kole');
    await click(page, 'pwPlay');
    assert.ok((await pawnsOn(page, 'w')).includes('e4'));
    assert.equal(await page.evaluate(() => hraState().moves.length), 2);
    // konec kola: bílý pěšec dojde na poslední řadu
    await page.evaluate(() => { hraState().pos = PESCI.fromSquares({ white: ['b7', 'e4'], black: ['h7', 'e5'], turn: 'w' }); });
    await tap(page, 'b7'); await tap(page, 'b8');
    assert.match(await text(page, 'hraMsg'), /Výhra/);
    assert.match(await text(page, 'hraInfo'), /poslední řadu.*Příští kolo: ty 7\spěšců, počítač 8\spěšců/);
    assert.equal(await text(page, 'hraMid'), '1 : 0');
    assert.equal(await text(page, 'hraNext'), 'Další kolo');
    await click(page, 'hraNext');
    assert.match(await text(page, 'puzTitle'), /kolo 2/);
    assert.deepEqual(await pawnsOn(page, 'w'), ['b2', 'c2', 'd2', 'e2', 'f2', 'g2', 'h2'], 'chybí sloupec a');
    // konec série: výhra kola se 4 pěšci
    await page.evaluate(() => localStorage.setItem('pgn-pesci', JSON.stringify({ series: { white: 4, black: 8, round: 5, wins: { w: 4, b: 0 }, history: [], winner: null, minPawns: 4 }, level: 'easy', seriesWins: { w: 0, b: 0 }, moves: [] })));
    await open(page);
    await click(page, 'menuBtn');
    await page.$eval('[data-page=pgPawns]', e => e.click());
    await click(page, 'pwPlay');
    assert.deepEqual(await pawnsOn(page, 'w'), ['c2', 'd2', 'e2', 'f2']);
    await page.evaluate(() => { hraState().pos = PESCI.fromSquares({ white: ['c7'], black: ['h7', 'a7'], turn: 'w' }); });
    await tap(page, 'c7'); await tap(page, 'c8');
    assert.match(await text(page, 'hraMsg'), /Série je tvoje/);
    assert.equal(await text(page, 'hraNext'), 'Nová série');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('pgn-pesci')).seriesWins), { w: 1, b: 0 });
    await click(page, 'hraNext');
    assert.match(await text(page, 'puzTitle'), /kolo 1/);
    assert.equal((await pawnsOn(page, 'w')).length, 8);
    // Ukončit vrátí do menu na stránku tréninku
    await click(page, 'hraEnd');
    assert.ok(await page.$eval('#pgPawns', e => !e.hidden));
    assert.ok(await page.evaluate(() => !document.body.classList.contains('hra') && document.getElementById('hraBox').hidden));
  });

  await step('vlci a ovečka: výběr pole, tahy, odpověď počítače, konec hry, počítadlo, hra za vlky', async page => {
    await open(page);
    await click(page, 'menuBtn');
    await page.$eval('[data-page=pgWolves]', e => e.click());
    assert.equal(await text(page, 'vlPlay'), 'Hrát');
    assert.ok(await page.$eval('#vlWarn', e => e.hidden), 'upozornění jen u dokonalých vlků');
    await page.$eval('#pgWolves .pw-level .btn[data-level="perfect"]', e => e.click());
    assert.ok(await page.$eval('#vlWarn', e => !e.hidden));
    await page.$eval('#pgWolves .pw-level .btn[data-level="normal"]', e => e.click());
    await click(page, 'vlPlay');
    assert.match(await text(page, 'puzTitle'), /Vlci a ovečka · hraješ za ovečku/);
    const on = (page, cls) => page.$$eval('#board .' + cls, e => e.map(x => x.parentElement.dataset.sq).sort());
    assert.deepEqual(await on(page, 'p-wolf'), ['a8', 'c8', 'e8', 'g8']);
    assert.deepEqual(await on(page, 'p-sheep'), []);
    // černá pole jsou ztlumená, výchozí pole ovečky zvýrazněná
    assert.equal(await page.$$eval('#board .sq.off', e => e.length), 32);
    assert.deepEqual(await page.$$eval('#board .sq.hint', e => e.map(x => x.dataset.sq).sort()), ['b1', 'd1', 'f1', 'h1']);
    assert.match(await text(page, 'hraMsg'), /Kde začne ovečka/);
    await tap(page, 'c1'); // černé pole nejde
    assert.deepEqual(await on(page, 'p-sheep'), []);
    await tap(page, 'd1');
    assert.deepEqual(await on(page, 'p-sheep'), ['d1']);
    assert.match(await text(page, 'hraMsg'), /Jsi na tahu/);
    await tap(page, 'd1');
    assert.deepEqual(await page.$$eval('#board .sq .dot', e => e.map(x => x.parentElement.dataset.sq).sort()), ['c2', 'e2']);
    await tap(page, 'e2');
    await page.waitForFunction(() => hraState().moves.length === 2 && /Jsi na tahu/.test(document.getElementById('hraMsg').textContent), { timeout: 15000 });
    assert.equal(await page.evaluate(() => hraState().engine), 'worker', 'počítač přemýšlí ve vlákně');
    assert.match(await text(page, 'hraInfo'), /^Počítač: [aceg]8-[a-h]7$/);
    // rozehraná hra vydrží znovunačtení
    await open(page);
    await click(page, 'menuBtn');
    await page.$eval('[data-page=pgWolves]', e => e.click());
    assert.equal(await text(page, 'vlPlay'), 'Pokračovat ve hře');
    await click(page, 'vlPlay');
    assert.deepEqual(await on(page, 'p-sheep'), ['e2']);
    // konec hry: ovečka dojde na osmou řadu
    await page.evaluate(() => { hraState().pos = VLCI.fromSquares({ sheep: 'd7', wolves: ['b7', 'f7', 'h7', 'a8'], turn: 'sheep' }); });
    await tap(page, 'd7'); await tap(page, 'e8');
    assert.match(await text(page, 'hraMsg'), /Výhra! Ovečka utekla/);
    assert.equal(await text(page, 'hraMid'), '1 : 0');
    assert.equal(await text(page, 'hraNext'), 'Hrát znovu');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('pgn-vlci')).wins.sheep), { me: 1, pc: 0 });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pgn-vlci')).game), null);
    // hra za vlky: ovečka (počítač) začne sama, hráč táhne vlkem jen dolů
    await click(page, 'hraEnd');
    assert.ok(await page.$eval('#pgWolves', e => !e.hidden));
    assert.match(await text(page, 'vlStats'), /za ovečku 1\s:\s0, za vlky 0\s:\s0/);
    await page.$eval('.vl-side .btn[data-side="wolves"]', e => e.click());
    await click(page, 'vlPlay');
    assert.match(await text(page, 'puzTitle'), /hraješ za vlky/);
    await page.waitForFunction(() => hraState().moves.length === 1 && /Jsi na tahu/.test(document.getElementById('hraMsg').textContent), { timeout: 15000 });
    assert.equal((await on(page, 'p-sheep')).length, 1);
    await tap(page, 'c8');
    assert.deepEqual(await page.$$eval('#board .sq .dot', e => e.map(x => x.parentElement.dataset.sq).sort()), ['b7', 'd7']);
    await tap(page, 'd7');
    await page.waitForFunction(() => hraState().moves.length === 3, { timeout: 15000 });
    // vlci chytí ovečku
    await page.waitForFunction(() => /Jsi na tahu/.test(document.getElementById('hraMsg').textContent));
    await page.evaluate(() => { hraState().pos = VLCI.fromSquares({ sheep: 'h1', wolves: ['h3', 'a8', 'c8', 'e8'], turn: 'wolves' }); });
    await tap(page, 'h3'); await tap(page, 'g2');
    assert.match(await text(page, 'hraMsg'), /Výhra! Ovečka je chycená/);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('pgn-vlci')).wins.wolves), { me: 1, pc: 0 });
  });

  await step('nepovedené uložení do paměti telefonu se ohlásí', async page => {
    await open(page);
    await paste(page, game(1, '1. e4 e5 *'));
    await pause(200);
    await page.evaluate(() => { IDBObjectStore.prototype.put = function () { throw new DOMException('plno', 'QuotaExceededError'); }; });
    await tap(page, 'g1'); await tap(page, 'f3');
    await page.waitForFunction(() => !document.getElementById('modal').hidden, { timeout: 5000 });
    assert.equal(await text(page, 'modalTitle'), 'Soubor se neukládá do paměti telefonu');
    assert.match(await text(page, 'fileWarn'), /neukládá do paměti telefonu/);
  });

  await browser.close();
  server.close();
  if (failed) { console.log('\nNeprošlo: ' + failed); process.exit(1); }
  console.log('\nVšechny zkoušky v prohlížeči prošly.');
})();
