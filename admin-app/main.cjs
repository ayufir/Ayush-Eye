const { app, BrowserWindow } = require('electron');
const path = require('path');

// Fix cache access errors on Windows paths with spaces
app.setPath('userData', path.join(require('os').tmpdir(), 'sentinel-admin'));

// Allow audio to play automatically
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
    const win = new BrowserWindow({
        width: 1440,
        height: 900,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        },
        titleBarStyle: 'hiddenInset'
    });

    // We check for development environment
    // If running via 'npm start', we load the dev server URL
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

    if (isDev) {
        win.loadURL('http://localhost:5173');
        // Open dev tools automatically in dev mode
        win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, 'dist/index.html'));
    }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
