const { log } = require('../utils/logger');
const { ipcRenderer } = require('electron');
const { getLocalStream, getScreenStream } = require('./screenService');

const peerConnections = new Map();
let meetingPC = null;
let intercomPc = null;
const intercomAudio = new Audio();

const handleViewRequest = async (socket, from) => {
    log('📺 Admin requesting screen view from: ' + from, 'ok');
    
    let pc = peerConnections.get(from);
    if (pc) {
        pc.close();
        peerConnections.delete(from);
    }

    pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    peerConnections.set(from, pc);

    let stream = getLocalStream();
    if (!stream) {
        stream = await getScreenStream();
    }
    
    if (stream) {
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                socket.emit('rtc_signal', { to: from, signal: { candidate: e.candidate } });
            }
        };

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('rtc_signal', { to: from, signal: offer });
            log('📤 Sent screen offer to admin', 'warn');
        } catch (err) {
            log('❌ Failed to create offer: ' + err.message, 'error');
        }
    }
};

const handleRtcSignal = async (data) => {
    const pc = peerConnections.get(data.from);
    if (!pc) return;

    try {
        if (data.signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(data.signal));
            log('✅ Received answer from admin', 'ok');
        } else if (data.signal.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
        }
    } catch (err) {
        log('❌ Signaling error: ' + err.message, 'error');
    }
};

const handleIntercomSignal = async (socket, from, signal) => {
    log('🎤 Intercom signal from admin: ' + signal.type, 'ok');

    if (signal.type === 'offer') {
        if (intercomPc) intercomPc.close();
        
        intercomPc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => intercomPc.addTrack(track, stream));
        } catch (e) {
            log('⚠️ Mic access denied (Still receiving admin voice)', 'warn');
        }

        intercomPc.ontrack = (e) => {
            log('🔊 Playing admin voice...', 'ok');
            const stream = e.streams && e.streams[0] ? e.streams[0] : new MediaStream([e.track]);
            intercomAudio.srcObject = stream;
            intercomAudio.autoplay = true;
            intercomAudio.play().catch(err => log('🔊 Autoplay error: ' + err.message, 'err'));
        };

        intercomPc.onicecandidate = (e) => {
            if (e.candidate) {
                socket.emit('intercom_signal', { to: from, signal: { type: 'candidate', candidate: e.candidate } });
            }
        };

        await intercomPc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await intercomPc.createAnswer();
        await intercomPc.setLocalDescription(answer);
        socket.emit('intercom_signal', { to: from, signal: answer });

    } else if (signal.type === 'answer' && intercomPc) {
        await intercomPc.setRemoteDescription(new RTCSessionDescription(signal));
    } else if (signal.candidate && intercomPc) {
        await intercomPc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
};

