'use strict';
// Tests for the AudioWorklet synthesis (html/tone_generator_processor.js).
// The processor is driven exactly as the audio thread drives it; see
// helpers/worklet.js.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { BLOCK, loadProcessor, Renderer, stats, reference, maxAbsDiff, maxSlope } = require('./helpers/worklet');

const { Sinewave, ToneGeneratorProcessor } = loadProcessor();

// A plain-data source, as the main thread posts it (see sourceData()).
const src = (over = {}) => ({ f: 440, A: 0.5, phase: 0, c: 343.2, mute: false, ...over });
// What the UI sends for a 180 degree phase slider (phase = -2*pi*slider/1000).
const DEG180 = -Math.PI;

// Float32 output, so "zero" and "equal" are up to float32 rounding.
const F32_TOL = 1e-6;
// Blocks to let the phase lock converge (worst case half a cycle at 0.15/block).
const SETTLE = 200;
// Tolerance for continuity checks: the steepest slope an output sine could
// legitimately have. The lock adds at most a few tens of Hz momentarily.
const SMOOTH = (A, fMax) => 1.5 * maxSlope(A, fMax + 50);

function setup() {
  const proc = new ToneGeneratorProcessor();
  return { proc, r: new Renderer(proc) };
}

describe('source messages', () => {
  test('addSource builds a real Sinewave from plain data (postMessage strips methods)', () => {
    const { proc, r } = setup();
    r.send({ type: 'addSource', id: 'c0', source: src() });
    const wave = proc.sources.c0;
    assert.ok(wave instanceof Sinewave);
    assert.equal(typeof wave.process, 'function');
    assert.equal(wave.f, 440);
    assert.equal(wave.A, 0.5);
  });

  test('updateSource changes the parameters of an existing source', () => {
    const { proc, r } = setup();
    r.send({ type: 'addSource', id: 'c0', source: src() });
    r.send({ type: 'updateSource', id: 'c0', source: src({ f: 220, A: 0.25, phase: 1, mute: true }) });
    const wave = proc.sources.c0;
    assert.equal(wave.f, 220);
    assert.equal(wave.A, 0.25);
    assert.equal(wave.phase, 1);
    assert.equal(wave.mute, true);
  });

  test('updateSource for an unknown id is ignored', () => {
    const { proc, r } = setup();
    assert.doesNotThrow(() => r.send({ type: 'updateSource', id: 'nope', source: src() }));
    assert.deepEqual(Object.keys(proc.sources), []);
  });

  test('removeSource drops the source and its audio', () => {
    const { proc, r } = setup();
    r.send({ type: 'addSource', id: 'c0', source: src() });
    r.send({ type: 'removeSource', id: 'c0' });
    assert.deepEqual(Object.keys(proc.sources), []);
    assert.equal(stats(r.render(4)).peak, 0);
  });
});

describe('synthesis', () => {
  test('no sources renders silence', () => {
    const { r } = setup();
    assert.equal(stats(r.render(4)).peak, 0);
  });

  test('renders A*sin(2*pi*f*t + phase) locked to the audio clock', () => {
    const { r } = setup();
    r.send({ type: 'addSource', id: 'c0', source: src({ phase: 0.7 }) });
    const out = r.render(50);
    const ideal = reference(0, out.length, { f: 440, A: 0.5, phase: 0.7 });
    assert.ok(maxAbsDiff(out, ideal) < 1e-5);
  });

  test('output is scaled by 1/N so N identical sources sum to one', () => {
    const one = setup();
    one.r.send({ type: 'addSource', id: 'a', source: src() });
    const two = setup();
    two.r.send({ type: 'addSource', id: 'a', source: src() });
    two.r.send({ type: 'addSource', id: 'b', source: src() });
    assert.ok(maxAbsDiff(one.r.render(20), two.r.render(20)) < F32_TOL);
  });

  test('mute fades to silence within a block, and unmute restores it', () => {
    const { r } = setup();
    r.send({ type: 'addSource', id: 'c0', source: src() });
    r.render(5);
    r.send({ type: 'updateSource', id: 'c0', source: src({ mute: true }) });
    r.render(1); // the one-block amplitude ramp
    assert.equal(stats(r.render(5)).peak, 0);
    r.send({ type: 'updateSource', id: 'c0', source: src({ mute: false }) });
    r.render(1);
    assert.ok(Math.abs(stats(r.render(5)).peak - 0.5) < 1e-3);
  });
});

