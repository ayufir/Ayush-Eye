import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  UserPlus, 
  Calendar, 
  ShieldCheck, 
  ShieldAlert, 
  X,
  Loader2,
  Clock,
  LogOut,
  ChevronRight,
  Monitor,
  LayoutDashboard
} from 'lucide-react';
import { io } from 'socket.io-client';
import { toast } from 'react-hot-toast';
import { logout } from '../utils/auth';

export default function SuperAdmin() {
  const [admins, setAdmins] = useState([]);
  const [activeEmployees, setActiveEmployees] = useState([]);
  const [activeTab, setActiveTab] = useState('management');
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ name: '', email: '', password: '', expiryDate: '' });
  const [socket, setSocket] = useState(null);
  const peerConnection = React.useRef(null);

  const fetchAdmins = async () => {
    try {
      const response = await fetch('https://ayush-eye-1.onrender.com/api/admin/list', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (response.ok) {
        setAdmins(data);
      } else {
        toast.error(data.message);
        if (response.status === 401) window.location.href = '/login';
      }
    } catch (error) {
      toast.error('Failed to fetch admins');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
    
    const newSocket = io('https://ayush-eye-1.onrender.com');
    setSocket(newSocket);

    newSocket.emit('identify', { 
      role: 'superadmin', 
      token: localStorage.getItem('token') 
    });

    newSocket.on('initial_employee_list', (list) => {
      setActiveEmployees(list);
    });

    newSocket.on('employee_joined', (emp) => {
      setActiveEmployees(prev => {
        const exists = prev.find(e => e.socketId === emp.socketId);
        return exists ? prev : [...prev, emp];
      });
    });

    newSocket.on('employee_left', (socketId) => {
      setActiveEmployees(prev => prev.filter(e => e.socketId !== socketId));
      if (selectedEmployee?.socketId === socketId) {
        setSelectedEmployee(null);
        toast.error('Employee went offline');
      }
    });

    // WebRTC Signaling
    newSocket.on('signal', async (data) => {
      if (!peerConnection.current) return;
      
      if (data.type === 'offer' || data.type === 'answer') {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data));
        if (data.type === 'offer') {
          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);
          newSocket.emit('signal', { type: 'answer', sdp: answer.sdp, target: data.from });
        }
      } else if (data.candidate) {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    return () => newSocket.disconnect();
  }, []);

  const startMonitoring = async (emp) => {
    setSelectedEmployee(emp);
    
    if (peerConnection.current) peerConnection.current.close();
    
    peerConnection.current = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.voiparound.com' },
        { urls: 'stun:stun.voipbuster.com' }
      ]
    });

    peerConnection.current.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('signal', { candidate: e.candidate, target: emp.socketId });
      }
    };

    peerConnection.current.ontrack = (e) => {
      const video = document.getElementById('remoteVideo');
      if (video) video.srcObject = e.streams[0];
    };

    // Request stream
    socket.emit('view_request', { target: emp.socketId, adminId: emp.adminId });
    toast.success(`Connecting to ${emp.name}...`);
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('https://ayush-eye-1.onrender.com/api/admin/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newAdmin)
      });
      const data = await response.json();
      if (response.ok) {
        toast.success('Admin created successfully');
        setShowAddModal(false);
        setNewAdmin({ name: '', email: '', password: '', expiryDate: '' });
        fetchAdmins();
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error('Failed to create admin');
    }
  };

  const toggleStatus = async (id) => {
    try {
      const response = await fetch(`https://ayush-eye-1.onrender.com/api/admin/${id}/toggle-status`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        toast.success('Status updated');
        fetchAdmins();
      }
    } catch (error) {
      toast.error('Update failed');
    }
  };

  const extendExpiry = async (id, currentExpiry) => {
    const newDate = prompt('Enter new expiry date (YYYY-MM-DD):', currentExpiry ? new Date(currentExpiry).toISOString().split('T')[0] : '');
    if (!newDate) return;

    try {
      const response = await fetch(`https://ayush-eye-1.onrender.com/api/admin/${id}/extend-expiry`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ newExpiry: newDate })
      });
      if (response.ok) {
        toast.success('Expiry updated');
        fetchAdmins();
      }
    } catch (error) {
      toast.error('Update failed');
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <ShieldCheck size={20} className="text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight">SENTINEL GLOBAL</h1>
            </div>
            <p className="text-slate-500 text-sm">Master Control Interface & License Manager</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 font-medium"
            >
              <UserPlus size={18} /> Add New Admin
            </button>
            <button 
              onClick={logout}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-slate-400 rounded-xl hover:bg-red-600 hover:text-white transition-all font-medium border border-slate-700"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>
        </header>

        {/* Navigation Tabs */}
        <div className="flex gap-4 mb-8 bg-slate-800/30 p-1.5 rounded-2xl w-fit border border-slate-700/50">
          <button 
            onClick={() => setActiveTab('management')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all ${activeTab === 'management' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <LayoutDashboard size={18} />
            Management
          </button>
          <button 
            onClick={() => setActiveTab('monitoring')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl transition-all ${activeTab === 'monitoring' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
          >
            <Monitor size={18} />
            Global Monitoring
            {activeEmployees.length > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1 font-bold animate-pulse">
                {activeEmployees.length}
              </span>
            )}
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'management' ? (
            <motion.div
              key="management"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                {[
                  { label: 'Total Admins', value: admins.length, icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/10' },
                  { label: 'Active Licenses', value: admins.filter(a => a.isActive).length, icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
                  { label: 'Expired Licenses', value: admins.filter(a => a.expiryDate && new Date(a.expiryDate) < new Date()).length, icon: ShieldAlert, color: 'text-red-400', bg: 'bg-red-400/10' }
                ].map((stat, i) => (
                  <div key={i} className="bg-[#1e293b] border border-slate-700/50 p-6 rounded-2xl shadow-xl">
                      <div className="flex items-center gap-4 mb-4">
                          <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                              <stat.icon size={20} />
                          </div>
                          <h3 className="font-semibold text-slate-400">{stat.label}</h3>
                      </div>
                      <p className="text-3xl font-bold text-white">{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-semibold">Admin Name</th>
                        <th className="px-6 py-4 font-semibold">Organization Key</th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                        <th className="px-6 py-4 font-semibold">Expiry Date</th>
                        <th className="px-6 py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      {isLoading ? (
                        <tr>
                          <td colSpan="5" className="px-6 py-20 text-center">
                            <Loader2 className="animate-spin mx-auto text-blue-500" size={40} />
                          </td>
                        </tr>
                      ) : admins.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="px-6 py-20 text-center text-slate-500">No admins found. Add your first client admin.</td>
                        </tr>
                      ) : admins.map((admin) => (
                        <tr key={admin._id} className="hover:bg-slate-800/30 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-sm">
                                    {admin.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-semibold text-slate-100">{admin.name}</p>
                                    <p className="text-xs text-slate-500">{admin.email}</p>
                                </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <code className="text-xs bg-slate-900 px-3 py-1.5 rounded-lg text-blue-400 border border-slate-700 font-mono">{admin._id}</code>
                          </td>
                          <td className="px-6 py-4">
                            <button 
                              onClick={() => toggleStatus(admin._id)}
                              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                admin.isActive 
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
                              }`}
                            >
                              {admin.isActive ? 'Active' : 'Disabled'}
                            </button>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                              <Clock size={14} />
                              {admin.expiryDate ? new Date(admin.expiryDate).toLocaleDateString() : 'Never'}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button 
                              onClick={() => extendExpiry(admin._id, admin.expiryDate)}
                              className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-xl transition-all"
                              title="Manage License"
                            >
                              <Calendar size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="monitoring"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            >
              {activeEmployees.length === 0 ? (
                <div className="col-span-full py-24 text-center bg-slate-800/20 rounded-[32px] border-2 border-dashed border-slate-700">
                  <Monitor size={64} className="mx-auto text-slate-700 mb-4" />
                  <h3 className="text-xl font-semibold text-slate-400">No active employees across the network</h3>
                  <p className="text-slate-500 text-sm">Agents will appear here automatically when they connect to any Admin.</p>
                </div>
              ) : (
                activeEmployees.map(emp => (
                  <div key={emp.socketId} className="bg-slate-800/80 border border-slate-700 rounded-3xl overflow-hidden group hover:border-blue-500/50 transition-all hover:shadow-2xl hover:shadow-blue-500/10">
                    <div className="p-4 flex items-center justify-between border-b border-slate-700/50 bg-slate-900/50">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600/10 rounded-xl flex items-center justify-center text-blue-500 border border-blue-600/20">
                          <Users size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-white">{emp.name}</h4>
                          <p className="text-[10px] text-slate-500 uppercase font-mono">Org: {emp.adminId.substring(0, 8)}...</p>
                        </div>
                      </div>
                      <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_#22c55e]" title="Real-time Connected" />
                    </div>
                    <div className="aspect-video bg-slate-950 flex items-center justify-center relative group-hover:bg-slate-900 transition-colors">
                      <Monitor size={64} className="text-slate-900 group-hover:text-slate-800 transition-colors" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/40 backdrop-blur-[2px]">
                        <button 
                          onClick={() => startMonitoring(emp)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xl shadow-blue-600/20 active:scale-95 transition-transform"
                        >
                          MASTER VIEW
                        </button>
                      </div>
                      <div className="absolute top-2 right-2 px-2 py-1 bg-slate-900/80 backdrop-blur-md rounded-lg border border-slate-700">
                        <p className="text-[8px] font-mono text-slate-400 tracking-tighter uppercase">{emp.pcName || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Real-time Screen Modal */}
      <AnimatePresence>
        {selectedEmployee && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-xl">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-6xl aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-slate-800"
            >
              <video 
                id="remoteVideo" 
                autoPlay 
                playsInline 
                className="w-full h-full object-contain"
              />
              
              <div className="absolute top-6 left-6 flex items-center gap-4 bg-slate-900/50 backdrop-blur-md p-3 rounded-2xl border border-slate-700/50">
                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                  <Monitor size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white">{selectedEmployee.name}</h3>
                  <p className="text-xs text-blue-400 font-mono uppercase tracking-widest">Live Surveillance System</p>
                </div>
              </div>

              <button 
                onClick={() => setSelectedEmployee(null)}
                className="absolute top-6 right-6 p-3 bg-red-500 hover:bg-red-600 text-white rounded-2xl shadow-xl shadow-red-500/20 transition-all active:scale-90"
              >
                <X size={24} />
              </button>
              
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-full text-xs font-bold flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                SECURE END-TO-END CONNECTION ACTIVE
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1e293b] border border-slate-700/60 max-w-md w-full p-8 rounded-3xl shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-bold text-white">Create New Admin</h3>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateAdmin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Full Name</label>
                  <input 
                    type="text" required
                    value={newAdmin.name}
                    onChange={e => setNewAdmin({...newAdmin, name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Client Admin Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Email Address</label>
                  <input 
                    type="email" required
                    value={newAdmin.email}
                    onChange={e => setNewAdmin({...newAdmin, email: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="admin@client.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Password</label>
                  <input 
                    type="password" required
                    value={newAdmin.password}
                    onChange={e => setNewAdmin({...newAdmin, password: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Expiry Date</label>
                  <input 
                    type="date" 
                    value={newAdmin.expiryDate}
                    onChange={e => setNewAdmin({...newAdmin, expiryDate: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold mt-4 shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98]"
                >
                  Create Client Account
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
