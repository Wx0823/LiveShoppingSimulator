import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { _electron as electron } from 'playwright';
import { createGame } from '../src/game.mjs';
import { publishStableBuild } from '../scripts/publish-build.mjs';

const exec = promisify(execFile);
const workspace = process.cwd();
const manifest = JSON.parse(await fs.readFile('package.json', 'utf8'));
const runId = Date.now();
const fixture = path.resolve('artifacts', `launcher-test-${runId}`, '中文 项目');
const otherRoot = path.resolve('artifacts', `launcher-other-${runId}`);
const currentSource = path.resolve(`dist/v${manifest.version}/LiveShoppingSimulator-win32-x64`);
const oldSource = path.resolve('dist/v0.4.2/LiveShoppingSimulator-win32-x64');
const currentBuild = path.join(fixture, `dist/v${manifest.version}/LiveShoppingSimulator-win32-x64`);
const stableBuild = path.join(fixture, 'dist/LiveShoppingSimulator-win32-x64');
const exeName = 'LiveShoppingSimulator.exe';
const currentExe = path.join(currentBuild, exeName);
const stableExe = path.join(stableBuild, exeName);
const otherExe = path.join(otherRoot, exeName);
const userData = path.join(fixture, 'isolated-user-data');
const savePath = path.join(userData, 'save-v1.json');
const env = { ...process.env, NODE_ENV: 'test', LSS_TEST_USER_DATA: userData };
delete env.ELECTRON_RUN_AS_NODE;
const launchScript = path.resolve('scripts/launch.ps1');
const fixtureManifest = version => JSON.stringify({ version, description: '拆播间 · 三国中文描述 · UTF-8 无 BOM' });
const legacy = {
  ...createGame(), coins: 777, opened: 2, discovered: ['street-common', 'forest-legendary'],
  inventory: [{ id: 'box-1', itemId: 'street-common', seriesId: 'street', boxNumber: 1 }],
  pending: { id: 'box-2', itemId: 'forest-legendary', seriesId: 'forest', boxNumber: 4, status: 'ready', queueAhead: 0 },
};
legacy.settings.sound = false; legacy.settings.music = false;
const economy = state => ({ coins: state.coins, opened: state.opened, sold: state.sold, inventory: state.inventory, discovered: state.discovered, pending: state.pending });
const ps = script => exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); ' + script], { windowsHide: true, encoding: 'utf8' });
async function processes() {
  const result = await ps("@(Get-CimInstance Win32_Process -Filter \"Name='LiveShoppingSimulator.exe'\" | Select-Object ProcessId,ExecutablePath,CommandLine) | ConvertTo-Json -Compress");
  if (!result.stdout.trim()) return [];
  const rows = JSON.parse(result.stdout); return Array.isArray(rows) ? rows : [rows];
}
const samePath = (a, b) => (a || '').toLowerCase() === b.toLowerCase();
const main = (rows, executable) => rows.filter(row => samePath(row.ExecutablePath, executable) && !/--type=/.test(row.CommandLine || ''));
async function waitFor(read, message, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { const value = await read(); if (value) return value; await new Promise(resolve => setTimeout(resolve, 200)); }
  throw new Error(message);
}
async function launch(checkOnly = false) {
  const quote = value => `'${value.replace(/'/g, "''")}'`;
  const invocation = checkOnly ? ['-Command', `[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); & ${quote(launchScript)} -ProjectRoot ${quote(fixture)} -CheckOnly`] : ['-File', launchScript, '-ProjectRoot', fixture];
  return exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...invocation], { env, windowsHide: true, encoding: 'utf8', timeout: 25000 });
}
const hash = async filename => createHash('sha256').update(await fs.readFile(filename)).digest('hex');
let oldApp, otherApp;
try {
  await fs.mkdir(userData, { recursive: true });
  await fs.mkdir(path.join(fixture, 'scripts'), { recursive: true });
  await fs.copyFile(launchScript, path.join(fixture, 'scripts/launch.ps1'));
  await fs.copyFile(path.join(workspace, '启动游戏.cmd'), path.join(fixture, '启动游戏.cmd'));
  await fs.writeFile(path.join(fixture, 'package.json'), fixtureManifest(manifest.version));
  await fs.writeFile(savePath, JSON.stringify(legacy));
  await Promise.all([fs.cp(currentSource, currentBuild, { recursive: true }), fs.cp(oldSource, stableBuild, { recursive: true }), fs.cp(oldSource, otherRoot, { recursive: true })]);
  oldApp = await electron.launch({ executablePath: stableExe, args: [], env });
  const oldPage = await oldApp.firstWindow();
  await oldPage.waitForSelector('[data-action="keep-result"]');
  assert.equal(await oldPage.locator('.result-panel h2').textContent(), '森林守护者');
  await oldApp.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setPosition(-2200, 0); window.showInactive(); });
  const oldPid = await oldApp.evaluate(() => process.pid);
  otherApp = await electron.launch({ executablePath: otherExe, args: [], env: { ...env, LSS_TEST_USER_DATA: path.join(otherRoot, 'isolated-user-data') } });
  await otherApp.firstWindow();
  const otherPid = await otherApp.evaluate(() => process.pid);

  const selected = JSON.parse((await launch(true)).stdout.trim());
  assert.equal(selected.version, manifest.version);
  assert.ok(samePath(selected.executable, currentExe), 'manifest version takes priority over the traditional old entry');
  const inspectedProcesses = await processes();
  assert.ok(inspectedProcesses.some(row => row.ProcessId === oldPid), `CheckOnly does not close old PID ${oldPid}; observed: ${JSON.stringify(inspectedProcesses.map(row => ({ pid: row.ProcessId, path: row.ExecutablePath })))}`);
  const oldHash = await hash(path.join(stableBuild, 'resources/app.asar'));
  const warnings = [];
  const warn = console.warn; console.warn = (...args) => warnings.push(args.join(' '));
  try { assert.equal(publishStableBuild(fixture, currentBuild), false, 'running traditional entry must not be overwritten'); }
  finally { console.warn = warn; }
  assert.ok(warnings.some(message => message.includes('running') && message.includes('intact')));
  assert.equal(await hash(path.join(stableBuild, 'resources/app.asar')), oldHash);

  await fs.writeFile(path.join(fixture, 'package.json'), fixtureManifest('99.99.99'));
  await assert.rejects(launch(true), error => /Current build is missing/.test(error.stderr));
  assert.ok((await processes()).some(row => row.ProcessId === oldPid), 'missing build inspection leaves the old process intact');
  const devExe = path.join(fixture, 'node_modules/electron/dist/electron.exe');
  await fs.mkdir(path.dirname(devExe), { recursive: true }); await fs.writeFile(devExe, 'QA check-only marker, never executed');
  const fallback = JSON.parse((await launch(true)).stdout.trim());
  assert.ok(samePath(fallback.executable, devExe));
  assert.deepEqual(fallback.arguments, [`"${fixture}"`], 'development fallback quotes Chinese/spaced root');
  await fs.writeFile(path.join(fixture, 'package.json'), fixtureManifest(manifest.version));

  await launch();
  await waitFor(async () => !(await processes()).some(row => row.ProcessId === oldPid), 'old project instance did not exit gracefully');
  const first = await waitFor(async () => main(await processes(), currentExe)[0], 'current build did not start');
  assert.ok((await processes()).some(row => row.ProcessId === otherPid), 'another project root is not closed');
  await waitFor(async () => (await fs.readFile(savePath, 'utf8')).includes('forest-legendary'), 'saved pending result is missing');
  assert.deepEqual(economy(JSON.parse(await fs.readFile(savePath, 'utf8'))), economy(legacy), 'switching versions retains balance, old bag, discovery and exact paid result');
  await exec('cmd.exe', ['/d', '/s', '/c', `""${path.join(fixture, '启动游戏.cmd')}""`], { cwd: workspace, env, windowsHide: true, windowsVerbatimArguments: true, encoding: 'utf8', timeout: 25000 });
  await new Promise(resolve => setTimeout(resolve, 900));
  const current = main(await processes(), currentExe);
  assert.equal(current.length, 1, 'opening again retains one instance');
  assert.equal(current[0].ProcessId, first.ProcessId, 'same-version launch activates the existing process');
  assert.deepEqual(economy(JSON.parse(await fs.readFile(savePath, 'utf8'))), economy(legacy));

  assert.equal(publishStableBuild(fixture, currentBuild), true, 'unused traditional entry updates successfully');
  assert.equal(await hash(path.join(stableBuild, 'resources/app.asar')), await hash(path.join(currentBuild, 'resources/app.asar')));
  assert.equal(await hash(stableExe), await hash(currentExe));
  assert.throws(() => publishStableBuild(fixture, otherRoot), /inside this project dist/);
  assert.throws(() => publishStableBuild(fixture, stableBuild), /versioned directory/);
  console.log(`PASS: isolated Chinese/spaced project; CheckOnly; version priority; no stale fallback; safe dev fallback; graceful old-to-${manifest.version} switch; one-instance reuse; old paid save intact; unrelated project untouched; occupied stable build protected and idle stable entry synchronized.`);
} finally {
  await otherApp?.close().catch(() => {});
  await oldApp?.close().catch(() => {});
  const owned = (await processes()).filter(row => row.ExecutablePath?.toLowerCase().startsWith(fixture.toLowerCase() + path.sep));
  for (const row of owned.filter(row => !/--type=/.test(row.CommandLine || ''))) {
    await ps(`$p = Get-Process -Id ${row.ProcessId} -ErrorAction SilentlyContinue; if ($p) { [void]$p.CloseMainWindow(); if (-not $p.WaitForExit(5000)) { Stop-Process -Id ${row.ProcessId} -Force } }`);
  }
}
