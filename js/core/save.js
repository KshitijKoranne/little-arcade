/* =====================================================================
   core/save.js — player profiles, stars, best scores, sticker album.

   Several children can share one link. Each gets their own slot with
   their own stars, bests and stickers; sound and screen settings stay
   global because they belong to the device, not the child.

   Game code only ever touches RA.save.data, which always points at the
   profile that is currently playing.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var KEY = 'rithya_arcade_v2';
  var LEGACY_KEY = 'rithya_arcade_v1';
  var MAX_PROFILES = 6;
  var MAX_NAME = 8;

  /* ------------------------------------------------------- stickers */
  var STICKERS = [
    { id: 'hello',    sprite: 'star',       name: 'Hello!',      hint: 'Play your first game' },
    { id: 'basket',   sprite: 'st_trophy',  name: 'Fruit Star',  hint: 'Catch 30 fruit in one round' },
    { id: 'goldrush', sprite: 'an_cat',     name: 'Gold Rush',   hint: 'Catch 3 gold stars in one round' },
    { id: 'sharp',    sprite: 'st_crown',   name: 'Sharp Eyes',  hint: 'Finish Hard Animal Match' },
    { id: 'perfect',  sprite: 'an_bunny',   name: 'No Mistakes', hint: 'Win Animal Match with no wrong flips' },
    { id: 'brainy',   sprite: 'st_rainbow', name: 'Brainy',      hint: 'Get 10 out of 10 in Bubble Maths' },
    { id: 'high',     sprite: 'st_rocket',  name: 'Sky High',    hint: 'Climb 800m in Sky Hopper' },
    { id: 'explorer', sprite: 'st_flower',  name: 'Explorer',    hint: 'Finish Star Maze level 5' },
    { id: 'artist',   sprite: 'gem',        name: 'Artist',      hint: 'Save a picture from Pixel Paint' },
    { id: 'everyone', sprite: 'st_moon',    name: 'Try It All',  hint: 'Play all six games' },
    { id: 'hundred',  sprite: 'st_cupcake', name: '100 Stars',   hint: 'Collect 100 stars' },
    { id: 'fivehund', sprite: 'st_diamond', name: '500 Stars',   hint: 'Collect 500 stars' }
  ];
  RA.STICKERS = STICKERS;

  var Save = RA.save = {};

  var root = null;          // whole save file
  Save.data = null;         // active profile (+ a live ref to settings)

  function blankProfile(name) {
    return {
      name: name,
      band: 1,              // 0 = ages 4-5, 1 = 6-7, 2 = 8-10
      stars: 0,
      totalStars: 0,
      stickers: {},
      best: {},
      played: {},
      created: Date.now(),
      lastPlayed: Date.now()
    };
  }

  function defaultSettings() {
    return { music: true, sfx: true, crt: true, shake: true };
  }

  /* -------------------------------------------------------------- load */
  Save.load = function () {
    var raw = RA.storage.get(KEY, null);

    if (!raw || typeof raw !== 'object' || !raw.profiles) {
      root = { v: 2, active: null, settings: defaultSettings(), profiles: {} };
      migrateLegacy();
    } else {
      root = {
        v: 2,
        active: typeof raw.active === 'string' ? raw.active : null,
        settings: mergeSettings(raw.settings),
        profiles: {}
      };
      for (var k in raw.profiles) {
        if (!Object.prototype.hasOwnProperty.call(raw.profiles, k)) continue;
        root.profiles[k] = sanitise(k, raw.profiles[k]);
      }
    }

    var names = Save.profileNames();
    if (!root.active || !root.profiles[root.active]) {
      root.active = names.length ? names[0] : null;
    }
    bindActive();
    return Save.data;
  };

  function mergeSettings(s) {
    var d = defaultSettings();
    if (s && typeof s === 'object') {
      d.music = s.music !== false;
      d.sfx = s.sfx !== false;
      d.crt = s.crt !== false;
      d.shake = s.shake !== false;
    }
    return d;
  }

  function sanitise(name, p) {
    var b = blankProfile(name);
    if (p && typeof p === 'object') {
      if (typeof p.band === 'number') b.band = Math.max(0, Math.min(2, p.band | 0));
      if (typeof p.stars === 'number') b.stars = p.stars;
      if (typeof p.totalStars === 'number') b.totalStars = p.totalStars;
      if (p.stickers && typeof p.stickers === 'object') b.stickers = p.stickers;
      if (p.best && typeof p.best === 'object') b.best = p.best;
      if (p.played && typeof p.played === 'object') b.played = p.played;
      if (typeof p.created === 'number') b.created = p.created;
      if (typeof p.lastPlayed === 'number') b.lastPlayed = p.lastPlayed;
    }
    return b;
  }

  /* Anyone who played the single-profile build keeps their progress. */
  function migrateLegacy() {
    var old = RA.storage.get(LEGACY_KEY, null);
    if (!old || typeof old !== 'object') return;
    var name = normaliseName(old.name || 'RITHYA') || 'RITHYA';
    root.profiles[name] = sanitise(name, old);
    root.settings = mergeSettings(old.settings);
    root.active = name;
    flush();
  }

  function bindActive() {
    if (!root.active || !root.profiles[root.active]) {
      /* No profile yet — hand out a detached scratch object so nothing
         can crash before the player picker has run. */
      Save.data = blankProfile('');
      Save.data.settings = root.settings;
    } else {
      Save.data = root.profiles[root.active];
      Save.data.settings = root.settings;
    }
    /* Difficulty follows whoever is playing. */
    if (RA.tune) RA.tune.syncFromProfile();
  }

  /** Which age band this child plays at. */
  Save.setBand = function (b) {
    Save.data.band = Math.max(0, Math.min(2, b | 0));
    if (RA.tune) RA.tune.syncFromProfile();
    flush();
  };
  Save.band = function () {
    return typeof Save.data.band === 'number' ? Save.data.band : 1;
  };

  function flush() {
    var out = { v: 2, active: root.active, settings: root.settings, profiles: {} };
    for (var k in root.profiles) {
      if (!Object.prototype.hasOwnProperty.call(root.profiles, k)) continue;
      var p = root.profiles[k];
      out.profiles[k] = {
        name: p.name, band: p.band, stars: p.stars, totalStars: p.totalStars,
        stickers: p.stickers, best: p.best, played: p.played,
        created: p.created, lastPlayed: p.lastPlayed
      };
    }
    RA.storage.set(KEY, out);
  }
  Save.flush = flush;

  /* ---------------------------------------------------------- profiles */
  function normaliseName(raw) {
    return String(raw || '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_NAME);
  }
  Save.normaliseName = normaliseName;

  Save.profileNames = function () {
    var names = [];
    for (var k in root.profiles) {
      if (Object.prototype.hasOwnProperty.call(root.profiles, k)) names.push(k);
    }
    names.sort(function (a, b) {
      return (root.profiles[b].lastPlayed || 0) - (root.profiles[a].lastPlayed || 0);
    });
    return names;
  };

  Save.profiles = function () {
    return Save.profileNames().map(function (n) { return root.profiles[n]; });
  };

  Save.profileCount = function () { return Save.profileNames().length; };
  Save.isFull = function () { return Save.profileCount() >= MAX_PROFILES; };
  Save.maxProfiles = MAX_PROFILES;
  Save.maxNameLength = MAX_NAME;
  Save.activeName = function () { return root.active; };
  Save.hasProfile = function (name) { return !!root.profiles[normaliseName(name)]; };

  /** Returns the created name, or null if invalid / duplicate / full. */
  Save.createProfile = function (rawName) {
    var name = normaliseName(rawName);
    if (!name) return null;
    if (root.profiles[name]) return null;
    if (Save.isFull()) return null;
    root.profiles[name] = blankProfile(name);
    root.active = name;
    bindActive();
    flush();
    return name;
  };

  Save.switchTo = function (rawName) {
    var name = normaliseName(rawName);
    if (!root.profiles[name]) return false;
    root.active = name;
    root.profiles[name].lastPlayed = Date.now();
    bindActive();
    flush();
    return true;
  };

  Save.deleteProfile = function (rawName) {
    var name = normaliseName(rawName);
    if (!root.profiles[name]) return false;
    delete root.profiles[name];
    if (root.active === name) {
      var left = Save.profileNames();
      root.active = left.length ? left[0] : null;
    }
    bindActive();
    flush();
    return true;
  };

  /* ------------------------------------------------------------ stars */
  Save.addStars = function (n) {
    if (!n || !root.active) return;
    Save.data.stars += n;
    Save.data.totalStars += n;
    if (Save.data.totalStars >= 100) Save.unlock('hundred');
    if (Save.data.totalStars >= 500) Save.unlock('fivehund');
    flush();
  };

  Save.spendStars = function (n) {
    if (Save.data.stars < n) return false;
    Save.data.stars -= n;
    flush();
    return true;
  };

  /* ------------------------------------------------------------ bests */
  Save.best = function (gameId) { return Save.data.best[gameId] || 0; };

  Save.setBest = function (gameId, value) {
    var prev = Save.data.best[gameId] || 0;
    if (value > prev) {
      Save.data.best[gameId] = value;
      flush();
      return true;
    }
    return false;
  };

  Save.markPlayed = function (gameId) {
    if (!root.active) return;
    Save.data.played[gameId] = (Save.data.played[gameId] || 0) + 1;
    Save.data.lastPlayed = Date.now();
    Save.unlock('hello');
    var all = RA.games.length >= 6 && RA.games.every(function (g) {
      return Save.data.played[g.id];
    });
    if (all) Save.unlock('everyone');
    flush();
  };

  Save.playCount = function (gameId) { return Save.data.played[gameId] || 0; };

  /* --------------------------------------------------------- stickers */
  var unlockQueue = [];

  Save.unlock = function (id) {
    if (!root.active) return false;
    if (Save.data.stickers[id]) return false;
    var def = null;
    for (var i = 0; i < STICKERS.length; i++) if (STICKERS[i].id === id) def = STICKERS[i];
    if (!def) return false;
    Save.data.stickers[id] = Date.now();
    unlockQueue.push(def);
    flush();
    return true;
  };

  Save.hasSticker = function (id) { return !!Save.data.stickers[id]; };
  Save.stickerCount = function () { return Object.keys(Save.data.stickers).length; };
  Save.takeUnlock = function () { return unlockQueue.length ? unlockQueue.shift() : null; };
  Save.pendingUnlocks = function () { return unlockQueue.length; };

  /* --------------------------------------------------------- settings */
  Save.applySettings = function () {
    var s = root.settings;
    RA.audio.musicOn = s.music;
    RA.audio.sfxOn = s.sfx;
    RA.audio.setMusic(s.music);
    RA.audio.setSfx(s.sfx);
    if (document && document.body) document.body.classList.toggle('flat', !s.crt);
  };

  Save.setSetting = function (key, value) {
    root.settings[key] = value;
    flush();
    Save.applySettings();
  };

  /** Wipes the active player only. Other children keep their progress. */
  Save.resetActive = function () {
    if (!root.active) return;
    var name = root.active;
    root.profiles[name] = blankProfile(name);
    bindActive();
    flush();
  };

  /* ----------------------------------------------------------- helper */
  Save.payout = function (gameId, score, starsEarned) {
    Save.markPlayed(gameId);
    var isRecord = Save.setBest(gameId, score);
    Save.addStars(starsEarned);
    return isRecord;
  };

})();
