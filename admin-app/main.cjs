const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Suppress security warnings in developer console
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

// Disable HTTP cache to prevent ERR_CACHE_READ_FAILURE
app.commandLine.appendSwitch('disable-http-cache');

// Fix cache access errors on Windows paths with spaces
app.setPath('userData', path.join(os.tmpdir(), 'sentinel-admin'));

// Allow audio to play automatically
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Path to the employee agent dist.zip (relative to this file)
const AGENT_ZIP_PATH = path.join(__dirname, '..', 'employee-agent', 'dist.zip');

function createWindow() {
    const win = new BrowserWindow({
        width: 1440,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            preload: path.join(__dirname, 'preload.cjs')
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

app.whenReady().then(() => {
    // ─── IPC: Reveal agent zip in Explorer ───────────────────────────────────
    ipcMain.handle('open-agent-folder', () => {
        if (fs.existsSync(AGENT_ZIP_PATH)) {
            shell.showItemInFolder(AGENT_ZIP_PATH);
            return { success: true, path: AGENT_ZIP_PATH };
        }
        return { success: false, message: 'dist.zip not found at: ' + AGENT_ZIP_PATH };
    });

    // ─── IPC: Save/Copy agent zip to chosen location ─────────────────────────
    ipcMain.handle('download-agent-zip', async (event) => {
        if (!fs.existsSync(AGENT_ZIP_PATH)) {
            return { success: false, message: 'Agent zip not found. Please build it first.' };
        }

        const { filePath, canceled } = await dialog.showSaveDialog({
            title: 'Save Sentinel Agent',
            defaultPath: path.join(os.homedir(), 'Desktop', 'SentinelAgent.zip'),
            filters: [{ name: 'Zip Archive', extensions: ['zip'] }]
        });

        if (canceled || !filePath) return { success: false, message: 'Canceled' };

        try {
            fs.copyFileSync(AGENT_ZIP_PATH, filePath);
            shell.showItemInFolder(filePath);
            return { success: true, path: filePath };
        } catch (err) {
            return { success: false, message: err.message };
        }
    });

    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
