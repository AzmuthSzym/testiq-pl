// Tymczasowy test, zastąpiony w etapie 2.
const test = require('node:test');
const assert = require('node:assert');
const C = require('../assets/cube-core.js');
test('generator działa w Node', () => { assert.strictEqual(C.generateItems('kostka-v1', 20).length, 20); });
