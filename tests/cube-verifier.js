// Niezależny weryfikator klucza „Obracanie kostki”.
//
// Napisany osobno od assets/cube-core.js i bez macierzy ani iloczynów
// wektorowych: kierunki to etykiety ('+X', '-Y', ...), a obrót to permutacja
// etykiet wyprowadzona wprost z instrukcji dla uczestnika („ścianka ze
// strzałką przetacza się w kierunku strzałki”):
//   ścianka z kierunku n trafia na d, z d na -n, z -n na -d, z -d na n;
//   oś obrotu (pozostałe dwa kierunki) zostaje na miejscu.
//
// Stan wejściowy bierzemy z tego, co widzi uczestnik: trzy widoczne ścianki
// (prawa +X, góra +Y, przód +Z) z symbolem i kierunkiem „w prawo” symbolu.
// Ścianki niewidoczne na starcie są puste, więc ich orientacja nie ma
// znaczenia. Weryfikator przelicza obraz końcowy i sprawdza, który z
// obrazków-odpowiedzi do niego pasuje.
'use strict';

const opposite = (d) => (d[0] === '+' ? '-' : '+') + d[1];

// Ruchy w kolejności numerów używanych przez stronę; opis = rysunek strzałki.
const MOVE_TABLE = [
  { from: '+Y', to: '+Z', opis: 'góra do przodu' },
  { from: '+Y', to: '-Z', opis: 'góra do tyłu' },
  { from: '+Y', to: '+X', opis: 'góra w prawo' },
  { from: '+Y', to: '-X', opis: 'góra w lewo' },
  { from: '+Z', to: '+X', opis: 'przód w prawo' },
  { from: '+Z', to: '-X', opis: 'przód w lewo' },
];

function permutationFor(move) {
  const n = move.from, d = move.to;
  const perm = { [n]: d, [d]: opposite(n), [opposite(n)]: opposite(d), [opposite(d)]: n };
  for (const axis of ['+X', '-X', '+Y', '-Y', '+Z', '-Z']) if (!(axis in perm)) perm[axis] = axis;
  return perm;
}
const PERMS = MOVE_TABLE.map(permutationFor);

// Stan: lista ścianek { at: kierunek normalnej, right: kierunek „w prawo”
// symbolu, symbol }. Tylko ścianki z symbolem.
function applyMove(state, moveIndex) {
  const p = PERMS[moveIndex];
  return state.map((f) => ({ symbol: f.symbol, at: p[f.at], right: p[f.right] }));
}

// Obraz: co widać na prawej, górnej i przedniej ściance.
function picture(state) {
  return ['+X', '+Y', '+Z'].map((w) => {
    const f = state.find((x) => x.at === w);
    return f ? f.symbol + '>' + f.right : '_';
  }).join(' ');
}

// Wektor [x,y,z] z jedynką na jednej osi -> etykieta.
function label(v) {
  const i = v.findIndex((x) => x !== 0);
  return (v[i] > 0 ? '+' : '-') + 'XYZ'[i];
}

// Obraz kostki opisany przez widoczne ścianki (format CubeCore.visibleFaces:
// w = kierunek ścianki, symbol, u = kierunek „w prawo” symbolu).
function stateFromVisible(visible) {
  return visible.filter((f) => f.symbol !== null)
    .map((f) => ({ symbol: f.symbol, at: label(f.w), right: label(f.u) }));
}

// Zwraca indeks jedynej pasującej odpowiedzi albo opis problemu.
function solve(startVisible, moves, optionsVisible) {
  let state = stateFromVisible(startVisible);
  for (const m of moves) state = applyMove(state, m);
  const target = picture(state);
  const matches = optionsVisible.map((v, i) => (picture(stateFromVisible(v)) === target ? i : -1)).filter((i) => i >= 0);
  return { target, matches };
}

module.exports = { MOVE_TABLE, PERMS, applyMove, picture, stateFromVisible, solve, opposite };
