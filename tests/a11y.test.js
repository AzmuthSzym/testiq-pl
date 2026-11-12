// Kontrast kolorów (WCAG 2.1) w obu motywach, liczony z assets/style.css:
// tekst co najmniej 4,5:1, elementy interfejsu (obramowania przycisków
// odpowiedzi, zaznaczenia) co najmniej 3:1.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'style.css'), 'utf8');

function vars(block) {
  const out = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}
const light = vars(css.match(/:root\s*\{([^}]*)\}/)[1]);
const dark = { ...light, ...vars(css.match(/prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/)[1]) };

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const TEXT = [['ink', 'bg'], ['ink', 'paper'], ['muted', 'bg'], ['muted', 'paper'], ['accent', 'bg'],
  ['accent', 'paper'], ['on-accent', 'accent'], ['glyph', 'face-top'], ['glyph', 'face-front'], ['glyph', 'face-right']];
const UI = [['control', 'paper'], ['control', 'bg'], ['sel', 'paper'], ['ok', 'paper'], ['accent', 'paper']];

for (const [name, t] of [['jasny', light], ['ciemny', dark]]) {
  test(`kontrast tekstu, motyw ${name}`, () => {
    for (const [fg, bg] of TEXT) {
      assert.ok(t[fg] && t[bg], `brak --${fg} lub --${bg}`);
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 4.5, `--${fg} na --${bg}: ${r.toFixed(2)} < 4.5`);
    }
  });
  test(`kontrast elementów interfejsu, motyw ${name}`, () => {
    for (const [fg, bg] of UI) {
      const r = ratio(t[fg], t[bg]);
      assert.ok(r >= 3, `--${fg} na --${bg}: ${r.toFixed(2)} < 3`);
    }
  });
}

test('klawisze odpowiedzi', () => {
  const T = require('../assets/testiq-common.js');
  assert.strictEqual(T.choiceFromKey({ key: 'a' }, 6), 0);
  assert.strictEqual(T.choiceFromKey({ key: 'F' }, 6), 5);
  assert.strictEqual(T.choiceFromKey({ key: '3' }, 6), 2);
  assert.strictEqual(T.choiceFromKey({ key: 'G' }, 6), -1);
  assert.strictEqual(T.choiceFromKey({ key: '7' }, 6), -1);
  assert.strictEqual(T.choiceFromKey({ key: 'Enter' }, 6), -1);
});
