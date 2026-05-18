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
  MessageSquare,
  Send
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getUser } from '../utils/auth';

export default function MeetingRoom({ socket, employees = [], onClose }) {
  const [participants, setParticipants] = useState([]);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  
  // Tabbed Sidebar State
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarTab, setSidebarTab] = useState('invite'); // 'invite' | 'chat'
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

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

        // Listen for collaborative meeting chat messages
        socket.on('meeting_chat_message', ({ sender, text }) => {
          setMessages(prev => [
            ...prev, 
            { 
              sender, 
              text, 
              time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
            }
          ]);
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
      socket.off('meeting_chat_message');
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

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    socket.emit('send_meeting_chat', { text: chatInput });
    setMessages(prev => [
      ...prev, 
      { 
        sender: 'YOU (Admin)', 
        text: chatInput, 
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
      }
    ]);
    setChatInput('');
  };

  const handleLeaveMeeting = () => {
    // Notify all participants (employees) to disconnect and hide popup
    socket.emit('end_meeting');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#0f172a] flex flex-col font-sans">
      {/* Header */}
      <div className="h-16 bg-slate-900/50 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Video size={18} className="text-white" />
          </div>
          <h2 className="text-white font-bold tracking-tight text-lg">Sentinel Meeting Room</h2>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowSidebar(!showSidebar)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-lg transition-all active:scale-95 ${showSidebar ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/20' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}
          >
            <MessageSquare size={14} /> {showSidebar ? 'Hide Panel' : 'Show Panel'}
          </button>
          <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
            <Users size={14} className="text-blue-400" />
            <span className="text-xs font-bold text-white">{participants.length + 1} Online</span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Grid */}
        <div className="flex-1 p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 auto-rows-fr">
          {/* Local Host Video */}
          <div className="relative bg-slate-900 rounded-3xl overflow-hidden border-2 border-blue-600/50 shadow-2xl group min-h-[300px]">
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

        {/* Right Sidebar: Tabbed Invite & Live Chat */}
        {showSidebar && (
          <div className="w-80 bg-slate-900/90 backdrop-blur-md border-l border-slate-800 flex flex-col shadow-2xl transition-all h-full">
            {/* Sidebar Tabs Header */}
            <div className="flex border-b border-slate-800">
              <button 
                onClick={() => setSidebarTab('invite')}
                className={`flex-1 py-4 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-all ${sidebarTab === 'invite' ? 'border-blue-500 text-blue-400 bg-slate-800/30' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                <Users size={16} /> Invite
              </button>
              <button 
                onClick={() => setSidebarTab('chat')}
                className={`flex-1 py-4 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition-all ${sidebarTab === 'chat' ? 'border-blue-500 text-blue-400 bg-slate-800/30' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                <MessageSquare size={16} /> Live Chat
              </button>
            </div>

            {/* Sidebar Body */}
            <div className="flex-1 overflow-hidden flex flex-col p-4">
              {sidebarTab === 'invite' ? (
                // Invite List
                <div className="flex-1 flex flex-col overflow-hidden">
                  <h3 className="text-white font-bold text-xs mb-3 flex items-center gap-2">
                    <Users size={14} className="text-blue-400" />
                    Invite Online Team
                  </h3>
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                    {employees.filter(emp => emp.status === 'online').length === 0 ? (
                      <p className="text-slate-500 text-xs text-center py-12">No team members online currently</p>
                    ) : (
                      employees
                        .filter(emp => emp.status === 'online')
                        .map(emp => (
                          <div key={emp.id} className="flex items-center justify-between bg-slate-950/40 border border-slate-805 p-3 rounded-2xl hover:border-slate-700/80 transition-colors">
                            <div className="flex-1 min-w-0 pr-2">
                              <p className="text-white text-xs font-bold truncate">{emp.name}</p>
                              <p className="text-[10px] text-slate-500 truncate">{emp.pcName || 'Unknown Device'}</p>
                            </div>
                            <button 
                              onClick={() => {
                                socket.emit('invite_employee_to_meeting', { employeeSocketId: emp.socketId, roomName: `${getUser()?.name || 'Admin'}'s Team Meeting` });
                                toast.success(`Invitation sent to ${emp.name}!`);
                              }}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-bold active:scale-95 shadow-md shadow-emerald-600/20 transition-all flex-shrink-0"
                            >
                              Invite
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              ) : (
                // Chat Box
                <div className="flex-1 flex flex-col overflow-hidden">
                  <h3 className="text-white font-bold text-xs mb-3 flex items-center gap-2">
                    <MessageSquare size={14} className="text-blue-400" />
                    Live Meeting Chat
                  </h3>
                  
                  {/* Messages list */}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3 flex flex-col">
                    {messages.length === 0 ? (
                      <p className="text-slate-500 text-xs text-center py-12 my-auto">Start typing to chat with participants!</p>
                    ) : (
                      messages.map((msg, i) => (
                        <div 
                          key={i} 
                          className={`max-w-[85%] rounded-2xl p-3 text-xs flex flex-col gap-1 ${msg.sender.includes('YOU') ? 'bg-blue-600 text-white align-self-end ml-auto' : 'bg-slate-800 text-slate-200 mr-auto'}`}
                        >
                          <span className="font-bold text-[9px] text-slate-300">{msg.sender}</span>
                          <span className="break-words">{msg.text}</span>
                          <span className="text-[8px] text-slate-400 text-right">{msg.time}</span>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Send Input Form */}
                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <input 
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type message..."
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 transition-all"
                    />
                    <button 
                      type="submit"
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs active:scale-95 transition-all flex items-center justify-center"
                    >
                      <Send size={14} />
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
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
          onClick={handleLeaveMeeting}
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
    <div className="relative bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 group hover:border-blue-500/50 transition-all min-h-[300px]">
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
