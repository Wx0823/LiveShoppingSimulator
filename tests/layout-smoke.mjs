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
  await page.waitForFunction(() => [...document.querySelectorAll('.queue-order')].every(box => box.getAnimations().every(animation => animation.playState === 'finished')));
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
    for (let index = 1; index < boxes.length; index++) assert.ok(boxes[index].right <= boxes[index - 1].x + 1, 'queue advances rightward toward the host without overlap');
    const reveal = await page.locator('.actor-stage').boundingBox();
    assert.ok(Math.abs(reveal.x + reveal.width / 2 - (boxes[0].x + boxes[0].right) / 2) < 3, 'reveal is centered over the rightmost opening box');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1), 'main interface does not require scrolling');
    await page.screenshot({ path: `artifacts/v0.5.0-layout-${size.width}.png` });
    for (const series of SERIES) {
      await visibleInsideViewport(`[data-preview="${series.id}"]`, size);
      const before = await snapshot();
      await page.locator(`[data-preview="${series.id}"]`).click();
      const rank = { legendary: 0, epic: 1, rare: 2, common: 3 };
      const expected = [...series.items].sort((a, b) => rank[a.rarity] - rank[b.rarity]);
      const seen = [];
      for (let currentPage = 0; currentPage < 3; currentPage++) {
        const ids = await page.locator('.gift-preview-card').evaluateAll(cards => cards.map(card => card.dataset.itemId));
        assert.equal(ids.length, 5);
        const loaded = await page.locator('.gift-preview-card image').evaluateAll(async nodes => Promise.all(nodes.map(async node => {
          const image = new Image(); image.src = node.getAttribute('href'); await image.decode();
          return { width: image.naturalWidth, source: image.src };
        })));
        assert.equal(loaded.length, 5);
        assert.ok(loaded.every(image => image.width >= 100 && image.source.includes('/runtime/')), 'every visible preview card loads its runtime texture');
        seen.push(...ids);
        assert.deepEqual(ids, expected.slice(currentPage * 5, currentPage * 5 + 5).map(item => item.id));
        const chances = await page.locator('.gift-probability b').allTextContents();
        chances.forEach((text, i) => {
          const item = expected[currentPage * 5 + i];
          const count = series.items.filter(other => other.rarity === item.rarity).length;
          const chance = ({ legendary: 2, epic: 10, rare: 28, common: 60 })[item.rarity] / count;
          assert.ok(Math.abs(parseFloat(text) - chance) < .0001);
        });
        await visibleInsideViewport('#modal', size);
        await visibleInsideViewport('#modal [data-action="close"]', size);
        await visibleInsideViewport('[data-action="preview-next"]', size);
        await visibleInsideViewport('[data-action="preview-prev"]', size);
        assert.ok(await page.locator('#modal .modal-body').evaluate(element => element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1), 'all five card fronts and probabilities fit without an internal scrollbar');
        if (series.id === 'wei') await page.screenshot({ path: `artifacts/v0.5.0-preview-${size.width}-${currentPage + 1}.png` });
        if (currentPage < 2) await page.locator('[data-action="preview-next"]').click();
      }
      assert.equal(new Set(seen).size, 15);
      assert.equal(await page.locator('[data-action="preview-next"]').isDisabled(), true);
      await page.locator('#modal [data-action="close"]').click();
      assert.deepEqual(await snapshot(), before, 'preview neither buys a box nor changes the selected series');
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS: room fills viewport; full-height chat; one five-box tabletop row; all prices and purchase/preview controls accessible; all series previews sorted with exact probabilities; read-only preview; four landscape sizes.');
} finally { await browser.close(); }
