import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createGame, buy, getItem, getSeries } from '../src/game.mjs';

const userData = path.resolve('artifacts', `desktop-test-${Date.now()}`);
await fs.mkdir(userData, { recursive: true });
const pending = buy(createGame(), 'wei', () => .99);
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
  assert.equal(await page.locator('.result-panel h2').textContent(), getItem(pending.pending.itemId).name);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined', 'Renderer has no Node.js access');
  assert.equal(await page.evaluate(() => typeof window.desktop.writeSave), 'function');
  assert.deepEqual(await page.evaluate(() => Object.keys(window.desktop).sort()), ['backupSave', 'fullscreen', 'readSave', 'writeSave']);
  assert.equal(await page.evaluate(() => typeof window.process), 'undefined', 'Renderer cannot inspect Node process or environment');
  const originalFile = await fs.readFile(savePath, 'utf8');
  const rejectedWrites = await page.evaluate(async () => {
    const results = [];
    for (const invalid of [null, {}, 'not-json', 'x'.repeat(5000001)]) {
      try { await window.desktop.writeSave(invalid); results.push(false); }
      catch { results.push(true); }
    }
    return results;
  });
  assert.deepEqual(rejectedWrites, [true, true, true, true], 'Bridge rejects non-string, invalid JSON and oversized requests');
  assert.equal(await fs.readFile(savePath, 'utf8'), originalFile, 'Rejected IPC requests do not overwrite the native save');
  await page.locator('[data-action="keep-result"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  let saved = JSON.parse(await fs.readFile(savePath, 'utf8'));
  assert.equal(saved.inventory.length, 1); assert.equal(saved.coins, 1100); assert.equal(saved.pending, null);
  await page.reload();
  await page.locator('#nav-bag').click();
  assert.equal(await page.locator('.item-card h3').textContent(), getItem(pending.pending.itemId).name);
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
  await page.waitForSelector('.reel-track');
  const reelAssets = await page.locator('.reel-track').evaluate(async track => {
    const sources = [...new Set([...track.querySelectorAll('image')].map(image => image.getAttribute('href')))];
    return Promise.all(sources.map(async source => {
      const image = new Image(); image.src = source;
      try { await image.decode(); } catch (error) { throw new Error(`Live reel image decode failed: ${source}: ${error.message}`); }
      return { source, width: image.naturalWidth };
    }));
  });
  assert.ok(reelAssets.length > 1 && reelAssets.length <= 15, 'Normal rolling uses multiple cards from its one-faction pool');
  assert.ok(reelAssets.every(image => image.width >= 100 && image.source.includes('/portraits/')), 'Every actual rolling image decodes under normal concurrent presentation');
  console.log(`PASS: actual paid reel concurrently decoded ${reelAssets.length} unique warrior images.`);
  await page.waitForSelector('[data-action="keep-result"]');
  saved = JSON.parse(await fs.readFile(savePath, 'utf8'));
  assert.ok(await page.evaluate(() => window.playedVoices.some(source => source.endsWith('/opening.wav'))), 'offline opening voice plays inside Electron');
  assert.ok(await page.evaluate(() => window.playedVoices.some(source => /\/(common|rare|epic|legendary)\.wav$/.test(source))), 'offline reward voice plays inside Electron');
  assert.equal(saved.pending.boxNumber, boxNumber); assert.equal(saved.opened, 2); assert.equal(saved.coins, 2000 - getSeries(saved.pending.seriesId).price);
  await page.locator('[data-action="keep-result"]').click();
  await page.waitForFunction(() => !document.querySelector('#modal').open);
  saved = JSON.parse(await fs.readFile(savePath, 'utf8'));
  assert.equal(saved.inventory[0].boxNumber, boxNumber);
  const cardAssets = await page.evaluate(async () => {
    const { SERIES } = await import('./src/game.mjs');
    const { card, pack } = await import('./src/art.mjs');
    const container = document.createElement('div');
    container.innerHTML = SERIES.flatMap(series => [pack(series), card(series.items[0], 120, { back: true }), ...series.items.map(item => card(item))]).join('');
    const sources = [...new Set([...container.querySelectorAll('image')].map(image => image.getAttribute('href')))];
    // Preserve the original full-catalog pressure regression in this same game session.
    await Promise.all(sources.map(async source => {
      const image = new Image(); image.src = source;
      try { await image.decode(); }
      catch (error) { throw new Error(`Concurrent desktop asset decode failed: ${source}: ${error.message}`); }
    }));
    const decoded = [];
    // Follow the concurrent sweep with a second independent sequential sweep.
    for (const source of sources) {
      const image = new Image(); image.src = source;
      try { await image.decode(); } catch (error) { throw new Error(`Could not decode desktop card asset: ${source}: ${error.message}`); }
      decoded.push({ source, width: image.naturalWidth, height: image.naturalHeight });
      image.src = '';
    }
    return decoded;
  });
  assert.equal(cardAssets.length, 51, 'The desktop app includes every portrait, package and card back');
  assert.ok(cardAssets.every(image => image.source.startsWith('file:') && image.width >= 100 && image.height >= 100), 'All 51 images actually decode from local desktop resources');
  console.log('PASS: same-session 51 concurrent asset decodes followed by 51 sequential decodes after real gameplay.');
  const second = spawn(executablePath, args, { env, windowsHide: true, stdio: 'ignore' });
  const exitCode = await Promise.race([
    new Promise(resolve => second.once('exit', resolve)),
    new Promise((_, reject) => { const timer = setTimeout(() => { second.kill(); reject(new Error('Second instance did not exit')); }, 10000); timer.unref(); })
  ]);
  assert.equal(exitCode, 0);
  console.log('PASS: Electron launch, isolated preload, pending recovery, native save, reload, inventory sale, packaged art, numbered purchase/reveal, single-instance lock.');
} finally { await app.close(); }
