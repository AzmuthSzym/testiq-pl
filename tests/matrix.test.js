// Matryce: jakość zadań, niezależna weryfikacja klucza i odporność na
// zgadywanie z samych opcji.
const test = require('node:test');
const assert = require('node:assert');
const M = require('../assets/matrix-core.js');

const SEEDS = ['matryce-v1', 'matryce-przyklad', ...Array.from({ length: 150 }, (_, i) => 'm-' + i)];
const ATTRS = ['shape', 'count', 'size', 'fill', 'angle', 'lines'];
const items = Object.fromEntries(SEEDS.map((s) => [s, M.generateItems(s, 16)]));
const all = () => SEEDS.flatMap((s) => items[s].map((it, i) => ({ seed: s, i, it })));

// ---------- weryfikator niezależny od generatora ----------
// Zamiast przewidywać brakującą wartość sprawdza każdą możliwą wartość:
// czy po jej wstawieniu cała matryca spełnia któryś typ reguły.
const CANDIDATES = {
  shape: [0, 1, 2, 3, 4, 5, 6], count: [1, 2, 3, 4], size: [0, 1, 2], fill: [0, 1, 2],
  angle: [0, 1, 2, 3, 4, 5, 6, 7], lines: Array.from({ length: 64 }, (_, i) => i),
};
const rowsOf = (v) => [v.slice(0, 3), v.slice(3, 6), v.slice(6, 9)];
const colsOf = (v) => [0, 1, 2].map((c) => [v[c], v[c + 3], v[c + 6]]);
const RULES = {
  wiersze_stałe: (v) => rowsOf(v).every((r) => r[0] === r[1] && r[1] === r[2]),
  kolumny_stałe: (v) => colsOf(v).every((c) => c[0] === c[1] && c[1] === c[2]),
  progresja: (v, attr) => {
    const d = (a, b) => (attr === 'angle' ? (((b - a) % 8) + 8) % 8 : b - a);
    const steps = rowsOf(v).flatMap((r) => [d(r[0], r[1]), d(r[1], r[2])]);
    return attr !== 'lines' && steps[0] !== 0 && steps.every((s) => s === steps[0]);
  },
  rozkład_trzech: (v) => {
    const sets = rowsOf(v).map((r) => [...r].sort((a, b) => a - b).join());
    return rowsOf(v).every((r) => new Set(r).size === 3) && sets.every((s) => s === sets[0]);
  },
  suma: (v, attr) => attr === 'lines' && rowsOf(v).every((r) => (r[0] | r[1]) === r[2]),
  różnica_symetryczna: (v, attr) => attr === 'lines' && rowsOf(v).every((r) => (r[0] ^ r[1]) === r[2]),
  odejmowanie: (v, attr) => attr === 'lines' && rowsOf(v).every((r) => (r[0] & ~r[1]) === r[2]),
  część_wspólna: (v, attr) => attr === 'lines' && rowsOf(v).every((r) => (r[0] & r[1]) === r[2]),
};
function validValues(attr, eight) {
  return CANDIDATES[attr].filter((x) => {
    const v = [...eight, x];
    return Object.values(RULES).some((rule) => rule(v, attr));
  });
}
function solve(it) {
  const valid = {};
  for (const a of ATTRS) valid[a] = validValues(a, it.cells.map((c) => c[a]));
  const matches = it.options.map((o, i) => (ATTRS.every((a) => valid[a].includes(o[a])) ? i : -1)).filter((i) => i >= 0);
  return { valid, matches };
}

test('komplet zadań, poziomy po 4', () => {
  for (const s of SEEDS) {
    assert.strictEqual(items[s].length, 16, s);
    assert.deepStrictEqual(items[s].map((it) => it.level), [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4], s);
  }
});

test('ten sam seed = te same zadania', () => {
  assert.deepStrictEqual(M.generateItems('matryce-v1', 16), items['matryce-v1']);
});

test('niezależny weryfikator: każda cecha ma jedną poprawną wartość, jedna opcja pasuje', () => {
  for (const { seed, i, it } of all()) {
    const { valid, matches } = solve(it);
    for (const a of ATTRS) assert.strictEqual(valid[a].length, 1, `${seed} #${i + 1} ${a}: ${valid[a]}`);
    assert.deepStrictEqual(matches, [it.answer], `${seed} #${i + 1}`);
  }
});

test('8 różnych opcji, komórki matrycy różne, żadna opcja nie kopiuje komórki', () => {
  for (const { seed, i, it } of all()) {
    const cellKeys = new Set(it.cells.map(M.cellKey));
    assert.ok(it.options.every((o) => !cellKeys.has(M.cellKey(o))), `${seed} #${i + 1}`);
    assert.strictEqual(new Set(it.options.map(M.cellKey)).size, 8, `${seed} #${i + 1}`);
    assert.strictEqual(new Set(it.cells.map(M.cellKey)).size, 8, `${seed} #${i + 1}`);
  }
});

test('odpowiedzi równo rozłożone na A–H', () => {
  for (const s of SEEDS) {
    const counts = new Array(8).fill(0);
    items[s].forEach((it) => counts[it.answer]++);
    assert.deepStrictEqual(counts, [2, 2, 2, 2, 2, 2, 2, 2], s);
  }
});

