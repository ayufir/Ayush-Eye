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

import Screenshots from '../components/Screenshots';

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

    useEffect(() => {
        if (!getToken() || isExpired()) {
            window.location.href = '/login';
            return;
        }

        const fetchEmployees = async () => {
            try {
                const res = await fetch(`${BACKEND_URL}/api/employees`);
                const data = await res.json();
                const myEmployees = data.filter(e => e.adminId === getUser()?.id);
                setEmployees(myEmployees);
            } catch (err) {
                console.error('Fetch employees error:', err);
            }
        };

        const identifyAdmin = () => {
            setConnectionStatus('connected');
            socket.emit('identify', { 
                role: 'admin', 
                token: getToken() 
            });
            fetchEmployees(); // Fallback to HTTP fetch
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

        socket.on('initial_employee_list', (list) => {
            setEmployees(list);
        });

        socket.on('employee_joined', (employee) => {
            if (employee.adminId !== getUser()?.id) return; // safety check
            setEmployees(prev => {
                const exists = prev.find(e => e.id === employee.id);
                if (exists) return prev.map(e => e.id === employee.id ? employee : e);
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

        return () => {
            socket.off('connect');
            socket.off('auth_error');
            socket.off('disconnect');
            socket.off('initial_employee_list');
            socket.off('employee_joined');
            socket.off('employee_status_change');
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

            {activeTab === 'dashboard' && <Dashboard />}
            {activeTab === 'monitoring' && <LiveWall socket={socket} />}
            {activeTab === 'screenshots' && <Screenshots socket={socket} />}
            {/* Add more tab components as needed */}
        </AdminLayout>
    );
};

export default MainDashboard;
