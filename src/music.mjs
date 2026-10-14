// Original instrumental: “拆播间 · 拆袋好心情”. No samples or network assets.
export const MUSIC_BPM = 118;
export const MUSIC_BARS = 16;
const BEAT_SECONDS = 60 / MUSIC_BPM;
const LOOP_BEATS = MUSIC_BARS * 4;

/** A deterministic, original 16-bar score. Times/durations are measured in beats. */
export function createScore() {
  const events = [];
  const add = (kind, beat, note, duration, velocity) => events.push({ kind, beat, note, duration, velocity });
  const chords = [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 64]];
  const melodies = [
    [[0, 76, .45], [.75, 79, .45], [1.5, 81, .7], [2.5, 79, .45], [3.25, 76, .5]],
    [[0, 72, .65], [1, 76, .45], [1.75, 79, .65], [3, 76, .7]],
    [[.5, 77, .5], [1.25, 76, .45], [2, 72, .7], [3, 69, .6]],
    [[0, 71, .45], [.75, 74, .6], [2, 79, .65], [3.25, 74, .5]],
    [[0, 76, .45], [.75, 79, .45], [1.5, 84, .75], [2.75, 83, .4], [3.5, 79, .4]],
    [[.25, 81, .6], [1.25, 79, .5], [2, 76, .6], [3, 72, .6]],
    [[0, 77, .6], [1, 81, .5], [1.75, 79, .5], [2.5, 77, .6]],
    [[.5, 74, .6], [1.5, 71, .6], [2.75, 67, .9]],
  ];
  for (let bar = 0; bar < MUSIC_BARS; bar++) {
    const base = bar * 4;
    const chord = chords[bar % 4];
    // Soft offbeat finger-strums: each string arrives 18 ms after the last.
    for (const beat of [.5, 1.75, 2.5, 3.5]) {
      chord.forEach((note, i) => add('chord', base + beat + i * .035, note, .34, .24));
    }
    add('bass', base, chord[0] - 12, .8, .66);
    add('bass', base + 1.5, chord[0] - 12, .4, .39);
    add('bass', base + 2, chord[2] - 12, .75, .48);
    add('bass', base + 3.5, chord[0] - 12, .35, .36);
    for (const beat of [0, 2]) add('kick', base + beat, 36, .3, .48);
    for (const beat of [1, 3]) add('brush', base + beat, 38, .22, .25);
    for (let step = 0; step < 8; step++) add('hat', base + step * .5 + (step % 2 ? .035 : 0), 42, .08, step % 2 ? .16 : .10);
    const phrase = melodies[bar % 8];
    for (const [beat, note, duration] of phrase) {
      // Second half answers the motif more quietly, with space in bars 12/16.
      if (bar >= 8 && bar % 4 === 3 && beat < 1) continue;
      add('melody', base + beat, note, duration, bar < 8 ? .57 : .49);
    }
    if (bar === 6 || bar === 14) {
      add('sparkle', base + 3, 84, .38, .14);
      add('sparkle', base + 3.5, 88, .38, .10);
    }
  }
  return { bpm: MUSIC_BPM, bars: MUSIC_BARS, beats: LOOP_BEATS, seconds: LOOP_BEATS * BEAT_SECONDS, events: events.sort((a, b) => a.beat - b.beat) };
}

const SCORE = createScore();
const frequency = note => 440 * 2 ** ((note - 69) / 12);
const clamp = (value, fallback) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

/**
 * Audio starts only after unlock(). Host owns interaction/visibility listeners.
 * Optional dependencies support deterministic lifecycle tests without an audio device.
 */
