/* =====================================================================
   games/maths.js — BUBBLE MATHS

   Ten questions, four floating bubbles, pop the right one. A wrong tap
   costs nothing but the first-try point: the bubble wobbles and she can
   try again. Streaks of three light up the pond.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var C = RA.C;

  var TOTAL = 10;
  var MODES = [
    { id: 'add10', name: 'ADDING TO 10',  color: '#3fae5c' },
    { id: 'add20', name: 'ADDING TO 20',  color: '#f7a72b' },
    { id: 'sub',   name: 'TAKING AWAY',   color: '#ef5b93' }
  ];
  var BUBBLE_COLORS = ['#ef5b93', '#7a4fd1', '#2f7fd6', '#3fae5c'];

  /* Crisp filled circle — no anti-aliasing, one fillRect per scanline. */
  function pixelCircle(ctx, cx, cy, r, color) {
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    ctx.fillStyle = color;
    for (var y = -r; y <= r; y++) {
      var w = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
      ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
    }
  }

  function drawBubble(ctx, cx, cy, r, color, label, opts) {
    opts = opts || {};
    var a = opts.alpha === undefined ? 1 : opts.alpha;
    var prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * a;

    pixelCircle(ctx, cx, cy + 1, r, '#12132b');
    pixelCircle(ctx, cx, cy, r, color);
    pixelCircle(ctx, cx, cy, r - 2, RA.ui.shade(color, 0.12));
    /* rim light bottom-right */
    pixelCircle(ctx, cx + 1, cy + 2, r - 3, RA.ui.shade(color, -0.1));
    /* glossy highlight */
    pixelCircle(ctx, cx - r * 0.35, cy - r * 0.38, Math.max(2, r * 0.24), 'rgba(255,255,255,0.75)');
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(Math.round(cx - r * 0.62), Math.round(cy - r * 0.05), 2, 1);

    if (label !== undefined && label !== null) {
      var ns = r >= 20 ? 3 : 2;
      RA.font.draw(ctx, label, cx, cy - Math.round(RA.font.height(ns) / 2), {
        scale: ns, align: 'center', color: C.white,
        outline: true, outlineColor: '#12132b'
      });
    }
    ctx.globalAlpha = prev;
  }

  /* ---------------------------------------------------------- backdrop */
  function drawPond(ctx, t) {
    RA.bg.sky(ctx, ['#1b4a9e', '#2f7fd6', '#63c9f0', '#bff0ff']);

    /* light shafts */
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < 6; i++) {
      var x = ((i * 97 + t * 6) % (RA.W + 120)) - 60;
      ctx.save();
      ctx.translate(x, 0);
      ctx.transform(1, 0, -0.35, 1, 0, 0);
      ctx.fillRect(0, 0, 16, RA.H);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    /* rising background bubbles */
    for (var b = 0; b < 16; b++) {
      var sp = 9 + (b % 5) * 4;
      var by = RA.H - ((t * sp + b * 63) % (RA.H + 40));
      var bx = 14 + (b * 61) % (RA.W - 28) + Math.sin(t * 1.4 + b) * 5;
      var br = 1 + (b % 3);
      ctx.globalAlpha = 0.22;
      pixelCircle(ctx, bx, by, br, '#ffffff');
      ctx.globalAlpha = 1;
    }

    /* pond floor + weeds */
    var floorY = RA.H - 18;
    ctx.fillStyle = '#1d7a45';
    ctx.fillRect(0, floorY + 6, RA.W, RA.H - floorY);
    ctx.fillStyle = '#3fae5c';
    for (var w = 0; w < RA.W; w += 7) {
      var hgt = 8 + Math.floor(Math.sin(w * 0.4) * 3 + Math.sin(t * 1.6 + w * 0.2) * 2);
      ctx.fillRect(w, floorY + 6 - hgt, 3, hgt);
    }
    ctx.fillStyle = '#8fe07a';
    for (var w2 = 2; w2 < RA.W; w2 += 14) {
      ctx.fillRect(w2 + Math.round(Math.sin(t * 1.2 + w2) * 2), floorY - 2, 2, 8);
    }
  }

  /* ================================================================== */
  RA.registerGame({
    id: 'maths',
    title: 'BUBBLES',
    color: '#1b4a9e',
    artBg: '#2f7fd6',
    icon: 'gem',
    bestLabel: function (b) { return 'BEST ' + b + '/10'; },

    preview: function (ctx, x, y, w, h, t) {
      RA.bg.sky(ctx, ['#1b4a9e', '#2f7fd6', '#63c9f0'], x, y, w, h);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      for (var i = 0; i < 3; i++) {
        var bx = x + 24 + i * 33 + Math.sin(t * 1.3 + i * 2) * 4;
        var by = y + h / 2 + Math.cos(t * 1.1 + i * 1.7) * 7;
        drawBubble(ctx, bx, by, 12, BUBBLE_COLORS[i], [3, 7, 5][i]);
      }
      ctx.restore();
    },

    scene: function () {
      var state = 'levels';    // levels | play | done
      var t = 0, stateT = 0;
      var mode = MODES[0];
      var qIndex = 0, correctFirst = 0, streak = 0, bestStreak = 0;
      var question = '', answer = 0, firstTry = true;
      var bubbles = [], busy = 0, cursor = 0;
      var resultStars = 0, starsEarned = 0, isRecord = false;
      var cheer = 0, cheerText = '';

      var FIELD = { x: 20, y: 74, w: RA.W - 40, h: RA.H - 96 };

      function makeQuestion() {
        var a, b;
        if (mode.id === 'add10') {
          a = U.randInt(1, 8); b = U.randInt(1, Math.max(1, 10 - a));
          return { text: a + ' + ' + b, ans: a + b };
        }
        if (mode.id === 'add20') {
          a = U.randInt(2, 15); b = U.randInt(1, Math.max(1, 20 - a));
          return { text: a + ' + ' + b, ans: a + b };
        }
        a = U.randInt(3, 20); b = U.randInt(1, a);
        return { text: a + ' - ' + b, ans: a - b };
      }

      function makeOptions(ans) {
        var set = [ans], guard = 0;
        while (set.length < 4 && guard++ < 300) {
          var d = ans + U.randInt(-4, 4);
          if (d < 0) d = U.randInt(0, 20);
          if (d !== ans && set.indexOf(d) === -1) set.push(d);
        }
        while (set.length < 4) {
          var e = U.randInt(0, 25);
          if (set.indexOf(e) === -1) set.push(e);
        }
        return U.shuffle(set);
      }

      function nextQuestion() {
        if (qIndex >= TOTAL) { finish(); return; }
        firstTry = true; busy = 0; cursor = 0;
        var q = makeQuestion();
        question = q.text + ' = ?';
        answer = q.ans;

        var opts = makeOptions(answer);
        var cellW = FIELD.w / 2, cellH = FIELD.h / 2;
        var r = Math.round(Math.min(cellW, cellH) * 0.34);
        bubbles = opts.map(function (val, i) {
          var col = i % 2, row = Math.floor(i / 2);
          var minX = FIELD.x + col * cellW + r + 4;
          var maxX = FIELD.x + (col + 1) * cellW - r - 4;
          var minY = FIELD.y + row * cellH + r + 4;
          var maxY = FIELD.y + (row + 1) * cellH - r - 4;
          return {
            val: val, r: r, color: BUBBLE_COLORS[i % BUBBLE_COLORS.length],
            x: U.rand(minX, maxX), y: U.rand(minY, maxY),
            vx: U.rand(-14, 14) || 9, vy: U.rand(-11, 11) || 7,
            minX: minX, maxX: maxX, minY: minY, maxY: maxY,
            pop: 0, wob: 0, born: 0
          };
        });
      }

      function choose(b) {
        if (busy > 0 || b.pop > 0) return;
        if (b.val === answer) {
          busy = 0.62;
          b.pop = 0.001;
          RA.audio.sfx('pop');
          RA.audio.sfx('correct');
          RA.fx.burst(b.x, b.y, {
            count: 20, colors: [b.color, '#ffffff', '#bff0ff'],
            speedMin: 30, speedMax: 110
          });
          if (firstTry) {
            correctFirst++;
            streak++;
            bestStreak = Math.max(bestStreak, streak);
            if (streak > 0 && streak % 3 === 0) {
              cheer = 1.2; cheerText = streak + ' IN A ROW!';
              RA.audio.sfx('powerup');
              RA.fx.confetti(28);
            }
          } else {
            streak = 0;
          }
          RA.fx.popText(U.pick(['YES!', 'WELL DONE!', 'CORRECT!', 'SUPER!', 'CLEVER!']),
                        b.x, b.y - 22, { color: C.gold, scale: 2 });
          for (var i = 0; i < bubbles.length; i++) if (bubbles[i] !== b) bubbles[i].pop = 0.001;
          qIndex++;
        } else {
          firstTry = false;
          streak = 0;
          b.wob = 1;
          RA.audio.sfx('wrong');
          RA.fx.popText('TRY AGAIN', b.x, b.y - 20, { color: C.coral, scale: 1 });
        }
      }

      function finish() {
        state = 'done'; stateT = 0;
        resultStars = correctFirst >= 10 ? 3 : correctFirst >= 8 ? 2 : 1;
        starsEarned = U.clamp(correctFirst + resultStars, 1, 15);
        isRecord = RA.save.payout('maths', correctFirst, starsEarned);
        if (correctFirst === TOTAL) RA.save.unlock('brainy');
        RA.celebrate(resultStars, isRecord);
      }

      function start(m) {
        mode = m;
        qIndex = 0; correctFirst = 0; streak = 0; bestStreak = 0;
        state = 'play'; stateT = 0;
        nextQuestion();
      }

      return {
        music: 'maths',

        enter: function () { t = 0; stateT = 0; state = 'levels'; bubbles = []; },

        update: function (dt) {
          t += dt; stateT += dt;
          if (cheer > 0) cheer = Math.max(0, cheer - dt);

          if (state !== 'play') return;

          if (busy > 0) {
            busy -= dt;
            if (busy <= 0) nextQuestion();
          }

          for (var i = 0; i < bubbles.length; i++) {
            var b = bubbles[i];
            b.born = Math.min(1, b.born + dt * 4);
            if (b.pop > 0) { b.pop += dt * 3.4; continue; }
            if (b.wob > 0) b.wob = Math.max(0, b.wob - dt * 2.6);
            b.x += b.vx * dt; b.y += b.vy * dt;
            if (b.x < b.minX) { b.x = b.minX; b.vx = Math.abs(b.vx); }
            if (b.x > b.maxX) { b.x = b.maxX; b.vx = -Math.abs(b.vx); }
            if (b.y < b.minY) { b.y = b.minY; b.vy = Math.abs(b.vy); }
            if (b.y > b.maxY) { b.y = b.maxY; b.vy = -Math.abs(b.vy); }
          }

          /* keyboard */
          var moved = 0;
          if (RA.input.justPressed('right')) { cursor = (cursor + 1) % 4; moved = 1; }
          if (RA.input.justPressed('left')) { cursor = (cursor + 3) % 4; moved = 1; }
          if (RA.input.justPressed('down')) { cursor = (cursor + 2) % 4; moved = 1; }
          if (RA.input.justPressed('up')) { cursor = (cursor + 2) % 4; moved = 1; }
          if (moved) RA.audio.sfx('move');
          if (RA.input.justPressed('ok') && bubbles[cursor]) choose(bubbles[cursor]);

          if (RA.input.pointer.justDown) {
            for (var j = 0; j < bubbles.length; j++) {
              var bb = bubbles[j];
              if (bb.pop > 0) continue;
              if (U.dist(RA.input.pointer.x, RA.input.pointer.y, bb.x, bb.y) <= bb.r + 4) {
                cursor = j;
                choose(bb);
                break;
              }
            }
          }
        },

        draw: function (ctx) {
          drawPond(ctx, t);
          RA.ui.begin({ nav: state === 'levels' });

          if (state === 'levels') {
            RA.font.draw(ctx, 'BUBBLE MATHS', RA.W / 2, 30, {
              scale: 4, align: 'center', color: C.cream,
              outline: true, outlineColor: C.ink, shadow: true, shadowColor: C.deep
            });
            RA.font.draw(ctx, 'POP THE RIGHT ANSWER', RA.W / 2, 66, {
              scale: 2, align: 'center', color: C.sky
            });
            for (var i = 0; i < MODES.length; i++) {
              if (RA.ui.button(ctx, RA.W / 2 - 110, 92 + i * 40, 220, 32, MODES[i].name,
                               { color: MODES[i].color, scale: 2 })) start(MODES[i]);
            }
            RA.font.draw(ctx, 'BEST ' + RA.save.best('maths') + ' OUT OF 10', RA.W / 2, 224, {
              scale: 1, align: 'center', color: C.sky
            });
            if (RA.ui.button(ctx, 6, 4, 44, 20, '<', { color: C.grape, scale: 1, sound: 'back' })) {
              RA.go('hub');
            }
            RA.ui.end();
            if (RA.input.justPressed('back')) RA.go('hub');
            return;
          }

          /* ---- HUD ---- */
          ctx.fillStyle = 'rgba(18,19,43,0.6)';
          ctx.fillRect(0, 0, RA.W, 26);
          RA.font.draw(ctx, 'Q ' + Math.min(qIndex + 1, TOTAL) + '/' + TOTAL, 8, 10,
                       { scale: 1, color: C.sky });
          RA.font.draw(ctx, 'RIGHT ' + correctFirst, RA.W - 8, 10,
                       { scale: 1, color: C.gold, align: 'right' });
          RA.ui.bar(ctx, RA.W / 2 - 60, 9, 120, 7, qIndex / TOTAL,
                    { fill: C.leaf, trough: '#1b4a9e' });

          /* ---- question card ---- */
          RA.ui.panel(ctx, RA.W / 2 - 120, 32, 240, 34, { fill: C.ink2, highlight: C.ink3 });
          RA.font.draw(ctx, question, RA.W / 2, 40, {
            scale: 3, align: 'center', color: C.white, outline: true, outlineColor: C.ink
          });

          /* ---- bubbles ---- */
          for (var n = 0; n < bubbles.length; n++) {
            var b = bubbles[n];
            if (b.pop > 0) {
              var k = U.clamp(b.pop, 0, 1);
              drawBubble(ctx, b.x, b.y, b.r * (1 + k * 0.7), b.color, null, { alpha: 1 - k });
              continue;
            }
            var wob = b.wob > 0 ? Math.sin(b.wob * 30) * 4 * b.wob : 0;
            var grow = U.easeOutBack(b.born);
            drawBubble(ctx, b.x + wob, b.y, Math.max(2, b.r * grow), b.color, b.val);

            if (n === cursor && RA.ui.keyboardActive) {
              ctx.fillStyle = C.cream;
              for (var a2 = 0; a2 < 12; a2++) {
                var ang = (a2 / 12) * Math.PI * 2 + t * 1.5;
                ctx.fillRect(Math.round(b.x + Math.cos(ang) * (b.r + 5)),
                             Math.round(b.y + Math.sin(ang) * (b.r + 5)), 2, 2);
              }
            }
          }

          if (cheer > 0) {
            RA.font.draw(ctx, cheerText, RA.W / 2, RA.H / 2 - 6, {
              scale: 4, align: 'center', color: C.gold,
              outline: true, outlineColor: C.ink,
              alpha: U.clamp(cheer * 1.5, 0, 1), wave: 3, waveTime: t
            });
          }

          if (state === 'done') {
            var r = RA.ui.results(ctx, {
              t: stateT,
              title: correctFirst === TOTAL ? 'PERFECT!' : correctFirst >= 8 ? 'BRILLIANT!' : 'NICE WORK!',
              scoreLabel: 'RIGHT FIRST TRY',
              score: correctFirst,
              stars: resultStars,
              starsEarned: starsEarned,
              record: isRecord,
              lines: ['BEST STREAK ' + bestStreak]
            });
            if (r === 'again') start(mode);
            else if (r === 'home') { state = 'levels'; stateT = 0; }
          } else {
            if (RA.ui.button(ctx, 430, 30, 44, 20, '<',
                             { color: C.grape, scale: 1, sound: 'back' })) {
              state = 'levels'; stateT = 0;
            }
            if (RA.input.justPressed('back')) { state = 'levels'; stateT = 0; }
          }
          RA.ui.end();
        }
      };
    }
  });

})();
