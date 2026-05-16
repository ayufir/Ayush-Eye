import React, { useEffect, useRef, useState, useCallback } from 'react';
import useStore from '../store';
import { Maximize2, Mic, MousePointer2, Monitor, Wifi, WifiOff, Smartphone } from 'lucide-react';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ─── Individual Screen Card ───────────────────────────────────────────────────
const ScreenCard = ({ employee, socket }) => {
    const { setSelectedEmployee } = useStore();
    const videoRef = useRef(null);
    const pcRef = useRef(null);
    const [status, setStatus] = useState('waiting'); // waiting | connecting | live | failed

    const startViewing = useCallback(async () => {
        if (!socket || !employee.socketId) return;
        
        setStatus('connecting');
        console.log('📺 Starting view for:', employee.name);

        // Create peer connection
        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        // When we receive a track (video stream from employee)
        pc.ontrack = (event) => {
            console.log('🎥 Received track from employee!');
            if (videoRef.current && event.streams[0]) {
                videoRef.current.srcObject = event.streams[0];
                setStatus('live');
            }
        };

        // Send ICE candidates to employee
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('rtc_signal', {
                    to: employee.socketId,
                    signal: { type: 'candidate', candidate: event.candidate }
                });
            }
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log('Connection state:', state);
            if (state === 'connected') setStatus('live');
            if (state === 'failed' || state === 'disconnected') setStatus('failed');
        };

        // Listen for signals FROM the employee
        const handleSignal = async ({ from, signal }) => {
            if (from !== employee.socketId) return;

            if (signal.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: signal.sdp }));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                socket.emit('rtc_signal', {
                    to: employee.socketId,
                    signal: { type: 'answer', sdp: answer.sdp }
                });
            } else if (signal.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: signal.sdp }));
            } else if (signal.type === 'candidate') {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
                } catch (e) {
                    console.error('ICE error:', e);
                }
            }
        };

        socket.on('rtc_signal', handleSignal);

        // Request employee to start streaming
        socket.emit('request_view', { employeeSocketId: employee.socketId });

        return () => {
            socket.off('rtc_signal', handleSignal);
            if (pcRef.current) pcRef.current.close();
        };
    }, [employee.socketId, socket]);

    useEffect(() => {
        if (employee.status === 'online') {
            const cleanup = startViewing();
            return () => { cleanup?.then(fn => fn && fn()); };
        }
        return () => {
            if (pcRef.current) pcRef.current.close();
        };
    }, [employee.socketId, employee.status]);

    const statusConfig = {
        waiting: { color: 'text-slate-500', label: 'Waiting...', dot: 'bg-slate-500' },
        connecting: { color: 'text-amber-400', label: 'Connecting...', dot: 'bg-amber-400 animate-pulse' },
        live: { color: 'text-emerald-400', label: 'LIVE', dot: 'bg-emerald-400' },
        failed: { color: 'text-red-400', label: 'Failed', dot: 'bg-red-500' }
    };

    const cfg = statusConfig[status];

    return (
        <div className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden group hover:border-blue-500/50 transition-all duration-300 shadow-lg">
            {/* Video Area */}
            <div className="aspect-video bg-slate-900 relative">
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-contain"
                />

                {/* Status Overlay */}
                {status !== 'live' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 gap-3">
                        <Monitor size={40} className="text-slate-700" />
                        <div className={`text-sm font-semibold ${cfg.color} flex items-center gap-2`}>
                            <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                        </div>
                        {status === 'failed' && (
                            <button
                                onClick={startViewing}
                                className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors"
                            >
                                Retry
                            </button>
                        )}
                    </div>
                )}

                {/* LIVE Badge */}
                {status === 'live' && (
                    <div className="absolute top-3 left-3 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        LIVE
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 flex justify-between items-center">
                <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${employee.status === 'online' ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                    <div className="min-w-0">
                        <p className="font-semibold text-sm text-slate-100 truncate">{employee.name}</p>
                        <p className="text-xs text-slate-500 truncate">{employee.pcName}</p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button title="Voice" className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-blue-400 transition-colors">
                        <Mic size={14} />
                    </button>
                    <button title="Remote Control" className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-amber-400 transition-colors">
                        <MousePointer2 size={14} />
                    </button>
                    <button
                        title="Full Screen"
                        onClick={() => setSelectedEmployee(employee)}
                        className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-emerald-400 transition-colors"
                    >
                        <Maximize2 size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Live Wall ────────────────────────────────────────────────────────────────
const LiveWall = ({ socket }) => {
    const { employees } = useStore();
    const onlineEmployees = employees.filter(e => e.status === 'online');

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm text-slate-400">
                        <span className="text-emerald-400 font-bold">{onlineEmployees.length}</span> employee{onlineEmployees.length !== 1 ? 's' : ''} online
                    </span>
                </div>
            </div>

            {/* Grid */}
            {onlineEmployees.length === 0 ? (
                <div className="h-96 flex flex-col items-center justify-center text-slate-600 gap-4 border-2 border-dashed border-slate-700 rounded-2xl">
                    <WifiOff size={48} />
                    <div className="text-center">
                        <p className="text-lg font-semibold text-slate-500">No Employees Online</p>
                        <p className="text-sm text-slate-600 mt-1">Start the Employee Agent to see live screens</p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {onlineEmployees.map(emp => (
                        <ScreenCard key={emp.socketId} employee={emp} socket={socket} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default LiveWall;
