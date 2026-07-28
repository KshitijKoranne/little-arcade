/* =====================================================================
   core/font.js — hand-drawn 5x7 bitmap font.

   Every glyph below was plotted by hand. They are baked once into a
   white atlas; coloured text re-tints a cached copy of that atlas, so
   drawing a string costs one drawImage per character and nothing else.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var GW = 5, GH = 7, GAP = 1;   // glyph width, height, tracking

  /* Rows are top-to-bottom, '#' = lit pixel. */
  var GLYPHS = {
    'A': '.###./#...#/#...#/#####/#...#/#...#/#...#',
    'B': '####./#...#/#...#/####./#...#/#...#/####.',
    'C': '.###./#...#/#..../#..../#..../#...#/.###.',
    'D': '####./#...#/#...#/#...#/#...#/#...#/####.',
    'E': '#####/#..../#..../####./#..../#..../#####',
    'F': '#####/#..../#..../####./#..../#..../#....',
    'G': '.###./#...#/#..../#.###/#...#/#...#/.####',
    'H': '#...#/#...#/#...#/#####/#...#/#...#/#...#',
    'I': '.###./..#../..#../..#../..#../..#../.###.',
    'J': '..###/...#./...#./...#./...#./#..#./.##..',
    'K': '#...#/#..#./#.#../##.../#.#../#..#./#...#',
    'L': '#..../#..../#..../#..../#..../#..../#####',
    'M': '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#',
    'N': '#...#/##..#/#.#.#/#.#.#/#..##/#...#/#...#',
    'O': '.###./#...#/#...#/#...#/#...#/#...#/.###.',
    'P': '####./#...#/#...#/####./#..../#..../#....',
    'Q': '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#',
    'R': '####./#...#/#...#/####./#.#../#..#./#...#',
    'S': '.####/#..../#..../.###./....#/....#/####.',
    'T': '#####/..#../..#../..#../..#../..#../..#..',
    'U': '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
    'V': '#...#/#...#/#...#/#...#/#...#/.#.#./..#..',
    'W': '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#',
    'X': '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
    'Y': '#...#/#...#/.#.#./..#../..#../..#../..#..',
    'Z': '#####/....#/...#./..#../.#.../#..../#####',

    '0': '.###./#...#/#..##/#.#.#/##..#/#...#/.###.',
    '1': '..#../.##../..#../..#../..#../..#../.###.',
    '2': '.###./#...#/....#/...#./..#../.#.../#####',
    '3': '####./....#/....#/.###./....#/....#/####.',
    '4': '...#./..##./.#.#./#..#./#####/...#./...#.',
    '5': '#####/#..../####./....#/....#/#...#/.###.',
    '6': '..##./.#.../#..../####./#...#/#...#/.###.',
    '7': '#####/....#/...#./..#../.#.../.#.../.#...',
    '8': '.###./#...#/#...#/.###./#...#/#...#/.###.',
    '9': '.###./#...#/#...#/.####/....#/...#./.##..',

    ' ': '...../...../...../...../...../...../.....',
    '.': '...../...../...../...../...../.##../.##..',
    ',': '...../...../...../...../.##../.##../.#...',
    '!': '..#../..#../..#../..#../..#../...../..#..',
    '?': '.###./#...#/....#/...#./..#../...../..#..',
    ':': '...../.##../.##../...../.##../.##../.....',
    ';': '...../.##../.##../...../.##../.##../.#...',
    '-': '...../...../...../#####/...../...../.....',
    '_': '...../...../...../...../...../...../#####',
    '+': '...../..#../..#../#####/..#../..#../.....',
    '=': '...../...../#####/...../#####/...../.....',
    '/': '....#/...#./...#./..#../.#.../.#.../#....',
    '\\': '#..../.#.../.#.../..#../...#./...#./....#',
    "'": '..#../..#../...../...../...../...../.....',
    '"': '.#.#./.#.#./...../...../...../...../.....',
    '(': '...#./..#../.#.../.#.../.#.../..#../...#.',
    ')': '.#.../..#../...#./...#./...#./..#../.#...',
    '[': '..###/..#../..#../..#../..#../..#../..###',
    ']': '###../..#../..#../..#../..#../..#../###..',
    '<': '...#./..#../.#.../#..../.#.../..#../...#.',
    '>': '.#.../..#../...#./....#/...#./..#../.#...',
    '*': '...../#.#.#/.###./#####/.###./#.#.#/.....',
    '%': '##..#/##..#/...#./..#../.#.../#..##/#..##',
    '&': '.##../#..#./#..#./.##../#.#.#/#..#./.##.#',
    '@': '.###./#...#/#.###/#.#.#/#.###/#..../.###.',
    '#': '.#.#./#####/.#.#./#####/.#.#./...../.....',
    '$': '..#../.####/#.#../.###./..#.#/####./..#..',
    '^': '..#../.#.#./#...#/...../...../...../.....',
    '~': '...../...../.##.#/#..##/...../...../.....',
    '|': '..#../..#../..#../..#../..#../..#../..#..',

    /* A few pictographs. Handy inline in HUD strings. */
    '♥': '...../.#.#./#####/#####/.###./..#../.....',  // heart
    '★': '..#../..#../#####/.###./.#.#./#...#/.....',  // star
    '•': '...../...../..#../.###./..#../...../.....',  // dot
    '→': '...../..#../...#./#####/...#./..#../.....',  // arrow right
    '←': '...../..#../.#.../#####/.#.../..#../.....'   // arrow left
  };

  var ORDER = Object.keys(GLYPHS);
  var INDEX = {};
  for (var i = 0; i < ORDER.length; i++) INDEX[ORDER[i]] = i;

  /* ---- bake the white master atlas ------------------------------------ */
  var atlasW = ORDER.length * GW;
  var master = RA.util.makeCanvas(atlasW, GH);
  (function bake() {
    var g = master.getContext('2d');
    if (!g) return;
    g.fillStyle = '#ffffff';
    for (var n = 0; n < ORDER.length; n++) {
      var rows = GLYPHS[ORDER[n]].split('/');
      for (var y = 0; y < GH; y++) {
        var row = rows[y] || '';
        for (var x = 0; x < GW; x++) {
          if (row.charAt(x) === '#') g.fillRect(n * GW + x, y, 1, 1);
        }
      }
    }
  })();

  /* ---- tinted atlas cache --------------------------------------------- */
  var tints = {};
  function atlasFor(color) {
    if (color === '#ffffff' || !color) return master;
    var hit = tints[color];
    if (hit) return hit;
    var c = RA.util.makeCanvas(atlasW, GH);
    var g = c.getContext('2d');
    if (g) {
      g.drawImage(master, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, atlasW, GH);
      g.globalCompositeOperation = 'source-over';
    }
    tints[color] = c;
    return c;
  }

  /* ---- public API ------------------------------------------------------ */
  var Font = RA.font = {};

  Font.charW = GW;
  Font.charH = GH;

  /** Pixel width of a string at the given scale. */
  Font.width = function (text, scale) {
    var s = scale || 1;
    text = String(text);
    if (!text.length) return 0;
    return (text.length * (GW + GAP) - GAP) * s;
  };

  Font.height = function (scale) { return GH * (scale || 1); };

  /**
   * Draw text.
   * opts: { scale, color, align:'left'|'center'|'right', shadow, shadowColor,
   *         outline, outlineColor, alpha, wave, waveTime }
   */
  Font.draw = function (ctx, text, x, y, opts) {
    opts = opts || {};
    text = String(text === undefined || text === null ? '' : text).toUpperCase();

    var scale = opts.scale || 1;
    var color = opts.color || '#ffffff';
    var step = (GW + GAP) * scale;
    var total = Font.width(text, scale);

    var ox = x;
    if (opts.align === 'center') ox = Math.round(x - total / 2);
    else if (opts.align === 'right') ox = Math.round(x - total);
    ox = Math.round(ox);
    var oy = Math.round(y);

    var prevAlpha = ctx.globalAlpha;
    if (opts.alpha !== undefined) ctx.globalAlpha = prevAlpha * opts.alpha;

    /* Outline is drawn as 4 offset passes — cheap and very readable
       against busy pixel backgrounds. */
    if (opts.outline) {
      var oc = opts.outlineColor || '#12132b';
      var d = scale;
      blit(ctx, text, ox - d, oy, scale, oc, opts);
      blit(ctx, text, ox + d, oy, scale, oc, opts);
      blit(ctx, text, ox, oy - d, scale, oc, opts);
      blit(ctx, text, ox, oy + d, scale, oc, opts);
    }
    if (opts.shadow) {
      blit(ctx, text, ox + scale, oy + scale, scale, opts.shadowColor || '#12132b', opts);
    }
    blit(ctx, text, ox, oy, scale, color, opts);

    ctx.globalAlpha = prevAlpha;
    return total;
  };

  function blit(ctx, text, x, y, scale, color, opts) {
    var atlas = atlasFor(color);
    var step = (GW + GAP) * scale;
    var wave = opts.wave || 0;
    var t = opts.waveTime || 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var idx = INDEX[ch];
      if (idx === undefined) idx = INDEX['?'];
      if (ch === ' ') continue;
      var dy = wave ? Math.round(Math.sin(t * 6 + i * 0.6) * wave) : 0;
      ctx.drawImage(
        atlas,
        idx * GW, 0, GW, GH,
        x + i * step, y + dy, GW * scale, GH * scale
      );
    }
  }

  /**
   * Word-wrapped text block. Returns the number of lines drawn.
   */
  Font.wrap = function (ctx, text, x, y, maxWidth, opts) {
    opts = opts || {};
    var scale = opts.scale || 1;
    var lineH = (GH + 3) * scale;
    var words = String(text).toUpperCase().split(' ');
    var line = '';
    var lines = [];
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (Font.width(test, scale) > maxWidth && line) {
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    for (var n = 0; n < lines.length; n++) {
      Font.draw(ctx, lines[n], x, y + n * lineH, opts);
    }
    return lines.length;
  };

  Font.wrapHeight = function (text, maxWidth, scale) {
    scale = scale || 1;
    var words = String(text).toUpperCase().split(' ');
    var line = '', count = 0;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + ' ' + words[i] : words[i];
      if (Font.width(test, scale) > maxWidth && line) { count++; line = words[i]; }
      else line = test;
    }
    if (line) count++;
    return count * (GH + 3) * scale;
  };

})();
