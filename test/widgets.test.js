'use strict';
// Tests for the logarithmic slider (html/widgets.js).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { LogRange } = require(path.join(__dirname, '..', 'html', 'widgets.js'));

const MIN = 100;
const MAX = 10000;
const STOPS = 10000;

// A stand-in <input type="range">; LogRange only touches min, max and value.
function makeRange() {
  const range = { value: 0 };
  const lr = new LogRange(range, MIN, MAX, STOPS);
  return { range, lr };
}

describe('LogRange', () => {
  test('configures the underlying range to span the stops', () => {
    const { range } = makeRange();
    assert.equal(range.min, 0);
    assert.equal(range.max, STOPS - 1);
  });

  test('maps the ends of the slider to min and max', () => {
    const { range, lr } = makeRange();
    range.value = 0;
    assert.ok(Math.abs(lr.getValue() / MIN - 1) < 1e-3);
    range.value = STOPS - 1;
    assert.ok(Math.abs(lr.getValue() / MAX - 1) < 1e-3);
  });

  test('is logarithmic: the slider midpoint is the geometric mean', () => {
    const { range, lr } = makeRange();
    range.value = STOPS / 2;
    assert.ok(Math.abs(lr.getValue() / Math.sqrt(MIN * MAX) - 1) < 1e-3);
  });

  test('setValue/getValue round-trip within one slider step', () => {
    const { lr } = makeRange();
    for (const v of [100, 440, 1000, 4321, 10000]) {
      lr.setValue(v);
      assert.ok(Math.abs(lr.getValue() / v - 1) < 1e-3, `round-trip of ${v}`);
    }
  });

  test('exposes a working, enumerable "value" accessor', () => {
    const { lr } = makeRange();
    assert.ok(Object.keys(lr).includes('value'));
    lr.value = 2500;
    assert.ok(Math.abs(lr.value / 2500 - 1) < 1e-3);
  });
});
