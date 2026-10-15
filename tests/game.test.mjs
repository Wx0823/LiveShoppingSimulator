import test from 'node:test';
import assert from 'node:assert/strict';
import { SERIES, RARITIES, createGame, buy, settle, sellItem, tickWatch, claimReward, hydrate, getItem, collectionValue } from '../src/game.mjs';

test('new games have independent state and forty-five unique collectibles', () => {
  const a = createGame();
  const b = createGame();
  assert.equal(a.coins, 1200);
  a.inventory.push('test');
  assert.deepEqual(b.inventory, []);
  assert.equal(new Set(SERIES.flatMap(series => series.items.map(item => item.id))).size, 45);
  assert.equal(Object.values(RARITIES).reduce((sum, rarity) => sum + rarity.chance, 0), 100);
});

test('purchase reserves its result immediately without mutating input', () => {
  const before = createGame();
  const snapshot = JSON.stringify(before);
  const after = buy(before, 'wei', () => 0);
  assert.equal(JSON.stringify(before), snapshot);
  assert.equal(after.coins, 1100);
  assert.equal(after.opened, 1);
  assert.equal(after.pending.itemId, SERIES[0].items[0].id);
  assert.deepEqual(after.discovered, [SERIES[0].items[0].id]);
  assert.throws(() => buy(after, 'shu'), /先处理/);
});

test('rarity probability boundaries apply to every series', () => {
  const samples = [[0, 'common'], [0.599999, 'common'], [0.6, 'rare'], [0.879999, 'rare'], [0.88, 'epic'], [0.979999, 'epic'], [0.98, 'legendary'], [0.999999, 'legendary']];
  for (const series of SERIES) {
    for (const [roll, rarity] of samples) {
      const state = buy(createGame(), series.id, () => roll);
      assert.equal(getItem(state.pending.itemId).rarity, rarity);
      assert.equal(state.coins, 1200 - series.price);
    }
  }
  for (const roll of [-1, 1, NaN, Infinity]) assert.throws(() => buy(createGame(), 'wei', () => roll), /随机数/);
});

test('immediate cash out credits the correct value once and retains discovery', () => {
  const pending = buy(createGame(), 'shu', () => 0.99);
  const state = settle(pending, 'sell');
  assert.equal(state.coins, 2940);
  assert.equal(state.sold, 1);
  assert.equal(state.pending, null);
  assert.deepEqual(state.inventory, []);
  assert.deepEqual(state.discovered, [SERIES[1].items.find(item => item.rarity === 'legendary').id]);
  assert.throws(() => settle(state, 'sell'), /没有等待/);
  assert.throws(() => settle(pending, 'invalid'), /请选择/);
  assert.equal(pending.coins, 940);
});

test('duplicate collectibles have unique instances and can be sold independently', () => {
  let state = settle(buy(createGame(), 'wei', () => 0.7), 'keep');
  state = settle(buy(state, 'wei', () => 0.7), 'keep');
  assert.equal(state.inventory.length, 2);
  assert.notEqual(state.inventory[0].id, state.inventory[1].id);
  assert.equal(state.discovered.length, 1);
  assert.equal(collectionValue(state), 200);
  const id = state.inventory[0].id;
  const sold = sellItem(state, id);
  assert.equal(sold.coins, 1100);
  assert.equal(sold.inventory.length, 1);
  assert.equal(collectionValue(sold), 100);
  assert.equal(sold.sold, 1);
  assert.throws(() => sellItem(sold, id), /没有这件/);
  assert.equal(state.inventory.length, 2);
});

test('insufficient funds cannot purchase and rewards restore playability', () => {
  let state = settle(buy(createGame(), 'wu', () => 0), 'keep');
  state = settle(buy(state, 'wu', () => 0), 'keep');
  assert.equal(state.coins, 0);
  assert.throws(() => buy(state, 'wei'), /还差 100/);
  state = claimReward(tickWatch(state, 60));
  assert.equal(buy(state, 'wei', () => 0).coins, 20);
  assert.throws(() => buy(createGame(), 'missing'), /没有找到/);
});

