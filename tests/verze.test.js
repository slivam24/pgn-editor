// Číslo verze je na třech místech (sestavení, O aplikaci, Verze a změny). Test hlídá, že se shodují.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const gradle = fs.readFileSync(path.join(root, 'app', 'build.gradle'), 'utf8');
const html = fs.readFileSync(path.join(root, 'app', 'src', 'main', 'assets', 'www', 'index.html'), 'utf8');

test('číslo verze je všude stejné', () => {
  const name = /versionName '([^']+)'/.exec(gradle)[1];
  const code = +/versionCode (\d+)/.exec(gradle)[1];
  const about = /<span class="ver-badge">verze ([^<]+)<\/span>/.exec(html)[1];
  const log = /<div class="head"><span class="ver-badge">([^<]+)<\/span>/.exec(html)[1];
  assert.equal(about, name, 'O aplikaci a app/build.gradle');
  assert.equal(log, name, 'první záznam ve Verze a změny a app/build.gradle');
  assert.equal(code, Math.round(+name * 100), 'versionCode má odpovídat číslu verze (0.20 = 20)');
});
