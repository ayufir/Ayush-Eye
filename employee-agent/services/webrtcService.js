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

    meetingPC.ontrack = (e) => {
        log('🔊 Received remote media track from Admin Host', 'ok');

        let meetingWindow = document.getElementById('active-meeting');
        if (meetingWindow) {
            // Already created, just bind the stream if not already bound
            const hostVideo = document.getElementById('host-video');
            if (hostVideo && e.streams[0] && hostVideo.srcObject !== e.streams[0]) {
                hostVideo.srcObject = e.streams[0];
                log('📺 Bound remote stream to existing video element', 'ok');
            }
            return;
        }

        meetingWindow = document.createElement('div');
        meetingWindow.id = 'active-meeting';
        meetingWindow.style = "position: fixed; inset: 0; background: #0f172a; display: flex; z-index: 2100; color: white; font-family: sans-serif; overflow: hidden;";
        meetingWindow.innerHTML = `
            <!-- Left Section: Video Display -->
            <div style="flex: 1; display: flex; flex-direction: column; position: relative; padding: 20px;">
                <!-- Header bar with leave button -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <span style="font-weight: bold; font-size: 16px; letter-spacing: 0.5px;">🛡️ Sentinel Team Meeting</span>
                    <button id="leave-meeting-btn" style="padding: 8px 18px; background: #ef4444; color: white; border-radius: 8px; font-weight: bold; border: none; cursor: pointer; transition: background 0.2s; font-size: 12px;">Leave Meeting</button>
                </div>
                <!-- Video frame -->
                <div style="flex: 1; background: #000; border-radius: 16px; overflow: hidden; border: 2px solid #3b82f6; display: flex; align-items: center; justify-content: center; position: relative;">
                    <video id="host-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>
                    <span style="position: absolute; bottom: 15px; left: 15px; background: rgba(0,0,0,0.6); padding: 5px 12px; border-radius: 6px; font-size: 11px;">Admin Host</span>
                </div>
            </div>

            <!-- Right Section: Real-time Chat Panel -->
            <div style="width: 320px; background: #1e293b; border-left: 1px solid #334155; display: flex; flex-direction: column; padding: 20px;">
                <h3 style="margin: 0 0 15px; font-size: 14px; border-bottom: 1px solid #334155; padding-bottom: 10px; display: flex; align-items: center; gap: 8px;">💬 Live Meeting Chat</h3>
                <!-- Message area -->
                <div id="meeting-chat-messages" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; margin-bottom: 15px; padding-right: 5px;">
                    <div style="font-size: 11px; color: #64748b; text-align: center; margin: 10px 0;">Welcome to Sentinel Meeting room chat!</div>
                </div>
                <!-- Input form -->
                <form id="meeting-chat-form" style="display: flex; gap: 8px; margin: 0;">
                    <input id="meeting-chat-input" placeholder="Type message..." autocomplete="off" style="flex: 1; padding: 10px; background: #0f172a; border: 1px solid #475569; color: white; border-radius: 8px; font-size: 12px; outline: none;" />
                    <button type="submit" style="padding: 10px 14px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 12px;">Send</button>
                </form>
            </div>
        `;
        document.body.appendChild(meetingWindow);
        
        const hostVideo = document.getElementById('host-video');
        if (hostVideo && e.streams[0]) {
            hostVideo.srcObject = e.streams[0];
            log('📺 Bound remote stream to video element', 'ok');
        }

        // Handle chat submit
        document.getElementById('meeting-chat-form').onsubmit = (event) => {
            event.preventDefault();
            const input = document.getElementById('meeting-chat-input');
            if (!input || !input.value.trim()) return;

            const text = input.value;
            socket.emit('send_meeting_chat', { text });

            // Render local message
            const msgContainer = document.getElementById('meeting-chat-messages');
            const div = document.createElement('div');
            div.style = "background: #3b82f6; padding: 8px 12px; border-radius: 12px; max-width: 90%; align-self: flex-end; color: white; margin-bottom: 4px; font-family: sans-serif;";
            div.innerHTML = `<span style="font-weight: bold; color: #e2e8f0; font-size: 10px; display: block; margin-bottom: 2px;">YOU</span><span style="font-size: 12px;">${text}</span>`;
            msgContainer.appendChild(div);
            msgContainer.scrollTop = msgContainer.scrollHeight;

            input.value = '';
        };

        // Handle leave button
        document.getElementById('leave-meeting-btn').onclick = () => {
            meetingWindow.remove();
            socket.off('meeting_chat_message');
            socket.off('meeting_ended');
            socket.off('meeting_signal');
            if (meetingPC) {
                meetingPC.close();
                meetingPC = null;
            }
            ipcRenderer.send('hide-meeting-window');
        };

        // Handle chat receiver
        socket.on('meeting_chat_message', ({ sender, text }) => {
            const msgContainer = document.getElementById('meeting-chat-messages');
            if (msgContainer) {
                const div = document.createElement('div');
                div.style = "background: #0f172a; padding: 8px 12px; border-radius: 12px; border: 1px solid #1e293b; max-width: 90%; color: white; margin-bottom: 4px; font-family: sans-serif;";
                div.innerHTML = `<span style="font-weight: bold; color: #60a5fa; font-size: 10px; display: block; margin-bottom: 2px;">${sender}</span><span style="font-size: 12px;">${text}</span>`;
                msgContainer.appendChild(div);
                msgContainer.scrollTop = msgContainer.scrollHeight;
            }
        });

        // Handle remote meeting termination by host
        socket.on('meeting_ended', () => {
            log('📡 Meeting was ended by Admin host.', 'warn');
            meetingWindow.remove();
            socket.off('meeting_chat_message');
            socket.off('meeting_ended');
            socket.off('meeting_signal');
            if (meetingPC) {
                meetingPC.close();
                meetingPC = null;
            }
            ipcRenderer.send('hide-meeting-window');
        });
    };

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
