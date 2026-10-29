import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createGame } from '../src/game.mjs';

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const requests = [];
  page.on('request', request => { if (request.url().includes('/assets/voice/')) requests.push(request.url()); });
  await page.addInitScript(state => {
    localStorage.setItem('live-shopping-simulator-v1', JSON.stringify(state));
    window.voiceCalls = [];
    window.voiceStarted = [];
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (this.src.includes('/assets/voice/')) window.voiceCalls.push(this.src);
      const result = original.apply(this, args);
      result.then(() => { if (this.src.includes('/assets/voice/')) window.voiceStarted.push(this.src); }, () => {});
      return result;
    };
  }, { ...createGame(), settings: { ...createGame().settings, sound: true, music: false, fast: false } });
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:4173');
  const chosen = page.locator('.queue-order[data-slot="1"]:not(.is-opening)');
  await chosen.click();
  await page.locator('#buy').click();
  await page.waitForSelector('.reel-track');
  await page.waitForTimeout(800);
  assert.deepEqual(await page.evaluate(() => window.voiceCalls), [], 'normal unboxing progress has no speech');
  await page.waitForSelector('[data-action="keep-result"]');
  const [calls, started] = await page.evaluate(() => [window.voiceCalls, window.voiceStarted]);
  assert.equal(requests.some(url => url.endsWith('/opening.wav')), false, 'removed progress clip is not requested or preloaded');
  assert.equal(calls.some(url => url.endsWith('/opening.wav')), false, 'removed progress clip is never played');
  assert.equal(calls.filter(url => /\/(common|rare|epic|legendary)\.wav$/.test(url)).length, 1, 'one quality voice after reveal');
  assert.ok(started.some(url => /\/(common|rare|epic|legendary)\.wav$/.test(url)), 'quality voice playback actually succeeds');
  console.log('PASS: normal paid opening is silent during progress; no opening.wav request/preload/play; one quality voice successfully plays at reveal.');
} finally { await browser.close(); }
