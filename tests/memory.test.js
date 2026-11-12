// Pamięć robocza: ciągi cyfr, klucz, reguła przerwania, zakres pamięci.
const test = require('node:test');
const assert = require('node:assert');
const MC = require('../assets/memory-core.js');

const SEEDS = ['pamiec-v1', 'pamiec-przyklad', ...Array.from({ length: 200 }, (_, i) => 'p-' + i)];

test('układ testu: 2 części, po 2 próby na długość', () => {
  const items = MC.generateItems('pamiec-v1');
  assert.strictEqual(items.length, 28);
  assert.deepStrictEqual(items.filter((it) => it.part === 1).map((it) => it.length), [3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9]);
  assert.deepStrictEqual(items.filter((it) => it.part === 2).map((it) => it.length), [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8]);
  assert.deepStrictEqual(MC.generateItems('pamiec-v1'), items, 'ten sam seed');
});

test('cyfry 1–9 bez powtórzeń i bez ciągów typu 3-4-5', () => {
  for (const s of SEEDS) for (const it of MC.generateItems(s)) {
    assert.strictEqual(it.digits.length, it.length);
    assert.strictEqual(new Set(it.digits).size, it.length, `${s}: ${it.digits}`);
    assert.ok(it.digits.every((d) => d >= 1 && d <= 9));
    for (let i = 2; i < it.digits.length; i++) {
      const a = it.digits[i - 1] - it.digits[i - 2], b = it.digits[i] - it.digits[i - 1];
      assert.ok(!(a === b && Math.abs(a) === 1), `${s}: ${it.digits}`);
    }
  }
  assert.ok(MC.hasRun([5, 3, 4, 5]) && MC.hasRun([9, 8, 7]) && !MC.hasRun([1, 3, 5]) && !MC.hasRun([2, 3, 2]));
});

test('klucz: w przód te same cyfry, wspak odwrócone', () => {
  for (const s of SEEDS) for (const it of MC.generateItems(s)) {
    const expected = it.part === 1 ? it.digits.join('') : [...it.digits].reverse().join('');
    assert.strictEqual(it.answer, expected);
    assert.ok(MC.isCorrect(it.answer.split('').join(' '), it), 'spacje pomijane');
    assert.ok(!MC.isCorrect(it.answer.slice(1), it), 'brak cyfry = błąd');
  }
});

test('ciągi w teście się nie powtarzają', () => {
  const items = MC.generateItems('pamiec-v1');
  assert.strictEqual(new Set(items.map((it) => it.digits.join(''))).size, items.length);
});

test('reguła przerwania: dwa błędy na jednej długości kończą część', () => {
  const items = MC.generateItems('pamiec-v1');
  const r = (i, correct) => ({ item: i + 1, correct });
  // część 1: długość 3 dobrze, długość 4 obie źle -> przeskok do części 2 (indeks 14)
  const res = [r(0, true), r(1, true), r(2, false), r(3, false)];
  assert.strictEqual(MC.nextIndex(res, items, 4), 14);
  // jedna próba dobra -> idziemy dalej
  assert.strictEqual(MC.nextIndex([r(0, true), r(1, true), r(2, false), r(3, true)], items, 4), 4);
  // po pierwszej błędnej próbie jeszcze nie przerywamy
  assert.strictEqual(MC.nextIndex([r(0, false)], items, 1), 1);
  // część 2: obie próby długości 2 źle -> koniec testu
  const res2 = [...res, r(14, false), r(15, false)];
  assert.strictEqual(MC.nextIndex(res2, items, 16), items.length);
});

test('zakres pamięci: najdłuższy poprawnie odtworzony ciąg w części', () => {
  const items = MC.generateItems('pamiec-v1');
  const res = [0, 1, 2, 3, 4].map((i) => ({ item: i + 1, correct: i !== 4 })).concat([{ item: 15, correct: true }]);
  // długości: 3, 3, 4, 4, 5(źle) -> zakres 4; część 2: długość 2
  assert.strictEqual(MC.span(res, items, 1), 4);
  assert.strictEqual(MC.span(res, items, 2), 2);
  assert.strictEqual(MC.span([], items, 1), 0);
});