describe('phase coherence between sources', () => {
  test('two equal-frequency sources 180 degrees apart cancel when started together', () => {
    const { r } = setup();
    r.send({ type: 'addSource', id: 'a', source: src() });
    r.send({ type: 'addSource', id: 'b', source: src({ phase: DEG180 }) });
    assert.ok(stats(r.render(20)).rms < F32_TOL);
  });

  // The regression: sources used to accumulate phase from their own start
  // time, so a channel added mid-playback did not cancel at 180 degrees.
  for (const delayBlocks of [1, 37, 137, 251]) {
    test(`still cancel when the second source is added ${delayBlocks} blocks into playback`, () => {
      const { r } = setup();
      r.send({ type: 'addSource', id: 'a', source: src() });
      r.render(delayBlocks);
      r.send({ type: 'addSource', id: 'b', source: src({ phase: DEG180 }) });
      const out = r.render(SETTLE);
      const settled = stats(out, out.length - 20 * BLOCK);
      assert.ok(settled.rms < F32_TOL, `residual rms ${settled.rms}`);
    });
  }

  test('a source added mid-playback settles onto the absolute-clock reference', () => {
    const { r } = setup();
    r.send({ type: 'addSource', id: 'a', source: src() });
    r.render(137);
    r.send({ type: 'addSource', id: 'b', source: src({ f: 300, phase: 0.3 }) });
    r.render(SETTLE);
    const start = r.frame;
    const out = r.render(20);
    const ideal = reference(start, out.length, { f: 440, A: 0.5, scale: 0.5 });
    for (let i = 0; i < out.length; i++) {
      ideal[i] += 0.5 * 0.5 * Math.sin(2 * Math.PI * 300 * ((start + i) / 48000) + 0.3);
    }
    assert.ok(maxAbsDiff(out, ideal) < 1e-5);
  });

  test('cancellation survives sweeping a source away and back', () => {
    const { r } = setup();
    r.send({ type: 'addSource', id: 'a', source: src() });
    r.send({ type: 'addSource', id: 'b', source: src({ phase: DEG180 }) });
    r.render(20);
    // Drag b's frequency up to 900 Hz and back down, a few blocks per step.
    for (let f = 460; f <= 900; f += 20) {
      r.send({ type: 'updateSource', id: 'b', source: src({ f, phase: DEG180 }) });
      r.render(3);
    }
    for (let f = 880; f >= 440; f -= 20) {
      r.send({ type: 'updateSource', id: 'b', source: src({ f, phase: DEG180 }) });
      r.render(3);
    }
    const out = r.render(SETTLE);
    assert.ok(stats(out, out.length - 20 * BLOCK).rms < F32_TOL);
  });
});

describe('smoothness (no clicks)', () => {
  test('frequency changes never produce a discontinuity', () => {
    const { r } = setup();
    r.send({ type: 'addSource', id: 'c0', source: src() });
    const chunks = [r.render(10)];
    for (let f = 460; f <= 900; f += 20) {
      r.send({ type: 'updateSource', id: 'c0', source: src({ f }) });
      chunks.push(r.render(3));
    }
    for (let f = 880; f >= 440; f -= 20) {
      r.send({ type: 'updateSource', id: 'c0', source: src({ f }) });
      chunks.push(r.render(3));
    }
    chunks.push(r.render(SETTLE));
    const out = Float64Array.from(chunks.flatMap((c) => Array.from(c)));
    const { maxJump } = stats(out);
    assert.ok(maxJump < SMOOTH(0.5, 900), `max sample jump ${maxJump}`);
  });

  test('the phase lock re-converges smoothly after a frequency change', () => {
    const { r } = setup();
    r.send({ type: 'addSource', id: 'a', source: src() });
    r.render(20);
    // A frequency change sweeps the running phase off the absolute clock,
    // and that offset is baked into the rendered samples. The lock must pull
    // it back by ramping: snapping here would be a mid-stream step (a click).
    r.send({ type: 'updateSource', id: 'a', source: src({ f: 445 }) });
    const out = r.render(SETTLE);
    const { maxJump } = stats(out);
    assert.ok(maxJump < SMOOTH(0.5, 445), `max sample jump ${maxJump}`);
    // ...and it really does converge back onto the reference.
    const tail = out.subarray(out.length - BLOCK);
    const ideal = reference(r.frame - BLOCK, BLOCK, { f: 445, A: 0.5 });
    assert.ok(maxAbsDiff(tail, ideal) < 1e-5);
  });

  test('amplitude and phase changes are ramped, not stepped', () => {
    const { r } = setup();
    r.send({ type: 'addSource', id: 'c0', source: src() });
    const chunks = [r.render(10)];
    r.send({ type: 'updateSource', id: 'c0', source: src({ A: 0.1 }) });
    chunks.push(r.render(10));
    r.send({ type: 'updateSource', id: 'c0', source: src({ A: 0.1, phase: DEG180 }) });
    chunks.push(r.render(10));
    const out = Float64Array.from(chunks.flatMap((c) => Array.from(c)));
    // A half-cycle phase ramp over one block is a brief ~190 Hz offset.
    assert.ok(stats(out).maxJump < SMOOTH(0.5, 440 + 190));
  });
});
