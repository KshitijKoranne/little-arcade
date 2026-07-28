/* =====================================================================
   core/ui.js — immediate-mode widgets drawn as pixel art.

   Usage inside a scene:
       RA.ui.begin({ nav: true });
       if (RA.ui.button(ctx, x, y, w, h, 'PLAY')) { ... }
       RA.ui.end();

   Buttons work with touch, mouse AND keyboard: arrow keys move a focus
   ring through the buttons in the order they were declared, Enter picks.
   The ring only appears once a key has actually been used, so it never
   clutters the screen for a child using a finger.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var C = RA.C;
  var UI = RA.ui = {};

  var items = [];
  var lastCount = 0;
  var navEnabled = false;
  var time = 0;

  UI.focus = 0;
  UI.keyboardActive = false;

  UI.begin = function (opts) {
    opts = opts || {};
    navEnabled = !!opts.nav;
    items = [];

    var input = RA.input;
    if (input.pointer.justDown || (input.pointer.dx || input.pointer.dy)) {
      UI.keyboardActive = false;
    }

    if (navEnabled && lastCount > 0) {
      var moved = 0;
      if (input.justPressed('down') || input.justPressed('right')) moved = 1;
      if (input.justPressed('up') || input.justPressed('left')) moved = -1;
      if (moved) {
        UI.keyboardActive = true;
        UI.focus = (UI.focus + moved + lastCount) % lastCount;
        RA.audio.sfx('move');
      }
      if (input.justPressed('ok')) UI.keyboardActive = true;
    }
    if (UI.focus >= Math.max(1, lastCount)) UI.focus = 0;
  };

  UI.end = function () {
    lastCount = items.length;
  };

  UI.tick = function (dt) { time += dt; };

  /* ------------------------------------------------------------ panel */
  /** opts: { fill, border, shadow, highlight } */
  UI.panel = function (ctx, x, y, w, h, opts) {
    opts = opts || {};
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    var fill = opts.fill || C.ink2;
    var border = opts.border || C.ink;
    var hi = opts.highlight || null;

    if (opts.shadow !== false) {
      ctx.fillStyle = 'rgba(8,9,20,0.45)';
      ctx.fillRect(x + 3, y + 4, w, h);
    }
    /* chamfered corners: draw as three rects so the corner pixels are cut */
    ctx.fillStyle = border;
    ctx.fillRect(x + 2, y, w - 4, h);
    ctx.fillRect(x, y + 2, w, h - 4);
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);

    ctx.fillStyle = fill;
    ctx.fillRect(x + 3, y + 1, w - 6, h - 2);
    ctx.fillRect(x + 1, y + 3, w - 2, h - 6);
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

    if (hi) {
      ctx.fillStyle = hi;
      ctx.fillRect(x + 3, y + 2, w - 6, 1);
      ctx.fillRect(x + 2, y + 3, 1, h - 6);
    }
    return { x: x, y: y, w: w, h: h };
  };

  /* ----------------------------------------------------------- button */
  /**
   * opts: { color, textColor, scale, icon, iconScale, disabled, small,
   *         sound, align }
   * Returns true on the frame it is activated.
   */
  UI.button = function (ctx, x, y, w, h, label, opts) {
    opts = opts || {};
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);

    var idx = items.length;
    items.push({ x: x, y: y, w: w, h: h });

    var input = RA.input;
    var disabled = !!opts.disabled;
    var hovered = !disabled && input.hovering(x, y, w, h);
    var held = !disabled && input.holding(x, y, w, h);
    var focused = navEnabled && UI.keyboardActive && idx === UI.focus && !disabled;

    var activated = false;
    if (!disabled) {
      if (input.tapped(x, y, w, h)) { activated = true; UI.focus = idx; }
      if (focused && input.justPressed('ok')) activated = true;
    }

    var base = opts.color || C.pink;
    if (disabled) base = C.grey2;
    var dark = shade(base, -0.42);
    var light = shade(base, 0.3);

    var press = held ? 2 : 0;
    var by = y + press;

    /* drop shadow / depth block */
    ctx.fillStyle = C.ink;
    ctx.fillRect(x + 2, y + 3, w - 4, h - 3);
    ctx.fillRect(x, y + 5, w, h - 7);

    ctx.fillStyle = dark;
    ctx.fillRect(x + 2, by + 1, w - 4, h - 3);
    ctx.fillRect(x + 1, by + 2, w - 2, h - 5);

    ctx.fillStyle = base;
    ctx.fillRect(x + 2, by + 1, w - 4, h - 5);
    ctx.fillRect(x + 1, by + 2, w - 2, h - 7);

    ctx.fillStyle = light;
    ctx.fillRect(x + 3, by + 2, w - 6, 1);

    if (hovered && !held && !disabled) {
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(x + 2, by + 1, w - 4, h - 5);
    }

    /* focus ring — a marching dotted border */
    if (focused) {
      ctx.fillStyle = C.cream;
      var off = Math.floor(time * 12) % 4;
      for (var i = off; i < w; i += 4) {
        ctx.fillRect(x + i, by - 2, 2, 1);
        ctx.fillRect(x + i, by + h - 3, 2, 1);
      }
      for (var j = off; j < h - 4; j += 4) {
        ctx.fillRect(x - 2, by + j, 1, 2);
        ctx.fillRect(x + w + 1, by + j, 1, 2);
      }
    }

    var scale = opts.scale || 2;
    var tw = RA.font.width(label || '', scale);
    var iconW = 0;
    if (opts.icon) {
      var isz = RA.spr.size(opts.icon);
      iconW = isz.w * (opts.iconScale || 1) + 4;
    }
    var contentW = tw + iconW;
    var cx = x + Math.round((w - contentW) / 2);
    var ty = by + Math.round((h - 5 - RA.font.height(scale)) / 2) + 1;

    if (opts.icon) {
      RA.spr.draw(ctx, opts.icon, cx, by + Math.round((h - 5 - RA.spr.size(opts.icon).h * (opts.iconScale || 1)) / 2),
                  { scale: opts.iconScale || 1 });
      cx += iconW;
    }
    RA.font.draw(ctx, label || '', cx, ty, {
      scale: scale,
      color: opts.textColor || (disabled ? C.grey : C.white),
      shadow: true,
      shadowColor: shade(base, -0.6)
    });

    if (activated) RA.audio.sfx(opts.sound || 'select');
    return activated;
  };

  /* ------------------------------------------------------- icon button */
  UI.iconButton = function (ctx, x, y, size, icon, opts) {
    opts = opts || {};
    return UI.button(ctx, x, y, size, size, '', {
      color: opts.color || C.grape,
      icon: icon,
      iconScale: opts.iconScale || 1,
      sound: opts.sound,
      disabled: opts.disabled
    });
  };

  /* ------------------------------------------------- standard top bar */
  /**
   * Draws the game header (title + back button + star purse).
   * Returns true if "back" was chosen (button, Esc, or B).
   */
  UI.header = function (ctx, title, opts) {
    opts = opts || {};
    ctx.fillStyle = 'rgba(18,19,43,0.72)';
    ctx.fillRect(0, 0, RA.W, 20);
    ctx.fillStyle = RA.C.ink;
    ctx.fillRect(0, 20, RA.W, 1);

    var back = UI.button(ctx, 4, 2, 44, 18, '<', { color: C.grape, scale: 1, sound: 'back' });
    if (RA.input.justPressed('back')) { back = true; RA.audio.sfx('back'); }

    RA.font.draw(ctx, title, RA.W / 2, 6, {
      scale: 1, color: C.cream, align: 'center', shadow: true
    });

    if (opts.stars !== false) {
      RA.spr.draw(ctx, 'star_small', RA.W - 60, 6, { scale: 1 });
      RA.font.draw(ctx, RA.save.data.stars, RA.W - 50, 6, { scale: 1, color: C.cream });
    }
    return back;
  };

  /* --------------------------------------------------------- progress */
  UI.bar = function (ctx, x, y, w, h, t, opts) {
    opts = opts || {};
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = opts.back || C.ink;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = opts.trough || C.ink3;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    var fw = Math.round((w - 2) * U.clamp(t, 0, 1));
    if (fw > 0) {
      ctx.fillStyle = opts.fill || C.leaf;
      ctx.fillRect(x + 1, y + 1, fw, h - 2);
      ctx.fillStyle = opts.shine || shade(opts.fill || C.leaf, 0.35);
      ctx.fillRect(x + 1, y + 1, fw, 1);
    }
  };

  /* ------------------------------------------------------- star rating */
  UI.stars = function (ctx, cx, y, earned, total, animT) {
    total = total || 3;
    var gap = 22;
    var startX = cx - ((total - 1) * gap) / 2;
    for (var i = 0; i < total; i++) {
      var lit = i < earned;
      var delay = 0.15 + i * 0.22;
      var k = animT === undefined ? 1 : U.clamp((animT - delay) / 0.35, 0, 1);
      if (k <= 0) continue;
      var s = lit ? 2 * U.easeOutBack(k) : 2;
      var x = startX + i * gap;
      if (lit) {
        RA.spr.drawC(ctx, 'star', x, y, { scale: s });
      } else {
        RA.spr.drawSilhouette(ctx, 'star', x - 8, y - 8, 'rgba(255,255,255,0.16)', { scale: 2 });
      }
    }
  };

  /* -------------------------------------------------------- title text */
  UI.title = function (ctx, text, y, opts) {
    opts = opts || {};
    RA.font.draw(ctx, text, RA.W / 2, y, {
      scale: opts.scale || 3,
      color: opts.color || C.cream,
      align: 'center',
      outline: true,
      outlineColor: C.ink,
      shadow: true,
      shadowColor: opts.shadowColor || C.plum,
      wave: opts.wave || 0,
      waveTime: time
    });
  };

  /* ----------------------------------------------------- colour helper */
  function shade(hex, amt) {
    var m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '#000000');
    if (!m) return hex;
    var r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    if (amt >= 0) {
      r = r + (255 - r) * amt; g = g + (255 - g) * amt; b = b + (255 - b) * amt;
    } else {
      r = r * (1 + amt); g = g * (1 + amt); b = b * (1 + amt);
    }
    return '#' + [r, g, b].map(function (v) {
      var s = Math.round(U.clamp(v, 0, 255)).toString(16);
      return s.length < 2 ? '0' + s : s;
    }).join('');
  }
  UI.shade = shade;

  /* --------------------------------------------------- results screen
     Every game ends the same way, so the ritual feels familiar:
     score, animated star rating, stars banked, play again / home.

     o: { t, title, score, scoreLabel, stars, starsEarned, record,
          lines:[], againLabel }
     Returns 'again' | 'home' | null.
  */
  UI.results = function (ctx, o) {
    o = o || {};
    var t = o.t || 0;
    var w = 272, h = 178;
    var x = Math.round((RA.W - w) / 2);
    var drop = U.easeOutBack(U.clamp(t / 0.4, 0, 1));
    var y = Math.round((RA.H - h) / 2 - (1 - drop) * 60);

    ctx.fillStyle = 'rgba(18,19,43,' + (0.62 * U.clamp(t / 0.3, 0, 1)) + ')';
    ctx.fillRect(0, 0, RA.W, RA.H);

    UI.panel(ctx, x, y, w, h, { fill: C.ink2, highlight: C.ink3 });

    RA.font.draw(ctx, o.title || 'WELL DONE!', RA.W / 2, y + 10, {
      scale: 3, align: 'center', color: C.cream, outline: true, outlineColor: C.ink
    });

    if (o.scoreLabel !== undefined) {
      RA.font.draw(ctx, o.scoreLabel, RA.W / 2, y + 36, {
        scale: 1, align: 'center', color: C.mist
      });
    }
    if (o.score !== undefined) {
      var sp = U.clamp((t - 0.25) / 0.35, 0, 1);
      var shown = Math.round((o.score || 0) * U.easeOutCubic(sp));
      RA.font.draw(ctx, shown, RA.W / 2, y + 46, {
        scale: 4, align: 'center', color: C.white, outline: true, outlineColor: C.ink
      });
    }

    UI.stars(ctx, RA.W / 2, y + 92, o.stars || 0, 3, t - 0.4);

    if (o.starsEarned) {
      var k = U.clamp((t - 1.15) / 0.3, 0, 1);
      if (k > 0) {
        RA.spr.draw(ctx, 'star_small', RA.W / 2 - 40, y + 109, { alpha: k });
        RA.font.draw(ctx, '+' + o.starsEarned + ' STARS', RA.W / 2 + 4, y + 108, {
          scale: 2, align: 'center', color: C.gold, alpha: k, shadow: true
        });
      }
    }

    if (o.record && t > 1.4 && Math.floor(t * 3) % 2 === 0) {
      RA.font.draw(ctx, 'NEW BEST!', RA.W / 2, y - 14, {
        scale: 2, align: 'center', color: C.gold, outline: true, outlineColor: C.ink
      });
    }

    if (o.lines) {
      for (var i = 0; i < o.lines.length; i++) {
        RA.font.draw(ctx, o.lines[i], RA.W / 2, y + 128 + i * 10, {
          scale: 1, align: 'center', color: C.mist
        });
      }
    }

    var out = null;
    if (t > 0.5) {
      UI.begin({ nav: true });
      if (UI.button(ctx, x + 16, y + h - 36, 118, 28, o.againLabel || 'AGAIN',
                    { color: C.green, scale: 2 })) out = 'again';
      if (UI.button(ctx, x + w - 134, y + h - 36, 118, 28, 'HOME',
                    { color: C.pinkDk, scale: 2 })) out = 'home';
      UI.end();
      if (RA.input.justPressed('back')) { RA.audio.sfx('back'); out = 'home'; }
    }
    return out;
  };

  /* --------------------------------------------- 3-2-1-GO countdown
     Returns true on the frame it finishes. */
  UI.countdown = function (ctx, t, total) {
    total = total || 3;
    var n = total - Math.floor(t);
    var frac = t - Math.floor(t);
    var label = n > 0 ? String(n) : 'GO!';
    var k = U.clamp(frac / 0.35, 0, 1);
    var scale = (n > 0 ? 7 : 6) * (0.6 + 0.4 * U.easeOutBack(k));
    var alpha = frac > 0.75 ? 1 - (frac - 0.75) / 0.25 : 1;
    RA.font.draw(ctx, label, RA.W / 2, RA.H / 2 - 24, {
      scale: scale, align: 'center',
      color: n > 0 ? C.cream : C.leaf,
      outline: true, outlineColor: C.ink, alpha: alpha
    });
  };

})();
