// Audio synthesis for the tone generator. This runs on the audio rendering
// thread inside an AudioWorklet, so it cannot share objects with the main
// thread by reference. The main thread posts plain parameter data and this
// module keeps its own Sinewave instances that do the actual synthesis.

var twopi = Math.PI * 2;

// Phase-lock tuning (see Sinewave.process): the fraction of the phase error
// pulled in per block, and the error (in cycles) below which the lock snaps
// exactly. 0.15/block converges from a worst-case half-cycle error in ~0.2 s.
var LOCK_RATE = 0.15;
var LOCK_SNAP = 1e-6;

class Sinewave {
  constructor() {
    this.A0 = 0.5; // amplitude at the start of the current block
    this.A = 0.5; // target amplitude
    this.f0 = 440; // frequency at the start of the current block (Hz)
    this.f = 440; // target frequency in Hz
    this.phase0 = 0; // phase offset at the start of the current block
    this._phase = 0; // running phase carried between blocks
    this.phase = 0; // target phase
    this.c = 343.2; // wave speed
    this.mute = false;
    this.sampleRate = sampleRate; // global provided to AudioWorkletGlobalScope
  }

  // Copy the user-controllable parameters sent from the UI. Continuity state
  // (f0/A0/phase0/_phase) is deliberately preserved so frequency, amplitude
  // and phase changes are swept smoothly across the next block.
  setParams(data) {
    this.f = data.f;
    this.A = data.A;
    this.phase = data.phase;
    this.c = data.c;
    this.mute = data.mute;
  }

  syncProperties() {
    this.f0 = this.f;
    this.A0 = this.mute ? 0 : this.A;
    this.phase0 = this.phase;
  }

  process(data, _playbackTime, scale) {
    var N = data.length;

    // While the frequency is steady, pull the running phase toward the
    // absolute audio clock (currentTime is the block's start time, a worklet
    // global). Then every source shares one phase reference regardless of
    // when it was added or how its addSource message lined up with the render
    // quantum, so equal-frequency sources interfere predictably -- two 440 Hz
    // waves 180 degrees apart cancel exactly, matching the on-screen graph.
    //
    // The correction is not snapped in (that would be a phase discontinuity,
    // i.e. an audible click after every frequency sweep). Instead a fraction
    // of the error is ramped across this block as a brief, tiny frequency
    // offset, converging geometrically; once negligible it snaps exactly so
    // steady-state coherence is exact. During a frequency change (f0 != f)
    // the accumulated phase is kept so the sweep itself stays smooth.
    var lockRamp = 0; // extra phase (cycles) ramped in across this block
    if (this.f0 === this.f) {
      var cyc = this.f * currentTime;
      var target = cyc - Math.floor(cyc);
      var err = target - this._phase;
      err -= Math.round(err); // shortest path, in [-0.5, 0.5] cycles
      if (Math.abs(err) < LOCK_SNAP) {
        this._phase = target;
      } else {
        lockRamp = err * LOCK_RATE;
      }
    }

    var t = N / this.sampleRate;
    // calculate rate of frequency change
    var k = (this.f - this.f0) / t;
    // calculate rate of amplitude change
    var A = this.mute ? 0 : this.A;
    var kA = (A - this.A0) / N;
    // calculate rate of phase change
    var kPhase = (this.phase - this.phase0) / N;
    for (var i = 0; i < N; i++) {
      t = i / this.sampleRate;
      data[i] +=
        scale *
        (this.A0 + kA * i) *
        Math.sin(twopi * (this.f0 * t + (k / 2) * t * t + this._phase + lockRamp * (i / N)) + this.phase0 + kPhase * i);
    }
    // calculate the phase offset for the next set of data (the full lockRamp
    // has been applied by the end of the block, keeping phase continuous)
    t = N / this.sampleRate;
    var arg = twopi * (this.f0 * t + (k / 2) * t * t + this._phase + lockRamp);
    this._phase = arg / twopi - Math.floor(arg / twopi);
    // carry the target values forward as the new starting values
    this.syncProperties();
  }
}

class ToneGeneratorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sources = {};

    // Listen for messages from the main thread
    this.port.onmessage = (event) => {
      const { type, id, source } = event.data;
      if (type === 'addSource') {
        const wave = new Sinewave();
        wave.setParams(source);
        // No sweep on the very first block for a new source.
        wave.syncProperties();
        // Best-effort anchor to the absolute clock so a new source usually
        // starts coherent at once; the soft lock in process() corrects any
        // residual from message/quantum timing.
        var cycles = wave.f0 * currentTime;
        wave._phase = cycles - Math.floor(cycles);
        this.sources[id] = wave;
      } else if (type === 'updateSource') {
        const wave = this.sources[id];
        if (wave) {
          wave.setParams(source);
        }
      } else if (type === 'removeSource') {
        delete this.sources[id];
      }
    };
  }

  process(inputs, outputs, _parameters) {
    const output = outputs[0];
    const data = output[0];

    // Clear the output buffer
    for (let i = 0; i < data.length; i++) {
      data[i] = 0;
    }

    // Process each source and add its contribution to the output buffer
    const ids = Object.keys(this.sources);
    for (const id of ids) {
      this.sources[id].process(data, currentTime, 1 / ids.length);
    }

    return true; // Continue processing
  }
}
registerProcessor('tone-generator-processor', ToneGeneratorProcessor);

// Expose the classes for unit tests, which load this file in Node with the
// worklet globals stubbed. In a real AudioWorkletGlobalScope `module` is
// undefined, so this is a no-op there.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Sinewave, ToneGeneratorProcessor, LOCK_RATE, LOCK_SNAP };
}
