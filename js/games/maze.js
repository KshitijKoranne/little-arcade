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
      var collected = 0, moves = 0, levelT = 0, graceT = 0;
      var resultStars = 0, starsEarned = 0, isRecord = false;
      var held = { x: 0, y: 0 };

      function buildLevel(n) {
        level = n;
        /* Capped so the tiles stay legible and a level never turns into a
           two-minute walk; the old build shrank to 15px tiles by level 12
           and asked for ~32s of pure movement. */
        var mcfg = RA.tune.get('maze');
        var cw = U.clamp(6 + Math.floor(n / 2), 6, mcfg.cwMax);
        var ch = U.clamp(3 + Math.floor(n / 3), 3, mcfg.chMax);
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

        var starCount = Math.min(cells.length - 1,
                                 mcfg.starBase + Math.floor(n / mcfg.starGrow));
        stars = cells.slice(0, starCount).map(function (c) {
          return { cx: c.x, cy: c.y, taken: false, ph: Math.random() * 6 };
        });

        /* gate goes as far from the start as we can manage */
        var far = cells[cells.length - 1];
        for (var i = 0; i < cells.length; i++) {
          if (cells[i].x + cells[i].y > far.x + far.y) far = cells[i];
        }
        gate = { cx: far.x, cy: far.y, open: false, t: 0 };

        /* The bee only shows up once she has the hang of it, and it always
           starts as far from her as the maze allows. */
        bee = null;
        graceT = 0;
        if (n >= mcfg.beeFrom) {
          var bc = farthestCellFrom(1, 1);
          if (bc.d >= 4) {
            bee = { x: bc.x, y: bc.y, tx: bc.x, ty: bc.y, moving: false, cool: 0, doze: 0 };
          }
        }

        collected = 0; moves = 0; levelT = 0;
      }

      function walkable(cx, cy) {
        return cx >= 0 && cy >= 0 && cx < maze.W && cy < maze.H && maze.grid[cy][cx] === 0;
      }

      /* Breadth-first distances from a cell, in steps through the maze —
         straight-line distance is meaningless with walls in the way. */
      function distancesFrom(sx, sy) {
        var dist = [];
        for (var y = 0; y < maze.H; y++) {
          dist[y] = [];
          for (var x = 0; x < maze.W; x++) dist[y][x] = -1;
        }
        if (!walkable(sx, sy)) return dist;
        dist[sy][sx] = 0;
        var queue = [[sx, sy]], head = 0;
        var D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        while (head < queue.length) {
          var c = queue[head++];
          for (var d = 0; d < 4; d++) {
            var nx = c[0] + D[d][0], ny = c[1] + D[d][1];
            if (!walkable(nx, ny) || dist[ny][nx] !== -1) continue;
            dist[ny][nx] = dist[c[1]][c[0]] + 1;
            queue.push([nx, ny]);
          }
        }
        return dist;
      }

      /** The reachable cell furthest (in steps) from cx,cy. */
      function farthestCellFrom(cx, cy) {
        var dist = distancesFrom(cx, cy);
        var best = null, bestD = -1;
        for (var y = 1; y < maze.H - 1; y++) {
          for (var x = 1; x < maze.W - 1; x++) {
            if (dist[y][x] > bestD) { bestD = dist[y][x]; best = { x: x, y: y, d: bestD }; }
          }
        }
        return best || { x: 1, y: 1, d: 0 };
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
            gatePos: gate && [gate.cx, gate.cy],
            graceT: +graceT.toFixed(2),
            bee: bee ? { x: +bee.x.toFixed(2), y: +bee.y.toFixed(2), doze: +bee.doze.toFixed(2) } : null
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

          /* ---- bee ----
             Rules that keep this fair for a small child:
               - it can never step onto the cell she is standing on, so it
                 cannot corner her in a dead end
               - after a bump she gets a long grace period and the bee dozes
               - she is never teleported; being yanked back to the start of a
                 maze is a miserable punishment at this age
               - the bee retreats to the furthest reachable cell, measured in
                 steps through the maze, not straight-line distance          */
          if (graceT > 0) graceT = Math.max(0, graceT - dt);

          if (bee) {
            if (bee.doze > 0) {
              bee.doze = Math.max(0, bee.doze - dt);
            } else if (bee.moving) {
              var bs = 2.3 * dt;
              bee.x = U.approach(bee.x, bee.tx, bs);
              bee.y = U.approach(bee.y, bee.ty, bs);
              if (bee.x === bee.tx && bee.y === bee.ty) bee.moving = false;
            } else {
              bee.cool -= dt;
              if (bee.cool <= 0) {
                bee.cool = U.rand(0.25, 0.6);
                var opts = [];
                var D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                for (var d = 0; d < 4; d++) {
                  var nx2 = Math.round(bee.x) + D[d][0], ny2 = Math.round(bee.y) + D[d][1];
                  if (!walkable(nx2, ny2)) continue;
                  if (nx2 === player.cx && ny2 === player.cy) continue;   // never land on her
                  opts.push([nx2, ny2]);
                }
                if (opts.length) {
                  /* Shy: if she is close, prefer whichever way opens the gap.
                     Otherwise it would be able to park in a corridor she has
                     to walk through and tax her every single time. */
                  var pd = distancesFrom(player.cx, player.cy);
                  var here = pd[Math.round(bee.y)] ? pd[Math.round(bee.y)][Math.round(bee.x)] : 99;
                  if (here >= 0 && here <= 2) {
                    var bestOpt = opts[0], bestD = -1;
                    for (var oi = 0; oi < opts.length; oi++) {
                      var od = pd[opts[oi][1]][opts[oi][0]];
                      if (od > bestD) { bestD = od; bestOpt = opts[oi]; }
                    }
                    bee.tx = bestOpt[0]; bee.ty = bestOpt[1];
                  } else {
                    var o = U.pick(opts);
                    bee.tx = o[0]; bee.ty = o[1];
                  }
                  bee.moving = true;
                }
              }
            }

            var touching = Math.abs(bee.x - player.x) < 0.6 &&
                           Math.abs(bee.y - player.y) < 0.6;

            if (touching && graceT <= 0 && bee.doze <= 0) {
              graceT = 2.6;
              bee.doze = 2.6;

              if (collected > 0) {
                collected--;
                gate.open = false;
                for (var q = stars.length - 1; q >= 0; q--) {
                  if (stars[q].taken) { stars[q].taken = false; break; }
                }
                RA.fx.popText('OOPS! LOST A STAR', ox + player.x * ts + ts / 2,
                              oy + player.y * ts - 8, { color: C.coral, scale: 2 });
              } else {
                RA.fx.popText('BUZZ OFF!', ox + player.x * ts + ts / 2,
                              oy + player.y * ts - 8, { color: C.gold, scale: 2 });
              }

              RA.audio.sfx('wrong');
              RA.fx.shake(3, 0.18);
              RA.fx.burst(ox + bee.x * ts + ts / 2, oy + bee.y * ts + ts / 2, {
                count: 10, colors: ['#ffd45c', '#fff0bd'], speedMin: 20, speedMax: 60
              });

              /* send it as far away as the maze allows */
              var away = farthestCellFrom(player.cx, player.cy);
              bee.x = bee.tx = away.x;
              bee.y = bee.ty = away.y;
              bee.moving = false;
              bee.cool = 0.8;
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

            /* bee — visibly asleep during the grace period */
            if (bee) {
              var dozing = bee.doze > 0;
              RA.spr.drawC(ctx, 'sleepy_bee', ox + bee.x * ts + ts / 2,
                           oy + bee.y * ts + ts / 2 + Math.sin(t * (dozing ? 2 : 6)) * 1.5,
                           { frame: dozing ? 1 : Math.floor(t * 10) % 2,
                             alpha: dozing ? 0.55 : 1 });
              if (dozing) {
                RA.font.draw(ctx, 'ZZZ', ox + bee.x * ts + ts / 2 + 8,
                             oy + bee.y * ts - 4 + Math.sin(t * 3) * 2,
                             { scale: 1, color: C.cream, align: 'center' });
              }
            }

            /* player — blinks while she cannot be bumped again */
            var invuln = graceT > 0;
            if (!invuln || Math.floor(t * 10) % 2 === 0) {
              RA.spr.drawC(ctx, 'girl_idle', ox + player.x * ts + ts / 2,
                           oy + player.y * ts + ts / 2 - 2,
                           { flipX: player.face < 0, scale: ts >= 14 ? 1 : 0.85 });
            }
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
