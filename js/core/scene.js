/* =====================================================================
   core/scene.js — scene registry, transitions, global sticker banner.

   A scene is a plain object:
     { enter(params), exit(), update(dt), draw(ctx),
       music: 'songName' }
   Register it with RA.registerScene('id', sceneOrFactory) and switch
   with RA.go('id', params).
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var U = RA.util;
  var C = RA.C;

  var registry = {};
  var current = null;
  var currentName = null;

  RA.registerScene = function (name, sceneOrFactory) {
    registry[name] = sceneOrFactory;
  };

  function instantiate(name) {
    var s = registry[name];
    if (!s) return null;
    return (typeof s === 'function') ? s() : s;
  }

  /* --------------------------------------------------- transitions */
  var trans = { active: false, phase: 'out', t: 0, dur: 0.32, next: null, params: null };
  var queued = null;   // a go() asked for during a transition

  RA.go = function (name, params) {
    if (!registry[name]) {
      if (window.console) console.warn('[arcade] unknown scene:', name);
      return;
    }
    if (trans.active) {
      if (trans.phase === 'out') {
        /* still wiping out — just change where we are heading */
        trans.next = name;
        trans.params = params || null;
      } else {
        /* wiping back in: a scene's enter() can legitimately redirect
           (e.g. the hub bouncing you to the player picker). Remember it
           and run it the moment the wipe finishes, instead of dropping
           it on the floor. */
        queued = { name: name, params: params || null };
      }
      return;
    }
    trans.active = true;
    trans.phase = 'out';
    trans.t = 0;
    trans.next = name;
    trans.params = params || null;
    RA.audio.sfx('whoosh');
  };

  /** Immediate switch with no wipe. Used at boot and by tooling. */
  RA.goNow = function (name, params) {
    /* Cancel anything in flight, or it will land later and clobber the
       scene we are switching to. */
    trans.active = false;
    trans.next = null;
    trans.params = null;
    queued = null;

    if (current && current.exit) current.exit();
    RA.fx.clear();
    current = instantiate(name);
    currentName = name;
    if (current) {
      if (current.enter) current.enter(params || {});
      if (current.music) RA.audio.music(current.music);
    }
  };

  RA.currentScene = function () { return currentName; };

  /** The live scene object. Scenes may expose debug() for tooling. */
  RA.currentSceneObject = function () { return current; };
  RA.sceneDebug = function () {
    return (current && current.debug) ? current.debug() : null;
  };

  /* --------------------------------------------- sticker unlock banner */
  var banner = null;   // { def, t }

  function pumpBanner() {
    if (banner) return;
    var def = RA.save.takeUnlock();
    if (def) {
      banner = { def: def, t: 0 };
      RA.audio.sfx('unlock');
      RA.fx.confetti(40);
    }
  }

  function drawBanner(ctx) {
    if (!banner) return;
    var life = 2.9;
    var t = banner.t;
    var slide;
    if (t < 0.35) slide = U.easeOutBack(t / 0.35);
    else if (t > life - 0.3) slide = 1 - U.easeInCubic((t - (life - 0.3)) / 0.3);
    else slide = 1;

    var w = 214, h = 44;
    var x = Math.round((RA.W - w) / 2);
    var y = Math.round(-h - 6 + slide * (h + 16));

    RA.ui.panel(ctx, x, y, w, h, { fill: C.grape, border: C.ink, highlight: C.purple });

    RA.spr.draw(ctx, banner.def.sprite, x + 8, y + 6, { scale: 2 });
    RA.font.draw(ctx, 'NEW STICKER!', x + 46, y + 9, { scale: 1, color: C.cream, shadow: true });
    RA.font.draw(ctx, banner.def.name, x + 46, y + 22, { scale: 2, color: C.white, shadow: true });

    /* little sparkle ring */
    for (var i = 0; i < 5; i++) {
      var a = banner.t * 3 + i * (Math.PI * 2 / 5);
      RA.spr.drawC(ctx, 'star_small', x + 22 + Math.cos(a) * 18, y + 22 + Math.sin(a) * 15,
                   { alpha: 0.5 + 0.5 * Math.sin(banner.t * 6 + i) });
    }
  }

  /* ------------------------------------------------------------ loop */
  var Scenes = RA.scenes = {};

  Scenes.update = function (dt) {
    RA.ui.tick(dt);

    if (trans.active) {
      trans.t += dt;
      if (trans.phase === 'out' && trans.t >= trans.dur) {
        if (current && current.exit) current.exit();
        RA.fx.clear();
        current = instantiate(trans.next);
        currentName = trans.next;
        if (current) {
          if (current.enter) current.enter(trans.params || {});
          if (current.music) RA.audio.music(current.music);
        }
        trans.phase = 'in';
        trans.t = 0;
      } else if (trans.phase === 'in' && trans.t >= trans.dur) {
        trans.active = false;
        if (queued) {
          var q = queued;
          queued = null;
          RA.go(q.name, q.params);
        }
      }
    }

    /* Scenes keep running under the wipe — it looks alive, not frozen. */
    if (current && current.update) current.update(dt);

    RA.fx.update(dt);

    pumpBanner();
    if (banner) {
      banner.t += dt;
      if (banner.t > 2.9) banner = null;
    }
  };

  Scenes.draw = function (ctx) {
    var shake = RA.fx.shakeOffset();
    ctx.save();
    if (shake.x || shake.y) ctx.translate(shake.x, shake.y);

    if (current && current.draw) current.draw(ctx);
    else { ctx.fillStyle = C.ink; ctx.fillRect(0, 0, RA.W, RA.H); }

    RA.fx.draw(ctx);
    ctx.restore();

    drawBanner(ctx);

    if (trans.active) drawWipe(ctx);
  };

  /* A diagonal sweep of growing squares — cheap, and it reads as pixel
     art rather than a CSS fade. */
  function drawWipe(ctx) {
    var raw = U.clamp(trans.t / trans.dur, 0, 1);
    var p = trans.phase === 'out' ? raw : 1 - raw;
    if (p <= 0) return;

    var cell = 15;
    var cols = Math.ceil(RA.W / cell);
    var rows = Math.ceil(RA.H / cell);
    var span = cols + rows;
    ctx.fillStyle = C.ink;
    for (var gy = 0; gy < rows; gy++) {
      for (var gx = 0; gx < cols; gx++) {
        var bias = (gx + gy) / span;
        var local = U.clamp(p * 1.75 - bias * 0.75, 0, 1);
        if (local <= 0) continue;
        var s = Math.ceil(local * cell);
        var ox = gx * cell + ((cell - s) >> 1);
        var oy = gy * cell + ((cell - s) >> 1);
        ctx.fillRect(ox, oy, s, s);
      }
    }
  }

  /* Games call this at the end of a round. Centralised so every game
     celebrates the same way. */
  RA.celebrate = function (starsEarned, isRecord) {
    if (isRecord) RA.fx.confetti(90);
    else if (starsEarned >= 3) RA.fx.confetti(55);
    RA.audio.sfx('win');
  };

})();
