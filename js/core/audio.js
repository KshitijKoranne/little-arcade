/* =====================================================================
   core/audio.js — chiptune engine.

   Three voice types, the way an 8-bit sound chip did it:
     pulse    variable duty-cycle square, built from a Fourier series
     tri      triangle wave, used for bass
     noise    white-noise buffer through a filter, used for drums

   Music is sequenced with a lookahead scheduler (a 25ms timer that
   schedules note events ~120ms into the future on the audio clock), so
   the groove does not stutter when a frame is slow.

   No audio files. Every sound here is synthesised at runtime.
   ===================================================================== */
(function () {
  'use strict';

  var RA = window.RA;
  var A = RA.audio = {};

  var ctx = null;
  var master = null, musicBus = null, sfxBus = null;
  var noiseBuf = null;
  var pulseWaves = {};

  A.musicOn = true;
  A.sfxOn = true;
  A.ready = false;

  /* ------------------------------------------------------------ setup */
  A.init = function () {
    if (ctx) { resume(); return true; }
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    try { ctx = new Ctor(); } catch (e) { return false; }

    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(ctx.destination);

    musicBus = ctx.createGain();
    musicBus.gain.value = A.musicOn ? 0.55 : 0;
    musicBus.connect(master);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = A.sfxOn ? 0.9 : 0;
    sfxBus.connect(master);

    /* one second of white noise, reused by every drum hit */
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    A.ready = true;
    resume();
    if (pendingSong) A.music(pendingSong);
    return true;
  };

  function resume() {
    if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
  }
  A.resume = resume;

  /* Pulse wave for a given duty cycle, cached. */
  function pulseWave(duty) {
    var key = duty.toFixed(3);
    if (pulseWaves[key]) return pulseWaves[key];
    var n = 24;
    var real = new Float32Array(n);
    var imag = new Float32Array(n);
    for (var k = 1; k < n; k++) {
      imag[k] = (2 / (k * Math.PI)) * Math.sin(Math.PI * k * duty);
    }
    var w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    pulseWaves[key] = w;
    return w;
  }

  /* ------------------------------------------------------------ notes */
  var SEMI = { 'C': 0, 'C#': 1, 'DB': 1, 'D': 2, 'D#': 3, 'EB': 3, 'E': 4, 'F': 5,
               'F#': 6, 'GB': 6, 'G': 7, 'G#': 8, 'AB': 8, 'A': 9, 'A#': 10, 'BB': 10, 'B': 11 };
  var freqCache = {};

  function noteFreq(name) {
    if (freqCache[name] !== undefined) return freqCache[name];
    var m = /^([A-Ga-g][#b]?)(-?\d)$/.exec(name);
    if (!m) { freqCache[name] = 0; return 0; }
    var semi = SEMI[m[1].toUpperCase()];
    if (semi === undefined) { freqCache[name] = 0; return 0; }
    var midi = (parseInt(m[2], 10) + 1) * 12 + semi;
    var f = 440 * Math.pow(2, (midi - 69) / 12);
    freqCache[name] = f;
    return f;
  }
  A.noteFreq = noteFreq;

  /* ------------------------------------------------------- voice: tone */
  function voice(opts) {
    if (!ctx) return;
    var t0 = opts.time !== undefined ? opts.time : ctx.currentTime;
    var dur = opts.dur || 0.15;
    var vol = opts.vol !== undefined ? opts.vol : 0.2;
    var bus = opts.bus || sfxBus;

    var osc = ctx.createOscillator();
    if (opts.type === 'pulse') {
      osc.setPeriodicWave(pulseWave(opts.duty || 0.5));
    } else {
      osc.type = opts.type || 'square';
    }

    osc.frequency.setValueAtTime(Math.max(20, opts.freq), t0);
    if (opts.to) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + dur);
    }
    if (opts.vibrato) {
      var lfo = ctx.createOscillator();
      var lg = ctx.createGain();
      lfo.frequency.value = opts.vibrato.rate || 6;
      lg.gain.value = opts.vibrato.depth || 4;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(t0); lfo.stop(t0 + dur + 0.05);
    }

    var g = ctx.createGain();
    var atk = opts.attack !== undefined ? opts.attack : 0.006;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(g);
    g.connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /* ------------------------------------------------------ voice: noise */
  function noise(opts) {
    if (!ctx || !noiseBuf) return;
    var t0 = opts.time !== undefined ? opts.time : ctx.currentTime;
    var dur = opts.dur || 0.08;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;

    var filt = ctx.createBiquadFilter();
    filt.type = opts.filter || 'highpass';
    filt.frequency.setValueAtTime(opts.freq || 4000, t0);
    if (opts.to) filt.frequency.exponentialRampToValueAtTime(Math.max(60, opts.to), t0 + dur);
    filt.Q.value = opts.q || 1;

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(opts.vol !== undefined ? opts.vol : 0.2, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(filt); filt.connect(g); g.connect(opts.bus || sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  /* ------------------------------------------------------------- drums */
  function drum(kind, time, bus, vol) {
    var v = vol === undefined ? 1 : vol;
    if (kind === 'K') {
      voice({ type: 'sine', freq: 150, to: 45, dur: 0.14, vol: 0.5 * v, time: time, bus: bus, attack: 0.002 });
      noise({ freq: 300, dur: 0.03, vol: 0.12 * v, time: time, bus: bus, filter: 'lowpass' });
    } else if (kind === 'S') {
      noise({ freq: 2200, dur: 0.12, vol: 0.24 * v, time: time, bus: bus, filter: 'bandpass', q: 0.8 });
      voice({ type: 'triangle', freq: 210, to: 150, dur: 0.07, vol: 0.14 * v, time: time, bus: bus });
    } else if (kind === 'H') {
      noise({ freq: 8500, dur: 0.035, vol: 0.11 * v, time: time, bus: bus, filter: 'highpass' });
    } else if (kind === 'O') {                       // open hat
      noise({ freq: 7200, dur: 0.16, vol: 0.09 * v, time: time, bus: bus, filter: 'highpass' });
    }
  }

  /* ===================================================================
     SONGS
     Each track's note list loops independently, so a 16-step drum
     pattern sits happily under a 32-step melody.
     '.' = rest, '-' = hold (treated as rest so the previous note rings).
     =================================================================== */
  function S(str) { return str.trim().split(/\s+/); }

  var SONGS = {

    /* Warm, welcoming, C major. The tune you hear on the hub screen. */
    hub: {
      bpm: 126,
      tracks: [
        { type: 'pulse', duty: 0.25, vol: 0.15, gate: 0.85, notes: S(
          'E5 . G5 . A5 .  G5 .  E5 . D5 .  C5 .  D5 . \
           E5 . G5 . C6 .  B5 .  A5 . G5 .  E5 .  D5 . \
           C5 . E5 . G5 .  A5 .  G5 . E5 .  D5 .  E5 . \
           F5 . A5 . C6 .  A5 .  G5 . F5 .  E5 .  D5 . ') },
        { type: 'pulse', duty: 0.5, vol: 0.07, gate: 0.9, notes: S(
          'C5 . . . E5 . . . G4 . . . B4 . . . \
           A4 . . . C5 . . . F4 . . . G4 . . . ') },
        { type: 'triangle', vol: 0.22, gate: 0.7, notes: S(
          'C3 . C3 . G2 . G2 .  A2 . A2 . F2 . F2 . ') },
        { type: 'noise', vol: 0.9, notes: S('K . H . S . H . K . H . S . H O') }
      ]
    },

    /* Bouncy and quick — orchard catching. */
    catch: {
      bpm: 150,
      tracks: [
        { type: 'pulse', duty: 0.125, vol: 0.14, gate: 0.7, notes: S(
          'F5 . A5 C6 A5 . F5 .  G5 . B5 D6 B5 . G5 . \
           A5 . C6 F6 C6 . A5 .  G5 . E5 . D5 . C5 . ') },
        { type: 'triangle', vol: 0.24, gate: 0.6, notes: S(
          'F2 . F2 . C3 . F2 .  G2 . G2 . D3 . G2 . \
           A2 . A2 . E3 . A2 .  C3 . C3 . G2 . G2 . ') },
        { type: 'noise', vol: 1, notes: S('K . H H S . H K K . H H S . H O') }
      ]
    },

    /* Slow, soft, no kick — for card matching where you want to think. */
    memory: {
      bpm: 92,
      tracks: [
        { type: 'triangle', vol: 0.17, gate: 0.95, notes: S(
          'A4 . . . C5 . . .  E5 . . . D5 . . . \
           C5 . . . A4 . . .  G4 . . . A4 . . . ') },
        { type: 'pulse', duty: 0.5, vol: 0.055, gate: 0.98, notes: S(
          'A3 . . . . . . .  F3 . . . . . . . \
           C4 . . . . . . .  G3 . . . . . . . ') },
        { type: 'triangle', vol: 0.19, gate: 0.8, notes: S(
          'A2 . . . . . . .  F2 . . . . . . . \
           C3 . . . . . . .  G2 . . . . . . . ') },
        { type: 'noise', vol: 0.45, notes: S('. . H . . . H . . . H . . . H .') }
      ]
    },

    /* Curious and skippy — bubble maths. */
    maths: {
      bpm: 132,
      tracks: [
        { type: 'pulse', duty: 0.25, vol: 0.14, gate: 0.6, notes: S(
          'G4 B4 D5 B4  G5 . D5 .  E5 . C5 .  D5 . B4 . \
           C5 E5 G5 E5  A5 . E5 .  F5 . D5 .  G4 . B4 . ') },
        { type: 'triangle', vol: 0.22, gate: 0.7, notes: S(
          'G2 . . . D3 . . .  E3 . . . C3 . . . ') },
        { type: 'noise', vol: 0.85, notes: S('K . H . S . H H K . H . S . O .') }
      ]
    },

    /* Rising and adventurous — the endless climb. */
    hopper: {
      bpm: 144,
      tracks: [
        { type: 'pulse', duty: 0.25, vol: 0.135, gate: 0.65, notes: S(
          'D5 . F5 . A5 .  D6 .  C6 . A5 . F5 .  A5 . \
           Bb5 . G5 . D5 . G5 .  A5 . C6 . D6 .  A5 . ') },
        { type: 'pulse', duty: 0.125, vol: 0.06, gate: 0.5, notes: S(
          'D6 . . . A5 . . .  F6 . . . C6 . . . ') },
        { type: 'triangle', vol: 0.25, gate: 0.55, notes: S(
          'D2 D2 . D2 A2 . D2 .  Bb2 Bb2 . Bb2 F2 . Bb2 . ') },
        { type: 'noise', vol: 1, notes: S('K H S H K H S H K H S H K S O H') }
      ]
    },

    /* Light mystery — hedges and hidden stars. */
    maze: {
      bpm: 112,
      tracks: [
        { type: 'pulse', duty: 0.5, vol: 0.11, gate: 0.75, notes: S(
          'A4 . E5 . C5 .  B4 .  A4 . G4 . E4 .  G4 . \
           F4 . C5 . A4 .  G4 .  E4 . D4 . E4 .  A4 . ') },
        { type: 'triangle', vol: 0.23, gate: 0.65, notes: S(
          'A2 . . A2 E2 . . .  F2 . . F2 C2 . . . ') },
        { type: 'noise', vol: 0.6, notes: S('. . H . K . H . . . H . S . H .') }
      ]
    },

    /* Ambient, driftier, no drums — for painting. */
    paint: {
      bpm: 78,
      tracks: [
        { type: 'triangle', vol: 0.15, gate: 1, notes: S(
          'C5 . E5 . G5 . B5 .  A5 . G5 . E5 . D5 . \
           F5 . A5 . C6 . A5 .  G5 . E5 . C5 . D5 . ') },
        { type: 'pulse', duty: 0.5, vol: 0.05, gate: 1, notes: S(
          'C4 . . . . . . .  F4 . . . . . . . \
           A3 . . . . . . .  G3 . . . . . . . ') },
        { type: 'triangle', vol: 0.16, gate: 0.9, notes: S(
          'C2 . . . . . . .  F2 . . . . . . . \
           A2 . . . . . . .  G2 . . . . . . . ') }
      ]
    }
  };

  A.SONGS = SONGS;

  /* -------------------------------------------------------- sequencer */
  var song = null, songName = null, pendingSong = null;
  var step = 0, nextTime = 0, timer = null;
  var LOOKAHEAD_MS = 25;
  var SCHEDULE_AHEAD = 0.13;

  A.music = function (name) {
    if (songName === name) return;
    if (!ctx) { pendingSong = name; songName = name; return; }
    songName = name;
    pendingSong = null;
    song = SONGS[name] || null;
    step = 0;
    nextTime = ctx.currentTime + 0.08;
    if (timer) clearInterval(timer);
    if (!song) return;
    timer = setInterval(tick, LOOKAHEAD_MS);
    tick();
  };

  A.stopMusic = function () {
    songName = null; song = null; pendingSong = null;
    if (timer) { clearInterval(timer); timer = null; }
  };

  A.currentSong = function () { return songName; };

  function tick() {
    if (!ctx || !song) return;
    var stepDur = 60 / song.bpm / 2;                 // eighth notes
    while (nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(step, nextTime, stepDur);
      nextTime += stepDur;
      step++;
    }
  }

  function scheduleStep(idx, time, stepDur) {
    if (!A.musicOn) return;
    for (var t = 0; t < song.tracks.length; t++) {
      var tr = song.tracks[t];
      var tok = tr.notes[idx % tr.notes.length];
      if (!tok || tok === '.' || tok === '-') continue;

      if (tr.type === 'noise') {
        drum(tok, time, musicBus, tr.vol);
        continue;
      }
      var f = noteFreq(tok);
      if (!f) continue;
      voice({
        type: tr.type === 'triangle' ? 'triangle' : 'pulse',
        duty: tr.duty || 0.5,
        freq: f,
        dur: stepDur * (tr.gate || 0.8),
        vol: tr.vol,
        time: time,
        bus: musicBus,
        attack: 0.005
      });
    }
  }

  /* --------------------------------------------------------- toggles */
  A.setMusic = function (on) {
    A.musicOn = !!on;
    if (musicBus && ctx) {
      musicBus.gain.cancelScheduledValues(ctx.currentTime);
      musicBus.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.05);
    }
  };
  A.setSfx = function (on) {
    A.sfxOn = !!on;
    if (sfxBus && ctx) sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.02);
  };

  /* Briefly duck the music so a fanfare cuts through. */
  function duck(seconds) {
    if (!musicBus || !ctx || !A.musicOn) return;
    var now = ctx.currentTime;
    musicBus.gain.cancelScheduledValues(now);
    musicBus.gain.setTargetAtTime(0.18, now, 0.03);
    musicBus.gain.setTargetAtTime(0.55, now + seconds, 0.15);
  }

  /* ============================ SFX ================================ */
  var SFX = {
    select: function (t) { voice({ type: 'pulse', duty: .25, freq: 660, dur: .07, vol: .2, time: t });
                           voice({ type: 'pulse', duty: .25, freq: 990, dur: .08, vol: .16, time: t + .05 }); },
    back:   function (t) { voice({ type: 'pulse', duty: .25, freq: 520, dur: .08, vol: .18, time: t });
                           voice({ type: 'pulse', duty: .25, freq: 350, dur: .1, vol: .15, time: t + .05 }); },
    move:   function (t) { voice({ type: 'pulse', duty: .5, freq: 800, dur: .035, vol: .1, time: t }); },
    coin:   function (t) { voice({ type: 'pulse', duty: .25, freq: 988, dur: .06, vol: .2, time: t });
                           voice({ type: 'pulse', duty: .25, freq: 1319, dur: .17, vol: .18, time: t + .055 }); },
    star:   function (t) { [784, 1047, 1319, 1568].forEach(function (f, i) {
                             voice({ type: 'pulse', duty: .25, freq: f, dur: .13, vol: .17, time: t + i * .05 }); }); },
    jump:   function (t) { voice({ type: 'pulse', duty: .25, freq: 300, to: 780, dur: .13, vol: .2, time: t }); },
    bounce: function (t) { voice({ type: 'pulse', duty: .125, freq: 400, to: 1200, dur: .16, vol: .22, time: t }); },
    land:   function (t) { voice({ type: 'triangle', freq: 260, to: 130, dur: .07, vol: .18, time: t });
                           noise({ freq: 900, dur: .04, vol: .08, time: t, filter: 'lowpass' }); },
    pop:    function (t) { voice({ type: 'sine', freq: 1050, to: 260, dur: .13, vol: .24, time: t });
                           noise({ freq: 3000, dur: .05, vol: .08, time: t }); },
    flip:   function (t) { noise({ freq: 5000, to: 1800, dur: .06, vol: .1, time: t });
                           voice({ type: 'pulse', duty: .5, freq: 500, dur: .05, vol: .09, time: t }); },
    match:  function (t) { [659, 880, 1109].forEach(function (f, i) {
                             voice({ type: 'pulse', duty: .25, freq: f, dur: .16, vol: .17, time: t + i * .06 }); }); },
    correct:function (t) { [523, 659, 784, 1047].forEach(function (f, i) {
                             voice({ type: 'pulse', duty: .25, freq: f, dur: .18, vol: .17, time: t + i * .055 }); }); },
    wrong:  function (t) { voice({ type: 'pulse', duty: .5, freq: 240, to: 150, dur: .18, vol: .16, time: t });
                           voice({ type: 'pulse', duty: .5, freq: 180, to: 110, dur: .2, vol: .12, time: t + .07 }); },
    hurt:   function (t) { voice({ type: 'pulse', duty: .125, freq: 420, to: 90, dur: .28, vol: .22, time: t });
                           noise({ freq: 1600, to: 300, dur: .18, vol: .14, time: t, filter: 'bandpass' }); },
    powerup:function (t) { [523, 622, 784, 932, 1047].forEach(function (f, i) {
                             voice({ type: 'pulse', duty: .25, freq: f, dur: .12, vol: .16, time: t + i * .045 }); }); },
    step:   function (t) { noise({ freq: 2400, dur: .025, vol: .06, time: t }); },
    whoosh: function (t) { noise({ freq: 400, to: 4000, dur: .22, vol: .09, time: t, filter: 'bandpass', q: 1.6 }); },
    draw:   function (t) { noise({ freq: 6000, dur: .02, vol: .045, time: t }); },
    tick:   function (t) { voice({ type: 'pulse', duty: .5, freq: 1200, dur: .03, vol: .09, time: t }); },
    unlock: function (t) { duck(1.1);
                           [659, 784, 988, 1319, 1568].forEach(function (f, i) {
                             voice({ type: 'pulse', duty: .25, freq: f, dur: .22, vol: .2, time: t + i * .085 }); }); },
    win:    function (t) { duck(1.8);
                           var mel = [[523,0],[659,.11],[784,.22],[1047,.33],[880,.5],[1047,.62],[1319,.78]];
                           mel.forEach(function (m) {
                             voice({ type: 'pulse', duty: .25, freq: m[0], dur: .26, vol: .2, time: t + m[1] });
                             voice({ type: 'triangle', freq: m[0] / 2, dur: .26, vol: .14, time: t + m[1] });
                           });
                           drum('S', t + .5, sfxBus, .8); drum('S', t + .62, sfxBus, .8); },
    lose:   function (t) { duck(1.2);
                           [[440,0],[392,.16],[349,.32],[262,.48]].forEach(function (m) {
                             voice({ type: 'pulse', duty: .5, freq: m[0], dur: .3, vol: .18, time: t + m[1] }); }); },
    countdown: function (t) { voice({ type: 'pulse', duty: .25, freq: 700, dur: .12, vol: .2, time: t }); },
    go:     function (t) { voice({ type: 'pulse', duty: .25, freq: 1047, dur: .3, vol: .24, time: t });
                           voice({ type: 'pulse', duty: .25, freq: 1568, dur: .3, vol: .18, time: t + .02 }); }
  };

  A.sfx = function (name) {
    if (!A.sfxOn) return;
    if (!ctx) { A.init(); if (!ctx) return; }
    resume();
    var fn = SFX[name];
    if (fn) fn(ctx.currentTime + 0.001);
  };

})();
