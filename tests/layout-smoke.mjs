import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame, SERIES } from '../src/game.mjs';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext();
const state = createGame(); state.settings.sound = false; state.settings.music = false;
await context.addInitScript(state => localStorage.setItem('live-shopping-simulator-v1', JSON.stringify(state)), state);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const snapshot = () => page.evaluate(() => {
  const saved = JSON.parse(localStorage.getItem('live-shopping-simulator-v1'));
  return { coins: saved.coins, pending: saved.pending, inventory: saved.inventory, opened: saved.opened, discovered: saved.discovered,
    selected: document.querySelector('[data-series][aria-pressed="true"]').dataset.series };
});
async function visibleInsideViewport(selector, size) {
  const bounds = await page.locator(selector).boundingBox();
  assert.ok(bounds && bounds.width > 0 && bounds.height > 0 && bounds.x >= -1 && bounds.y >= -1 &&
    bounds.x + bounds.width <= size.width + 1 && bounds.y + bounds.height <= size.height + 1,
  `${selector} is fully available without page scrolling at ${size.width}x${size.height}`);
  return bounds;
}
try {
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4173');
  await page.waitForSelector('.queue-order');
  assert.equal(await page.getByText('下一单，拆你的期待', { exact: true }).count(), 0, 'the removed introductory heading stays absent');
  for (const size of [{ width: 1280, height: 720 }, { width: 1600, height: 960 }, { width: 1920, height: 1080 }, { width: 3840, height: 2160 }]) {
    await page.setViewportSize(size);
    const stage = await visibleInsideViewport('#stage', size);
    assert.ok(stage.height >= size.height * .55, `the room uses at least 55% of the screen height at ${size.width}px`);
    const live = await page.locator('.live-layout').boundingBox();
    const chat = await visibleInsideViewport('.chat-panel', size);
    assert.ok(Math.abs(chat.y - live.y) < 3 && Math.abs(chat.height - live.height) < 3, 'chat spans the room and shop vertically');
    await visibleInsideViewport('#buy', size);
    const boxes = await page.locator('.queue-order').evaluateAll(elements => elements.map(element => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom };
    }));
    assert.equal(boxes.length, 5);
    assert.ok(Math.max(...boxes.map(box => box.y)) - Math.min(...boxes.map(box => box.y)) < 3, 'five boxes share one horizontal tabletop row');
    assert.ok(boxes.every(box => box.x >= stage.x && box.right <= stage.x + stage.width * .72 && box.bottom <= stage.y + stage.height), 'boxes remain on the left tabletop');
    for (let index = 1; index < boxes.length; index++) assert.ok(boxes[index].x >= boxes[index - 1].right - 1, 'tabletop boxes do not overlap');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1), 'main interface does not require scrolling');
    await page.screenshot({ path: `artifacts/v0.4.0-layout-${size.width}.png` });
    for (const series of SERIES) {
      await visibleInsideViewport(`[data-preview="${series.id}"]`, size);
      const before = await snapshot();
      await page.locator(`[data-preview="${series.id}"]`).click();
      assert.deepEqual(await page.locator('.gift-preview-card').evaluateAll(cards => cards.map(card => card.dataset.rarity)), ['legendary', 'epic', 'rare', 'common']);
      assert.deepEqual(await page.locator('.gift-probability b').allTextContents(), ['2%', '10%', '28%', '60%']);
      assert.deepEqual(await page.locator('.gift-preview-card h3').allTextContents(), [...series.items].reverse().map(item => item.name));
      await visibleInsideViewport('#modal', size);
      await visibleInsideViewport('#modal [data-action="close"]', size);
      if (series.id === 'street') await page.screenshot({ path: `artifacts/v0.4.0-preview-${size.width}.png` });
      await page.locator('#modal [data-action="close"]').click();
      assert.deepEqual(await snapshot(), before, 'preview neither buys a box nor changes the selected series');
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: room fills viewport; full-height chat; one five-box tabletop row; all prices and purchase/preview controls accessible; all series previews sorted with exact probabilities; read-only preview; four landscape sizes.');
} finally { await browser.close(); }
