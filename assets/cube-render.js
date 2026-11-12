// Rysowanie kostek w SVG (rzut izometryczny).
(function (root) {
  'use strict';
  const C = root.CubeCore;
  const NS = 'http://www.w3.org/2000/svg';

  // Symbole w lokalnym układzie ścianki (oś y w górę), żaden nie ma symetrii obrotowej.
  const GLYPHS = [
    'M-0.4,-0.6 L-0.4,0.6 L0.45,0.6 L0.45,0.35 L-0.15,0.35 L-0.15,0.1 L0.3,0.1 L0.3,-0.15 L-0.15,-0.15 L-0.15,-0.6 Z',
    'M-0.5,0.6 L-0.25,0.6 L-0.25,-0.35 L0.5,-0.35 L0.5,-0.6 L-0.5,-0.6 Z M0.1,0.15 L0.4,0.15 L0.4,0.45 L0.1,0.45 Z',
    'M-0.45,-0.65 L-0.3,-0.65 L-0.3,0.1 L0.55,0.38 L-0.3,0.65 L-0.45,0.65 Z',
    'M-0.4,-0.6 L-0.15,-0.6 L-0.15,-0.05 L0.4,-0.05 L0.4,0.6 L-0.4,0.6 Z M-0.15,0.15 L0.15,0.15 L0.15,0.4 L-0.15,0.4 Z',
    'M-0.55,-0.55 L0.55,-0.55 L-0.55,0.55 Z',
    'M-0.55,-0.15 A0.55,0.55 0 0 1 0.55,-0.15 Z M-0.12,-0.45 L0.12,-0.45 L0.12,-0.25 L-0.12,-0.25 Z',
  ];
  const FACE_CLASS = { '1,0,0': 'face-right', '0,1,0': 'face-top', '0,0,1': 'face-front' };

  function el(name, attrs) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  const P = (p) => C.proj(p);
  const pts = (arr) => arr.map((p) => P(p).map((x) => x.toFixed(3)).join(',')).join(' ');

  function svgBase(cls) {
    return el('svg', { viewBox: '-1.95 -2.1 3.9 4.2', class: cls || '', role: 'img' });
  }

  function facePoly(w, u, v) {
    const s = C.scale, a = C.add;
    return [a(a(w, s(u, -1)), s(v, -1)), a(a(w, u), s(v, -1)), a(a(w, u), v), a(a(w, s(u, -1)), v)];
  }

  // Kostka w orientacji R; ścianki bez symbolu są puste.
  function drawCube(R, faces, cls) {
    const svg = svgBase(cls);
    for (const f of C.visibleFaces(R, faces)) {
      svg.appendChild(el('polygon', { points: pts(facePoly(f.w, f.u, f.v)), class: FACE_CLASS[f.w.join(',')] + ' edge' }));
      if (f.symbol !== null) {
        const pu = P(f.u), pv = P(f.v), pw = P(f.w);
        svg.appendChild(el('path', {
          d: GLYPHS[f.symbol], class: 'glyph',
          transform: `matrix(${pu[0]},${pu[1]},${pv[0]},${pv[1]},${pw[0]},${pw[1]})`,
        }));
      }
    }
    return svg;
  }

  // Szara kostka ze strzałką ruchu.
  function drawMove(m, cls) {
    const svg = svgBase(cls);
    const faces = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const tang = { '1,0,0': [[0, 0, -1], [0, 1, 0]], '0,1,0': [[1, 0, 0], [0, 0, -1]], '0,0,1': [[1, 0, 0], [0, 1, 0]] };
    for (const w of faces) {
      const [u, v] = tang[w.join(',')];
      svg.appendChild(el('polygon', { points: pts(facePoly(w, u, v)), class: 'ghost-face edge' }));
    }
    const a = C.add, s = C.scale;
    const n = m.n, d = m.d;
    const p = [n[1] * d[2] - n[2] * d[1], n[2] * d[0] - n[0] * d[2], n[0] * d[1] - n[1] * d[0]];
    const at = (t, q) => a(a(n, s(d, t)), s(p, q));
    const arrow = [at(-0.65, -0.15), at(0.1, -0.15), at(0.1, -0.42), at(0.7, 0), at(0.1, 0.42), at(0.1, 0.15), at(-0.65, 0.15)];
    svg.appendChild(el('polygon', { points: pts(arrow), class: 'arrow' }));
    return svg;
  }

  root.CubeRender = { drawCube, drawMove };
})(this);
