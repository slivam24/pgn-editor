// Snímky obrazovky aplikace ve skutečném prohlížeči (Chrome) pro kontrolu vzhledu při sestavení
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const SHOTS = [['nahled', ''], ['nahled-menu', '#menu'], ['nahled-vse', '#vse'], ['nahled-editor', '#editor'], ['nahled-varianty', '#varianty'], ['nahled-motor', '#motor'], ['nahled-nastaveni', '#nastaveni'], ['nahled-partie', '#partie']];
(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const log = [];
  for (const [name, hash] of SHOTS) {
    const ctx = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
    const page = await ctx.newPage();
    page.on('console', m => log.push(name + ' console: ' + m.text()));
    page.on('pageerror', e => log.push(name + ' error: ' + e.message));
    await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2 });
    await page.goto('http://localhost:8000/index.html' + hash, { waitUntil: 'load' });
    if (hash === '#motor') {
      const t0 = Date.now();
      await page.waitForFunction(() => /hloubka (1[4-9]|2\d)/.test(document.getElementById('engInfo').textContent), { timeout: 60000 }).catch(() => log.push('motor: timeout'));
      log.push('motor: ' + (Date.now() - t0) + ' ms, ' + await page.$eval('#engInfo', e => e.textContent) + ', ' + await page.$eval('#evText', e => e.textContent));
    } else await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: name + '.png' });
    await ctx.close();
  }
  fs.writeFileSync('nahled-log.txt', log.join('\n') + '\n');
  await browser.close();
})();
