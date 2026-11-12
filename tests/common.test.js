// Wspólny moduł: centyle i margines błędu na ekranie wyniku.
const test = require('node:test');
const assert = require('node:assert');
const T = require('../assets/testiq-common.js');

test('centyl liczy połowę remisów', () => {
  // 10 osób: po 5 z wynikiem 1 i 2
  const r = T.percentile([0, 5, 5], 2);
  assert.strictEqual(r.n, 10);
  assert.strictEqual(r.p, 0.75); // 5 poniżej + 5/2 równych
  assert.ok(Math.abs(r.margin - 1.96 * Math.sqrt(0.75 * 0.25 / 10)) < 1e-12);
});

test('skrajne wyniki', () => {
  assert.strictEqual(T.percentile([3, 0, 0], 0).p, 0.5);
  assert.strictEqual(T.percentile([3, 0, 0], 2).p, 1);
  assert.strictEqual(T.percentile([0, 0], 1).n, 0);
});

test('próg pokazywania rozkładu', () => {
  assert.strictEqual(T.MIN_N, 30);
});
