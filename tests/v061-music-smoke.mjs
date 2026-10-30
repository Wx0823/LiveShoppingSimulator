import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import { createGame } from '../src/game.mjs';

const url = process.env.GAME_URL || 'http://127.0.0.1:4173';
const unboxing = (await fs.readFile('src/unboxing-music.mjs', 'utf8')).replace('export function createUnboxingMusic(', 'function innerCreateUnboxingMusic(') + `
export function createUnboxingMusic() {
  const qa = window.musicQA;
  const player = innerCreateUnboxingMusic({ createContext() {
    const context = new AudioContext();
    const original = context.createOscillator.bind(context);
    context.createOscillator = () => {
      const source = original(); qa.nodes++;
      const start = source.start.bind(source), stop = source.stop.bind(source);
      source.start = (...args) => { qa.sourceStarts++; return start(...args); };
      source.stop = (...args) => { qa.sourceStops++; return stop(...args); };
      return source;
    };
    return context;
  }});
  return { ...player,
    start(options) { const before = qa.nodes; const result = player.start(options); qa.starts.push({ ...options, result, nodes: qa.nodes - before }); return result; },
    stop() { qa.stops++; return player.stop(); }
  };
}`;
const regular = (await fs.readFile('src/music.mjs', 'utf8')).replace('export function createMusicPlayer(', 'function innerCreateMusicPlayer(') + `
export function createMusicPlayer(...args) {
  const player = innerCreateMusicPlayer(...args);
  return { ...player, setPaused(value) { window.musicQA.paused.push(value); return player.setPaused(value); } };
}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  for (const kind of ['normal-skip', 'fast', 'reduced', 'disabled', 'zero', 'hidden']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: kind === 'reduced' ? 'reduce' : 'no-preference' });
    const state = createGame();
    state.settings = { ...state.settings, sound: false, music: kind !== 'disabled', musicVolume: kind === 'zero' ? 0 : .35, fast: ['fast', 'disabled', 'zero'].includes(kind) };
    await context.addInitScript(state => {
      localStorage.setItem('live-shopping-simulator-v1', JSON.stringify(state));
      window.musicQA = { starts: [], stops: 0, paused: [], nodes: 0, sourceStarts: 0, sourceStops: 0 };
      window.qaSetHidden = value => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
        document.dispatchEvent(new Event('visibilitychange'));
      };
    }, state);
    await context.route('**/src/unboxing-music.mjs', route => route.fulfill({ contentType: 'text/javascript', body: unboxing }));
    await context.route('**/src/music.mjs', route => route.fulfill({ contentType: 'text/javascript', body: regular }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.locator('.queue-order[data-slot="1"]:not(.is-opening)').click();
    await page.locator('#buy').click();
    // Reduced motion can reveal before a transient reel becomes visible.
    await page.waitForFunction(() => document.querySelector('.reel-track') || document.querySelector('[data-action="keep-result"]'), null, { timeout: 60000 });
    if (kind === 'normal-skip' || kind === 'hidden') {
      await page.waitForFunction(() => window.musicQA.starts.length > 0);
      const during = await page.evaluate(() => structuredClone(window.musicQA));
      assert.equal(during.starts[0].durationMs, 4500);
      assert.ok(during.starts[0].result && during.starts[0].nodes > 0 && during.sourceStarts > 0);
      assert.equal(during.paused.at(-1), true);
      if (kind === 'normal-skip') await page.locator('.reel-skip').click();
      else {
        await page.evaluate(() => window.qaSetHidden(true));
        const hidden = await page.evaluate(() => structuredClone(window.musicQA));
        assert.ok(hidden.stops > during.stops && hidden.sourceStops > during.sourceStops);
        assert.equal(hidden.paused.at(-1), true);
        await page.evaluate(() => window.qaSetHidden(false));
      }
    }
    await page.waitForSelector('[data-action="keep-result"]', { timeout: 60000 });
    const qa = await page.evaluate(() => structuredClone(window.musicQA));
    assert.deepEqual(errors, []);
    assert.ok(qa.paused.includes(true) && qa.paused.at(-1) === false, 'Regular music resumes after reveal');
    if (kind === 'fast') { assert.equal(qa.starts[0].durationMs, 620); assert.ok(qa.starts[0].result && qa.nodes > 0); }
    if (kind === 'reduced') { assert.equal(qa.starts[0].durationMs, 0); assert.equal(qa.starts[0].result, false); assert.equal(qa.nodes, 0); }
    if (kind === 'disabled') { assert.equal(qa.starts.length, 0); assert.equal(qa.nodes, 0); }
    if (kind === 'zero') { assert.equal(qa.starts[0].volume, 0); assert.equal(qa.starts[0].result, false); assert.equal(qa.nodes, 0); }
    assert.ok(qa.stops > 0);
    console.log(`PASS ${kind}: ${JSON.stringify(qa)}`);
    await context.close();
  }
} finally { await browser.close(); }
