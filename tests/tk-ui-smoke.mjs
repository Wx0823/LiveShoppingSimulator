import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { SERIES, LEGACY_SERIES, createGame, buy } from '../src/game.mjs';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(15000);
const key = 'live-shopping-simulator-v1';
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const initial = createGame(); initial.settings.fast = true; initial.settings.music = false; initial.settings.sound = false;
const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
async function restore(state) {
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key, state });
  await page.reload();
  await page.waitForSelector('.queue-order');
}
const economy = state => ({ coins: state.coins, inventory: state.inventory, pending: state.pending, discovered: state.discovered, opened: state.opened, sold: state.sold });
async function denyWrites(deny = true) {
  await page.evaluate(deny => {
    window.originalSetItem ??= Storage.prototype.setItem;
    Storage.prototype.setItem = deny ? function () { throw new DOMException('QA simulated full disk', 'QuotaExceededError'); } : window.originalSetItem;
  }, deny);
}
try {
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4173');
  await restore(initial);
  const beforePreview = economy(await saved());
  await page.locator('[data-preview="wei"]').click();
  const firstId = await page.locator('.gift-preview-card').first().getAttribute('data-item-id');
  await page.locator(`[data-inspect="${firstId}"]`).first().click();
  await page.waitForSelector('.card-detail[data-side="front"]');
  assert.ok(await page.locator('.card-detail').evaluate(element => element.scrollHeight <= element.clientHeight + 1), 'card detail fits the 720p modal without scrolling');
  const front = await page.locator('.card-detail').innerHTML();
  await page.locator('[data-action="flip-card"]').click();
  await page.waitForSelector('.card-detail[data-side="back"]');
  assert.notEqual(await page.locator('.card-detail').innerHTML(), front);
  await page.screenshot({ path: 'artifacts/v0.5.0-card-back.png' });
  await page.locator('[data-action="flip-card"]').click();
  await page.waitForSelector('.card-detail[data-side="front"]');
  await page.screenshot({ path: 'artifacts/v0.5.0-card-front.png' });
  await page.locator('[data-action="detail-back"]').click();
  assert.equal(await page.locator('.gift-preview-card').count(), 5);
  await page.locator('.close-modal').click();
  assert.deepEqual(economy(await saved()), beforePreview);

  await page.locator('#nav-collection').click();
  for (const series of SERIES) {
    await page.locator(`[data-collection-series="${series.id}"]`).click();
    const seen = [];
    for (let index = 0; index < 3; index++) {
      const names = await page.locator('.item-card h3').allTextContents();
      assert.equal(names.length, 5); seen.push(...names);
      assert.ok(names.every(name => series.items.some(item => item.name === name)));
      assert.ok(await page.locator('#modal .modal-body').evaluate(element => element.scrollHeight <= element.clientHeight + 1), 'collection page fits 720p without scrolling');
      if (index < 2) await page.locator('[data-action="collection-next"]').click();
    }
    assert.equal(new Set(seen).size, 15);
    assert.equal(await page.locator('[data-action="collection-next"]').isDisabled(), true);
  }
  await page.locator('.close-modal').click();

  // Simulated storage rejection must not publish an uncommitted purchase.
  await denyWrites();
  const beforeFailedPurchase = economy(await saved());
  const balance = await page.locator('#coins').textContent();
  await page.locator('#buy').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('未生效'));
  assert.deepEqual(economy(await saved()), beforeFailedPurchase);
  assert.equal(await page.locator('#coins').textContent(), balance);
  assert.equal(await page.locator('.queue-order.mine').count(), 0);
  await denyWrites(false);
  const rewardState = { ...initial, rewardCount: 1 };
  await restore(rewardState);
  await denyWrites();
  await page.locator('#claim-reward').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('未生效'));
  assert.equal((await saved()).rewardCount, 1);
  assert.equal((await saved()).coins, 1200);
  assert.equal(await page.locator('#coins').textContent(), '1,200');
  await denyWrites(false);

  const paidResult = buy(initial, 'wei', () => .99);
  await restore(paidResult);
  await page.waitForSelector('[data-action="flip-result"]');
  await page.locator('[data-action="flip-result"]').click();
  assert.equal(await page.locator('.result-art .card-back').count(), 1);
  assert.deepEqual(economy(await saved()), economy(paidResult), 'flipping the paid result is presentation only');
  await page.locator('[data-action="flip-result"]').click();
  assert.equal(await page.locator('.result-art .card-back').count(), 0);
  for (const action of ['keep-result', 'sell-result']) {
    const bounds = await page.locator(`[data-action="${action}"]`).boundingBox();
    assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 720, 'result settlement controls fit 720p');
  }
  await page.screenshot({ path: 'artifacts/v0.5.0-result-1280.png' });
  await page.locator('[data-action="keep-result"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  assert.equal((await saved()).inventory[0].itemId, paidResult.pending.itemId);

  // Ready legacy order is a real pre-upgrade fixture, not a purchase of a retired pack.
  const oldSeries = LEGACY_SERIES[1], oldItem = oldSeries.items.find(item => item.rarity === 'legendary');
  const legacy = { ...initial, coins: 940, opened: 1, discovered: [oldItem.id], pending: { id: 'box-1', seriesId: oldSeries.id, itemId: oldItem.id, boxNumber: 2 } };
  await restore(legacy);
  await page.waitForSelector('[data-action="keep-result"]');
  assert.equal(await page.locator('.result-panel h2').textContent(), oldItem.name);
  await denyWrites();
  await page.locator('[data-action="sell-result"]').click();
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('未生效'));
  assert.deepEqual(economy(await saved()), economy(legacy));
  assert.equal(await page.locator('[data-action="keep-result"]').isVisible(), true);
  await denyWrites(false);
  await page.locator('[data-action="keep-result"]').evaluate(button => { button.click(); button.click(); });
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  assert.equal((await saved()).inventory.length, 1);
  await page.locator('#nav-bag').click();
  assert.equal(await page.locator('.item-card h3').textContent(), oldItem.name);
  await page.locator(`[data-inspect="${oldItem.id}"]`).click();
  assert.ok((await page.locator('.modal-header p').textContent()).includes(oldSeries.name), 'legacy detail retains its original collection name');
  await page.locator('[data-action="detail-back"]').click();
  await page.locator('[data-sell]').evaluate(button => { button.click(); button.click(); });
  await page.waitForSelector('.empty-state');
  assert.equal((await saved()).coins, 940 + oldItem.value);
  assert.equal((await saved()).sold, 1);
  await page.locator('.close-modal').click();
  const queuedLegacy = { ...legacy, pending: { ...legacy.pending, status: 'queued', queueAhead: 1 } };
  await restore(queuedLegacy);
  await page.waitForSelector('.queue-order.mine');
  assert.equal(await page.locator('.queue-order').count(), 5);
  await page.reload();
  await page.waitForSelector('[data-action="sell-result"]');
  assert.equal((await saved()).pending.itemId, oldItem.id);
  assert.equal(await page.locator('.result-panel h2').textContent(), oldItem.name);
  await page.locator('[data-action="sell-result"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  assert.equal((await saved()).coins, 940 + oldItem.value);
  assert.deepEqual(errors, []);
  console.log(`PASS: front/back detail; faction collection pagination; read-only preview; failed-save atomicity; legacy pending/backpack settlement; duplicate click protection.`);
} finally { await browser.close(); }
