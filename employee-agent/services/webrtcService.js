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
        socket.emit('intercom_signal', { to: from, signal: answer });

    } else if (signal.type === 'answer' && intercomPc) {
        await intercomPc.setRemoteDescription(new RTCSessionDescription(signal));
    } else if (signal.candidate && intercomPc) {
        await intercomPc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
};

const handleMeetingInvitation = (socket, { roomName, hostId, hostName }) => {
    log(`📞 Incoming Meeting: ${roomName} from ${hostName}`, 'warn');
    
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

    meetingPC = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(track => meetingPC.addTrack(track, stream));
        log('✅ Camera & Microphone successfully attached to call!', 'ok');
    } catch (err) {
        log('❌ Failed to access camera/mic for meeting: ' + err.message, 'err');
    }

    log('🤝 Emitting join_meeting to host...', 'ok');
    socket.emit('join_meeting', { hostId, roomName });

    meetingPC.onicecandidate = (e) => {
        if (e.candidate) socket.emit('meeting_signal', { to: hostId, signal: { candidate: e.candidate } });
    };

    meetingPC.ontrack = (e) => {
        const meetingWindow = document.createElement('div');
        meetingWindow.id = 'active-meeting';
        meetingWindow.style = "position: fixed; inset: 0; background: #0f172a; display: flex; flex-direction: column; justify-content: center; align-items: center; z-index: 2100; color: white; padding: 20px;";
        meetingWindow.innerHTML = `
            <div style="position: absolute; top: 20px; right: 20px;">
                <button id="leave-meeting-btn" style="padding: 10px 20px; background: #ef4444; color: white; border-radius: 8px; font-weight: bold; border: none; cursor: pointer; transition: background 0.2s;">Leave Meeting</button>
            </div>
            <video id="host-video" autoplay playsinline style="width: 90%; height: 85%; object-fit: contain; border-radius: 12px; border: 2px solid #3b82f6; background: #000;"></video>
        `;
        document.body.appendChild(meetingWindow);
        document.getElementById('host-video').srcObject = e.streams[0];

        document.getElementById('leave-meeting-btn').onclick = () => {
            meetingWindow.remove();
            if (meetingPC) {
                meetingPC.close();
                meetingPC = null;
            }
            // Hide the window back to hidden state!
            ipcRenderer.send('hide-meeting-window');
        };
    };

    socket.on('meeting_signal', async ({ from, signal }) => {
        if (signal.type === 'offer') {
            await meetingPC.setRemoteDescription(new RTCSessionDescription(signal));
            const answer = await meetingPC.createAnswer();
            await meetingPC.setLocalDescription(answer);
            socket.emit('meeting_signal', { to: from, signal: answer });
        } else if (signal.type === 'answer') {
            await meetingPC.setRemoteDescription(new RTCSessionDescription(signal));
        } else if (signal.candidate) {
            await meetingPC.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    });
};

module.exports = { handleViewRequest, handleRtcSignal, handleIntercomSignal, handleMeetingInvitation };