const handleMeetingInvitation = (socket, { roomName, hostId, hostName }) => {
    log(`📞 Incoming Meeting: ${roomName} from ${hostName}`, 'warn');

    // Avoid duplicate invitation popups!
    if (document.getElementById('meeting-invite')) {
        log('⚠️ Meeting invitation popup is already active. Ignoring duplicate event.', 'warn');
        return;
    }
    
    // Auto show the Electron window so the employee can see the invitation prompt!
    ipcRenderer.send('show-meeting-window');

    // Globally bind the click handlers so that inline HTML onclick always executes perfectly!
    window.handleJoinMeetingClick = () => {
        log('🟢 Global JOIN button clicked via HTML onclick!', 'ok');
        try {
            const inviteDiv = document.getElementById('meeting-invite');
            if (inviteDiv) inviteDiv.remove();
            joinMeeting(socket, hostId, roomName).catch(err => {
                log('❌ Async Error inside joinMeeting: ' + err.message, 'err');
            });
        } catch (err) {
            log('❌ Synchronous Error in JOIN click: ' + err.message, 'err');
        }
    };

    window.handleDeclineMeetingClick = () => {
        log('🔴 Global DECLINE button clicked via HTML onclick!', 'warn');
        try {
            const inviteDiv = document.getElementById('meeting-invite');
            if (inviteDiv) inviteDiv.remove();
            ipcRenderer.send('hide-meeting-window');
        } catch (err) {
            log('❌ Error in DECLINE click: ' + err.message, 'err');
        }
    };

    const inviteDiv = document.createElement('div');
    inviteDiv.id = 'meeting-invite';
    inviteDiv.style = "position: fixed; inset: 0; z-index: 2000; background: rgba(15, 23, 42, 0.9); display: flex; align-items: center; justify-content: center; padding: 24px; backdrop-filter: blur(8px);";
    inviteDiv.innerHTML = `
        <div style="background: #1e293b; padding: 30px; border-radius: 20px; text-align: center; border: 1px solid #3b82f6; width: 100%; max-width: 400px; color: white;">
            <h2 style="font-size: 20px; font-weight: bold; margin-bottom: 10px;">Meeting Invitation</h2>
            <p style="color: #94a3b8; font-size: 14px; margin-bottom: 25px;">${hostName} invited you to "${roomName}"</p>
            <div style="display: flex; gap: 15px;">
                <button id="join-btn" onclick="window.handleJoinMeetingClick()" style="flex: 1; padding: 12px; background: #10b981; color: white; border-radius: 10px; font-weight: bold; border: none; cursor: pointer;">JOIN</button>
                <button id="decline-btn" onclick="window.handleDeclineMeetingClick()" style="flex: 1; padding: 12px; background: #ef4444; color: white; border-radius: 10px; font-weight: bold; border: none; cursor: pointer;">DECLINE</button>
            </div>
        </div>
    `;
    document.body.appendChild(inviteDiv);
    log('🟢 Invitation popup rendered with inline global click handlers!', 'ok');
};

