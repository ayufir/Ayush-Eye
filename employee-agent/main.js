const { app, BrowserWindow, desktopCapturer, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const { loadConfig, saveConfig } = require('./services/configService');

// Suppress security warnings in developer console
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

// Disable HTTP cache to prevent ERR_CACHE_READ_FAILURE
app.commandLine.appendSwitch('disable-http-cache');

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
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.setSkipTaskbar(false);
            mainWindow.setSize(400, 450);
            mainWindow.center();
            mainWindow.show();
            mainWindow.loadFile('setup.html');
            mainWindow.focus();
        }
    });
}

const fs = require('fs');

let mainWindow;
let tray = null;

async function syncAgentFiles(serverUrl) {
    try {
        console.log('🔄 Checking for agent file updates from:', serverUrl);
        const url = `${serverUrl}/api/agent-sync-files`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const text = await response.text();
        if (!text || !text.trim()) {
            throw new Error('Response body is empty (Server might be sleeping or deploying)');
        }
        
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            throw new Error('Response is not valid JSON (Server returned HTML/Text)');
        }

        if (data && data.files) {
            const userDataPath = app.getPath('userData');
            console.log('📂 Syncing files to userData:', userDataPath);
            
            for (const [filePath, content] of Object.entries(data.files)) {
                const fullPath = path.join(userDataPath, filePath);
                const dir = path.dirname(fullPath);
                
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                fs.writeFileSync(fullPath, content, 'utf8');
                console.log(`✅ Synced: ${filePath}`);
            }
            return true;
        }
    } catch (err) {
        console.error('❌ Failed to sync files from server:', err.message);
    }
    return false;
}


function createTray() {
    if (tray) return;
    
    // Transparent PNG base64 for tray icon (shield shape representation)
    const iconBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAEKSURBVDhPY2AYBfQETExM/0GMR111//79/wPEXEDMBcScQAwDkMXgEsixEFkArhiuGBknkAVwxbjEsACuGKoYFqArxiWGBeikGBZgpRgWwKkYXoCRkeE/VAzGMAVwKXosgC9EkAVwKYIsgEsRpADYpYiyAC5FkAVwKYIsgEsRZAEhRZD/UDFUix4L4FMEmQ/VApKiwgIeHh7/oWIwFiqgGgvw8/P/h4rBGKiAihZQUVEBFiLEAjU1tQE6Bqohqthgx4oPqKio/IeKwVioAE2xAVtWVlb/oWIwFiqAUjHGKj6gpaX1HyoGY6ECKMUGbFmZgJqa2n+oGIyFCtAUG7BlZfIBNgoNAG8adp2y18yLAAAAAElFTkSuQmCC';
    const image = nativeImage.createFromDataURL(iconBase64);
    
    tray = new Tray(image);
    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Show Setup / Status', 
            click: () => {
                if (mainWindow) {
                    mainWindow.setSkipTaskbar(false);
                    mainWindow.setSize(400, 450);
                    mainWindow.center();
                    mainWindow.show();
                    mainWindow.loadFile('setup.html');
                    mainWindow.focus();
                }
            } 
        },
        { 
            label: 'Call Admin / Host Meeting', 
            click: () => {
                if (mainWindow) {
                    mainWindow.setSkipTaskbar(false);
                    mainWindow.setSize(400, 250);
                    mainWindow.center();
                    mainWindow.show();
                    mainWindow.focus();
                    mainWindow.webContents.send('call-admin');
                }
            } 
        },
        { type: 'separator' },
        { 
            label: 'Exit', 
            click: () => {
                app.isQuiting = true;
                app.quit();
            } 
        }
    ]);
    
    tray.setToolTip('Sentinel Agent');
    tray.setContextMenu(contextMenu);
    
    tray.on('double-click', () => {
        if (mainWindow) {
            mainWindow.setSkipTaskbar(false);
            mainWindow.setSize(400, 450);
            mainWindow.center();
            mainWindow.show();
            mainWindow.loadFile('setup.html');
            mainWindow.focus();
        }
    });
}

function createWindow() {
    const config = loadConfig();

    if (!config.adminId) {
        // Show First-Time Setup Window
        mainWindow = new BrowserWindow({
            width: 400,
            height: 450,
            show: true, 
            skipTaskbar: false, 
            title: 'Sentinel Agent Setup',
            autoHideMenuBar: true,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });
        mainWindow.loadFile('setup.html');
        mainWindow.center();
    } else {
        // Start normally in background
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

        // Safe fallback in case synced index.html fails to load
        mainWindow.webContents.on('did-fail-load', () => {
            console.log('⚠️ Failed to load synced file, falling back to local index.html');
            mainWindow.loadFile('index.html');
        });
        
        const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
        const userDataPath = app.getPath('userData');
        const syncedIndexHtml = path.join(userDataPath, 'index.html');
        if (fs.existsSync(syncedIndexHtml) && !isDev) {
            console.log('🚀 Loading synced index.html from:', syncedIndexHtml);
            mainWindow.loadFile(syncedIndexHtml);
        } else {
            console.log('🚀 Loading local index.html');
            mainWindow.loadFile('index.html');
        }
    }

    // Intercept close event to hide instead of close if configured
    mainWindow.on('close', (event) => {
        const currentConfig = loadConfig();
        if (currentConfig.adminId && !app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
            mainWindow.setSkipTaskbar(true);
        }
    });
}

