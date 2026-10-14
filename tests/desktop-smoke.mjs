import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createGame, buy } from '../src/game.mjs';

const userData = path.resolve('artifacts', `desktop-test-${Date.now()}`);
await fs.mkdir(userData, { recursive: true });
const pending = buy(createGame(), 'street', () => .99);
const savePath = path.join(userData, 'save-v1.json');
await fs.writeFile(savePath, JSON.stringify(pending));
const executablePath = process.env.LSS_TEST_EXE || path.resolve('node_modules/electron/dist/electron.exe');
const args = process.env.LSS_TEST_EXE ? [] : ['.'];
const env = { ...process.env, NODE_ENV: 'test', LSS_TEST_USER_DATA: userData };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath, args, env });
try {
  const page = await app.firstWindow();
  await page.waitForSelector('[data-action="keep-result"]');
  assert.equal(await page.locator('.result-panel h2').textContent(), '金色宇航员');
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined', 'Renderer has no Node.js access');
  assert.equal(await page.evaluate(() => typeof window.desktop.writeSave), 'function');
  await page.locator('[data-action="keep-result"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  let saved = JSON.parse(await fs.readFile(savePath, 'utf8'));
  assert.equal(saved.inventory.length, 1); assert.equal(saved.coins, 1100); assert.equal(saved.pending, null);
  await page.reload();
  await page.locator('#nav-bag').click();
  assert.equal(await page.locator('.item-card h3').textContent(), '金色宇航员');
  await page.locator('[data-sell]').click();
  await page.waitForSelector('.empty-state');
  saved = JSON.parse(await fs.readFile(savePath, 'utf8'));
  assert.equal(saved.coins, 2000); assert.equal(saved.inventory.length, 0);
  await page.locator('[data-action="close"]').first().click();
  const backgroundLoaded = await page.evaluate(() => new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth > 0);
    image.onerror = () => resolve(false);
    image.src = new URL('assets/studio-live-empty.png', location.href).href;
  }));
  assert.equal(backgroundLoaded, true, 'Packaged workstation art is available');
  // The live room deliberately pauses between orders when its window is hidden.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  await page.locator('[data-box="5"]').click();
  await page.locator('#buy').click();
  await page.waitForSelector('[data-action="keep-result"]');
  saved = JSON.parse(await fs.readFile(savePath, 'utf8'));
  assert.equal(saved.pending.boxNumber, 5); assert.equal(saved.opened, 2); assert.equal(saved.coins, 1900);
  await page.locator('[data-action="keep-result"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  saved = JSON.parse(await fs.readFile(savePath, 'utf8'));
  assert.equal(saved.inventory[0].boxNumber, 5);
  const second = spawn(executablePath, args, { env, windowsHide: true, stdio: 'ignore' });
  const exitCode = await Promise.race([
    new Promise(resolve => second.once('exit', resolve)),
    new Promise((_, reject) => { const timer = setTimeout(() => { second.kill(); reject(new Error('Second instance did not exit')); }, 10000); timer.unref(); })
  ]);
  assert.equal(exitCode, 0);
  console.log('PASS: Electron launch, isolated preload, pending recovery, native save, reload, inventory sale, packaged art, numbered purchase/reveal, single-instance lock.');
} finally { await app.close(); }
