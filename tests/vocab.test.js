// Słownictwo: wybór zadań z zatwierdzonej listy i kolejność opcji.
const test = require('node:test');
const assert = require('node:assert');
const V = require('../assets/vocab-core.js');

const bank = [];
for (const band of [1, 2, 3, 4]) {
  for (let k = 0; k < 8; k++) {
    bank.push({ band, word: `slowo${band}${k}`, synonym: `syn${band}${k}`,
      distractors: [1, 2, 3, 4].map((d) => `dys${band}${k}${d}`) });
  }
}

test('za mało zatwierdzonych zadań = test niedostępny', () => {
  assert.strictEqual(V.buildItems([], 's'), null);
  assert.strictEqual(V.buildItems(bank.filter((it) => it.band !== 4), 's'), null);
});

test('po 5 zadań z każdego pasma, od łatwych do trudnych', () => {
  const items = V.buildItems(bank, 'slownictwo-v1');
  assert.strictEqual(items.length, 20);
  assert.deepStrictEqual(items.map((it) => it.level), [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4]);
  assert.deepStrictEqual(V.buildItems(bank, 'slownictwo-v1'), items, 'ten sam seed');
});

test('klucz wskazuje synonim, opcje to synonim i 4 dystraktory', () => {
  for (const it of V.buildItems(bank, 'x')) {
    const src = bank.find((b) => b.word === it.word);
    assert.strictEqual(it.options[it.answer], src.synonym);
    assert.deepStrictEqual([...it.options].sort(), [src.synonym, ...src.distractors].sort());
  }
});

test('poprawne odpowiedzi równo na A–E', () => {
  const counts = [0, 0, 0, 0, 0];
  V.buildItems(bank, 'y').forEach((it) => counts[it.answer]++);
  assert.deepStrictEqual(counts, [4, 4, 4, 4, 4]);
});

test('kolejność w banku nie zmienia wyboru (zależy tylko od ziarna i treści)', () => {
  assert.deepStrictEqual(V.buildItems([...bank].reverse(), 'z'), V.buildItems(bank, 'z'));
});
