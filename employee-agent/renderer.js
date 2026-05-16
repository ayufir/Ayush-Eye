// renderer.js — Sentinel Employee Agent (Auto-Recovery Version)
const { desktopCapturer } = require('electron');
const io = require('socket.io-client');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Load config from multiple possible locations
let config = {
    serverUrl: 'https://ayush-eye-1.onrender.com',
    adminId: '',
    employeeName: os.hostname()
};

// --- SMART ID DETECTION (Zero-Config) ---
// If the .exe filename contains an ID, we use it (e.g., Sentinel_6a08...exe)
const exeName = path.basename(process.execPath);
const idMatch = exeName.match(/[a-f0-9]{24}/i); // Matches MongoDB ObjectID pattern
if (idMatch) {
    config.adminId = idMatch[0];
    console.log('🚀 Zero-Config: Detected Admin ID from filename:', config.adminId);
}

const possiblePaths = [
    './config.json',
    path.join(process.cwd(), 'config.json'),
    path.join(__dirname, 'config.json'),
    path.join(process.resourcesPath, 'config.json'),
    path.join(process.resourcesPath, '..', 'config.json')
];

for (const p of possiblePaths) {
    try {
        if (fs.existsSync(p)) {
            const fileConfig = JSON.parse(fs.readFileSync(p, 'utf8'));
            // Filename ID takes precedence if present
            config = { ...config, ...fileConfig, adminId: config.adminId || fileConfig.adminId };
            console.log('✅ Loaded config from:', p);
            break; 
        }
    } catch (e) {
        // Silently skip
    }
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function log(msg, type = '') {
    console.log(msg);
    const logEl = document.getElementById('log');
    if (logEl) {
        const p = document.createElement('p');
        p.textContent = new Date().toLocaleTimeString() + ' — ' + msg;
        p.className = type;
        logEl.prepend(p);
    }
}

function setStatus(text, connected = false) {
    const dot = document.getElementById('dot');
    const statusText = document.getElementById('statusText');
    if (dot) dot.className = 'dot' + (connected ? ' connected' : '');
    if (statusText) statusText.textContent = text;
}

// ─── Socket Connection ────────────────────────────────────────────────────────
const socket = io(config.serverUrl, {
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: Infinity
});

let localStream = null;
const peerConnections = new Map();
let isCapturing = false;

// ─── Resilient Screen Capture ─────────────────────────────────────────────────
async function getScreenStream(retryCount = 0) {
    if (isCapturing) return localStream;
    isCapturing = true;

    try {
        const { ipcRenderer } = require('electron');
        const sources = await ipcRenderer.invoke('get-desktop-sources');

        if (!sources || !sources.length) {
            throw new Error('No screen sources found');
        }

        const primarySource = sources[0];
        log('Capturing: ' + primarySource.name, 'ok');

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: primarySource.id,
                    minWidth: 1280,
                    maxWidth: 1920,
                    minHeight: 720,
                    maxHeight: 1080
                }
            }
        });

        stream.getVideoTracks()[0].onended = () => {
            log('⚠️ Screen track ended. Recovering...', 'err');
            isCapturing = false;
            setTimeout(() => getScreenStream(), 2000);
        };

        localStream = stream;
        log('✅ Screen stream ready!', 'ok');
        return stream;

    } catch (err) {
        isCapturing = false;
        log('❌ Capture error: ' + err.message, 'err');
        
        if (retryCount < 5) {
            log(`🔄 Retrying capture... (${retryCount + 1})`, 'warn');
            return new Promise(resolve => setTimeout(() => resolve(getScreenStream(retryCount + 1)), 3000));
        }
        return null;
    }
}

// ─── Socket Events ────────────────────────────────────────────────────────────
socket.on('connect', async () => {
    log('✅ Connected to Sentinel server!', 'ok');
    setStatus('Connected — ' + config.employeeName, true);

    // Initial capture attempt
    localStream = await getScreenStream();

    // Register with Admin ID
    if (!config.adminId || config.adminId === "YOUR_ADMIN_ID") {
        log('❌ ERROR: Admin ID is missing in config.json!', 'error');
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

    log('📤 Registering: ' + JSON.stringify(registrationData), 'warn');
    socket.emit('identify', registrationData);

    log('Registered with Organization Key: ' + (config.adminId || 'NONE'), 'ok');
});

socket.on('disconnect', () => {
    log('❌ Disconnected from server', 'err');
    setStatus('Disconnected — Reconnecting...', false);
    peerConnections.forEach(pc => pc.close());
    peerConnections.clear();
});

socket.on('view_request', async ({ adminId }) => {
    log('📺 Admin requesting screen view...', 'ok');
    
    let pc = peerConnections.get(adminId);
    if (pc) {
        pc.close();
        peerConnections.delete(adminId);
    }

    pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    });
    peerConnections.set(adminId, pc);

    if (!localStream) localStream = await getScreenStream();
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = (e) => {
        if (e.candidate) {
            socket.emit('rtc_signal', { to: adminId, signal: { type: 'candidate', candidate: e.candidate } });
        }
    };

    // Create and send offer
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('rtc_signal', { to: adminId, signal: { type: 'offer', sdp: offer.sdp } });
        log('📤 Sent screen offer to admin', 'warn');
    } catch (err) {
        log('❌ Failed to create offer: ' + err.message, 'error');
    }
});

socket.on('rtc_signal', async ({ from, signal }) => {
    const pc = peerConnections.get(from);
    if (!pc) return;

    try {
        if (signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
            log('✅ Received answer from admin', 'ok');
        } else if (signal.type === 'candidate' && signal.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    } catch (err) {
        console.error('WebRTC signal error:', err);
    }
});

// Intercom signaling logic...
socket.on('intercom_signal', async ({ from, signal }) => {
    // Similar to LiveWall intercom logic
});