const joinMeeting = async (socket, hostId, roomName) => {
    log('🤝 Requesting local media devices...', 'ok');

    // Clean up any previous meeting connection and listeners to prevent duplicates
    if (meetingPC) {
        meetingPC.close();
        meetingPC = null;
    }
    socket.off('meeting_signal');
    socket.off('meeting_ended');
    socket.off('meeting_chat_message');

    meetingPC = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    let localStream = null;
    try {
        // Try getting both video and audio
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        log('✅ Camera & Microphone successfully attached to call!', 'ok');
    } catch (err) {
        log('⚠️ Camera & Mic combo failed: ' + err.message + '. Trying audio only...', 'warn');
        try {
            // Try getting audio only
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            log('✅ Microphone successfully attached (no camera found)!', 'ok');
        } catch (err2) {
            log('⚠️ Microphone failed: ' + err2.message + '. Trying video only...', 'warn');
            try {
                // Try getting video only
                localStream = await navigator.mediaDevices.getUserMedia({ video: true });
                log('✅ Camera successfully attached (no microphone found)!', 'ok');
            } catch (err3) {
                log('❌ No camera or microphone available (Receive-only mode active): ' + err3.message, 'err');
            }
        }
    }

    if (localStream) {
        localStream.getTracks().forEach(track => meetingPC.addTrack(track, localStream));
    }

    log('🤝 Emitting join_meeting to host...', 'ok');
    socket.emit('join_meeting', { hostId, roomName });

    meetingPC.onicecandidate = (e) => {
        if (e.candidate) socket.emit('meeting_signal', { to: hostId, signal: { candidate: e.candidate } });
    };

    // Load configuration to get the employee name
    let employeeName = 'Employee';
    try {
        const { loadConfig } = require('./configService');
        const config = loadConfig();
        if (config.employeeName) {
            employeeName = config.employeeName;
        }
    } catch (e) {
        log('⚠️ Could not load employee name for meeting UI', 'warn');
    }

    // Create the premium Google Meet UI immediately so self view is shown
    const styleBlock = document.createElement('style');
    styleBlock.innerHTML = `
        #active-meeting {
            position: fixed;
            inset: 0;
            background: #202124;
            display: flex;
            flex-direction: column;
            z-index: 2100;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            overflow: hidden;
            user-select: none;
        }
        .meeting-main {
            flex: 1;
            display: flex;
            overflow: hidden;
            position: relative;
            padding: 24px;
            gap: 20px;
        }
        .video-area {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }
        .video-grid {
            width: 100%;
            height: 100%;
            max-width: 1200px;
            max-height: 80vh;
            display: grid;
            grid-template-columns: 1fr;
            gap: 20px;
            align-items: center;
            justify-content: center;
        }
        @media (min-width: 768px) {
            .video-grid.two-cards {
                grid-template-columns: 1fr 1fr;
            }
        }
        .video-card {
            position: relative;
            aspect-ratio: 16/9;
            width: 100%;
            background: #3c4043;
            border-radius: 16px;
            overflow: hidden;
            border: 1px solid rgba(255,255,255,0.08);
            box-shadow: 0 8px 24px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .video-card video {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 16px;
        }
        .video-card.mirrored video {
            transform: scaleX(-1);
        }
        .avatar-placeholder {
            width: 90px;
            height: 90px;
            border-radius: 50%;
            background: #1a73e8;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 36px;
            font-weight: 600;
            text-transform: uppercase;
            color: white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        .avatar-placeholder.host {
            background: #475569;
            color: #e2e8f0;
        }
        .card-label {
            position: absolute;
            bottom: 16px;
            left: 16px;
            background: rgba(0,0,0,0.6);
            backdrop-filter: blur(10px);
            padding: 6px 14px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .control-bar {
            height: 88px;
            background: #202124;
            border-top: 1px solid rgba(255,255,255,0.08);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 32px;
            z-index: 50;
        }
        .info-section {
            display: flex;
            align-items: center;
            gap: 16px;
            font-size: 15px;
            font-weight: 500;
        }
        .info-section .time {
            color: white;
        }
        .info-section .divider {
            color: rgba(255,255,255,0.25);
        }
        .info-section .room-id {
            color: #e8eaed;
            font-weight: 600;
            letter-spacing: 0.5px;
        }
        .controls-center {
            display: flex;
            align-items: center;
            gap: 14px;
        }
        .control-btn {
            width: 52px;
            height: 52px;
            border-radius: 50%;
            border: none;
            background: #3c4043;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }
        .control-btn:hover {
            background: #4a4f54;
            transform: scale(1.05);
        }
        .control-btn.disabled {
            background: #ea4335;
        }
        .control-btn.disabled:hover {
            background: #eb5246;
        }
        .control-btn.active-orange {
            background: #f89b1c;
        }
        .control-btn.active-orange:hover {
            background: #fcae3e;
        }
        .control-btn.leave {
            width: 76px;
            border-radius: 26px;
            background: #ea4335;
        }
        .control-btn.leave:hover {
            background: #d93025;
        }
        .controls-right {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .sidebar-btn {
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: none;
            background: transparent;
            color: #e8eaed;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .sidebar-btn:hover {
            background: rgba(255,255,255,0.08);
        }
        .sidebar-btn.active {
            background: #e8f0fe;
            color: #1a73e8;
        }
        .sidebar-btn.active:hover {
            background: #d2e3fc;
        }
        
        .meet-sidebar {
            width: 340px;
            background: #1e293b;
            border-left: 1px solid rgba(255,255,255,0.08);
            display: flex;
            flex-direction: column;
            height: 100%;
            border-radius: 16px;
            overflow: hidden;
            z-index: 60;
            box-shadow: -8px 0 24px rgba(0,0,0,0.2);
            transition: width 0.3s ease;
        }
        .sidebar-header {
            padding: 18px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .sidebar-header h3 {
            margin: 0;
            font-size: 15px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #e8eaed;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .sidebar-tabs {
            display: flex;
            border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .sidebar-tab {
            flex: 1;
            background: transparent;
            border: none;
            color: #94a3b8;
            font-size: 13px;
            font-weight: 700;
            padding: 14px 0;
            cursor: pointer;
            border-bottom: 2px solid transparent;
            transition: all 0.2s ease;
        }
        .sidebar-tab.active {
            border-bottom-color: #1a73e8;
            color: #1a73e8;
        }
        .sidebar-tab:hover:not(.active) {
            color: #e2e8f0;
        }
        .sidebar-body {
            flex: 1;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            padding: 18px;
            background: rgba(15, 23, 42, 0.15);
        }
        .chat-messages {
            flex: 1;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 14px;
            padding-right: 6px;
        }
        .chat-bubble {
            max-width: 85%;
            border-radius: 16px;
            padding: 10px 14px;
            font-size: 13px;
            display: flex;
            flex-direction: column;
            gap: 3px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }
        .chat-bubble.self {
            background: #1a73e8;
            color: white;
            align-self: flex-end;
            border-bottom-right-radius: 4px;
        }
        .chat-bubble.remote {
            background: #0f172a;
            color: #f1f5f9;
            align-self: flex-start;
            border-bottom-left-radius: 4px;
            border: 1px solid rgba(255,255,255,0.05);
        }
        .chat-sender {
            font-size: 9px;
            font-weight: 700;
            opacity: 0.85;
            letter-spacing: 0.3px;
        }
        .chat-text {
            word-break: break-word;
            line-height: 1.45;
        }
        .chat-time {
            font-size: 8px;
            text-align: right;
            opacity: 0.7;
            margin-top: 2px;
        }
        .chat-form {
            display: flex;
            gap: 8px;
            background: #0f172a;
            padding: 8px;
            border-radius: 14px;
            border: 1px solid rgba(255,255,255,0.08);
        }
        .chat-input {
            flex: 1;
            background: transparent;
            border: none;
            outline: none;
            color: white;
            font-size: 13px;
            padding: 6px 10px;
        }
        .chat-send-btn {
            background: #1a73e8;
            border: none;
            color: white;
            width: 36px;
            height: 36px;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .chat-send-btn:hover {
            background: #1557b0;
            transform: scale(1.05);
        }
        .people-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            overflow-y: auto;
        }
        .person-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #0f172a;
            padding: 12px 16px;
            border-radius: 14px;
            border: 1px solid rgba(255,255,255,0.05);
        }
        .person-name {
            font-size: 13px;
            font-weight: 600;
            color: #e2e8f0;
        }
        .person-role {
            font-size: 11px;
            color: #94a3b8;
            background: rgba(255,255,255,0.08);
            padding: 3px 8px;
            border-radius: 6px;
        }
    `;
    document.head.appendChild(styleBlock);

    const meetingWindow = document.createElement('div');
    meetingWindow.id = 'active-meeting';
    meetingWindow.innerHTML = `
        <div class="meeting-main">
            <div class="video-area">
                <div class="video-grid two-cards" id="video-grid">
                    <!-- Admin Host Video Card -->
                    <div class="video-card" id="host-card">
                        <video id="host-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover; display: none;"></video>
                        <div class="avatar-placeholder host" id="host-avatar">A</div>
                        <div class="card-label">
                            <span>Admin Host</span>
                        </div>
                    </div>

                    <!-- Self (Employee) Video Card -->
                    <div class="video-card mirrored" id="self-card">
                        <video id="self-video" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover;"></video>
                        <div class="avatar-placeholder" id="self-avatar" style="display: none;">${employeeName.charAt(0)}</div>
                        <div class="card-label">
                            <span>YOU (${employeeName})</span>
                            <svg id="self-mic-status-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none; color: #ea4335;"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right Sidebar Panel -->
            <div class="meet-sidebar" id="meet-sidebar" style="display: none;">
                <div class="sidebar-header">
                    <h3 id="sidebar-title">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #1a73e8; margin-right: 4px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        <span>In-call Messages</span>
                    </h3>
                    <button class="sidebar-btn" id="close-sidebar-btn" style="width: 32px; height: 32px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" x2="6" y1="6" y2="18"/><line x1="6" x2="18" y1="6" y2="18"/></svg>
                    </button>
                </div>
                
                <div class="sidebar-tabs">
                    <button class="sidebar-tab active" id="tab-chat-btn">Chat</button>
                    <button class="sidebar-tab" id="tab-people-btn">People</button>
                </div>

                <div class="sidebar-body">
                    <!-- Chat Panel -->
                    <div id="sidebar-chat-panel" style="flex: 1; display: flex; flex-direction: column; height: 100%;">
                        <div class="chat-messages" id="meeting-chat-messages">
                            <div style="font-size: 11px; color: #64748b; text-align: center; margin: 10px 0;">Messages are visible to active call members only.</div>
                        </div>
                        <form class="chat-form" id="meeting-chat-form">
                            <input class="chat-input" id="meeting-chat-input" placeholder="Send message..." autocomplete="off" />
                            <button type="submit" class="chat-send-btn">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" x2="11" y1="2" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                            </button>
                        </form>
                    </div>

                    <!-- People Panel -->
                    <div id="sidebar-people-panel" style="flex: 1; display: none;">
                        <div class="people-list">
                            <div class="person-row">
                                <span class="person-name">Admin Host</span>
                                <span class="person-role">Host</span>
                            </div>
                            <div class="person-row">
                                <span class="person-name">${employeeName} (YOU)</span>
                                <span class="person-role">Participant</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Bottom Control Bar -->
        <div class="control-bar">
            <!-- Left Side: Time and Room -->
            <div class="info-section">
                <span class="time" id="meet-time">12:00 PM</span>
                <span class="divider">|</span>
                <span class="room-id">${roomName || 'sentinel-meet-room'}</span>
            </div>

            <!-- Center Side: Audio, Video, Leave and Controls -->
            <div class="controls-center">
                <!-- Microphone Toggle -->
                <button class="control-btn" id="meet-mic-btn" title="Mute Microphone">
                    <svg id="mic-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                </button>

                <!-- Camera Toggle -->
                <button class="control-btn" id="meet-cam-btn" title="Turn Off Camera">
                    <svg id="cam-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
                </button>

                <!-- Hand Raise -->
                <button class="control-btn" id="meet-hand-btn" title="Raise Hand">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5"/><path d="M14 10V5a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6.5"/><path d="M6 15V11a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v6c0 5 4 9 9 9h1a8 8 0 0 0 8-8v-2a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/></svg>
                </button>

                <!-- End/Leave Call -->
                <button class="control-btn leave" id="meet-leave-btn" title="Leave Call">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform: rotate(135deg);"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/></svg>
                </button>
            </div>

            <!-- Right Side: Details and Panel toggles -->
            <div class="controls-right">
                <!-- Info Toggle -->
                <button class="sidebar-btn" id="meet-info-btn" title="Meeting Info">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12" y1="8" y2="8"/></svg>
                </button>
                <!-- People Toggle -->
                <button class="sidebar-btn" id="meet-people-btn" title="People">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </button>
                <!-- Chat Toggle -->
                <button class="sidebar-btn" id="meet-chat-btn" title="Chat messages">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(meetingWindow);

    // Bind local stream to self video element
    const selfVideo = document.getElementById('self-video');
    const selfAvatar = document.getElementById('self-avatar');
    if (localStream && selfVideo) {
        selfVideo.srcObject = localStream;
    } else if (selfVideo) {
        selfVideo.style.display = 'none';
        selfAvatar.style.display = 'flex';
    }

    // Set up active states and events
    let isMicOn = true;
    let isCamOn = true;
    let isHandRaised = false;
    let sidebarOpen = false;
    let activeTab = 'chat'; // 'chat' | 'people'

    const micBtn = document.getElementById('meet-mic-btn');
    const camBtn = document.getElementById('meet-cam-btn');
    const handBtn = document.getElementById('meet-hand-btn');
    const leaveBtn = document.getElementById('meet-leave-btn');
    const infoBtn = document.getElementById('meet-info-btn');
    const peopleBtn = document.getElementById('meet-people-btn');
    const chatBtn = document.getElementById('meet-chat-btn');
    const sidebar = document.getElementById('meet-sidebar');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const tabChatBtn = document.getElementById('tab-chat-btn');
    const tabPeopleBtn = document.getElementById('tab-people-btn');
    const chatPanel = document.getElementById('sidebar-chat-panel');
    const peoplePanel = document.getElementById('sidebar-people-panel');
    const sidebarTitle = document.getElementById('sidebar-title');
    const selfMicStatusIcon = document.getElementById('self-mic-status-icon');

    // Real-time Clock
    const updateTime = () => {
        const meetTimeEl = document.getElementById('meet-time');
        if (meetTimeEl) {
            meetTimeEl.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    };
    updateTime();
    const timeInterval = setInterval(updateTime, 10000);

    // Audio Mute/Unmute
    micBtn.onclick = () => {
        if (localStream) {
            const audioTrack = localStream.getAudioTracks()[0];
            if (audioTrack) {
                isMicOn = !isMicOn;
                audioTrack.enabled = isMicOn;
                if (isMicOn) {
                    micBtn.classList.remove('disabled');
                    micBtn.title = 'Mute Microphone';
                    micBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;
                    selfMicStatusIcon.style.display = 'none';
                } else {
                    micBtn.classList.add('disabled');
                    micBtn.title = 'Unmute Microphone';
                    micBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" x2="23" y1="1" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;
                    selfMicStatusIcon.style.display = 'block';
                }
            }
        }
    };

    // Camera On/Off
    camBtn.onclick = () => {
        if (localStream) {
            const videoTrack = localStream.getVideoTracks()[0];
            if (videoTrack) {
                isCamOn = !isCamOn;
                videoTrack.enabled = isCamOn;
                if (isCamOn) {
                    camBtn.classList.remove('disabled');
                    camBtn.title = 'Turn Off Camera';
                    camBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>`;
                    selfVideo.style.display = 'block';
                    selfAvatar.style.display = 'none';
                } else {
                    camBtn.classList.add('disabled');
                    camBtn.title = 'Turn On Camera';
                    camBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="1" x2="23" y1="1" y2="23"/><path d="M21 16V8a2 2 0 0 0-2-2h-9m-4 1.34V18a2 2 0 0 0 2 2h9a2 2 0 0 0 1.34-.48"/><path d="m22 8-6 4 6 4V8Z"/></svg>`;
                    selfVideo.style.display = 'none';
                    selfAvatar.style.display = 'flex';
                }
            }
        }
    };

    // Hand Raise
    handBtn.onclick = () => {
        isHandRaised = !isHandRaised;
        if (isHandRaised) {
            handBtn.classList.add('active-orange');
        } else {
            handBtn.classList.remove('active-orange');
        }
    };

    // Info Details
    infoBtn.onclick = () => {
        log(`ℹ️ Meeting Room Code: ${roomName}`, 'ok');
    };

    // Sidebar Toggles
    const toggleSidebar = (tab) => {
        if (sidebarOpen && activeTab === tab) {
            // Close
            sidebar.style.display = 'none';
            sidebarOpen = false;
            chatBtn.classList.remove('active');
            peopleBtn.classList.remove('active');
        } else {
            // Open/Switch
            sidebar.style.display = 'flex';
            sidebarOpen = true;
            activeTab = tab;
            
            if (tab === 'chat') {
                chatBtn.classList.add('active');
                peopleBtn.classList.remove('active');
                tabChatBtn.classList.add('active');
                tabPeopleBtn.classList.remove('active');
                chatPanel.style.display = 'flex';
                peoplePanel.style.display = 'none';
                sidebarTitle.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #1a73e8; margin-right: 6px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>In-call Messages</span>`;
            } else {
                peopleBtn.classList.add('active');
                chatBtn.classList.remove('active');
                tabPeopleBtn.classList.add('active');
                tabChatBtn.classList.remove('active');
                peoplePanel.style.display = 'block';
                chatPanel.style.display = 'none';
                sidebarTitle.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #1a73e8; margin-right: 6px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><span>People</span>`;
            }
        }
    };

    chatBtn.onclick = () => toggleSidebar('chat');
    peopleBtn.onclick = () => toggleSidebar('people');
    closeSidebarBtn.onclick = () => {
        sidebar.style.display = 'none';
        sidebarOpen = false;
        chatBtn.classList.remove('active');
        peopleBtn.classList.remove('active');
    };

    tabChatBtn.onclick = () => {
        activeTab = 'chat';
        tabChatBtn.classList.add('active');
        tabPeopleBtn.classList.remove('active');
        chatPanel.style.display = 'flex';
        peoplePanel.style.display = 'none';
    };

    tabPeopleBtn.onclick = () => {
        activeTab = 'people';
        tabPeopleBtn.classList.add('active');
        tabChatBtn.classList.remove('active');
        peoplePanel.style.display = 'block';
        chatPanel.style.display = 'none';
    };

    // Clean up call
    const cleanUpCall = () => {
        clearInterval(timeInterval);
        meetingWindow.remove();
        socket.off('meeting_chat_message');
        socket.off('meeting_ended');
        socket.off('meeting_signal');
        
        if (meetingPC) {
            meetingPC.close();
            meetingPC = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        ipcRenderer.send('hide-meeting-window');
        log('🟢 Left the meeting call successfully', 'ok');
    };

    leaveBtn.onclick = cleanUpCall;

    // Handle incoming streams
    meetingPC.ontrack = (e) => {
        log('🔊 Received remote media track from Admin Host', 'ok');
        const hostVideo = document.getElementById('host-video');
        const hostAvatar = document.getElementById('host-avatar');
        if (hostVideo && e.streams[0]) {
            hostVideo.srcObject = e.streams[0];
            hostVideo.style.display = 'block';
            if (hostAvatar) hostAvatar.style.display = 'none';
            log('📺 Bound remote stream to video element', 'ok');
        }
    };

    // Handle meeting chat form submit
    document.getElementById('meeting-chat-form').onsubmit = (event) => {
        event.preventDefault();
        const input = document.getElementById('meeting-chat-input');
        if (!input || !input.value.trim()) return;

        const text = input.value;
        socket.emit('send_meeting_chat', { text });

        // Render local message
        const msgContainer = document.getElementById('meeting-chat-messages');
        const div = document.createElement('div');
        div.className = 'chat-bubble self';
        div.innerHTML = `
            <span class="chat-sender">YOU</span>
            <span class="chat-text">${text}</span>
            <span class="chat-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        `;
        msgContainer.appendChild(div);
        msgContainer.scrollTop = msgContainer.scrollHeight;

        input.value = '';
    };

    // Handle chat receiver
    socket.on('meeting_chat_message', ({ sender, text }) => {
        const msgContainer = document.getElementById('meeting-chat-messages');
        if (msgContainer) {
            const div = document.createElement('div');
            div.className = 'chat-bubble remote';
            div.innerHTML = `
                <span class="chat-sender">${sender}</span>
                <span class="chat-text">${text}</span>
                <span class="chat-time">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            `;
            msgContainer.appendChild(div);
            msgContainer.scrollTop = msgContainer.scrollHeight;
        }
    });

    // Handle remote meeting termination by host
    socket.on('meeting_ended', () => {
        log('📡 Meeting was ended by Admin host.', 'warn');
        cleanUpCall();
    });

    // Set up WebRTC connection signaling
    const candidateQueue = [];
    socket.on('meeting_signal', async ({ from, signal }) => {
        try {
            if (signal.type === 'offer') {
                log('📥 Received meeting offer from admin host', 'ok');
                await meetingPC.setRemoteDescription(new RTCSessionDescription(signal));
                const answer = await meetingPC.createAnswer();
                await meetingPC.setLocalDescription(answer);
                socket.emit('meeting_signal', { to: from, signal: answer });
                log('📤 Sent meeting answer to admin host', 'warn');

                // Process queued candidates
                while (candidateQueue.length > 0) {
                    const cand = candidateQueue.shift();
                    await meetingPC.addIceCandidate(cand);
                }
            } else if (signal.type === 'answer') {
                log('📥 Received meeting answer from admin host', 'ok');
                await meetingPC.setRemoteDescription(new RTCSessionDescription(signal));

                // Process queued candidates
                while (candidateQueue.length > 0) {
                    const cand = candidateQueue.shift();
                    await meetingPC.addIceCandidate(cand);
                }
            } else if (signal.candidate) {
                const candidate = new RTCIceCandidate(signal.candidate);
                if (meetingPC.remoteDescription && meetingPC.remoteDescription.type) {
                    await meetingPC.addIceCandidate(candidate);
                } else {
                    candidateQueue.push(candidate);
                }
            }
        } catch (err) {
            log('❌ Error in meeting signaling: ' + err.message, 'err');
        }
    });
};

module.exports = { handleViewRequest, handleRtcSignal, handleIntercomSignal, handleMeetingInvitation };
