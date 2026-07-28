/* =====================================================================
   core/sprites.js — sprite bank.

   Sprites are authored as arrays of strings. Each character is a key into
   RA.PAL ('.' = transparent). They are baked to offscreen canvases once
   at load, so drawing is a single drawImage.

   The decoder can add an automatic 1px dark outline around a silhouette
   (the way you'd do it by hand, but without hand-plotting every edge
   pixel). That is why the art below only describes the shape and its
   interior details.

   Want to swap in PNG art later? RA.spr.defineImage(name, img) accepts a
   loaded <img> and everything downstream keeps working.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var PAL = RA.PAL;
  var mk = RA.util.makeCanvas;

  var bank = {};

  /* ---------------------------------------------------------------- bake */
  function bakeFrame(rows, opts) {
    opts = opts || {};
    var h = rows.length;
    var w = 0, i;
    for (i = 0; i < h; i++) w = Math.max(w, rows[i].length);

    var pad = opts.outline === false ? 0 : 1;
    var c = mk(w + pad * 2, h + pad * 2);
    var g = c.getContext('2d');
    if (!g) return { canvas: c, w: w, h: h, pad: pad };

    /* pass 1 — outline: any empty cell touching a solid cell */
    if (pad) {
      var oc = PAL[opts.outlineColor || '0'] || '#12132b';
      g.fillStyle = oc;
      for (var y = -1; y <= h; y++) {
        for (var x = -1; x <= w; x++) {
          if (solid(rows, x, y)) continue;
          if (solid(rows, x - 1, y) || solid(rows, x + 1, y) ||
              solid(rows, x, y - 1) || solid(rows, x, y + 1)) {
            g.fillRect(x + pad, y + pad, 1, 1);
          }
        }
      }
    }

    /* pass 2 — the art itself */
    for (var yy = 0; yy < h; yy++) {
      var row = rows[yy];
      for (var xx = 0; xx < row.length; xx++) {
        var ch = row.charAt(xx);
        var col = PAL[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(xx + pad, yy + pad, 1, 1);
      }
    }
    return { canvas: c, w: w, h: h, pad: pad };
  }

  function solid(rows, x, y) {
    if (y < 0 || y >= rows.length) return false;
    var row = rows[y];
    if (x < 0 || x >= row.length) return false;
    var ch = row.charAt(x);
    return ch !== '.' && ch !== '' && ch !== ' ';
  }

  var Spr = RA.spr = {};

  /** Define a single-frame sprite. */
  Spr.def = function (name, rows, opts) {
    var f = bakeFrame(rows, opts);
    bank[name] = { frames: [f], w: f.w, h: f.h, pad: f.pad };
    return bank[name];
  };

  /** Define a multi-frame sprite (array of row-arrays). */
  Spr.defAnim = function (name, frameList, opts) {
    var frames = frameList.map(function (rows) { return bakeFrame(rows, opts); });
    bank[name] = { frames: frames, w: frames[0].w, h: frames[0].h, pad: frames[0].pad };
    return bank[name];
  };

  /** Adopt an already-loaded image as a sprite (future PNG workflow). */
  Spr.defineImage = function (name, img) {
    bank[name] = {
      frames: [{ canvas: img, w: img.width, h: img.height, pad: 0 }],
      w: img.width, h: img.height, pad: 0
    };
    return bank[name];
  };

  Spr.has = function (name) { return !!bank[name]; };
  Spr.get = function (name) { return bank[name]; };
  Spr.size = function (name) {
    var s = bank[name];
    return s ? { w: s.w, h: s.h } : { w: 0, h: 0 };
  };

  /**
   * Draw a sprite with its top-left at (x, y) in logical pixels.
   * opts: { frame, scale, flipX, flipY, alpha, rotate, originX, originY }
   */
  Spr.draw = function (ctx, name, x, y, opts) {
    var s = bank[name];
    if (!s) return;
    opts = opts || {};
    var f = s.frames[(opts.frame || 0) % s.frames.length];
    var scale = opts.scale || 1;
    var pad = f.pad;
    var dw = (f.w + pad * 2) * scale;
    var dh = (f.h + pad * 2) * scale;
    var dx = Math.round(x) - pad * scale;
    var dy = Math.round(y) - pad * scale;

    var prevAlpha = ctx.globalAlpha;
    if (opts.alpha !== undefined) ctx.globalAlpha = prevAlpha * opts.alpha;

    if (opts.flipX || opts.flipY || opts.rotate) {
      ctx.save();
      var cx = dx + dw / 2, cy = dy + dh / 2;
      ctx.translate(cx, cy);
      if (opts.rotate) ctx.rotate(opts.rotate);
      ctx.scale(opts.flipX ? -1 : 1, opts.flipY ? -1 : 1);
      ctx.drawImage(f.canvas, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(f.canvas, dx, dy, dw, dh);
    }
    ctx.globalAlpha = prevAlpha;
  };

  /** Draw centred on (x, y) — the common case for entities. */
  Spr.drawC = function (ctx, name, x, y, opts) {
    var s = bank[name];
    if (!s) return;
    var scale = (opts && opts.scale) || 1;
    Spr.draw(ctx, name, x - (s.w * scale) / 2, y - (s.h * scale) / 2, opts);
  };

  /** Flat silhouette in one colour — used for locked stickers. */
  Spr.drawSilhouette = function (ctx, name, x, y, color, opts) {
    var s = bank[name];
    if (!s) return;
    opts = opts || {};
    var f = s.frames[(opts.frame || 0) % s.frames.length];
    var scale = opts.scale || 1;
    var key = name + '|' + (opts.frame || 0) + '|' + color;
    if (!silCache[key]) {
      var c = mk(f.canvas.width, f.canvas.height);
      var g = c.getContext('2d');
      g.drawImage(f.canvas, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
      silCache[key] = c;
    }
    ctx.drawImage(
      silCache[key],
      Math.round(x) - f.pad * scale,
      Math.round(y) - f.pad * scale,
      silCache[key].width * scale,
      silCache[key].height * scale
    );
  };
  var silCache = {};

  /* ===================================================================
     ============================ THE ART ==============================
     =================================================================== */

  /* ---------------------------------------------------- RITHYA (12x16)
     Dark hair, gold clip, pink dress. Legs are swapped per frame so she
     actually runs rather than sliding.                                  */
  var GIRL_BODY = [
    '....0000....',
    '..00000000..',
    '.0000000c00.',
    '.00ssssss00.',
    '.0ss0ss0ss0.',
    '.0ssssssss0.',
    '.0s9ssss9s0.',
    '..0ssssss0..',
    '...0ssss0...',
    '..99999999..',
    '.9998899999.',
    '.9988888899.',
    '999888888999',
    '.9988888899.'
  ];
  function girl(legs) { return GIRL_BODY.concat(legs); }

  Spr.defAnim('girl_idle', [
    girl(['...vv..vv...', '..000..000..']),
    girl(['...vv..vv...', '..000..000..'])
  ]);
  Spr.defAnim('girl_run', [
    girl(['..vv....vv..', '.000....000.']),
    girl(['...vvvvvv...', '..00....00..']),
    girl(['....vvvv....', '...00..00...']),
    girl(['...vvvvvv...', '..00....00..'])
  ]);
  Spr.def('girl_jump', girl(['..vvv..vvv..', '.00......00.']));
  Spr.def('girl_fall', girl(['...vv..vv...', '..00....00..']));

  /* ------------------------------------------------ BUTTERFLY (11x8) x2
     The one thing from the first draft that deserved to survive — as
     actual pixels this time.                                            */
  Spr.defAnim('butterfly', [
    [
      '.pp.....pp.',
      'pppp...pppp',
      'ppoop.poopp',
      '.ppp0q0ppp.',
      '..pp0q0pp..',
      '..p.0q0.p..',
      '....000....',
      '...........'
    ],
    [
      '...........',
      '..pp...pp..',
      '.ppp0q0ppp.',
      '.ppo0q0opp.',
      '..pp0q0pp..',
      '...p0q0p...',
      '....000....',
      '...........'
    ]
  ]);

  /* ------------------------------------------------------- FRUIT (8x8) */
  Spr.def('fruit_apple', [
    '...jj...',
    '..jhj...',
    '.tttttt.',
    'ttssttt t'.replace(' ', ''),
    'tsstttut',
    'ttttttut',
    '.tttuut.',
    '..tuut..'
  ]);
  Spr.def('fruit_cherry', [
    '....jj..',
    '...j.j..',
    '..j..j..',
    '.j...j..',
    'uau.uau.',
    'aaa.aaa.',
    '.a...a..',
    '........'
  ]);
  Spr.def('fruit_pear', [
    '...j....',
    '..hj....',
    '...cc...',
    '..cccc..',
    '.cccbcc.',
    'cccbbccc',
    'ccccccc.',
    '.cccccc.'
  ]);
  Spr.def('fruit_plum', [
    '...h....',
    '..pppp..',
    '.pqoqpp.',
    'pqooqqpp',
    'pqqqqqpp',
    'pqqqqqqp',
    '.qqqqqq.',
    '..qqqq..'
  ]);
  Spr.def('fruit_orange', [
    '..jhj...',
    '.dddddd.',
    'dddbdddd',
    'ddbbdddd',
    'dddddddd',
    'dddddded',
    '.dddeed.',
    '..dddd..'
  ]);
  Spr.def('fruit_berry', [
    '..hjh...',
    '.mmmmm..',
    'mmnmmmm.',
    'mnnmmmmm',
    'mmmmmmmm',
    '.mmmmmm.',
    '..mmmm..',
    '........'
  ]);
  Spr.def('fruit_melon', [
    '........',
    '..tttt..',
    '.tttttt.',
    'tt9tt9tt',
    'gtttttt g'.replace(' ', ''),
    'ggggggg.',
    '.iiiii..',
    '........'
  ]);
  Spr.def('fruit_grape', [
    '...j....',
    '..qqq...',
    '.qqqqq..',
    'qqoqqqq.',
    '.qqqqq..',
    '..qqq...',
    '...q....',
    '........'
  ]);

  /* --------------------------------------------------- HAZARDS (8x8) */
  Spr.def('haz_rock', [
    '........',
    '..zzz...',
    '.zzyyzz.',
    'zzyyyzzz',
    'zzzzzzzz',
    '.zzzzzz.',
    '..zzzz..',
    '........'
  ]);
  Spr.def('haz_thorn', [
    '...0....',
    '.0.0.0..',
    '.00000..',
    'j0jjj0j.',
    '.jjjjj..',
    '..jjj...',
    '..iii...',
    '...i....'
  ]);

  /* ---------------------------------------------------- PICKUPS */
  Spr.def('star', [
    '...cc...',
    '...bb...',
    'ccbbbbcc',
    '.cbbbbc.',
    '..cbbc..',
    '.cc..cc.',
    '.c....c.',
    '........'
  ]);
  Spr.def('star_small', [
    '..c..',
    '.ccc.',
    'ccbcc',
    '.c.c.',
    'c...c'
  ]);
  Spr.def('heart', [
    '.99.99.',
    '9889889',
    '9888889',
    '.98889.',
    '..989..',
    '...9...'
  ]);
  Spr.def('heart_empty', [
    '.22.22.',
    '2..2..2',
    '2.....2',
    '.2...2.',
    '..2.2..',
    '...2...'
  ]);
  Spr.def('gem', [
    '..ooo...',
    '.oppppo.',
    'oppqqppo',
    '.pqqqqp.',
    '..pqqp..',
    '...qq...',
    '........',
    '........'
  ]);
  Spr.def('lock', [
    '..zzz..',
    '.z...z.',
    '.z...z.',
    'yyyyyyy',
    'yy0y0yy',
    'yy000yy',
    'yyyyyyy'
  ]);

  /* ------------------------------------------------ CATCH: BASKET 22x13 */
  Spr.def('basket', [
    'vvvvvvvvvvvvvvvvvvvvvv',
    'vwwwwwwwwwwwwwwwwwwwwv',
    'wvwvwvwvwvwvwvwvwvwvwv',
    'wwvwvwvwvwvwvwvwvwvwww',
    'wvwvwvwvwvwvwvwvwvwvwv',
    '.wwvwvwvwvwvwvwvwvwww.',
    '.wvwvwvwvwvwvwvwvwvwv.',
    '.wwwvwvwvwvwvwvwvwwww.',
    '..wvwvwvwvwvwvwvwvwv..',
    '..wwwwvwvwvwvwvwwwww..',
    '...wwwwwvwvwvwwwwww...',
    '....wwwwwwwwwwwwww....',
    '......xxxxxxxxxx......'
  ]);

  /* ------------------------------------------------- MEMORY: CREATURES
     16x16 head portraits. Silhouette + interior detail only; the outline
     pass does the rest.                                                  */
  Spr.def('an_cat', [
    '................',
    '..dd........dd..',
    '..ddd......ddd..',
    '..dd9dddddd9dd..',
    '..dddddddddddd..',
    '.dddddddddddddd.',
    '.dddddddddddddd.',
    '.ddd0dddddd0ddd.',
    '.dddddddddddddd.',
    '.ddddddd99ddddd.',
    '..dddd0dd0dddd..',
    '..dddddddddddd..',
    '...dddddddddd...',
    '....dddddddd....',
    '......dddd......',
    '................'
  ]);
  Spr.def('an_bunny', [
    '....55....55....',
    '....58....85....',
    '....58....85....',
    '....55....55....',
    '...5555555555...',
    '..555555555555..',
    '.55555555555555.',
    '.55055555550555.',
    '.55555555555555.',
    '.5555558855555..',
    '..55555005555...',
    '..555555555555..',
    '...5555555555...',
    '....55555555....',
    '......5555......',
    '................'
  ]);
  Spr.def('an_fox', [
    '................',
    '..ee........ee..',
    '..eee......eee..',
    '..ee5eeeeee5ee..',
    '..dddddddddddd..',
    '.dddddddddddddd.',
    '.dddddddddddddd.',
    '.ddd0dddddd0ddd.',
    '.dddddddddddddd.',
    '.5555dddddd5555.',
    '..5555500555555.',
    '..555555555555..',
    '...5555555555...',
    '....55555555....',
    '......5555......',
    '................'
  ]);
  Spr.def('an_panda', [
    '................',
    '..00........00..',
    '..000......000..',
    '..000000000000..',
    '..555555555555..',
    '.55555555555555.',
    '.50005555500055.',
    '.50605555506055.',
    '.50005555500055.',
    '.55555000055555.',
    '..5555500055555.',
    '..555550055555..',
    '...5555555555...',
    '....55555555....',
    '......5555......',
    '................'
  ]);
  Spr.def('an_frog', [
    '...hh......hh...',
    '..h66h....h66h..',
    '..h606h..h606h..',
    '..hh66hhhh66hh..',
    '..hhhhhhhhhhhh..',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.',
    '.hhiiiiiiiiiihh.',
    '.hhhhhhhhhhhhhh.',
    '..hhhhhhhhhhhh..',
    '..iiiiiiiiiiii..',
    '...iiiiiiiiii...',
    '....iiiiiiii....',
    '......iiii......',
    '................'
  ]);
  Spr.def('an_owl', [
    '................',
    '..ww........ww..',
    '..www......www..',
    '..wwwwwwwwwwww..',
    '..wwwwwwwwwwww..',
    '.wwbbbwwwwbbbww.',
    '.wb060wwwb060bw.',
    '.wbbbbwddwbbbbw.',
    '.wwwwwwddwwwwww.',
    '.wwvvwwwwwwvvww.',
    '..wwvvwwwwvvww..',
    '..wwwwwwwwwwww..',
    '...wwwwwwwwww...',
    '....wwwwwwww....',
    '.....dd..dd.....',
    '................'
  ]);
  Spr.def('an_bee', [
    '................',
    '...0......0.....',
    '....0....0......',
    '.....cccccc.....',
    '....cccccccc....',
    '...cc0cccc0cc...',
    '...cccccccccc...',
    '..000000000000..',
    '..cccccccccccc..',
    '..000000000000..',
    '..cccccccccccc..',
    '...0000000000...',
    '....cccccccc....',
    '.....cccccc.....',
    '.......00.......',
    '................'
  ]);
  Spr.def('an_whale', [
    '................',
    '.......kk.......',
    '......kkkk......',
    '................',
    '...mmmmmmmmm....',
    '..mmmmmmmmmmm.m.',
    '.mmmmmmmmmmmmmm.',
    '.mm0mmmmmmmmmmmm',
    '.mmmmmmmmmmmmmm.',
    '.lllllllllllll..',
    '..lllllllllll...',
    '...lllllllll....',
    '................',
    '................',
    '................',
    '................'
  ]);

  RA.ANIMALS = ['an_cat', 'an_bunny', 'an_fox', 'an_panda',
                'an_frog', 'an_owl', 'an_bee', 'an_whale'];
  RA.FRUITS = ['fruit_apple', 'fruit_cherry', 'fruit_pear', 'fruit_plum',
               'fruit_orange', 'fruit_berry', 'fruit_melon', 'fruit_grape'];

  /* ------------------------------------------------- HOPPER: PLATFORMS */
  Spr.def('plat_cloud', [
    '....555555......',
    '..5566666655....',
    '.556666666655...',
    '5566666666666555',
    '5666666666666665',
    '.4444444444444..',
    '..333333333.....'
  ], { outline: false });
  Spr.def('plat_leaf', [
    '..hhhhhhhhhhhh..',
    '.hhggggggggggh h'.replace(' ', ''),
    'hhgggghhggggghh',
    'hhggggggggggghh',
    '.iiiiiiiiiiiii..',
    '..jjjjjjjjjjj...'
  ]);
  Spr.def('plat_spring', [
    '..ttttt...',
    '.tt999tt..',
    '..ttttt...',
    '...ccc....',
    '...ccc....',
    '..ccccc...'
  ]);
  Spr.defAnim('bird', [
    ['..lll.......', '.lllll..kkk.', 'llllllllkkk.', '.llllllll0k.', '..lll.......'],
    ['............', '.lllll......', 'llllllllkkk.', '.llllllll0k.', '..lllll.....']
  ]);

  /* ------------------------------------------------------- MAZE TILES */
  Spr.def('tile_hedge', [
    'iiiihiii',
    'ihiiiiii',
    'iiiiihii',
    'iihiiiii',
    'iiiiiihi',
    'ihiiiiii',
    'iiiihiii',
    'iiiiiiii'
  ], { outline: false });
  Spr.def('tile_floor', [
    'gggggggg',
    'gggghggg',
    'gggggggg',
    'ghgggggg',
    'gggggggg',
    'ggggggHg'.replace('H', 'h'),
    'gggggggg',
    'ghgggggg'
  ], { outline: false });
  Spr.def('maze_gate', [
    '.cccccc.',
    'cbbbbbbc',
    'cb0000bc',
    'cb0..0bc',
    'cb0..0bc',
    'cbbbbbbc',
    '.cccccc.',
    '..cccc..'
  ]);
  Spr.defAnim('sleepy_bee', [
    ['..5..5....', '.5.55.5...', '..cccccc..', '.c0cc0cc..', '.0000000c.', '..cccccc..', '...0000...'],
    ['.........', '..5..5....', '..cccccc..', '.c0cc0cc..', '.0000000c.', '..cccccc..', '...0000...']
  ]);

  /* -------------------------------------------------------- PAINT TOOLS */
  Spr.def('palette', [
    '..vvvvvv..',
    '.vv9999vv.',
    'vv9cc99lvv',
    'v99cchhl9v',
    'vv9hhllpvv',
    '.vvpppvvv.',
    '..vvvvvv..',
    '...vvvv...'
  ]);
  Spr.def('brush', [
    '......ww',
    '.....ww.',
    '....ww..',
    '...yy...',
    '..99....',
    '.999....',
    '.99.....',
    '........'
  ]);

  /* ---------------------------------------------------- STICKERS (16x16)
     Album rewards. Locked ones render as silhouettes.                   */
  Spr.def('st_trophy', [
    '................',
    '..cccccccccccc..',
    '..cbbbbbbbbbbc..',
    '.ccbbbbbbbbbbcc.',
    'dccbbbbbbbbbbccd',
    'd.cbbbbbbbbbbc.d',
    'd..cbbbbbbbbc..d',
    'dd..cbbbbbbc..dd',
    '.....cbbbbc.....',
    '......cbbc......',
    '.......cc.......',
    '.......cc.......',
    '.....ddddd......',
    '....ddddddd.....',
    '...ddddddddd....',
    '................'
  ]);
  Spr.def('st_crown', [
    '................',
    '................',
    '...c........c...',
    '..ccc......ccc..',
    '..ccc..cc..ccc..',
    '.cccc.cccc.cccc.',
    '.cccccccccccccc.',
    '.cbbcccccccbbcc.',
    '.cccccccccccccc.',
    '.cc9ccccccc9ccc.',
    '.cccccccccccccc.',
    '.dddddddddddddd.',
    '................',
    '................',
    '................',
    '................'
  ]);
  Spr.def('st_rainbow', [
    '................',
    '.....tttttt.....',
    '...tttttttttt...',
    '..tt........tt..',
    '..tdddddddddd t.'.replace(' ', ''),
    '.tdd........ddt.',
    '.tdccccccccccdt.',
    '.tdc........cdt.',
    '.tdchhhhhhhhcdt.',
    '.tdch......hcdt.',
    '.tdchllllllhcdt.',
    '.tdchl....lhcdt.',
    '..dchl....lhcd..',
    '...chl....lhc...',
    '................',
    '................'
  ]);
  Spr.def('st_cupcake', [
    '................',
    '.......9........',
    '......999.......',
    '.....99999......',
    '....9999999.....',
    '...999999999....',
    '..99999999999...',
    '..77777777777...',
    '.7777777777777..',
    '.vvvvvvvvvvvvv..',
    '.vwvwvwvwvwvwv..',
    '.vvvvvvvvvvvvv..',
    '..vwvwvwvwvwv...',
    '..vvvvvvvvvvv...',
    '...vvvvvvvvv....',
    '................'
  ]);
  Spr.def('st_rocket', [
    '.......6........',
    '......666.......',
    '......656.......',
    '.....66566......',
    '.....6lll6......',
    '.....6lll6......',
    '....66666666....',
    '...9666666669...',
    '..99966666699 9.'.replace(' ', ''),
    '..99.666666.99..',
    '.....666666.....',
    '......dddd......',
    '.....dtttd......',
    '......dtd.......',
    '.......d........',
    '................'
  ]);
  Spr.def('st_flower', [
    '................',
    '.....8888.......',
    '....888888......',
    '..88.8888.88....',
    '.8888ccc8888....',
    '.8888ccc8888....',
    '.8888ccc8888....',
    '..88.8888.88....',
    '....888888......',
    '.....i88i.......',
    '......ii........',
    '....hhiihh......',
    '...hh.ii.hh.....',
    '......ii........',
    '......ii........',
    '................'
  ]);
  Spr.def('st_moon', [
    '................',
    '......cccc......',
    '....cccccccc....',
    '...ccc....ccc...',
    '..ccc......bbc..',
    '..cc.......bbc..',
    '.ccc........cc..',
    '.ccc........cc..',
    '.ccc........cc..',
    '..cc.......ccc..',
    '..ccc.....cccc..',
    '...ccc...cccc...',
    '....cccccccc....',
    '......cccc......',
    '................',
    '................'
  ]);
  Spr.def('st_diamond', [
    '................',
    '....kkkkkkkk....',
    '...klllllllk....',
    '..kllllllllk....',
    '.klllllllllk....',
    '.kllllllllllk...',
    '..kllllllllk....',
    '...kllllllk.....',
    '....kllllk......',
    '.....kllk.......',
    '......kk........',
    '................',
    '................',
    '................',
    '................',
    '................'
  ]);

  /* Reused as stickers too: an_cat, an_unicorn stand-in (an_bunny),
     fruit_apple, star. Declared in save.js's sticker table. */

  /* -------------------------------------------------------- UI BITS */
  Spr.def('arrow_l', [
    '...c.',
    '..cc.',
    '.ccc.',
    'cccc.',
    '.ccc.',
    '..cc.',
    '...c.'
  ]);
  Spr.def('arrow_r', [
    '.c...',
    '.cc..',
    '.ccc.',
    '.cccc',
    '.ccc.',
    '.cc..',
    '.c...'
  ]);
  Spr.def('note', [
    '...ccc',
    '...c.c',
    '...ccc',
    '...c..',
    '...c..',
    'ccc c.'.replace(' ', '.'),
    'ccc...'
  ]);
  Spr.def('cog', [
    '..y..y..',
    '.yyyyyy.',
    'yyy00yyy',
    '.y0..0y.',
    '.y0..0y.',
    'yyy00yyy',
    '.yyyyyy.',
    '..y..y..'
  ]);

})();
