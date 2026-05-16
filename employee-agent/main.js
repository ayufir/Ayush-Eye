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

    // ─── Remote Mouse Control Logic (PowerShell Fallback) ────────────────────
    ipcMain.on('execute-remote-action', (event, { action, coords }) => {
        const { screen } = require('electron');
        const { exec } = require('child_process');
        
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.bounds;

        const targetX = Math.floor(coords.x * width);
        const targetY = Math.floor(coords.y * height);

        // PowerShell script to move and click mouse
        let psCommand = `
            Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);' -Name User32 -Namespace Win32;
            [Win32.User32]::SetCursorPos(${targetX}, ${targetY});
        `;

        if (action === 'click') {
            psCommand += `[Win32.User32]::mouse_event(0x0002, 0, 0, 0, 0); [Win32.User32]::mouse_event(0x0004, 0, 0, 0, 0);`;
        } else if (action === 'right_click') {
            psCommand += `[Win32.User32]::mouse_event(0x0008, 0, 0, 0, 0); [Win32.User32]::mouse_event(0x0010, 0, 0, 0, 0);`;
        } else if (action === 'double_click') {
            psCommand += `[Win32.User32]::mouse_event(0x0002, 0, 0, 0, 0); [Win32.User32]::mouse_event(0x0004, 0, 0, 0, 0); [Win32.User32]::mouse_event(0x0002, 0, 0, 0, 0); [Win32.User32]::mouse_event(0x0004, 0, 0, 0, 0);`;
        }

        exec(`powershell -Command "${psCommand.replace(/\n/g, '')}"`, (err) => {
            if (err) console.error('❌ Mouse Control Error:', err);
        });
    });

    // ─── Keyboard Control Logic ──────────────────────────────────────────────
    ipcMain.on('execute-remote-action', (event, { action, data }) => {
        if (action !== 'key_press') return;
        const { exec } = require('child_process');
        
        // Escape special characters for PowerShell
        let key = data.key;
        if (key.length === 1) {
            // Regular character
            if (key === '"') key = '`"';
            const psCommand = `(New-Object -ComObject WScript.Shell).SendKeys('${key}')`;
            exec(`powershell -Command "${psCommand}"`);
        } else {
            // Special keys (Enter, Backspace, etc.)
            const keyMap = {
                'Enter': '{ENTER}',
                'Backspace': '{BACKSPACE}',
                'Tab': '{TAB}',
                'Escape': '{ESC}',
                'ArrowUp': '{UP}',
                'ArrowDown': '{DOWN}',
                'ArrowLeft': '{LEFT}',
                'ArrowRight': '{RIGHT}',
                'Delete': '{DEL}',
                'Home': '{HOME}',
                'End': '{END}'
            };
            if (keyMap[key]) {
                const psCommand = `(New-Object -ComObject WScript.Shell).SendKeys('${keyMap[key]}')`;
                exec(`powershell -Command "${psCommand}"`);
            }
        }
    });

    // ─── Screenshot Logic ────────────────────────────────────────────────────
    ipcMain.on('execute-remote-action', (event, { action }) => {
        if (action !== 'screenshot') return;
        const { exec } = require('child_process');
        const fs = require('fs');
        const path = require('path');

        const screenshotPath = path.join(app.getPath('userData'), `ss_${Date.now()}.png`);
        
        const psCommand = `
            Add-Type -AssemblyName System.Windows.Forms,System.Drawing;
            $screen = [System.Windows.Forms.Screen]::PrimaryScreen;
            $bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height);
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap);
            $graphics.CopyFromScreen($screen.Bounds.X, $screen.Bounds.Y, 0, 0, $bitmap.Size);
            $bitmap.Save('${screenshotPath}', [System.Drawing.Imaging.ImageFormat]::Png);
        `;

        exec(`powershell -Command "${psCommand.replace(/\n/g, '')}"`, (err) => {
            if (!err && fs.existsSync(screenshotPath)) {
                const base64 = fs.readFileSync(screenshotPath, { encoding: 'base64' });
                event.sender.send('screenshot-captured', { base64 });
                // Clean up
                setTimeout(() => fs.unlinkSync(screenshotPath), 5000);
            }
        });
    });

    createWindow();
});

app.on('window-all-closed', () => {
    app.quit();
});
