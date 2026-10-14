import test from 'node:test';
import assert from 'node:assert/strict';
import { SERIES, RARITIES, buy, createGame, hydrate } from '../src/game.mjs';
import { buildReel } from '../src/reel.mjs';

test('every saved award is centered in its reel without changing the paid order', () => {
  for (const series of SERIES) {
    for (const roll of [0, .6, .88, .98]) {
      const order = buy(createGame(), series.id, () => roll);
      const snapshot = JSON.stringify(order);
      const reel = buildReel(series.items, order.pending.itemId, order.pending.id);
      assert.equal(reel.items.length, 48);
      assert.equal(reel.winnerIndex, reel.items.length - 7);
      assert.equal(reel.items[reel.winnerIndex].id, order.pending.itemId);
      assert.ok(reel.items.every(item => series.items.includes(item)));
      assert.equal(JSON.stringify(order), snapshot);
      const restored = hydrate(JSON.parse(snapshot));
      assert.deepEqual(buildReel(series.items, restored.pending.itemId, restored.pending.id), reel);
    }
  }
});

test('presentation is deterministic, seed-sensitive and never changes the winner', () => {
  const { items } = SERIES[0];
  const winner = items[2].id;
  const a = buildReel(items, winner, 'box-123');
  assert.deepEqual(buildReel(items, winner, 'box-123'), a);
  const b = buildReel(items, winner, 'box-124');
  assert.notDeepEqual(a.items.map(item => item.id), b.items.map(item => item.id));
  assert.equal(b.items[b.winnerIndex].id, winner);
  assert.deepEqual(buildReel(items, winner, 0), buildReel(items, winner, 0));
});

test('filler follows published rarity proportions, including both neighbors of the award', () => {
  const counts = Object.fromEntries(Object.keys(RARITIES).map(key => [key, 0]));
  const near = { ...counts };
  const { items } = SERIES[0];
  for (let seed = 0; seed < 2500; seed++) {
    const reel = buildReel(items, items[0].id, seed);
    reel.items.forEach((item, index) => {
      if (index !== reel.winnerIndex) counts[item.rarity]++;
    });
    for (const offset of [-1, 1]) near[reel.items[reel.winnerIndex + offset].rarity]++;
  }
  for (const [rarity, definition] of Object.entries(RARITIES)) {
    const expected = definition.chance / 100;
    assert.ok(Math.abs(counts[rarity] / (2500 * 47) - expected) < .012, `${rarity} filler should use published weight`);
    assert.ok(Math.abs(near[rarity] / 5000 - expected) < .025, `${rarity} neighbors must not be selected to create near misses`);
  }
});

test('missing awards and invalid series fail before animation; a single-item pool is valid', () => {
  const { items } = SERIES[0];
  assert.throws(() => buildReel([], items[0].id, 1));
  assert.throws(() => buildReel(items, 'missing', 1));
  assert.throws(() => buildReel([{ id: 'broken', rarity: 'unknown' }], 'broken', 1));
  assert.throws(() => buildReel([items[0], items[0]], items[0].id, 1));
  assert.throws(() => buildReel(items, items[0].id, NaN));
  const single = buildReel([items[0]], items[0].id, 'single');
  assert.ok(single.items.every(item => item === items[0]));
});
