/* =====================================================================
   games/hub.js — title, player picker, name entry, game select,
                  sticker album, settings.

   The hub reads RA.games, so adding a seventh game needs no edits here.
   Each game may expose preview(ctx, x, y, w, h, t) to draw its own
   animated card art; if it doesn't, a sensible fallback is used.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var C = RA.C;

  /* Where to go once someone taps the title screen. */
  function firstStop() {
    return RA.save.profileCount() ? 'hub' : 'newplayer';
  }

  /* ==================================================================
     TITLE
     ================================================================== */
  RA.registerScene('title', function () {
    var t = 0, ready = 0;

    return {
      music: 'hub',
      enter: function () { t = 0; ready = 0; },

      update: function (dt) {
        t += dt;
        ready += dt;
        if (ready > 0.45 && (RA.input.anyPressedThisFrame || RA.input.pointer.justDown)) {
          RA.audio.init();
          RA.go(firstStop());
        }
      },

      draw: function (ctx) {
        RA.bg.sky(ctx, RA.bg.PALETTES.dream);
        RA.bg.stars(ctx, t, { height: 170 });

        RA.bg.hills(ctx, t * 4, {
          baseY: RA.H - 52, step: 16,
          layers: [
            { color: '#4a2a8f', amp: 13, freq: 0.011, speed: 0.2, offset: 0 },
            { color: '#3a1f70', amp: 17, freq: 0.008, speed: 0.4, offset: 60 }
          ]
        });

        RA.bg.butterflies(ctx, t, 4, { top: 150, band: 70, alpha: 0.9 });

        var bobY = Math.sin(t * 1.6) * 3;
        RA.font.draw(ctx, 'THE LITTLE', RA.W / 2, 40 + bobY, {
          scale: 4, align: 'center', color: C.cream,
          outline: true, outlineColor: C.ink, shadow: true, shadowColor: C.plum
        });
        RA.font.draw(ctx, 'ARCADE', RA.W / 2, 76 + bobY, {
          scale: 7, align: 'center', color: C.pink,
          outline: true, outlineColor: C.ink, shadow: true, shadowColor: C.plum,
          wave: 2, waveTime: t
        });

        for (var i = 0; i < 7; i++) {
          var a = t * 0.8 + i * (Math.PI * 2 / 7);
          RA.spr.drawC(ctx, 'star_small',
            RA.W / 2 + Math.cos(a) * 172, 74 + Math.sin(a * 1.3) * 36,
            { alpha: 0.35 + 0.65 * Math.abs(Math.sin(t * 3 + i)) });
        }

        RA.spr.drawC(ctx, 'girl_idle', RA.W / 2, 152 + Math.sin(t * 2.4) * 2, { scale: 2 });

        if (Math.floor(t * 1.8) % 2 === 0) {
          RA.font.draw(ctx, 'TAP OR PRESS ANY KEY', RA.W / 2, 196, {
            scale: 2, align: 'center', color: C.white, outline: true
          });
        }

        var count = RA.save.profileCount();
        if (count) {
          RA.font.draw(ctx, count === 1 ? '1 PLAYER SAVED' : count + ' PLAYERS SAVED',
                       RA.W / 2, 232, { scale: 1, align: 'center', color: C.lilac });
        }
        RA.bg.vignette(ctx, 0.3);
      }
    };
  });

  /* ==================================================================
     NEW PLAYER — on-screen keyboard
     ================================================================== */
  var KEY_ROWS = [
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    ['H', 'I', 'J', 'K', 'L', 'M', 'N'],
    ['O', 'P', 'Q', 'R', 'S', 'T', 'U'],
    ['V', 'W', 'X', 'Y', 'Z', 'DEL', 'OK']
  ];
  var KW = 48, KH = 26, KGAP = 6;
  var KX = Math.round((RA.W - (KW * 7 + KGAP * 6)) / 2);
  var KY = 118;

  RA.registerScene('newplayer', function () {
    var t = 0, name = '', warn = 0, warnText = '';

    function press(k) {
      if (k === 'DEL') {
        name = name.slice(0, -1);
        RA.audio.sfx('back');
      } else if (k === 'OK') {
        commit();
      } else if (name.length < RA.save.maxNameLength) {
        name += k;
        RA.audio.sfx('select');
      } else {
        warn = 1.6; warnText = 'THAT IS LONG ENOUGH!';
        RA.audio.sfx('wrong');
      }
    }

    function commit() {
      var clean = RA.save.normaliseName(name);
      if (!clean) {
        warn = 1.8; warnText = 'PICK SOME LETTERS FIRST';
        RA.audio.sfx('wrong');
        return;
      }
      if (RA.save.hasProfile(clean)) {
        warn = 1.8; warnText = 'THAT NAME IS TAKEN';
        RA.audio.sfx('wrong');
        return;
      }
      if (RA.save.isFull()) {
        warn = 1.8; warnText = 'ALL ' + RA.save.maxProfiles + ' SLOTS ARE FULL';
        RA.audio.sfx('wrong');
        return;
      }
      RA.save.createProfile(clean);
      RA.audio.sfx('select');
      RA.go('agepick');
    }

    return {
      music: 'hub',
      enter: function () { t = 0; name = ''; warn = 0; },

      update: function (dt) {
        t += dt;
        if (warn > 0) warn = Math.max(0, warn - dt);

        /* a real keyboard works too, for the grown-ups */
        for (var i = 0; i < 26; i++) {
          var ch = String.fromCharCode(65 + i);
          if (RA.input.justPressed('key:' + ch) || RA.input.justPressed('key:' + ch.toLowerCase())) {
            press(ch);
          }
        }
        if (RA.input.justPressed('key:Backspace')) press('DEL');
        if (RA.input.justPressed('key:Enter')) commit();
      },

      draw: function (ctx) {
        RA.bg.sky(ctx, RA.bg.PALETTES.candy);
        RA.bg.clouds(ctx, t * 0.5, { count: 3, speed: 4, top: 20, band: 60, alpha: 0.6 });

        RA.ui.begin({ nav: false });

        RA.font.draw(ctx, 'WHO IS PLAYING?', RA.W / 2, 26, {
          scale: 3, align: 'center', color: C.ink, shadow: true, shadowColor: '#ffffff'
        });

        /* name box */
        var boxW = 250, boxX = (RA.W - boxW) / 2;
        RA.ui.panel(ctx, boxX, 58, boxW, 36, { fill: C.ink2, highlight: C.ink3 });
        var shown = name || '';
        RA.font.draw(ctx, shown, RA.W / 2 - (Math.floor(t * 2) % 2 === 0 ? 4 : 0), 68, {
          scale: 3, align: 'center', color: C.cream
        });
        if (Math.floor(t * 2) % 2 === 0) {
          var cw = RA.font.width(shown, 3);
          ctx.fillStyle = C.gold;
          ctx.fillRect(Math.round(RA.W / 2 + cw / 2 - 2), 68, 8, 17);
        }
        if (!name) {
          RA.font.draw(ctx, 'TAP THE LETTERS', RA.W / 2, 100, {
            scale: 1, align: 'center', color: C.ink
          });
        }

        /* keyboard */
        for (var r = 0; r < KEY_ROWS.length; r++) {
          for (var c = 0; c < KEY_ROWS[r].length; c++) {
            var k = KEY_ROWS[r][c];
            var kx = KX + c * (KW + KGAP);
            var ky = KY + r * (KH + KGAP);
            var col = k === 'OK' ? C.green : (k === 'DEL' ? C.brick : C.grape);
            if (RA.ui.button(ctx, kx, ky, KW, KH, k,
                             { color: col, scale: k.length > 1 ? 1 : 2 })) press(k);
          }
        }

        if (warn > 0) {
          RA.font.draw(ctx, warnText, RA.W / 2, 104, {
            scale: 1, align: 'center', color: C.brick,
            alpha: U.clamp(warn * 1.4, 0, 1)
          });
        }

        if (RA.save.profileCount() > 0) {
          if (RA.ui.button(ctx, 6, 4, 44, 20, '<', { color: C.grape, scale: 1, sound: 'back' })) {
            RA.go('players');
          }
          if (RA.input.justPressed('back')) RA.go('players');
        }
        RA.ui.end();
      }
    };
  });

  /* ==================================================================
     AGE BAND — how hard everything should be
     A six-year-old and a nine-year-old are not the same player. This
     scales fall speeds, board sizes, sums and platform spacing.
     ================================================================== */
  RA.registerScene('agepick', function () {
    var t = 0;
    var BW = 128, BH = 92, GAPX = 14;
    var X0 = Math.round((RA.W - (BW * 3 + GAPX * 2)) / 2);
    var Y0 = 96;
    var TINT = ['#3fae5c', '#f7a72b', '#2f7fd6'];

    return {
      music: 'hub',
      enter: function () { t = 0; },
      update: function (dt) { t += dt; },

      draw: function (ctx) {
        RA.bg.sky(ctx, RA.bg.PALETTES.candy);
        RA.bg.clouds(ctx, t * 0.5, { count: 3, speed: 4, top: 18, band: 50, alpha: 0.55 });

        RA.ui.begin({ nav: false });

        RA.font.draw(ctx, 'HOW OLD IS ' + (RA.save.activeName() || '') + '?', RA.W / 2, 26, {
          scale: 3, align: 'center', color: C.ink, shadow: true, shadowColor: '#ffffff'
        });
        RA.font.draw(ctx, 'THIS SETS HOW TRICKY THE GAMES ARE', RA.W / 2, 58, {
          scale: 1, align: 'center', color: C.ink
        });
        RA.font.draw(ctx, 'YOU CAN CHANGE IT LATER IN SETTINGS', RA.W / 2, 72, {
          scale: 1, align: 'center', color: C.grey2
        });

        var bands = RA.tune.BANDS;
        for (var i = 0; i < bands.length; i++) {
          var x = X0 + i * (BW + GAPX);
          var picked = RA.save.band() === i;
          var bob = picked ? Math.sin(t * 5) * 2 : 0;

          RA.ui.panel(ctx, x, Y0 - bob, BW, BH, {
            fill: picked ? TINT[i] : C.ink2,
            highlight: picked ? RA.ui.shade(TINT[i], 0.3) : C.ink3
          });
          RA.spr.drawC(ctx, 'girl_idle', x + BW / 2, Y0 + 26 - bob,
                       { scale: 1 + i * 0.35 });
          RA.font.draw(ctx, bands[i].name, x + BW / 2, Y0 + 46 - bob, {
            scale: 2, align: 'center', color: C.white, shadow: true
          });
          RA.font.draw(ctx, bands[i].ages, x + BW / 2, Y0 + 66 - bob, {
            scale: 2, align: 'center', color: picked ? C.cream : C.mist
          });

          if (RA.input.tapped(x, Y0 - 6, BW, BH + 12)) {
            RA.save.setBand(i);
            RA.audio.sfx('select');
          }
        }

        if (RA.ui.button(ctx, RA.W / 2 - 70, 210, 140, 32, 'LET\'S PLAY!',
                         { color: C.green, scale: 2 })) {
          RA.audio.sfx('unlock');
          RA.fx.confetti(50);
          RA.go('hub');
        }
        RA.ui.end();
      }
    };
  });

  /* ==================================================================
     PLAYERS — pick who is playing
     ================================================================== */
  RA.registerScene('players', function () {
    var t = 0, removing = false, confirmName = null;

    var CW = 200, CH = 46, CGAP_X = 16, CGAP_Y = 8;
    var CX = Math.round((RA.W - (CW * 2 + CGAP_X)) / 2);
    var CY = 48;

    function slot(i) {
      return {
        x: CX + (i % 2) * (CW + CGAP_X),
        y: CY + Math.floor(i / 2) * (CH + CGAP_Y),
        w: CW, h: CH
      };
    }

    return {
      music: 'hub',
      enter: function () { t = 0; removing = false; confirmName = null; },
      update: function (dt) { t += dt; },

      draw: function (ctx) {
        RA.bg.sky(ctx, RA.bg.PALETTES.candy);
        RA.bg.clouds(ctx, t * 0.5, { count: 3, speed: 4, top: 18, band: 60, alpha: 0.55 });
        RA.bg.butterflies(ctx, t * 0.6, 2, { top: 200, band: 40, alpha: 0.6 });

        RA.ui.begin({ nav: false });

        RA.font.draw(ctx, 'WHO IS PLAYING?', RA.W / 2, 18, {
          scale: 3, align: 'center', color: C.ink, shadow: true, shadowColor: '#ffffff'
        });

        var profiles = RA.save.profiles();
        var active = RA.save.activeName();

        for (var i = 0; i < profiles.length; i++) {
          var p = profiles[i];
          var s = slot(i);
          var isActive = p.name === active;

          RA.ui.panel(ctx, s.x, s.y, s.w, s.h, {
            fill: isActive ? C.grape : C.ink2,
            highlight: isActive ? C.purple : C.ink3
          });

          RA.spr.draw(ctx, 'girl_idle', s.x + 8, s.y + 8, { scale: 1.7 });
          RA.font.draw(ctx, p.name, s.x + 42, s.y + 9, { scale: 3, color: C.cream });
          RA.spr.draw(ctx, 'star_small', s.x + 42, s.y + 31, {});
          RA.font.draw(ctx, p.totalStars, s.x + 52, s.y + 31, { scale: 1, color: C.gold });
          RA.spr.draw(ctx, 'st_trophy', s.x + 92, s.y + 28, {});
          RA.font.draw(ctx, Object.keys(p.stickers || {}).length + '/' + RA.STICKERS.length,
                       s.x + 110, s.y + 31, { scale: 1, color: C.mist });

          if (removing && profiles.length > 1) {
            if (RA.ui.button(ctx, s.x + s.w - 30, s.y + 8, 24, 24, 'X',
                             { color: C.brick, scale: 2 })) {
              confirmName = p.name;
            }
          } else if (RA.input.tapped(s.x, s.y, s.w, s.h)) {
            RA.save.switchTo(p.name);
            RA.audio.sfx('select');
            RA.go('hub');
          }
        }

        /* empty slot hint */
        if (!profiles.length) {
          RA.font.draw(ctx, 'NO PLAYERS YET', RA.W / 2, 110, {
            scale: 2, align: 'center', color: C.ink
          });
        }

        var by = 214;
        if (!RA.save.isFull()) {
          if (RA.ui.button(ctx, CX, by, CW, 28, 'NEW PLAYER',
                           { color: C.green, scale: 2 })) RA.go('newplayer');
        } else {
          RA.font.draw(ctx, 'ALL SLOTS FULL', CX + CW / 2, by + 8, {
            scale: 1, align: 'center', color: C.ink
          });
        }
        if (profiles.length > 1) {
          if (RA.ui.button(ctx, CX + CW + CGAP_X, by, CW, 28,
                           removing ? 'DONE' : 'REMOVE',
                           { color: removing ? C.sea : C.brick, scale: 2 })) {
            removing = !removing;
            confirmName = null;
          }
        }

        if (active) {
          if (RA.ui.button(ctx, 6, 4, 44, 20, '<', { color: C.grape, scale: 1, sound: 'back' })) {
            RA.go('hub');
          }
          if (RA.input.justPressed('back')) RA.go('hub');
        }

        /* delete confirmation */
        if (confirmName) {
          ctx.fillStyle = 'rgba(18,19,43,0.72)';
          ctx.fillRect(0, 0, RA.W, RA.H);
          RA.ui.panel(ctx, 90, 88, 300, 96, { fill: C.ink2, highlight: C.ink3 });
          RA.font.draw(ctx, 'REMOVE ' + confirmName + '?', RA.W / 2, 100, {
            scale: 3, align: 'center', color: C.cream
          });
          RA.font.draw(ctx, 'THEIR STARS AND STICKERS GO TOO', RA.W / 2, 128, {
            scale: 1, align: 'center', color: C.coral
          });
          if (RA.ui.button(ctx, 110, 144, 120, 28, 'REMOVE', { color: C.brick, scale: 2 })) {
            RA.save.deleteProfile(confirmName);
            confirmName = null;
            removing = false;
            if (!RA.save.profileCount()) RA.go('newplayer');
          }
          if (RA.ui.button(ctx, 250, 144, 120, 28, 'KEEP', { color: C.green, scale: 2 })) {
            confirmName = null;
          }
        }
        RA.ui.end();
      }
    };
  });

  /* ==================================================================
     HUB — game select
     ================================================================== */
  var CARD_W = 142, CARD_H = 88, GAP = 8;
  var GRID_X = 19, GRID_Y = 36, COLS = 3;

  RA.registerScene('hub', function () {
    var t = 0;
    var focus = 0;
    var pop = [];
    var EXTRA_BTN = 3;      // player, stickers, settings

    function cardRect(i) {
      var col = i % COLS, row = Math.floor(i / COLS);
      return {
        x: GRID_X + col * (CARD_W + GAP),
        y: GRID_Y + row * (CARD_H + GAP),
        w: CARD_W, h: CARD_H
      };
    }

    function launch(i) {
      var g = RA.games[i];
      if (!g) return;
      RA.audio.sfx('select');
      RA.go(g.id);
    }

    return {
      music: 'hub',

      enter: function () {
        t = 0;
        pop = RA.games.map(function () { return 0; });
        focus = 0;
        /* Someone could land here with every profile deleted. */
        if (!RA.save.profileCount()) RA.go('newplayer');
      },

      update: function (dt) {
        t += dt;
        var n = RA.games.length;
        var total = n + EXTRA_BTN;

        if (RA.input.justPressed('right')) { focus = (focus + 1) % total; RA.audio.sfx('move'); }
        if (RA.input.justPressed('left')) { focus = (focus - 1 + total) % total; RA.audio.sfx('move'); }
        if (RA.input.justPressed('down')) {
          focus = focus < n ? Math.min(total - 1, focus + COLS) : focus;
          RA.audio.sfx('move');
        }
        if (RA.input.justPressed('up')) {
          focus = focus >= n ? Math.max(0, n - COLS) : Math.max(0, focus - COLS);
          RA.audio.sfx('move');
        }
        if (RA.input.justPressed('ok')) {
          if (focus < n) launch(focus);
          else if (focus === n) RA.go('players');
          else if (focus === n + 1) RA.go('album');
          else RA.go('settings');
        }

        for (var i = 0; i < n; i++) {
          var r = cardRect(i);
          var active = RA.input.hovering(r.x, r.y, r.w, r.h) || focus === i;
          pop[i] = U.approach(pop[i], active ? 1 : 0, dt * 7);
        }
      },

      draw: function (ctx) {
        RA.bg.sky(ctx, RA.bg.PALETTES.meadow);
        RA.bg.clouds(ctx, t, { count: 4, speed: 5, top: 14, band: 40, alpha: 0.75 });
        RA.bg.butterflies(ctx, t * 0.7, 2, { top: 190, band: 50, alpha: 0.75 });

        var who = RA.save.activeName() || 'THE LITTLE';
        RA.font.draw(ctx, who + "'S ARCADE", RA.W / 2, 8, {
          scale: 3, align: 'center', color: C.cream,
          outline: true, outlineColor: C.ink, shadow: true, shadowColor: C.plum
        });

        RA.ui.panel(ctx, RA.W - 92, 6, 86, 18, { fill: C.ink2, highlight: C.ink3 });
        RA.spr.draw(ctx, 'star_small', RA.W - 86, 11, {});
        RA.font.draw(ctx, RA.save.data.stars, RA.W - 76, 11, { scale: 1, color: C.cream });
        RA.spr.draw(ctx, 'st_trophy', RA.W - 46, 8, {});
        RA.font.draw(ctx, RA.save.stickerCount(), RA.W - 30, 11, { scale: 1, color: C.cream });

        var n = RA.games.length;
        for (var i = 0; i < n; i++) {
          var g = RA.games[i];
          var r = cardRect(i);
          var k = pop[i] || 0;
          var lift = Math.round(k * 3);
          var x = r.x, y = r.y - lift;

          if (RA.input.tapped(r.x, r.y, r.w, r.h)) launch(i);

          RA.ui.panel(ctx, x, y, r.w, r.h, {
            fill: g.color || C.ink2,
            highlight: RA.ui.shade(g.color || C.ink2, 0.25)
          });

          var ax = x + 5, ay = y + 5, aw = r.w - 10, ah = 44;
          ctx.save();
          ctx.beginPath();
          ctx.rect(ax, ay, aw, ah);
          ctx.clip();
          ctx.fillStyle = g.artBg || C.ink;
          ctx.fillRect(ax, ay, aw, ah);
          if (g.preview) g.preview(ctx, ax, ay, aw, ah, t, k > 0.4);
          else RA.spr.drawC(ctx, g.icon || 'star', ax + aw / 2, ay + ah / 2, { scale: 2 });
          ctx.restore();

          ctx.fillStyle = C.ink;
          ctx.fillRect(ax, ay + ah, aw, 1);

          RA.font.draw(ctx, g.title, x + r.w / 2, y + 56, {
            scale: 2, align: 'center', color: C.white, shadow: true
          });

          var best = RA.save.best(g.id);
          var isNew = RA.save.playCount(g.id) === 0;
          RA.font.draw(ctx, isNew ? 'NEW!' : (g.bestLabel ? g.bestLabel(best) : 'BEST ' + best),
                       x + r.w / 2, y + 72, {
            scale: 1, align: 'center', color: isNew ? C.gold : C.mist
          });

          if (focus === i) drawFocusRing(ctx, x - 2, y - 2, r.w + 4, r.h + 4, t);
        }

        /* bottom bar: player / stickers / settings */
        var bw = 146, bh = 28, by = 232, gap = 8;
        var bx0 = Math.round((RA.W - (bw * 3 + gap * 2)) / 2);
        RA.ui.begin({ nav: false });
        if (RA.ui.button(ctx, bx0, by, bw, bh, who,
                         { color: C.pinkDk, scale: 2, icon: 'girl_idle', iconScale: 1 })) {
          RA.go('players');
        }
        if (RA.ui.button(ctx, bx0 + bw + gap, by, bw, bh, 'STICKERS',
                         { color: C.grape, scale: 2, icon: 'st_trophy' })) RA.go('album');
        if (RA.ui.button(ctx, bx0 + (bw + gap) * 2, by, bw, bh, 'SETTINGS',
                         { color: C.sea, scale: 2, icon: 'cog' })) RA.go('settings');
        RA.ui.end();

        for (var b = 0; b < 3; b++) {
          if (focus === n + b) {
            drawFocusRing(ctx, bx0 + (bw + gap) * b - 2, by - 2, bw + 4, bh + 4, t);
          }
        }

        RA.bg.vignette(ctx, 0.22);
      }
    };
  });

  function drawFocusRing(ctx, x, y, w, h, t) {
    ctx.fillStyle = C.cream;
    var off = Math.floor(t * 14) % 5;
    for (var i = off; i < w; i += 5) { ctx.fillRect(x + i, y, 3, 1); ctx.fillRect(x + i, y + h - 1, 3, 1); }
    for (var j = off; j < h; j += 5) { ctx.fillRect(x, y + j, 1, 3); ctx.fillRect(x + w - 1, y + j, 1, 3); }
  }

  /* ==================================================================
     ALBUM
     ================================================================== */
  RA.registerScene('album', function () {
    var t = 0;
    var sel = 0;
    var COLS_A = 6, CELL = 66, CELL_H = 62;
    var X0 = 26, Y0 = 40;

    function cell(i) {
      return {
        x: X0 + (i % COLS_A) * CELL,
        y: Y0 + Math.floor(i / COLS_A) * CELL_H,
        w: 56, h: 54
      };
    }

    return {
      music: 'hub',
      enter: function () { t = 0; sel = 0; },

      update: function (dt) {
        t += dt;
        var n = RA.STICKERS.length;
        if (RA.input.justPressed('right')) { sel = (sel + 1) % n; RA.audio.sfx('move'); }
        if (RA.input.justPressed('left')) { sel = (sel - 1 + n) % n; RA.audio.sfx('move'); }
        if (RA.input.justPressed('down')) { sel = (sel + COLS_A) % n; RA.audio.sfx('move'); }
        if (RA.input.justPressed('up')) { sel = (sel - COLS_A + n) % n; RA.audio.sfx('move'); }
        for (var i = 0; i < n; i++) {
          var r = cell(i);
          if (RA.input.tapped(r.x, r.y, r.w, r.h)) { sel = i; RA.audio.sfx('select'); }
        }
      },

      draw: function (ctx) {
        RA.bg.sky(ctx, RA.bg.PALETTES.candy);
        RA.bg.clouds(ctx, t * 0.6, { count: 3, speed: 4, top: 30, band: 130, alpha: 0.5 });

        RA.ui.begin({ nav: false });
        if (RA.ui.header(ctx, (RA.save.activeName() || '') + ' STICKERS')) RA.go('hub');

        var have = RA.save.stickerCount(), all = RA.STICKERS.length;
        RA.font.draw(ctx, have + ' OF ' + all + ' FOUND', RA.W / 2, 26, {
          scale: 1, align: 'center', color: C.ink
        });

        for (var i = 0; i < all; i++) {
          var def = RA.STICKERS[i];
          var r = cell(i);
          var owned = RA.save.hasSticker(def.id);
          var isSel = i === sel;
          var bob = isSel ? Math.sin(t * 5) * 2 : 0;

          RA.ui.panel(ctx, r.x, r.y, r.w, r.h, {
            fill: owned ? C.paper : 'rgba(38,40,74,0.55)',
            highlight: owned ? C.white : null
          });

          if (owned) {
            RA.spr.draw(ctx, def.sprite, r.x + 12, r.y + 8 + bob, { scale: 2 });
          } else {
            RA.spr.drawSilhouette(ctx, def.sprite, r.x + 12, r.y + 8, 'rgba(200,210,255,0.30)', { scale: 2 });
            RA.spr.draw(ctx, 'lock', r.x + 24, r.y + 20, { scale: 1 });
          }

          RA.font.draw(ctx, owned ? def.name : '? ? ?', r.x + r.w / 2, r.y + 44, {
            scale: 1, align: 'center', color: owned ? C.ink : C.grey2
          });

          if (isSel) drawFocusRing(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, t);
        }

        var d = RA.STICKERS[sel];
        RA.ui.panel(ctx, 26, 210, RA.W - 52, 46, { fill: C.ink2, highlight: C.ink3 });
        var owned2 = RA.save.hasSticker(d.id);
        RA.spr.draw(ctx, d.sprite, 36, 220, { scale: 1.5, alpha: owned2 ? 1 : 0.35 });
        RA.font.draw(ctx, owned2 ? d.name : 'NOT FOUND YET', 68, 219, {
          scale: 2, color: owned2 ? C.gold : C.grey
        });
        RA.font.draw(ctx, d.hint, 68, 238, { scale: 1, color: C.mist });
        RA.ui.end();
      }
    };
  });

  /* ==================================================================
     SETTINGS
     ================================================================== */
  RA.registerScene('settings', function () {
    var t = 0;
    var confirming = false;

    return {
      music: 'hub',
      enter: function () { t = 0; confirming = false; },
      update: function (dt) { t += dt; },

      draw: function (ctx) {
        RA.bg.sky(ctx, RA.bg.PALETTES.dream);
        RA.bg.stars(ctx, t, { height: RA.H });

        RA.ui.begin({ nav: true });
        if (RA.ui.header(ctx, 'SETTINGS')) RA.go('hub');

        var s = RA.save.data.settings;
        var bw = 260, bh = 26, x = (RA.W - bw) / 2, y = 28;

        if (RA.ui.button(ctx, x, y, bw, bh, 'MUSIC   ' + (s.music ? 'ON' : 'OFF'),
                         { color: s.music ? C.green : C.grey2, scale: 2, icon: 'note' })) {
          var want = !s.music;
          RA.save.setSetting('music', want);
          if (want) RA.audio.music(RA.audio.currentSong() || 'hub');
        }
        y += bh + 7;

        if (RA.ui.button(ctx, x, y, bw, bh, 'SOUND   ' + (s.sfx ? 'ON' : 'OFF'),
                         { color: s.sfx ? C.green : C.grey2, scale: 2 })) {
          RA.save.setSetting('sfx', !s.sfx);
        }
        y += bh + 7;

        if (RA.ui.button(ctx, x, y, bw, bh, 'SHAKE   ' + (s.shake !== false ? 'ON' : 'OFF'),
                         { color: s.shake !== false ? C.sea : C.grey2, scale: 2 })) {
          RA.save.setSetting('shake', s.shake === false);
        }
        y += bh + 7;

        var bi = RA.tune.BANDS[RA.save.band()];
        if (RA.ui.button(ctx, x, y, bw, bh, 'AGE  ' + bi.name + '  ' + bi.ages,
                         { color: C.amber, scale: 2 })) {
          RA.go('agepick');
        }
        y += bh + 7;

        if (RA.ui.button(ctx, x, y, bw / 2 - 4, bh, 'FULL SCREEN',
                         { color: C.grape, scale: 1 })) {
          toggleFullscreen();
        }
        if (RA.ui.button(ctx, x + bw / 2 + 4, y, bw / 2 - 4, bh, 'SWITCH PLAYER',
                         { color: C.pinkDk, scale: 1 })) {
          RA.go('players');
        }
        y += bh + 10;

        var who = RA.save.activeName() || '';
        if (!confirming) {
          if (RA.ui.button(ctx, x + 40, y, bw - 80, 22, 'CLEAR ' + who + " 'S SCORES",
                           { color: C.brick, scale: 1 })) confirming = true;
        } else {
          RA.font.draw(ctx, 'ERASE ' + who + "'S STARS AND STICKERS?", RA.W / 2, y - 4, {
            scale: 1, align: 'center', color: C.coral
          });
          if (RA.ui.button(ctx, x + 20, y + 6, 110, 22, 'YES', { color: C.brick, scale: 2 })) {
            RA.save.resetActive();
            confirming = false;
            RA.fx.popText('CLEARED', RA.W / 2, 200, { color: C.coral });
          }
          if (RA.ui.button(ctx, x + 140, y + 6, 110, 22, 'NO', { color: C.green, scale: 2 })) {
            confirming = false;
          }
        }
        RA.ui.end();
      }
    };
  });

  function toggleFullscreen() {
    var el = document.documentElement;
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        /* phones: try to hold landscape once we're actually fullscreen */
        setTimeout(function () {
          try {
            if (window.screen && screen.orientation && screen.orientation.lock) {
              screen.orientation.lock('landscape').catch(function () {});
            }
          } catch (e) {}
        }, 250);
      } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }
    } catch (e) { /* not permitted — no harm done */ }
  }

})();
