var tone_generator_version = 4;
var twopi = Math.PI * 2;

// The ToneGenerator lives on the main (UI) thread. The actual audio
// synthesis runs in an AudioWorklet (tone_generator_processor.js) on the
// audio rendering thread. Because a worklet runs in a separate global, the
// synthesis code cannot be shared by reference: we send plain parameter data
// across the message port and the worklet keeps its own Sinewave instances.
class ToneGenerator {
  constructor() {
    this.source_count = 0;
    this.sources = {};
    this.playing = false;
    this.context = null;
    this.node = null;
  }

  async play() {
    if (this.context == null) {
      this.context = new AudioContext();

      // AudioWorklet is only exposed in a secure context. localhost and
      // 127.0.0.1 qualify, but a LAN IP / hostname over plain http does not,
      // in which case context.audioWorklet is undefined. Fail with a clear
      // message instead of a cryptic "cannot read 'addModule' of undefined".
      if (!this.context.audioWorklet) {
        this.context = null;
        var msg =
          'Audio requires a secure context: open this page via ' +
          'http://localhost:8000 or http://127.0.0.1:8000 (or serve it over https), ' +
          'not a bare IP/hostname over http.';
        console.error(msg);
        alert(msg);
        return;
      }

      // Load the AudioWorklet module
      await this.context.audioWorklet.addModule('tone_generator_processor.js');

      // Create an AudioWorkletNode
      this.node = new AudioWorkletNode(this.context, 'tone-generator-processor');

      // Set up communication with the processor
      this.node.port.onmessage = (event) => {
        console.log(event);
      };

      // Send the current sources to the processor
      for (let [id, source] of Object.entries(this.sources)) {
        this.node.port.postMessage({ type: 'addSource', id: id, source: sourceData(source) });
      }
    }

    // Browsers start an AudioContext suspended until a user gesture; play()
    // is called from a click handler, so this resume() is allowed.
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }

    this.playing = true;
    this.node.connect(this.context.destination);
  }

  pause() {
    this.playing = false;
    if (this.node) {
      this.node.disconnect();
    }
  }

  addSource(id, source) {
    this.sources[id] = source;
    this.source_count++;

    // Send new source to the processor
    if (this.node) {
      this.node.port.postMessage({ type: 'addSource', id: id, source: sourceData(source) });
    }
  }

  // Push the current parameters of an existing source to the processor. The
  // UI mutates the main-thread Sinewave (for the on-screen graph); this keeps
  // the audio thread's copy in sync so slider changes are actually heard.
  updateSource(id, source) {
    if (this.node) {
      this.node.port.postMessage({ type: 'updateSource', id: id, source: sourceData(source) });
    }
  }

  removeSource(id) {
    delete this.sources[id];
    this.source_count--;

    // Notify the processor to remove the source
    if (this.node) {
      this.node.port.postMessage({ type: 'removeSource', id: id });
    }
  }
}

// Extract the plain, cloneable parameters of a Sinewave for postMessage.
// Only the user-controllable fields are sent; the worklet owns its own
// block-to-block continuity state (f0/A0/phase0/_phase).
function sourceData(source) {
  return { f: source.f, A: source.A, phase: source.phase, c: source.c, mute: source.mute };
}

class Sinewave {
  constructor() {
    this.A0 = 0.5; // initial frequency
    this.A = 0.5; // final frequency
    this.f0 = 440; // initial frequency (Hz)
    this.f = 440; // Frequency in Hz
    this.phase0 = 0; // initial phase offset
    this._phase = 0; // phase offset from previous block of data
    this.phase = 0; // phase
    this.c = 343.2; // wave speed
    this.mute = false;
    this.sampleRate = 0;
  }

  waveform(x) {
    var lambda = this.c / this.f;
    var k = 1 / lambda; // the wave number
    var A = this.mute ? 0 : this.A;
    return A * Math.sin(2 * Math.PI * k * x + this.phase);
  }

  syncProperties() {
    this.f0 = this.f;
    this.A0 = this.mute ? 0 : this.A;
    this.phase0 = this.phase;
  }

  process(data, _playbackTime, scale) {
    var t = data.length / this.sampleRate;
    // calculate rate of frequency change
    var k = (this.f - this.f0) / t;
    // calculate rate of amplitude change
    var A = this.mute ? 0 : this.A;
    var kA = (A - this.A0) / data.length;
    // calculate rate of phase change
    var kPhase = (this.phase - this.phase0) / data.length;
    for (var i = 0; i < data.length; i++) {
      t = i / this.sampleRate;
      data[i] +=
        scale *
        (this.A0 + kA * i) *
        Math.sin(twopi * (this.f0 * t + (k / 2) * t * t + this._phase) + this.phase0 + kPhase * i);
    }
    // calculate the phase offset for the next set of data
    t = data.length / this.sampleRate;
    var arg = twopi * (this.f0 * t + (k / 2) * t * t + this._phase);
    this._phase = arg / twopi - Math.floor(arg / twopi);
    // set the
    this.syncProperties();
  }
}

// Expose the classes for unit tests, which load this file in Node. In the
// browser `module` is undefined, so this is a no-op there.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ToneGenerator, Sinewave, sourceData };
}