app.whenReady().then(async () => {
    // Auto-grant camera/microphone media permissions for Electron window
    const { session } = require('electron');

    // Sync files from server first if configured
    const config = loadConfig();
    if (config.serverUrl) {
        await syncAgentFiles(config.serverUrl);
    }

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
    // Returns ALL monitors for multi-monitor support
    ipcMain.handle('get-desktop-sources', async () => {
        const sources = await desktopCapturer.getSources({
            types: ['screen'],
            thumbnailSize: { width: 150, height: 150 }
        });
        // Return only serializable data — all screens for multi-monitor
        return sources.map((s, index) => ({ id: s.id, name: s.name, index }));
    });

    // ─── PC Lock / Unlock ───────────────────────────────────────────────────────
    ipcMain.on('lock-pc', () => {
        console.log('🔒 Admin commanded: Lock PC');
        const { exec } = require('child_process');
        exec('rundll32.exe user32.dll,LockWorkStation', (err) => {
            if (err) console.error('Lock error:', err.message);
            else console.log('✅ PC Locked successfully');
        });
    });

    // ─── Get Active Window Title (for Alert System) ─────────────────────────────
    ipcMain.handle('get-active-window', async () => {
        return new Promise((resolve) => {
            const { exec } = require('child_process');
            const cmd = `powershell -Command "(Get-Process | Where-Object {$_.MainWindowTitle -ne ''} | Sort-Object CPU -Descending | Select-Object -First 1).MainWindowTitle"`;
            exec(cmd, (err, stdout) => {
                if (err) { resolve(''); return; }
                resolve(stdout.trim());
            });
        });
    });

    // ─── Website Blocker via HOSTS file ────────────────────────────────────────
    ipcMain.on('block-websites', (event, { domains }) => {
        console.log('🌐 Blocking websites:', domains);
        const { exec } = require('child_process');
        const hostsPath = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
        
        try {
            let hostsContent = fs.readFileSync(hostsPath, 'utf8');
            // Remove old sentinel blocks
            hostsContent = hostsContent.replace(/# SENTINEL_START[\s\S]*?# SENTINEL_END\n?/g, '');
            
            if (domains && domains.length > 0) {
                const blockLines = domains.map(d => `127.0.0.1 ${d}\n127.0.0.1 www.${d}`).join('\n');
                hostsContent += `\n# SENTINEL_START\n${blockLines}\n# SENTINEL_END\n`;
            }
            
            // Write hosts file requires admin — use PowerShell elevated
            const tempPath = path.join(os.tmpdir(), 'sentinel_hosts.txt');
            fs.writeFileSync(tempPath, hostsContent, 'utf8');
            exec(`powershell -Command "Copy-Item '${tempPath}' '${hostsPath}' -Force"`, (err) => {
                if (err) console.error('Hosts update error:', err.message);
                else console.log('✅ Hosts file updated, websites blocked');
            });
        } catch (err) {
            console.error('❌ Failed to modify hosts file:', err.message);
        }
    });

    // ─── Persistent PowerShell Process for Instant Remote Control ─────────────────
    const { spawn, exec } = require('child_process');
    
    // Start a persistent PowerShell process to avoid recompiling C# on every click
    const psProcess = spawn('powershell.exe', ['-NoProfile', '-Command', '-']);
    
    // Initialize the C# types once
    const psInit = `
        Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);' -Name User32 -Namespace Win32;
        Add-Type -AssemblyName System.Windows.Forms;
    `;
    psProcess.stdin.write(psInit + '\n');
    
    psProcess.stderr.on('data', (data) => {
        console.error('PowerShell Error:', data.toString());
    });

    ipcMain.on('execute-remote-action', (event, payload) => {
        const { action, data } = payload || {};
        
        if (action === 'mousemove' || action === 'click' || action === 'right_click' || action === 'double_click' || action === 'scroll') {
            if (!data) return;
            const { screen } = require('electron');
            const primaryDisplay = screen.getPrimaryDisplay();
            const { width, height } = primaryDisplay.bounds;

            const targetX = Math.floor(data.x * width);
            const targetY = Math.floor(data.y * height);

            let psCommand = `[Win32.User32]::SetCursorPos(${targetX}, ${targetY});`;

            if (action === 'click') {
                psCommand += `[Win32.User32]::mouse_event(0x0002, 0, 0, 0, 0); [Win32.User32]::mouse_event(0x0004, 0, 0, 0, 0);`;
            } else if (action === 'right_click') {
                psCommand += `[Win32.User32]::mouse_event(0x0008, 0, 0, 0, 0); [Win32.User32]::mouse_event(0x0010, 0, 0, 0, 0);`;
            } else if (action === 'double_click') {
                psCommand += `[Win32.User32]::mouse_event(0x0002, 0, 0, 0, 0); [Win32.User32]::mouse_event(0x0004, 0, 0, 0, 0); [Win32.User32]::mouse_event(0x0002, 0, 0, 0, 0); [Win32.User32]::mouse_event(0x0004, 0, 0, 0, 0);`;
            } else if (action === 'scroll') {
                const scrollAmount = -Math.round(data.deltaY || 0);
                if (scrollAmount !== 0) {
                    psCommand += `[Win32.User32]::mouse_event(0x0800, 0, 0, ${scrollAmount}, 0);`;
                }
            }

            // Execute instantly
            psProcess.stdin.write(psCommand + '\n');
        } 
        else if (action === 'key_press') {
            if (!data || !data.key) return;
            
            let key = data.key;
            if (key.length === 1) {
                if (key === "'") key = "''";
                else if (key === '"') key = '`"';
                psProcess.stdin.write(`[System.Windows.Forms.SendKeys]::SendWait('${key}');\n`);
            } else {
                const keyMap = {
                    'Enter': '{ENTER}', 'Backspace': '{BACKSPACE}', 'Tab': '{TAB}', 'Escape': '{ESC}',
                    'ArrowUp': '{UP}', 'ArrowDown': '{DOWN}', 'ArrowLeft': '{LEFT}', 'ArrowRight': '{RIGHT}',
                    'Delete': '{DEL}', 'Home': '{HOME}', 'End': '{END}'
                };
                if (keyMap[key]) {
                    psProcess.stdin.write(`[System.Windows.Forms.SendKeys]::SendWait('${keyMap[key]}');\n`);
                }
            }
        } 
        else if (action === 'screenshot') {
            const { desktopCapturer } = require('electron');
            desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } })
                .then(sources => {
                    if (sources && sources.length > 0) {
                        const base64 = sources[0].thumbnail.toPNG().toString('base64');
                        event.sender.send('screenshot-captured', { base64 });
                    }
                })
                .catch(err => console.error('Error capturing screen:', err));
        }
        else if (action === 'auto_screenshot') {
            const { desktopCapturer } = require('electron');
            desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } })
                .then(sources => {
                    if (sources && sources.length > 0) {
                        // Use JPEG and 50% quality to save DB space
                        const base64 = 'data:image/jpeg;base64,' + sources[0].thumbnail.toJPEG(50).toString('base64');
                        event.sender.send('auto-screenshot-captured', { base64 });
                    }
                })
                .catch(err => console.error('Error capturing auto screen:', err));
        }
    });

    // ─── Setup UI Handler ───────────────────────────────────────────────────
    ipcMain.on('save-setup-config', (event, data) => {
        saveConfig(data);
        if (mainWindow) {
            mainWindow.hide();
            mainWindow.setSkipTaskbar(true);
            mainWindow.loadFile('index.html');
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
    createTray();

    // ─── Admin Chat Notification Handler ─────────────────────────────────────
    ipcMain.on('show-admin-notification', (event, { title, body }) => {
        const { Notification } = require('electron');
        if (Notification.isSupported()) {
            new Notification({ title, body, urgency: 'normal' }).show();
        }
    });

    // ─── Idle Detection: Poll Windows idle time via PowerShell ────────────────
    setInterval(() => {
        const { exec } = require('child_process');
        // Get milliseconds since last user input using GetLastInputInfo
        const psCmd = `powershell -NoProfile -Command "$TypeDef = '[DllImport(""user32.dll"")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii); [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }'; Add-Type -MemberDefinition $TypeDef -Name U32 -Namespace W; $l = New-Object W.U32+LASTINPUTINFO; $l.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($l); [W.U32]::GetLastInputInfo([ref]$l); [int]([Environment]::TickCount - $l.dwTime)"`;
        exec(psCmd, (err, stdout) => {
            if (!err) {
                const idleMs = parseInt(stdout.trim());
                // If user was active in last 30 seconds, notify renderer
                if (!isNaN(idleMs) && idleMs < 30000) {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('user-activity');
                    }
                }
            }
        });
    }, 30000);
});

app.on('window-all-closed', () => {
    app.quit();
});
