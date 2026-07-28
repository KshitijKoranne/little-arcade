/* =====================================================================
   core/backdrop.js — reusable scenery.

   Skies are dithered with a 4x4 Bayer matrix (the way a 16-colour
   machine faked gradients) and cached to an offscreen canvas, so a
   full-screen sky costs one drawImage per frame.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var C = RA.C;
  var BG = RA.bg = {};

  /* 4x4 ordered dither thresholds, normalised 0..1 */
  var BAYER = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5]
  ];

  /* ------------------------------------------------------- sky cache */
  var skyCache = {};

  /**
   * Dithered vertical gradient through a list of colours.
   * Cached by size + colour list, so call it freely every frame.
   */
  BG.sky = function (ctx, colors, x, y, w, h) {
    x = x || 0; y = y || 0; w = w || RA.W; h = h || RA.H;
    var key = w + 'x' + h + '|' + colors.join(',');
    var cv = skyCache[key];
    if (!cv) {
      cv = U.makeCanvas(w, h);
      var g = cv.getContext('2d');
      var n = colors.length;
      for (var py = 0; py < h; py++) {
        var f = (py / Math.max(1, h - 1)) * (n - 1);
        var idx = Math.min(n - 2, Math.floor(f));
        var frac = f - idx;
        /* base row */
        g.fillStyle = colors[idx];
        g.fillRect(0, py, w, 1);
        if (frac > 0.001) {
          g.fillStyle = colors[idx + 1];
          var brow = BAYER[py & 3];
          for (var px = 0; px < w; px++) {
            if ((brow[px & 3] + 0.5) / 16 < frac) g.fillRect(px, py, 1, 1);
          }
        }
      }
      skyCache[key] = cv;
    }
    ctx.drawImage(cv, x, y);
  };

  /* Preset palettes so the six games still feel like one world. */
  BG.PALETTES = {
    day:      ['#9fe4ff', '#bff0ff', '#d9f6ff', '#f2fbff'],
    morning:  ['#8fd8ff', '#bff0ff', '#ffe9c9', '#ffd9ec'],
    sunset:   ['#5a3f9e', '#b04f8a', '#f2705c', '#f7a72b', '#ffd45c'],
    night:    ['#12132b', '#1b2350', '#2f3a7a', '#4a4e78'],
    meadow:   ['#63c9f0', '#bff0ff', '#d8f7c0'],
    dream:    ['#4a2a8f', '#7a4fd1', '#b48cf5', '#e8d4ff'],
    candy:    ['#ff9ec4', '#ffd9ec', '#fff0bd', '#bff0ff']
  };

  /* ------------------------------------------------------------ hills
     Layered sine ridges. Each column is a filled rect, which keeps the
     silhouette hard-edged instead of anti-aliased mush. */
  BG.hills = function (ctx, scrollX, opts) {
    opts = opts || {};
    var baseY = opts.baseY === undefined ? RA.H - 60 : opts.baseY;
    var layers = opts.layers || [
      { color: '#8fc9e8', amp: 12, freq: 0.013, speed: 0.15, offset: 0 },
      { color: '#6aa8cf', amp: 16, freq: 0.009, speed: 0.32, offset: 40 },
      { color: '#3fae5c', amp: 20, freq: 0.007, speed: 0.55, offset: 90 }
    ];
    for (var l = 0; l < layers.length; l++) {
      var L = layers[l];
      ctx.fillStyle = L.color;
      var yBase = baseY + l * (opts.step === undefined ? 14 : opts.step);
      var sx = scrollX * L.speed + L.offset;
      for (var px = 0; px < RA.W; px++) {
        var hgt = Math.sin((px + sx) * L.freq) * L.amp
                + Math.sin((px + sx) * L.freq * 2.7 + 1.3) * (L.amp * 0.35);
        var top = Math.round(yBase - hgt);
        ctx.fillRect(px, top, 1, RA.H - top);
      }
    }
  };

  /* ----------------------------------------------------------- clouds */
  var cloudShapes = null;
  function buildClouds() {
    if (cloudShapes) return cloudShapes;
    cloudShapes = [];
    var defs = [
      [[0, 6, 34, 6], [4, 3, 26, 4], [9, 1, 14, 3], [2, 9, 30, 2]],
      [[0, 5, 24, 5], [3, 2, 16, 4], [7, 0, 8, 3], [1, 8, 21, 2]],
      [[0, 7, 46, 6], [6, 4, 34, 4], [13, 1, 18, 4], [3, 11, 40, 2]]
    ];
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      var w = 0, h = 0, j;
      for (j = 0; j < d.length; j++) { w = Math.max(w, d[j][0] + d[j][2]); h = Math.max(h, d[j][1] + d[j][3]); }
      var cv = U.makeCanvas(w, h + 1);
      var g = cv.getContext('2d');
      g.fillStyle = '#ffffff';
      for (j = 0; j < d.length; j++) g.fillRect(d[j][0], d[j][1], d[j][2], d[j][3]);
      g.fillStyle = '#d9e8ff';
      for (j = 0; j < d.length; j++) g.fillRect(d[j][0] + 1, d[j][1] + d[j][3] - 1, d[j][2] - 2, 1);
      cloudShapes.push(cv);
    }
    return cloudShapes;
  }

  /** Slow drifting cloud band. `seedRow` picks a stable random layout. */
  BG.clouds = function (ctx, t, opts) {
    opts = opts || {};
    var shapes = buildClouds();
    var count = opts.count || 5;
    var speed = opts.speed || 6;
    var top = opts.top === undefined ? 18 : opts.top;
    var band = opts.band === undefined ? 70 : opts.band;
    var alpha = opts.alpha === undefined ? 0.9 : opts.alpha;
    ctx.globalAlpha = alpha;
    for (var i = 0; i < count; i++) {
      var sp = speed * (0.5 + ((i * 37) % 7) / 7);
      var img = shapes[i % shapes.length];
      var span = RA.W + img.width + 40;
      var x = ((-t * sp + i * 131) % span + span) % span - img.width - 20;
      var y = top + ((i * 53) % band);
      ctx.drawImage(img, Math.round(x), Math.round(y));
    }
    ctx.globalAlpha = 1;
  };

  /* -------------------------------------------------------- starfield */
  var starField = null;
  BG.stars = function (ctx, t, opts) {
    opts = opts || {};
    if (!starField) {
      starField = [];
      var rnd = U.rng(20260727);
      for (var i = 0; i < 90; i++) {
        starField.push({
          x: Math.floor(rnd() * RA.W),
          y: Math.floor(rnd() * (opts.height || RA.H)),
          p: rnd() * Math.PI * 2,
          s: rnd() < 0.18 ? 2 : 1
        });
      }
    }
    for (var n = 0; n < starField.length; n++) {
      var st = starField[n];
      var tw = 0.55 + 0.45 * Math.sin(t * 2.2 + st.p);
      ctx.globalAlpha = tw;
      ctx.fillStyle = st.s > 1 ? C.white : C.mist;
      ctx.fillRect(st.x, st.y, st.s, st.s);
    }
    ctx.globalAlpha = 1;
  };

  /* ------------------------------------------------------- ground band */
  BG.ground = function (ctx, y, opts) {
    opts = opts || {};
    var top = opts.top || '#8fe07a';
    var mid = opts.mid || '#3fae5c';
    var deep = opts.deep || '#1d7a45';
    ctx.fillStyle = top; ctx.fillRect(0, y, RA.W, 3);
    ctx.fillStyle = mid; ctx.fillRect(0, y + 3, RA.W, 6);
    ctx.fillStyle = deep; ctx.fillRect(0, y + 9, RA.W, RA.H - y - 9);
    /* grass tufts */
    ctx.fillStyle = top;
    for (var x = (opts.offset || 0) % 8; x < RA.W; x += 8) {
      ctx.fillRect(x, y - 1, 1, 1);
      ctx.fillRect(x + 3, y - 2, 1, 2);
    }
  };

  /* --------------------------------------------------- soft vignette */
  BG.vignette = function (ctx, strength) {
    var s = strength === undefined ? 0.25 : strength;
    var g = ctx.createLinearGradient(0, 0, 0, RA.H);
    g.addColorStop(0, 'rgba(18,19,43,' + s + ')');
    g.addColorStop(0.35, 'rgba(18,19,43,0)');
    g.addColorStop(0.75, 'rgba(18,19,43,0)');
    g.addColorStop(1, 'rgba(18,19,43,' + s + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, RA.W, RA.H);
  };

  /* ------------------------------------------------------ butterflies
     A small flock that wanders with a sine path. Yes, butterflies again
     — but these are 11x8 hand-drawn sprites with a two-frame wing flap. */
  BG.butterflies = function (ctx, t, count, opts) {
    opts = opts || {};
    count = count || 3;
    for (var i = 0; i < count; i++) {
      var sp = 14 + (i % 3) * 6;
      var span = RA.W + 40;
      var x = ((t * sp + i * 157) % span) - 20;
      var y = (opts.top || 30) + (i * 41) % (opts.band || 120)
            + Math.sin(t * 1.8 + i * 2.1) * 11;
      var frame = Math.floor(t * 9 + i) % 2;
      RA.spr.draw(ctx, 'butterfly', Math.round(x), Math.round(y),
                  { frame: frame, alpha: opts.alpha === undefined ? 1 : opts.alpha });
    }
  };

  /* ------------------------------------------- scrolling checker floor */
  BG.checker = function (ctx, y, h, offset, a, b, cell) {
    cell = cell || 12;
    a = a || '#26284a'; b = b || '#3f4373';
    var off = Math.floor(offset) % (cell * 2);
    for (var yy = y; yy < y + h; yy += cell) {
      for (var xx = -cell * 2; xx < RA.W + cell * 2; xx += cell) {
        var row = Math.floor((yy - y) / cell);
        var col = Math.floor((xx + off) / cell);
        ctx.fillStyle = ((row + col) & 1) ? a : b;
        ctx.fillRect(xx - off + (off % cell), yy, cell, Math.min(cell, y + h - yy));
      }
    }
  };

})();
