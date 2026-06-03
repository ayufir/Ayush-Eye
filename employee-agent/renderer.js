const io = require('socket.io-client');
const os = require('os');
const { ipcRenderer } = require('electron');
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

let isWaitingForAdminCall = false;

ipcRenderer.on('call-admin', () => {
    const currentConfig = loadConfig();
    if (!currentConfig.adminId) {
        log('❌ Cannot call Admin: Invite Code is missing! Update setup first.', 'err');
        setStatus('Error: Missing Admin ID', false);
        return;
    }
    log('📞 Calling Admin...', 'warn');
    setStatus('Calling Admin...', false);
    isWaitingForAdminCall = true;
    socket.emit('employee_request_meeting');
});

socket.on('view_request', (data) => webrtcService.handleViewRequest(socket, data.adminId || data.from));
socket.on('rtc_signal', (data) => webrtcService.handleRtcSignal(data));
socket.on('intercom_signal', ({ from, signal }) => webrtcService.handleIntercomSignal(socket, from, signal));

socket.on('meeting_invitation', (data) => {
    if (isWaitingForAdminCall) {
        log('🤝 Admin accepted call, joining meeting automatically...', 'ok');
        setStatus('Joined Meeting', true);
        isWaitingForAdminCall = false;
        webrtcService.joinMeeting(socket, data.hostId, data.roomName);
    } else {
        webrtcService.handleMeetingInvitation(socket, data);
    }
});

socket.on('meeting_declined', () => {
    log('❌ Admin declined the meeting request.', 'err');
    setStatus('Call Declined', false);
    isWaitingForAdminCall = false;
});

// Backward compatibility
socket.on('signal', (data) => webrtcService.handleRtcSignal({ from: data.from || data.target, signal: data }));

// Initialize Remote Control
remoteService.initRemoteControl(socket);

log('🚀 Sentinel Agent Started', 'ok');
log('📡 Server: ' + config.serverUrl, 'warn');
log('🆔 Admin ID: ' + config.adminId, 'warn');

// ─── Automated Screenshots Timer ──────────────────────────────────────────────
let autoScreenshotTimer = null;
let isAutoScreenshotEnabled = true;

