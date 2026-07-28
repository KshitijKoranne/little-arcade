/* =====================================================================
   games/maze.js — STAR MAZE

   Endless procedurally generated hedge mazes (recursive backtracker).
   Collect every star, then the gate opens. A sleepy bee wanders the
   corridors — bumping it only costs a star, never a life, so getting
   lost is never punishing.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var C = RA.C;

  var TOP = 24;                     // HUD height
  var MOVE_SPEED = 6.2;             // cells per second

  /* ------------------------------------------------- maze generation */
  function generate(cw, ch, rnd) {
    var W = cw * 2 + 1, H = ch * 2 + 1;
    var grid = [];
    var x, y;
    for (y = 0; y < H; y++) {
      grid[y] = [];
      for (x = 0; x < W; x++) grid[y][x] = 1;      // 1 = wall
    }

    var visited = [];
    for (y = 0; y < ch; y++) { visited[y] = []; for (x = 0; x < cw; x++) visited[y][x] = false; }

    var stack = [{ x: 0, y: 0 }];
    visited[0][0] = true;
    grid[1][1] = 0;

    var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

    while (stack.length) {
      var cur = stack[stack.length - 1];
      var options = [];
      for (var d = 0; d < 4; d++) {
        var nx = cur.x + DIRS[d][0], ny = cur.y + DIRS[d][1];
        if (nx >= 0 && nx < cw && ny >= 0 && ny < ch && !visited[ny][nx]) options.push(d);
      }
      if (!options.length) { stack.pop(); continue; }
      var pickD = options[Math.floor(rnd() * options.length)];
      var tx = cur.x + DIRS[pickD][0], ty = cur.y + DIRS[pickD][1];
      visited[ty][tx] = true;
      grid[ty * 2 + 1][tx * 2 + 1] = 0;
      grid[cur.y * 2 + 1 + DIRS[pickD][1]][cur.x * 2 + 1 + DIRS[pickD][0]] = 0;
      stack.push({ x: tx, y: ty });
    }

    /* knock a few extra holes so there are loops, not just one path —
       far less frustrating for a small child */
    var extras = Math.floor(cw * ch * 0.06);
    for (var e = 0; e < extras; e++) {
      var rx = 1 + Math.floor(rnd() * (W - 2));
      var ry = 1 + Math.floor(rnd() * (H - 2));
      if ((rx % 2) === (ry % 2)) continue;
      grid[ry][rx] = 0;
    }
    return { grid: grid, W: W, H: H, cw: cw, ch: ch };
  }

  function openCells(maze) {
    var list = [];
    for (var y = 1; y < maze.H - 1; y++) {
      for (var x = 1; x < maze.W - 1; x++) {
        if (maze.grid[y][x] === 0 && (x % 2) === 1 && (y % 2) === 1) list.push({ x: x, y: y });
      }
    }
    return list;
  }

  /* ================================================================== */
  RA.registerGame({
    id: 'maze',
    title: 'STAR MAZE',
    color: '#1d7a45',
    artBg: '#3fae5c',
    icon: 'maze_gate',
    bestLabel: function (b) { return 'BEST LEVEL ' + b; },

    /* A real little maze, not noise: this layout is a hand-checked
       11x5 corridor plan, and the walker follows the open path. */
    preview: (function () {
      var PLAN = [
        '###########',
        '#.........#',
        '#.###.###.#',
        '#...#...#.#',
        '###########'
      ];
      var PATH = [[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[9,2],[9,3],[8,3],[7,3],[6,3],[5,3]];
      return function (ctx, x, y, w, h, t) {
        var ts = Math.floor(Math.min(w / 11, h / 5));
        var ox = Math.round(x + (w - ts * 11) / 2);
        var oy = Math.round(y + (h - ts * 5) / 2);
        for (var gy = 0; gy < 5; gy++) {
          for (var gx = 0; gx < 11; gx++) {
            var px = ox + gx * ts, py = oy + gy * ts;
            if (PLAN[gy].charAt(gx) === '#') {
              ctx.fillStyle = '#1d7a45'; ctx.fillRect(px, py, ts, ts);
              ctx.fillStyle = '#3fae5c'; ctx.fillRect(px, py, ts, ts - 1);
              ctx.fillStyle = '#8fe07a'; ctx.fillRect(px + 1, py + 1, ts - 2, 1);
            } else {
              ctx.fillStyle = ((gx + gy) & 1) ? '#e6fbd6' : '#d8f7c0';
              ctx.fillRect(px, py, ts, ts);
            }
          }
        }
        RA.spr.drawC(ctx, 'star', ox + 5.5 * ts, oy + 3.5 * ts + Math.sin(t * 3) * 1.5, {});
        RA.spr.drawC(ctx, 'maze_gate', ox + 9.5 * ts, oy + 1.5 * ts, {});
        var step = PATH[Math.floor(t * 3) % PATH.length];
        var nxt = PATH[(Math.floor(t * 3) + 1) % PATH.length];
        var f = (t * 3) % 1;
        RA.spr.drawC(ctx, 'girl_idle',
          ox + (step[0] + (nxt[0] - step[0]) * f + 0.5) * ts,
          oy + (step[1] + (nxt[1] - step[1]) * f + 0.5) * ts, { scale: 0.7 });
      };
    })(),

    scene: function () {
      var state = 'intro';      // intro | play | cleared | over
      var t = 0, stateT = 0;
      var level = 1, maze = null, ts = 12, ox = 0, oy = 0;
      var player = null, stars = [], gate = null, bee = null;
      var collected = 0, moves = 0, levelT = 0;
      var resultStars = 0, starsEarned = 0, isRecord = false;
      var held = { x: 0, y: 0 };

      function buildLevel(n) {
        level = n;
        var cw = U.clamp(6 + Math.floor(n / 2), 6, 15);
        var ch = U.clamp(3 + Math.floor(n / 3), 3, 7);
        maze = generate(cw, ch, U.rng(1337 + n * 7919 + Math.floor(Math.random() * 1000)));

        var availW = RA.W - 16, availH = RA.H - TOP - 12;
        ts = Math.max(8, Math.floor(Math.min(availW / maze.W, availH / maze.H)));
        ox = Math.round((RA.W - maze.W * ts) / 2);
        oy = Math.round(TOP + (availH - maze.H * ts) / 2);

        player = { cx: 1, cy: 1, x: 1, y: 1, tx: 1, ty: 1, moving: false, face: 1, anim: 0 };

        var cells = openCells(maze).filter(function (c) {
          return !(c.x === 1 && c.y === 1);
        });
        cells = U.shuffle(cells);

        var starCount = Math.min(cells.length - 1, 2 + Math.floor(n / 2) + 1);
        stars = cells.slice(0, starCount).map(function (c) {
          return { cx: c.x, cy: c.y, taken: false, ph: Math.random() * 6 };
        });

        /* gate goes as far from the start as we can manage */
        var far = cells[cells.length - 1];
        for (var i = 0; i < cells.length; i++) {
          if (cells[i].x + cells[i].y > far.x + far.y) far = cells[i];
        }
        gate = { cx: far.x, cy: far.y, open: false, t: 0 };

        bee = null;
        if (n >= 2) {
          var bc = cells[Math.floor(cells.length / 2)];
          bee = { x: bc.x, y: bc.y, tx: bc.x, ty: bc.y, moving: false, dir: 0, cool: 0 };
        }

        collected = 0; moves = 0; levelT = 0;
      }

      function walkable(cx, cy) {
        return cx >= 0 && cy >= 0 && cx < maze.W && cy < maze.H && maze.grid[cy][cx] === 0;
      }

      function tryMove(dx, dy) {
        if (player.moving) return;
        var nx = player.cx + dx, ny = player.cy + dy;
        if (!walkable(nx, ny)) return;
        player.tx = nx; player.ty = ny;
        player.moving = true;
        if (dx) player.face = dx;
        moves++;
        RA.audio.sfx('step');
      }

      function finishLevel() {
        state = 'cleared'; stateT = 0;
        RA.audio.sfx('win');
        RA.fx.confetti(70);
        var earned = 2 + level;
        RA.save.addStars(earned);
        RA.save.markPlayed('maze');
        RA.save.setBest('maze', level);
        if (level >= 5) RA.save.unlock('explorer');
      }

      function endRun() {
        state = 'over'; stateT = 0;
        resultStars = level >= 8 ? 3 : level >= 4 ? 2 : 1;
        starsEarned = U.clamp(level * 2, 1, 20);
        isRecord = RA.save.payout('maze', level, starsEarned);
        RA.celebrate(resultStars, isRecord);
      }

      return {
        music: 'maze',

        debug: function () {
          return {
            state: state, level: level,
            collected: collected, stars: stars.length,
            gateOpen: gate && gate.open,
            cx: player && player.cx, cy: player && player.cy,
            moving: player && player.moving,
            ox: ox, oy: oy, ts: ts, W: maze && maze.W, H: maze && maze.H,
            grid: maze && maze.grid,
            starPos: stars.map(function (s) { return [s.cx, s.cy, s.taken]; }),
            gatePos: gate && [gate.cx, gate.cy]
          };
        },

        enter: function () { t = 0; stateT = 0; state = 'intro'; buildLevel(1); },

        update: function (dt) {
          t += dt; stateT += dt;
          if (state !== 'play') return;
          levelT += dt;

          /* ---- smooth grid movement ---- */
          if (player.moving) {
            var sp = MOVE_SPEED * dt;
            player.x = U.approach(player.x, player.tx, sp);
            player.y = U.approach(player.y, player.ty, sp);
            player.anim += dt * 12;
            if (player.x === player.tx && player.y === player.ty) {
              player.cx = player.tx; player.cy = player.ty;
              player.moving = false;
            }
          } else {
            /* keyboard */
            var dx = 0, dy = 0;
            if (RA.input.isDown('left')) dx = -1;
            else if (RA.input.isDown('right')) dx = 1;
            else if (RA.input.isDown('up')) dy = -1;
            else if (RA.input.isDown('down')) dy = 1;

            /* touch: hold anywhere, we steer toward the finger */
            if (!dx && !dy && RA.input.pointer.down) {
              var pxp = ox + player.cx * ts + ts / 2;
              var pyp = oy + player.cy * ts + ts / 2;
              var ddx = RA.input.pointer.x - pxp, ddy = RA.input.pointer.y - pyp;
              if (Math.abs(ddx) > Math.abs(ddy)) { if (Math.abs(ddx) > 5) dx = U.sign(ddx); }
              else if (Math.abs(ddy) > 5) dy = U.sign(ddy);
            }
            if (dx || dy) tryMove(dx, dy);
          }

          /* ---- stars ---- */
          for (var i = 0; i < stars.length; i++) {
            var s = stars[i];
            if (s.taken) continue;
            if (s.cx === player.cx && s.cy === player.cy) {
              s.taken = true;
              collected++;
              RA.audio.sfx('coin');
              RA.fx.burst(ox + s.cx * ts + ts / 2, oy + s.cy * ts + ts / 2, {
                count: 14, colors: ['#ffd45c', '#fff0bd', '#ffffff'], speedMin: 20, speedMax: 80
              });
              RA.fx.popText('+1', ox + s.cx * ts + ts / 2, oy + s.cy * ts - 4,
                            { color: C.gold, scale: 1 });
              if (collected === stars.length) {
                gate.open = true;
                RA.audio.sfx('unlock');
                RA.fx.popText('GATE OPEN!', RA.W / 2, TOP + 10, { color: C.leaf, scale: 2 });
              }
            }
          }

          /* ---- gate ---- */
          if (gate.open) {
            gate.t += dt;
            if (player.cx === gate.cx && player.cy === gate.cy) finishLevel();
          }

          /* ---- bee ---- */
          if (bee) {
            if (bee.moving) {
              var bs = 2.6 * dt;
              bee.x = U.approach(bee.x, bee.tx, bs);
              bee.y = U.approach(bee.y, bee.ty, bs);
              if (bee.x === bee.tx && bee.y === bee.ty) bee.moving = false;
            } else {
              bee.cool -= dt;
              if (bee.cool <= 0) {
                bee.cool = U.rand(0.15, 0.5);
                var opts = [];
                var D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                for (var d = 0; d < 4; d++) {
                  var nx2 = Math.round(bee.x) + D[d][0], ny2 = Math.round(bee.y) + D[d][1];
                  if (walkable(nx2, ny2)) opts.push([nx2, ny2]);
                }
                if (opts.length) {
                  var o = U.pick(opts);
                  bee.tx = o[0]; bee.ty = o[1]; bee.moving = true;
                }
              }
            }
            if (Math.abs(bee.x - player.x) < 0.6 && Math.abs(bee.y - player.y) < 0.6) {
              if (collected > 0) {
                collected--;
                gate.open = false;
                for (var q = stars.length - 1; q >= 0; q--) {
                  if (stars[q].taken) { stars[q].taken = false; break; }
                }
                RA.fx.popText('OH NO!', ox + player.x * ts + ts / 2, oy + player.y * ts - 6,
                              { color: C.coral, scale: 2 });
              }
              RA.audio.sfx('wrong');
              RA.fx.shake(4, 0.25);
              /* nudge her back to the start of the corridor */
              player.cx = player.tx = 1; player.cy = player.ty = 1;
              player.x = 1; player.y = 1; player.moving = false;
              bee.x = bee.tx = Math.round(maze.W / 2);
              bee.y = bee.ty = Math.round(maze.H / 2);
              if (!walkable(bee.x, bee.y)) { bee.x = bee.tx = 1; bee.y = bee.ty = 1; }
            }
          }
        },

        draw: function (ctx) {
          RA.bg.sky(ctx, ['#8fd8ff', '#bff0ff', '#d8f7c0']);

          if (maze) {
            /* maze floor */
            ctx.fillStyle = '#d8f7c0';
            ctx.fillRect(ox, oy, maze.W * ts, maze.H * ts);

            for (var y = 0; y < maze.H; y++) {
              for (var x = 0; x < maze.W; x++) {
                var px = ox + x * ts, py = oy + y * ts;
                if (maze.grid[y][x] === 1) {
                  /* hedge block, shaded top and bottom */
                  ctx.fillStyle = '#1d7a45'; ctx.fillRect(px, py, ts, ts);
                  ctx.fillStyle = '#3fae5c'; ctx.fillRect(px, py, ts, ts - 2);
                  ctx.fillStyle = '#8fe07a';
                  ctx.fillRect(px + 1, py + 1, ts - 2, 2);
                  ctx.fillStyle = '#1d7a45';
                  ctx.fillRect(px + (x * 3 + y * 5) % Math.max(1, ts - 2), py + 3, 2, 2);
                } else {
                  ctx.fillStyle = ((x + y) & 1) ? '#e6fbd6' : '#d8f7c0';
                  ctx.fillRect(px, py, ts, ts);
                }
              }
            }

            /* gate */
            var gx = ox + gate.cx * ts, gy = oy + gate.cy * ts;
            if (gate.open) {
              var glow = 0.5 + 0.5 * Math.sin(t * 5);
              ctx.globalAlpha = 0.35 + glow * 0.3;
              ctx.fillStyle = '#ffd45c';
              ctx.fillRect(gx - 2, gy - 2, ts + 4, ts + 4);
              ctx.globalAlpha = 1;
            }
            RA.spr.drawC(ctx, 'maze_gate', gx + ts / 2, gy + ts / 2,
                         { scale: Math.max(1, ts / 10), alpha: gate.open ? 1 : 0.5 });

            /* stars */
            for (var i = 0; i < stars.length; i++) {
              var s = stars[i];
              if (s.taken) continue;
              RA.spr.drawC(ctx, 'star', ox + s.cx * ts + ts / 2,
                           oy + s.cy * ts + ts / 2 + Math.sin(t * 3 + s.ph) * 2, {});
            }

            /* bee */
            if (bee) {
              RA.spr.drawC(ctx, 'sleepy_bee', ox + bee.x * ts + ts / 2,
                           oy + bee.y * ts + ts / 2 + Math.sin(t * 6) * 1.5,
                           { frame: Math.floor(t * 10) % 2 });
            }

            /* player */
            var pspr = player.moving ? 'girl_run' : 'girl_idle';
            RA.spr.drawC(ctx, 'girl_idle', ox + player.x * ts + ts / 2,
                         oy + player.y * ts + ts / 2 - 2,
                         { flipX: player.face < 0, scale: ts >= 14 ? 1 : 0.85 });
          }

          /* ---- HUD ---- */
          ctx.fillStyle = 'rgba(18,19,43,0.62)';
          ctx.fillRect(0, 0, RA.W, TOP);
          RA.font.draw(ctx, 'LEVEL ' + level, 8, 9, { scale: 2, color: C.cream });
          RA.spr.draw(ctx, 'star_small', RA.W / 2 - 30, 9, {});
          RA.font.draw(ctx, collected + '/' + stars.length, RA.W / 2 - 16, 9,
                       { scale: 2, color: C.gold });
          RA.font.draw(ctx, 'BEST ' + RA.save.best('maze'), RA.W - 8, 10,
                       { scale: 1, align: 'right', color: C.mist });

          RA.ui.begin({ nav: state !== 'play' });

          if (state === 'intro') {
            ctx.fillStyle = 'rgba(18,19,43,0.62)';
            ctx.fillRect(0, 0, RA.W, RA.H);
            RA.ui.panel(ctx, 84, 46, 312, 154, { fill: C.ink2, highlight: C.ink3 });
            RA.font.draw(ctx, 'STAR MAZE', RA.W / 2, 56, {
              scale: 4, align: 'center', color: C.leaf, outline: true, outlineColor: C.ink
            });
            RA.spr.draw(ctx, 'star', 116, 96, { scale: 2 });
            RA.font.draw(ctx, 'FIND EVERY STAR', 142, 98, { scale: 2, color: C.cream });
            RA.spr.draw(ctx, 'maze_gate', 116, 120, { scale: 2 });
            RA.font.draw(ctx, 'THEN THE GATE OPENS', 142, 122, { scale: 2, color: C.gold });
            RA.font.draw(ctx, 'HOLD ANYWHERE TO WALK, OR USE ARROWS', RA.W / 2, 148, {
              scale: 1, align: 'center', color: C.mist
            });
            RA.font.draw(ctx, 'WATCH OUT FOR THE SLEEPY BEE!', RA.W / 2, 160, {
              scale: 1, align: 'center', color: C.coral
            });
            if (RA.ui.button(ctx, RA.W / 2 - 60, 168, 120, 26, 'GO!',
                             { color: C.green, scale: 2 })) {
              state = 'play'; stateT = 0; buildLevel(1);
            }
            if (RA.ui.button(ctx, 6, 3, 44, 20, '<', { color: C.grape, scale: 1, sound: 'back' })) {
              RA.go('hub');
            }
            if (RA.input.justPressed('back')) RA.go('hub');

          } else if (state === 'cleared') {
            ctx.fillStyle = 'rgba(18,19,43,' + U.clamp(stateT * 2, 0, 0.66) + ')';
            ctx.fillRect(0, 0, RA.W, RA.H);
            var pop = U.easeOutBack(U.clamp(stateT / 0.4, 0, 1));
            RA.font.draw(ctx, 'LEVEL ' + level + ' DONE!', RA.W / 2, RA.H / 2 - 44, {
              scale: 4 * pop, align: 'center', color: C.gold,
              outline: true, outlineColor: C.ink
            });
            RA.font.draw(ctx, '+' + (2 + level) + ' STARS', RA.W / 2, RA.H / 2 - 8, {
              scale: 2, align: 'center', color: C.cream
            });
            if (RA.ui.button(ctx, RA.W / 2 - 130, RA.H / 2 + 24, 120, 28, 'NEXT!',
                             { color: C.green, scale: 2 })) {
              buildLevel(level + 1); state = 'play'; stateT = 0;
            }
            if (RA.ui.button(ctx, RA.W / 2 + 10, RA.H / 2 + 24, 120, 28, 'STOP',
                             { color: C.pinkDk, scale: 2 })) {
              endRun();
            }

          } else if (state === 'over') {
            var r = RA.ui.results(ctx, {
              t: stateT,
              title: 'MAZE MASTER!',
              scoreLabel: 'LEVELS FINISHED',
              score: level,
              stars: resultStars,
              starsEarned: starsEarned,
              record: isRecord,
              againLabel: 'AGAIN'
            });
            if (r === 'again') { buildLevel(1); state = 'play'; stateT = 0; }
            else if (r === 'home') RA.go('hub');

          } else {
            if (RA.ui.button(ctx, 430, 3, 44, 20, '<',
                             { color: C.grape, scale: 1, sound: 'back' })) endRun();
            if (RA.input.justPressed('back')) endRun();
          }
          RA.ui.end();
        }
      };
    }
  });

})();