test('każda wartość cechy w opcjach występuje tak samo często (4 z 8)', () => {
  for (const { seed, i, it } of all()) {
    for (const a of ATTRS) {
      const freq = {};
      it.options.forEach((o) => { freq[o[a]] = (freq[o[a]] || 0) + 1; });
      const counts = Object.values(freq);
      assert.ok(counts.length === 1 || counts.every((c) => c === 4), `${seed} #${i + 1} ${a}: ${JSON.stringify(freq)}`);
    }
  }
});

test('poziom 4: każda operacja na odcinkach (suma, różnica symetryczna, odejmowanie)', () => {
  for (const s of SEEDS) {
    const ops = new Set(items[s].filter((it) => it.level === 4).map((it) => it.plan.lines));
    assert.strictEqual(ops.size, 3, `${s}: ${[...ops]}`);
  }
});

// ---------- zgadywanie bez rozwiązywania ----------
// Strategia daje punktację opcjom; zwycięzcy (remis = losowanie) i oczekiwana trafność.
function hitRate(strategy) {
  let hits = 0, n = 0;
  for (const { it } of all()) {
    const scores = strategy(it);
    const best = Math.max(...scores);
    const winners = scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
    hits += winners.includes(it.answer) ? 1 / winners.length : 0;
    n++;
  }
  return hits / n;
}
const STRATEGIES = {
  // znana z literatury: wybierz opcję, której cechy najczęściej powtarzają się wśród opcji
  'najczęstsze cechy': (it) => it.options.map((o) => ATTRS.reduce((acc, a) =>
    acc + it.options.filter((p) => p[a] === o[a]).length, 0)),
  'najpodobniejsza do pozostałych': (it) => it.options.map((o, i) => it.options.reduce((acc, p, j) =>
    acc + (i === j ? 0 : ATTRS.filter((a) => p[a] === o[a]).length), 0)),
  'najmniej podobna (inna niż wszystkie)': (it) => it.options.map((o, i) => -it.options.reduce((acc, p, j) =>
    acc + (i === j ? 0 : ATTRS.filter((a) => p[a] === o[a]).length), 0)),
  'odrzuć wartości spoza matrycy': (it) => it.options.map((o) => ATTRS.every((a) => it.cells.some((c) => c[a] === o[a])) ? 1 : 0),
  'odrzuć kopie komórek matrycy': (it) => it.options.map((o) => (it.cells.some((c) => M.cellKey(c) === M.cellKey(o)) ? 0 : 1)),
  'najczęstsze wartości w matrycy': (it) => it.options.map((o) => ATTRS.reduce((acc, a) =>
    acc + it.cells.filter((c) => c[a] === o[a]).length, 0)),
  'jak komórka nad pustym polem': (it) => it.options.map((o) => ATTRS.filter((a) => o[a] === it.cells[5][a]).length),
  'jak komórka obok pustego pola': (it) => it.options.map((o) => ATTRS.filter((a) => o[a] === it.cells[7][a]).length),
};
// Każda strategia także odwrotnie: jeśli coś zawsze wskazuje źle, odwrotność wskazuje dobrze.
for (const [name, fn] of Object.entries({ ...STRATEGIES })) {
  if (name.startsWith('odrzuć') || name.startsWith('najmniej') || name.includes('w matrycy')) continue;
  STRATEGIES['odwrotność: ' + name] = (it) => fn(it).map((x) => -x);
}

// Liczenie wartości w matrycy (wybierz opcję z wartościami najrzadszymi w
// matrycy) to inny sposób zastosowania reguł stałości i rozkładu trzech:
// każda wartość występuje w pełnej matrycy 3 razy. Poziom 1 składa się
// tylko z takich reguł, więc liczenie go rozwiązuje. Od poziomu 2 każde
// zadanie ma progresję albo działanie na odcinkach, których liczenie nie
// rozwiązuje: zostaje wybór mniej więcej między dwiema opcjami.
const counting = (it) => it.options.map((o) => -ATTRS.reduce((acc, a) =>
  acc + it.cells.filter((c) => c[a] === o[a]).length, 0));
function hitRateAt(strategy, level) {
  let hits = 0, n = 0;
  for (const { it } of all()) {
    if (it.level !== level) continue;
    const scores = strategy(it);
    const best = Math.max(...scores);
    const winners = scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
    hits += winners.includes(it.answer) ? 1 / winners.length : 0;
    n++;
  }
  return hits / n;
}
test('liczenie wartości w matrycy nie rozwiązuje poziomów 2–4', () => {
  for (const level of [2, 3, 4]) {
    const rate = hitRateAt(counting, level);
    assert.ok(rate <= 0.7, `poziom ${level}: ${(rate * 100).toFixed(1)}%`);
  }
});

if (process.env.SHOW_RATES) {
  for (const [name, strategy] of Object.entries(STRATEGIES)) console.log(name.padEnd(42), (hitRate(strategy) * 100).toFixed(1) + '%');
}
for (const [name, strategy] of Object.entries(STRATEGIES)) {
  test(`zgadywanie „${name}” nie daje istotnej przewagi (losowo 12,5%)`, () => {
    const rate = hitRate(strategy);
    // losowo 12,5%; „najmniej podobna do komórki obok” daje ok. 18%, bo poprawna
    // wartość cechy stałej w kolumnie różni się od komórki obok z definicji
    assert.ok(rate < 0.2, `${(rate * 100).toFixed(1)}%`);
  });
}

module.exports = { hitRate, STRATEGIES };
