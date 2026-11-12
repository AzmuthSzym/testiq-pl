// Rysowanie matryc w SVG. Komórka ma układ 0..100 × 0..100.
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  let patternId = 0;

  function el(name, attrs) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  // Kształty w promieniu 1, środek w (0,0). Strzałka wskazuje w górę.
  const SHAPES = [
    null, // koło
    'M-0.85,-0.85 L0.85,-0.85 L0.85,0.85 L-0.85,0.85 Z',
    'M0,-1 L0.95,0.75 L-0.95,0.75 Z',
    'M0,-1 L1,0 L0,1 L-1,0 Z',
    'M0.5,-0.87 L1,0 L0.5,0.87 L-0.5,0.87 L-1,0 L-0.5,-0.87 Z',
    'M-0.3,-1 L0.3,-1 L0.3,-0.3 L1,-0.3 L1,0.3 L0.3,0.3 L0.3,1 L-0.3,1 L-0.3,0.3 L-1,0.3 L-1,-0.3 L-0.3,-0.3 Z',
    'M0,-1 L0.7,-0.15 L0.25,-0.15 L0.25,1 L-0.25,1 L-0.25,-0.15 L-0.7,-0.15 Z',
  ];
  const POSITIONS = {
    1: [[50, 50]],
    2: [[30, 50], [70, 50]],
    3: [[50, 29], [29, 69], [71, 69]],
    4: [[31, 31], [69, 31], [31, 69], [69, 69]],
  };
  const RADIUS = [8, 12, 16];
  // odcinki tła: góra, dół, lewo, prawo, przekątna \, przekątna /
  const SEGMENTS = [[8, 8, 92, 8], [8, 92, 92, 92], [8, 8, 8, 92], [92, 8, 92, 92], [8, 8, 92, 92], [92, 8, 8, 92]];

  // Ścieżka z punktami w promieniu 1 -> obrócona, przeskalowana i przesunięta.
  function placePath(d, x, y, r, rad) {
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return d.replace(/(-?[\d.]+),(-?[\d.]+)/g, (_, px, py) => {
      const u = Number(px), v = Number(py);
      return (x + r * (u * cos - v * sin)).toFixed(2) + ',' + (y + r * (u * sin + v * cos)).toFixed(2);
    });
  }

  function describe(cell) {
    const shapes = ['koło', 'kwadrat', 'trójkąt', 'romb', 'sześciokąt', 'krzyż', 'strzałka'];
    const fills = ['puste', 'kreskowane', 'pełne'];
    return `${cell.count} × ${shapes[cell.shape]}, ${fills[cell.fill]}`;
  }

  function drawCell(cell, cls) {
    const svg = el('svg', { viewBox: '0 0 100 100', class: 'mcell ' + (cls || ''), role: 'img', 'aria-label': describe(cell) });
    const id = 'mstripe' + (++patternId);
    const defs = el('defs', {});
    const pat = el('pattern', { id, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pat.appendChild(el('line', { x1: 0, y1: 0, x2: 0, y2: 5, class: 'mstripe' }));
    defs.appendChild(pat);
    svg.appendChild(defs);
    SEGMENTS.forEach((s, bit) => {
      if (cell.lines & (1 << bit)) svg.appendChild(el('line', { x1: s[0], y1: s[1], x2: s[2], y2: s[3], class: 'mline' }));
    });
    const r = RADIUS[cell.size];
    const rad = cell.angle * Math.PI / 4;
    for (const [x, y] of POSITIONS[cell.count]) {
      const fill = cell.fill === 0 ? 'mfig empty' : cell.fill === 1 ? 'mfig' : 'mfig solid';
      const style = cell.fill === 1 ? `fill:url(#${id})` : '';
      // współrzędne liczone wprost (bez transform: scale), żeby kreskowanie
      // miało tę samą gęstość w każdej figurze
      const shape = SHAPES[cell.shape] === null
        ? el('circle', { cx: x, cy: y, r, class: fill, style })
        : el('path', { d: placePath(SHAPES[cell.shape], x, y, r, rad), class: fill, style });
      svg.appendChild(shape);
    }
    return svg;
  }

  function drawMatrix(cells) {
    const grid = document.createElement('div');
    grid.className = 'mgrid';
    cells.forEach((cell) => grid.appendChild(drawCell(cell)));
    const q = document.createElement('div');
    q.className = 'mcell mq';
    q.textContent = '?';
    q.setAttribute('aria-label', 'brakująca komórka');
    grid.appendChild(q);
    return grid;
  }

  root.MatrixRender = { drawCell, drawMatrix, describe };
})(this);
