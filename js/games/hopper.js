/* =====================================================================
   games/hopper.js — SKY HOPPER

   Endless vertical jumper. She bounces automatically; the only job is
   steering. There is exactly one way to lose (fall off the bottom),
   which keeps it readable for a six-year-old, and the sky changes from
   morning to space as she climbs, so height feels like progress.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var C = RA.C;

  var GRAVITY = 980;
  var JUMP_V = -432;
  var SPRING_V = -720;
  /* Overridden per age band. A young child steers bang-bang — hold left,
     hold right — so a high top speed makes them overshoot the platform
     rather than land on it. Slower is genuinely easier here. */
  var MOVE_ACC = 980;
  var MAX_VX = 215;

  /* How far down the screen the camera holds her. This must leave more
     than one full jump of headroom below her apex, or she can fall past
     the bottom of the screen onto a platform she was standing on. */
  var START_PLAT_Y = 40;

  /* Sky bands she climbs through. */
  var BANDS = [
    RA.bg.PALETTES.meadow,
    RA.bg.PALETTES.day,
    RA.bg.PALETTES.sunset,
    RA.bg.PALETTES.dream,
    RA.bg.PALETTES.night
  ];
  var BAND_HEIGHT = 260;   // metres per band

  function drawPlatform(ctx, p, sx, sy) {
    var w = p.w, h = 8;
    var x = Math.round(sx), y = Math.round(sy);
    /* dark keyline: white clouds on a pale sky need it to stay readable */
    ctx.fillStyle = '#5a6a94';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    if (p.kind === 'leaf') {
      ctx.fillStyle = '#1d7a45'; ctx.fillRect(x, y + 2, w, h - 2);
      ctx.fillStyle = '#3fae5c'; ctx.fillRect(x, y + 1, w, 4);
      ctx.fillStyle = '#8fe07a'; ctx.fillRect(x + 2, y, w - 4, 2);
      ctx.fillStyle = '#d8f7c0';
      for (var i = 3; i < w - 3; i += 7) ctx.fillRect(x + i, y + 1, 2, 1);
    } else {
      /* cloud */
      ctx.fillStyle = '#c3cde0'; ctx.fillRect(x, y + 3, w, 5);
      ctx.fillStyle = '#e8ecff'; ctx.fillRect(x, y + 1, w, 4);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 3, y, w - 6, 3);
      ctx.fillRect(x + 8, y - 2, w - 16, 3);
      ctx.fillStyle = '#a8aed8'; ctx.fillRect(x + 1, y + 7, w - 2, 1);
    }
    if (p.kind === 'spring') {
      RA.spr.draw(ctx, 'plat_spring', x + w / 2 - 5, y - 7 - (p.springT > 0 ? 3 : 0), {});
    }
    if (p.kind === 'move') {
      ctx.fillStyle = '#63c9f0';
      ctx.fillRect(x + 2, y + 8, w - 4, 1);
    }
  }

  RA.registerGame({
    id: 'hopper',
    title: 'SKY HOP',
    color: '#2f7fd6',
    artBg: '#9fe4ff',
    icon: 'plat_cloud',
    bestLabel: function (b) { return 'BEST ' + b + 'M'; },

    preview: function (ctx, x, y, w, h, t) {
      RA.bg.sky(ctx, RA.bg.PALETTES.day, x, y, w, h);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      var scroll = (t * 26) % 26;
      for (var i = -1; i < 4; i++) {
        var py = y + i * 26 + scroll;
        var px = x + 12 + ((i * 53) % (w - 44));
        drawPlatform(ctx, { w: 30, kind: i % 3 === 0 ? 'leaf' : 'cloud' }, px, py);
      }
      var hop = Math.abs(Math.sin(t * 3)) * 12;
      RA.spr.drawC(ctx, 'girl_jump', x + w / 2, y + h - 18 - hop, {});
      ctx.restore();
    },

    scene: function () {
      var state = 'intro';    // intro | play | over
      var t = 0, stateT = 0;
      var cfg = RA.tune.get('hopper');
      var CAM_ANCHOR = cfg.camAnchor;
      var player, plats, pickups, camY, startY, maxUp, best;
      var score = 0, starsGot = 0, resultStars = 0, starsEarned = 0, isRecord = false;
      var topGen = 0, nextId = 0;
      var puffT = 0, rescues = 0, rescueT = 0;

      function reset() {
        cfg = RA.tune.get('hopper');
        CAM_ANCHOR = cfg.camAnchor;
        MAX_VX = cfg.maxVX;
        MOVE_ACC = cfg.moveAcc;
        /* She starts standing ON the first platform, not floating above
           it — otherwise her opening jump peaks higher than one jump's
           worth of headroom and she lands below the camera. */
        player = {
          x: RA.W / 2, y: START_PLAT_Y - 9, vx: 0, vy: JUMP_V,
          w: 12, h: 16, face: 1, frame: 0
        };
        startY = player.y;
        camY = player.y - RA.H * CAM_ANCHOR;
        maxUp = 0;
        score = 0; starsGot = 0;
        rescues = cfg.rescues; rescueT = 0;
        plats = []; pickups = []; nextId = 0;

        /* a wide starter platform right under her */
        plats.push({ id: nextId++, x: RA.W / 2 - 34, y: START_PLAT_Y, w: 68, kind: 'cloud', vx: 0 });
        topGen = START_PLAT_Y;
        while (topGen > camY - 120) generateRow();
      }

      function generateRow() {
        var height = Math.max(0, Math.floor((startY - topGen) / 6));
        /* One bounce lasts 0.88s and tops out at 215px/s, so she can only
           cover ~165px sideways with perfect play. A frame-perfect bot
           still died in 9-13s when this asked for up to 127px, so the
           reach is now well inside what one comfortable bounce buys. */
        var warmUp = height < 60;
        var gap = warmUp ? U.rand(cfg.gapMin - 4, cfg.gapMin + 4)
                         : U.rand(cfg.gapMin, cfg.gapMax + Math.min(cfg.gapGrow, height / 90));
        topGen -= gap;

        var w = warmUp ? Math.round(U.rand(cfg.platMax - 6, cfg.platMax + 10))
                       : Math.round(U.rand(cfg.platMin, cfg.platMax) -
                                    Math.min(8, height / 220));

        /* Every so often, a wide ledge she can hardly miss. It turns a
           bad run into a pause rather than a fall. */
        var isSafety = cfg.safetyEvery > 0 && (nextId % cfg.safetyEvery === 0);
        if (isSafety) w = cfg.safetyW;

        var prev = plats.length ? plats[plats.length - 1] : null;
        var fromX = prev ? prev.x + prev.w / 2 : RA.W / 2;
        var reach = isSafety ? cfg.reachBase * 0.5
                  : warmUp   ? cfg.reachBase * 0.7
                             : cfg.reachBase + Math.min(cfg.reachGrow, height / 40);
        var cx = fromX + U.rand(-reach, reach);
        cx = U.clamp(cx, w / 2 + 6, RA.W - w / 2 - 6);
        var x = cx - w / 2;

        var kind = 'cloud';
        var r = Math.random();
        if (r > 0.86) kind = 'leaf';
        if (height > 120 && r < 0.16) kind = 'move';
        var p = {
          id: nextId++, x: x, y: topGen, w: w, kind: kind,
          vx: kind === 'move' ? (Math.random() < 0.5 ? -1 : 1) * U.rand(22, 42) : 0,
          springT: 0
        };
        if (Math.random() < cfg.springPct && height > 40) p.kind = 'spring';
        plats.push(p);

        if (Math.random() < 0.22) {
          pickups.push({ x: x + w / 2, y: topGen - 16, taken: 0, ph: Math.random() * 6 });
        }
      }

      function die() {
        state = 'over'; stateT = 0;
        resultStars = score >= 600 ? 3 : score >= 250 ? 2 : 1;
        starsEarned = U.clamp(Math.floor(score / 60) + starsGot + 1, 1, 20);
        isRecord = RA.save.payout('hopper', score, starsEarned);
        if (score >= 800) RA.save.unlock('high');
        RA.celebrate(resultStars, isRecord);
      }

      return {
        music: 'hopper',

        debug: function () {
          return {
            state: state, score: score, starsGot: starsGot, rescues: rescues,
            camY: Math.round(camY),
            px: player && Math.round(player.x), py: player && Math.round(player.y),
            vy: player && Math.round(player.vy),
            vx: player && Math.round(player.vx),
            plats: plats.map(function (p) {
              return { x: Math.round(p.x), y: Math.round(p.y), w: p.w, kind: p.kind };
            })
          };
        },

        enter: function () {
          t = 0; stateT = 0; state = 'intro';
          best = RA.save.best('hopper');
          reset();
        },

        update: function (dt) {
          t += dt; stateT += dt;
          if (state !== 'play') return;

          /* ---- steering ---- */
          var dir = RA.input.axisX();
          if (!dir && RA.input.pointer.down) {
            dir = RA.input.pointer.x < RA.W / 2 ? -1 : 1;
          }
          if (dir) {
            player.vx += dir * MOVE_ACC * dt;
            player.face = dir;
          } else {
            player.vx = U.approach(player.vx, 0, 620 * dt);
          }
          player.vx = U.clamp(player.vx, -MAX_VX, MAX_VX);

          /* ---- physics ---- */
          player.vy += GRAVITY * dt;
          player.x += player.vx * dt;
          player.y += player.vy * dt;

          /* wrap around the sides — forgiving and fun */
          if (player.x < -10) player.x = RA.W + 8;
          if (player.x > RA.W + 10) player.x = -8;

          /* ---- moving platforms ---- */
          for (var m = 0; m < plats.length; m++) {
            var mp = plats[m];
            if (mp.vx) {
              mp.x += mp.vx * dt;
              if (mp.x < 4) { mp.x = 4; mp.vx = Math.abs(mp.vx); }
              if (mp.x + mp.w > RA.W - 4) { mp.x = RA.W - 4 - mp.w; mp.vx = -Math.abs(mp.vx); }
            }
            if (mp.springT > 0) mp.springT = Math.max(0, mp.springT - dt);
          }

          /* ---- landing ---- */
          if (player.vy > 0) {
            for (var i = 0; i < plats.length; i++) {
              var p = plats[i];
              var feet = player.y + player.h / 2;
              if (feet > p.y - 2 && feet < p.y + 10 &&
                  player.x + 5 > p.x && player.x - 5 < p.x + p.w) {
                var spring = p.kind === 'spring';
                player.vy = spring ? SPRING_V : JUMP_V;
                player.y = p.y - player.h / 2 - 1;
                if (spring) { p.springT = 0.3; RA.audio.sfx('bounce'); RA.fx.shake(3, 0.18); }
                else RA.audio.sfx('jump');
                RA.fx.burst(player.x, p.y + 2, {
                  count: spring ? 14 : 6,
                  colors: ['#ffffff', '#e8ecff', '#c3cde0'],
                  speedMin: 18, speedMax: spring ? 90 : 46,
                  arcFrom: 0, arcTo: Math.PI, gravity: 80
                });
                break;
              }
            }
          }

          /* ---- camera + score ---- */
          var want = player.y - RA.H * CAM_ANCHOR;
          if (want < camY) camY = want;
          var up = startY - player.y;
          if (up > maxUp) {
            maxUp = up;
            var newScore = Math.floor(maxUp / 6);
            if (newScore > score) {
              if (Math.floor(newScore / 100) > Math.floor(score / 100)) {
                RA.fx.popText(newScore - (newScore % 100) + 'M!', RA.W / 2, 70,
                              { color: C.gold, scale: 3 });
                RA.audio.sfx('powerup');
              }
              score = newScore;
            }
          }

          /* ---- generate / cull ---- */
          while (topGen > camY - 140) generateRow();
          for (var c = plats.length - 1; c >= 0; c--) {
            if (plats[c].y > camY + RA.H + 60) plats.splice(c, 1);
          }
          for (var k = pickups.length - 1; k >= 0; k--) {
            var pk = pickups[k];
            if (pk.taken > 0) {
              pk.taken += dt * 3;
              if (pk.taken > 1) pickups.splice(k, 1);
              continue;
            }
            if (pk.y > camY + RA.H + 60) { pickups.splice(k, 1); continue; }
            if (Math.abs(pk.x - player.x) < 12 && Math.abs(pk.y - player.y) < 14) {
              pk.taken = 0.001;
              starsGot++;
              RA.audio.sfx('star');
              RA.fx.popText('+1', pk.x, pk.y - 10, { color: C.gold, scale: 2 });
              RA.fx.burst(pk.x, pk.y, {
                count: 16, colors: ['#ffd45c', '#fff0bd', '#ffffff'],
                speedMin: 25, speedMax: 90
              });
            }
          }

          /* trail puffs while rising fast */
          puffT -= dt;
          if (player.vy < -260 && puffT <= 0) {
            puffT = 0.05;
            RA.fx.emit({
              x: player.x + U.rand(-4, 4), y: player.y + 8,
              vx: U.rand(-8, 8), vy: U.rand(10, 30),
              life: 0.35, size: 2, color: '#ffffff', gravity: 0
            });
          }

          /* ---- fall out ----
             The first falls are caught by a balloon rather than ending the
             run. A child learns the controls from the recovery; ending it
             at the first mistake teaches nothing and just stings.        */
          if (player.y - camY > RA.H + 30) {
            if (rescues > 0) {
              rescues--;
              /* find the highest platform that is still on screen */
              var catcher = null;
              for (var ri = 0; ri < plats.length; ri++) {
                var rp = plats[ri];
                var sy = rp.y - camY;
                if (sy > 40 && sy < RA.H - 20 && (!catcher || rp.y > catcher.y)) catcher = rp;
              }
              if (catcher) {
                player.x = catcher.x + catcher.w / 2;
                player.y = catcher.y - player.h / 2 - 1;
              } else {
                player.x = RA.W / 2;
                player.y = camY + RA.H * 0.5;
              }
              player.vx = 0;
              player.vy = JUMP_V;
              rescueT = 1.2;
              RA.audio.sfx('powerup');
              RA.fx.popText('SAVED!', player.x, player.y - camY - 22,
                            { color: C.gold, scale: 3 });
              RA.fx.burst(player.x, player.y - camY, {
                count: 20, colors: ['#ff9ec4', '#ffd45c', '#ffffff'],
                speedMin: 30, speedMax: 100
              });
            } else {
              die();
            }
          }

          player.frame = player.vy < 0 ? 0 : 1;
        },

        draw: function (ctx) {
          /* ---- layered sky by altitude ---- */
          var band = U.clamp(score / BAND_HEIGHT, 0, BANDS.length - 1.001);
          var bi = Math.floor(band), bf = band - bi;
          RA.bg.sky(ctx, BANDS[bi]);
          if (bf > 0.01) {
            ctx.globalAlpha = bf;
            RA.bg.sky(ctx, BANDS[Math.min(bi + 1, BANDS.length - 1)]);
            ctx.globalAlpha = 1;
          }
          if (band > 2.4) {
            ctx.globalAlpha = U.clamp((band - 2.4) / 1.2, 0, 1);
            RA.bg.stars(ctx, t, { height: RA.H });
            ctx.globalAlpha = 1;
          }

          /* parallax clouds drifting down as she climbs */
          var par = (-camY * 0.25) % 300;
          ctx.globalAlpha = 0.5;
          RA.bg.clouds(ctx, t * 0.5 + par * 0.02, { count: 4, speed: 3, top: 20, band: 180, alpha: 0.5 });
          ctx.globalAlpha = 1;

          /* ---- platforms ---- */
          for (var i = 0; i < plats.length; i++) {
            var p = plats[i];
            var sy = p.y - camY;
            if (sy < -20 || sy > RA.H + 20) continue;
            drawPlatform(ctx, p, p.x, sy);
          }

          /* ---- pickups ---- */
          for (var k = 0; k < pickups.length; k++) {
            var pk = pickups[k];
            var py = pk.y - camY;
            if (py < -20 || py > RA.H + 20) continue;
            if (pk.taken > 0) {
              RA.spr.drawC(ctx, 'star', pk.x, py - pk.taken * 14,
                           { alpha: 1 - pk.taken, scale: 1 + pk.taken });
            } else {
              RA.spr.drawC(ctx, 'star', pk.x, py + Math.sin(t * 3 + pk.ph) * 3, {});
            }
          }

          /* ---- player ---- */
          if (state !== 'intro') {
            var sprName = player.vy < 0 ? 'girl_jump' : 'girl_fall';
            var py2 = player.y - camY;
            RA.spr.drawC(ctx, sprName, player.x, py2, { flipX: player.face < 0 });
            /* wrap ghost so she never visually vanishes at the edges */
            if (player.x < 14) RA.spr.drawC(ctx, sprName, player.x + RA.W, py2, { flipX: player.face < 0 });
            if (player.x > RA.W - 14) RA.spr.drawC(ctx, sprName, player.x - RA.W, py2, { flipX: player.face < 0 });
          }

          /* ---- HUD ---- */
          ctx.fillStyle = 'rgba(18,19,43,0.78)';
          ctx.fillRect(0, 0, RA.W, 22);
          RA.font.draw(ctx, score + 'M', 8, 7, {
            scale: 2, color: C.cream, outline: true, outlineColor: C.ink
          });
          RA.spr.draw(ctx, 'star_small', RA.W / 2 - 20, 8, {});
          RA.font.draw(ctx, starsGot, RA.W / 2 - 8, 8, { scale: 2, color: C.gold });

          /* balloons left = falls that will be caught */
          for (var rb = 0; rb < rescues; rb++) {
            RA.spr.draw(ctx, 'heart', RA.W / 2 + 26 + rb * 10, 8, {});
          }
          RA.font.draw(ctx, 'BEST ' + Math.max(best, score) + 'M', RA.W - 8, 9, {
            scale: 1, align: 'right', color: C.mist
          });

          /* danger marker when she's low on screen */
          if (state === 'play') {
            var low = (player.y - camY) / RA.H;
            if (low > 0.82) {
              ctx.fillStyle = 'rgba(242,112,92,' + ((low - 0.82) / 0.18 * 0.4) + ')';
              ctx.fillRect(0, RA.H - 30, RA.W, 30);
            }
          }

          RA.ui.begin({ nav: state !== 'play' });

          if (state === 'intro') {
            ctx.fillStyle = 'rgba(18,19,43,0.6)';
            ctx.fillRect(0, 0, RA.W, RA.H);
            RA.ui.panel(ctx, 84, 46, 312, 156, { fill: C.ink2, highlight: C.ink3 });
            RA.font.draw(ctx, 'SKY HOPPER', RA.W / 2, 56, {
              scale: 4, align: 'center', color: C.sky, outline: true, outlineColor: C.ink
            });
            RA.spr.drawC(ctx, 'girl_jump', 128, 108, { scale: 2 });
            RA.font.wrap(ctx, 'SHE JUMPS BY HERSELF. YOU JUST STEER!',
                         162, 92, 210, { scale: 2, color: C.cream });
            RA.font.draw(ctx, 'TAP LEFT OR RIGHT SIDE, OR USE < >', RA.W / 2, 140, {
              scale: 1, align: 'center', color: C.mist
            });
            RA.font.draw(ctx, 'GRAB STARS. GO AS HIGH AS YOU CAN!', RA.W / 2, 152, {
              scale: 1, align: 'center', color: C.gold
            });
            if (RA.ui.button(ctx, RA.W / 2 - 60, 168, 120, 26, 'CLIMB!',
                             { color: C.green, scale: 2 })) {
              state = 'play'; stateT = 0; reset();
            }
            if (RA.ui.button(ctx, 6, 4, 44, 20, '<', { color: C.grape, scale: 1, sound: 'back' })) {
              RA.go('hub');
            }
            if (RA.input.justPressed('back')) RA.go('hub');

          } else if (state === 'over') {
            var r = RA.ui.results(ctx, {
              t: stateT,
              title: score >= 500 ? 'SO HIGH!' : score >= 200 ? 'GREAT CLIMB!' : 'NICE TRY!',
              scoreLabel: 'HEIGHT REACHED',
              score: score,
              stars: resultStars,
              starsEarned: starsEarned,
              record: isRecord,
              lines: ['STARS GRABBED ' + starsGot]
            });
            if (r === 'again') { state = 'play'; stateT = 0; reset(); }
            else if (r === 'home') RA.go('hub');

          } else {
            if (RA.ui.button(ctx, 430, 26, 44, 20, '<',
                             { color: C.grape, scale: 1, sound: 'back' })) RA.go('hub');
            if (RA.input.justPressed('back')) RA.go('hub');
          }
          RA.ui.end();
        }
      };
    }
  });

})();
