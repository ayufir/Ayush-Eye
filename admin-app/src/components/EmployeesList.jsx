import React, { useState } from 'react';
import { Users, Monitor, Wifi, WifiOff, Video, Search, RefreshCw } from 'lucide-react';
import useStore from '../store';
import { getUser } from '../utils/auth';
import { toast } from 'react-hot-toast';

const EmployeesList = ({ socket }) => {
    const { employees, setSelectedEmployee } = useStore();
    const [search, setSearch] = useState('');

    const filtered = employees.filter(emp =>
        emp.name?.toLowerCase().includes(search.toLowerCase()) ||
        emp.pcName?.toLowerCase().includes(search.toLowerCase())
    );

    const onlineCount = employees.filter(e => e.status === 'online').length;
    const offlineCount = employees.length - onlineCount;

    const handleInviteToMeeting = (emp) => {
        if (!emp.socketId) {
            toast.error(`${emp.name} is offline — cannot invite`);
            return;
        }
        socket.emit('invite_employee_to_meeting', {
            employeeSocketId: emp.socketId,
            roomName: `${getUser()?.name || 'Admin'}'s Team Meeting`
        });
        toast.success(`📞 Meeting invitation sent to ${emp.name}!`);
    };

    const handleMonitor = (emp) => {
        if (!emp.socketId || emp.status !== 'online') {
            toast.error(`${emp.name} is offline — cannot monitor`);
            return;
        }
        setSelectedEmployee(emp);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-5 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
                        <Users size={22} />
                    </div>
                    <div>
                        <p className="text-slate-400 text-xs font-medium">Total Employees</p>
                        <p className="text-2xl font-bold text-white">{employees.length}</p>
                    </div>
                </div>
                <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-5 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
                        <Wifi size={22} />
                    </div>
                    <div>
                        <p className="text-slate-400 text-xs font-medium">Online Now</p>
                        <p className="text-2xl font-bold text-emerald-400">{onlineCount}</p>
                    </div>
                </div>
                <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-5 flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-slate-500/10 text-slate-400">
                        <WifiOff size={22} />
                    </div>
                    <div>
                        <p className="text-slate-400 text-xs font-medium">Offline</p>
                        <p className="text-2xl font-bold text-slate-400">{offlineCount}</p>
                    </div>
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                    type="text"
                    placeholder="Search employees by name or PC..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-[#1e293b] border border-slate-700/50 rounded-xl text-slate-200 placeholder-slate-500 text-sm outline-none focus:border-blue-500/50 transition-colors"
                />
            </div>

            {/* Employee Cards Grid */}
            {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 bg-[#1e293b] rounded-2xl border border-slate-700/50">
                    <Users size={56} className="text-slate-700 mb-4" />
                    <h3 className="text-slate-400 font-semibold text-lg mb-2">
                        {employees.length === 0 ? 'No employees connected yet' : 'No results found'}
                    </h3>
                    <p className="text-slate-500 text-sm text-center max-w-sm">
                        {employees.length === 0
                            ? 'Go to Settings → Download Agent, and share it with your employees. They need to enter your Admin ID during setup.'
                            : 'Try a different search term.'
                        }
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filtered.map(emp => (
                        <div
                            key={emp.socketId || emp.id}
                            className={`bg-[#1e293b] rounded-2xl border transition-all group overflow-hidden ${
                                emp.status === 'online'
                                    ? 'border-emerald-500/20 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5'
                                    : 'border-slate-700/50 opacity-70'
                            }`}
                        >
                            {/* Card Header */}
                            <div className="p-4 border-b border-slate-700/50 flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow ${
                                    emp.status === 'online'
                                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white'
                                        : 'bg-slate-700 text-slate-400'
                                }`}>
                                    {emp.name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-slate-100 text-sm truncate">{emp.name}</p>
                                    <p className="text-[11px] text-slate-500 truncate">{emp.pcName || 'Unknown PC'}</p>
                                </div>
                                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                    emp.status === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse' : 'bg-slate-600'
                                }`} title={emp.status} />
                            </div>

                            {/* Card Body */}
                            <div className="p-4 space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">Status</span>
                                    <span className={`font-bold uppercase tracking-wide ${
                                        emp.status === 'online' ? 'text-emerald-400' : 'text-slate-500'
                                    }`}>
                                        {emp.status || 'offline'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">Platform</span>
                                    <span className="text-slate-300">{emp.platform || 'Windows'}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-slate-500">Socket ID</span>
                                    <span className="text-slate-500 font-mono text-[10px]">
                                        {emp.socketId ? emp.socketId.substring(0, 10) + '...' : 'offline'}
                                    </span>
                                </div>
                            </div>

                            {/* Card Actions */}
                            <div className="px-4 pb-4 flex gap-2">
                                <button
                                    onClick={() => handleMonitor(emp)}
                                    disabled={emp.status !== 'online'}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl transition-all bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Monitor size={14} /> Monitor
                                </button>
                                <button
                                    onClick={() => handleInviteToMeeting(emp)}
                                    disabled={emp.status !== 'online'}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-xl transition-all bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Video size={14} /> Invite
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default EmployeesList;
