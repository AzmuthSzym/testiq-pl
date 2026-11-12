// Logika zadań „Obracanie kostki” — bez zależności, działa w przeglądarce i w Node.
(function (root) {
  'use strict';

  // ---------- RNG z ziarnem (te same zadania dla każdego) ----------
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

  // ---------- wektory ----------
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  const neg = (a) => [-a[0], -a[1], -a[2]];
  const key = (a) => a.join(',');

  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

  // Obrót o 90° wokół osi a: v' = (a·v)a + a×v
  function rot90(a, v) { return add(scale(a, dot(a, v)), cross(a, v)); }

  // Ruch: ścianka ze strzałką (n) przetacza się w kierunku strzałki (d).
  // Widoczne ścianki w świecie: +X (prawa), +Y (góra), +Z (przód).
  const MOVES = [
    { n: Y, d: Z },  // góra → do przodu
    { n: Y, d: neg(Z) }, // góra → do tyłu
    { n: Y, d: X },  // góra → w prawo
    { n: Y, d: neg(X) }, // góra → w lewo
    { n: Z, d: X },  // przód → w prawo (obrót wokół pionu)
    { n: Z, d: neg(X) }, // przód → w lewo
  ];
  function applyMove(R, m) {
    const a = cross(m.n, m.d);
    return R.map((c) => rot90(a, c));
  }

  // Orientacja R: obrazy osi ciała [x,y,z] w świecie.
  const IDENT = [X, Y, Z];
  function toWorld(R, b) {
    return add(add(scale(R[0], b[0]), scale(R[1], b[1])), scale(R[2], b[2]));
  }

  // Ścianki ciała z układem lokalnym (u = „w prawo”, v = „w górę”, u×v = n).
  const BODY_FACES = [
    { n: X, u: neg(Z), v: Y },
    { n: neg(X), u: Z, v: Y },
    { n: Y, u: X, v: neg(Z) },
    { n: neg(Y), u: X, v: Z },
    { n: Z, u: X, v: Y },
    { n: neg(Z), u: neg(X), v: Y },
  ];
  const VIEW_DIRS = [X, Y, Z];

  // Obrót układu (u,v) o k·90° w płaszczyźnie ścianki.
  function spin(u, v, k) {
    for (let i = 0; i < k; i++) { const t = u; u = v; v = neg(t); }
    return [u, v];
  }

  // Co widać: dla każdej widocznej ścianki świata — symbol (lub null) i jego układ.
  function visibleFaces(R, faces) {
    return VIEW_DIRS.map((w) => {
      const f = faces.find((f) => eq(toWorld(R, f.n), w));
      return { w, symbol: f.symbol, u: toWorld(R, f.u), v: toWorld(R, f.v) };
    });
  }
  function signature(R, faces) {
    return visibleFaces(R, faces)
      .map((f) => (f.symbol === null ? '_' : f.symbol + '@' + key(f.u)))
      .join('|');
  }

  // ---------- generator zadań ----------
  // Poziomy trudności: liczba ruchów rośnie co 5 zadań.
  function generateItems(seedStr, count) {
    const rnd = mulberry32(hashSeed(seedStr));
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    const items = [];
    const answerSlots = [];
    while (answerSlots.length < count) answerSlots.push(...shuffle([0, 1, 2, 3, 4, 5]));
    let guard = 0;
    while (items.length < count && guard++ < 10000) {
      const nMoves = 1 + Math.floor(items.length / (count / 4));
      // Ścianki: 3 z symbolami (widoczne na starcie), 3 puste.
      const symbols = shuffle([0, 1, 2, 3, 4, 5]).slice(0, 3);
      let start = IDENT;
      for (let i = 0; i < 6; i++) start = applyMove(start, pick(MOVES));
      const faces = BODY_FACES.map((f) => {
        const [u, v] = spin(f.u, f.v, Math.floor(rnd() * 4));
        return { n: f.n, u, v, symbol: null };
      });
      // symbole na ściankach widocznych na starcie
      VIEW_DIRS.forEach((w, i) => {
        const f = faces.find((f) => eq(toWorld(start, f.n), w));
        f.symbol = symbols[i];
      });

      const moves = [];
      for (let i = 0; i < nMoves; i++) moves.push(Math.floor(rnd() * MOVES.length));
      const run = (seq) => seq.reduce((R, mi) => applyMove(R, MOVES[mi]), start);
      const end = run(moves);
      const correctSig = signature(end, faces);
      if (!correctSig.split('|').some((s) => s !== '_')) continue; // musi być widać symbol
      if (correctSig === signature(start, faces)) continue; // ruchy nie mogą się znosić

      // Dystraktory: „prawie dobre” sekwencje, potem losowe orientacje.
      const near = [];
      for (let i = 0; i < moves.length; i++) {
        for (let m = 0; m < MOVES.length; m++) if (m !== moves[i]) {
          const s = moves.slice(); s[i] = m; near.push(s);
        }
        near.push(moves.slice(0, i).concat(moves.slice(i + 1)));
      }
      for (let m = 0; m < MOVES.length; m++) near.push(moves.concat([m]));
      shuffle(near);
      const seen = new Set([correctSig]);
      const options = [{ R: end, correct: true }];
      const tryAdd = (R) => {
        const sig = signature(R, faces);
        if (seen.has(sig) || !sig.split('|').some((s) => s !== '_')) return;
        seen.add(sig); options.push({ R, correct: false });
      };
      for (const s of near) { if (options.length >= 6) break; tryAdd(run(s)); }
      let g2 = 0;
      while (options.length < 6 && g2++ < 500) {
        let R = start;
        for (let i = 0; i < 5; i++) R = applyMove(R, pick(MOVES));
        tryAdd(R);
      }
      if (options.length < 6) continue;
      // poprawna odpowiedź równomiernie na pozycjach A–F
      const pos = answerSlots[items.length];
      const wrong = shuffle(options.slice(1).map((o) => o.R));
      wrong.splice(pos, 0, end);
      items.push({ moves, faces, start, options: wrong, answer: pos });
    }
    return items;
  }

  // ---------- rzut izometryczny ----------
  const C30 = Math.cos(Math.PI / 6), S30 = 0.5;
  function proj(p) { return [(p[0] - p[2]) * C30, -p[1] + (p[0] + p[2]) * S30]; }

  const api = { MOVES, BODY_FACES, VIEW_DIRS, applyMove, toWorld, visibleFaces, signature, generateItems, proj, neg, add, scale, eq };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CubeCore = api;
})(this);
