@echo off
cd /d "%~dp0"
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version"`) do set "GAME_VERSION=%%v"
if exist "dist\v%GAME_VERSION%\LiveShoppingSimulator-win32-x64\LiveShoppingSimulator.exe" (
  start "" "dist\v%GAME_VERSION%\LiveShoppingSimulator-win32-x64\LiveShoppingSimulator.exe"
  exit /b 0
)
if exist "dist\LiveShoppingSimulator-win32-x64\LiveShoppingSimulator.exe" (
  start "" "dist\LiveShoppingSimulator-win32-x64\LiveShoppingSimulator.exe"
  exit /b 0
)
if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" .
  exit /b 0
)
echo Please install dependencies with pnpm install, then run pnpm start.
pause
