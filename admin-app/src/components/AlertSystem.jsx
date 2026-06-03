import React, { useState, useEffect } from 'react';
import { AlertTriangle, Bell, BellOff, Plus, X, Trash2, Shield } from 'lucide-react';
import { toast } from 'react-hot-toast';

const AlertSystem = ({ socket }) => {
    const [keywords, setKeywords] = useState([]);
    const [newKeyword, setNewKeyword] = useState('');
    const [alerts, setAlerts] = useState([]);
    const [alertsEnabled, setAlertsEnabled] = useState(true);

    useEffect(() => {
        if (!socket) return;

        const handleAlert = (alertData) => {
            setAlerts(prev => [{ ...alertData, id: Date.now() }, ...prev.slice(0, 99)]);
            toast.error(
                `🚨 ALERT: "${alertData.keyword}" detected on ${alertData.employeeName}'s PC!`,
                { duration: 8000, icon: '🚨' }
            );
            // Sound notification
            try {
                const ctx = new AudioContext();
                const oscillator = ctx.createOscillator();
                const gain = ctx.createGain();
                oscillator.connect(gain);
                gain.connect(ctx.destination);
                oscillator.frequency.value = 880;
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
                oscillator.start(ctx.currentTime);
                oscillator.stop(ctx.currentTime + 0.5);
            } catch (e) {}
        };

        socket.on('security_alert', handleAlert);
        return () => socket.off('security_alert', handleAlert);
    }, [socket]);

    const addKeyword = () => {
        const kw = newKeyword.trim().toLowerCase();
        if (!kw || keywords.includes(kw)) return;
        const updated = [...keywords, kw];
        setKeywords(updated);
        setNewKeyword('');
        if (socket) {
            socket.emit('set_alert_keywords', { keywords: updated });
        }
        toast.success(`🚨 Keyword "${kw}" added`);
    };

    const removeKeyword = (kw) => {
        const updated = keywords.filter(k => k !== kw);
        setKeywords(updated);
        if (socket) socket.emit('set_alert_keywords', { keywords: updated });
        toast.success(`Keyword "${kw}" removed`);
    };

    const clearAlerts = () => {
        setAlerts([]);
        toast.success('Alert history cleared');
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-5">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div className="p-3 rounded-xl bg-red-500/20 text-red-400">
                            <Shield size={22} />
                        </div>
                        <div>
                            <h3 className="font-bold text-white">Security Alert System</h3>
                            <p className="text-xs text-slate-500">Get notified when banned keywords appear in employee window titles</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setAlertsEnabled(!alertsEnabled)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                            alertsEnabled ? 'bg-red-600/20 text-red-400 border border-red-500/30' : 'bg-slate-700 text-slate-400'
                        }`}
                    >
                        {alertsEnabled ? <Bell size={14} /> : <BellOff size={14} />}
                        {alertsEnabled ? 'Alerts ON' : 'Alerts OFF'}
                    </button>
                </div>

                {/* Keyword Input */}
                <div>
                    <label className="text-sm font-medium text-slate-400 mb-2 block">Add Banned Keyword / App Name</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder='e.g. "youtube", "facebook", "games"...'
                            value={newKeyword}
                            onChange={e => setNewKeyword(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addKeyword()}
                            className="flex-1 bg-slate-900 border border-slate-700 text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-red-500 transition-colors"
                        />
                        <button
                            onClick={addKeyword}
                            disabled={!newKeyword.trim()}
                            className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-40"
                        >
                            <Plus size={14} /> Add
                        </button>
                    </div>
                </div>

                {/* Keywords List */}
                {keywords.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                        {keywords.map(kw => (
                            <span key={kw} className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold px-3 py-1.5 rounded-full">
                                🚫 {kw}
                                <button onClick={() => removeKeyword(kw)} className="hover:text-red-300 ml-1">
                                    <X size={10} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Alerts History */}
            <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 overflow-hidden">
                <div className="px-5 py-3 bg-slate-800/50 border-b border-slate-700/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={16} className="text-red-400" />
                        <span className="text-sm font-semibold text-slate-300">Alert History</span>
                        {alerts.length > 0 && (
                            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                                {alerts.length}
                            </span>
                        )}
                    </div>
                    {alerts.length > 0 && (
                        <button onClick={clearAlerts} className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1">
                            <Trash2 size={12} /> Clear All
                        </button>
                    )}
                </div>

                <div className="max-h-[500px] overflow-y-auto divide-y divide-slate-800">
                    {alerts.length === 0 ? (
                        <div className="text-center py-16 text-slate-600">
                            <Shield size={40} className="mx-auto mb-3 opacity-30" />
                            <p>No alerts triggered yet.</p>
                            <p className="text-xs mt-1">Add keywords above and wait for detection.</p>
                        </div>
                    ) : (
                        alerts.map(alert => (
                            <div key={alert.id} className="p-4 hover:bg-slate-800/30 transition-colors">
                                <div className="flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <AlertTriangle size={14} className="text-red-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-semibold text-white text-sm">{alert.employeeName}</span>
                                            <span className="text-slate-500 text-xs">·</span>
                                            <span className="text-slate-500 text-xs">{alert.pcName}</span>
                                        </div>
                                        <p className="text-sm text-slate-300 mb-1">
                                            Keyword detected: <span className="text-red-400 font-bold">"{alert.keyword}"</span>
                                        </p>
                                        <p className="text-xs text-slate-500 truncate">Window: {alert.windowTitle}</p>
                                        <p className="text-[10px] text-slate-600 mt-1">{new Date(alert.timestamp).toLocaleString()}</p>
                                    </div>
                                    {alert.screenshot && (
                                        <img
                                            src={alert.screenshot}
                                            alt="Alert screenshot"
                                            className="w-24 h-14 object-cover rounded-lg border border-slate-700 cursor-pointer hover:opacity-80"
                                            onClick={() => window.open(alert.screenshot, '_blank')}
                                        />
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default AlertSystem;
