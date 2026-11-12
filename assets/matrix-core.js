// Logika zadań „Matryce” (rozumowanie abstrakcyjne) — bez zależności,
// działa w przeglądarce i w Node.
//
// Zadanie: siatka 3×3, ostatnia komórka pusta. Każda komórka ma cechy:
//   shape  kształt (0–5) albo strzałka (ARROW), gdy zmienia się obrót
//   count  liczba figur (1–4)
//   size   wielkość figur (0–2)
//   fill   wypełnienie: 0 puste, 1 kreskowane, 2 pełne
//   angle  obrót strzałki, w krokach co 45° (0–7)
//   lines  zestaw odcinków w tle (maska 6 bitów: góra, dół, lewo, prawo, \ , /)
// Cechy zmieniają się w wierszach według reguł (od łatwych do trudnych):
//   rowconst  w wierszu bez zmian, wiersze się różnią (poziom 1: 4 takie cechy)
//   colconst  w kolumnie bez zmian (każdy wiersz zmienia się tak samo)
//   prog      progresja: w każdym wierszu ten sam krok (np. +1 figura, +45°)
//   dist3     rozkład trzech wartości: każda raz w każdym wierszu i kolumnie
//   or / xor / andnot   dodawanie, „różnica symetryczna”, odejmowanie odcinków:
//             trzecia komórka wiersza = pierwsza ⊕ druga
//
// Odpowiedzi: 8 opcji = wszystkie kombinacje (poprawna / błędna wartość) dla
// trzech zmieniających się cech. Każda wartość każdej cechy występuje w 4
// opcjach, więc odpowiedzi nie da się wskazać jako „najczęstszej cechy” ani
// „najbardziej podobnej do pozostałych”. Błędne wartości pochodzą z samej
// matrycy (typowe błędy: przepisanie sąsiedniej komórki, pomylenie reguły),
// więc nie da się ich odrzucić tylko dlatego, że nigdzie nie występują.
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

  const ARROW = 6;
  const ATTRS = ['shape', 'count', 'size', 'fill', 'angle', 'lines'];
  // Wartości cech, które mogą się zmieniać w matrycy.
  const DOMAIN = {
    shape: [0, 1, 2, 3, 4, 5],
    count: [1, 2, 3, 4],
    size: [0, 1, 2],
    fill: [0, 1, 2],
    angle: [0, 1, 2, 3, 4, 5, 6, 7],
  };
  const MASK_BITS = 6;
  const popcount = (m) => { let c = 0; for (; m; m &= m - 1) c++; return c; };
  const OPS = {
    or: (a, b) => a | b,
    xor: (a, b) => a ^ b,
    andnot: (a, b) => a & ~b,
    and: (a, b) => a & b,
  };
  const mod8 = (x) => ((x % 8) + 8) % 8;

  // ---------- reguły rozpoznawane w gotowej matrycy ----------
  // Dla cechy (9 wartości, ostatnia nieznana) zwraca przewidywania wszystkich
  // reguł zgodnych z 8 znanymi komórkami. Generator przyjmuje tylko zadania,
  // w których wszystkie zgodne reguły dają tę samą odpowiedź.
  function predictions(attr, v) {
    const g = (r, c) => v[r * 3 + c];
    const out = [];
    const rows01 = [0, 1];
    // w wierszu bez zmian
    if (rows01.every((r) => g(r, 0) === g(r, 1) && g(r, 1) === g(r, 2)) && g(2, 0) === g(2, 1)) out.push(g(2, 0));
    // w kolumnie bez zmian
    if ([0, 1, 2].every((c) => g(0, c) === g(1, c)) && g(2, 0) === g(0, 0) && g(2, 1) === g(0, 1)) out.push(g(0, 2));
    if (attr !== 'lines') {
      // progresja (dla obrotu modulo 8)
      const diff = attr === 'angle' ? (a, b) => mod8(b - a) : (a, b) => b - a;
      const d = diff(g(0, 0), g(0, 1));
      if (d !== 0 && rows01.every((r) => diff(g(r, 0), g(r, 1)) === d && diff(g(r, 1), g(r, 2)) === d)
          && diff(g(2, 0), g(2, 1)) === d) {
        out.push(attr === 'angle' ? mod8(g(2, 1) + d) : g(2, 1) + d);
      }
    }
    // rozkład trzech wartości
    const set = (r) => [g(r, 0), g(r, 1), g(r, 2)].sort((a, b) => a - b).join();
    const distinct = (r) => new Set([g(r, 0), g(r, 1), g(r, 2)]).size === 3;
    if (distinct(0) && distinct(1) && set(0) === set(1) && g(2, 0) !== g(2, 1)) {
      const vals = [g(0, 0), g(0, 1), g(0, 2)];
      if (vals.includes(g(2, 0)) && vals.includes(g(2, 1))) out.push(vals.find((x) => x !== g(2, 0) && x !== g(2, 1)));
    }
    if (attr === 'lines') {
      for (const op of Object.values(OPS)) {
        if (rows01.every((r) => op(g(r, 0), g(r, 1)) === g(r, 2))) out.push(op(g(2, 0), g(2, 1)));
      }
    }
    return [...new Set(out)];
  }

  // ---------- budowa reguł ----------
  function makeRng(seedStr) {
    const rnd = mulberry32(hashSeed(seedStr));
    const int = (n) => Math.floor(rnd() * n);
    const pick = (arr) => arr[int(arr.length)];
    const shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };
    const sample = (arr, k) => shuffle(arr.slice()).slice(0, k);
    return { rnd, int, pick, shuffle, sample };
  }

  // Wartości 9 komórek dla reguły (komórka r*3+c).
  function fillRule(R, attr, rule) {
    const cells = new Array(9);
    const set = (r, c, x) => { cells[r * 3 + c] = x; };
    if (rule === 'rowconst' || rule === 'colconst') {
      const vals = R.sample(DOMAIN[attr], 3);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) set(r, c, rule === 'rowconst' ? vals[r] : vals[c]);
    } else if (rule === 'dist3') {
      let vals = R.sample(DOMAIN[attr], 3);
      // obrót: trzy wartości nie mogą być równo rozłożone na okręgu (wyglądałoby na progresję)
      while (attr === 'angle' && new Set([mod8(vals[1] - vals[0]), mod8(vals[2] - vals[1])]).size === 1) vals = R.sample(DOMAIN[attr], 3);
      const dir = R.pick([1, 2]);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) set(r, c, vals[(c + dir * r) % 3]);
    } else if (rule === 'prog') {
      if (attr === 'angle') {
        const step = R.pick([1, 2, 6, 7]);
        for (let r = 0; r < 3; r++) {
          const start = R.int(8);
          for (let c = 0; c < 3; c++) set(r, c, mod8(start + c * step));
        }
      } else { // count
        const step = R.pick([1, -1]);
        for (let r = 0; r < 3; r++) {
          const start = step > 0 ? R.pick([1, 2]) : R.pick([3, 4]);
          for (let c = 0; c < 3; c++) set(r, c, start + c * step);
        }
      }
    } else if (OPS[rule]) {
      for (let r = 0; r < 3; r++) {
        let a, b, res;
        do {
          a = R.int(1 << MASK_BITS); b = R.int(1 << MASK_BITS); res = OPS[rule](a, b);
        } while (popcount(a) < 2 || popcount(a) > 4 || popcount(b) < 1 || popcount(b) > 3
          || popcount(res) < 1 || a === b || res === a || res === b);
        set(r, 0, a); set(r, 1, b); set(r, 2, res);
      }
    }
    return cells;
  }

  // Kandydaci na błędną wartość cechy w dystraktorach: typowe pomyłki,
  // wartości obecne w matrycy (od najbardziej typowej).
  function wrongValues(attr, rule, v) {
    const answer = v[8];
    const cands = [];
    if (OPS[rule]) {
      for (const op of Object.values(OPS)) cands.push(op(v[6], v[7]));
      cands.push(v[7], v[6], v[5]);
    } else if (rule === 'prog') {
      // sąsiednie komórki, a potem każda inna wartość obecna w matrycy
      cands.push(v[7], v[5], ...v.slice(0, 8));
    } else if (rule === 'colconst') {
      cands.push(v[7], v[6]);
    } else if (rule === 'rowconst') {
      cands.push(v[5], v[2]);
    } else { // dist3: powtórzenie wartości z wiersza albo z kolumny
      cands.push(v[7], v[6], v[5]);
    }
    const ok = cands.filter((x) => x !== answer && x !== undefined && !(attr === 'lines' && x === 0));
    return [...new Set(ok)];
  }

  // Plan zadania na danym poziomie: które cechy i jakimi regułami się zmieniają.
  // Reguły „stała w wierszu/kolumnie” i „rozkład trzech” można zastosować
  // przez liczenie (każda wartość występuje w matrycy 3 razy). Od poziomu 2
  // każde zadanie ma więc co najmniej jedną cechę, której liczenie nie
  // rozwiązuje: progresję liczby figur albo obrotu, albo działanie na odcinkach.
  function planFor(R, level, lineOp) {
    const simple = () => R.pick(['rowconst', 'colconst']);
    const plan = {};
    if (level === 1) {
      // Same reguły proste: po dwie cechy stałe w wierszu i w kolumnie. Przy
      // jednej cesze w danym kierunku dystraktor z jej błędną wartością
      // zawsze byłby kopią komórki matrycy (do odrzucenia bez rozwiązywania).
      const attrs = R.shuffle(['shape', 'count', 'size', 'fill']);
      plan[attrs[0]] = 'rowconst'; plan[attrs[1]] = 'rowconst';
      plan[attrs[2]] = 'colconst'; plan[attrs[3]] = 'colconst';
    } else if (level === 2) {
      // progresja + dwie reguły proste
      const prog = R.pick(['count', 'angle']);
      plan[prog] = 'prog';
      const rest = R.sample(['shape', 'size', 'fill'].filter((a) => !(prog === 'angle' && a === 'shape')), 2);
      plan[rest[0]] = simple();
      plan[rest[1]] = simple();
    } else if (level === 3) {
      // progresja + rozkład trzech + reguła prosta
      const prog = R.pick(['count', 'angle']);
      plan[prog] = 'prog';
      const pool = ['shape', 'size', 'fill'].filter((a) => !(prog === 'angle' && a === 'shape'));
      const rest = R.sample(pool, 2);
      plan[rest[0]] = 'dist3';
      plan[rest[1]] = simple();
    } else {
      // działanie na odcinkach + dwie reguły trudne
      const prog = R.pick(['count', 'angle', null]);
      if (prog) plan[prog] = R.pick(['prog', 'dist3']);
      const pool = ['shape', 'size', 'fill'].filter((a) => !(prog === 'angle' && a === 'shape'));
      for (const a of R.sample(pool, prog ? 1 : 2)) plan[a] = 'dist3';
      plan.lines = lineOp || R.pick(['or', 'xor', 'andnot']);
    }
    return plan;
  }

  function cellAt(values, i) {
    const cell = {};
    for (const a of ATTRS) cell[a] = values[a][i];
    return cell;
  }
  const cellKey = (c) => ATTRS.map((a) => c[a]).join(',');

  function buildItem(R, level, lineOp) {
    const plan = planFor(R, level, lineOp);
    const values = {};
    // cechy stałe w całej matrycy
    const constant = {
      shape: plan.angle ? ARROW : R.pick(DOMAIN.shape),
      count: R.pick([1, 2]),
      size: R.pick([1, 2]),
      fill: R.pick(DOMAIN.fill),
      angle: 0,
      lines: 0,
    };
    for (const a of ATTRS) values[a] = plan[a] ? fillRule(R, a, plan[a]) : new Array(9).fill(constant[a]);
    // strzałka: większa, żeby obrót był wyraźny
    if (plan.angle && !plan.size) values.size = new Array(9).fill(2);

    // każda cecha: jedna możliwa odpowiedź
    for (const a of ATTRS) {
      const p = predictions(a, values[a]);
      if (p.length !== 1 || p[0] !== values[a][8]) return null;
    }
    // komórki matrycy muszą się różnić (inaczej zadanie jest nieczytelne)
    const cells = Array.from({ length: 9 }, (_, i) => cellAt(values, i));
    if (new Set(cells.map(cellKey)).size !== 9) return null;

    // trzy osie dystraktorów: zmieniające się cechy (na poziomie 1 trzy z czterech)
    const axes = Object.keys(plan).length === 4 ? R.sample(Object.keys(plan), 3) : Object.keys(plan);
    if (axes.length !== 3) return null;
    const cands = axes.map((a) => wrongValues(a, plan[a], values[a]));
    if (cands.some((c) => !c.length)) return null;
    const answer = cells[8];
    const cellKeys = new Set(cells.slice(0, 8).map(cellKey));
    const optionsFor = (wrong) => {
      const out = [];
      for (let k = 0; k < 8; k++) {
        const o = Object.assign({}, answer);
        axes.forEach((a, bit) => { if (k & (1 << bit)) o[a] = wrong[bit]; });
        out.push(o);
      }
      return out;
    };
    // Wybór kombinacji błędnych wartości:
    // 1. żaden dystraktor nie jest kopią komórki matrycy (poprawna odpowiedź
    //    nigdy nią nie jest, więc kopie dałoby się odrzucić bez rozwiązywania);
    // 2. reguły stałości i rozkładu trzech da się zastosować przez liczenie
    //    (każda wartość występuje 3 razy), ale progresji i działań na odcinkach
    //    już nie: tam błędna wartość ma być w matrycy co najwyżej tak częsta
    //    jak poprawna, żeby liczenie nie wskazywało odpowiedzi;
    // 3. łączna częstość wartości dystraktorów jak najbliższa poprawnej;
    // 4. przy remisie: bardziej typowe pomyłki (wcześniejsze na liście).
    const freq = (a, x) => values[a].slice(0, 8).filter((y) => y === x).length;
    const countable = (a) => ['rowconst', 'colconst', 'dist3'].includes(plan[a]);
    let options = null, bestScore = Infinity;
    for (let i0 = 0; i0 < cands[0].length; i0++) for (let i1 = 0; i1 < cands[1].length; i1++) {
      for (let i2 = 0; i2 < cands[2].length; i2++) {
        const wrong = [cands[0][i0], cands[1][i1], cands[2][i2]];
        const opts = optionsFor(wrong);
        if (opts.some((o) => cellKeys.has(cellKey(o)))) continue;
        const d = axes.map((a, k) => freq(a, wrong[k]) - freq(a, answer[a]));
        const giveaway = axes.some((a, k) => !countable(a) && d[k] > 0);
        const total = d.reduce((x, y) => x + y, 0);
        const score = (giveaway ? 10000 : 0) + Math.abs(total) * 100 + i0 + i1 + i2;
        if (score < bestScore) { bestScore = score; options = opts; }
      }
    }
    if (!options) return null;
    return { level, plan, cells, options, answerCell: answer };
  }

  // Poziomy: 4 zadania na poziom (1 = najłatwiejszy).
  function generateItems(seedStr, count, opts) {
    const perLevel = (opts && opts.perLevel) || Math.ceil(count / 4);
    const R = makeRng(seedStr);
    const slots = [];
    while (slots.length < count) slots.push(...R.shuffle([0, 1, 2, 3, 4, 5, 6, 7]));
    // na poziomie 4 każda operacja na odcinkach pojawia się co najmniej raz
    const lineOps = R.shuffle(['or', 'xor', 'andnot']);
    const items = [];
    let guard = 0;
    while (items.length < count && guard++ < 20000) {
      const level = Math.min(4, 1 + Math.floor(items.length / perLevel));
      const it = buildItem(R, level, lineOps[(items.length - 3 * perLevel) % 3]);
      if (!it) continue;
      // kolejność opcji: poprawna na wyznaczonej pozycji, reszta losowo
      const wrongOpts = R.shuffle(it.options.slice(1));
      const pos = slots[items.length];
      wrongOpts.splice(pos, 0, it.options[0]);
      items.push({ level: it.level, plan: it.plan, cells: it.cells.slice(0, 8), options: wrongOpts, answer: pos });
    }
    return items;
  }

  const api = { ATTRS, DOMAIN, ARROW, OPS, MASK_BITS, predictions, generateItems, cellKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MatrixCore = api;
})(this);
