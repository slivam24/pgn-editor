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
