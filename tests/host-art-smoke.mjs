import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame } from '../src/game.mjs';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
// This context has its own storage and cannot touch the desktop player's save.
const context = await browser.newContext({ viewport: { width: 1600, height: 960 }, reducedMotion: 'no-preference' });
const initial = createGame();
initial.settings.fast = false;
initial.settings.sound = false;
initial.settings.music = false;
await context.addInitScript(state => localStorage.setItem('live-shopping-simulator-v1', JSON.stringify(state)), initial);
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));

async function armSnapshot(phase) {
  await page.waitForFunction(phase => {
    const stage = document.querySelector('.actor-stage');
    const arm = stage?.querySelector('.actor-arm-left');
    return stage?.dataset.phase === phase && arm?.getAnimations().some(animation => {
      const progress = animation.effect.getComputedTiming().progress;
      return progress !== null && progress > .55 && progress < 1;
    });
  }, phase);
  return page.evaluate(() => ['.actor-arm-left', '.actor-arm-right'].map((selector, index) => {
    const arm = document.querySelector(selector);
    const style = getComputedStyle(arm);
    const matrix = new DOMMatrix(style.transform);
    const [pivotX, pivotY] = style.transformOrigin.split(' ').map(Number.parseFloat);
    const shoulder = new DOMPoint(pivotX, pivotY).matrixTransform(arm.getScreenCTM());
    // Points are the pinch fingertips in the cropped artwork, before its fixed pose rotation.
    const fingertip = new DOMPoint(index === 0 ? 271 : 273.2, 250.2).matrixTransform(arm.querySelector('g').getScreenCTM());
    return { x: fingertip.x, y: fingertip.y, shoulder: { x: shoulder.x, y: shoulder.y }, angle: Math.atan2(matrix.b, matrix.a) };
  }));
}

try {
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4173');
  await page.waitForSelector('.actor-portrait');
  for (const selector of ['.actor-portrait', '.actor-arm-left', '.actor-arm-right']) {
    assert.ok(await page.locator(`${selector} image`).count() > 0, `${selector} uses the illustrated raster character`);
  }
  await page.locator('.actor-canvas image').evaluateAll(async images => {
    await Promise.all(images.map(async element => {
      const image = new Image(); image.src = element.href.baseVal;
      await image.decode();
    }));
  });

  const atlas = await page.evaluate(async () => {
    const image = new Image();
    image.src = new URL('/assets/host-xiaotao-atlas.png', location.href).href;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0; let opaque = 0; let partial = 0;
    for (let i = 3; i < rgba.length; i += 4) {
      if (rgba[i] === 0) transparent++;
      // Image generation can leave the solid interior at alpha 252–254.
      else if (rgba[i] >= 250) opaque++;
      else partial++;
    }
    return { width: canvas.width, height: canvas.height, transparent, opaque, partial, total: rgba.length / 4 };
  });
  assert.ok(atlas.width >= 1024 && atlas.height >= 512, 'character atlas has sufficient resolution');
  assert.ok(atlas.transparent > atlas.total * .1, 'atlas has real transparent background pixels');
  assert.ok(atlas.opaque > atlas.total * .05, 'atlas contains visible nearly opaque character artwork');
  assert.ok(atlas.partial > 0, 'character edges retain alpha antialiasing');

  const layerScales = await page.evaluate(() => ['.actor-portrait', '.actor-arm-left', '.actor-arm-right'].map(selector => {
    const viewport = document.querySelector(`${selector} svg`);
    return { x: viewport.width.baseVal.value / viewport.viewBox.baseVal.width,
      y: viewport.height.baseVal.value / viewport.viewBox.baseVal.height };
  }));
  for (const scale of layerScales) assert.ok(Math.abs(scale.x - scale.y) < .001, 'body and arm textures keep their natural aspect ratio');
  for (const arm of layerScales.slice(1)) assert.ok(arm.x / layerScales[0].x >= .85 && arm.x / layerScales[0].x <= 1.15, 'arm artwork stays at the same visual scale as the torso, avoiding miniature hands');

  const grip = await armSnapshot('grip');
  await page.screenshot({ path: 'artifacts/host-art-grip.png' });
  const tear = await armSnapshot('tear');
  await page.screenshot({ path: 'artifacts/host-art-tear.png' });
  assert.ok(tear[0].x < grip[0].x - 10, 'left arm pulls outward when tearing');
  assert.ok(tear[1].x > grip[1].x + 10, 'right arm pulls outward when tearing');
  assert.ok(Math.abs(tear[0].angle - grip[0].angle) > .05, 'left arm rotates during tearing');
  assert.ok(Math.abs(tear[1].angle - grip[1].angle) > .05, 'right arm rotates during tearing');
  for (let i = 0; i < 2; i++) {
    assert.ok(Math.hypot(tear[i].shoulder.x - grip[i].shoulder.x, tear[i].shoulder.y - grip[i].shoulder.y) < 6, 'shoulder stays attached while the hand pulls outward');
  }

  for (const size of [{ width: 1280, height: 720 }, { width: 1600, height: 960 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(size);
    await page.waitForFunction(() => document.querySelector('.actor-stage')?.dataset.phase === 'reveal' && Number(getComputedStyle(document.querySelector('.actor-result-card')).opacity) > .95);
    for (const selector of ['.actor-stage', '#buy']) {
      const bounds = await page.locator(selector).boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= size.width + 1 && bounds.y + bounds.height <= size.height + 1, `${selector} fits ${size.width}x${size.height}`);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
    await page.screenshot({ path: `artifacts/host-art-${size.width}x${size.height}.png` });
  }
  assert.deepEqual(errors, []);
  console.log(`PASS: transparent ${atlas.width}x${atlas.height} host atlas; raster portrait and arms; coordinated opposite arm motion; three landscape viewport screenshots; no page errors.`);
} finally {
  await browser.close();
}
