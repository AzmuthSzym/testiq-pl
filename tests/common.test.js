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

// Te same liczby co w analysis/testiq_analysis/scoring.py (wartości wzorcowe
// policzone w Pythonie), żeby strona i analiza liczyły identycznie.
test('IQ: zgodność z analizą w Pythonie', () => {
  const r = T.toIQ(13, { n: 150, mean: 10, sd: 3 }, 0.8);
  assert.strictEqual(r.iq, 115);
  assert.deepStrictEqual([r.lo, r.hi], [102, 128]);
  assert.ok(Math.abs(r.se - 6.874229670082821) < 1e-9);
  assert.strictEqual(r.status, 'wstepna');
  assert.strictEqual(T.toIQ(13, { n: 500, mean: 10, sd: 3 }, 0.8).status, 'normy');
});

test('IQ: za mała próba albo brak rzetelności = brak wyniku', () => {
  assert.strictEqual(T.toIQ(13, { n: 99, mean: 10, sd: 3 }, 0.8), null);
  assert.strictEqual(T.toIQ(13, { n: 500, mean: 10, sd: 3 }, null), null);
});

test('wynik łączny: zgodność z analizą w Pythonie, przedział zawęża się z liczbą testów', () => {
  const t = (z, reliability) => ({ z, reliability, normSe: 0.1 });
  const c = T.composite([t(1.2, 0.85), t(0.4, 0.8), t(-0.3, 0.9)], [0.7, 0.7, 0.7]);
  assert.ok(Math.abs(c.z - 0.5333964609104419) < 1e-12);
  assert.ok(Math.abs(c.se - 0.28426762180748066) < 1e-12);
  assert.ok(Math.abs(c.reliability - 0.9242424242424242) < 1e-12);
  // jeden test = ten sam wynik co test
  const one = T.composite([{ z: 1, reliability: 0.84 }], [0.7]);
  assert.ok(Math.abs(one.z - 1) < 1e-12 && Math.abs(one.se - 0.4) < 1e-12);
  const ses = [1, 2, 3, 5].map((k) => T.composite(Array(k).fill({ z: 1, reliability: 0.8 }), Array(k).fill(0.7)).se);
  assert.deepStrictEqual([...ses].sort((a, b) => b - a), ses);
});

test('norma: grupa wieku, jeśli ma dość osób, inaczej cała próba', () => {
  const norms = { n: 500, mean: 10, sd: 3, byAge: [{ from: 20, to: 29, n: 150, mean: 11, sd: 2.5 }, { from: 30, to: 39, n: 40, mean: 9, sd: 3 }] };
  const year = new Date().getFullYear();
  assert.strictEqual(T.normFor(norms, year - 25).mean, 11);
  assert.strictEqual(T.normFor(norms, year - 35).mean, 10, 'grupa 30-39 za mała');
  assert.strictEqual(T.normFor(norms, null).mean, 10);
});
