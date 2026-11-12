// Logika zadań „Pamięć robocza” (powtarzanie cyfr w przód i wspak) — bez
// zależności, działa w przeglądarce i w Node.
//
// Część 1: powtórz cyfry w tej samej kolejności (długości 3–9).
// Część 2: powtórz cyfry od końca (długości 2–8).
// Po 2 próby na długość. Część kończy się, gdy obie próby na jednej długości
// są błędne (reguła przerwania, jak w klasycznych testach powtarzania cyfr).
// Ciągi: cyfry 1–9 bez powtórzeń, bez trzech kolejnych rosnących lub
// malejących o 1 (np. 3-4-5), bo takie łatwo zapamiętać jako całość.
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

  const PARTS = {
    1: { name: 'w przód', lengths: [3, 4, 5, 6, 7, 8, 9] },
    2: { name: 'wspak', lengths: [2, 3, 4, 5, 6, 7, 8] },
  };
  const TRIALS = 2;
  // Czas pokazania cyfry i przerwa (ms): razem 1 cyfra na sekundę.
  const SHOW_MS = 800, GAP_MS = 200;
  const RESPONSE_LIMIT_S = 30;

  function hasRun(d) {
    for (let i = 2; i < d.length; i++) {
      const a = d[i - 1] - d[i - 2], b = d[i] - d[i - 1];
      if (a === b && Math.abs(a) === 1) return true;
    }
    return false;
  }

  function generateItems(seedStr) {
    const rnd = mulberry32(hashSeed(seedStr));
    const items = [];
    for (const part of [1, 2]) {
      for (const length of PARTS[part].lengths) {
        for (let trial = 1; trial <= TRIALS; trial++) {
          let digits;
          do {
            const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9];
            for (let i = pool.length - 1; i > 0; i--) {
              const j = Math.floor(rnd() * (i + 1));
              [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            digits = pool.slice(0, length);
          } while (hasRun(digits));
          const target = part === 1 ? digits : digits.slice().reverse();
          items.push({ part, length, trial, digits, answer: target.join('') });
        }
      }
    }
    return items;
  }

  // Wpisana odpowiedź: tylko cyfry (spacje i przecinki pomijamy).
  function normalize(text) {
    return String(text).replace(/[\s,.;-]/g, '');
  }
  function isCorrect(text, item) {
    return normalize(text) === item.answer;
  }

  // Indeks następnego zadania po `idx` z uwzględnieniem reguły przerwania:
  // jeśli obie próby jakiejś długości w bieżącej części są błędne, reszta
  // części jest pomijana. responses: [{ item (1..), correct }].
  function nextIndex(responses, items, idx) {
    if (idx >= items.length) return items.length;
    const byItem = new Map(responses.map((r) => [r.item - 1, r.correct]));
    const failedOut = (part) => PARTS[part].lengths.some((len) => {
      const trials = items.map((it, i) => i).filter((i) => items[i].part === part && items[i].length === len);
      return trials.every((i) => byItem.get(i) === false);
    });
    let i = idx;
    while (i < items.length && failedOut(items[i].part)) {
      const part = items[i].part;
      while (i < items.length && items[i].part === part) i++;
    }
    return i;
  }

  // Zakres pamięci w części: najdłuższa długość z co najmniej jedną poprawną próbą.
  function span(responses, items, part) {
    let best = 0;
    for (const r of responses) {
      const it = items[r.item - 1];
      if (it.part === part && r.correct) best = Math.max(best, it.length);
    }
    return best;
  }

  const api = { PARTS, TRIALS, SHOW_MS, GAP_MS, RESPONSE_LIMIT_S, generateItems, normalize, isCorrect, nextIndex, span, hasRun };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MemoryCore = api;
})(this);
