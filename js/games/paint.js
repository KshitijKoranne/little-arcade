/* =====================================================================
   games/paint.js — PIXEL PAINT

   A 46x28 pixel canvas with a proper little toolset: pen, flood fill,
   rubber, stamps, three brush sizes, mirror mode, undo, and a real PNG
   export (scaled up 12x with hard edges, so it prints nicely).

   No fail state — this is the one she can sit in for an hour.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var C = RA.C;

  var GW = 46, GH = 28, CELL = 8;
  var GX = 46, GY = 28;
  var EMPTY = 255;

  /* 20 colours, ordered as ramps so mixing looks deliberate. */
  var COLORS = [
    '#12132b', '#3f4373', '#7c88a8', '#c3cde0', '#ffffff',
    '#ef5b93', '#ff9ec4', '#ffd9ec', '#b02a63', '#f2705c',
    '#ffd45c', '#f7a72b', '#fff0bd', '#8f3f16', '#a5714a',
    '#3fae5c', '#8fe07a', '#2f7fd6', '#63c9f0', '#7a4fd1'
  ];

  var STAMPS = [
    { name: 'HEART', rows: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'] },
    { name: 'STAR',  rows: ['...X...', '...X...', 'XXXXXXX', '.XXXXX.', '..XXX..', '.XX.XX.'] },
    { name: 'FLOWER', rows: ['.X.X.', 'XXXXX', '.XXX.', 'XXXXX', '.X.X.'] },
    { name: 'SMILE', rows: ['.XXXXX.', 'X.....X', 'X.X.X.X', 'X.....X', 'X.X.X.X', 'X..XX.X', '.XXXXX.'] }
  ];

  var TOOLS = ['PEN', 'FILL', 'RUB', 'STMP'];

  RA.registerGame({
    id: 'paint',
    title: 'PAINT',
    color: '#b02a63',
    artBg: '#e8ecff',
    icon: 'palette',
    bestLabel: function () { return 'MAKE ART'; },

    preview: function (ctx, x, y, w, h, t) {
      ctx.fillStyle = '#e8ecff'; ctx.fillRect(x, y, w, h);
      /* checker to read as a canvas */
      for (var gy = 0; gy < h; gy += 4) {
        for (var gx = 0; gx < w; gx += 4) {
          if (((gx / 4 + gy / 4) & 1) === 0) {
            ctx.fillStyle = '#d6dcf0'; ctx.fillRect(x + gx, y + gy, 4, 4);
          }
        }
      }
      /* a little painting appears stroke by stroke, then resets */
      var art = [
        [3, 6, '#ef5b93'], [4, 6, '#ef5b93'], [5, 6, '#ef5b93'], [3, 7, '#ef5b93'],
        [4, 7, '#ff9ec4'], [5, 7, '#ef5b93'], [4, 8, '#ef5b93'],
        [9, 4, '#ffd45c'], [10, 4, '#ffd45c'], [9, 5, '#ffd45c'], [10, 5, '#ffd45c'],
        [14, 6, '#3fae5c'], [15, 6, '#3fae5c'], [14, 7, '#3fae5c'], [15, 7, '#8fe07a'],
        [7, 2, '#63c9f0'], [8, 2, '#63c9f0'], [12, 3, '#7a4fd1']
      ];
      var n = Math.floor((t * 4) % (art.length + 8));
      for (var i = 0; i < Math.min(n, art.length); i++) {
        ctx.fillStyle = art[i][2];
        ctx.fillRect(x + 4 + art[i][0] * 4, y + 2 + art[i][1] * 4, 4, 4);
      }
      RA.spr.draw(ctx, 'brush', x + w - 16, y + h - 16, {});
    },

    scene: function () {
      var t = 0;
      var grid = new Uint8Array(GW * GH);
      var undoStack = [];
      var color = 5, tool = 0, size = 1, mirror = false, stampIndex = 0;
      var drawing = false, lastCX = -1, lastCY = -1;
      var savedFlash = 0;
      var confirmClear = false;

      function clear() {
        for (var i = 0; i < grid.length; i++) grid[i] = EMPTY;
      }

      function pushUndo() {
        undoStack.push(new Uint8Array(grid));
        if (undoStack.length > 30) undoStack.shift();
      }

      function undo() {
        if (!undoStack.length) return;
        grid.set(undoStack.pop());
        RA.audio.sfx('back');
      }

      function setCell(cx, cy, v) {
        if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) return;
        grid[cy * GW + cx] = v;
      }

      function paintAt(cx, cy) {
        var v = tool === 2 ? EMPTY : color;
        var r = size - 1;
        for (var oy = -r; oy <= r; oy++) {
          for (var ox = -r; ox <= r; ox++) {
            setCell(cx + ox, cy + oy, v);
            if (mirror) setCell(GW - 1 - (cx + ox), cy + oy, v);
          }
        }
      }

      /* Bresenham so a quick swipe leaves a continuous line. */
      function paintLine(x0, y0, x1, y1) {
        var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        var err = dx + dy;
        var guard = 0;
        while (guard++ < 4000) {
          paintAt(x0, y0);
          if (x0 === x1 && y0 === y1) break;
          var e2 = 2 * err;
          if (e2 >= dy) { err += dy; x0 += sx; }
          if (e2 <= dx) { err += dx; y0 += sy; }
        }
      }

      function floodFill(cx, cy) {
        var target = grid[cy * GW + cx];
        if (target === color) return;
        var stack = [[cx, cy]];
        var guard = 0;
        while (stack.length && guard++ < GW * GH * 4) {
          var p = stack.pop();
          var x = p[0], y = p[1];
          if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
          if (grid[y * GW + x] !== target) continue;
          grid[y * GW + x] = color;
          stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
      }

      function stampAt(cx, cy) {
        var st = STAMPS[stampIndex];
        var h = st.rows.length, w = st.rows[0].length;
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            if (st.rows[y].charAt(x) === 'X') {
              setCell(cx - (w >> 1) + x, cy - (h >> 1) + y, color);
            }
          }
        }
      }

      function savePng() {
        var scale = 12;
        var out = U.makeCanvas(GW * scale, GH * scale);
        var g = out.getContext('2d');
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, out.width, out.height);
        for (var y = 0; y < GH; y++) {
          for (var x = 0; x < GW; x++) {
            var v = grid[y * GW + x];
            if (v === EMPTY) continue;
            g.fillStyle = COLORS[v];
            g.fillRect(x * scale, y * scale, scale, scale);
          }
        }
        try {
          var url = out.toDataURL('image/png');
          var a = document.createElement('a');
          a.href = url;
          a.download = 'rithya-painting-' + Date.now() + '.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          savedFlash = 1.6;
          RA.audio.sfx('unlock');
          RA.fx.confetti(50);
          RA.save.markPlayed('paint');
          RA.save.unlock('artist');
          RA.save.addStars(3);
        } catch (e) {
          savedFlash = 1.6;
        }
      }

      return {
        music: 'paint',

        enter: function () {
          t = 0;
          clear();
          undoStack.length = 0;
          color = 5; tool = 0; size = 1; mirror = false;
          RA.save.markPlayed('paint');
        },

        update: function (dt) {
          t += dt;
          if (savedFlash > 0) savedFlash = Math.max(0, savedFlash - dt);

          var p = RA.input.pointer;
          var inGrid = U.pointIn(p.x, p.y, GX, GY, GW * CELL, GH * CELL);
          var cx = Math.floor((p.x - GX) / CELL);
          var cy = Math.floor((p.y - GY) / CELL);

          if (p.justDown && inGrid) {
            pushUndo();
            drawing = true;
            if (tool === 1) { floodFill(cx, cy); RA.audio.sfx('pop'); drawing = false; }
            else if (tool === 3) { stampAt(cx, cy); RA.audio.sfx('coin'); drawing = false; }
            else { paintAt(cx, cy); RA.audio.sfx('draw'); }
            lastCX = cx; lastCY = cy;
          } else if (drawing && p.down) {
            if (inGrid && (cx !== lastCX || cy !== lastCY)) {
              paintLine(lastCX, lastCY, cx, cy);
              lastCX = cx; lastCY = cy;
              if (Math.random() < 0.4) RA.audio.sfx('draw');
            }
          }
          if (!p.down) drawing = false;

          /* keyboard extras */
          if (RA.input.justPressed('key:u')) undo();
        },

        draw: function (ctx) {
          ctx.fillStyle = '#26284a';
          ctx.fillRect(0, 0, RA.W, RA.H);
          ctx.fillStyle = '#1b1c33';
          for (var s = 0; s < RA.H; s += 6) ctx.fillRect(0, s, RA.W, 1);

          /* ---- canvas ---- */
          var pw = GW * CELL, ph = GH * CELL;
          ctx.fillStyle = C.ink;
          ctx.fillRect(GX - 2, GY - 2, pw + 4, ph + 4);
          for (var yy = 0; yy < GH; yy++) {
            for (var xx = 0; xx < GW; xx++) {
              var v = grid[yy * GW + xx];
              if (v === EMPTY) {
                ctx.fillStyle = ((xx + yy) & 1) ? '#e8ecff' : '#d6dcf0';
              } else {
                ctx.fillStyle = COLORS[v];
              }
              ctx.fillRect(GX + xx * CELL, GY + yy * CELL, CELL, CELL);
            }
          }

          /* mirror guide */
          if (mirror) {
            ctx.fillStyle = 'rgba(255,212,92,0.5)';
            ctx.fillRect(GX + (GW / 2) * CELL - 1, GY, 2, ph);
          }

          /* hover cursor */
          var p = RA.input.pointer;
          if (U.pointIn(p.x, p.y, GX, GY, pw, ph)) {
            var hx = GX + Math.floor((p.x - GX) / CELL) * CELL;
            var hy = GY + Math.floor((p.y - GY) / CELL) * CELL;
            var r = (size - 1) * CELL;
            ctx.fillStyle = 'rgba(18,19,43,0.85)';
            ctx.fillRect(hx - r, hy - r - 1, CELL + r * 2, 1);
            ctx.fillRect(hx - r, hy + CELL + r, CELL + r * 2, 1);
            ctx.fillRect(hx - r - 1, hy - r, 1, CELL + r * 2);
            ctx.fillRect(hx + CELL + r, hy - r, 1, CELL + r * 2);
          }

          RA.ui.begin({ nav: false });

          /* ---- top bar ---- */
          ctx.fillStyle = 'rgba(18,19,43,0.9)';
          ctx.fillRect(0, 0, RA.W, 24);
          if (RA.ui.button(ctx, 4, 2, 40, 20, '<', { color: C.grape, scale: 1, sound: 'back' })) {
            RA.go('hub');
          }
          if (RA.input.justPressed('back')) RA.go('hub');
          RA.font.draw(ctx, 'PIXEL PAINT', 42, 8, { scale: 2, color: C.pink });

          if (RA.ui.button(ctx, RA.W - 74, 3, 70, 18, 'SAVE PNG',
                           { color: C.green, scale: 1 })) savePng();
          if (RA.ui.button(ctx, RA.W - 148, 3, 34, 18, 'UNDO',
                           { color: C.sea, scale: 1, disabled: !undoStack.length })) undo();

          if (!confirmClear) {
            if (RA.ui.button(ctx, RA.W - 192, 2, 40, 20, 'CLEAR',
                             { color: C.brick, scale: 1 })) confirmClear = true;
          } else {
            /* These were 18x18 with no hit tolerance — about half the
               size a small finger reliably lands on. */
            if (RA.ui.button(ctx, RA.W - 192, 2, 32, 20, 'YES', { color: C.brick, scale: 1 })) {
              pushUndo(); clear(); confirmClear = false;
            }
            if (RA.ui.button(ctx, RA.W - 156, 2, 32, 20, 'NO', { color: C.grey2, scale: 1 })) {
              confirmClear = false;
            }
          }

          /* ---- tool column ---- */
          for (var i = 0; i < TOOLS.length; i++) {
            var ty = 30 + i * 30;
            if (RA.ui.button(ctx, 4, ty, 38, 26, TOOLS[i], {
              color: tool === i ? C.gold : C.ink3,
              textColor: tool === i ? C.ink : C.mist,
              scale: 1
            })) { tool = i; }
          }

          if (RA.ui.button(ctx, 4, 150, 38, 24, 'SZ ' + size,
                           { color: C.sea, scale: 1 })) {
            size = size % 3 + 1;
          }
          if (RA.ui.button(ctx, 4, 178, 38, 24, mirror ? 'MIR ON' : 'MIR',
                           { color: mirror ? C.pinkDk : C.ink3, scale: 1 })) {
            mirror = !mirror;
          }
          if (tool === 3) {
            if (RA.ui.button(ctx, 4, 206, 38, 24, STAMPS[stampIndex].name,
                             { color: C.purple, scale: 1 })) {
              stampIndex = (stampIndex + 1) % STAMPS.length;
            }
          }

          /* ---- palette ---- */
          var px0 = GX + pw + 6;
          RA.ui.panel(ctx, px0 - 3, 26, 60, 226, { fill: C.ink2, highlight: C.ink3 });
          for (var ci = 0; ci < COLORS.length; ci++) {
            var col = ci % 2, row = Math.floor(ci / 2);
            var sx = px0 + col * 27, sy = 30 + row * 22;
            ctx.fillStyle = C.ink;
            ctx.fillRect(sx - 1, sy - 1, 24, 20);
            ctx.fillStyle = COLORS[ci];
            ctx.fillRect(sx, sy, 22, 18);
            ctx.fillStyle = 'rgba(255,255,255,0.25)';
            ctx.fillRect(sx, sy, 22, 1);
            if (ci === color) {
              ctx.fillStyle = C.white;
              ctx.fillRect(sx - 2, sy - 2, 26, 2);
              ctx.fillRect(sx - 2, sy + 18, 26, 2);
              ctx.fillRect(sx - 2, sy - 2, 2, 22);
              ctx.fillRect(sx + 22, sy - 2, 2, 22);
            }
            if (RA.input.tapped(sx - 1, sy - 1, 24, 20)) {
              color = ci;
              if (tool === 2) tool = 0;
              RA.audio.sfx('select');
            }
          }
          RA.ui.end();

          /* ---- footer hint / save flash ---- */
          if (savedFlash > 0) {
            RA.font.draw(ctx, 'PICTURE SAVED!', RA.W / 2, RA.H - 14, {
              scale: 3, align: 'center', color: C.gold,
              outline: true, outlineColor: C.ink,
              alpha: U.clamp(savedFlash, 0, 1), wave: 2, waveTime: t
            });
          } else {
            RA.font.draw(ctx, 'DRAW WITH YOUR FINGER  -  U UNDOES', RA.W / 2, RA.H - 12, {
              scale: 1, align: 'center', color: C.grey2
            });
          }
        }
      };
    }
  });

})();
