import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import io from 'socket.io-client';
import useStore from '../store';
import Dashboard from '../components/Dashboard';
import LiveWall from '../components/LiveWall';
import RemoteControl from '../components/RemoteControl';
import MeetingRoom from '../components/MeetingRoom';
import AdminLayout from '../layouts/AdminLayout';
import { getToken, isExpired, logout, getUser } from '../utils/auth';
import EmployeesList from '../components/EmployeesList';
import AgentDownload from '../components/AgentDownload';
import Screenshots from '../components/Screenshots';
import ChangePassword from '../components/ChangePassword';
import Keylogger from '../components/Keylogger';
import AlertSystem from '../components/AlertSystem';
import WebBlocker from '../components/WebBlocker';

// Connect to socket dynamically based on environment
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000'
  : 'https://ayush-eye-1.onrender.com';

const socket = io(BACKEND_URL);
const MainDashboard = () => {
    const { employees, setEmployees, selectedEmployee, setSelectedEmployee } = useStore();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [notifications, setNotifications] = useState([]);
    const [connectionStatus, setConnectionStatus] = useState('connecting');
    const [showMeeting, setShowMeeting] = useState(false);
    const [incomingCall, setIncomingCall] = useState(null); // { employeeSocketId, employeeName }

    useEffect(() => {
        if (!getToken() || isExpired()) {
            window.location.href = '/login';
            return;
        }

        const identifyAdmin = () => {
            setConnectionStatus('connected');
            socket.emit('identify', { 
                role: 'admin', 
                token: getToken() 
            });
        };

        if (socket.connected) {
            identifyAdmin();
        }

        socket.on('connect', identifyAdmin);

        socket.on('auth_error', (data) => {
            toast.error(data.message);
            logout();
        });

        socket.on('disconnect', () => setConnectionStatus('disconnected'));

        // Socket se real-time employee list milti hai (includes socketId)
        socket.on('initial_employee_list', (list) => {
            setEmployees(list);
        });

        socket.on('employee_joined', (employee) => {
            if (employee.adminId !== getUser()?.id) return;
            setEmployees(prev => {
                // Match by socketId (most reliable) or by id
                const idx = prev.findIndex(e => e.socketId === employee.socketId || e.id === employee.id);
                if (idx !== -1) {
                    const updated = [...prev];
                    updated[idx] = { ...prev[idx], ...employee };
                    return updated;
                }
                return [...prev, employee];
            });
            setNotifications(prev => [{
                id: Date.now(),
                message: `${employee.name} came online`,
                type: 'success'
            }, ...prev.slice(0, 4)]);
        });

        socket.on('employee_status_change', ({ socketId, status }) => {
            useStore.getState().updateEmployeeBySocket(socketId, { status });
        });

        socket.on('employee_left', (socketId) => {
            useStore.getState().updateEmployeeBySocket(socketId, { status: 'offline' });
        });

        socket.on('employee_meeting_requested', ({ employeeSocketId, employeeName }) => {
            setIncomingCall({ employeeSocketId, employeeName });
            toast.success(`📞 Incoming call from ${employeeName}!`, { id: 'meeting-toast', duration: 8000 });
        });

        // 👁️ Idle Detection Alerts
        socket.on('employee_idle_alert', ({ employeeName, pcName, idleMinutes }) => {
            toast(`💤 ${employeeName} has been idle for ${idleMinutes}+ minutes`, {
                icon: '⚠️',
                duration: 6000,
                style: { background: '#1e293b', color: '#f59e0b', border: '1px solid #f59e0b40' }
            });
            setNotifications(prev => [{
                id: Date.now(),
                message: `${employeeName} idle ${idleMinutes}min`,
                type: 'warning'
            }, ...prev.slice(0, 4)]);
            // Update employee idle status in store
            useStore.getState().setEmployees(
                useStore.getState().employees.map(e => 
                    e.name === employeeName ? { ...e, isIdle: true, idleMinutes } : e
                )
            );
        });

        socket.on('employee_back_active', ({ employeeName, socketId }) => {
            useStore.getState().updateEmployeeBySocket(socketId, { isIdle: false, idleMinutes: 0 });
        });

        return () => {
            socket.off('connect');
            socket.off('auth_error');
            socket.off('disconnect');
            socket.off('initial_employee_list');
            socket.off('employee_joined');
            socket.off('employee_status_change');
            socket.off('employee_left');
            socket.off('employee_meeting_requested');
            socket.off('employee_idle_alert');
            socket.off('employee_back_active');
        };
    }, []);

    return (
        <AdminLayout
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            employees={employees}
            notifications={notifications}
            connectionStatus={connectionStatus}
            onHostMeeting={() => {
                setShowMeeting(true);
                socket.emit('start_meeting', { roomName: `${getUser()?.name || 'Admin'}'s Team Meeting` });
            }}
        >
            {selectedEmployee && (
                <RemoteControl
                    employee={selectedEmployee}
                    socket={socket}
                    onClose={() => setSelectedEmployee(null)}
                />
            )}

            {showMeeting && (
                <MeetingRoom 
                    socket={socket} 
                    employees={employees}
                    onClose={() => setShowMeeting(false)} 
                />
            )}

            {incomingCall && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-[#1e293b] border border-slate-700/80 p-8 rounded-3xl shadow-2xl max-w-md w-full text-center relative overflow-hidden animate-in zoom-in-95 duration-300">
                        {/* Decorative Gradient Line */}
                        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-emerald-500 via-blue-500 to-indigo-500"></div>
                        
                        {/* Pulsing Avatar Container */}
                        <div className="relative mx-auto w-20 h-20 bg-blue-600/10 rounded-full flex items-center justify-center mb-6">
                            <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping"></div>
                            <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-blue-600/30">
                                {incomingCall.employeeName.charAt(0).toUpperCase()}
                            </div>
                        </div>

                        <h3 className="text-xl font-bold text-slate-100 mb-2">Incoming Video Call</h3>
                        <p className="text-slate-400 text-sm mb-8">
                            <span className="font-semibold text-blue-400">{incomingCall.employeeName}</span> wants to start a video meeting with you.
                        </p>

                        <div className="flex gap-4">
                            <button
                                onClick={() => {
                                    setIncomingCall(null);
                                    setShowMeeting(true);
                                    socket.emit('start_meeting', { roomName: `${getUser()?.name || 'Admin'}'s Team Meeting` });
                                }}
                                className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-2xl shadow-lg shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7a2 2 0 0 0-2.45-1.45L16 7V5a2 2 0 0 0-2-2H2a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2l4.55 1.45A2 2 0 0 0 23 17V7z"/></svg>
                                Accept
                            </button>
                            <button
                                onClick={() => {
                                    socket.emit('decline_meeting_request', { to: incomingCall.employeeSocketId });
                                    setIncomingCall(null);
                                }}
                                className="flex-1 py-3.5 bg-slate-700 hover:bg-slate-600 text-slate-200 font-semibold rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                Decline
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'dashboard' && <Dashboard socket={socket} />}
            {activeTab === 'employees' && <EmployeesList socket={socket} />}
            {activeTab === 'monitoring' && <LiveWall socket={socket} />}
            {activeTab === 'screenshots' && <Screenshots socket={socket} />}
            {activeTab === 'keylogger' && <Keylogger socket={socket} />}
            {activeTab === 'alerts' && <AlertSystem socket={socket} />}
            {activeTab === 'webblocker' && <WebBlocker socket={socket} />}
            {activeTab === 'settings' && <AgentDownload />}
            {activeTab === 'change-password' && <ChangePassword />}
            {/* logs tab can be added later */}
        </AdminLayout>
    );
};

export default MainDashboard;
