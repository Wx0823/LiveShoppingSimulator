import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicPlayer, createScore, MUSIC_BPM, MUSIC_BARS } from '../src/music.mjs';

function audioHarness({ delayedResume = false } = {}) {
  const starts = [], stops = [], ramps = [], timers = new Map();
  let created = 0, timerId = 0, finishResume;
  const param = () => ({
    value: 0, cancelAndHoldAtTime() {}, cancelScheduledValues() {}, setValueAtTime() {},
    linearRampToValueAtTime(value, time) { ramps.push({ value, time }); }, exponentialRampToValueAtTime() {},
  });
  const node = () => ({
    connect() {}, disconnect() {}, gain: param(), frequency: param(), Q: param(),
    threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(),
    start(time) { starts.push(time); }, stop(time) { stops.push(time); },
  });
  const context = {
    currentTime: 0, sampleRate: 8000, state: 'suspended', destination: {},
    createGain: node, createBiquadFilter: node, createDynamicsCompressor: node,
    createOscillator: node, createBufferSource: node,
    createBuffer(channels, length) { return { getChannelData: () => new Float32Array(length) }; },
    resume() {
      if (delayedResume) return new Promise(resolve => { finishResume = () => { context.state = 'running'; resolve(); }; });
      context.state = 'running'; return Promise.resolve();
    },
    close() { context.state = 'closed'; return Promise.resolve(); },
  };
  const player = createMusicPlayer({
    createContext() { created++; return context; },
    setInterval(callback, milliseconds) { assert.equal(milliseconds, 25); timers.set(++timerId, callback); return timerId; },
    clearInterval(id) { timers.delete(id); },
  });
  return { player, context, starts, stops, ramps, timers, created: () => created, finishResume: () => finishResume(),
    tick(time) { context.currentTime = time; for (const callback of timers.values()) callback(); },
  };
}

test('original score covers exactly 16 bars with legal C-major pitched notes and varied phrases', () => {
  const score = createScore();
  assert.equal(score.bpm, MUSIC_BPM);
  assert.equal(score.bars, MUSIC_BARS);
  assert.equal(score.beats, 64);
  assert.equal(score.seconds, 64 * 60 / 118);
  const pitchClasses = new Set([0, 2, 4, 5, 7, 9, 11]);
  const percussion = new Set(['kick', 'brush', 'hat']);
  let lastBeat = -1;
  for (const event of score.events) {
    assert.ok(event.beat >= lastBeat && event.beat >= 0 && event.beat < score.beats);
    assert.ok(event.duration > 0 && event.beat + event.duration <= score.beats);
    assert.ok(event.velocity > 0 && event.velocity <= 1);
    assert.ok(Number.isInteger(event.note) && event.note >= 0 && event.note <= 127);
    if (!percussion.has(event.kind)) assert.ok(pitchClasses.has(event.note % 12));
    lastBeat = event.beat;
  }
  assert.equal(new Set(score.events.map(event => event.kind)).size, 7);
  assert.ok(new Set(score.events.filter(event => event.kind === 'melody').map(event => event.note)).size >= 8);
  assert.notDeepEqual(score.events.filter(event => event.kind === 'melody' && event.beat < 32),
    score.events.filter(event => event.kind === 'melody' && event.beat >= 32).map(event => ({ ...event, beat: event.beat - 32 })));
  assert.deepEqual(createScore(), score, 'composition is reproducible');
});

test('music stays lazy and repeated concurrent unlocks share one context and one scheduler', async () => {
  const h = audioHarness({ delayedResume: true });
  h.player.setVolume(.42); h.player.setDucked(true);
  assert.equal(h.created(), 0); assert.equal(h.player.getStatus().playing, false);
  const first = h.player.unlock(), second = h.player.unlock();
  assert.equal(h.created(), 1);
  h.finishResume();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(h.timers.size, 1);
  assert.equal(h.player.getStatus().playing, true);
  assert.equal(h.ramps.at(-1).value, .42 * .23 * .38);
  h.player.destroy(); assert.equal(h.timers.size, 0); assert.equal(h.context.state, 'closed');
});

test('pause, mute and resume cancel queued voices, preserve progress, and avoid catch-up bursts', async () => {
  const h = audioHarness(); await h.player.unlock();
  h.tick(.5); h.player.setPaused(true);
  assert.equal(h.timers.size, 0); assert.equal(h.player.getStatus().playing, false);
  assert.ok(h.stops.includes(.54));
  h.context.currentTime = 100;
  const beforeResume = h.starts.length;
  h.player.setPaused(false); h.tick(100.1);
  assert.ok(h.starts.length - beforeResume < 25, 'resume must not schedule 100 seconds of missed notes');
  assert.ok(h.starts.slice(beforeResume).every(time => time >= 100 && time <= 100.2));
  const beforeStall = h.starts.length;
  h.tick(1000);
  assert.ok(h.starts.length - beforeStall < 25, 'a stalled timer only schedules its current horizon');
  h.player.setEnabled(false); assert.equal(h.timers.size, 0);
  h.player.setEnabled(true); assert.equal(h.timers.size, 1);
  h.player.destroy(); h.player.destroy(); assert.equal(h.player.getStatus().playing, false);
  assert.equal(await h.player.unlock(), false);
});

test('loop boundary schedules the next downbeat without resetting the audio clock', async () => {
  const h = audioHarness(); await h.player.unlock();
  const nextLoop = .045 + createScore().seconds;
  const before = h.starts.length;
  h.tick(nextLoop - .04);
  assert.ok(h.starts.slice(before).some(time => Math.abs(time - nextLoop) < .00001));
  assert.equal(h.timers.size, 1);
  h.player.destroy();
});

test('unsupported audio, out-of-range volume and destroy during resume are safe', async () => {
  const unavailable = createMusicPlayer({ createContext: () => null });
  assert.equal(await unavailable.unlock(), false);
  unavailable.setVolume(2); assert.equal(unavailable.getStatus().volume, 1);
  unavailable.setVolume(-1); assert.equal(unavailable.getStatus().volume, 0);
  unavailable.setVolume(NaN); assert.equal(unavailable.getStatus().volume, 0);
  unavailable.destroy();
  const h = audioHarness({ delayedResume: true });
  const pending = h.player.unlock(); h.player.destroy(); h.finishResume();
  assert.equal(await pending, false); assert.equal(h.timers.size, 0);
});
