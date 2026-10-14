import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { createGame, getItem } from '../src/game.mjs';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 960 } });
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const key = 'live-shopping-simulator-v1';
const read = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
async function fresh(fast = true) {
  const state = createGame(); state.settings.fast = fast; state.settings.sound = false; state.settings.music = false;
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key, state });
  await page.reload();
  await page.waitForSelector('.actor-stage');
  return state;
}
const identity = state => ({ coins: state.coins, id: state.pending.id, itemId: state.pending.itemId, seriesId: state.pending.seriesId, boxNumber: state.pending.boxNumber });
async function observeActor() {
  await page.evaluate(() => {
    window.testActorPhases = [];
    const actor = document.querySelector('.actor-stage');
    const save = () => window.testActorPhases.push({ phase: actor.dataset.phase, player: actor.dataset.player });
    save(); new MutationObserver(save).observe(actor, { attributes: true, attributeFilter: ['data-phase'] });
  });
}

try {
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4173');
  const initial = await fresh(false);
  await observeActor();
  await page.waitForFunction(() => ['receive', 'grip', 'tear', 'reveal', 'clear'].every(phase => window.testActorPhases.some(entry => entry.phase === phase)), undefined, { timeout: 12000 });
  const afterNpc = await read();
  const { watchSeconds: ignoredBefore, rewardCount: rewardBefore, ...beforeEconomy } = initial;
  const { watchSeconds: ignoredAfter, rewardCount: rewardAfter, ...afterEconomy } = afterNpc;
  assert.deepEqual(afterEconomy, beforeEconomy, 'NPC performances never purchase, discover or award player items');
  assert.ok(afterNpc.watchSeconds > 0 || rewardAfter > rewardBefore, 'normal viewing progress continues');
  assert.equal(await page.locator('#modal').evaluate(dialog => dialog.open), false);
  await page.screenshot({ path: 'artifacts/v0.3.0-live-room.png' });

  await fresh();
  await page.locator('[data-box="4"]').click();
  await page.locator('#buy').click();
  await page.waitForSelector('#queue-list .queue-order.mine');
  const queued = await read();
  assert.equal(queued.pending.status, 'queued');
  assert.equal(queued.pending.boxNumber, 4);
  assert.equal(queued.coins, 1100);
  assert.ok(queued.pending.queueAhead > 0);
  assert.equal(await page.locator('#modal').evaluate(dialog => dialog.open), false, 'buying queues the bag before any reel modal');
  assert.ok((await page.locator('#queue-status').innerText()).trim().length > 0);
  assert.equal(await page.locator('#buy').isDisabled(), true);
  await page.setViewportSize({ width: 1280, height: 720 });
  const mineBounds = await page.locator('#queue-list .queue-order.mine').boundingBox();
  const buyBounds = await page.locator('#buy').boundingBox();
  assert.ok(mineBounds && mineBounds.x >= 0 && mineBounds.y >= 0 && mineBounds.y + mineBounds.height <= 720, 'queued player order fits smallest target viewport');
  assert.ok(buyBounds && buyBounds.y + buyBounds.height <= 720, 'purchase button fits smallest target viewport');
  await page.screenshot({ path: 'artifacts/v0.3.0-player-queue.png' });
  await page.reload();
  await page.waitForSelector('#queue-list .queue-order.mine');
  assert.deepEqual(identity(await read()), identity(queued), 'reload keeps exact paid result and balance');
  await page.waitForSelector('.actor-stage[data-player="true"]');
  assert.equal((await read()).pending.status, 'opening');
  assert.equal(await page.locator('#modal').evaluate(dialog => dialog.open), false, 'actor opens the player bag before the reel');
  await page.waitForSelector('.reel-track');
  assert.equal((await read()).pending.itemId, queued.pending.itemId);
  await page.waitForSelector('[data-action="keep-result"]');
  assert.equal(await page.locator('.result-panel h2').textContent(), getItem(queued.pending.itemId).name);
  await page.locator('[data-action="keep-result"]').click();
  const kept = await read();
  assert.equal(kept.pending, null); assert.equal(kept.inventory.length, 1);
  assert.equal(kept.inventory[0].itemId, queued.pending.itemId);
  assert.equal(kept.inventory[0].boxNumber, 4);
  assert.equal(kept.coins, 1100); assert.equal(kept.opened, 1);

  await fresh();
  await page.locator('#buy').click();
  await page.waitForSelector('.actor-stage[data-player="true"]');
  const opening = await read();
  assert.equal(opening.pending.status, 'opening');
  await page.reload();
  await page.waitForSelector('[data-action="sell-result"]');
  assert.deepEqual(identity(await read()), identity(opening), 'reload during the actor performance preserves the paid item');
  await page.locator('[data-action="sell-result"]').click();
  const sold = await read();
  assert.equal(sold.coins, 1100 + getItem(opening.pending.itemId).value);
  assert.equal(sold.pending, null); assert.equal(sold.sold, 1); assert.equal(sold.inventory.length, 0);

  await page.locator('#music-toggle').click();
  let settings = (await read()).settings;
  assert.equal(settings.music, true); assert.equal(settings.sound, false, 'music toggle does not enable effects');
  await page.locator('#sound-toggle').click();
  settings = (await read()).settings;
  assert.equal(settings.music, true); assert.equal(settings.sound, true);
  await page.locator('#nav-settings').click();
  await page.locator('#music-volume').evaluate(input => {
    input.value = '.22'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).settings.musicVolume === .22, key);
  await page.reload();
  settings = (await read()).settings;
  assert.equal(settings.musicVolume, .22); assert.equal(settings.music, true); assert.equal(settings.sound, true);
  await page.locator('#music-toggle').click();
  settings = (await read()).settings;
  assert.equal(settings.music, false); assert.equal(settings.sound, true);
  assert.deepEqual(errors, []);
  console.log('PASS: continuous NPC phases without economic effects; queued purchase; player actor before reel; exact reload recovery in queue/opening; keep/cashout; independent persisted music settings; 720p queue visibility.');
} finally { await browser.close(); }
