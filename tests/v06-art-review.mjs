import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { SERIES } from '../src/game.mjs';

const hash = buffer => createHash('sha256').update(buffer).digest('hex');
const baseline = process.env.ART_BASELINE || 'v0.5.1';
for (const series of SERIES) for (const item of series.items) {
  const filename = `assets/three-kingdoms/portraits/${series.id}-${item.portraitSlug}.png`;
  assert.notEqual(hash(await fs.readFile(filename)), hash(execFileSync('git', ['show', `${baseline}:${filename}`], { maxBuffer: 20000000 })), `${item.name} master differs from ${baseline}`);
}
await fs.mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1320, height: 1280 } });
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4173');
  async function show(mode, faction) {
    await page.evaluate(async ({ mode, faction }) => {
      const { SERIES } = await import('./src/game.mjs');
      const { card, pack } = await import('./src/art.mjs');
      const selected = SERIES.find(series => series.id === faction);
      const content = mode === 'faction' ? selected.items.map(item => card(item, 240))
        : mode === 'legendary' ? SERIES.map(series => card(series.items.at(-1), 340))
          : SERIES.flatMap(series => [pack(series, 240), card(series.items[0], 240, { back: true })]);
      document.querySelectorAll('link[rel="stylesheet"],style').forEach(node => node.remove());
      document.body.innerHTML = `<main style="display:grid;grid-template-columns:repeat(${mode === 'faction' ? 5 : 3},1fr);gap:16px;padding:24px;background:#f2ede2">${content.map(markup => `<div style="display:flex;justify-content:center">${markup}</div>`).join('')}</main>`;
      document.body.style.cssText = 'margin:0;background:#f2ede2;display:block;min-width:0;height:auto;overflow:visible';
      await Promise.all([...document.querySelectorAll('image')].map(async node => { const image = new Image(); image.src = node.getAttribute('href'); await image.decode(); }));
    }, { mode, faction });
    await page.locator('main').screenshot({ path: `artifacts/v0.6.0-${mode === 'faction' ? faction + '-cards' : mode === 'legendary' ? 'legendary-preview' : 'pack-back-review'}.png` });
  }
  for (const series of SERIES) await show('faction', series.id);
  await show('pack-back');
  await show('legendary');
  console.log(`PASS: all 45 portrait masters differ from ${baseline}; game-rendered 45-card, pack/back and legendary preview review sheets created. Human visual review still required.`);
} finally { await browser.close(); }
