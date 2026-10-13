@echo off
cd /d "%~dp0"
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
