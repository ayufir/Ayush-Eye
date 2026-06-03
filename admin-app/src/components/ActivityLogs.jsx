import React, { useState, useEffect } from 'react';
import { 
    FileText, RefreshCw, Calendar, Search, User, Filter, 
    ArrowDown, ChevronRight, AlertTriangle, Monitor, Clock, 
    Play, Power, Globe, Keyboard, MessageSquare, Lock, 
    ShieldAlert, CheckCircle2, Moon, Sun, Trash2, Download, Shield
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import useStore from '../store';
import { getToken } from '../utils/auth';

const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000'
  : 'https://ayush-eye-1.onrender.com';

const EVENT_CONFIG = {
    connected: {
        icon: Play,
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        label: 'Online'
    },
    disconnected: {
        icon: Power,
        color: 'text-slate-400 bg-slate-800/50 border-slate-700/50',
        label: 'Offline'
    },
    idle_start: {
        icon: Moon,
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        label: 'Idle Start'
    },
    idle_end: {
        icon: Sun,
        color: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
        label: 'Active'
    },
    pc_locked: {
        icon: Lock,
        color: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
        label: 'PC Locked'
    },
    website_blocked: {
        icon: Globe,
        color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
        label: 'Web Control'
    },
    keylog_session: {
        icon: Keyboard,
        color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
        label: 'Keylog'
    },
    alert_triggered: {
        icon: ShieldAlert,
        color: 'text-red-400 bg-red-500/10 border-red-500/20 animate-pulse',
        label: 'Security Alert'
    },
    monitor_switched: {
        icon: Monitor,
        color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        label: 'Monitor Switch'
    },
    message_sent: {
        icon: MessageSquare,
        color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
        label: 'Message Sent'
    }
};

const ActivityLogs = () => {
    const { employees } = useStore();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Filters state
    const [selectedEmployee, setSelectedEmployee] = useState('all');
    const [selectedEvent, setSelectedEvent] = useState('all');
    const [datePreset, setDatePreset] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [limit, setLimit] = useState('100');

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const queryParams = new URLSearchParams();
            if (selectedEmployee !== 'all') {
                queryParams.append('employeeId', selectedEmployee);
            }
            if (selectedEvent !== 'all') {
                queryParams.append('event', selectedEvent);
            }
            if (datePreset !== 'all') {
                const fromDate = new Date();
                if (datePreset === 'today') {
                    fromDate.setHours(0, 0, 0, 0);
                } else if (datePreset === 'yesterday') {
                    fromDate.setDate(fromDate.getDate() - 1);
                    fromDate.setHours(0, 0, 0, 0);
                } else if (datePreset === '7days') {
                    fromDate.setDate(fromDate.getDate() - 7);
                }
                queryParams.append('from', fromDate.toISOString());
            }
            queryParams.append('limit', limit);

            const res = await fetch(`${BACKEND_URL}/api/admin/activity-logs?${queryParams.toString()}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (Array.isArray(data)) {
                setLogs(data);
            } else {
                console.error('Logs response is not an array:', data);
            }
        } catch (err) {
            console.error('Failed to fetch logs:', err);
            toast.error('Failed to load activity logs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [selectedEmployee, selectedEvent, datePreset, limit]);

    // Client-side search filtering
    const filteredLogs = logs.filter(log => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            (log.detail && log.detail.toLowerCase().includes(query)) ||
            (log.employeeName && log.employeeName.toLowerCase().includes(query)) ||
            (log.pcName && log.pcName.toLowerCase().includes(query)) ||
            (log.event && log.event.toLowerCase().includes(query))
        );
    });

    // Stats calculations
    const totalCount = filteredLogs.length;
    const alertCount = filteredLogs.filter(l => l.event === 'alert_triggered').length;
    const idleCount = filteredLogs.filter(l => l.event === 'idle_start').length;
    const activeCount = filteredLogs.filter(l => l.event === 'connected').length;

    const downloadCSV = () => {
        if (filteredLogs.length === 0) {
            toast.error('No logs to download');
            return;
        }
        let csvContent = 'data:text/csv;charset=utf-8,';
        csvContent += 'Timestamp,Employee Name,PC Name,Event Type,Details\n';
        
        filteredLogs.forEach(log => {
            const time = new Date(log.timestamp).toLocaleString();
            const name = `"${(log.employeeName || '').replace(/"/g, '""')}"`;
            const pc = `"${(log.pcName || '').replace(/"/g, '""')}"`;
            const eventType = `"${log.event || ''}"`;
            const detail = `"${(log.detail || '').replace(/"/g, '""')}"`;
            csvContent += `${time},${name},${pc},${eventType},${detail}\n`;
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Sentinel_Activity_Logs_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Activity logs downloaded as CSV');
    };

    return (
        <div className="space-y-6">
            {/* Header / Stats Panel */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[#1e293b] border border-slate-800/60 p-5 rounded-2xl flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total logged events</p>
                        <h4 className="text-2xl font-bold text-slate-100 mt-1">{totalCount}</h4>
                    </div>
                    <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl">
                        <FileText size={20} />
                    </div>
                </div>

                <div className="bg-[#1e293b] border border-slate-800/60 p-5 rounded-2xl flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Security Alerts</p>
                        <h4 className="text-2xl font-bold text-red-400 mt-1">{alertCount}</h4>
                    </div>
                    <div className={`p-3 bg-red-500/10 text-red-400 rounded-xl ${alertCount > 0 ? 'animate-pulse' : ''}`}>
                        <ShieldAlert size={20} />
                    </div>
                </div>

                <div className="bg-[#1e293b] border border-slate-800/60 p-5 rounded-2xl flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Idle Triggers</p>
                        <h4 className="text-2xl font-bold text-amber-400 mt-1">{idleCount}</h4>
                    </div>
                    <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl">
                        <Moon size={20} />
                    </div>
                </div>

                <div className="bg-[#1e293b] border border-slate-800/60 p-5 rounded-2xl flex items-center justify-between">
                    <div>
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Online Logins</p>
                        <h4 className="text-2xl font-bold text-emerald-400 mt-1">{activeCount}</h4>
                    </div>
                    <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
                        <Play size={20} />
                    </div>
                </div>
            </div>

            {/* Filter controls */}
            <div className="bg-[#1e293b] border border-slate-800/60 p-5 rounded-2xl">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        {/* Employee Select */}
                        <div className="relative">
                            <select
                                value={selectedEmployee}
                                onChange={e => setSelectedEmployee(e.target.value)}
                                className="bg-slate-900 border border-slate-700/60 text-slate-200 text-sm rounded-xl pl-3 pr-8 py-2.5 outline-none focus:border-blue-500 appearance-none cursor-pointer"
                            >
                                <option value="all">All Employees</option>
                                {employees.map(emp => (
                                    <option key={emp.id || emp.socketId} value={emp.id || emp.socketId}>
                                        {emp.name} ({emp.pcName || 'PC'})
                                    </option>
                                ))}
                            </select>
                            <span className="absolute right-3 top-3.5 pointer-events-none text-slate-400">
                                <Filter size={14} />
                            </span>
                        </div>

                        {/* Event Select */}
                        <div className="relative">
                            <select
                                value={selectedEvent}
                                onChange={e => setSelectedEvent(e.target.value)}
                                className="bg-slate-900 border border-slate-700/60 text-slate-200 text-sm rounded-xl pl-3 pr-8 py-2.5 outline-none focus:border-blue-500 appearance-none cursor-pointer"
                            >
                                <option value="all">All Events</option>
                                <option value="connected">Connections</option>
                                <option value="disconnected">Disconnections</option>
                                <option value="idle_start">Idle Start</option>
                                <option value="idle_end">Resumed Activity</option>
                                <option value="pc_locked">PC Lock events</option>
                                <option value="website_blocked">Website Blocks</option>
                                <option value="keylog_session">Keylogger sessions</option>
                                <option value="alert_triggered">Security Alerts</option>
                                <option value="monitor_switched">Monitor Switches</option>
                                <option value="message_sent">Admin Messages</option>
                            </select>
                            <span className="absolute right-3 top-3.5 pointer-events-none text-slate-400">
                                <Filter size={14} />
                            </span>
                        </div>

                        {/* Time Select */}
                        <div className="relative">
                            <select
                                value={datePreset}
                                onChange={e => setDatePreset(e.target.value)}
                                className="bg-slate-900 border border-slate-700/60 text-slate-200 text-sm rounded-xl pl-3 pr-8 py-2.5 outline-none focus:border-blue-500 appearance-none cursor-pointer"
                            >
                                <option value="all">All Time</option>
                                <option value="today">Today</option>
                                <option value="yesterday">Last 24 Hours</option>
                                <option value="7days">Last 7 Days</option>
                            </select>
                            <span className="absolute right-3 top-3.5 pointer-events-none text-slate-400">
                                <Calendar size={14} />
                            </span>
                        </div>

                        {/* Row Limit Select */}
                        <div className="relative">
                            <select
                                value={limit}
                                onChange={e => setLimit(e.target.value)}
                                className="bg-slate-900 border border-slate-700/60 text-slate-200 text-sm rounded-xl pl-3 pr-8 py-2.5 outline-none focus:border-blue-500 appearance-none cursor-pointer"
                            >
                                <option value="50">50 rows</option>
                                <option value="100">100 rows</option>
                                <option value="200">200 rows</option>
                                <option value="500">500 rows</option>
                            </select>
                            <span className="absolute right-3 top-3.5 pointer-events-none text-slate-400">
                                <ArrowDown size={14} />
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                        {/* Search Input */}
                        <div className="relative flex-1 md:w-64">
                            <input
                                type="text"
                                placeholder="Search logs..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700/60 text-slate-100 text-sm rounded-xl pl-9 pr-4 py-2.5 outline-none focus:border-blue-500"
                            />
                            <Search className="absolute left-3 top-3 text-slate-500" size={16} />
                        </div>

                        {/* Actions */}
                        <button 
                            onClick={fetchLogs} 
                            disabled={loading}
                            className="p-2.5 bg-slate-800 border border-slate-700/60 hover:bg-slate-700 text-slate-300 rounded-xl transition-all"
                            title="Refresh logs"
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button 
                            onClick={downloadCSV}
                            className="p-2.5 bg-slate-800 border border-slate-700/60 hover:bg-slate-700 text-slate-300 rounded-xl transition-all flex items-center gap-1.5 text-sm"
                            title="Download CSV"
                        >
                            <Download size={16} />
                            <span className="hidden sm:inline">Export</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Timeline area */}
            <div className="bg-[#1e293b] border border-slate-800/60 rounded-2xl p-6">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <RefreshCw size={40} className="animate-spin mb-4 text-blue-500" />
                        <p className="text-sm">Fetching activity events...</p>
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-500 text-center">
                        <FileText size={48} className="mb-4 opacity-20" />
                        <h4 className="font-semibold text-slate-300">No logs found</h4>
                        <p className="text-xs max-w-sm mt-1">Try adjusting your filters or keyword search above to find registered events.</p>
                    </div>
                ) : (
                    <div className="relative border-l border-slate-700/60 ml-4 pl-8 space-y-6 py-2">
                        {filteredLogs.map((log) => {
                            const config = EVENT_CONFIG[log.event] || {
                                icon: FileText,
                                color: 'text-slate-400 bg-slate-800 border-slate-700',
                                label: log.event
                            };
                            const IconComponent = config.icon;

                            return (
                                <div key={log._id || log.id} className="relative group transition-all">
                                    {/* Vertical connecting line overlap check icon */}
                                    <div className={`absolute -left-[48px] top-1.5 w-8 h-8 rounded-full bg-[#1e293b] border flex items-center justify-center transition-all ${config.color}`}>
                                        <IconComponent size={14} />
                                    </div>

                                    {/* Timeline Card */}
                                    <div className="bg-slate-900/40 border border-slate-850 hover:border-slate-700/50 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all hover:bg-slate-900/60">
                                        <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-semibold text-slate-100 text-sm">
                                                    {log.employeeName}
                                                </span>
                                                <span className="text-slate-600 text-xs">•</span>
                                                <span className="text-slate-400 text-xs font-mono bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/40">
                                                    {log.pcName}
                                                </span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${config.color}`}>
                                                    {config.label}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-300 break-words max-w-3xl">
                                                {log.detail}
                                            </p>
                                        </div>

                                        <div className="text-right flex-shrink-0">
                                            <p className="text-xs text-slate-400 font-medium">
                                                {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                            <p className="text-[10px] text-slate-600">
                                                {new Date(log.timestamp).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ActivityLogs;
