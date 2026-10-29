// Read-only, compact release snapshot; file presence does not imply visual approval.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SERIES } from '../src/game.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);
async function stat(relative) {
  try { return await fs.stat(path.join(root, relative)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
const [packageText, html, git] = await Promise.all([
  fs.readFile(path.join(root, 'package.json'), 'utf8'),
  fs.readFile(path.join(root, 'index.html'), 'utf8'),
  run('git', ['status', '--porcelain=v1', '--untracked-files=normal'], { cwd: root, windowsHide: true }),
]);
const version = JSON.parse(packageText).version;
const factions = {};
for (const faction of ['wei', 'shu', 'wu']) {
  const items = SERIES.flatMap(series => series.items).filter(item => item.faction === faction);
  if (items.length !== 15) throw new Error(`Expected 15 ${faction} items, got ${items.length}`);
  const names = [
    ...items.map(item => `portraits/${faction}-${item.portraitSlug}.png`),
    `back-${faction}.png`, `pack-${faction}.png`,
  ];
  const missing = [], staleOrMissingTextures = [];
  let newestMaster = null;
  await Promise.all(names.map(async name => {
    const [master, texture] = await Promise.all([
      stat(`assets/three-kingdoms/${name}`),
      stat(`assets/three-kingdoms/runtime/${name.replace(/\.png$/, '.webp')}`),
    ]);
    if (!master || master.size === 0) missing.push(name);
    if (!texture || texture.size === 0 || (master && master.mtimeMs > texture.mtimeMs)) staleOrMissingTextures.push(name);
    if (master && (!newestMaster || master.mtimeMs > newestMaster.ms)) newestMaster = { file: name, ms: master.mtimeMs };
  }));
  factions[faction] = {
    expectedMasters: names.length, presentMasters: names.length - missing.length,
    missing: missing.sort(), staleOrMissingTextures: staleOrMissingTextures.sort(),
    newestMaster: newestMaster && { file: newestMaster.file, time: new Date(newestMaster.ms).toISOString() },
  };
}
const changed = git.stdout.trimEnd().split(/\r?\n/).filter(Boolean);
console.log(JSON.stringify({
  at: new Date().toISOString(), version, uiVersionMatches: html.includes(`v${version}`),
  changedFiles: changed.length, stagedFiles: changed.filter(line => line[0] !== ' ' && line[0] !== '?').length,
  factions, visualApproval: 'not_checked', tests: 'not_run', packageBuild: 'not_checked',
}, null, 2));
