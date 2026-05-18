import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  PhoneOff, 
  Users, 
  MessageSquare, 
  Send,
  Info,
  Monitor,
  Hand,
  MoreVertical,
  X
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getUser } from '../utils/auth';

export default function MeetingRoom({ socket, employees = [], onClose }) {
  const [participants, setParticipants] = useState([]);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  
  // Real-time Clock
  const [currentTime, setCurrentTime] = useState('');

  // Tabbed Sidebar State (Google Meet style)
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('invite'); // 'invite' | 'chat'
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peers = useRef({}); // participantId -> RTCPeerConnection

  // Clock Effect
  useEffect(() => {
    const updateTime = () => {
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setCurrentTime(timeStr);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000 * 30);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let activeStream = null;

    const initMeeting = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
        localStreamRef.current = stream;
        activeStream = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const candidateQueues = {};

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

          if (!candidateQueues[from]) {
            candidateQueues[from] = [];
          }

          try {
            if (signal.type === 'offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(signal));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              socket.emit('meeting_signal', { to: from, signal: answer });

              // Flush queued candidates
              while (candidateQueues[from].length > 0) {
                const cand = candidateQueues[from].shift();
                await pc.addIceCandidate(cand);
              }
            } else if (signal.type === 'answer') {
              await pc.setRemoteDescription(new RTCSessionDescription(signal));

              // Flush queued candidates
              while (candidateQueues[from].length > 0) {
                const cand = candidateQueues[from].shift();
                await pc.addIceCandidate(cand);
              }
            } else if (signal.candidate) {
              const candidate = new RTCIceCandidate(signal.candidate);
              if (pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(candidate);
              } else {
                candidateQueues[from].push(candidate);
              }
            }
          } catch (err) {
            console.error('Error handling meeting signal on Admin:', err);
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
          if (!showSidebar || sidebarTab !== 'chat') {
            toast(`💬 New message from ${sender}`, { icon: '💬' });
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

  const toggleScreenShare = () => {
    setIsScreenSharing(!isScreenSharing);
    toast.success(isScreenSharing ? 'Stopped screen sharing' : 'Started screen sharing');
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
    socket.emit('end_meeting');
    onClose();
  };

  const handleToggleSidebar = (tabName) => {
    if (showSidebar && sidebarTab === tabName) {
      setShowSidebar(false);
    } else {
      setSidebarTab(tabName);
      setShowSidebar(true);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-[#202124] flex flex-col font-sans select-none overflow-hidden">
      {/* Main Workspace (Video area + Sidebar) */}
      <div className="flex-1 flex overflow-hidden relative p-4 gap-4">
        {/* Videos Area */}
        <div className="flex-1 flex items-center justify-center relative">
          <div className="w-full h-full max-w-6xl max-h-[85vh] grid grid-cols-1 md:grid-cols-2 gap-4 items-center justify-center">
            
            {/* Local Video Card */}
            <div className="relative aspect-video w-full bg-[#3c4043] rounded-2xl overflow-hidden border border-slate-700/50 shadow-xl flex items-center justify-center">
              <video 
                ref={localVideoRef} 
                autoPlay 
                muted 
                playsInline 
                className={`w-full h-full object-cover rounded-2xl ${!isCamOn ? 'hidden' : ''}`}
              />
              {!isCamOn && (
                <div className="w-20 h-20 rounded-full bg-[#1a73e8] flex items-center justify-center text-3xl font-semibold text-white uppercase">
                  A
                </div>
              )}
              {/* Bottom label */}
              <div className="absolute bottom-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md rounded-lg text-xs font-medium text-white flex items-center gap-2">
                YOU (HOST) 
                {!isMicOn && <MicOff size={12} className="text-red-500" />}
              </div>
            </div>

            {/* Remote Participant Videos */}
            {participants.map(p => (
              <ParticipantVideo key={p.id} participant={p} />
            ))}

            {/* Mock Participant for Visual completeness if only admin is present */}
            {participants.length === 0 && (
              <div className="relative aspect-video w-full bg-[#3c4043] rounded-2xl overflow-hidden border border-slate-700/50 shadow-xl flex flex-col items-center justify-center">
                <div className="text-slate-400 text-sm font-semibold mb-2">Waiting for Employees to join...</div>
                <div className="text-slate-500 text-xs px-6 text-center">Use the Invite sidebar tab below to ring online team members.</div>
              </div>
            )}

          </div>

          {/* Floating Raised Hand Indicator */}
          {isHandRaised && (
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute top-6 left-6 p-4 bg-[#f89b1c] text-white rounded-2xl shadow-xl flex items-center gap-2 font-bold text-xs"
            >
              <Hand size={18} className="animate-bounce" /> Hand Raised
            </motion.div>
          )}
        </div>

        {/* Google Meet Right Sidebar Panel */}
        <AnimatePresence>
          {showSidebar && (
            <motion.div 
              initial={{ x: 350, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 350, opacity: 0 }}
              className="w-80 bg-white rounded-2xl flex flex-col shadow-2xl overflow-hidden border border-slate-200 h-full z-50"
            >
              {/* Sidebar Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-slate-800 font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                  {sidebarTab === 'invite' ? <Users size={16} className="text-blue-600" /> : <MessageSquare size={16} className="text-blue-600" />}
                  {sidebarTab === 'invite' ? 'People' : 'In-call Messages'}
                </h3>
                <button 
                  onClick={() => setShowSidebar(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Sidebar Tabs Selectors */}
              <div className="flex border-b border-slate-100">
                <button 
                  onClick={() => setSidebarTab('invite')}
                  className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-all ${sidebarTab === 'invite' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  Invite List
                </button>
                <button 
                  onClick={() => setSidebarTab('chat')}
                  className={`flex-1 py-3 text-xs font-bold text-center border-b-2 transition-all ${sidebarTab === 'chat' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  Chat ({messages.length})
                </button>
              </div>

              {/* Sidebar Content Body */}
              <div className="flex-1 overflow-hidden flex flex-col p-4 bg-slate-50/50">
                {sidebarTab === 'invite' ? (
                  // Invite List
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                      {employees.filter(emp => emp.status === 'online').length === 0 ? (
                        <p className="text-slate-400 text-xs text-center py-16">No employee devices online</p>
                      ) : (
                        employees
                          .filter(emp => emp.status === 'online')
                          .map(emp => (
                            <div key={emp.id} className="flex items-center justify-between bg-white border border-slate-100 p-3 rounded-2xl hover:shadow-sm transition-all">
                              <div className="flex-1 min-w-0 pr-2">
                                <p className="text-slate-800 text-xs font-bold truncate">{emp.name}</p>
                                <p className="text-[10px] text-slate-400 truncate">{emp.pcName || 'Unknown Device'}</p>
                              </div>
                              <button 
                                onClick={() => {
                                  socket.emit('invite_employee_to_meeting', { employeeSocketId: emp.socketId, roomName: `${getUser()?.name || 'Admin'}'s Team Meeting` });
                                  toast.success(`Invitation sent to ${emp.name}!`);
                                }}
                                className="px-3 py-1.5 bg-[#1a73e8] hover:bg-blue-600 text-white rounded-xl text-[10px] font-bold active:scale-95 shadow-md shadow-blue-500/10 transition-all flex-shrink-0"
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
                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-3 flex flex-col">
                      {messages.length === 0 ? (
                        <p className="text-slate-400 text-xs text-center py-16 my-auto">Messages are visible to active call members only.</p>
                      ) : (
                        messages.map((msg, i) => (
                          <div 
                            key={i} 
                            className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs flex flex-col gap-0.5 shadow-sm ${msg.sender.includes('YOU') ? 'bg-[#1a73e8] text-white align-self-end ml-auto' : 'bg-white text-slate-700 mr-auto border border-slate-100'}`}
                          >
                            <span className={`font-bold text-[9px] ${msg.sender.includes('YOU') ? 'text-blue-100' : 'text-slate-400'}`}>{msg.sender}</span>
                            <span className="break-words leading-relaxed">{msg.text}</span>
                            <span className={`text-[7px] text-right mt-0.5 ${msg.sender.includes('YOU') ? 'text-blue-200' : 'text-slate-400'}`}>{msg.time}</span>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Chat Input form */}
                    <form onSubmit={handleSendMessage} className="flex gap-2 bg-white p-1 rounded-xl border border-slate-200">
                      <input 
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Send message..."
                        className="flex-1 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none rounded-xl"
                      />
                      <button 
                        type="submit"
                        className="p-2 bg-[#1a73e8] hover:bg-blue-600 text-white rounded-xl active:scale-95 transition-all flex items-center justify-center"
                      >
                        <Send size={12} />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Google Meet Bottom Control Panel */}
      <div className="h-20 bg-[#202124] border-t border-slate-800/40 flex items-center justify-between px-8 z-50">
        
        {/* Left Side: Time and Room ID */}
        <div className="flex items-center gap-3 text-white font-medium text-sm">
          <span>{currentTime}</span>
          <span className="text-slate-600">|</span>
          <span className="font-semibold tracking-wide text-slate-300">sentinel-meet-room</span>
        </div>

        {/* Center Side: Video and Call Toggles */}
        <div className="flex items-center gap-3">
          {/* Microphone */}
          <button 
            onClick={toggleMic}
            className={`p-3.5 rounded-full transition-colors ${isMicOn ? 'bg-[#3c4043] text-white hover:bg-[#4a4f54]' : 'bg-[#ea4335] text-white hover:bg-[#eb5246]'}`}
          >
            {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
          </button>

          {/* Camera */}
          <button 
            onClick={toggleCam}
            className={`p-3.5 rounded-full transition-colors ${isCamOn ? 'bg-[#3c4043] text-white hover:bg-[#4a4f54]' : 'bg-[#ea4335] text-white hover:bg-[#eb5246]'}`}
          >
            {isCamOn ? <Video size={20} /> : <VideoOff size={20} />}
          </button>

          {/* Hand Raise */}
          <button 
            onClick={() => setIsHandRaised(!isHandRaised)}
            className={`p-3.5 rounded-full transition-colors ${isHandRaised ? 'bg-[#f89b1c] text-white' : 'bg-[#3c4043] text-white hover:bg-[#4a4f54]'}`}
          >
            <Hand size={20} />
          </button>

          {/* Screen Share */}
          <button 
            onClick={toggleScreenShare}
            className={`p-3.5 rounded-full transition-colors ${isScreenSharing ? 'bg-[#1a73e8] text-white' : 'bg-[#3c4043] text-white hover:bg-[#4a4f54]'}`}
          >
            <Monitor size={20} />
          </button>

          {/* More actions Menu */}
          <button className="p-3.5 rounded-full bg-[#3c4043] text-white hover:bg-[#4a4f54] transition-colors">
            <MoreVertical size={20} />
          </button>

          <div className="w-px h-8 bg-slate-800 mx-2" />

          {/* End Call Button */}
          <button 
            onClick={handleLeaveMeeting}
            className="px-6 py-3.5 bg-[#ea4335] hover:bg-[#d93025] text-white rounded-full flex items-center justify-center gap-2 shadow-lg shadow-red-500/10 active:scale-95 transition-all"
          >
            <PhoneOff size={20} />
          </button>
        </div>

        {/* Right Side: Information Panel Toggles */}
        <div className="flex items-center gap-2">
          {/* Info Details */}
          <button 
            onClick={() => toast('Room Code: sentinel-meet-room', { icon: 'ℹ️' })}
            className="p-3 rounded-full text-slate-300 hover:bg-[#3c4043] transition-colors"
          >
            <Info size={18} />
          </button>

          {/* People list toggle */}
          <button 
            onClick={() => handleToggleSidebar('invite')}
            className={`p-3 rounded-full transition-colors ${showSidebar && sidebarTab === 'invite' ? 'bg-[#e8f0fe] text-[#1a73e8]' : 'text-slate-300 hover:bg-[#3c4043]'}`}
          >
            <Users size={18} />
          </button>

          {/* Live Chat Panel toggle */}
          <button 
            onClick={() => handleToggleSidebar('chat')}
            className={`p-3 rounded-full transition-colors ${showSidebar && sidebarTab === 'chat' ? 'bg-[#e8f0fe] text-[#1a73e8]' : 'text-slate-300 hover:bg-[#3c4043]'}`}
          >
            <MessageSquare size={18} />
          </button>
        </div>

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
    <div className="relative aspect-video w-full bg-[#3c4043] rounded-2xl overflow-hidden border border-slate-700/50 shadow-xl flex items-center justify-center">
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        className="w-full h-full object-cover rounded-2xl"
      />
      <div className="absolute bottom-3 left-3 px-3 py-1 bg-black/60 backdrop-blur-md rounded-lg text-xs font-medium text-white uppercase tracking-wider">
        Employee Participant
      </div>
    </div>
  );
}
