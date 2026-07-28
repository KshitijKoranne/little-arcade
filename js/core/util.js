/* =====================================================================
   core/util.js — namespace, constants, maths helpers, palette, storage.
   Loaded first. Everything else hangs off window.RA.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA = window.RA || {};

  /* ---- virtual screen -------------------------------------------------
     Every game draws into this fixed grid. The canvas is scaled up as a
     whole, which is what keeps the pixels honest.                        */
  RA.W = 480;
  RA.H = 270;

  /* ---- 36 colour palette ----------------------------------------------
     Organised as hue ramps (dark -> light) so sprites shade consistently.
     Sprite data references these by single character, which keeps the
     sprite strings readable.                                             */
  RA.PAL = {
    '.': null,          // transparent

    '0': '#12132b',     // ink       (darkest)
    '1': '#26284a',
    '2': '#3f4373',
    '3': '#6a70a8',
    '4': '#a8aed8',
    '5': '#e8ecff',
    '6': '#ffffff',     // white

    '7': '#ffd9ec',     // pink ramp
    '8': '#ff9ec4',
    '9': '#ef5b93',
    'a': '#b02a63',

    'b': '#fff0bd',     // gold ramp
    'c': '#ffd45c',
    'd': '#f7a72b',
    'e': '#d96b1c',
    'f': '#8f3f16',

    'g': '#d8f7c0',     // green ramp
    'h': '#8fe07a',
    'i': '#3fae5c',
    'j': '#1d7a45',

    'k': '#bff0ff',     // blue ramp
    'l': '#63c9f0',
    'm': '#2f7fd6',
    'n': '#1b4a9e',

    'o': '#e8d4ff',     // purple ramp
    'p': '#b48cf5',
    'q': '#7a4fd1',
    'r': '#4a2a8f',

    's': '#ffb0a0',     // red / coral ramp
    't': '#f2705c',
    'u': '#b83f3a',

    'v': '#d9b48c',     // brown / wood ramp
    'w': '#a5714a',
    'x': '#6b422a',

    'y': '#c3cde0',     // cool grey
    'z': '#7c88a8'
  };

  /* Friendly aliases so game code reads nicely. */
  var P = RA.PAL;
  RA.C = {
    ink: P['0'], ink2: P['1'], ink3: P['2'],
    slate: P['3'], mist: P['4'], paper: P['5'], white: P['6'],
    pink: P['8'], pinkLt: P['7'], pinkDk: P['9'], plum: P['a'],
    cream: P['b'], gold: P['c'], amber: P['d'], rust: P['e'],
    leaf: P['h'], green: P['i'], forest: P['j'], mint: P['g'],
    sky: P['k'], blue: P['l'], sea: P['m'], deep: P['n'],
    lilac: P['o'], purple: P['p'], grape: P['q'], night: P['r'],
    coral: P['t'], blush: P['s'], brick: P['u'],
    sand: P['v'], wood: P['w'], bark: P['x'],
    grey: P['y'], grey2: P['z']
  };

  /* ---- maths ---------------------------------------------------------- */
  var U = RA.util = {};

  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.rand = function (a, b) { return a + Math.random() * (b - a); };
  U.randInt = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };
  U.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  U.chance = function (p) { return Math.random() < p; };
  U.sign = function (v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); };

  U.shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  /* Move `v` toward `target` by at most `step`. Frame-rate friendly. */
  U.approach = function (v, target, step) {
    if (v < target) return Math.min(v + step, target);
    if (v > target) return Math.max(v - step, target);
    return target;
  };

  U.dist = function (x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  };

  U.aabb = function (ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  };

  U.pointIn = function (px, py, x, y, w, h) {
    return px >= x && px < x + w && py >= y && py < y + h;
  };

  /* ---- easing --------------------------------------------------------- */
  U.easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  U.easeInCubic = function (t) { return t * t * t; };
  U.easeInOutCubic = function (t) {
    return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  U.easeOutBack = function (t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };
  U.easeOutElastic = function (t) {
    var c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 :
      Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  };
  U.easeOutBounce = function (t) {
    var n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) { t -= 1.5 / d1; return n1 * t * t + .75; }
    if (t < 2.5 / d1) { t -= 2.25 / d1; return n1 * t * t + .9375; }
    t -= 2.625 / d1; return n1 * t * t + .984375;
  };

  /* ---- seeded RNG -----------------------------------------------------
     Used by the maze generator so a level can be replayed exactly.       */
  U.rng = function (seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  };

  /* ---- text ------------------------------------------------------------ */
  U.pad = function (n, len) {
    var s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  };
  U.comma = function (n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  /* ---- storage that never throws (file:// and private mode safe) ------- */
  var memory = {};
  RA.storage = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return (key in memory) ? memory[key] : fallback;
      }
    },
    set: function (key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        memory[key] = value;
      }
    }
  };

  /* ---- tiny offscreen canvas helper ------------------------------------ */
  U.makeCanvas = function (w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, w | 0);
    c.height = Math.max(1, h | 0);
    var x = c.getContext('2d');
    if (x) x.imageSmoothingEnabled = false;
    return c;
  };

  /* Registry of games. Populated by js/games/*.js via RA.registerGame. */
  RA.games = [];
  RA.registerGame = function (def) {
    RA.games.push(def);
    if (def.scene) RA.registerScene(def.id, def.scene);
    return def;
  };

})();
