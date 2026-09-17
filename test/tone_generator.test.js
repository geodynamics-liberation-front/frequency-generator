'use strict';
// Tests for the main-thread side (html/tone_generator.js): the message
// protocol to the worklet, the parameter serialisation, and the display
// waveform math used by the graphs.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { ToneGenerator, Sinewave, sourceData } = require(path.join(__dirname, '..', 'html', 'tone_generator.js'));

// A stand-in AudioWorkletNode that records what gets posted to the worklet.
function fakeNode() {
  const posted = [];
  return {
    posted,
    port: { postMessage: (m) => posted.push(m) },
    connect() {},
    disconnect() {
      this.disconnected = true;
    },
  };
}

describe('sourceData', () => {
  test('sends only the user-controllable, structured-cloneable parameters', () => {
    const s = new Sinewave();
    s.f = 220;
    s.A = 0.25;
    s.phase = -1;
    s.mute = true;
    assert.deepEqual(sourceData(s), { f: 220, A: 0.25, phase: -1, c: 343.2, mute: true });
  });

  test('never leaks the worklet-owned continuity state', () => {
    const keys = Object.keys(sourceData(new Sinewave()));
    for (const internal of ['f0', 'A0', 'phase0', '_phase', 'sampleRate']) {
      assert.ok(!keys.includes(internal), `${internal} must not be sent`);
    }
  });
});

describe('ToneGenerator message protocol', () => {
  test('sources can be added, updated and removed before the worklet exists', () => {
    const g = new ToneGenerator();
    const s = new Sinewave();
    assert.doesNotThrow(() => {
      g.addSource('c0', s);
      g.updateSource('c0', s);
      g.removeSource('c0');
      g.pause();
    });
    assert.equal(g.source_count, 0);
  });

  test('addSource stores the source and posts it as plain data', () => {
    const g = new ToneGenerator();
    g.node = fakeNode();
    const s = new Sinewave();
    g.addSource('c0', s);
    assert.equal(g.sources.c0, s);
    assert.equal(g.source_count, 1);
    assert.deepEqual(g.node.posted, [{ type: 'addSource', id: 'c0', source: sourceData(s) }]);
  });

  // The regression: with a worklet the audio thread has its own copy, so
  // every parameter change must be pushed or slider moves are never heard.
  test('updateSource posts the current parameters', () => {
    const g = new ToneGenerator();
    g.node = fakeNode();
    const s = new Sinewave();
    g.addSource('c0', s);
    s.f = 880;
    s.mute = true;
    g.updateSource('c0', s);
    const msg = g.node.posted[1];
    assert.equal(msg.type, 'updateSource');
    assert.equal(msg.id, 'c0');
    assert.equal(msg.source.f, 880);
    assert.equal(msg.source.mute, true);
  });

  test('removeSource forgets the source and tells the worklet', () => {
    const g = new ToneGenerator();
    g.node = fakeNode();
    g.addSource('c0', new Sinewave());
    g.removeSource('c0');
    assert.deepEqual(Object.keys(g.sources), []);
    assert.equal(g.source_count, 0);
    assert.deepEqual(g.node.posted[1], { type: 'removeSource', id: 'c0' });
  });

  test('pause disconnects the node and clears the playing flag', () => {
    const g = new ToneGenerator();
    g.node = fakeNode();
    g.playing = true;
    g.pause();
    assert.equal(g.playing, false);
    assert.equal(g.node.disconnected, true);
  });
});

describe('Sinewave.waveform (graph display)', () => {
  test('is a sine over distance with wavelength c/f', () => {
    const s = new Sinewave(); // A=0.5, f=440, c=343.2
    const lambda = s.c / s.f;
    assert.ok(Math.abs(s.waveform(0)) < 1e-12);
    assert.ok(Math.abs(s.waveform(lambda / 4) - 0.5) < 1e-12);
    assert.ok(Math.abs(s.waveform(lambda) - s.waveform(0)) < 1e-12);
  });

  test('two waves 180 degrees apart sum to zero everywhere', () => {
    const a = new Sinewave();
    const b = new Sinewave();
    b.phase = -Math.PI;
    for (let x = 0; x < 2; x += 0.01) {
      assert.ok(Math.abs(a.waveform(x) + b.waveform(x)) < 1e-12);
    }
  });

  test('a muted wave is flat', () => {
    const s = new Sinewave();
    s.mute = true;
    assert.equal(s.waveform(0.1), 0);
  });
});
