import React, { useEffect, useRef, useState } from 'react';
import { X, MousePointer, Keyboard, Camera, Download, Maximize, Minimize, Mic, MicOff } from 'lucide-react';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

const RemoteControl = ({ employee, socket, onClose }) => {
    const videoRef = useRef(null);
    const pcRef = useRef(null);
    const [videoStatus, setVideoStatus] = useState('connecting'); // connecting | live | failed
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // Voice Intercom State
    const [isIntercomActive, setIsIntercomActive] = useState(false);
    const intercomPcRef = useRef(null);
    const intercomAudioRef = useRef(new Audio());
    const [intercomStatus, setIntercomStatus] = useState('idle'); // idle | connecting | active
    
    // Remote Control State
    const [isMouseActive, setIsMouseActive] = useState(false);
    const [isKeyboardActive, setIsKeyboardActive] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!isKeyboardActive || !employee?.socketId) return;
            
            // Prevent default behavior for some keys (like Tab, Alt) to avoid leaving the app
            if (['Tab', 'Alt', 'Meta'].includes(e.key)) {
                e.preventDefault();
            }

            socket.emit('remote_control', {
                to: employee.socketId,
                action: 'key_press',
                data: { 
                    key: e.key,
                    keyCode: e.keyCode,
                    shift: e.shiftKey,
                    ctrl: e.ctrlKey,
                    alt: e.altKey
                }
            });
        };

        if (isKeyboardActive) {
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isKeyboardActive, employee?.socketId]);

    useEffect(() => {
        if (!socket || !employee?.socketId) return;

        console.log('🎬 RemoteControl: Starting session for', employee.name);
        let pc = null;

        const startSession = async () => {
            // Create peer connection
            pc = new RTCPeerConnection(ICE_SERVERS);
            pcRef.current = pc;

            // This is the KEY event - fires when employee sends us their screen track
            pc.ontrack = (event) => {
                console.log('🎥 GOT TRACK!', event.track.kind, event.streams.length);
                if (videoRef.current && event.streams[0]) {
                    videoRef.current.srcObject = event.streams[0];
                    videoRef.current.play().catch(e => console.error('Play error:', e));
                    setVideoStatus('live');
                    console.log('✅ Video stream attached!');
                }
            };

            // Send ICE candidates to employee
            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    socket.emit('rtc_signal', {
                        to: employee.socketId,
                        signal: { type: 'candidate', candidate: e.candidate }
                    });
                }
            };

            pc.onconnectionstatechange = () => {
                console.log('Connection state:', pc.connectionState);
                if (pc.connectionState === 'failed') {
                    setVideoStatus('failed');
                }
            };

            // Handle signals from employee (offer/answer/candidate)
            const handleSignal = async ({ from, signal }) => {
                if (from !== employee.socketId) return;
                console.log('📡 Signal from employee:', signal.type);

                try {
                    if (signal.type === 'offer') {
                        await pc.setRemoteDescription(
                            new RTCSessionDescription({ type: 'offer', sdp: signal.sdp })
                        );
                        const answer = await pc.createAnswer();
                        await pc.setLocalDescription(answer);
                        socket.emit('rtc_signal', {
                            to: employee.socketId,
                            signal: { type: 'answer', sdp: answer.sdp }
                        });
                        console.log('📤 Answer sent to employee');

                    } else if (signal.type === 'answer') {
                        await pc.setRemoteDescription(
                            new RTCSessionDescription({ type: 'answer', sdp: signal.sdp })
                        );

                    } else if (signal.type === 'candidate' && signal.candidate) {
                        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                    }
                } catch (err) {
                    console.error('Signal error:', err);
                }
            };

            socket.on('rtc_signal', handleSignal);

            socket.on('screenshot_result', ({ base64 }) => {
                const link = document.createElement('a');
                link.href = `data:image/png;base64,${base64}`;
                link.download = `Screenshot_${employee.name}_${new Date().getTime()}.png`;
                link.click();
                toast.success('Screenshot downloaded!');
            });

            // Ask employee to start streaming to us
            console.log('📺 Requesting view from employee:', employee.socketId);
            socket.emit('request_view', { employeeSocketId: employee.socketId });

            return () => {
                socket.off('rtc_signal', handleSignal);
            };
        };

        let cleanup;
        startSession().then(fn => { cleanup = fn; });

        return () => {
            if (cleanup) cleanup();
            if (pcRef.current) {
                pcRef.current.close();
                pcRef.current = null;
            }
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
            if (intercomPcRef.current) {
                intercomPcRef.current.close();
            }
            if (intercomAudioRef.current) {
                intercomAudioRef.current.srcObject = null;
            }
        };
    }, [employee?.socketId]);

    // ─── Voice Intercom Logic ────────────────────────────────────────────────
    const toggleIntercom = async () => {
        if (isIntercomActive) {
            // Stop intercom
            if (intercomPcRef.current) {
                intercomPcRef.current.close();
                intercomPcRef.current = null;
            }
            setIsIntercomActive(false);
            setIntercomStatus('idle');
            return;
        }

        setIsIntercomActive(true);
        setIntercomStatus('connecting');

        try {
            const pc = new RTCPeerConnection(ICE_SERVERS);
            intercomPcRef.current = pc;

            // Get local mic
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => pc.addTrack(track, stream));

            // Handle incoming employee mic
            pc.ontrack = (e) => {
                console.log('🎙️ Received employee mic track');
                intercomAudioRef.current.srcObject = e.streams[0];
                intercomAudioRef.current.autoplay = true;
                intercomAudioRef.current.play().catch(err => console.error('Audio play error:', err));
            };

            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    socket.emit('intercom_signal', {
                        to: employee.socketId,
                        signal: { type: 'candidate', candidate: e.candidate }
                    });
                }
            };

            pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'connected') setIntercomStatus('active');
                if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                    setIntercomStatus('idle');
                    setIsIntercomActive(false);
                }
            };

            // Listen for signals
            const handleIntercomSignal = async ({ from, signal }) => {
                if (from !== employee.socketId) return;
                
                if (signal.type === 'answer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(signal));
                } else if (signal.type === 'candidate' && signal.candidate) {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                }
            };
            
            socket.on('intercom_signal', handleIntercomSignal);

            // Create offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('intercom_signal', {
                to: employee.socketId,
                signal: { type: 'offer', sdp: offer.sdp }
            });

            // Clean up listener when unmounting or stopping
            return () => {
                socket.off('intercom_signal', handleIntercomSignal);
            };

        } catch (err) {
            console.error('Intercom error:', err);
            setIsIntercomActive(false);
            setIntercomStatus('idle');
            alert('Could not access microphone: ' + err.message);
        }
    };

    // ─── Remote Control Handlers ──────────────────────────────────────────────
    const handleScreenAction = (e, type) => {
        if (!isMouseActive || !videoRef.current) return;

        const rect = videoRef.current.getBoundingClientRect();
        
        // Calculate click position relative to video dimensions (0 to 1 scale)
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;

        socket.emit('remote_control', {
            to: employee.socketId,
            action: type,
            data: { x, y, button: e.button === 2 ? 'right' : 'left' }
        });
    };

    return (
        <div className={`fixed inset-0 z-50 bg-black flex flex-col ${isFullscreen ? '' : ''}`}>
            {/* ─── Toolbar ─────────────────────────────────────────────────── */}
            <div className="h-12 bg-slate-900 border-b border-slate-700 flex items-center justify-between px-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                        videoStatus === 'live' ? 'bg-emerald-500' :
                        videoStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'
                    }`} />
                    <span className="text-sm font-semibold text-white">
                        {videoStatus === 'live' ? '🔴 LIVE: ' : '⏳ Connecting: '}
                        {employee?.name || employee?.pcName}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <button 
                        title="Voice Intercom" 
                        onClick={toggleIntercom}
                        className={`p-1.5 rounded flex items-center gap-1 text-xs font-medium transition-colors ${
                            isIntercomActive 
                                ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' 
                                : 'hover:bg-slate-700 text-slate-400 hover:text-emerald-400'
                        }`}
                    >
                        {isIntercomActive ? <Mic size={15} /> : <MicOff size={15} />}
                        {intercomStatus === 'connecting' ? 'Connecting...' : (isIntercomActive ? 'Voice Active' : 'Intercom')}
                    </button>
                    <div className="w-px h-5 bg-slate-700 mx-1" />
                    <button 
                        title="Remote Mouse Control" 
                        onClick={() => setIsMouseActive(!isMouseActive)}
                        className={`p-1.5 rounded transition-colors ${
                            isMouseActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-400 hover:text-blue-400'
                        }`}
                    >
                        <MousePointer size={15} />
                    </button>
                    <button 
                        title="Remote Keyboard" 
                        onClick={() => setIsKeyboardActive(!isKeyboardActive)}
                        className={`p-1.5 rounded transition-colors ${
                            isKeyboardActive ? 'bg-blue-600 text-white' : 'hover:bg-slate-700 text-slate-400 hover:text-blue-400'
                        }`}
                    >
                        <Keyboard size={15} />
                    </button>
                    <button 
                        title="Screenshot" 
                        onClick={() => {
                            toast.success('Requesting screenshot...');
                            socket.emit('remote_control', { to: employee.socketId, action: 'screenshot' });
                        }}
                        className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-amber-400"
                    >
                        <Camera size={15} />
                    </button>
                    <div className="w-px h-5 bg-slate-700 mx-1" />
                    <button
                        title="Disconnect"
                        onClick={onClose}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-lg text-xs font-medium transition-all"
                    >
                        <X size={14} />
                        Disconnect
                    </button>
                </div>
            </div>

            {/* ─── Video Area ───────────────────────────────────────────────── */}
            <div className="flex-1 bg-black flex items-center justify-center relative overflow-hidden">
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className={`max-w-full max-h-full object-contain ${isMouseActive ? 'cursor-crosshair' : ''}`}
                    style={{ display: videoStatus === 'live' ? 'block' : 'none' }}
                    onClick={(e) => handleScreenAction(e, 'click')}
                    onDoubleClick={(e) => handleScreenAction(e, 'double_click')}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        handleScreenAction(e, 'right_click');
                    }}
                />

                {videoStatus !== 'live' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-500">
                        <div className="w-16 h-16 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <div className="text-center">
                            <p className="text-lg font-semibold text-slate-300">
                                {videoStatus === 'connecting' ? 'Establishing Stream...' : 'Connection Failed'}
                            </p>
                            <p className="text-sm text-slate-600 mt-1">
                                {videoStatus === 'connecting'
                                    ? 'Waiting for screen capture from ' + employee?.name
                                    : 'Could not connect to the employee PC'}
                            </p>
                        </div>
                        {videoStatus === 'failed' && (
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm"
                            >
                                Retry
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RemoteControl;
