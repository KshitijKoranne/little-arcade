/* =====================================================================
   core/tune.js — age-banded difficulty.

   Every number in here is tied to a developmental finding rather than a
   feel. The bands are:

     0  LITTLE   ages 4-5
     1  MIDDLE   ages 6-7      <- default
     2  BIG      ages 8-10

   The evidence behind the key numbers:

   * Choice reaction time (pick 1 of 4) is ~500-600ms in adults
     (Der & Deary 2006) and roughly double that at age 6; Kail's (1991)
     exponential model says most of the improvement happens between 4
     and 8. So a 6-year-old needs on the order of a full second to
     decide, plus motor time on top.
   * From that, a falling object should take at least ~3.0s to cross the
     screen at 4-5, ~2.0-2.5s at 6-7 and ~1.2-1.5s at 8-10. On a 270px
     screen that caps fall speed at roughly 90 / 135 / 200 px per second.
   * Visual working memory is about 3.5 items at age 7 rising to ~5.7 in
     adults (Cowan 2005), and remembering an item *and* its place is
     harder than either alone (Sander et al.). That puts a fair
     memory-match board at 3-4 pairs / 6-8 pairs / 8-12 pairs.
   * Arithmetic: UK Year 1 and US Grade 1 both expect addition and
     subtraction within 20 at age 6, with fluency only expected to 10.
     Reception/Kindergarten is within 10.
   * Touch targets for small fingers want to be roughly double the adult
     minimum; performance measurably degrades below ~18mm even at 6
     (Nielsen Norman Group; Woodward et al. 2017).

   Where the research was thin the agents said so, and I have leaned
   conservative rather than inventing precision.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;

  var BANDS = [
    { id: 0, key: 'little', name: 'LITTLE', ages: '4 - 5' },
    { id: 1, key: 'middle', name: 'MIDDLE', ages: '6 - 7' },
    { id: 2, key: 'big',    name: 'BIG',    ages: '8 - 10' }
  ];

  var TABLE = {

    /* ---------------------------------------------------------- ORCHARD
       fallMax is the hard ceiling in px/sec. 270px / fallMax = seconds to
       cross, which is the reaction budget the child actually gets.       */
    catch: [
      { fallBase: 58, fallRamp: 0.36, fallMax: 92,                 // 2.9s to cross
        spawnBase: 1.20, spawnMin: 0.62, hazardPct: 0.07, goldPct: 0.06,
        catchPad: 11, lives: 5, rampCap: 90 },
      { fallBase: 74, fallRamp: 0.62, fallMax: 134,                // 2.0s to cross
        spawnBase: 1.02, spawnMin: 0.50, hazardPct: 0.12, goldPct: 0.05,
        catchPad: 8, lives: 4, rampCap: 90 },
      { fallBase: 88, fallRamp: 1.15, fallMax: 198,                // 1.36s to cross
        spawnBase: 0.92, spawnMin: 0.36, hazardPct: 0.17, goldPct: 0.045,
        catchPad: 5, lives: 3, rampCap: 90 }
    ],

    /* ------------------------------------------------------------ MATCH
       pairs per level, and how long the opening peek lasts.              */
    memory: [
      { pairs: [2, 3, 4],  peek: [2.4, 3.0, 3.4], minCard: 52 },
      { pairs: [3, 6, 8],  peek: [1.8, 2.3, 2.8], minCard: 42 },
      { pairs: [6, 8, 12], peek: [1.4, 1.8, 2.2], minCard: 34 }
    ],

    /* ---------------------------------------------------------- BUBBLES */
    maths: [
      { modes: ['add5', 'add10', 'sub10'],  questions: 8 },
      { modes: ['add10', 'add20', 'sub20'], questions: 10 },
      { modes: ['add20', 'sub20', 'add100'], questions: 10 }
    ],

    /* ---------------------------------------------------------- SKY HOP
       reachMax is the big one. One bounce lasts 0.88s and she accelerates
       to 215px/s, so she can cover ~165px horizontally IF she starts
       moving instantly at full tilt. The old build asked for up to 127px,
       which needs near-perfect play - a frame-perfect bot still died in
       9-13 seconds. These values ask for far less.                        */
    hopper: [
      { camAnchor: 0.34, gapMin: 28, gapMax: 36, gapGrow: 0,
        reachBase: 46, reachGrow: 0,  platMin: 62, platMax: 82, springPct: 0.16,
        maxVX: 128, moveAcc: 620, safetyEvery: 4, safetyW: 150, rescues: 3 },
      { camAnchor: 0.38, gapMin: 30, gapMax: 38, gapGrow: 6,
        reachBase: 52, reachGrow: 10, platMin: 56, platMax: 80, springPct: 0.12,
        maxVX: 150, moveAcc: 760, safetyEvery: 5, safetyW: 120, rescues: 2 },
      { camAnchor: 0.42, gapMin: 34, gapMax: 44, gapGrow: 12,
        reachBase: 70, reachGrow: 24, platMin: 46, platMax: 66, springPct: 0.10,
        maxVX: 192, moveAcc: 900, safetyEvery: 9, safetyW: 100, rescues: 1 }
    ],

    /* -------------------------------------------------------- STAR MAZE
       cellCap keeps the tile size legible; the old build shrank tiles to
       15px by level 12 and asked for ~32s of pure walking.               */
    maze: [
      { cwMax: 7,  chMax: 3, starBase: 2, starGrow: 3, beeFrom: 99 },
      { cwMax: 10, chMax: 5, starBase: 2, starGrow: 2, beeFrom: 3 },
      { cwMax: 14, chMax: 6, starBase: 3, starGrow: 2, beeFrom: 2 }
    ],

    /* Screen shake scale. Children sit at the peak of motion-sickness
       susceptibility, so the youngest band gets it softened. Settings has
       an outright off switch too.                                        */
    shake: [0.45, 0.7, 1.0]
  };

  var Tune = RA.tune = {};

  Tune.BANDS = BANDS;
  Tune.band = 1;

  Tune.setBand = function (b) {
    Tune.band = RA.util.clamp(b | 0, 0, BANDS.length - 1);
  };

  Tune.bandInfo = function () { return BANDS[Tune.band]; };

  /** Per-game settings for the band currently playing. */
  Tune.get = function (game) {
    var row = TABLE[game];
    if (!row) return {};
    return row[Tune.band] || row[1];
  };

  Tune.shakeScale = function () { return TABLE.shake[Tune.band]; };

  /* Applied by save.js whenever the active profile changes. */
  Tune.syncFromProfile = function () {
    var d = RA.save && RA.save.data;
    Tune.setBand(d && typeof d.band === 'number' ? d.band : 1);
  };

})();
