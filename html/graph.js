var css3_colors = [
  'aqua',
  'black',
  'blue',
  'fuchsia',
  'gray',
  'green',
  'lime',
  'maroon',
  'navy',
  'olive',
  'purple',
  'red',
  'silver',
  'teal',
  'white',
  'yellow',
];

//var graphs=[]
//
//function resize_graphs()
//{
//	for( i in graphs )
//	{
//		graphs[i].redraw()
//	}
//}

function line(m, b) {
  return function (x) {
    return m * x + b;
  };
}

function Graph(canvas, param) {
  //	graphs.push(this);

  this.sample = 0.5; // Sample the function every pixel
  this._x = line(1, 0);
  this._y = line(1, 0);
  this.canvas = canvas;
  this.paper = canvas.getContext('2d');
  this.width = canvas.width;
  this.height = canvas.height;

  this.axis_color = 'gray';
  this.axis_on = true;
  this.axis_x = true;
  this.axis_y = true;
  this.axis_width = 1;

  this.grid_color = 'teal';
  this.grid_on = false;
  this.grid_x = true;
  this.grid_y = true;
  this.grid_line_width = 1;

  this.x_ticks = [];
  this.y_ticks = [];
  this.ticks_above = 10;
  this.ticks_below = 10;
  this.tick_label_size = 20;
  this.tick_format = String;

  this._limits = [-1, 1, -1, 1];
  this.x_min = -1;
  this.x_max = 1;
  this.y_min = -1;
  this.y_max = 1;

  this.plot_density = false;

  if ('axis_color' in param) {
    this.axis_color = param['axis_color'];
  }
  if ('axis_on' in param) {
    this.axis_on = param['axis_on'];
  }
  if ('axis_x' in param) {
    this.axis_x = param['axis_x'];
  }
  if ('axis_y' in param) {
    this.axis_y = param['axis_y'];
  }
  if ('axis_width' in param) {
    this.axis_width = param['axis_width'];
  }

  if ('grid_color' in param) {
    this.grid_color = param['grid_color'];
  }
  if ('grid_on' in param) {
    this.grid_on = param['grid_on'];
  }
  if ('grid_x' in param) {
    this.grid_x = param['grid_x'];
  }
  if ('grid_y' in param) {
    this.grid_y = param['grid_y'];
  }
  if ('grid_line_width' in param) {
    this.grid_width = param['grid_line_width'];
  }

  function set_limits(x_min, x_max, y_min, y_max) {
    this.set_x_limits(x_min, x_max);
    this.set_y_limits(y_min, y_max);
  }
  this.set_limits = set_limits;

  function set_x_limits(x_min, x_max) {
    if (x_min == x_max) {
      throw 'x_min equals x_max';
    }
    this.x_min = Math.min(x_min, x_max);
    this.x_max = Math.max(x_min, x_max);

    var w = this.width;
    var m = w / (x_max - x_min);
    var b = (w - m * (x_min + x_max)) / 2;
    this._x = line(m, b);
  }
  this.set_x_limits = set_x_limits;

  function set_y_limits(y_min, y_max) {
    if (y_min == y_max) {
      throw 'y_min equals y_max';
    }
    this.y_min = Math.min(y_min, y_max);
    this.y_max = Math.max(y_min, y_max);

    var h = this.height;
    var m = h / (y_min - y_max);
    var b = (h - m * (y_min + y_max)) / 2;

    this._y = line(m, b);
  }
  this.set_y_limits = set_y_limits;

  function _draw_ticks() {
    this.paper.beginPath();
    this.paper.fillStyle = this.axis_color;
    this.paper.strokeStyle = this.axis_color;
    this.paper.lineWidth = this.axis_width;
    this.paper.font = this.tick_label_size + 'px sans-serif';
    var scale = (this.y_max - this.y_min) / this.height;
    for (i in this.x_ticks) {
      var tick = this.x_ticks[i];
      this.moveTo(tick, this.ticks_above * scale);
      this.lineTo(tick, 0 - this.ticks_below * scale);
      var label = this.tick_format(tick);
      var label_width = this.paper.measureText(label).width;
      this.paper.fillText(label, this._x(tick) - label_width / 2, this._y(0) + this.ticks_below + this.tick_label_size);
    }
    this.paper.stroke();
  }
  this._draw_ticks = _draw_ticks;

  function _draw_axes() {
    this.paper.beginPath();
    this.paper.strokeStyle = this.axis_color;
    this.paper.lineWidth = this.axis_width;

    // Draw the x-axis
    if (this.axis_x) {
      this.moveTo(this.x_min, 0);
      this.lineTo(this.x_max, 0);
    }
    // Draw the y-axis
    if (this.axis_y) {
      this.moveTo(0, this.y_min);
      this.lineTo(0, this.y_max);
    }
    this.paper.stroke();
  }
  this._draw_axes = _draw_axes;

  function _draw_grid() {}
  this._draw_grid = _draw_grid;

  function plotDensity(f) {
    var points = this.width;
    var scale = (this.x_max - this.x_min) / this.width;
    var height = this.height;

    this.paper.beginPath();
    this.paper.strokeStyle = 'red';
    var x = this.x_min;
    var y = 0;
    var maxParticles = 10;

    for (i = 0; i < points; i += 1) {
      x = this.x_min + i * scale;
      var particles = 2 * (Math.round(maxParticles * f(x)) + maxParticles) + Math.round(Math.random());
      for (var p = 0; p < particles; p++) {
        y = Math.random() * height;
        this.paper.moveTo(i, y);
        this.paper.lineTo(i, y + 1);
      }
    }
    this.paper.stroke();
  }
  this.plotDensity = plotDensity;

  function plot(f, color, lineWidth) {
    var points = this.width;
    var scale = (this.x_max - this.x_min) / this.width;
    if (color == undefined) {
      color = 'aqua';
    }
    if (lineWidth == undefined) {
      lineWidth = 1;
    }

    this.paper.beginPath();
    this.paper.strokeStyle = color;
    this.paper.lineWidth = lineWidth;

    var x = this.x_min;
    var y = f(x);
    this.moveTo(x, y);
    for (i = 0; i < points; i += this.sample) {
      x = this.x_min + i * scale;
      y = f(x);
      this.lineTo(x, y);
    }
    this.paper.stroke();
  }
  this.plot = plot;

  function moveTo(x, y) {
    this.paper.moveTo(this._x(x), this._y(y));
  }
  this.moveTo = moveTo;

  function lineTo(x, y) {
    this.paper.lineTo(this._x(x), this._y(y));
  }
  this.lineTo = lineTo;

  function draw_axes() {
    // Draw the axis if needed
    if (this.axis_on) {
      this._draw_axes();
    }
    // Draw the ticks
    this._draw_ticks();
    // And the grid
    if (this.grid_on) {
      this._draw_grid();
    }
  }
  this.draw_axes = draw_axes;

  function reset() {
    // Get the DOM width and height
    var w = parseInt(window.getComputedStyle(canvas).width);
    var h = parseInt(window.getComputedStyle(canvas).height);
    // Make sure it's an even number (looks nicer)
    w = 2 * Math.floor(w / 2);
    h = 2 * Math.floor(h / 2);
    // Size the bitmap in device pixels and draw in CSS pixels, so the graph
    // is sharp on high-density (phone) screens. Setting canvas.width resets
    // the context, so the transform is applied afterwards.
    var dpr = window.devicePixelRatio || 1;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.paper.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Reset the limits (and thus scaling functions
    this.set_limits(this.x_min, this.x_max, this.y_min, this.y_max);
  }
  this.reset = reset;
}
