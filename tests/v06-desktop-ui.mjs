import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const executablePath = process.env.LSS_TEST_EXE || path.resolve('dist/v0.6.0/LiveShoppingSimulator-win32-x64/LiveShoppingSimulator.exe');
const userData = path.resolve('artifacts', `v06-desktop-ui-${Date.now()}`);
await fs.mkdir(userData, { recursive: true });
const env = { ...process.env, NODE_ENV: 'test', LSS_TEST_USER_DATA: userData };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath, args: [], env });
try {
  const page = await app.firstWindow();
  await page.waitForSelector('.queue-order');
  assert.equal(await page.locator('.side-bottom small').textContent(), 'v0.6.0');
  assert.equal(await page.locator('.queue-order').count(), 5);
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    await app.evaluate(({ BrowserWindow }, { width, height }) => BrowserWindow.getAllWindows()[0].setContentSize(width, height), { width, height });
    await page.waitForTimeout(350);
    const buy = await page.locator('#buy').boundingBox();
    assert.ok(buy && buy.x >= 0 && buy.y >= 0 && buy.x + buy.width <= width && buy.y + buy.height <= height);
    await page.screenshot({ path: `artifacts/v0.6.0-desktop-${width}.png` });
  }
  console.log('PASS: packaged interface identifies v0.6.0, contains five queue packs, purchase control fits native 1280x720 and 1920x1080.');
} finally { await app.close(); }
