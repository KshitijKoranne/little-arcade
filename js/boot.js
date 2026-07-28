/* =====================================================================
   boot.js — wire it all together and run the loop.
   Loaded last, after every core module and every game has registered.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;

  var canvas = document.getElementById('screen');
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.mozImageSmoothingEnabled = false;
  ctx.webkitImageSmoothingEnabled = false;

  RA.canvas = canvas;
  RA.ctx = ctx;

  /* --------------------------------------------------------- scaling
     Backing store stays 480x270 forever. Only the CSS size changes, so
     the pixels stay square and the game logic never sees a scale factor.
     Integer scales are preferred once there is room for them.          */
  function viewport() {
    /* visualViewport tracks the space actually left over once a mobile
       browser's chrome is showing, which innerHeight lies about. */
    var vv = window.visualViewport;
    return {
      w: Math.max(1, vv ? vv.width : window.innerWidth),
      h: Math.max(1, vv ? vv.height : window.innerHeight)
    };
  }

  function resize() {
    var v = viewport();
    var s = Math.min(v.w / RA.W, v.h / RA.H);

    /* Whole-number scales stay perfectly crisp, so prefer them when
       there is room. On phones, filling the screen matters more than
       pixel purity, so allow quarter steps below 2x. */
    if (s >= 2) s = Math.floor(s);
    else if (s >= 1) s = Math.floor(s * 4) / 4;
    s = Math.max(s, 0.2);

    canvas.style.width = Math.round(RA.W * s) + 'px';
    canvas.style.height = Math.round(RA.H * s) + 'px';
  }

  window.addEventListener('resize', resize, false);
  window.addEventListener('orientationchange', function () {
    setTimeout(resize, 120);
    setTimeout(resize, 400);
  }, false);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize);
    window.visualViewport.addEventListener('scroll', resize);
  }
  resize();
  /* iOS settles its toolbars a beat after load. */
  setTimeout(resize, 300);

  /* ---------------------------------------------------------- startup */
  RA.save.load();
  RA.input.attach(canvas);
  RA.save.applySettings();
  RA.goNow('title');

  /* ------------------------------------------------------------- loop */
  var last = 0;
  var acc = 0, frames = 0;
  RA.fps = 60;

  function frame(now) {
    window.requestAnimationFrame(frame);

    if (!last) { last = now; return; }
    var dt = (now - last) / 1000;
    last = now;

    /* A tab that was in the background can hand us a huge dt. Clamp it
       so nothing tunnels through a platform on the way back. */
    if (dt > 0.05) dt = 0.05;

    /* global mute shortcut */
    if (RA.input.justPressed('mute')) {
      var on = !RA.save.data.settings.music;
      RA.save.setSetting('music', on);
      RA.save.setSetting('sfx', on);
      if (on) RA.audio.music(RA.audio.currentSong() || 'hub');
      RA.fx.popText(on ? 'SOUND ON' : 'SOUND OFF', RA.W / 2, 40, { color: '#ffd45c', scale: 2 });
    }

    RA.scenes.update(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, RA.W, RA.H);
    RA.scenes.draw(ctx);

    RA.input.endFrame();

    acc += dt; frames++;
    if (acc >= 1) { RA.fps = frames / acc; acc = 0; frames = 0; }
  }
  window.requestAnimationFrame(frame);

  /* Keep the audio clock healthy when returning to the tab. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { RA.audio.resume(); last = 0; }
  }, false);

})();
