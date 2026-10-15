import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function publishStableBuild(root, buildPath) {
  const distributionRoot = path.resolve(root, 'dist');
  const source = path.resolve(buildPath);
  const destination = path.join(distributionRoot, 'LiveShoppingSimulator-win32-x64');
  if (!source.startsWith(distributionRoot + path.sep) || source === destination) throw new Error('Build must be a versioned directory inside this project dist.');
  if (!fs.existsSync(path.join(source, 'LiveShoppingSimulator.exe'))) throw new Error('Built executable is missing.');
  const executable = path.join(destination, 'LiveShoppingSimulator.exe').replace(/'/g, "''");
  const count = Number(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `@(Get-Process -Name LiveShoppingSimulator -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq '${executable}' }).Count`], { encoding: 'utf8', windowsHide: true }).trim());
  if (!Number.isFinite(count)) throw new Error('Could not verify the stable build is unused.');
  if (count > 0) {
    console.warn('Stable entry is running; kept it intact. Close the old game and rerun packaging. Launch the versioned build with the project launcher.');
    return false;
  }
  fs.cpSync(source, destination, { recursive: true, force: true });
  console.log('Stable Windows entry updated:', destination);
  return true;
}
