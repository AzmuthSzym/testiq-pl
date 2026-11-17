// Zdania: kolejność zadań i opcji, poprawność banku zadań.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const S = require('../assets/sentence-core.js');

const bank = [];
for (const level of [1, 2, 3]) {
  for (let k = 0; k < 5; k++) {
    bank.push({ level, sentence: `Zdanie ${level}${k} z ___ w środku.`, answer: `ok${level}${k}`,
      distractors: [1, 2, 3, 4].map((d) => `zle${level}${k}${d}`) });
  }
}

test('pusty albo błędny bank = brak testu', () => {
  assert.strictEqual(S.buildItems([], 's'), null);
  assert.strictEqual(S.buildItems(null, 's'), null);
  assert.strictEqual(S.buildItems([{ level: 1, sentence: 'bez luki', answer: 'a', distractors: ['b', 'c', 'd', 'e'] }], 's'), null);
});

test('od łatwych do trudnych, ten sam seed = ta sama kolejność', () => {
  const items = S.buildItems(bank, 'zdania-v1');
  assert.deepStrictEqual(items.map((it) => it.level), [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3]);
  assert.deepStrictEqual(S.buildItems(bank, 'zdania-v1'), items);
  assert.deepStrictEqual(S.buildItems(bank.slice().reverse(), 'zdania-v1'), items, 'kolejność w banku bez znaczenia');
});

test('klucz wskazuje poprawne słowo, odpowiedzi równo na A–E', () => {
  const counts = [0, 0, 0, 0, 0];
  for (const it of S.buildItems(bank, 'x')) {
    const src = bank.find((b) => it.before === b.sentence.split('___')[0]);
    assert.strictEqual(it.options[it.answer], src.answer);
    assert.deepStrictEqual([...it.options].sort(), [src.answer, ...src.distractors].sort());
    counts[it.answer]++;
  }
  assert.deepStrictEqual(counts, [3, 3, 3, 3, 3]);
});

test('opublikowany bank zdania/items.json: 25 zadań, jedna luka, 5 różnych opcji', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'zdania', 'items.json'), 'utf8'));
  assert.strictEqual(data.items.length, 25);
  for (const it of data.items) {
    assert.strictEqual(it.sentence.split('___').length, 2, it.sentence);
    assert.strictEqual(new Set([it.answer, ...it.distractors]).size, 5, it.sentence);
  }
  const items = S.buildItems(data.items, 'zdania-v1');
  const counts = [0, 0, 0, 0, 0];
  items.forEach((it) => counts[it.answer]++);
  assert.deepStrictEqual(counts, [5, 5, 5, 5, 5]);
});
