/* =====================================================================
   games/catch.js — ORCHARD

   Catch falling fruit in the basket. Chains build a multiplier, gold
   stars are worth a burst of points, and every 30 fruit triggers a
   "fruit rain" so the round keeps escalating instead of flat-lining.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var C = RA.C;

  var GROUND_Y = 244;
  var BASKET_Y = 224;
  var BASKET_HALF = 13;

  /* ------------------------------------------------------------ trees
     Canopy is a shaped blob (half-width per row) rather than a stack of
     rectangles, so the silhouette actually reads as a tree.            */
  var CANOPY = [
    [-42, 7], [-39, 11], [-36, 14], [-32, 16], [-28, 17],
    [-24, 17], [-20, 16], [-17, 14], [-14, 10]
  ];

  function drawTree(ctx, x, y, s, sway) {
    s = s || 1;
    var cx = x + sway;

    /* trunk */
    ctx.fillStyle = '#6b422a';
    ctx.fillRect(Math.round(x - 2 * s), Math.round(y - 15 * s), Math.round(4 * s), Math.round(16 * s));
    ctx.fillStyle = '#a5714a';
    ctx.fillRect(Math.round(x - 2 * s), Math.round(y - 15 * s), Math.max(1, Math.round(1 * s)), Math.round(16 * s));

    /* canopy: dark base, lighter inset, highlight cap */
    var i, row;
    ctx.fillStyle = '#1d7a45';
    for (i = 0; i < CANOPY.length; i++) {
      row = CANOPY[i];
      ctx.fillRect(Math.round(cx - row[1] * s), Math.round(y + row[0] * s),
                   Math.round(row[1] * 2 * s), Math.ceil(4 * s));
    }
    ctx.fillStyle = '#3fae5c';
    for (i = 0; i < CANOPY.length - 1; i++) {
      row = CANOPY[i];
      ctx.fillRect(Math.round(cx - (row[1] - 2) * s), Math.round(y + row[0] * s),
                   Math.round((row[1] - 2) * 2 * s), Math.ceil(3 * s));
    }
    ctx.fillStyle = '#8fe07a';
    ctx.fillRect(Math.round(cx - 7 * s), Math.round(y - 40 * s), Math.round(11 * s), Math.ceil(3 * s));
    ctx.fillRect(Math.round(cx - 10 * s), Math.round(y - 36 * s), Math.round(7 * s), Math.ceil(2 * s));

    /* a few fruits still on the branches */
    ctx.fillStyle = '#ef5b93';
    ctx.fillRect(Math.round(cx - 11 * s), Math.round(y - 26 * s), Math.ceil(2 * s), Math.ceil(2 * s));
    ctx.fillRect(Math.round(cx + 8 * s), Math.round(y - 30 * s), Math.ceil(2 * s), Math.ceil(2 * s));
    ctx.fillStyle = '#f7a72b';
    ctx.fillRect(Math.round(cx + 1 * s), Math.round(y - 22 * s), Math.ceil(2 * s), Math.ceil(2 * s));
  }

  /* Blue at the top fading to pale green at the horizon: fruit sprites
     need to stay legible over the middle of the screen. */
  var ORCHARD_SKY = ['#4fb8ea', '#7fd4f5', '#aee8fb', '#d7f3e2', '#e9f7d6'];

  function drawOrchard(ctx, t) {
    RA.bg.sky(ctx, ORCHARD_SKY, 0, 0, RA.W, GROUND_Y + 4);
    RA.bg.clouds(ctx, t, { count: 4, speed: 4, top: 12, band: 46, alpha: 0.85 });

    /* far hedgerow */
    RA.bg.hills(ctx, t * 3, {
      baseY: GROUND_Y - 34, step: 10,
      layers: [
        { color: '#8fd8b0', amp: 7, freq: 0.014, speed: 0.2, offset: 0 },
        { color: '#5fbe83', amp: 9, freq: 0.010, speed: 0.4, offset: 55 }
      ]
    });

    var sway = Math.sin(t * 1.1) * 1.5;
    drawTree(ctx, 46, GROUND_Y - 2, 1, sway);
    drawTree(ctx, 152, GROUND_Y - 4, 0.8, sway * 0.8);
    drawTree(ctx, 330, GROUND_Y - 4, 0.85, -sway);
    drawTree(ctx, 438, GROUND_Y - 2, 1, -sway * 1.1);

    RA.bg.ground(ctx, GROUND_Y, {
      top: '#8fe07a', mid: '#3fae5c', deep: '#1d7a45', offset: 0
    });
  }

  /* ================================================================== */
  RA.registerGame({
    id: 'catch',
    title: 'ORCHARD',
    color: '#2f8f52',
    artBg: '#bff0ff',
    icon: 'basket',
    bestLabel: function (b) { return 'BEST ' + b; },

    /* hub card art — a tiny live diorama */
    preview: function (ctx, x, y, w, h, t) {
      RA.bg.sky(ctx, ORCHARD_SKY, x, y, w, h);
      ctx.fillStyle = '#3fae5c';
      ctx.fillRect(x, y + h - 8, w, 8);
      ctx.fillStyle = '#8fe07a';
      ctx.fillRect(x, y + h - 9, w, 1);
      drawTree(ctx, x + 16, y + h - 6, 0.42, Math.sin(t) * 1);
      drawTree(ctx, x + w - 16, y + h - 6, 0.38, -Math.sin(t) * 1);
      var bx = x + w / 2 + Math.sin(t * 1.5) * (w / 4);
      RA.spr.drawC(ctx, 'basket', bx, y + h - 12, { scale: 0.75 });
      for (var i = 0; i < 3; i++) {
        var ph = (t * 0.55 + i * 0.33) % 1;
        var fy = y + 4 + ph * (h - 20);
        var fx = x + 22 + ((i * 47) % (w - 44));
        RA.spr.drawC(ctx, RA.FRUITS[i % RA.FRUITS.length], fx, fy, {});
      }
    },

    scene: function () {
      var state = 'intro';      // intro | count | play | over
      var t = 0, stateT = 0;
      var score = 0, lives = 3, combo = 0, best = 0, goldCount = 0;
      var items = [], basketX = RA.W / 2, targetX = RA.W / 2, basketVX = 0;
      var spawnT = 0, wind = 0, windTarget = 0;
      var nextRain = 30, rainQueue = 0, rainT = 0;
      var hurtFlash = 0;
      var resultStars = 0, starsEarned = 0, isRecord = false;
      var cfg = RA.tune.get('catch'), maxLives = cfg.lives;

      function reset() {
        cfg = RA.tune.get('catch');
        maxLives = cfg.lives;
        score = 0; lives = maxLives; combo = 0; goldCount = 0;
        items = []; spawnT = 0.4; wind = 0; windTarget = 0;
        nextRain = 30; rainQueue = 0;
        basketX = targetX = RA.W / 2; basketVX = 0;
        hurtFlash = 0;
      }

      function multiplier() { return Math.min(4, 1 + Math.floor(combo / 5)); }

      function spawn(force) {
        var r = Math.random();
        var kind = 'fruit';
        if (!force) {
          if (r > 1 - cfg.goldPct) kind = 'gold';
          else if (r > 1 - cfg.goldPct - cfg.hazardPct) kind = 'bad';
        }
        var sprite = kind === 'fruit' ? U.pick(RA.FRUITS)
                   : kind === 'gold' ? 'star'
                   : U.pick(['haz_rock', 'haz_thorn']);

        /* Hard ceiling on fall speed: 270px / fallMax is the reaction
           budget the child gets, and it must never dip under it. */
        var speed = cfg.fallBase + Math.min(score, cfg.rampCap) * cfg.fallRamp;
        speed = Math.min(speed, cfg.fallMax) + U.rand(-8, 8);

        items.push({
          kind: kind,
          spr: sprite,
          x: U.rand(24, RA.W - 24),
          y: -12,
          vy: speed,
          vx: 0,
          rot: U.rand(-0.4, 0.4),
          spin: U.rand(-2.2, 2.2),
          wob: U.rand(0, Math.PI * 2)
        });
      }

      function loseLife(it) {
        lives--;
        combo = 0;
        hurtFlash = 0.28;
        RA.audio.sfx('hurt');
        RA.fx.shake(4, 0.28);
        RA.fx.burst(it.x, it.y, {
          count: 16, colors: ['#f2705c', '#b83f3a', '#7c88a8'],
          speedMin: 40, speedMax: 130, lift: 30
        });
        if (lives <= 0) endRound();
      }

      function endRound() {
        state = 'over';
        stateT = 0;
        resultStars = score >= 45 ? 3 : score >= 22 ? 2 : 1;
        starsEarned = U.clamp(Math.floor(score / 8) + 1, 1, 8);
        isRecord = RA.save.payout('catch', score, starsEarned);
        if (score >= 30) RA.save.unlock('basket');
        if (goldCount >= 3) RA.save.unlock('goldrush');
        RA.celebrate(resultStars, isRecord);
      }

      return {
        music: 'catch',

        debug: function () {
          return {
            state: state, score: score, lives: lives, combo: combo,
            basketX: Math.round(basketX),
            items: items.map(function (i) {
              return { x: Math.round(i.x), y: Math.round(i.y), kind: i.kind };
            })
          };
        },

        enter: function () {
          t = 0; stateT = 0; state = 'intro';
          best = RA.save.best('catch');
          reset();
        },

        update: function (dt) {
          t += dt; stateT += dt;
          if (hurtFlash > 0) hurtFlash = Math.max(0, hurtFlash - dt);

          if (state === 'play') {
            /* ---- basket ---- */
            var keyed = RA.input.axisX();
            if (keyed) targetX += keyed * 300 * dt;
            if (RA.input.pointer.down || RA.input.pointer.justDown) {
              targetX = RA.input.pointer.x;
            }
            targetX = U.clamp(targetX, BASKET_HALF + 2, RA.W - BASKET_HALF - 2);
            var prev = basketX;
            basketX += (targetX - basketX) * Math.min(1, dt * 15);
            basketVX = (basketX - prev) / Math.max(dt, 0.0001);

            /* ---- wind ---- */
            if (Math.random() < dt * 0.25) windTarget = U.rand(-26, 26);
            wind = U.approach(wind, windTarget, 18 * dt);

            /* ---- spawning ---- */
            if (rainQueue > 0) {
              rainT -= dt;
              if (rainT <= 0) { spawn(true); rainQueue--; rainT = 0.11; }
            } else {
              spawnT -= dt;
              if (spawnT <= 0 && items.length < 16) {
                spawn(false);
                var gap = cfg.spawnBase - Math.min(score, cfg.rampCap) *
                          ((cfg.spawnBase - cfg.spawnMin) / cfg.rampCap);
                spawnT = Math.max(cfg.spawnMin, gap) + U.rand(-0.08, 0.12);
              }
            }

            /* ---- items ---- */
            for (var i = items.length - 1; i >= 0; i--) {
              var it = items[i];
              it.wob += dt * 3;
              it.y += it.vy * dt;
              it.x += (wind * 0.5 + Math.sin(it.wob) * 7) * dt;
              it.rot += it.spin * dt;
              it.x = U.clamp(it.x, 8, RA.W - 8);

              var caught = it.y > BASKET_Y - 12 && it.y < BASKET_Y + 18 &&
                           Math.abs(it.x - basketX) < BASKET_HALF + cfg.catchPad;

              if (caught) {
                items.splice(i, 1);
                if (it.kind === 'bad') { loseLife(it); continue; }

                if (it.kind === 'gold') {
                  goldCount++;
                  var gp = 5 * multiplier();
                  score += gp;
                  combo += 3;
                  RA.audio.sfx('star');
                  RA.fx.popText('+' + gp, it.x, it.y - 8, { color: C.gold, scale: 2 });
                  RA.fx.burst(it.x, it.y, {
                    count: 24, colors: ['#ffd45c', '#fff0bd', '#ffffff'],
                    speedMin: 40, speedMax: 150, lift: 40
                  });
                  RA.fx.shake(3, 0.2);
                } else {
                  var pts = multiplier();
                  score += pts;
                  combo++;
                  RA.audio.sfx('coin');
                  RA.fx.popText('+' + pts, it.x, it.y - 6, {
                    color: pts > 1 ? C.gold : C.cream, scale: pts > 1 ? 2 : 1
                  });
                  RA.fx.burst(it.x, it.y, {
                    count: 8, colors: ['#ffd45c', '#8fe07a', '#ffffff'],
                    speedMin: 20, speedMax: 70, lift: 20
                  });
                }

                if (combo > 0 && combo % 5 === 0 && multiplier() > 1) {
                  RA.fx.popText('X' + multiplier() + ' CHAIN!', RA.W / 2, 74,
                                { color: C.pink, scale: 2 });
                  RA.audio.sfx('powerup');
                }

                if (score >= nextRain) {
                  nextRain += 30;
                  rainQueue = 9; rainT = 0;
                  RA.fx.popText('FRUIT RAIN!', RA.W / 2, 56, { color: C.gold, scale: 3 });
                  RA.audio.sfx('powerup');
                }
                continue;
              }

              if (it.y > GROUND_Y - 2) {
                items.splice(i, 1);
                if (it.kind === 'fruit') {
                  combo = 0;
                  RA.fx.burst(it.x, GROUND_Y - 2, {
                    count: 5, colors: ['#8fe07a', '#3fae5c'],
                    speedMin: 12, speedMax: 44, arcFrom: Math.PI, arcTo: Math.PI * 2
                  });
                }
              }
            }
          }

          if (state === 'count') {
            var prevSec = Math.floor(stateT - dt);
            var nowSec = Math.floor(stateT);
            if (nowSec !== prevSec) {
              RA.audio.sfx(nowSec >= 3 ? 'go' : 'countdown');
            }
            if (stateT >= 3.9) { state = 'play'; stateT = 0; }
          }
        },

        draw: function (ctx) {
          drawOrchard(ctx, t);

          /* falling items */
          for (var i = 0; i < items.length; i++) {
            var it = items[i];
            /* ground shadow so depth reads */
            var d = U.clamp((it.y) / GROUND_Y, 0, 1);
            ctx.globalAlpha = 0.18 * d;
            ctx.fillStyle = '#12132b';
            ctx.fillRect(Math.round(it.x - 4), GROUND_Y - 1, 8, 2);
            ctx.globalAlpha = 1;
            RA.spr.drawC(ctx, it.spr, it.x, it.y, { rotate: it.rot });
          }

          /* basket, tilted by movement */
          var tilt = U.clamp(basketVX / 900, -0.22, 0.22);
          RA.spr.drawC(ctx, 'basket', basketX, BASKET_Y + 4, { rotate: tilt });

          /* ---- HUD ---- */
          ctx.fillStyle = 'rgba(18,19,43,0.62)';
          ctx.fillRect(0, 0, RA.W, 27);

          for (var l = 0; l < maxLives; l++) {
            RA.spr.draw(ctx, l < lives ? 'heart' : 'heart_empty', 6 + l * 11, 10, {});
          }

          RA.font.draw(ctx, score, RA.W / 2, 3, {
            scale: 3, align: 'center', color: C.cream, outline: true, outlineColor: C.ink
          });

          if (multiplier() > 1) {
            RA.font.draw(ctx, 'X' + multiplier(), RA.W / 2 + 42, 7, {
              scale: 2, color: C.gold, outline: true,
              wave: 1, waveTime: t
            });
          }

          RA.font.draw(ctx, 'BEST ' + Math.max(best, score), RA.W - 6, 11, {
            scale: 1, align: 'right', color: C.mist
          });

          /* chain meter, clear of the score */
          if (state === 'play') {
            var into = combo % 5;
            RA.ui.bar(ctx, RA.W / 2 - 30, 29, 60, 4, into / 5,
                      { fill: C.gold, trough: 'rgba(18,19,43,0.6)', back: 'rgba(18,19,43,0.4)' });
          }

          /* wind indicator */
          if (Math.abs(wind) > 6 && state === 'play') {
            var dir = wind > 0 ? 'arrow_r' : 'arrow_l';
            for (var k = 0; k < 3; k++) {
              RA.spr.draw(ctx, dir, RA.W / 2 - 14 + k * 10, 38,
                          { alpha: 0.25 + 0.25 * Math.sin(t * 6 - k) });
            }
          }

          if (hurtFlash > 0) {
            ctx.fillStyle = 'rgba(242,112,92,' + (hurtFlash * 1.6) + ')';
            ctx.fillRect(0, 0, RA.W, RA.H);
          }

          /* ---- states ---- */
          if (state === 'intro') {
            ctx.fillStyle = 'rgba(18,19,43,0.6)';
            ctx.fillRect(0, 0, RA.W, RA.H);
            RA.ui.panel(ctx, 76, 52, 328, 150, { fill: C.ink2, highlight: C.ink3 });
            RA.font.draw(ctx, 'ORCHARD', RA.W / 2, 62, {
              scale: 4, align: 'center', color: C.leaf, outline: true, outlineColor: C.ink
            });
            RA.spr.draw(ctx, 'fruit_apple', 128, 100, { scale: 2 });
            RA.font.draw(ctx, 'CATCH THE FRUIT', 152, 100, { scale: 2, color: C.cream });
            RA.spr.draw(ctx, 'star', 128, 122, { scale: 2 });
            RA.font.draw(ctx, 'GOLD STAR = 5', 152, 122, { scale: 2, color: C.gold });
            RA.spr.draw(ctx, 'haz_rock', 128, 144, { scale: 2 });
            RA.font.draw(ctx, 'DODGE THESE!', 152, 144, { scale: 2, color: C.coral });
            RA.font.draw(ctx, 'SLIDE YOUR FINGER OR USE < >', RA.W / 2, 168, {
              scale: 1, align: 'center', color: C.mist
            });

            RA.ui.begin({ nav: true });
            if (RA.ui.button(ctx, RA.W / 2 - 60, 182, 120, 26, 'PLAY!',
                             { color: C.green, scale: 2 })) {
              state = 'count'; stateT = 0; reset(); RA.audio.sfx('countdown');
            }
            if (RA.ui.button(ctx, 6, 4, 44, 20, '<', { color: C.grape, scale: 1, sound: 'back' })) {
              RA.go('hub');
            }
            RA.ui.end();
            if (RA.input.justPressed('back')) RA.go('hub');

          } else if (state === 'count') {
            RA.ui.countdown(ctx, stateT, 3);

          } else if (state === 'over') {
            var r = RA.ui.results(ctx, {
              t: stateT,
              title: score >= 30 ? 'AMAZING!' : score >= 15 ? 'GREAT!' : 'GOOD TRY!',
              scoreLabel: 'FRUIT CAUGHT',
              score: score,
              stars: resultStars,
              starsEarned: starsEarned,
              record: isRecord,
              lines: goldCount ? ['GOLD STARS: ' + goldCount] : null
            });
            if (r === 'again') { state = 'count'; stateT = 0; reset(); }
            else if (r === 'home') RA.go('hub');

          } else {
            /* small back button during play */
            RA.ui.begin({ nav: false });
            if (RA.ui.button(ctx, 430, 3, 44, 20, '<', { color: C.grape, scale: 1, sound: 'back' })) {
              RA.go('hub');
            }
            RA.ui.end();
            if (RA.input.justPressed('back')) RA.go('hub');
          }
        }
      };
    }
  });

})();
