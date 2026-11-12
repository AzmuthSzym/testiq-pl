// Logika zadań „Słownictwo” (wybierz synonim) — bez zależności, działa
// w przeglądarce i w Node. Zadania pochodzą z przejrzanej ręcznie listy
// (slownictwo/items.json, budowanej przez vocab/approve.py); tu tylko wybór
// zadań i kolejność opcji z ziarnem.
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

  const PER_BAND = 5;
  const N_OPTIONS = 5;

  // Wybiera PER_BAND zadań z każdego pasma (od łatwych do trudnych) i ustala
  // kolejność opcji tak, żeby poprawna odpowiedź była równo rozłożona na A–E.
  // Zwraca null, jeśli zatwierdzonych zadań jest za mało.
  function buildItems(bank, seedStr) {
    const rnd = mulberry32(hashSeed(seedStr));
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    const chosen = [];
    for (const band of [1, 2, 3, 4]) {
      const pool = bank.filter((it) => it.band === band).sort((a, b) => (a.word < b.word ? -1 : 1));
      if (pool.length < PER_BAND) return null;
      chosen.push(...shuffle(pool.slice()).slice(0, PER_BAND));
    }
    const slots = [];
    while (slots.length < chosen.length) slots.push(...shuffle([0, 1, 2, 3, 4]));
    return chosen.map((it, k) => {
      const options = shuffle(it.distractors.slice());
      options.splice(slots[k], 0, it.synonym);
      return { level: it.band, word: it.word, pos: it.pos, options, answer: slots[k] };
    });
  }

  const api = { PER_BAND, N_OPTIONS, buildItems };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VocabCore = api;
})(this);
