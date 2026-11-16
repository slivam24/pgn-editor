// Kontrola sbírky úloh (app/src/main/assets/www/vyuka/ulohy.txt): každá úloha musí jít zahrát
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { Chess } = require('../app/src/main/assets/www/chess.js');

const lines = fs.readFileSync(path.join(__dirname, '..', 'app', 'src', 'main', 'assets', 'www', 'vyuka', 'ulohy.txt'), 'utf8').trim().split('\n');

test('sbírka má úlohy pro všechny úrovně', () => {
  assert.ok(lines.length > 5000, 'úloh: ' + lines.length);
  const ratings = lines.map(l => +l.split('|')[3]);
  for (const [a, b] of [[400, 800], [800, 1200], [1200, 1600], [1600, 2000], [2000, 2300], [2300, 3000]]) {
    assert.ok(ratings.filter(r => r >= a && r < b).length >= 200, 'málo úloh v pásmu ' + a + '–' + b);
  }
});

test('každá úloha má platnou pozici a všechny tahy jdou zahrát', () => {
  const ids = new Set();
  for (const line of lines) {
    const [id, fen, moves, rating, themes] = line.split('|');
    assert.ok(/^[A-Za-z0-9]{5}$/.test(id), 'id ' + id);
    assert.ok(!ids.has(id), 'dvakrát ' + id); ids.add(id);
    assert.ok(+rating >= 300 && +rating <= 3200, 'obtížnost ' + id);
    assert.ok(/^(\d+(,\d+)*)?$/.test(themes), 'témata ' + id);
    const c = new Chess(fen + ' 0 1');
    assert.ok(new Chess().validate_fen(fen + ' 0 1').valid, 'pozice ' + id);
    const mv = moves.split(' ');
    assert.ok(mv.length >= 2 && mv.length % 2 === 0, 'počet tahů ' + id);
    for (const u of mv) {
      assert.ok(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || 'q' }), 'tah ' + u + ' v úloze ' + id);
    }
  }
});