const takeAutoScreenshot = async () => {
    if (!isAutoScreenshotEnabled) return;
    log('⏱️ Triggering automated background screenshot...', 'warn');
    
    // Get active window title for alert system
    let windowTitle = '';
    try {
        windowTitle = await ipcRenderer.invoke('get-active-window');
    } catch (e) { windowTitle = ''; }
    
    ipcRenderer.send('execute-remote-action', { action: 'auto_screenshot', windowTitle });
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

// ─── 🔒 PC Lock/Unlock ────────────────────────────────────────────────────────
socket.on('lock_pc', () => {
    log('🔒 Admin locked this PC!', 'err');
    ipcRenderer.send('lock-pc');
});

// ─── 🔢 Multi-Monitor Switch ──────────────────────────────────────────────────
socket.on('switch_monitor', async ({ monitorIndex }) => {
    log(`🖥️ Switching to monitor ${monitorIndex}`, 'warn');
    const sources = await ipcRenderer.invoke('get-desktop-sources');
    if (sources && sources[monitorIndex]) {
        const { getScreenStream } = require('./services/screenService');
        await getScreenStream(0, sources[monitorIndex].id);
        // Restart WebRTC stream with new source
        webrtcService.restartWithNewSource && webrtcService.restartWithNewSource(socket, sources[monitorIndex].id);
        log(`✅ Switched to: ${sources[monitorIndex].name}`, 'ok');
    }
});

// Send available monitors list when requested
socket.on('request_monitors', async () => {
    const sources = await ipcRenderer.invoke('get-desktop-sources');
    socket.emit('monitors_list', { 
        sources: sources.map(s => ({ id: s.id, name: s.name, index: s.index })) 
    });
    log(`📺 Sent ${sources.length} monitor(s) info to admin`, 'ok');
});

// ─── 👁️ Idle Detection ────────────────────────────────────────────────────────
const IDLE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
let lastActivityTime = Date.now();
let isIdleSent = false;

// Track last activity time via periodic check (renderer process)
const updateActivity = () => {
    lastActivityTime = Date.now();
    if (isIdleSent) {
        isIdleSent = false;
        socket.emit('employee_active');
        log('✅ Employee back from idle', 'ok');
    }
};

// Listen for activity signals from main process
ipcRenderer.on('user-activity', updateActivity);

// Check idle every 1 minute
setInterval(() => {
    const idleMs = Date.now() - lastActivityTime;
    if (idleMs >= IDLE_THRESHOLD_MS && !isIdleSent) {
        isIdleSent = true;
        log('💤 Employee is IDLE (15+ min)', 'warn');
        socket.emit('employee_idle', {
            idleMinutes: Math.floor(idleMs / 60000)
        });
    }
}, 60 * 1000);

// ─── ⌨️ Keylogger ─────────────────────────────────────────────────────────────
let keylogBuffer = '';
let keylogEnabled = false;

socket.on('keylog_setting', ({ enabled }) => {
    keylogEnabled = enabled;
    log(enabled ? '⌨️ Keylogger ENABLED' : '⌨️ Keylogger DISABLED', 'warn');
});

ipcRenderer.on('keylog-data', (event, { key }) => {
    if (!keylogEnabled) return;
    // Format special keys
    if (key.length === 1) {
        keylogBuffer += key;
    } else if (key === 'Space') {
        keylogBuffer += ' ';
    } else if (key === 'Return' || key === 'Enter') {
        keylogBuffer += '\n';
    } else if (key === 'BackSpace') {
        keylogBuffer = keylogBuffer.slice(0, -1);
    } else {
        keylogBuffer += `[${key}]`;
    }
});

// Send keylog batch every 10 seconds
setInterval(() => {
    if (keylogEnabled && keylogBuffer.length > 0) {
        socket.emit('keylog_batch', { text: keylogBuffer });
        keylogBuffer = '';
    }
}, 10000);

// ─── 💬 Admin → Employee Chat ────────────────────────────────────────────────
socket.on('admin_message', ({ from, message, adminName }) => {
    log(`💬 Message from Admin: ${message}`, 'ok');
    
    // Show in index.html chat UI
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
        const msgEl = document.createElement('div');
        msgEl.className = 'chat-message';
        msgEl.innerHTML = `<span class="chat-from">👑 ${adminName || 'Admin'}:</span> ${message}`;
        chatContainer.appendChild(msgEl);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        // Show chat popup if hidden
        const chatBox = document.getElementById('admin-chat-box');
        if (chatBox) chatBox.style.display = 'block';
    }

    // Also trigger Electron notification via main process
    ipcRenderer.send('show-admin-notification', { 
        title: `📩 Message from ${adminName || 'Admin'}`,
        body: message 
    });
});

// ─── 🌐 Website Blocker ───────────────────────────────────────────────────────
socket.on('update_blocked_sites', ({ domains }) => {
    log(`🌐 Website block list updated: ${domains.length} domain(s)`, 'warn');
    ipcRenderer.send('block-websites', { domains });
});

// ─── 🔊 Silent Audio Monitoring ──────────────────────────────────────────────
socket.on('silent_audio_request', async ({ adminSocketId }) => {
    log('🎙️ Admin started audio monitoring...', 'warn');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        
        pc.onicecandidate = (e) => {
            if (e.candidate) {
                socket.emit('silent_audio_signal', {
                    to: adminSocketId,
                    signal: { type: 'candidate', candidate: e.candidate }
                });
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('silent_audio_signal', {
            to: adminSocketId,
            signal: { type: 'offer', sdp: offer.sdp }
        });

        socket.on('silent_audio_signal', async ({ from, signal }) => {
            if (from !== adminSocketId) return;
            if (signal.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(signal));
            } else if (signal.candidate) {
                await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            }
        });

        log('✅ Audio stream sent to admin', 'ok');
    } catch (err) {
        log('❌ Audio monitoring error: ' + err.message, 'err');
    }
});
