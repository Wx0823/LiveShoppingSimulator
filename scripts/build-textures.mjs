// Export runtime textures from unchanged high-resolution artwork masters.
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve('assets/three-kingdoms');
const names = [
  ...(await fs.readdir(root)).filter(name => name.endsWith('.png')),
  ...(await fs.readdir(path.join(root, 'portraits'))).filter(name => name.endsWith('.png')).map(name => `portraits/${name}`),
];
if (names.length !== 51) throw new Error(`Expected 51 artwork masters, found ${names.length}`);
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
let inputBytes = 0, outputBytes = 0;
try {
  const page = await browser.newPage();
  for (const name of names) {
    const source = await fs.readFile(path.join(root, name));
    const encoded = await page.evaluate(async data => {
      const image = new Image(); image.src = data; await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(540, image.naturalWidth);
      canvas.height = Math.round(canvas.width * image.naturalHeight / image.naturalWidth);
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/webp', .9);
      if (!dataUrl.startsWith('data:image/webp;')) throw new Error('WebP export unavailable');
      return dataUrl.split(',')[1];
    }, `data:image/png;base64,${source.toString('base64')}`);
    const destination = path.join(root, 'runtime', name.replace(/\.png$/, '.webp'));
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const texture = Buffer.from(encoded, 'base64');
    await fs.writeFile(destination, texture);
    inputBytes += source.length; outputBytes += texture.length;
  }
  console.log(`Exported ${names.length} runtime textures: ${(inputBytes / 1048576).toFixed(1)} MiB masters → ${(outputBytes / 1048576).toFixed(1)} MiB WebP; 540px wide, original aspect ratios.`);
} finally { await browser.close(); }
