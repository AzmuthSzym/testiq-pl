// Logika zadań „Ciągi liczbowe” — bez zależności, działa w przeglądarce i w Node.
//
// Uczestnik widzi kilka wyrazów ciągu i wpisuje następny. Reguły (od łatwych):
//   poziom 1: arytmetyczny (+d), geometryczny (×r albo :r)
//   poziom 2: różnice rosną o stałą (drugiego rzędu), dwa działania na zmianę (+a, ×b)
//   poziom 3: dwa ciągi przeplatane, każdy wyraz sumą dwóch poprzednich
//   poziom 4: różnice tworzą ciąg geometryczny, przeplatane: arytmetyczny z geometrycznym
//
// Ciąg zawsze da się formalnie kontynuować na wiele sposobów, więc generator
// odrzuca zadania, w których któraś inna prosta reguła z katalogu
// (ambiguousNext) pasuje do pokazanych wyrazów, a daje inną odpowiedź.
(function (root) {
  'use strict';

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h >>> 0;
  }

  const MAX_ABS = 999;
  const SHOWN = 6;

  // Każdy generator reguły zwraca n+1 wyrazów (ostatni = odpowiedź) i opis.
  const RULES = {
    arytmetyczny: (R, n) => {
      const d = R.pick([2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, -3, -4, -6, -7, -9]);
      const a = d > 0 ? R.range(1, 40) : R.range(60, 120);
      return { terms: seq(n + 1, (k) => a + k * d), desc: `+${d}`.replace('+-', '−') };
    },
    geometryczny: (R, n) => {
      if (R.rnd() < 0.5) {
        const r = R.pick([2, 3]);
        const a = r === 2 ? R.range(1, 7) : R.range(1, 3);
        return { terms: seq(n + 1, (k) => a * r ** k), desc: `×${r}` };
      }
      const r = 2;
      const a = R.pick([1, 3, 5, 7]) * r ** n;
      return { terms: seq(n + 1, (k) => a / r ** k), desc: `:${r}` };
    },
    drugiego_rzędu: (R, n) => {
      const d0 = R.range(1, 6), e = R.pick([1, 2, 3]);
      const a = R.range(1, 20);
      const t = [a];
      for (let k = 0; k < n; k++) t.push(t[k] + d0 + k * e);
      return { terms: t, desc: `różnice +${e}` };
    },
    na_zmianę: (R, n) => {
      const p = R.range(1, 6), m = R.pick([2, 3]);
      const t = [R.range(1, 5)];
      const addFirst = R.rnd() < 0.5;
      for (let k = 0; k < n; k++) t.push((k % 2 === 0) === addFirst ? t[k] + p : t[k] * m);
      return { terms: t, desc: addFirst ? `+${p}, ×${m}` : `×${m}, +${p}` };
    },
    przeplatane: (R, n) => {
      const a = R.range(1, 30), d = R.pick([2, 3, 4, 5, 6, 7]);
      const b = R.range(30, 90), e = R.pick([-2, -3, -4, -5, -6, 3, 4]);
      return { terms: seq(n + 1, (k) => (k % 2 === 0 ? a + (k / 2) * d : b + ((k - 1) / 2) * e)), desc: 'przeplatane' };
    },
    fibonacci: (R, n) => {
      // bez początków z prawdziwego ciągu Fibonacciego (1, 2, 3, 5, 8…):
      // znany na pamięć ciąg mierzyłby wiedzę, a nie rozumowanie
      const FIB = [1, 1, 2, 3, 5, 8, 13];
      let t;
      do t = [R.range(1, 6), R.range(1, 9)];
      while (FIB.some((x, i) => i + 1 < FIB.length && x === t[0] && FIB[i + 1] === t[1]));
      while (t.length < n + 1) t.push(t[t.length - 1] + t[t.length - 2]);
      return { terms: t, desc: 'suma dwóch poprzednich' };
    },
    różnice_geometryczne: (R, n) => {
      const r = 2, c = R.range(1, 3);
      const t = [R.range(1, 20)];
      for (let k = 0; k < n; k++) t.push(t[k] + c * r ** k);
      return { terms: t, desc: `różnice ×${r}` };
    },
    przeplatane_mieszane: (R, n) => {
      const a = R.range(1, 4), r = 2;
      const b = R.range(10, 40), d = R.pick([3, 4, 5, -3, -4]);
      return { terms: seq(n + 1, (k) => (k % 2 === 0 ? a * r ** (k / 2) : b + ((k - 1) / 2) * d)), desc: 'przeplatane: ×2 i +d' };
    },
  };
  const LEVEL_RULES = {
    1: ['arytmetyczny', 'geometryczny'],
    2: ['drugiego_rzędu', 'na_zmianę'],
    3: ['przeplatane', 'fibonacci'],
    4: ['różnice_geometryczne', 'przeplatane_mieszane'],
  };
  // Przeplatane ciągi potrzebują więcej wyrazów, żeby każdy ciąg było widać.
  const shownFor = (rule) => (rule.startsWith('przeplatane') ? 8 : SHOWN);

  function seq(n, f) { return Array.from({ length: n }, (_, k) => f(k)); }

  // ---------- katalog reguł do sprawdzania jednoznaczności ----------
  // Każda funkcja dostaje pokazane wyrazy i zwraca przewidywany następny
  // wyraz albo null, jeśli reguła do nich nie pasuje.
  const isInt = (x) => Number.isInteger(x);
  function diffs(t) { return t.slice(1).map((x, i) => x - t[i]); }
  const CATALOG = {
    // wielomian stopnia ≤ 3 (różnice rzędu 1–3 stałe)
    wielomian: (t) => {
      let rows = [t];
      for (let order = 1; order <= 3 && rows[rows.length - 1].length > 2; order++) {
        const d = diffs(rows[rows.length - 1]);
        rows.push(d);
        if (d.length >= 2 && d.every((x) => x === d[0])) {
          // dopisz od dołu
          let next = d[0];
          for (let i = rows.length - 2; i >= 0; i--) next = rows[i][rows[i].length - 1] + next;
          return next;
        }
      }
      return null;
    },
    iloraz: (t) => {
      if (t.some((x) => x === 0)) return null;
      const q = t[1] / t[0];
      if (!t.slice(1).every((x, i) => x === t[i] * q)) return null;
      const next = t[t.length - 1] * q;
      return isInt(next) ? next : null;
    },
    // t[k+1] = p·t[k] + q (p, q wyznaczone z trzech pierwszych wyrazów)
    liniowa: (t) => {
      const den = t[1] - t[0];
      if (den === 0) return null;
      const p = (t[2] - t[1]) / den, q = t[1] - p * t[0];
      if (!isInt(p) || !isInt(q)) return null;
      if (!t.slice(1).every((x, i) => x === p * t[i] + q)) return null;
      return p * t[t.length - 1] + q;
    },
    fibonacci: (t) => (t.slice(2).every((x, i) => x === t[i] + t[i + 1]) ? t[t.length - 1] + t[t.length - 2] : null),
    // różnice tworzą ciąg geometryczny
    różnice_iloraz: (t) => {
      const d = diffs(t);
      const p = CATALOG.iloraz(d);
      return p === null ? null : t[t.length - 1] + p;
    },
    // dwa działania na zmianę: kroki parzyste i nieparzyste osobno (+a lub ×b)
    na_zmianę: (t) => {
      const step = (from, to) => [['+', to - from], ['×', from !== 0 ? to / from : NaN]];
      const ops = [0, 1].map((par) => {
        const pairs = [];
        for (let i = par; i + 1 < t.length; i += 2) pairs.push([t[i], t[i + 1]]);
        return step(...pairs[0]).filter(([op, v]) => isInt(v) && pairs.every(([a, b]) => (op === '+' ? a + v : a * v) === b));
      });
      if (!ops[0].length || !ops[1].length) return null;
      const par = (t.length - 1) % 2;
      const preds = ops[par].map(([op, v]) => (op === '+' ? t[t.length - 1] + v : t[t.length - 1] * v));
      return preds.length ? preds[0] : null;
    },
    // dwa przeplatane ciągi: każdy osobno pasuje do wielomianu albo ilorazu
    przeplatane: (t) => {
      const sub = t.filter((_, i) => i % 2 === t.length % 2);
      if (sub.length < 3) return null;
      const other = t.filter((_, i) => i % 2 !== t.length % 2);
      const ok = (s) => CATALOG.wielomian(s) !== null || CATALOG.iloraz(s) !== null;
      if (!ok(other)) return null;
      const p = CATALOG.wielomian(sub);
      return p !== null ? p : CATALOG.iloraz(sub);
    },
  };

  // Wszystkie różne przewidywania reguł z katalogu, które pasują do wyrazów.
  function ambiguousNext(shown) {
    const preds = new Set();
    for (const fn of Object.values(CATALOG)) {
      const p = fn(shown);
      if (p !== null && Number.isFinite(p)) preds.add(p);
    }
    return [...preds];
  }

  function generateItems(seedStr, count) {
    const rnd = mulberry32(hashSeed(seedStr));
    const R = {
      rnd,
      range: (a, b) => a + Math.floor(rnd() * (b - a + 1)),
      pick: (arr) => arr[Math.floor(rnd() * arr.length)],
      shuffle: (arr) => {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      },
    };
    const perLevel = Math.ceil(count / 4);
    const items = [];
    const seen = new Set();
    let guard = 0;
    while (items.length < count && guard++ < 20000) {
      const level = Math.min(4, 1 + Math.floor(items.length / perLevel));
      // reguły poziomu na zmianę, żeby każda się pojawiła
      const pos = items.length - (level - 1) * perLevel;
      const rule = LEVEL_RULES[level][pos % LEVEL_RULES[level].length];
      const n = shownFor(rule);
      const { terms, desc } = RULES[rule](R, n);
      const shown = terms.slice(0, n), answer = terms[n];
      if (!terms.every(isInt) || terms.some((x) => Math.abs(x) > MAX_ABS)) continue;
      if (new Set(shown).size < 4) continue; // ciąg musi się wyraźnie zmieniać
      const preds = ambiguousNext(shown);
      if (preds.length !== 1 || preds[0] !== answer) continue;
      const key = shown.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ level, rule, desc, shown, answer });
    }
    return items;
  }

  // Odpowiedź wpisana przez uczestnika -> liczba (albo null). Akceptuje
  // spacje, minus zwykły i typograficzny.
  function parseAnswer(text) {
    const s = String(text).replace(/\s+/g, '').replace(/[−–]/g, '-');
    return /^-?\d{1,6}$/.test(s) ? Number(s) : null;
  }

  const api = { RULES, LEVEL_RULES, CATALOG, ambiguousNext, generateItems, parseAnswer, MAX_ABS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SeriesCore = api;
})(this);
