import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  PhoneOff, 
  Users, 
  Maximize2,
  MessageSquare
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function MeetingRoom({ socket, onClose }) {
  const [participants, setParticipants] = useState([]);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peers = useRef({}); // participantId -> RTCPeerConnection

  useEffect(() => {
    let activeStream = null;

    const initMeeting = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        localStreamRef.current = stream;
        activeStream = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // Register socket handlers only after stream is successfully acquired
        socket.on('participant_joined', async ({ participantId, name }) => {
          toast.success(`${name} joined the meeting`);
          const pc = createPeerConnection(participantId);
          peers.current[participantId] = pc;
          
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('meeting_signal', { to: participantId, signal: offer });
        });

        socket.on('meeting_signal', async ({ from, signal }) => {
          const pc = peers.current[from] || createPeerConnection(from);
          peers.current[from] = pc;

          if (signal.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('meeting_signal', { to: from, signal: answer });
          } else if (signal.type === 'answer') {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
          } else if (signal.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        });

      } catch (err) {
        console.error('Could not access camera/mic:', err);
        toast.error('Could not access camera/mic. Please check permissions.');
      }
    };

    initMeeting();

    return () => {
      if (activeStream) activeStream.getTracks().forEach(t => t.stop());
      Object.values(peers.current).forEach(pc => pc.close());
      socket.off('participant_joined');
      socket.off('meeting_signal');
    };
  }, []);

  const createPeerConnection = (participantId) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('meeting_signal', { to: participantId, signal: { candidate: e.candidate } });
      }
    };

    pc.ontrack = (e) => {
      setParticipants(prev => {
        const exists = prev.find(p => p.id === participantId);
        if (exists) return prev;
        return [...prev, { id: participantId, stream: e.streams[0] }];
      });
    };

    return pc;
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = !isMicOn;
      setIsMicOn(!isMicOn);
    }
  };

  const toggleCam = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) videoTrack.enabled = !isCamOn;
      setIsCamOn(!isCamOn);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0f172a] flex flex-col">
      {/* Header */}
      <div className="h-16 bg-slate-900/50 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Video size={18} className="text-white" />
          </div>
          <h2 className="text-white font-bold tracking-tight text-lg">Sentinel Meeting Room</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
            <Users size={14} className="text-blue-400" />
            <span className="text-xs font-bold text-white">{participants.length + 1} Online</span>
          </div>
        </div>
      </div>

      {/* Video Grid */}
      <div className="flex-1 p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
        {/* Local Host Video */}
        <div className="relative bg-slate-900 rounded-3xl overflow-hidden border-2 border-blue-600/50 shadow-2xl group">
          <video 
            ref={localVideoRef} 
            autoPlay 
            muted 
            playsInline 
            className={`w-full h-full object-cover ${!isCamOn ? 'hidden' : ''}`}
          />
          {!isCamOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
              <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold text-white shadow-2xl">A</div>
            </div>
          )}
          <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/50 backdrop-blur-md rounded-lg border border-white/10 text-[10px] font-bold text-white flex items-center gap-2">
            YOU (HOST) {!isMicOn && <MicOff size={10} className="text-red-500" />}
          </div>
        </div>

        {/* Participant Videos */}
        {participants.map(p => (
          <ParticipantVideo key={p.id} participant={p} />
        ))}
      </div>

      {/* Controls */}
      <div className="h-24 bg-slate-900 border-t border-slate-800 flex items-center justify-center gap-6">
        <button 
          onClick={toggleMic}
          className={`p-4 rounded-2xl transition-all active:scale-90 ${isMicOn ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-red-500 text-white shadow-lg shadow-red-500/20'}`}
        >
          {isMicOn ? <Mic size={24} /> : <MicOff size={24} />}
        </button>

        <button 
          onClick={toggleCam}
          className={`p-4 rounded-2xl transition-all active:scale-90 ${isCamOn ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-red-500 text-white shadow-lg shadow-red-500/20'}`}
        >
          {isCamOn ? <Video size={24} /> : <VideoOff size={24} />}
        </button>

        <div className="w-px h-10 bg-slate-800 mx-2" />

        <button 
          onClick={onClose}
          className="p-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl shadow-lg shadow-red-600/20 transition-all active:scale-90"
        >
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
}

function ParticipantVideo({ participant }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = participant.stream;
  }, [participant.stream]);

  return (
    <div className="relative bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 group hover:border-blue-500/50 transition-all">
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/50 backdrop-blur-md rounded-lg border border-white/10 text-[10px] font-bold text-white uppercase tracking-wider">
        Employee Participant
      </div>
    </div>
  );
}
