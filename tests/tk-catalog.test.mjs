import test from 'node:test';
import assert from 'node:assert/strict';
import { SERIES, LEGACY_SERIES, RARITIES, getItem, getSeries, itemProbability, createGame, buy, enqueue, hydrate, settle, advanceQueue, beginQueuedOpening, readyQueuedOpening } from '../src/game.mjs';
import { buildReel } from '../src/reel.mjs';

const counts = { common: 6, rare: 5, epic: 3, legendary: 1 };
const base = { common: 0, rare: .6, epic: .88, legendary: .98 };
const oldSave = (series, item, phase) => ({
  ...createGame(), coins: 1200 - series.price, opened: 1, discovered: [item.id],
  pending: { id: 'box-1', itemId: item.id, seriesId: series.id, boxNumber: 4,
    ...(phase ? { status: phase, queueAhead: phase === 'queued' ? 2 : 0 } : {}) },
});

test('three factions expose exactly 45 unique named warriors with the intended rarity and value tiers', () => {
  assert.deepEqual(SERIES.map(series => series.id), ['wei', 'shu', 'wu']);
  assert.deepEqual(SERIES.map(series => series.price), [100, 260, 600]);
  assert.equal(new Set(SERIES.flatMap(series => series.items.map(item => item.id))).size, 45);
  assert.equal(new Set(SERIES.flatMap(series => series.items.map(item => item.name))).size, 45);
  SERIES.forEach((series, index) => {
    assert.equal(series.items.length, 15);
    let total = 0;
    for (const [rarity, count] of Object.entries(counts)) {
      const items = series.items.filter(item => item.rarity === rarity);
      assert.equal(items.length, count);
      for (const item of items) {
        assert.equal(getItem(item.id), item);
        assert.equal(item.value, LEGACY_SERIES[index].items.find(old => old.rarity === rarity).value);
        assert.equal(itemProbability(series, item), RARITIES[rarity].chance / count);
        assert.equal(itemProbability(series.id, item.id), RARITIES[rarity].chance / count);
        total += RARITIES[rarity].chance / count;
      }
    }
    assert.ok(Math.abs(total - 100) < 1e-10);
    assert.equal(getSeries(series.id), series);
  });
  assert.equal(itemProbability('missing', 'missing'), 0);
  assert.equal(itemProbability(SERIES[0], SERIES[1].items[0]), 0);
});

test('every warrior is reachable at its probability midpoint and adjacent boundary samples', () => {
  for (const series of SERIES) {
    for (const [rarity, count] of Object.entries(counts)) {
      const group = series.items.filter(item => item.rarity === rarity);
      const width = RARITIES[rarity].chance / 100 / count;
      group.forEach((item, index) => {
        const lower = base[rarity] + width * index;
        const upper = lower + width;
        for (const roll of [lower + 1e-10, (lower + upper) / 2, upper - 1e-10]) {
          const result = buy(createGame(), series.id, () => roll);
          assert.equal(result.pending.itemId, item.id, `${series.id}/${item.name} roll ${roll}`);
          assert.equal(hydrate(JSON.parse(JSON.stringify(result))).pending.itemId, item.id);
        }
      });
    }
  }
});

test('a deterministic uniform sweep preserves rarity totals and equal odds within each rarity', () => {
  const samples = 15000;
  for (const series of SERIES) {
    const tally = Object.fromEntries(series.items.map(item => [item.id, 0]));
    for (let index = 0; index < samples; index++) tally[buy(createGame(), series.id, () => (index + .5) / samples).pending.itemId]++;
    for (const item of series.items) {
      const expected = samples * RARITIES[item.rarity].chance / 100 / counts[item.rarity];
      assert.ok(Math.abs(tally[item.id] - expected) <= 1, `${item.id}: ${tally[item.id]} vs ${expected}`);
    }
  }
});

test('all 45 fixed paid results survive queue transitions, reloads and one-time settlement', () => {
  for (const series of SERIES) {
    for (const [rarity, count] of Object.entries(counts)) {
      const group = series.items.filter(item => item.rarity === rarity);
      group.forEach((item, index) => {
        let state = enqueue(createGame(), series.id, () => base[rarity] + (index + .5) * RARITIES[rarity].chance / 100 / count, 3, 2);
        const price = state.coins;
        for (const transition of [advanceQueue, advanceQueue, beginQueuedOpening, readyQueuedOpening]) {
          state = hydrate(JSON.parse(JSON.stringify(transition(state))));
          assert.equal(state.pending.itemId, item.id);
          assert.equal(state.coins, price);
        }
        const reel = buildReel(series.items, item.id, state.pending.id);
        assert.equal(reel.items[reel.winnerIndex].id, item.id);
        const kept = settle(state, 'keep');
        assert.equal(kept.inventory[0].itemId, item.id);
        assert.throws(() => settle(kept, 'keep'));
        const sold = settle(state, 'sell');
        assert.equal(sold.coins, 1200 - series.price + item.value);
        assert.throws(() => settle(sold, 'sell'));
      });
    }
  }
});

test('every legacy item and pending phase remain readable and settle without redrawing or repricing', () => {
  assert.deepEqual(LEGACY_SERIES.map(series => series.id), ['street', 'forest', 'cosmos']);
  for (const series of LEGACY_SERIES) for (const item of series.items) {
    assert.throws(() => buy(createGame(), series.id, () => 0), /没有找到/, 'retired packs cannot be purchased again');
    assert.equal(getSeries(series.id), series);
    assert.equal(getItem(item.id), item);
    for (const phase of [undefined, 'queued', 'opening', 'ready']) {
      const original = oldSave(series, item, phase);
      let state = hydrate(JSON.parse(JSON.stringify(original)));
      assert.deepEqual(state.pending, original.pending);
      if (phase === 'queued') state = beginQueuedOpening(advanceQueue(advanceQueue(state)));
      if (state.pending.status === 'opening') state = readyQueuedOpening(state);
      const kept = hydrate(settle(state, 'keep'));
      assert.equal(kept.inventory[0].itemId, item.id);
      assert.equal(kept.inventory[0].seriesId, series.id);
      assert.deepEqual(kept.discovered, [item.id]);
      assert.equal(settle(state, 'sell').coins, original.coins + item.value);
      const next = buy(kept, 'wei', () => .99);
      assert.equal(hydrate(next).inventory[0].itemId, item.id);
    }
  }
});
