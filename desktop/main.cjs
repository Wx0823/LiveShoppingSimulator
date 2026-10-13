const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
app.setName('LiveShoppingSimulator');
if (process.env.NODE_ENV === 'test' && process.env.LSS_TEST_USER_DATA) {
  app.setPath('userData', path.resolve(process.env.LSS_TEST_USER_DATA));
}
let window;
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on('second-instance', () => {
  if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
});
const savePath = () => path.join(app.getPath('userData'), 'save-v1.json');
function backupSave() {
  if (fs.existsSync(savePath())) fs.copyFileSync(savePath(), `${savePath()}.backup-${Date.now()}`);
}
ipcMain.handle('save:read', () => {
  try { return fs.readFileSync(savePath(), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
});
ipcMain.handle('save:write', (_event, content) => {
  if (typeof content !== 'string' || content.length > 5000000) throw new Error('存档无效');
  JSON.parse(content);
  fs.mkdirSync(path.dirname(savePath()), { recursive: true });
  fs.writeFileSync(`${savePath()}.tmp`, content, 'utf8');
  fs.renameSync(`${savePath()}.tmp`, savePath());
  return true;
});
ipcMain.handle('save:backup', () => { backupSave(); return true; });
ipcMain.handle('window:fullscreen', () => { window.setFullScreen(!window.isFullScreen()); return window.isFullScreen(); });
if (primaryInstance) app.whenReady().then(() => {
  window = new BrowserWindow({
    width: 1600, height: 960, minWidth: 1152, minHeight: 720,
    backgroundColor: '#f5f4ef', title: '拆播间 · Live Shopping Simulator',
    show: process.env.NODE_ENV !== 'test',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.loadFile(path.join(__dirname, '..', 'index.html'));
});
app.on('window-all-closed', () => app.quit());
