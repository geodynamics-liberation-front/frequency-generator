'use strict';
// Tests for the UI-side phase mapping (html/chrome.js). The phase slider holds
// whole degrees and that same integer drives both the display and the tone,
// so what is shown must be exactly what is generated.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { BLOCK, loadProcessor, Renderer, stats } = require('./helpers/worklet');

const { phase_from_degrees } = require(path.join(__dirname, '..', 'html', 'chrome.js'));
const { ToneGeneratorProcessor } = loadProcessor();

const src = (over = {}) => ({ f: 440, A: 0.5, phase: 0, c: 343.2, mute: false, ...over });

describe('phase_from_degrees', () => {
  test('0 degrees is exactly zero', () => {
    // === rather than Object.is: (-2*PI*0)/360 is -0, which is harmless.
    assert.ok(phase_from_degrees(0) === 0);
  });

  test('180 degrees is exactly -PI, so equal waves cancel exactly (not approximately)', () => {
    assert.equal(phase_from_degrees(180), -Math.PI);
  });

  // The regression: the slider used to have 1000 steps over 360 degrees, so
  // neighbouring positions 499/500/501 all displayed "180" but generated
  // 179.64/180/180.36 degrees. Only a typed 180 cancelled. Now every whole
  // degree is its own slider step, and a displayed 180 is always the exact
  // 180 that the tone uses.
  test('a displayed 180 degrees cancels in the worklet regardless of how it was reached', () => {
    const proc = new ToneGeneratorProcessor();
    const r = new Renderer(proc);
    r.send({ type: 'addSource', id: 'a', source: src() });
    r.render(50);
    // Reaching 180 by dragging the slider: the value is the integer degrees.
    const dragged = parseInt('180');
    r.send({ type: 'addSource', id: 'b', source: src({ phase: phase_from_degrees(dragged) }) });
    const out = r.render(200);
    assert.ok(stats(out, out.length - 20 * BLOCK).rms < 1e-6);
  });

  test('every whole degree maps to a distinct phase in (-2PI, 0]', () => {
    let prev = Infinity;
    for (let d = 0; d <= 360; d++) {
      const p = phase_from_degrees(d);
      assert.ok(p <= 0 && p >= -2 * Math.PI);
      assert.ok(p < prev, `degree ${d} must be strictly more negative than ${d - 1}`);
      prev = p;
    }
  });
});
