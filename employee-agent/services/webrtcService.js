const { log } = require('../utils/logger');
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
    
    const inviteDiv = document.createElement('div');
    inviteDiv.id = 'meeting-invite';
    inviteDiv.style = "position: fixed; inset: 0; z-index: 2000; background: rgba(15, 23, 42, 0.9); display: flex; align-items: center; justify-content: center; padding: 24px; backdrop-filter: blur(8px);";
    inviteDiv.innerHTML = `
        <div style="background: #1e293b; padding: 30px; border-radius: 20px; text-align: center; border: 1px solid #3b82f6; width: 100%; max-width: 400px; color: white;">
            <h2 style="font-size: 20px; font-weight: bold; margin-bottom: 10px;">Meeting Invitation</h2>
            <p style="color: #94a3b8; font-size: 14px; margin-bottom: 25px;">${hostName} invited you to "${roomName}"</p>
            <div style="display: flex; gap: 15px;">
                <button id="join-btn" style="flex: 1; padding: 12px; background: #10b981; color: white; border-radius: 10px; font-weight: bold; border: none; cursor: pointer;">JOIN</button>
                <button id="decline-btn" style="flex: 1; padding: 12px; background: #ef4444; color: white; border-radius: 10px; font-weight: bold; border: none; cursor: pointer;">DECLINE</button>
            </div>
        </div>
    `;
    document.body.appendChild(inviteDiv);

    document.getElementById('join-btn').onclick = () => {
        inviteDiv.remove();
        joinMeeting(socket, hostId, roomName);
    };
    document.getElementById('decline-btn').onclick = () => inviteDiv.remove();
};

const joinMeeting = async (socket, hostId, roomName) => {
    log('🤝 Joining meeting...', 'ok');
    socket.emit('join_meeting', { hostId, roomName });

    meetingPC = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach(track => meetingPC.addTrack(track, stream));
    } catch (err) {
        log('❌ Failed to access camera for meeting', 'err');
    }

    meetingPC.onicecandidate = (e) => {
        if (e.candidate) socket.emit('meeting_signal', { to: hostId, signal: { candidate: e.candidate } });
    };

    meetingPC.ontrack = (e) => {
        const meetingWindow = document.createElement('div');
        meetingWindow.id = 'active-meeting';
        meetingWindow.style = "position: fixed; bottom: 20px; right: 20px; width: 300px; aspect-ratio: 16/9; background: black; border-radius: 15px; overflow: hidden; border: 2px solid #3b82f6; z-index: 2100; box-shadow: 0 10px 30px rgba(0,0,0,0.5);";
        meetingWindow.innerHTML = `<video id="host-video" autoplay playsinline style="width: 100%; height: 100%; object-fit: cover;"></video>`;
        document.body.appendChild(meetingWindow);
        document.getElementById('host-video').srcObject = e.streams[0];
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