export function createMusicPlayer(dependencies = {}) {
  let context, master, tone, compressor, noise;
  let enabled = true, volume = .35, paused = false, ducked = false;
  let unlocked = false, destroyed = false, unlocking = null, timer = null;
  let position = 0, epoch = 0, cursor = 0;
  const voices = new Set();
  const every = dependencies.setInterval || globalThis.setInterval.bind(globalThis);
  const clear = dependencies.clearInterval || globalThis.clearInterval.bind(globalThis);
  const makeContext = dependencies.createContext || (() => {
    const Constructor = globalThis.AudioContext || globalThis.webkitAudioContext;
    return Constructor ? new Constructor() : null;
  });

  function gainTo(target, seconds = .08) {
    if (!master || !context) return;
    const now = context.currentTime;
    // cancelAndHold keeps the instantaneous ramp value, avoiding a click on fast toggles.
    if (master.gain.cancelAndHoldAtTime) master.gain.cancelAndHoldAtTime(now);
    else {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
    }
    master.gain.linearRampToValueAtTime(target, now + seconds);
  }
  function targetGain() { return volume * (ducked ? .23 : 1) * .38; }

  function makeGraph() {
    master = context.createGain(); master.gain.value = 0;
    tone = context.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 5600; tone.Q.value = .5;
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18; compressor.knee.value = 18; compressor.ratio.value = 2;
    compressor.attack.value = .008; compressor.release.value = .16;
    master.connect(tone); tone.connect(compressor); compressor.connect(context.destination);
    noise = context.createBuffer(1, Math.ceil(context.sampleRate * .4), context.sampleRate);
    const samples = noise.getChannelData(0);
    let seed = 71329;
    for (let i = 0; i < samples.length; i++) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      samples[i] = (seed / 4294967296) * 2 - 1;
    }
  }

  function voice(event, when) {
    const nodes = [];
    const sources = [];
    const envelope = context.createGain(); nodes.push(envelope);
    const length = event.duration * BEAT_SECONDS;
    const level = event.velocity;
    let end = when + length + .15;
    const connectOscillator = (type, hz, weight = 1) => {
      const oscillator = context.createOscillator(); oscillator.type = type;
      oscillator.frequency.setValueAtTime(hz, when);
      const gain = context.createGain(); gain.gain.value = weight;
      oscillator.connect(gain); gain.connect(envelope);
      sources.push(oscillator); nodes.push(oscillator, gain);
      return oscillator;
    };
    if (event.kind === 'hat' || event.kind === 'brush') {
      const source = context.createBufferSource(); source.buffer = noise;
      const filter = context.createBiquadFilter(); filter.type = 'bandpass';
      filter.frequency.value = event.kind === 'hat' ? 4800 : 1500;
      filter.Q.value = event.kind === 'hat' ? .65 : .45;
      source.connect(filter); filter.connect(envelope);
      sources.push(source); nodes.push(source, filter);
      end = when + length + .03;
    } else if (event.kind === 'kick') {
      const oscillator = connectOscillator('sine', 125);
      oscillator.frequency.exponentialRampToValueAtTime(46, when + .11);
      end = when + .19;
    } else {
      const hz = frequency(event.note);
      if (event.kind === 'bass') {
        connectOscillator('sine', hz, .8); connectOscillator('triangle', hz, .2);
      } else if (event.kind === 'chord') {
        connectOscillator('triangle', hz, .48); connectOscillator('sine', hz * 2, .1);
      } else {
        connectOscillator('sine', hz, .7);
        connectOscillator('sine', hz * 2, .18);
        connectOscillator('sine', hz * 3, .035);
        end += .12;
      }
    }
    envelope.connect(master);
    envelope.gain.setValueAtTime(.0001, when);
    envelope.gain.linearRampToValueAtTime(level, when + .008);
    envelope.gain.exponentialRampToValueAtTime(.0001, end);
    const entry = { sources, nodes };
    voices.add(entry);
    let remaining = sources.length;
    for (const source of sources) {
      source.onended = () => {
        if (--remaining === 0) { nodes.forEach(node => node.disconnect()); voices.delete(entry); }
      };
      source.start(when); source.stop(end + .01);
    }
  }

  function cursorAt(seconds) {
    const loop = Math.floor(Math.max(0, seconds) / SCORE.seconds);
    const beat = (Math.max(0, seconds) - loop * SCORE.seconds) / BEAT_SECONDS;
    const index = SCORE.events.findIndex(event => event.beat >= beat - .00001);
    return index < 0 ? (loop + 1) * SCORE.events.length : loop * SCORE.events.length + index;
  }
  function schedule() {
    if (!context || context.state !== 'running' || !enabled || paused || destroyed) return;
    const now = context.currentTime;
    // Timers may be throttled: skip missed notes rather than play a burst of backlog.
    cursor = Math.max(cursor, cursorAt(Math.max(0, now - epoch - .012)));
    for (;;) {
      const event = SCORE.events[cursor % SCORE.events.length];
      const loop = Math.floor(cursor / SCORE.events.length);
      const when = epoch + loop * SCORE.seconds + event.beat * BEAT_SECONDS;
      if (when > now + .1) break;
      voice(event, Math.max(when, now + .002));
      cursor++;
    }
  }
  function stop() {
    if (timer !== null) {
      clear(timer); timer = null;
      position = Math.max(0, context.currentTime - epoch) % SCORE.seconds;
    }
    gainTo(0, .035);
    for (const entry of voices) {
      for (const source of entry.sources) {
        try { source.stop(context.currentTime + .04); } catch { /* Source already ended. */ }
      }
    }
  }
  function reconcile() {
    if (!context || destroyed) return;
    if (!enabled || paused || !unlocked || context.state !== 'running') { stop(); return; }
    if (timer === null) {
      epoch = context.currentTime + .045 - position;
      cursor = cursorAt(position);
      timer = every(schedule, 25);
      schedule();
    }
    gainTo(targetGain(), ducked ? .10 : .22);
  }

  async function unlock() {
    if (destroyed) return false;
    if (unlocking) return unlocking;
    unlocking = (async () => {
      try {
        if (!context) {
          context = makeContext();
          if (!context) return false;
          makeGraph();
        }
        if (context.state === 'suspended') await context.resume();
        if (destroyed) return false;
        unlocked = context.state === 'running';
        reconcile();
        return unlocked;
      } catch { return false; }
    })();
    try { return await unlocking; } finally { unlocking = null; }
  }

  return {
    unlock,
    setEnabled(value) { enabled = Boolean(value); reconcile(); },
    setVolume(value) { volume = clamp(value, volume); reconcile(); },
    setDucked(value) { ducked = Boolean(value); reconcile(); },
    setPaused(value) { paused = Boolean(value); reconcile(); },
    getStatus() {
      return { enabled, playing: !destroyed && timer !== null && context?.state === 'running', unlocked, volume, paused, ducked };
    },
    destroy() {
      if (destroyed) return;
      stop(); destroyed = true; unlocked = false;
      // close() releases the audio device and every voice even if a tab is suspended.
      if (context) void context.close().catch(() => {});
      voices.clear();
    },
  };
}
