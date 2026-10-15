import packager from '@electron/packager';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync('package.json'));
const version = manifest.devDependencies.electron;
const zip = path.join(root, 'artifacts', `electron-v${version}-win32-x64.zip`);
const results = await packager({
  dir: root, name: 'LiveShoppingSimulator', platform: 'win32', arch: 'x64',
  out: path.join(root, 'dist', `v${manifest.version}`), overwrite: true, asar: true, prune: false,
  electronVersion: version,
  ...(fs.existsSync(zip) ? { electronZipDir: path.dirname(zip) } : {}),
  ignore: [/^\/(node_modules|dist|tests|docs|scripts|artifacts|\.git)(\/|$)/, /^\/assets\/three-kingdoms\/(portraits\/)?[^/]+\.png$/, /\/assets\/.*\.md$/, /\/(README\.md|CHANGELOG\.md|AGENTS\.md|pnpm-lock\.yaml|pnpm-workspace\.yaml)$/],
  appCopyright: 'Live Shopping Simulator',
  win32metadata: { CompanyName: 'LiveShoppingSimulator', FileDescription: '拆播间 · 直播购物模拟器', ProductName: '拆播间' }
});
console.log('Windows build:', results.join(', '));
