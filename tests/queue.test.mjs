import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, enqueue, advanceQueue, beginQueuedOpening, readyQueuedOpening, settle, hydrate, getItem, buy } from '../src/game.mjs';

const roundTrip = state => hydrate(JSON.parse(JSON.stringify(state)));

test('enqueue charges once and fixes the paid item without revealing it in purchase history', () => {
  const initial = createGame();
  const snapshot = JSON.stringify(initial);
  let rolls = 0;
  const queued = enqueue(initial, 'forest', () => { rolls++; return .99; }, 5, 3);
  assert.equal(JSON.stringify(initial), snapshot, 'enqueue is a pure state transition');
  assert.equal(rolls, 1);
  assert.equal(queued.coins, 940);
  assert.equal(queued.opened, 1);
  assert.deepEqual(queued.pending, { id: 'box-1', itemId: 'forest-legendary', seriesId: 'forest', boxNumber: 5, status: 'queued', queueAhead: 3 });
  assert.ok(queued.history[0].text.includes('队列'));
  assert.ok(!queued.history[0].text.includes(getItem(queued.pending.itemId).name));
  assert.throws(() => enqueue(queued, 'street', () => { rolls++; return 0; }), /先处理/);
  assert.equal(rolls, 1, 'duplicate purchase must not roll again');
  for (const action of ['keep', 'sell']) assert.throws(() => settle(queued, action), /等待主播/);
});

test('queue advances one order at a time, never redraws or charges, and settles exactly once', () => {
  let state = enqueue(createGame(), 'street', () => .9, 2, 3);
  const itemId = state.pending.itemId;
  for (const remaining of [2, 1, 0]) {
    const before = JSON.stringify(state);
    assert.throws(() => beginQueuedOpening(state), /还没轮到/);
    const next = advanceQueue(state);
    assert.equal(JSON.stringify(state), before);
    state = next;
    assert.equal(state.pending.queueAhead, remaining);
    assert.equal(state.pending.itemId, itemId);
    assert.equal(state.coins, 1100);
    assert.equal(state.opened, 1);
  }
  assert.throws(() => advanceQueue(state), /没有可推进/);
  assert.throws(() => readyQueuedOpening(state), /尚未开始/);
  state = beginQueuedOpening(state);
  assert.equal(state.pending.status, 'opening');
  for (const action of ['keep', 'sell']) assert.throws(() => settle(state, action), /等待主播/);
  assert.throws(() => advanceQueue(state), /没有可推进/);
  state = readyQueuedOpening(state);
  assert.equal(state.pending.status, 'ready');
  const kept = settle(state, 'keep');
  assert.deepEqual(kept.inventory, [{ id: 'box-1', itemId, seriesId: 'street', boxNumber: 2 }]);
  assert.equal(kept.coins, 1100);
  assert.equal(kept.pending, null);
  assert.throws(() => settle(kept, 'keep'), /没有等待/);
  const sold = settle(state, 'sell');
  assert.equal(sold.coins, 1100 + getItem(itemId).value);
  assert.equal(sold.sold, 1);
  assert.throws(() => settle(sold, 'sell'), /没有等待/);
});

test('save/load preserves paid item, balance, identity and exact queue progress in every phase', () => {
  let state = enqueue(createGame(), 'cosmos', () => .99, 6, 3);
  const itemId = state.pending.itemId;
  for (let ahead = 3; ahead >= 0; ahead--) {
    state = roundTrip(state);
    assert.equal(state.pending.queueAhead, ahead);
    assert.equal(state.pending.itemId, itemId);
    assert.equal(state.coins, 600);
    assert.equal(state.pending.id, 'box-1');
    if (ahead > 0) state = advanceQueue(state);
  }
  for (const transition of [beginQueuedOpening, readyQueuedOpening]) {
    state = transition(state);
    assert.deepEqual(roundTrip(state), state);
    assert.equal(state.pending.itemId, itemId);
  }
  assert.deepEqual(roundTrip(settle(state, 'keep')).inventory[0], { id: 'box-1', itemId, seriesId: 'cosmos', boxNumber: 6 });
});

test('invalid positions and impossible saved queue phases are rejected', () => {
  for (const ahead of [-1, 4, .5, NaN, Infinity, '2', null]) {
    assert.throws(() => enqueue(createGame(), 'street', () => 0, 1, ahead), /排队位置/);
  }
  for (const patch of [
    { status: 'finished' }, { status: null }, { status: '' }, { queueAhead: -1 }, { queueAhead: 4 },
    { queueAhead: .5 }, { queueAhead: '1' }, { queueAhead: null }, { queueAhead: undefined },
    { status: 'opening', queueAhead: 1 }, { status: 'ready', queueAhead: 3 }, { status: undefined, queueAhead: 0 },
  ]) {
    const state = enqueue(createGame(), 'street', () => 0);
    Object.assign(state.pending, patch);
    assert.throws(() => hydrate(state), /存档数据损坏/, JSON.stringify(patch));
  }
  const zero = enqueue(createGame(), 'street', () => 0, 1, 0);
  assert.equal(beginQueuedOpening(zero).pending.status, 'opening');
});

test('music settings validate independently and v0.2 settings/pending saves remain compatible', () => {
  for (const patch of [{ music: 'true' }, { music: 1 }, { music: null }, { musicVolume: -0.01 },
    { musicVolume: 1.01 }, { musicVolume: NaN }, { musicVolume: Infinity }, { musicVolume: '0.5' }, { musicVolume: null }]) {
    const state = createGame(); Object.assign(state.settings, patch);
    assert.throws(() => hydrate(state), /存档数据损坏/);
  }
  const state = createGame(); state.settings = { sound: false, fast: true, music: false, musicVolume: 0 };
  assert.deepEqual(roundTrip(state).settings, state.settings);
  state.settings.musicVolume = 1;
  assert.deepEqual(roundTrip(state).settings, state.settings);
  const legacy = buy(createGame(), 'street', () => .65, 3);
  legacy.settings = { sound: false, fast: true };
  const restored = roundTrip(legacy);
  assert.deepEqual(restored.settings, { sound: false, fast: true, music: true, musicVolume: .35 });
  assert.deepEqual(restored.pending, legacy.pending);
  assert.equal(settle(restored, 'keep').inventory[0].itemId, 'street-rare');
});
