// Logika zadań „Zdania” (wybierz słowo pasujące w lukę) — bez zależności,
// działa w przeglądarce i w Node. Zadania pochodzą z zdania/items.json
// (budowanego przez vocab/zdania_publish.py); tu tylko kolejność zadań
// w obrębie poziomu i kolejność opcji z ziarnem.
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

  const N_OPTIONS = 5;
  const GAP = '___';

  // Wszystkie zadania z banku, od łatwych do trudnych (w obrębie poziomu
  // kolejność z ziarna), poprawna odpowiedź równo rozłożona na A–E.
  // Zwraca null przy pustym albo błędnym banku.
  function buildItems(bank, seedStr) {
    if (!Array.isArray(bank) || !bank.length) return null;
    if (bank.some((it) => it.sentence.split(GAP).length !== 2 || it.distractors.length !== N_OPTIONS - 1)) return null;
    const rnd = mulberry32(hashSeed(seedStr));
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    const levels = [...new Set(bank.map((it) => it.level))].sort((a, b) => a - b);
    const chosen = [];
    for (const lv of levels) {
      const pool = bank.filter((it) => it.level === lv).sort((a, b) => (a.answer < b.answer ? -1 : 1));
      chosen.push(...shuffle(pool));
    }
    const slots = [];
    while (slots.length < chosen.length) slots.push(...shuffle([0, 1, 2, 3, 4]));
    return chosen.map((it, k) => {
      const options = shuffle(it.distractors.slice());
      options.splice(slots[k], 0, it.answer);
      const [before, after] = it.sentence.split(GAP);
      return { level: it.level, before, after, options, answer: slots[k] };
    });
  }

  const api = { N_OPTIONS, GAP, buildItems };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SentenceCore = api;
})(this);
