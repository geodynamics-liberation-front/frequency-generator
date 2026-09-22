frequency-generator
===================

A web-based frequency generator. Build up a sound from one or more sine
waves, see each wave and their sum plotted over distance, and hear the
result through the browser's audio output. It is a small physics tool for
playing with interference: for example, two equal waves 180° apart cancel
completely, on screen and in your ears.

Running it
----------

Everything is static: the site is the `html/` directory. `make dist` copies
it into `dist/`, which is how it is published on
<https://therealglf.org/projects/frequency-generator/>, and `make serve`
builds it and serves it locally:

    make serve

then browse to <http://localhost:8000/>. (`make dist` alone builds without
serving; `make clean` removes `dist/`.)

**Use `localhost` or `127.0.0.1`, not a bare IP or hostname.** Audio is
generated with an `AudioWorklet`, which browsers only expose in a *secure
context*. `http://localhost` and `http://127.0.0.1` qualify; `http://0.0.0.0`,
a LAN address or a plain-`http` hostname do not, and the page will tell you
so when you press play. To use it from another machine, serve it over
HTTPS.

Audio starts when you click the speaker button (browsers require a user
gesture before playing sound).

Prerequisites
-------------

The build needs nothing beyond `make` and the standard Unix tools: there is
no data to download and nothing to generate. `make check` verifies the
prerequisites and exits non-zero naming anything that is missing.

- **Python 3** for `make serve` (its built-in `http.server`). Any 3.x.
- **Node 20 or newer** for `make test` / `npm test`. There are no npm
  packages to install; `package.json` lists none.

Controls
--------

Master row (top):

- **Speaker** – play / pause.
- **Particles** – draw each wave as a particle density plot as well as a
  line.
- **Multichannel** – switch between a single channel and several channels
  mixed together. In multichannel mode a master graph shows the sum.
- **Add channel** (multichannel mode only).

**Display width** – how many metres of the wave to draw (0.5–200 m). The
number can be edited directly; the up/down arrow keys step it by 0.1 m.

Each channel has:

- **Frequency** – 100 Hz to 10 kHz on a logarithmic slider, whole hertz.
- **Amplitude** – 0–100 % in 0.1 % steps.
- **Phase** – 0–360° in whole degrees (multichannel mode).
- **Mute** and **delete** buttons in the channel title (multichannel mode).

Every value can also be typed into the box next to its slider. The number
shown is exactly the number used to generate the tone, so what you see is
what you hear. Changes to frequency, amplitude and phase are ramped in
smoothly rather than stepped, so dragging a slider does not click.

The graphs plot the waves over distance using the speed of sound in air
(343.2 m/s), so a 440 Hz wave has a wavelength of 0.78 m. When several
channels play, the mix is scaled by the number of channels so it can never
clip.

How it works
------------

- `html/chrome.js` builds the UI, and owns one `Sinewave` per channel
  (`html/tone_generator.js`) that holds the channel's settings and draws
  its graph (`html/graph.js`).
- `html/tone_generator.js` (`ToneGenerator`) runs on the main thread and
  talks to the audio thread over a message port: `addSource`,
  `updateSource` and `removeSource` carry plain parameter data (frequency,
  amplitude, phase, mute).
- `html/tone_generator_processor.js` is the `AudioWorkletProcessor`. It
  keeps its own `Sinewave` instances and synthesises the audio, mixing all
  sources into one output.

Two details of the synthesis are worth knowing:

- Every source's phase is referenced to the audio clock, so two channels at
  the same frequency keep the phase relationship you set no matter when
  each was added. That is what makes 180° cancel exactly. The lock is
  applied gradually, so it never causes a click after a frequency sweep.
- Parameter changes are swept across one render block (about 3 ms), which
  is why slider drags sound smooth.

`html/widgets.js` provides the logarithmic slider used for frequency, and
`html/sprintf-0.7-beta1.js` is a bundled copy of a sprintf implementation.

Tests
-----

The synthesis and UI maths are covered by a unit test suite that runs in
Node (20 or newer) with no dependencies:

    npm test

`test/helpers/worklet.js` stands in for the `AudioWorkletGlobalScope` and
drives the processor one 128-sample render quantum at a time, the way the
audio thread does, so the tests exercise the real message protocol, phase
coherence and click-free sweeps sample by sample. The source files export
their classes only when loaded under Node; in the browser those exports are
a no-op.

Data sources and credits
------------------------

The project fetches no data: every wave is computed in the browser from the
frequency, amplitude and phase you set. The speed of sound used for the
distance axis is 343.2 m/s (dry air at 20 °C).

- Developed as part of the [Scripps Classroom Connection](https://earthref.org/SCC/),
  a fellowship program pairing graduate students with middle school teachers
  to develop science curriculum.
- `html/sprintf-0.7-beta1.js` is a vendored copy of
  [sprintf() for JavaScript](http://www.diveintojavascript.com/projects/javascript-sprintf)
  0.7-beta1 by Alexandru Marasteanu, BSD 3-clause licence (the full text is
  at the top of the file).
- The button icons (`html/*.svg`) and the tone icon (`html/tone_*.png`) were
  drawn for this project.
- Sound is synthesised with the browser's Web Audio API; no other
  third-party code is used.
