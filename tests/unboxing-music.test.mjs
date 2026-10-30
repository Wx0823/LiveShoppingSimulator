import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnboxingMusic } from '../src/unboxing-music.mjs';

function harness({ suspended = false } = {}) {
  const sources = [], automation = [], timers = new Map(), gains = [], pending = [];
  let created = 0, closed = 0, timerId = 0;
  const parameter = () => ({
    setValueAtTime(value, time) { automation.push({ value, time }); },
    linearRampToValueAtTime(value, time) { automation.push({ value, time }); },
    exponentialRampToValueAtTime(value, time) { automation.push({ value, time }); },
    cancelScheduledValues() {},
  });
  const node = () => ({ disconnected: false, connect() {}, disconnect() { this.disconnected = true; } });
  const context = {
    state: suspended ? 'suspended' : 'running', currentTime: 5, destination: {},
    createGain() { const gain = { ...node(), gain: parameter() }; gains.push(gain); return gain; },
    createOscillator() {
      const source = { ...node(), frequency: parameter(), stops: [],
        start(when) { this.when = when; }, stop(when) { this.stops.push(when); } };
      sources.push(source); return source;
    },
    resume() { return new Promise((resolve, reject) => pending.push({ resolve, reject })); },
    close() { closed++; context.state = 'closed'; return Promise.resolve(); },
  };
  const player = createUnboxingMusic({
    createContext() { created++; return context; },
    setTimeout(callback, ms) { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { player, context, sources, automation, gains, timers, pending,
    created: () => created, closed: () => closed,
    expire() { for (const { callback } of [...timers.values()]) callback(); },
  };
}

test('audio remains lazy for zero duration, silence, invalid values and destroyed player', () => {
  const h = harness();
  for (const options of [{}, { durationMs: 0 }, { durationMs: -1 }, { durationMs: NaN },
    { durationMs: 4500, volume: 0 }, { durationMs: 4500, volume: -2 }, { durationMs: 4500, volume: NaN }]) {
    assert.equal(h.player.start(options), false);
  }
  assert.equal(h.created(), 0);
  h.player.stop(); h.player.destroy(); h.player.destroy();
  assert.equal(h.player.start({ durationMs: 4500 }), false);
  assert.equal(h.created(), 0);
});

test('full and quick scores synchronously schedule pitched melody/accompaniment within exact deadline', () => {
  for (const durationMs of [4500, 620, 1]) {
    const h = harness();
    assert.equal(h.player.start({ durationMs, volume: 2 }), true);
    assert.equal(h.created(), 1);
    assert.ok(h.sources.length >= 7);
    assert.ok(h.sources.some(source => source.type === 'triangle'));
    assert.ok(h.sources.some(source => source.type === 'sine'));
    const deadline = 5 + durationMs / 1000;
    assert.ok(h.automation.every(event => event.time >= 5 && event.time <= deadline));
    assert.ok(h.sources.every(source => source.when >= 5 && source.when < deadline && source.stops[0] <= deadline));
    assert.equal(h.automation[0].value, .5, 'volume clamps to 1');
    assert.equal(h.timers.size, 1);
    assert.equal([...h.timers.values()][0].ms, durationMs);
    if (durationMs === 620) assert.equal(h.sources.length, 7, 'quick opening uses a sparse independent phrase');
    const count = h.sources.length;
    h.expire();
    assert.equal(h.timers.size, 0);
    assert.equal(h.sources.length, count, 'deadline never schedules a loop');
    assert.ok(h.sources.every(source => source.disconnected));
  }
});

test('stop cancels both current and future voices immediately and is idempotent', () => {
  const h = harness(); h.player.start({ durationMs: 4500, volume: .4 });
  h.context.currentTime = 5.15;
  assert.ok(h.sources.some(source => source.when > h.context.currentTime));
  h.player.stop(); h.player.stop();
  assert.equal(h.timers.size, 0);
  assert.ok(h.sources.every(source => source.stops.at(-1) === 5.15 && source.disconnected));
  assert.ok(h.gains.every(gain => gain.disconnected));
});

test('repeat start replaces all earlier audio, keeping one context and deadline', () => {
  const h = harness(); h.player.start({ durationMs: 4500 });
  const firstSources = [...h.sources];
  const obsoleteTimer = [...h.timers.values()][0].callback;
  h.context.currentTime = 6;
  h.player.start({ durationMs: 620, volume: .2 });
  assert.equal(h.created(), 1); assert.equal(h.timers.size, 1);
  assert.ok(firstSources.every(source => source.disconnected && source.stops.at(-1) === 6));
  obsoleteTimer();
  assert.equal(h.timers.size, 1, 'stale cleanup cannot stop replacement');
  assert.ok(h.sources.slice(firstSources.length).every(source => !source.disconnected));
  h.player.destroy(); h.player.destroy();
  assert.equal(h.closed(), 1); assert.equal(h.timers.size, 0);
});

test('late resume never restarts stopped, expired or destroyed playback', async () => {
  for (const finish of ['stop', 'expire', 'destroy']) {
    const h = harness({ suspended: true });
    h.player.start({ durationMs: 620 });
    const count = h.sources.length;
    if (finish === 'expire') h.expire(); else h.player[finish]();
    h.pending[0].resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(h.sources.length, count);
    assert.ok(h.sources.every(source => source.disconnected));
    assert.equal(h.timers.size, 0);
  }
});

test('older resume rejection cannot cancel replacement, current rejection cleans up', async () => {
  const h = harness({ suspended: true });
  h.player.start({ durationMs: 4500 }); h.player.start({ durationMs: 620 });
  h.pending[0].reject(new Error('old resume')); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.timers.size, 1);
  h.pending[1].reject(new Error('no device')); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.timers.size, 0);
  assert.ok(h.sources.every(source => source.disconnected));
});

test('unsupported or failing audio device is safe', () => {
  for (const createContext of [() => null, () => { throw new Error('no device'); }]) {
    const player = createUnboxingMusic({ createContext });
    assert.equal(player.start({ durationMs: 4500 }), false);
    player.stop(); player.destroy();
  }
});
