// Ciągi liczbowe: jakość zadań i niezależna weryfikacja jednoznaczności.
const test = require('node:test');
const assert = require('node:assert');
const S = require('../assets/series-core.js');

const SEEDS = ['ciagi-v1', 'ciagi-przyklad', ...Array.from({ length: 200 }, (_, i) => 's-' + i)];
const items = Object.fromEntries(SEEDS.map((s) => [s, S.generateItems(s, 16)]));
const all = () => SEEDS.flatMap((s) => items[s].map((it, i) => ({ seed: s, i, it })));

// ---------- weryfikator niezależny od generatora ----------
// Ogólne rodziny reguł zamiast katalogu (po 3 parametry, żeby przy 6 wyrazach
// zostały co najmniej dwa równania do sprawdzenia; rodzina z 4 parametrami
// dopasowałaby się do niemal każdych 6 liczb):
//   A: t[k+1] = a·t[k] + c + d·k            (a ∈ −3..3, d ∈ −5..5)
//   B: t[k+1] = a·t[k] + b·t[k-1] + c       (a, b ∈ −3..3, b ≠ 0)
// oraz dwa działania na zmianę (kroki parzyste / nieparzyste: +c albo ×a),
// przeplatanie dwóch podciągów (każdy: +c albo ×a) i mnożenie przez ułamek.
// Zwraca zbiór przewidywań wszystkich pasujących reguł.
function fitsRecurrence(t) {
  const out = new Set();
  const n = t.length - 1;
  for (let a = -3; a <= 3; a++) for (let d = -5; d <= 5; d++) {
    const c = t[1] - a * t[0];
    let ok = true;
    for (let k = 1; k < n && ok; k++) ok = t[k + 1] === a * t[k] + c + d * k;
    if (ok) out.add(a * t[n] + c + d * n);
  }
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
    if (b === 0) continue;
    const c = t[2] - a * t[1] - b * t[0];
    let ok = true;
    for (let k = 2; k < n && ok; k++) ok = t[k + 1] === a * t[k] + b * t[k - 1] + c;
    if (ok) out.add(a * t[n] + b * t[n - 1] + c);
  }
  return out;
}
// Jedno działanie z jednym parametrem dla par (x, y): y = x + c albo y = a·x.
// (Przy dwóch parametrach, np. y = a·x + c, trzy wyrazy pasują zawsze, więc
// taka reguła niczego by nie sprawdzała.)
function simpleOpFits(pairs) {
  const out = [];
  const c = pairs[0][1] - pairs[0][0];
  if (pairs.every(([x, y]) => y === x + c)) out.push((x) => x + c);
  for (let a = -3; a <= 3; a++) {
    if (a === 0 || a === 1) continue;
    if (pairs.every(([x, y]) => y === a * x)) out.push((x) => a * x);
  }
  return out;
}
function fitsAlternating(t) {
  const out = new Set();
  const byParity = [0, 1].map((p) => {
    const pairs = [];
    for (let i = p; i + 1 < t.length; i += 2) pairs.push([t[i], t[i + 1]]);
    return pairs.length >= 2 ? simpleOpFits(pairs) : [];
  });
  const p = (t.length - 1) % 2;
  if (byParity[0].length && byParity[1].length) for (const f of byParity[p]) out.add(f(t[t.length - 1]));
  return out;
}
function fitsInterleaved(t) {
  const out = new Set();
  const next = t.filter((_, i) => i % 2 === t.length % 2);
  const other = t.filter((_, i) => i % 2 !== t.length % 2);
  const pairs = (s) => s.slice(1).map((y, i) => [s[i], y]);
  if (next.length < 3 || other.length < 3 || !simpleOpFits(pairs(other)).length) return out;
  for (const f of simpleOpFits(pairs(next))) out.add(f(next[next.length - 1]));
  return out;
}
// mnożenie przez ułamek: t[k+1] = t[k] · p/q
function fitsRatio(t) {
  const out = new Set();
  for (const [p, q] of [[1, 2], [1, 3], [2, 3], [3, 2], [1, 4]]) {
    if (t.slice(1).every((x, i) => x * q === t[i] * p)) out.add(t[t.length - 1] * p / q);
  }
  return out;
}
function solve(shown) {
  return new Set([...fitsRecurrence(shown), ...fitsAlternating(shown), ...fitsInterleaved(shown), ...fitsRatio(shown)]);
}

test('komplet zadań, poziomy po 4, każda reguła poziomu się pojawia', () => {
  for (const s of SEEDS) {
    assert.strictEqual(items[s].length, 16, s);
    assert.deepStrictEqual(items[s].map((it) => it.level), [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4], s);
    for (const lv of [1, 2, 3, 4]) {
      const rules = new Set(items[s].filter((it) => it.level === lv).map((it) => it.rule));
      assert.deepStrictEqual([...rules].sort(), [...S.LEVEL_RULES[lv]].sort(), `${s} poziom ${lv}`);
    }
  }
});

test('ten sam seed = te same zadania', () => {
  assert.deepStrictEqual(S.generateItems('ciagi-v1', 16), items['ciagi-v1']);
});

test('liczby całkowite w rozsądnym zakresie, ciąg się zmienia', () => {
  for (const { seed, i, it } of all()) {
    for (const x of [...it.shown, it.answer]) {
      assert.ok(Number.isInteger(x) && Math.abs(x) <= S.MAX_ABS, `${seed} #${i + 1}: ${x}`);
    }
    assert.ok(new Set(it.shown).size >= 4, `${seed} #${i + 1}`);
  }
});

test('niezależny weryfikator: reguła generatora pasuje, a każda pasująca reguła daje tę samą odpowiedź', () => {
  const problems = [];
  for (const { seed, i, it } of all()) {
    const preds = solve(it.shown);
    if (!preds.has(it.answer)) problems.push(`${seed} #${i + 1} (${it.rule}): weryfikator nie znalazł reguły`);
    else if (preds.size !== 1) problems.push(`${seed} #${i + 1} (${it.rule}) ${it.shown}: też ${[...preds].filter((p) => p !== it.answer)}`);
  }
  assert.deepStrictEqual(problems.slice(0, 10), []);
});

test('naiwne przedłużenie (powtórz ostatnią różnicę) prawie nigdy nie działa poza ciągami arytmetycznymi', () => {
  let hits = 0, n = 0;
  for (const { it } of all()) {
    if (it.rule === 'arytmetyczny') continue;
    const k = it.shown.length;
    hits += it.shown[k - 1] + (it.shown[k - 1] - it.shown[k - 2]) === it.answer ? 1 : 0;
    n++;
  }
  assert.ok(hits / n < 0.01, `${hits} z ${n}`);
});

test('ciągi typu Fibonacci nie zaczynają się od znanego ciągu Fibonacciego', () => {
  const FIB = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];
  for (const { seed, i, it } of all()) {
    if (it.rule !== 'fibonacci') continue;
    const start = FIB.findIndex((x, k) => x === it.shown[0] && FIB[k + 1] === it.shown[1]);
    assert.strictEqual(start, -1, `${seed} #${i + 1}: ${it.shown}`);
  }
});

test('wpisana odpowiedź: spacje, minus typograficzny, śmieci', () => {
  assert.strictEqual(S.parseAnswer(' 1 024 '), 1024);
  assert.strictEqual(S.parseAnswer('−12'), -12);
  assert.strictEqual(S.parseAnswer('-7'), -7);
  assert.strictEqual(S.parseAnswer('12a'), null);
  assert.strictEqual(S.parseAnswer(''), null);
  assert.strictEqual(S.parseAnswer('1.5'), null);
});
