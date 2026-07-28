# The Little Arcade

Six pixel-art games for young children, in one hub. No build step, no
dependencies, no network calls. Open `index.html` and it runs.

Everything you see is drawn at runtime: the font is a hand-plotted 5x7
bitmap, the sprites are colour-indexed strings baked to canvases, and
the music is synthesised by a small chiptune engine. There are no image
or audio files anywhere in the project.

---

## Running it

**Locally** — double-click `index.html`. It works straight off the disk;
saved progress falls back to memory if the browser blocks `file://`
storage.

**Served** — drop the folder behind any static web server. Nothing needs
to be compiled.

```
python3 -m http.server 8000    # then visit http://localhost:8000
```

---

## The games

| Game | What it is | Skill it builds |
|---|---|---|
| **Orchard** | Catch falling fruit, dodge rocks. Chains build a multiplier; every 30 fruit triggers a fruit rain. | Tracking, timing |
| **Match** | Animal pairs on a flip board, three sizes. Opens with a short peek. | Working memory |
| **Bubbles** | Ten sums, four floating bubbles, pop the answer. Wrong taps cost nothing but the point. | Arithmetic to 20 |
| **Sky Hop** | Endless vertical jumper. She bounces on her own; you only steer. | Anticipation |
| **Star Maze** | Procedurally generated hedge mazes, endless levels. Collect the stars, the gate opens. | Spatial reasoning |
| **Paint** | A 46x28 pixel canvas with pen, fill, stamps, mirror mode and PNG export. | Free play |

Every game pays out **stars** into a shared purse, and milestones across
all six unlock **stickers** in the album. That shared progression is
what makes it a hub rather than six separate toys.

---

## Players

Several children can share one link. Each gets their own slot with their
own stars, best scores and stickers.

- First run asks **WHO IS PLAYING?** and offers an on-screen keyboard.
- Switch or add players from the name button on the hub, or Settings.
- Up to six players; names are up to eight letters.
- Sound and screen settings are **global** (they belong to the device),
  everything else is **per child**.

Progress lives in `localStorage` under `rithya_arcade_v2`. Clearing
browser data for the site wipes it; nothing leaves the device.

---

## Controls

|  | Touch | Keyboard |
|---|---|---|
| Menus | Tap | Arrows + Enter, Esc to go back |
| Orchard | Drag the basket | Left / Right |
| Match | Tap a card | Arrows + Enter |
| Bubbles | Tap a bubble | Arrows + Enter |
| Sky Hop | Hold the left or right half | Left / Right |
| Star Maze | Hold anywhere, she walks toward your finger | Arrows |
| Paint | Draw with a finger | `U` to undo |

`M` mutes everything. Settings has a full-screen toggle, which also asks
phones to hold landscape.

---

## Mobile

- The canvas is a fixed 480x270 backing store scaled to fit, so the
  pixels stay square on every screen.
- Whole-number scaling above 2x keeps it perfectly crisp; below that it
  uses quarter steps so a phone still fills its screen.
- Sizing follows `visualViewport`, so the browser's collapsing toolbars
  do not crop the bottom of the screen.
- Portrait phones get a "turn me sideways" card instead of a letterboxed
  sliver.
- Safe-area insets are respected, page zoom and pull-to-refresh are off,
  and there is a web manifest so it can be added to a home screen and
  run fullscreen.

---

## Project layout

```
index.html                script tags, in load order
manifest.webmanifest      home-screen install metadata
icon.svg
css/style.css             the shell only; the game draws itself
js/
  core/
    util.js               namespace, maths, palette, safe storage
    font.js               5x7 bitmap font + tinted atlas cache
    sprites.js            sprite bank, decoder, auto-outliner
    backdrop.js           dithered skies, parallax hills, clouds
    audio.js              chiptune engine, 7 tracks, SFX bank
    input.js              keyboard / mouse / touch in one model
    particles.js          pooled particles, popups, screen shake
    save.js               profiles, stars, bests, stickers
    ui.js                 immediate-mode pixel widgets
    scene.js              scene registry, transitions, unlock banner
  games/
    hub.js                title, players, name entry, hub, album, settings
    catch.js  memory.js  maths.js  hopper.js  maze.js  paint.js
  boot.js                 canvas scaling and the main loop
```

---

## Adding a seventh game

Two steps. Nothing else in the project needs to change — the hub reads
the game registry, so a new card appears on its own.

**1. Create `js/games/yourgame.js`:**

