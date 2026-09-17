function LogRange(range, min, max, stops) {
  this.min = min;
  this.max = max;
  this.native_step = 1;
  this.range = range;
  range.min = 0;
  range.max = stops - 1;
  range.log = this;
  this.m = (Math.log(max) / Math.LN10 - Math.log(min) / Math.LN10) / stops;
  this.b = (Math.log(max) / Math.LN10 + Math.log(min) / Math.LN10 - this.m * stops) / 2;

  function getValue() {
    var v = parseInt(this.range.value);
    return Math.pow(10, this.m * v + this.b);
  }
  this.getValue = getValue;

  function setValue(v) {
    v = (Math.log(v) / Math.LN10 - this.b) / this.m;
    this.range.value = v;
  }
  this.setValue = setValue;
  this.setValue(range.value);

  Object.defineProperty(this, 'value', { get: getValue, set: setValue, enumerable: true });
}

// Expose for unit tests, which load this file in Node. In the browser
// `module` is undefined, so this is a no-op there.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LogRange };
}

/*
 */
