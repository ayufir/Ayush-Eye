const { app, BrowserWindow, desktopCapturer, ipcMain } = require('electron');
const path = require('path');
const os = require('os');

// Fix "Unable to move cache: Access denied" on Windows paths with spaces
app.setPath('userData', path.join(os.tmpdir(), 'sentinel-agent'));

// Allow audio to play without user interaction (vital for hidden background agent)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// ─── Single-Instance Lock ─────────────────────────────────────────────────────
// Prevents multiple agent copies from running simultaneously, which causes
// camera/mic "Device in use" errors and duplicate socket registrations.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    console.log('⚠️ Another Sentinel Agent instance is already running. Exiting.');
    app.quit();
}

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
    // Auto-grant camera/microphone media permissions for Electron window
    const { session } = require('electron');

    // Grant permission requests (for getUserMedia popups)
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'audio', 'video', 'mediaKeySystem', 'geolocation'];
        callback(allowedPermissions.includes(permission));
    });

    // Grant permission checks (for navigator.permissions.query) — critical for camera/mic
    session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
        const allowedPermissions = ['media', 'audio', 'video', 'mediaKeySystem', 'geolocation'];
        return allowedPermissions.includes(permission);
    });

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

    // ─── Consolidated Remote Action Handling (Mouse, Scroll, Keyboard, Screenshot) ─────────────────
    ipcMain.on('execute-remote-action', (event, payload) => {
        const { action, data } = payload || {};
        const { exec } = require('child_process');
        
        if (action === 'click' || action === 'right_click' || action === 'double_click' || action === 'scroll') {
            if (!data) return;
            const { screen } = require('electron');
            const primaryDisplay = screen.getPrimaryDisplay();
            const { width, height } = primaryDisplay.bounds;

            const targetX = Math.floor(data.x * width);
            const targetY = Math.floor(data.y * height);

            // PowerShell script to move and click/scroll mouse
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
            } else if (action === 'scroll') {
                // Invert and round deltaY. A positive deltaY in browser means scroll down, which maps to negative value in Windows API.
                const scrollAmount = -Math.round(data.deltaY || 0);
                if (scrollAmount !== 0) {
                    // 0x0800 is MOUSEEVENTF_WHEEL
                    psCommand += `[Win32.User32]::mouse_event(0x0800, 0, 0, ${scrollAmount}, 0);`;
                }
            }

            exec(`powershell -Command "${psCommand.replace(/\n/g, '')}"`, (err) => {
                if (err) console.error('❌ Mouse/Scroll Control Error:', err);
            });
        } 
        else if (action === 'key_press') {
            if (!data || !data.key) return;
            
            let key = data.key;
            if (key.length === 1) {
                // Regular character: escape single quotes and double quotes for PowerShell SendKeys execution
                if (key === "'") {
                    key = "''";
                } else if (key === '"') {
                    key = '`"';
                }
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
        } 
        else if (action === 'screenshot') {
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
                    setTimeout(() => {
                        try {
                            if (fs.existsSync(screenshotPath)) {
                                fs.unlinkSync(screenshotPath);
                            }
                        } catch (e) {
                            console.error('Error deleting temp screenshot:', e);
                        }
                    }, 5000);
                }
            });
        }
    });

    // ─── Meeting Window Show/Hide Logic ──────────────────────────────────────
    ipcMain.on('show-meeting-window', () => {
        if (mainWindow) {
            // Make window visible in taskbar so employee can switch to it
            mainWindow.setSkipTaskbar(false);
            mainWindow.setSize(820, 640);
            mainWindow.center();
            mainWindow.show();
            // Force the window above ALL other apps (including fullscreen browser)
            mainWindow.setAlwaysOnTop(true, 'screen-saver');
            mainWindow.focus();
            // After 8 seconds, drop always-on-top so employee can work normally
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.setAlwaysOnTop(false);
                }
            }, 8000);
        }
    });

    ipcMain.on('hide-meeting-window', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.setAlwaysOnTop(false);
            mainWindow.setSkipTaskbar(true);
            mainWindow.hide();
        }
    });

    createWindow();
});

app.on('window-all-closed', () => {
    app.quit();
});
