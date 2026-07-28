/* =====================================================================
   core/particles.js — particles, floating score popups, screen shake.

   Pooled: nothing is allocated during play once the pool has warmed up,
   which keeps the frame time flat on cheap tablets.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var FX = RA.fx = {};

  var MAX = 320;
  var pool = [];
  for (var i = 0; i < MAX; i++) pool.push({ alive: false });
  var cursor = 0;

  function claim() {
    for (var n = 0; n < MAX; n++) {
      cursor = (cursor + 1) % MAX;
      if (!pool[cursor].alive) return pool[cursor];
    }
    return pool[cursor];   // oldest wins if we're saturated
  }

  /* ------------------------------------------------------------ emit */
  /**
   * opts: x, y, vx, vy, gravity, drag, life, size, color, colors,
   *       sprite, spriteFrame, fade, shrink, spin
   */
  FX.emit = function (opts) {
    var p = claim();
    p.alive = true;
    p.kind = opts.sprite ? 'sprite' : 'pixel';
    p.x = opts.x; p.y = opts.y;
    p.vx = opts.vx || 0; p.vy = opts.vy || 0;
    p.gravity = opts.gravity === undefined ? 0 : opts.gravity;
    p.drag = opts.drag === undefined ? 0 : opts.drag;
    p.life = opts.life || 0.6;
    p.t = 0;
    p.size = opts.size || 2;
    p.color = opts.color || (opts.colors ? U.pick(opts.colors) : '#ffffff');
    p.sprite = opts.sprite || null;
    p.spriteFrame = opts.spriteFrame || 0;
    p.fade = opts.fade !== false;
    p.shrink = !!opts.shrink;
    p.rot = 0;
    p.spin = opts.spin || 0;
    return p;
  };

  /** A radial spray. The workhorse for pickups and impacts. */
  FX.burst = function (x, y, opts) {
    opts = opts || {};
    var count = opts.count || 12;
    var speedMin = opts.speedMin !== undefined ? opts.speedMin : 30;
    var speedMax = opts.speedMax !== undefined ? opts.speedMax : 90;
    var arcFrom = opts.arcFrom !== undefined ? opts.arcFrom : 0;
    var arcTo = opts.arcTo !== undefined ? opts.arcTo : Math.PI * 2;
    for (var n = 0; n < count; n++) {
      var a = U.rand(arcFrom, arcTo);
      var s = U.rand(speedMin, speedMax);
      FX.emit({
        x: x, y: y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - (opts.lift || 0),
        gravity: opts.gravity === undefined ? 160 : opts.gravity,
        drag: opts.drag === undefined ? 1.2 : opts.drag,
        life: U.rand(opts.lifeMin || 0.3, opts.lifeMax || 0.7),
        size: opts.size || U.randInt(1, 3),
        colors: opts.colors,
        color: opts.color,
        shrink: opts.shrink !== false
      });
    }
  };

  /** Confetti rain from the top of the screen — used on wins. */
  FX.confetti = function (count, colors) {
    colors = colors || [RA.C.pink, RA.C.gold, RA.C.leaf, RA.C.blue, RA.C.purple, RA.C.coral];
    for (var n = 0; n < (count || 60); n++) {
      FX.emit({
        x: U.rand(0, RA.W),
        y: U.rand(-90, -4),
        vx: U.rand(-16, 16),
        vy: U.rand(40, 105),
        gravity: 26,
        drag: 0,
        life: U.rand(1.8, 3.4),
        size: U.randInt(2, 3),
        colors: colors,
        spin: U.rand(-6, 6),
        shrink: false
      });
    }
  };

  /** Soft upward sparkle, e.g. behind a collected star. */
  FX.sparkle = function (x, y, color) {
    for (var n = 0; n < 6; n++) {
      FX.emit({
        x: x + U.rand(-5, 5), y: y + U.rand(-5, 5),
        vx: U.rand(-12, 12), vy: U.rand(-38, -12),
        gravity: 10, life: U.rand(.35, .7), size: U.randInt(1, 2),
        color: color || RA.C.cream, shrink: true
      });
    }
  };

  /* --------------------------------------------------- score popups */
  var popups = [];
  FX.popText = function (text, x, y, opts) {
    opts = opts || {};
    popups.push({
      text: String(text), x: x, y: y,
      vy: opts.vy === undefined ? -26 : opts.vy,
      life: opts.life || 0.9, t: 0,
      color: opts.color || RA.C.cream,
      scale: opts.scale || 1,
      outline: opts.outline !== false
    });
  };

  /* ---------------------------------------------------- screen shake */
  var shakeAmt = 0, shakeT = 0, shakeDur = 0;
  FX.shake = function (amount, duration) {
    shakeAmt = Math.max(shakeAmt, amount);
    shakeDur = Math.max(shakeDur, duration || 0.3);
    shakeT = shakeDur;
  };
  FX.shakeOffset = function () {
    if (shakeT <= 0) return { x: 0, y: 0 };
    var k = shakeT / shakeDur;
    var a = shakeAmt * k * k;
    return {
      x: Math.round(U.rand(-a, a)),
      y: Math.round(U.rand(-a, a))
    };
  };

  /* --------------------------------------------------------- update */
  FX.update = function (dt) {
    var i, p;
    for (i = 0; i < MAX; i++) {
      p = pool[i];
      if (!p.alive) continue;
      p.t += dt;
      if (p.t >= p.life) { p.alive = false; continue; }
      p.vy += p.gravity * dt;
      if (p.drag) {
        var f = Math.max(0, 1 - p.drag * dt);
        p.vx *= f; p.vy *= f;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }

    for (i = popups.length - 1; i >= 0; i--) {
      var q = popups[i];
      q.t += dt;
      if (q.t >= q.life) { popups.splice(i, 1); continue; }
      q.y += q.vy * dt;
      q.vy *= Math.max(0, 1 - 1.8 * dt);
    }

    if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
  };

  /* ----------------------------------------------------------- draw */
  FX.draw = function (ctx) {
    var i, p;
    for (i = 0; i < MAX; i++) {
      p = pool[i];
      if (!p.alive) continue;
      var k = 1 - p.t / p.life;
      var alpha = p.fade ? Math.min(1, k * 1.7) : 1;
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;

      if (p.kind === 'sprite') {
        RA.spr.drawC(ctx, p.sprite, p.x, p.y, { frame: p.spriteFrame, rotate: p.rot });
      } else {
        var s = p.shrink ? Math.max(1, Math.round(p.size * k)) : p.size;
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      }
    }
    ctx.globalAlpha = 1;

    for (i = 0; i < popups.length; i++) {
      var q = popups[i];
      var kk = q.t / q.life;
      var a = kk < 0.7 ? 1 : 1 - (kk - 0.7) / 0.3;
      var pop = kk < 0.18 ? RA.util.easeOutBack(kk / 0.18) : 1;
      RA.font.draw(ctx, q.text, q.x, Math.round(q.y), {
        scale: q.scale * pop,
        color: q.color,
        align: 'center',
        outline: q.outline,
        alpha: a
      });
    }
  };

  FX.clear = function () {
    for (var i = 0; i < MAX; i++) pool[i].alive = false;
    popups.length = 0;
    shakeT = 0;
  };

  FX.count = function () {
    var n = 0;
    for (var i = 0; i < MAX; i++) if (pool[i].alive) n++;
    return n;
  };

})();
