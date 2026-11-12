// Jakość zadań „Obracanie kostki” (assets/cube-core.js) i zgodność klucza
// z niezależnym weryfikatorem (tests/cube-verifier.js).
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const C = require('../assets/cube-core.js');
const V = require('./cube-verifier.js');

// Dodatkowe ziarna, żeby sprawdzić generator, a nie tylko jedną wersję testu.
const EXTRA_SEEDS = Array.from({ length: 150 }, (_, i) => 'losowe-' + i);
const V2_SEEDS = ['kostka-v2', ...EXTRA_SEEDS];
const ALL = ['kostka-v1', 'kostka-przyklad', ...V2_SEEDS];

const keyR = (R) => R.map((v) => v.join(',')).join(';');
const endOf = (it) => it.moves.reduce((R, m) => C.applyMove(R, C.MOVES[m]), it.start);

// Wersja generatora jak na stronie: kostka-v1 = 1, reszta = 2.
function itemsFor(seed, count = 20) {
  return C.generateItems(seed, count, { version: seed === 'kostka-v1' ? 1 : 2 });
}

test('generator zwraca komplet zadań', () => {
  for (const seed of ALL) assert.strictEqual(itemsFor(seed).length, 20, seed);
});

test('ten sam seed = te same zadania', () => {
  assert.deepStrictEqual(itemsFor('kostka-v2'), itemsFor('kostka-v2'));
});

test('v1 bez zmian (stare wyniki da się odtworzyć)', () => {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify(C.generateItems('kostka-v1', 20)));
  h.update(JSON.stringify(C.generateItems('kostka-przyklad', 4)));
  assert.strictEqual(h.digest('hex'), '679dc7f89657f243b7f3fc465e7b509196e0941fd7f8b438ea8e497d14ec6242');
});

test('poprawna odpowiedź jest jedyna, a dystraktory są różne', () => {
  for (const seed of ALL) itemsFor(seed).forEach((it, i) => {
    const sigs = it.options.map((R) => C.signature(R, it.faces));
    const correct = C.signature(endOf(it), it.faces);
    assert.strictEqual(new Set(sigs).size, 6, `${seed} #${i + 1}: powtórzone opcje`);
    assert.strictEqual(sigs[it.answer], correct, `${seed} #${i + 1}: klucz`);
    assert.strictEqual(sigs.filter((s) => s === correct).length, 1, `${seed} #${i + 1}`);
  });
});

test('każda opcja pokazuje co najmniej jeden symbol', () => {
  for (const seed of ALL) itemsFor(seed).forEach((it, i) => {
    for (const R of it.options) {
      assert.ok(C.visibleFaces(R, it.faces).some((f) => f.symbol !== null), `${seed} #${i + 1}`);
    }
  });
});

test('ruchy nie znoszą się do zera', () => {
  for (const seed of ALL) itemsFor(seed).forEach((it, i) => {
    assert.notStrictEqual(keyR(endOf(it)), keyR(it.start), `${seed} #${i + 1}: wypadkowo brak obrotu`);
    assert.notStrictEqual(C.signature(endOf(it), it.faces), C.signature(it.start, it.faces), `${seed} #${i + 1}`);
  });
});

test('parzystość: po n ćwierćobrotach największa możliwa odległość to fullDistance(n)', () => {
  // Uzasadnienie reguły wersji 2, sprawdzone wprost na wszystkich sekwencjach.
  const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let n = 1; n <= 4; n++) {
    const dists = new Set();
    const walk = (R, k) => {
      if (k === n) { dists.add(C.minMoves(I, R)); return; }
      for (const m of C.MOVES) walk(C.applyMove(R, m), k + 1);
    };
    walk(I, 0);
    assert.strictEqual(Math.max(...dists), C.fullDistance(n), `n=${n}: ${[...dists]}`);
  }
});

test('v2: żadne ruchy się nie znoszą ani nie skracają', () => {
  // Zadanie oznaczone jako "3 obroty", które da się zastąpić jednym, jest
  // w rzeczywistości łatwiejsze, niż sugeruje poziom.
  for (const seed of V2_SEEDS) itemsFor(seed).forEach((it, i) => {
    const d = C.minMoves(it.start, endOf(it));
    assert.strictEqual(d, C.fullDistance(it.moves.length), `${seed} #${i + 1}: ${it.moves.length} ruchy, a wystarczy ${d}`);
  });
});

test('poprawne odpowiedzi równo rozłożone na A–F', () => {
  for (const seed of ALL) {
    const items = itemsFor(seed);
    const counts = [0, 0, 0, 0, 0, 0];
    items.forEach((it) => counts[it.answer]++);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${seed}: ${counts}`);
    const first18 = [0, 0, 0, 0, 0, 0];
    items.slice(0, 18).forEach((it) => first18[it.answer]++);
    assert.deepStrictEqual(first18, [3, 3, 3, 3, 3, 3], `${seed}: pierwsze 18 zadań`);
  }
});

test('poziomy: po 5 zadań z 1, 2, 3 i 4 ruchami', () => {
  for (const seed of ALL) {
    assert.deepStrictEqual(itemsFor(seed).map((it) => it.moves.length),
      [1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4], seed);
  }
});

test('niezależny weryfikator potwierdza klucz', () => {
  for (const seed of ALL) itemsFor(seed).forEach((it, i) => {
    const r = V.solve(C.visibleFaces(it.start, it.faces), it.moves,
      it.options.map((R) => C.visibleFaces(R, it.faces)));
    assert.deepStrictEqual(r.matches, [it.answer], `${seed} #${i + 1}: weryfikator wskazuje ${r.matches}`);
  });
});

test('weryfikator: numery ruchów znaczą to samo co w generatorze', () => {
  // Bez tego zgodność klucza mogłaby wynikać z tego samego błędu w obu programach.
  const lbl = (v) => { const k = v.findIndex((x) => x !== 0); return (v[k] > 0 ? '+' : '-') + 'XYZ'[k]; };
  C.MOVES.forEach((m, i) => {
    assert.strictEqual(V.MOVE_TABLE[i].from, lbl(m.n));
    assert.strictEqual(V.MOVE_TABLE[i].to, lbl(m.d));
  });
});

test('weryfikator: cztery takie same ruchy wracają do stanu wyjścia', () => {
  const s0 = [{ symbol: 0, at: '+X', right: '+Y' }, { symbol: 1, at: '+Y', right: '+Z' }];
  for (let m = 0; m < 6; m++) {
    let s = s0;
    for (let k = 0; k < 4; k++) s = V.applyMove(s, m);
    assert.deepStrictEqual(s, s0, V.MOVE_TABLE[m].opis);
    assert.notDeepStrictEqual(V.applyMove(s0, m), s0);
  }
  // góra do przodu: górna ścianka ląduje z przodu
  const top = V.applyMove([{ symbol: 2, at: '+Y', right: '+X' }], 0)[0];
  assert.deepStrictEqual([top.at, top.right], ['+Z', '+X']);
});
