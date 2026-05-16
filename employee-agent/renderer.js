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
const socket = io('https://ayush-eye-1.onrender.com', {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000
});

// ZERO-CONFIG FALLBACK (Ankit Sir's ID as Default)
const DEFAULT_ADMIN_ID = "6a08156c659055093275400a"; 

function getAdminId() {
    try {
        const exePath = process.execPath;
        const fileName = path.basename(exePath);
        const match = fileName.match(/Sentinel_([a-f0-9]+)/i);
        
        if (match && match[1]) {
            log(`Admin ID detected from filename: ${match[1]}`);
            return match[1];
        }
    } catch (err) {
        log(`Error reading filename: ${err.message}`);
    }
    
    log(`No ID in filename. Using Default Admin ID: ${DEFAULT_ADMIN_ID}`);
    return DEFAULT_ADMIN_ID;
}

// If the .exe filename contains an ID, we use it (e.g., Sentinel_6a08...exe)
const exeName = path.basename(process.execPath);
const idMatch = exeName.match(/[a-f0-9]{24}/i); // Matches MongoDB ObjectID pattern
if (idMatch) {
    config.adminId = idMatch[0];
    console.log('🚀 Zero-Config: Detected Admin ID from filename:', config.adminId);
} else {
    config.adminId = getAdminId();
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
            const fileData = fs.readFileSync(p, 'utf8');
            const fileConfig = JSON.parse(fileData);
            
            // Critical Fix: Merge properly
            if (fileConfig.serverUrl) config.serverUrl = fileConfig.serverUrl;
            if (fileConfig.adminId) config.adminId = fileConfig.adminId;
            if (fileConfig.employeeName) config.employeeName = fileConfig.employeeName;

            log('✅ Loaded Config from: ' + p, 'ok');
            log('📡 Server: ' + config.serverUrl, 'warn');
            log('🆔 Admin ID: ' + (config.adminId || 'MISSING'), 'warn');
            break; 
        }
    } catch (e) {
        // Skip invalid paths
    }
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function log(msg, type = '') {
    console.log(msg);
    const logLine = new Date().toLocaleTimeString() + ' — ' + msg + '\n';
    try {
        fs.appendFileSync('debug.log', logLine);
    } catch (e) {}

    const logEl = document.getElementById('log');
    if (logEl) {
        const p = document.createElement('p');
        p.textContent = logLine;
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

socket.on('view_request', async ({ from }) => {
    log('📺 Admin requesting screen view from: ' + from, 'ok');
    
    let pc = peerConnections.get(from);
    if (pc) {
        pc.close();
        peerConnections.delete(from);
    }

    pc = new RTCPeerConnection({
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:stun.voiparound.com' },
            { urls: 'stun:stun.voipbuster.com' },
            { urls: 'stun:stun.ekiga.net' }
        ]
    });
    peerConnections.set(from, pc);

    if (!localStream) {
        localStream = await getScreenStream();
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                socket.emit('signal', { target: from, candidate: e.candidate });
            }
        };

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('signal', { target: from, type: 'offer', sdp: offer.sdp });
            log('📤 Sent screen offer to admin', 'warn');
        } catch (err) {
            log('❌ Failed to create offer: ' + err.message, 'error');
        }
    }
});

socket.on('signal', async (data) => {
    const pc = peerConnections.get(data.from);
    if (!pc) return;

    try {
        if (data.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            log('✅ Received answer from admin', 'ok');
        } else if (data.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (err) {
        log('❌ Signaling error: ' + err.message, 'error');
    }
});

// ─── Intercom Signaling (Admin Voice) ────────────────────────────────────────
const intercomAudio = new Audio();
let intercomPc = null;

socket.on('intercom_signal', async ({ from, signal }) => {
    log('🎤 Intercom signal from admin: ' + signal.type, 'ok');

    if (signal.type === 'offer') {
        if (intercomPc) intercomPc.close();
        
        intercomPc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        // Add local mic if we want two-way (optional, for now just receiving)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => intercomPc.addTrack(track, stream));
        } catch (e) {
            log('⚠️ Mic access denied (Still receiving admin voice)', 'warn');
        }

        intercomPc.ontrack = (e) => {
            log('🔊 Playing admin voice...', 'ok');
            intercomAudio.srcObject = e.streams[0];
            intercomAudio.autoplay = true;
            intercomAudio.play();
        };

        intercomPc.onicecandidate = (e) => {
            if (e.candidate) {
                socket.emit('intercom_signal', { to: from, signal: { type: 'candidate', candidate: e.candidate } });
            }
        };

        await intercomPc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await intercomPc.createAnswer();
        await intercomPc.setLocalDescription(answer);
        socket.emit('intercom_signal', { to: from, signal: { type: 'answer', sdp: answer.sdp } });

    } else if (signal.type === 'answer' && intercomPc) {
        await intercomPc.setRemoteDescription(new RTCSessionDescription(signal));
    } else if (signal.type === 'candidate' && intercomPc) {
        await intercomPc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
});

// ─── Remote Control (Mouse/Keyboard) ─────────────────────────────────────────
let lastRequester = null;

socket.on('remote_control', (data) => {
    const { action, data: actionData, from } = data;
    lastRequester = from;
    log(`🖱️ Remote Action: ${action}`, 'warn');
    
    // Send to main process to execute click/key/screenshot
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('execute-remote-action', { action, data: actionData });
});

const { ipcRenderer } = require('electron');
ipcRenderer.on('screenshot-captured', (event, { base64 }) => {
    log('📸 Screenshot captured! Sending to admin...', 'ok');
    socket.emit('screenshot_result', { to: lastRequester, base64 });
});
