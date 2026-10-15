import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4173');
  const assets = await page.evaluate(async () => {
    const { SERIES } = await import('./src/game.mjs');
    const { card, pack } = await import('./src/art.mjs');
    const markup = SERIES.flatMap(series => [pack(series, 180), card(series.items[0], 180, { back: true }), ...series.items.map(item => card(item, 180))]);
    const div = document.createElement('div'); div.innerHTML = markup.join('');
    const paths = [...new Set([...div.querySelectorAll('image, img')].map(image => image.getAttribute('href') || image.getAttribute('xlink:href') || image.getAttribute('src')))];
    const images = await Promise.all(paths.map(async source => {
      const image = new Image(); image.src = source; await image.decode();
      const response = await fetch(source);
      const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer());
      return { source, width: image.naturalWidth, height: image.naturalHeight, hash: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
    }));
    return images;
  });
  const portraits = assets.filter(asset => asset.source.includes('/portraits/'));
  assert.equal(portraits.length, 45, 'each warrior points to an independent portrait');
  assert.equal(new Set(portraits.map(asset => asset.hash)).size, 45, 'portrait files contain different pixels');
  assert.ok(assets.length >= 51, '45 portraits plus three pack and three reverse-side assets are actually referenced');
  assert.equal(new Set(assets.map(asset => asset.hash)).size, assets.length);
  assert.ok(assets.every(asset => asset.width >= 100 && asset.height >= 100));

  console.log(`PASS: ${assets.length} actual raster assets decode; 45 unique warrior portrait files plus three packs and three reverses, all distinct SHA-256 and usable dimensions.`);
} finally { await browser.close(); }
