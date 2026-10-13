import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { createGame, buy, tickWatch } from '../src/game.mjs';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const key = 'live-shopping-simulator-v1';
async function setSave(state) {
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key, state });
  await page.reload();
}
async function save() { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), key); }
async function click(selector) { await page.locator(selector).first().click(); }
try {
  await page.goto('http://127.0.0.1:4173');
  const initial = createGame(); initial.settings.fast = true;
  await setSave(initial);
  for (const size of [{ width: 1600, height: 960 }, { width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    const buyBounds = await page.locator('#buy').boundingBox();
    assert.ok(buyBounds.y + buyBounds.height <= size.height, `Purchase button fits ${size.width}x${size.height}`);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
    await page.screenshot({ path: `artifacts/live-${size.width}.png` });
  }
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.locator('#buy').evaluate(button => { button.click(); button.click(); button.click(); });
  await page.waitForSelector('[data-action="keep-result"]');
  let current = await save();
  assert.equal(current.opened, 1); assert.equal(current.coins, 1100); assert.ok(current.pending);
  await page.screenshot({ path: 'artifacts/result.png' });
  await click('[data-action="keep-result"]');
  current = await save(); assert.equal(current.inventory.length, 1); assert.equal(current.pending, null);
  await click('#nav-bag');
  await page.screenshot({ path: 'artifacts/backpack.png' });
  await click('[data-sell]');
  current = await save(); assert.equal(current.inventory.length, 0); assert.equal(current.sold, 1); assert.equal(current.discovered.length, 1);
  await click('[data-action="close"]');
  const pending = buy(initial, 'cosmos', () => .999);
  await setSave(pending);
  assert.equal(await page.locator('.result-panel h2').textContent(), '银河旅人');
  await page.reload();
  assert.equal((await save()).pending.itemId, pending.pending.itemId);
  await click('[data-action="sell-result"]');
  assert.equal((await save()).coins, 5600);
  await setSave(tickWatch(initial, 90));
  await click('#claim-reward');
  assert.equal((await save()).coins, 1380); assert.equal((await save()).rewardCount, 0);
  const poor = { ...initial, coins: 0 };
  await setSave(poor); await click('#buy');
  assert.equal((await save()).opened, 0);
  assert.ok((await page.locator('#toast').textContent()).includes('金币不足'));
  await click('#nav-collection'); assert.equal(await page.locator('.item-card').count(), 12);
  await click('[data-action="close"]');
  await click('#nav-settings'); await click('[data-action="reset-confirm"]'); await click('[data-action="cancel-reset"]');
  assert.equal((await save()).coins, 0);
  await click('[data-action="close"]');
  await page.evaluate(key => localStorage.setItem(key, ''), key); await page.reload();
  await page.waitForSelector('[data-action="recover"]');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), '', 'Corrupt save is not overwritten');
  await page.locator('[data-action="recover"]').evaluate(button => { button.click(); button.click(); });
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  assert.equal((await save()).coins, 1200); assert.equal(await page.locator('#buy').isEnabled(), true);
  await page.screenshot({ path: 'artifacts/final-live.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: 3 resolutions, purchase locking, keep/sell, pending reload, rewards, insufficient funds, collection, reset cancel, corrupt-save recovery.');
} finally { await browser.close(); }
