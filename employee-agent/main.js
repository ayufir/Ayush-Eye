const { app, BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const path = require('path');
const os = require('os');

// Fix "Unable to move cache: Access denied" on Windows paths with spaces
app.setPath('userData', path.join(os.tmpdir(), 'sentinel-agent'));

// Allow audio to play without user interaction (vital for hidden background agent)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 400,
        height: 250,
        show: false, // HIDDEN IN BACKGROUND
        skipTaskbar: true, // HIDE FROM TASKBAR
        title: 'Sentinel Agent',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
            backgroundThrottling: false // Keep running fast in background
        }
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    // Make sure it starts on boot
    app.setLoginItemSettings({
        openAtLogin: true,
        path: app.getPath('exe'),
        args: [
            '--processStart', `"${path.basename(app.getPath('exe'))}"`,
            '--process-args', `"--hidden"`
        ]
    });

    // In modern Electron, desktopCapturer must be called from main process
    ipcMain.handle('get-desktop-sources', async () => {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 150, height: 150 }
        });
        // Return only serializable data
        return sources.map(s => ({ id: s.id, name: s.name }));
    });

    createWindow();
});

app.on('window-all-closed', () => {
    app.quit();
});
