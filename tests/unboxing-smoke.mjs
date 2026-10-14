import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { createGame, getItem } from '../src/game.mjs';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const key = 'live-shopping-simulator-v1';
const read = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
async function fresh(fast = false) {
  const state = createGame(); state.settings.fast = fast; state.settings.sound = false;
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key, state });
  await page.reload();
}
try {
  await page.goto('http://127.0.0.1:4173');
  await fresh();
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'artifacts/v0.3.0-studio.png' });
  await page.locator('[data-box="4"]').click();
  assert.equal(await page.locator('[data-box="4"]').getAttribute('aria-pressed'), 'true');
  await page.locator('#buy').click();
  await page.waitForSelector('.reel-track');
  const order = (await read()).pending;
  assert.equal(order.boxNumber, 4);
  assert.equal(await page.locator('#buy').isDisabled(), true);
  const firstPosition = await page.locator('.reel-track').evaluate(element => getComputedStyle(element).transform);
  await page.waitForTimeout(850);
  const secondPosition = await page.locator('.reel-track').evaluate(element => getComputedStyle(element).transform);
  assert.notEqual(firstPosition, secondPosition, 'The paid order visibly rolls through cards');
  await page.screenshot({ path: 'artifacts/v0.3.0-reel.png' });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#modal').evaluate(element => element.open), true, 'Escape does not abandon the paid order');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForSelector('.reel-winner');
  const centered = await page.evaluate(() => {
    const winner = document.querySelector('.reel-winner').getBoundingClientRect();
    const marker = document.querySelector('.reel-marker').getBoundingClientRect();
    return Math.abs(winner.x + winner.width / 2 - marker.x - marker.width / 2);
  });
  assert.ok(centered < 2, `Award remains under pointer after resize: ${centered}px`);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const finalAlignment = await page.evaluate(() => {
    const winner = document.querySelector('.reel-winner')?.getBoundingClientRect();
    const marker = document.querySelector('.reel-marker')?.getBoundingClientRect();
    return winner && marker ? Math.abs(winner.x + winner.width / 2 - marker.x - marker.width / 2) : 0;
  });
  assert.ok(finalAlignment < 2, 'The final highlight also stays centered when resizing');
  await page.waitForSelector('[data-action="keep-result"]');
  assert.equal(await page.locator('.result-panel h2').textContent(), getItem(order.itemId).name);
  await page.locator('[data-action="keep-result"]').click();
  assert.equal((await read()).inventory[0].boxNumber, 4);
  assert.equal((await read()).opened, 1);

  await fresh();
  await page.locator('#buy').click();
  await page.waitForSelector('.reel-track');
  const beforeReload = (await read()).pending;
  await page.reload();
  await page.waitForSelector('[data-action="sell-result"]');
  assert.deepEqual((await read()).pending, beforeReload, 'Reload during spinning restores exactly the paid award');
  await page.locator('[data-action="sell-result"]').click();
  assert.equal((await read()).coins, 1100 + getItem(beforeReload.itemId).value);

  await fresh();
  await page.locator('#buy').click();
  await page.waitForSelector('.reel-skip');
  const beforeSkip = (await read()).pending;
  await page.locator('.reel-skip').click();
  await page.waitForSelector('[data-action="keep-result"]');
  assert.equal((await read()).pending.itemId, beforeSkip.itemId);
  await page.locator('[data-action="keep-result"]').click();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fresh();
  const started = Date.now();
  await page.locator('#buy').click();
  await page.waitForSelector('[data-action="keep-result"]');
  assert.ok(Date.now() - started < 6500, 'Reduced motion keeps the queue and reveal brief without long spinning');
  assert.deepEqual(errors, []);
  console.log('PASS: numbered order, real reel motion, Escape guard, resize alignment, exact winner, reload mid-spin, skip, reduced motion.');
} finally { await browser.close(); }
