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
    image.src = getComputedStyle(document.querySelector('.scene-backdrop')).backgroundImage.slice(5, -2);
  }));
  assert.equal(backgroundLoaded, true, 'Packaged workstation art is available');
  const hostLoaded = await page.evaluate(() => new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image.naturalWidth >= 1024);
    image.onerror = () => resolve(false);
    image.src = getComputedStyle(document.querySelector('.scene-backdrop')).backgroundImage.slice(5, -2);
  }));
  assert.equal(hostLoaded, true, 'Packaged original static host artwork is available');
  // The live room deliberately pauses between orders when its window is hidden.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].showInactive());
  await page.evaluate(() => {
    window.playedVoices = [];
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      const result = original.apply(this, args);
      result.then(() => { if (this.src.endsWith('.wav')) window.playedVoices.push(this.src); }, () => {});
      return result;
    };
  });
  const chosen = page.locator('.queue-order[data-slot="1"]:not(.is-opening)');
  const boxNumber = Number(await chosen.locator('.queue-package b').textContent());
  await chosen.click();
  await page.locator('#buy').click();
  await page.waitForSelector('[data-action="keep-result"]');
  saved = JSON.parse(await fs.readFile(savePath, 'utf8'));
  assert.ok(await page.evaluate(() => window.playedVoices.some(source => source.endsWith('/opening.wav'))), 'offline opening voice plays inside Electron');
  assert.ok(await page.evaluate(() => window.playedVoices.some(source => /\/(common|rare|epic|legendary)\.wav$/.test(source))), 'offline reward voice plays inside Electron');
  assert.equal(saved.pending.boxNumber, boxNumber); assert.equal(saved.opened, 2); assert.equal(saved.coins, 1900);
  await page.locator('[data-action="keep-result"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  saved = JSON.parse(await fs.readFile(savePath, 'utf8'));
  assert.equal(saved.inventory[0].boxNumber, boxNumber);
  const second = spawn(executablePath, args, { env, windowsHide: true, stdio: 'ignore' });
  const exitCode = await Promise.race([
    new Promise(resolve => second.once('exit', resolve)),
    new Promise((_, reject) => { const timer = setTimeout(() => { second.kill(); reject(new Error('Second instance did not exit')); }, 10000); timer.unref(); })
  ]);
  assert.equal(exitCode, 0);
  console.log('PASS: Electron launch, isolated preload, pending recovery, native save, reload, inventory sale, packaged art, numbered purchase/reveal, single-instance lock.');
} finally { await app.close(); }
