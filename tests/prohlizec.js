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
