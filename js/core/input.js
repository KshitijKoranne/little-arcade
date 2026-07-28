/* =====================================================================
   core/input.js — one input model for keyboard, mouse and touch.

   Everything is reported in logical 480x270 coordinates, so game code
   never has to think about the canvas scale or device pixel ratio.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var I = RA.input = {};

  var canvas = null;

  /* Named buttons, so games don't hard-code key strings. */
  var MAP = {
    'ArrowLeft': 'left', 'a': 'left', 'A': 'left',
    'ArrowRight': 'right', 'd': 'right', 'D': 'right',
    'ArrowUp': 'up', 'w': 'up', 'W': 'up',
    'ArrowDown': 'down', 's': 'down', 'S': 'down',
    ' ': 'ok', 'Enter': 'ok', 'z': 'ok', 'Z': 'ok',
    'Escape': 'back', 'Backspace': 'back', 'x': 'back', 'X': 'back',
    'm': 'mute', 'M': 'mute',
    'p': 'pause', 'P': 'pause'
  };

  var down = {};        // held this instant
  var pressed = {};     // went down during this frame
  var released = {};

  I.pointer = {
    x: 0, y: 0,
    px: 0, py: 0,       // previous frame
    dx: 0, dy: 0,
    down: false,
    justDown: false,
    justUp: false,
    everMoved: false
  };

  I.anyPressedThisFrame = false;

  /* ---------------------------------------------------------- queries */
  I.isDown = function (btn) { return !!down[btn]; };
  I.justPressed = function (btn) { return !!pressed[btn]; };
  I.justReleased = function (btn) { return !!released[btn]; };
  I.axisX = function () { return (down.right ? 1 : 0) - (down.left ? 1 : 0); };
  I.axisY = function () { return (down.down ? 1 : 0) - (down.up ? 1 : 0); };

  /** True if the pointer went down inside this rect this frame. */
  I.tapped = function (x, y, w, h) {
    return I.pointer.justDown && RA.util.pointIn(I.pointer.x, I.pointer.y, x, y, w, h);
  };
  /** True if the pointer is currently held inside this rect. */
  I.holding = function (x, y, w, h) {
    return I.pointer.down && RA.util.pointIn(I.pointer.x, I.pointer.y, x, y, w, h);
  };
  I.hovering = function (x, y, w, h) {
    return I.pointer.everMoved && RA.util.pointIn(I.pointer.x, I.pointer.y, x, y, w, h);
  };

  /* ------------------------------------------------------------ setup */
  I.attach = function (cv) {
    canvas = cv;

    window.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('keyup', onKeyUp, false);
    window.addEventListener('blur', onBlur, false);

    canvas.addEventListener('pointerdown', onPointerDown, false);
    window.addEventListener('pointermove', onPointerMove, false);
    window.addEventListener('pointerup', onPointerUp, false);
    window.addEventListener('pointercancel', onPointerUp, false);

    /* Stop the page itself from scrolling / zooming under the game. */
    canvas.addEventListener('touchstart', prevent, { passive: false });
    canvas.addEventListener('touchmove', prevent, { passive: false });
    canvas.addEventListener('contextmenu', prevent, false);
  };

  function prevent(e) { e.preventDefault(); }

  function toLogical(clientX, clientY) {
    if (!canvas) return { x: 0, y: 0 };
    var r = canvas.getBoundingClientRect();
    var sx = r.width ? RA.W / r.width : 1;
    var sy = r.height ? RA.H / r.height : 1;
    return {
      x: RA.util.clamp((clientX - r.left) * sx, 0, RA.W - 1),
      y: RA.util.clamp((clientY - r.top) * sy, 0, RA.H - 1)
    };
  }
  I.toLogical = toLogical;

  function onKeyDown(e) {
    var btn = MAP[e.key];
    /* Keep the page from scrolling on arrows/space while playing. */
    if (btn) e.preventDefault();
    if (btn && !down[btn]) { pressed[btn] = true; I.anyPressedThisFrame = true; }
    if (btn) down[btn] = true;
    down['key:' + e.key] = true;
    if (!e.repeat) pressed['key:' + e.key] = true;
    RA.audio.init();
  }

  function onKeyUp(e) {
    var btn = MAP[e.key];
    if (btn) { down[btn] = false; released[btn] = true; }
    down['key:' + e.key] = false;
    released['key:' + e.key] = true;
  }

  function onBlur() {
    for (var k in down) down[k] = false;
  }

  function onPointerDown(e) {
    var p = toLogical(e.clientX, e.clientY);
    I.pointer.x = p.x; I.pointer.y = p.y;
    I.pointer.down = true;
    I.pointer.justDown = true;
    I.pointer.everMoved = true;
    I.anyPressedThisFrame = true;
    if (canvas && canvas.setPointerCapture) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    }
    RA.audio.init();
    e.preventDefault();
  }

  function onPointerMove(e) {
    var p = toLogical(e.clientX, e.clientY);
    I.pointer.x = p.x; I.pointer.y = p.y;
    I.pointer.everMoved = true;
  }

  function onPointerUp(e) {
    I.pointer.down = false;
    I.pointer.justUp = true;
  }

  /* Called once per frame, after the scene has read everything. */
  I.endFrame = function () {
    pressed = {};
    released = {};
    I.anyPressedThisFrame = false;
    I.pointer.dx = I.pointer.x - I.pointer.px;
    I.pointer.dy = I.pointer.y - I.pointer.py;
    I.pointer.px = I.pointer.x;
    I.pointer.py = I.pointer.y;
    I.pointer.justDown = false;
    I.pointer.justUp = false;
  };

})();