test('watch rewards preserve fractions, cap at three, and cannot be claimed twice', () => {
  let state = tickWatch(createGame(), 29.5);
  assert.equal(state.rewardCount, 0);
  assert.throws(() => claimReward(state), /还没准备/);
  state = tickWatch(state, 1);
  assert.equal(state.rewardCount, 1);
  assert.equal(state.watchSeconds, 0.5);
  state = claimReward(state);
  assert.equal(state.coins, 1260);
  assert.equal(state.watchSeconds, 0.5);
  state = tickWatch(state, 100000);
  assert.equal(state.rewardCount, 3);
  assert.equal(state.watchSeconds, 0);
  state = tickWatch(state, 12);
  state = claimReward(state);
  assert.equal(state.coins, 1440);
  assert.throws(() => claimReward(state), /还没准备/);
  for (const seconds of [-1, NaN, Infinity]) assert.throws(() => tickWatch(state, seconds), /时间无效/);
});

test('save round trip restores the exact pending outcome and isolates its data', () => {
  const original = buy(settle(buy(createGame(), 'wei', () => 0), 'keep'), 'wu', () => 0.99);
  original.settings.fast = true;
  const restored = hydrate(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(restored, original);
  assert.equal(settle(restored, 'sell').coins, 5500);
  restored.inventory[0].itemId = 'changed';
  restored.settings.sound = false;
  assert.equal(original.inventory[0].itemId, SERIES[0].items[0].id);
  assert.equal(original.settings.sound, true);
  assert.deepEqual(hydrate(createGame()), createGame());
});

test('damaged and inconsistent saves fail validation for backup handling', () => {
  for (const raw of [null, {}, [], 'save', { ...createGame(), version: 2 },
    { ...createGame(), coins: -1 }, { ...createGame(), coins: 1.5 },
    { ...createGame(), opened: 1 }, { ...createGame(), rewardCount: 4 },
    { ...createGame(), watchSeconds: 30 }, { ...createGame(), settings: { sound: 1, fast: false } },
    { ...createGame(), discovered: ['unknown'] }, { ...createGame(), pending: {} },
    { ...createGame(), history: [{ text: 1 }] }]) {
    assert.throws(() => hydrate(raw), /存档数据/);
  }
  const valid = settle(buy(createGame(), 'wei', () => 0), 'keep');
  assert.throws(() => hydrate({ ...valid, inventory: [...valid.inventory, valid.inventory[0]], opened: 2 }), /存档数据/);
  assert.throws(() => hydrate({ ...valid, inventory: [{ ...valid.inventory[0], seriesId: 'shu' }] }), /存档数据/);
  assert.throws(() => hydrate({ ...valid, discovered: [] }), /存档数据/);
});

test('history stays bounded and sold-item IDs are never reused', () => {
  let state = createGame();
  const seen = new Set();
  for (let index = 0; index < 40; index++) {
    state = buy(state, 'wei', () => 0.99);
    assert.equal(seen.has(state.pending.id), false);
    seen.add(state.pending.id);
    state = settle(state, 'sell');
  }
  assert.equal(state.history.length, 30);
  assert.equal(state.opened, 40);
  assert.equal(state.sold, 40);
  assert.deepEqual(hydrate(state), state);
});

test('chosen box numbers survive saving and do not affect award probabilities', () => {
  for (let number = 1; number <= 6; number++) {
    const state = buy(createGame(), 'shu', () => .9, number);
    assert.equal(state.pending.boxNumber, number);
    assert.equal(state.pending.itemId, SERIES[1].items.find(item => item.rarity === 'epic').id);
    assert.equal(hydrate(state).pending.boxNumber, number);
    assert.equal(hydrate(settle(state, 'keep')).inventory[0].boxNumber, number);
  }
  for (const number of [0, 7, -1, 1.2, '3', null]) {
    assert.throws(() => buy(createGame(), 'wei', () => 0, number), /1 到 6/);
  }
});

test('pending orders without a box number remain readable', () => {
  const legacy = buy(createGame(), 'wei', () => .99);
  delete legacy.pending.boxNumber;
  const restored = hydrate(legacy);
  assert.equal(restored.pending.itemId, SERIES[0].items.find(item => item.rarity === 'legendary').id);
  assert.equal(settle(restored, 'sell').coins, 2000);
  const broken = buy(createGame(), 'wei', () => 0);
  broken.pending.boxNumber = 9;
  assert.throws(() => hydrate(broken), /存档数据/);
});
