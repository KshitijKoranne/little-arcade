/* =====================================================================
   games/memory.js — ANIMAL MATCH

   Flip cards, find the pairs. The board opens with a short "peek" so a
   young player starts with a fair mental picture instead of blind luck,
   and the score rewards remembering rather than speed.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var C = RA.C;

  var NAMES = ['EASY', 'MEDIUM', 'HARD'];
  var COLORS = ['#3fae5c', '#f7a72b', '#ef5b93'];

  /* Board sizes come from the age band. Visual working memory is about
     3.5 items at seven rising to ~5.7 in adults, and remembering an item
     AND where it was is harder than either alone — so the boards stay
     below raw span. */
  function levels() {
    var cfg = RA.tune.get('memory');
    return cfg.pairs.map(function (p, i) {
      var cols = p <= 3 ? 3 : p <= 6 ? 4 : p <= 8 ? 4 : 6;
      var rows = Math.ceil((p * 2) / cols);
      return {
        pairs: p, cols: cols, rows: rows,
        name: NAMES[i], color: COLORS[i],
        peek: cfg.peek[i], minCard: cfg.minCard
      };
    });
  }

  /* Card back: a woven pixel pattern, drawn once per size and cached. */
  var backCache = {};
  function cardBack(w, h) {
    var key = w + 'x' + h;
    if (backCache[key]) return backCache[key];
    var cv = U.makeCanvas(w, h);
    var g = cv.getContext('2d');
    g.fillStyle = '#4a2a8f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7a4fd1';
    for (var y = 0; y < h; y += 4) {
      for (var x = (y / 4 % 2) * 4; x < w; x += 8) g.fillRect(x, y, 4, 2);
    }
    g.fillStyle = '#b48cf5';
    for (var yy = 2; yy < h; yy += 8) for (var xx = 2; xx < w; xx += 8) g.fillRect(xx, yy, 2, 2);
    g.fillStyle = '#12132b';
    g.fillRect(0, 0, w, 1); g.fillRect(0, h - 1, w, 1);
    g.fillRect(0, 0, 1, h); g.fillRect(w - 1, 0, 1, h);
    backCache[key] = cv;
    return cv;
  }

  RA.registerGame({
    id: 'memory',
    title: 'MATCH',
    color: '#6b3fc0',
    artBg: '#2e2f4a',
    icon: 'an_cat',
    bestLabel: function (b) { return 'BEST ' + b; },

    preview: function (ctx, x, y, w, h, t) {
      RA.bg.sky(ctx, ['#4a2a8f', '#7a4fd1', '#b48cf5'], x, y, w, h);
      var cw = 22, ch = 28;
      for (var i = 0; i < 3; i++) {
        var cx = x + w / 2 + (i - 1) * 30;
        var flip = Math.sin(t * 1.6 + i * 1.4);
        var sx = Math.abs(flip);
        var dw = Math.max(2, Math.round(cw * sx));
        var dx = Math.round(cx - dw / 2), dy = Math.round(y + h / 2 - ch / 2);
        if (flip > 0) {
          ctx.drawImage(cardBack(cw, ch), dx, dy, dw, ch);
        } else {
          ctx.fillStyle = '#12132b'; ctx.fillRect(dx - 1, dy - 1, dw + 2, ch + 2);
          ctx.fillStyle = '#e8ecff'; ctx.fillRect(dx, dy, dw, ch);
          if (dw > 14) {
            ctx.save(); ctx.beginPath(); ctx.rect(dx, dy, dw, ch); ctx.clip();
            RA.spr.drawC(ctx, RA.ANIMALS[i * 3 % RA.ANIMALS.length], cx, dy + ch / 2, {});
            ctx.restore();
          }
        }
      }
    },

    scene: function () {
      var state = 'levels';   // levels | peek | play | won
      var t = 0, stateT = 0;
      var lvl = null, cards = [], cursor = 0;
      var LEVELS = levels(), lvlIndex = 0;
      var first = null, lockT = 0, moves = 0, mistakes = 0, found = 0;
      var elapsed = 0;
      var score = 0, resultStars = 0, starsEarned = 0, isRecord = false;
      var layout = { x: 0, y: 0, cw: 0, ch: 0, gap: 0 };

      function build(levelIndex) {
        LEVELS = levels();
        lvlIndex = levelIndex;
        lvl = LEVELS[levelIndex];
        var chosen = U.shuffle(RA.ANIMALS).slice(0, lvl.pairs);
        var deck = U.shuffle(chosen.concat(chosen));

        /* fit the grid inside the play area */
        var boxX = 30, boxY = 32, boxW = RA.W - 60, boxH = RA.H - 60;
        var gap = 7;
        var cw = Math.floor((boxW - gap * (lvl.cols - 1)) / lvl.cols);
        var ch = Math.floor((boxH - gap * (lvl.rows - 1)) / lvl.rows);
        cw = Math.min(cw, Math.floor(ch * 0.78), 66);
        ch = Math.min(ch, Math.floor(cw / 0.78));
        /* Small fingers need a target roughly double the adult minimum. */
        cw = Math.max(cw, lvl.minCard);
        ch = Math.max(ch, Math.round(lvl.minCard * 1.28));
        var gridW = cw * lvl.cols + gap * (lvl.cols - 1);
        var gridH = ch * lvl.rows + gap * (lvl.rows - 1);
        layout = {
          x: Math.round(boxX + (boxW - gridW) / 2),
          y: Math.round(boxY + (boxH - gridH) / 2),
          cw: cw, ch: ch, gap: gap
        };

        cards = deck.map(function (spr, i) {
          var col = i % lvl.cols, row = Math.floor(i / lvl.cols);
          return {
            spr: spr,
            x: layout.x + col * (cw + gap),
            y: layout.y + row * (ch + gap),
            flip: 1,          // 1 = face up, 0 = face down
            target: 1,
            matched: false,
            pulse: 0,
            wobble: 0,
            appear: -i * 0.035
          };
        });

        first = null; lockT = 0; moves = 0; mistakes = 0; found = 0;
        elapsed = 0; cursor = 0;
        state = 'peek'; stateT = 0;
      }

      function faceUp(c) { return c.target > 0.5; }

      function tryFlip(c) {
        if (lockT > 0 || c.matched || faceUp(c)) return;
        c.target = 1;
        RA.audio.sfx('flip');
        if (!first) { first = c; return; }

        moves++;
        var a = first, b = c;
        first = null;

        if (a.spr === b.spr) {
          lockT = 0.28;
          a.matched = b.matched = true;
          a.pulse = b.pulse = 1;
          found++;
          RA.audio.sfx('match');
          RA.fx.burst(a.x + layout.cw / 2, a.y + layout.ch / 2, {
            count: 12, colors: ['#ffd45c', '#fff0bd', '#ffffff'], speedMin: 20, speedMax: 70
          });
          RA.fx.burst(b.x + layout.cw / 2, b.y + layout.ch / 2, {
            count: 12, colors: ['#ffd45c', '#fff0bd', '#ffffff'], speedMin: 20, speedMax: 70
          });
          RA.fx.popText('PAIR!', (a.x + b.x) / 2 + layout.cw / 2,
                        (a.y + b.y) / 2 + layout.ch / 2 - 10, { color: C.gold, scale: 2 });
          if (found === lvl.pairs) finish();
        } else {
          mistakes++;
          lockT = 0.85;
          a.wobble = 1; b.wobble = 1;
          RA.audio.sfx('wrong');
          hideLater = [a, b];
          hideT = 0.8;
        }
      }

      var hideLater = null, hideT = 0;

      function finish() {
        state = 'won'; stateT = 0;
        var perfectMoves = lvl.pairs;
        var timeBonus = Math.max(0, 60 - Math.floor(elapsed)) * 2;
        score = Math.max(20, lvl.pairs * 120 - (moves - perfectMoves) * 12 - mistakes * 8 + timeBonus);
        resultStars = moves <= perfectMoves * 1.6 ? 3 : moves <= perfectMoves * 2.5 ? 2 : 1;
        starsEarned = U.clamp(lvl.pairs + resultStars * 2, 1, 20);
        isRecord = RA.save.payout('memory', score, starsEarned);
        if (lvl.pairs === 8) RA.save.unlock('sharp');
        if (mistakes === 0) RA.save.unlock('perfect');
        RA.celebrate(resultStars, isRecord);
      }

      return {
        music: 'memory',

        enter: function () { t = 0; stateT = 0; state = 'levels'; cards = []; LEVELS = levels(); },

        update: function (dt) {
          t += dt; stateT += dt;

          for (var i = 0; i < cards.length; i++) {
            var c = cards[i];
            c.appear = Math.min(1, c.appear + dt * 2.2);
            c.flip = U.approach(c.flip, c.target, dt * 5.5);
            if (c.pulse > 0) c.pulse = Math.max(0, c.pulse - dt * 2.2);
            if (c.wobble > 0) c.wobble = Math.max(0, c.wobble - dt * 2.6);
          }

          if (state === 'peek') {
            if (stateT >= lvl.peek) {
              for (var p = 0; p < cards.length; p++) cards[p].target = 0;
              state = 'play'; stateT = 0;
              RA.audio.sfx('whoosh');
            }
          }

          if (state === 'play') {
            elapsed += dt;
            if (lockT > 0) lockT = Math.max(0, lockT - dt);
            if (hideLater) {
              hideT -= dt;
              if (hideT <= 0) {
                hideLater[0].target = 0; hideLater[1].target = 0;
                hideLater = null;
              }
            }

            /* keyboard cursor */
            var moved = 0;
            if (RA.input.justPressed('right')) { cursor++; moved = 1; }
            if (RA.input.justPressed('left')) { cursor--; moved = 1; }
            if (RA.input.justPressed('down')) { cursor += lvl.cols; moved = 1; }
            if (RA.input.justPressed('up')) { cursor -= lvl.cols; moved = 1; }
            if (moved) {
              cursor = (cursor + cards.length) % cards.length;
              RA.audio.sfx('move');
            }
            if (RA.input.justPressed('ok')) tryFlip(cards[cursor]);

            for (var j = 0; j < cards.length; j++) {
              var cc = cards[j];
              if (RA.input.tapped(cc.x, cc.y, layout.cw, layout.ch)) {
                cursor = j;
                tryFlip(cc);
              }
            }
          }
        },

        draw: function (ctx) {
          /* dreamy dithered backdrop */
          RA.bg.sky(ctx, RA.bg.PALETTES.dream);
          RA.bg.stars(ctx, t, { height: RA.H });
          RA.bg.butterflies(ctx, t * 0.5, 2, { top: 210, band: 40, alpha: 0.5 });

          RA.ui.begin({ nav: state === 'levels' });

          if (state === 'levels') {
            RA.font.draw(ctx, 'ANIMAL MATCH', RA.W / 2, 30, {
              scale: 4, align: 'center', color: C.cream,
              outline: true, outlineColor: C.ink, shadow: true, shadowColor: C.plum
            });
            RA.font.draw(ctx, 'FIND THE PAIRS', RA.W / 2, 66, {
              scale: 2, align: 'center', color: C.lilac
            });

            for (var i = 0; i < LEVELS.length; i++) {
              var L = LEVELS[i];
              var bx = RA.W / 2 - 110, by = 92 + i * 40;
              if (RA.ui.button(ctx, bx, by, 220, 32,
                               L.name + '  -  ' + L.pairs + ' PAIRS',
                               { color: L.color, scale: 2 })) {
                build(i);
              }
            }
            RA.font.draw(ctx, 'BEST SCORE ' + RA.save.best('memory'), RA.W / 2, 224, {
              scale: 1, align: 'center', color: C.mist
            });
            if (RA.ui.button(ctx, 6, 4, 44, 20, '<', { color: C.grape, scale: 1, sound: 'back' })) {
              RA.go('hub');
            }
            RA.ui.end();
            if (RA.input.justPressed('back')) RA.go('hub');
            return;
          }

          /* ---- board ---- */
          for (var n = 0; n < cards.length; n++) {
            var c = cards[n];
            if (c.appear <= 0) continue;
            var pop = U.easeOutBack(U.clamp(c.appear, 0, 1));
            var wob = c.wobble > 0 ? Math.sin(c.wobble * 26) * 3 * c.wobble : 0;
            var pulse = c.pulse > 0 ? 1 + Math.sin(c.pulse * 9) * 0.06 * c.pulse : 1;

            var cw = layout.cw * pop * pulse;
            var ch = layout.ch * pop * pulse;
            var cx = c.x + layout.cw / 2 + wob;
            var cy = c.y + layout.ch / 2;

            /* flip: squash horizontally through zero */
            var f = c.flip;
            var sx = Math.abs(Math.cos(Math.PI * (1 - f)));
            var dw = Math.max(1, Math.round(cw * sx));
            var dh = Math.round(ch);
            var dx = Math.round(cx - dw / 2), dy = Math.round(cy - dh / 2);

            ctx.globalAlpha = c.matched ? 0.88 : 1;

            if (f < 0.5) {
              ctx.drawImage(cardBack(layout.cw, layout.ch), dx, dy, dw, dh);
            } else {
              ctx.fillStyle = C.ink;
              ctx.fillRect(dx - 1, dy - 1, dw + 2, dh + 2);
              ctx.fillStyle = c.matched ? '#d8f7c0' : C.paper;
              ctx.fillRect(dx, dy, dw, dh);
              ctx.fillStyle = c.matched ? '#8fe07a' : C.mist;
              ctx.fillRect(dx, dy + dh - 2, dw, 2);
              if (dw > 18) {
                ctx.save();
                ctx.beginPath(); ctx.rect(dx, dy, dw, dh); ctx.clip();
                RA.spr.drawC(ctx, c.spr, cx, cy, { scale: layout.cw > 52 ? 2 : 1.5 });
                ctx.restore();
              }
              if (c.matched) {
                ctx.fillStyle = 'rgba(143,224,122,0.35)';
                ctx.fillRect(dx, dy, dw, dh);
              }
            }
            ctx.globalAlpha = 1;

            if (state === 'play' && n === cursor && RA.ui.keyboardActive) {
              ctx.fillStyle = C.cream;
              var off = Math.floor(t * 14) % 5;
              for (var q = off; q < layout.cw; q += 5) {
                ctx.fillRect(c.x + q, c.y - 3, 3, 1);
                ctx.fillRect(c.x + q, c.y + layout.ch + 2, 3, 1);
              }
            }
          }

          /* ---- HUD ---- */
          ctx.fillStyle = 'rgba(18,19,43,0.6)';
          ctx.fillRect(0, 0, RA.W, 22);
          RA.font.draw(ctx, 'TURNS ' + moves, 8, 8, { scale: 1, color: C.cream });
          RA.font.draw(ctx, 'PAIRS ' + found + '/' + (lvl ? lvl.pairs : 0), RA.W / 2, 8, {
            scale: 1, align: 'center', color: C.cream
          });
          RA.font.draw(ctx, 'OOPS ' + mistakes, RA.W - 60, 8, { scale: 1, color: C.mist });

          if (state === 'peek') {
            RA.font.draw(ctx, 'REMEMBER!', RA.W / 2, RA.H - 22, {
              scale: 3, align: 'center', color: C.gold,
              outline: true, outlineColor: C.ink, wave: 2, waveTime: t
            });
            RA.ui.bar(ctx, RA.W / 2 - 60, RA.H - 8, 120, 5,
                      1 - stateT / lvl.peek, { fill: C.gold });
          }

          if (state === 'won') {
            var r = RA.ui.results(ctx, {
              t: stateT,
              title: mistakes === 0 ? 'PERFECT!' : 'YOU DID IT!',
              scoreLabel: 'SCORE',
              score: score,
              stars: resultStars,
              starsEarned: starsEarned,
              record: isRecord,
              lines: ['TURNS ' + moves + '   TIME ' + Math.floor(elapsed) + 'S']
            });
            if (r === 'again') build(lvlIndex);
            else if (r === 'home') { state = 'levels'; stateT = 0; }
          } else {
            if (RA.ui.button(ctx, 430, 3, 44, 20, '<',
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
