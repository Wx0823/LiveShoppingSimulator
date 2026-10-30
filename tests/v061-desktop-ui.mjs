import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const executablePath = process.env.LSS_TEST_EXE || path.resolve('dist/v0.6.1/LiveShoppingSimulator-win32-x64/LiveShoppingSimulator.exe');
const userData = path.resolve('artifacts', `v061-desktop-ui-${Date.now()}`);
await fs.mkdir(userData, { recursive: true });
const env = { ...process.env, NODE_ENV: 'test', LSS_TEST_USER_DATA: userData };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath, args: [], env });
try {
  const page = await app.firstWindow();
  await page.waitForSelector('.queue-order');
  assert.equal(await page.locator('.side-bottom small').textContent(), 'v0.6.1');
  assert.equal(await page.locator('.queue-order').count(), 5);
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), { width, height });
    await page.waitForTimeout(350);
    const buy = await page.locator('#buy').boundingBox();
    assert.ok(buy && buy.x >= 0 && buy.y >= 0 && buy.x + buy.width <= width && buy.y + buy.height <= height);
    await page.screenshot({ path: `artifacts/v0.6.1-desktop-${width}.png` });
    await page.locator('#nav-settings').click();
    const settings = await page.locator('#modal').innerText();
    assert.ok(settings.includes('v0.6.1'));
    assert.ok(!/语音|旁白|配音/.test(settings), 'Settings contain no voice description');
    assert.equal(await page.locator('[data-setting="voice"]').count(), 0);
    await page.screenshot({ path: `artifacts/v0.6.1-desktop-settings-${width}.png` });
    await page.locator('[data-action="close"]').first().click();
    console.log(`PASS: native ${width}x${height}, buy bounds ${JSON.stringify(buy)}, settings v0.6.1 and no voice controls or description.`);
  }
  console.log(`PASS: packaged v0.6.1 UI, five queue packs, isolated save ${userData}`);
} finally { await app.close(); }
