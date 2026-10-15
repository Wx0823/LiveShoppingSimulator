import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame } from '../src/game.mjs';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const context = await browser.newContext({ reducedMotion: 'no-preference' });
const initial = createGame();
initial.settings.sound = false; initial.settings.music = false;
await context.addInitScript(state => localStorage.setItem('live-shopping-simulator-v1', JSON.stringify(state)), initial);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4173');
  await page.waitForSelector('.actor-stage');
  const backdrop = await page.locator('.scene-backdrop').evaluate(async element => {
    const style = getComputedStyle(element);
    const image = new Image(); image.src = style.backgroundImage.slice(5, -2); await image.decode();
    return { source: image.src, width: image.naturalWidth, animation: style.animationName };
  });
  assert.ok(backdrop.source.endsWith('/assets/studio-wide.png'), 'original complete host illustration is restored');
  assert.ok(backdrop.width > 2000); assert.equal(backdrop.animation, 'none');
  assert.equal(await page.locator('.actor-arm, .actor-portrait').count(), 0, 'no separate moving body parts cover the original host');
  await page.evaluate(() => {
    window.scenePhases = new Set();
    const stage = document.querySelector('.actor-stage');
    new MutationObserver(() => window.scenePhases.add(stage.dataset.phase)).observe(stage, { attributes: true, attributeFilter: ['data-phase'] });
  });
  for (const size of [{ width:1280, height:720 }, { width:1600, height:960 }, { width:1920, height:1080 }]) {
    await page.setViewportSize(size);
    await page.waitForFunction(() => document.querySelector('.actor-stage').dataset.phase === 'reveal' && Number(getComputedStyle(document.querySelector('.actor-result-card')).opacity) > .9);
    for (const selector of ['.actor-stage', '#buy', '.queue-panel']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width + 1 && box.y + box.height <= size.height + 1, `${selector} fits ${size.width}x${size.height}`);
    }
    const actor = await page.locator('.actor-stage').boundingBox();
    const stage = await page.locator('#stage').boundingBox();
    assert.ok(actor.x + actor.width <= stage.x + stage.width * .68, 'automatic opening stays left of the host');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path:`artifacts/static-host-${size.width}.png` });
  }
  await page.waitForFunction(() => ['receive','grip','tear','reveal','clear'].every(phase => window.scenePhases.has(phase)));
  const audio = await page.evaluate(async () => {
    const context = new AudioContext();
    try {
      return await Promise.all(['opening','common','rare','epic','legendary'].map(async name => {
        const response = await fetch(`assets/voice/${name}.wav`);
        if (!response.ok) throw new Error(`Missing voice: ${name}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        return { name, duration:buffer.duration, audible:buffer.getChannelData(0).some(value => Math.abs(value) > .01) };
      }));
    } finally { await context.close(); }
  });
  for (const clip of audio) assert.ok(clip.audible && clip.duration > .5 && clip.duration < 6, `${clip.name} is playable short offline speech`);
  assert.deepEqual(errors, []);
  console.log('PASS: original static host; uninterrupted tabletop phases; three landscape layouts; five decodable offline voice clips.');
} finally { await browser.close(); }
