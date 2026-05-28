const { app, BrowserWindow } = require('electron');

const PORT = process.env.LATTE_PORT || 3456;
const URL = `http://localhost:${PORT}`;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    title: 'latte-ts-models',
  });
  win.loadURL(URL);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
