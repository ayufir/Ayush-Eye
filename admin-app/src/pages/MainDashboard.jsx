import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import io from 'socket.io-client';
import useStore from '../store';
import Dashboard from '../components/Dashboard';
import LiveWall from '../components/LiveWall';
import RemoteControl from '../components/RemoteControl';
import AdminLayout from '../layouts/AdminLayout';
import { getToken, isExpired, logout } from '../utils/auth';

// Connect to socket
const socket = io('https://ayush-eye-1.onrender.com');

const MainDashboard = () => {
    const { employees, setEmployees, selectedEmployee, setSelectedEmployee } = useStore();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [notifications, setNotifications] = useState([]);
    const [connectionStatus, setConnectionStatus] = useState('connecting');

    useEffect(() => {
        if (!getToken() || isExpired()) {
            window.location.href = '/login';
            return;
        }

        socket.on('connect', () => {
            setConnectionStatus('connected');
            socket.emit('identify', { 
                role: 'admin', 
                token: getToken() 
            });
        });

        socket.on('auth_error', (data) => {
            toast.error(data.message);
            logout();
        });

        socket.on('disconnect', () => setConnectionStatus('disconnected'));

        socket.on('initial_employee_list', (list) => {
            setEmployees(list);
        });

        socket.on('employee_joined', (employee) => {
            setEmployees(prev => {
                const exists = prev.find(e => e.socketId === employee.socketId);
                if (exists) return prev.map(e => e.socketId === employee.socketId ? employee : e);
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
        >
            {selectedEmployee && (
                <RemoteControl
                    employee={selectedEmployee}
                    socket={socket}
                    onClose={() => setSelectedEmployee(null)}
                />
            )}

            {activeTab === 'dashboard' && <Dashboard />}
            {activeTab === 'monitoring' && <LiveWall socket={socket} />}
            {/* Add more tab components as needed */}
        </AdminLayout>
    );
};

export default MainDashboard;
