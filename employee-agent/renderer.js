const io = require('socket.io-client');
const os = require('os');
const { log, setStatus } = require('./utils/logger');
const { loadConfig } = require('./services/configService');
const { getScreenStream } = require('./services/screenService');
const webrtcService = require('./services/webrtcService');
const remoteService = require('./services/remoteService');

const config = loadConfig();

const socket = io(config.serverUrl, {
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: Infinity
});

// --- Socket Events ---
socket.on('connect', async () => {
    log('✅ Connected to Sentinel server!', 'ok');
    setStatus('Connected — ' + config.employeeName, true);

    // Initial capture attempt
    await getScreenStream();

    if (!config.adminId) {
        log('❌ ERROR: Admin ID is missing!', 'err');
        setStatus('Error: Missing Admin ID', false);
        return;
    }

    const registrationData = {
        role: 'employee',
        adminId: config.adminId,
        id: 'EMP_' + os.hostname().replace(/[^a-zA-Z0-9]/g, '_'),
        name: config.employeeName,
        pcName: os.hostname(),
        platform: os.platform(),
        status: 'online'
    };

    log('📤 Registering: ' + config.employeeName, 'warn');
    socket.emit('identify', registrationData);
});

socket.on('disconnect', () => {
    log('❌ Disconnected from server', 'err');
    setStatus('Disconnected — Reconnecting...', false);
});

socket.on('view_request', (data) => webrtcService.handleViewRequest(socket, data.adminId || data.from));
socket.on('rtc_signal', (data) => webrtcService.handleRtcSignal(data));
socket.on('intercom_signal', ({ from, signal }) => webrtcService.handleIntercomSignal(socket, from, signal));
socket.on('meeting_invitation', (data) => webrtcService.handleMeetingInvitation(socket, data));

// Backward compatibility
socket.on('signal', (data) => webrtcService.handleRtcSignal({ from: data.from || data.target, signal: data }));

// Initialize Remote Control
remoteService.initRemoteControl(socket);

log('🚀 Sentinel Agent Started', 'ok');
log('📡 Server: ' + config.serverUrl, 'warn');
log('🆔 Admin ID: ' + config.adminId, 'warn');

// --- Automated Screenshots Timer ---
const { ipcRenderer } = require('electron');

let autoScreenshotTimer = null;
let isAutoScreenshotEnabled = true;

const takeAutoScreenshot = () => {
    if (!isAutoScreenshotEnabled) return;
    log('⏱️ Triggering automated background screenshot...', 'warn');
    ipcRenderer.send('execute-remote-action', { action: 'auto_screenshot' });
};

const startAutoScreenshotTimer = () => {
    if (autoScreenshotTimer) clearInterval(autoScreenshotTimer);
    autoScreenshotTimer = setInterval(takeAutoScreenshot, 10 * 60 * 1000);
};

const stopAutoScreenshotTimer = () => {
    if (autoScreenshotTimer) {
        clearInterval(autoScreenshotTimer);
        autoScreenshotTimer = null;
    }
};

// Initial delay
setTimeout(() => {
    if (isAutoScreenshotEnabled) {
        takeAutoScreenshot();
        startAutoScreenshotTimer();
    }
}, 5000);

// Handle server setting
socket.on('auto_screenshot_setting', ({ enabled }) => {
    const wasDisabled = !isAutoScreenshotEnabled;
    isAutoScreenshotEnabled = enabled;
    
    if (enabled) {
        log('📸 Auto-screenshots ENABLED by Admin', 'ok');
        startAutoScreenshotTimer();
        if (wasDisabled) takeAutoScreenshot();
    } else {
        log('🛑 Auto-screenshots DISABLED by Admin', 'warn');
        stopAutoScreenshotTimer();
    }
});
