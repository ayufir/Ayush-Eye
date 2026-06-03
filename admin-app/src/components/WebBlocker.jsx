import React, { useState } from 'react';
import { Globe, Plus, X, Shield, Users, ShieldAlert } from 'lucide-react';
import useStore from '../store';
import { toast } from 'react-hot-toast';

const PRESET_SITES = [
    'facebook.com', 'instagram.com', 'youtube.com', 'twitter.com', 'tiktok.com',
    'reddit.com', 'netflix.com', 'snapchat.com', 'whatsapp.com', 'telegram.org'
];

const WebBlocker = ({ socket }) => {
    const { employees } = useStore();
    const [blockedSites, setBlockedSites] = useState([]);
    const [newSite, setNewSite] = useState('');
    const [targetEmployee, setTargetEmployee] = useState('all');

    const onlineEmployees = employees.filter(e => e.status === 'online');

    const addSite = (domain) => {
        const cleanDomain = domain.trim().toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .split('/')[0];
        
        if (!cleanDomain || blockedSites.includes(cleanDomain)) return;
        const updated = [...blockedSites, cleanDomain];
        setBlockedSites(updated);
        setNewSite('');
        applyBlocking(updated);
        toast.success(`🚫 ${cleanDomain} blocked!`);
    };

    const removeSite = (domain) => {
        const updated = blockedSites.filter(s => s !== domain);
        setBlockedSites(updated);
        applyBlocking(updated);
        toast.success(`✅ ${domain} unblocked`);
    };

    const applyBlocking = (domains) => {
        if (!socket) return;
        socket.emit('set_blocked_sites', {
            domains,
            employeeSocketId: targetEmployee !== 'all' ? targetEmployee : null
        });
    };

    const clearAll = () => {
        setBlockedSites([]);
        applyBlocking([]);
        toast.success('All sites unblocked');
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-5">
                <div className="flex items-center gap-3 mb-5">
                    <div className="p-3 rounded-xl bg-amber-500/20 text-amber-400">
                        <Globe size={22} />
                    </div>
                    <div>
                        <h3 className="font-bold text-white">Website Blocker</h3>
                        <p className="text-xs text-slate-500">Block websites on employee PCs via Windows HOSTS file</p>
                    </div>
                </div>

                {/* Target Employee */}
                <div className="mb-4">
                    <label className="text-sm font-medium text-slate-400 mb-2 block flex items-center gap-1.5">
                        <Users size={14} /> Apply To
                    </label>
                    <select
                        value={targetEmployee}
                        onChange={e => setTargetEmployee(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-amber-500"
                    >
                        <option value="all">🌐 All Employees (Global)</option>
                        {onlineEmployees.map(emp => (
                            <option key={emp.socketId} value={emp.socketId}>{emp.name} — {emp.pcName}</option>
                        ))}
                    </select>
                </div>

                {/* Add Site Input */}
                <div>
                    <label className="text-sm font-medium text-slate-400 mb-2 block">Add Website to Block</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder='e.g. facebook.com, youtube.com...'
                            value={newSite}
                            onChange={e => setNewSite(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addSite(newSite)}
                            className="flex-1 bg-slate-900 border border-slate-700 text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-amber-500 transition-colors"
                        />
                        <button
                            onClick={() => addSite(newSite)}
                            disabled={!newSite.trim()}
                            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-40"
                        >
                            <Plus size={14} /> Block
                        </button>
                    </div>
                </div>

                {/* Quick Presets */}
                <div className="mt-4">
                    <p className="text-xs text-slate-500 mb-2">Quick Block Presets:</p>
                    <div className="flex flex-wrap gap-2">
                        {PRESET_SITES.map(site => (
                            <button
                                key={site}
                                onClick={() => addSite(site)}
                                disabled={blockedSites.includes(site)}
                                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                                    blockedSites.includes(site)
                                        ? 'border-red-500/40 bg-red-500/10 text-red-400 cursor-not-allowed'
                                        : 'border-slate-700 text-slate-400 hover:border-amber-500/50 hover:text-amber-400'
                                }`}
                            >
                                {blockedSites.includes(site) ? '🚫' : '+'} {site}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Blocked Sites List */}
            <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 overflow-hidden">
                <div className="px-5 py-3 bg-slate-800/50 border-b border-slate-700/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShieldAlert size={16} className="text-amber-400" />
                        <span className="text-sm font-semibold text-slate-300">Blocked Websites</span>
                        <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {blockedSites.length}
                        </span>
                    </div>
                    {blockedSites.length > 0 && (
                        <button onClick={clearAll} className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1">
                            <X size={12} /> Unblock All
                        </button>
                    )}
                </div>

                <div className="p-5">
                    {blockedSites.length === 0 ? (
                        <div className="text-center py-12 text-slate-600">
                            <Globe size={40} className="mx-auto mb-3 opacity-30" />
                            <p>No websites blocked yet.</p>
                            <p className="text-xs mt-1">Add sites above to restrict employee access.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {blockedSites.map(site => (
                                <div key={site} className="flex items-center justify-between bg-slate-900 border border-red-500/20 rounded-xl px-3 py-2.5 group">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-red-400 text-xs">🚫</span>
                                        <span className="text-slate-300 text-xs font-medium truncate">{site}</span>
                                    </div>
                                    <button
                                        onClick={() => removeSite(site)}
                                        className="ml-2 p-0.5 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all flex-shrink-0"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {blockedSites.length > 0 && (
                    <div className="px-5 pb-4">
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                            <p className="text-xs text-amber-400 flex items-start gap-2">
                                <Shield size={12} className="mt-0.5 flex-shrink-0" />
                                Websites are blocked by modifying the Windows HOSTS file on employee PCs. Changes take effect immediately — employees must clear browser cache for some sites.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WebBlocker;
