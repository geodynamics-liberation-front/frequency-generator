'use strict';
// Minimal stand-in for the AudioWorkletGlobalScope so tone_generator_processor.js
// can be loaded and driven in Node exactly the way the audio thread drives it:
// one 128-sample render quantum at a time, with the global clock advancing.

const path = require('path');

const SAMPLE_RATE = 48000;
const BLOCK = 128;
const twopi = Math.PI * 2;

function loadProcessor() {
  globalThis.sampleRate = SAMPLE_RATE;
  globalThis.currentTime = 0;
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = { onmessage: null, postMessage() {} };
    }
  };
  globalThis.registerProcessor = () => {};
  return require(path.join(__dirname, '..', '..', 'html', 'tone_generator_processor.js'));
}

// Drives a processor instance like the audio thread does.
class Renderer {
  constructor(proc) {
    this.proc = proc;
    this.frame = 0;
    globalThis.currentTime = 0;
  }

  // Deliver a message exactly as the main thread's port.postMessage would.
  // A message is handled between quanta, while the clock still reads the
  // quantum that just rendered; modelling that jitter means a source added
  // mid-playback starts slightly off the absolute clock, as it can for real,
  // so the phase lock is genuinely exercised.
  send(msg) {
    globalThis.currentTime = Math.max(0, this.frame - BLOCK) / SAMPLE_RATE;
    this.proc.port.onmessage({ data: msg });
  }

  // Render `blocks` quanta and return the concatenated output samples. Output
  // goes through a Float32Array, as it does in a real worklet.
  render(blocks) {
    const out = new Float64Array(blocks * BLOCK);
    for (let b = 0; b < blocks; b++) {
      globalThis.currentTime = this.frame / SAMPLE_RATE;
      const buf = new Float32Array(BLOCK);
      this.proc.process([], [[buf]], {});
      out.set(buf, b * BLOCK);
      this.frame += BLOCK;
    }
    return out;
  }
}

// RMS, peak and largest sample-to-sample jump over samples[from, to).
function stats(samples, from = 0, to = samples.length) {
  let sq = 0;
  let peak = 0;
  let maxJump = 0;
  for (let i = from; i < to; i++) {
    const v = samples[i];
    sq += v * v;
    if (Math.abs(v) > peak) peak = Math.abs(v);
    if (i > from) {
      const jump = Math.abs(v - samples[i - 1]);
      if (jump > maxJump) maxJump = jump;
    }
  }
  return { rms: Math.sqrt(sq / (to - from)), peak, maxJump };
}

// The ideal signal scale*A*sin(2*pi*f*t + phase) for n samples from startFrame.
function reference(startFrame, n, { f, A, phase = 0, scale = 1 }) {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = scale * A * Math.sin(twopi * f * ((startFrame + i) / SAMPLE_RATE) + phase);
  }
  return out;
}

function maxAbsDiff(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > m) m = d;
  }
  return m;
}

// Largest sample-to-sample step a sine of amplitude A at frequency f can take.
// Anything much bigger than this in the output is a discontinuity (a click).
function maxSlope(A, f) {
  return (A * twopi * f) / SAMPLE_RATE;
}

module.exports = { SAMPLE_RATE, BLOCK, loadProcessor, Renderer, stats, reference, maxAbsDiff, maxSlope };