```js
(function () {
  'use strict';
  var RA = window.RA, C = RA.C;

  RA.registerGame({
    id: 'yourgame',                 // unique; also the scene name
    title: 'YOUR GAME',             // shown on the hub card
    color: '#2f7fd6',               // card colour
    artBg: '#bff0ff',               // behind the card's preview art
    icon: 'star',                   // fallback if preview is omitted

    // how the best score reads on the card
    bestLabel: function (b) { return 'BEST ' + b; },

    // optional: live animated art inside the hub card
    preview: function (ctx, x, y, w, h, t) {
      RA.bg.sky(ctx, RA.bg.PALETTES.day, x, y, w, h);
      RA.spr.drawC(ctx, 'star', x + w / 2, y + h / 2 + Math.sin(t * 3) * 4, {});
    },

    // a factory returning a fresh scene each time it is entered
    scene: function () {
      var t = 0, score = 0;

      return {
        music: 'hub',               // any key from RA.audio.SONGS

        enter: function () { t = 0; score = 0; },
        exit:  function () {},

        update: function (dt) {
          t += dt;
          if (RA.input.justPressed('back')) RA.go('hub');
        },

        draw: function (ctx) {
          RA.bg.sky(ctx, RA.bg.PALETTES.meadow);
          RA.font.draw(ctx, 'HELLO', RA.W / 2, 100,
                       { scale: 4, align: 'center', color: C.cream });

          RA.ui.begin({ nav: true });
          if (RA.ui.button(ctx, 6, 4, 44, 20, '<',
                           { color: C.grape, scale: 1 })) RA.go('hub');
          RA.ui.end();
        },

        // optional, used by the test harness
        debug: function () { return { score: score }; }
      };
    }
  });
})();
```

**2. Add one line to `index.html`**, with the other games:

```html
<script src="js/games/yourgame.js"></script>
```

When a round ends, bank the result so it joins the shared progression:

```js
var isRecord = RA.save.payout('yourgame', score, starsEarned);
RA.celebrate(starRating, isRecord);
```

To hang a sticker off it, add an entry to `STICKERS` in
`js/core/save.js` and call `RA.save.unlock('yourStickerId')`.

---

## Engine reference

**Drawing** — `RA.W` / `RA.H` are 480 / 270. Draw in those units.

- `RA.font.draw(ctx, text, x, y, {scale, color, align, outline, shadow, wave, alpha})`
- `RA.spr.draw(ctx, name, x, y, {frame, scale, flipX, alpha, rotate})`,
  `RA.spr.drawC(...)` to centre
- `RA.bg.sky / hills / clouds / stars / ground / butterflies / vignette`
- `RA.ui.panel / button / bar / stars / results / countdown / header`
- `RA.fx.burst / confetti / sparkle / popText / shake`

**Input** — `RA.input.justPressed('left'|'right'|'up'|'down'|'ok'|'back')`,
`RA.input.axisX()`, `RA.input.tapped(x,y,w,h)`, `RA.input.pointer`.

**Audio** — `RA.audio.sfx('coin')` and friends; `RA.audio.SONGS` holds the
seven loops. Songs are plain data, so a new one is a few lines of note
tokens.

**Sprites** — authored as arrays of strings, one character per pixel,
keyed to the 36-colour ramp in `js/core/util.js`. `'.'` is transparent.
The decoder adds the dark keyline automatically:

```js
RA.spr.def('coin', [
  '..cc..',
  '.cbbc.',
  'cbbbbc',
  '.cbbc.',
  '..cc..'
]);
```

If you would rather use PNG art later, `RA.spr.defineImage(name, img)`
takes a loaded `<img>` and everything downstream keeps working.

---

## Testing

Scenes may expose `debug()`, which returns a plain object describing
their state. `RA.sceneDebug()` reads it. That is what the headless
harness uses to drive real playthroughs — solving mazes with a
breadth-first search, chasing fruit, answering sums — rather than just
checking that nothing throws.

---

## Design notes

A few decisions worth knowing before changing things:

- **One fail state per game, at most.** In Sky Hop you can only lose by
  falling. In Orchard only hazards cost a life; missing fruit just breaks
  the chain. Bubbles cannot be failed at all.
- **Wrong answers are never punished**, only unrewarded. A wrong bubble
  wobbles and can be retried; it costs the first-try point and nothing
  else.
- **The maze has loops.** A perfect maze has exactly one route between
  any two points, which is miserable for a small child, so the generator
  knocks a few extra holes through after carving.
- **Match opens with a peek** so the first flips are informed rather than
  blind luck.
- **The camera in Sky Hop** must leave more than one jump of headroom
  below her apex, or she can land on a platform that is already off the
  bottom of the screen. `CAM_ANCHOR` and the platform gap range are tied
  together for that reason.
