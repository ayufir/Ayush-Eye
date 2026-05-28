import React, { useState } from 'react';
import { 
    Download, Copy, CheckCheck, Monitor, Shield, 
    AlertCircle, FolderOpen, Info, Link2, Save,
    Wifi, Key, User, Globe, Laptop
} from 'lucide-react';
import { getUser } from '../utils/auth';
import { toast } from 'react-hot-toast';

// Check if running in Electron (preload exposes window.electronAPI)
const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

// LocalStorage key for custom download URL
const DOWNLOAD_URL_KEY = 'sentinel_agent_download_url';

const AgentDownload = () => {
    const user = getUser();
    const adminId = user?.id || '';
    const [copied, setCopied] = useState(false);
    const [downloading, setDownloading] = useState(false);

    // Custom download URL (for browser/Render version)
    const [customUrl, setCustomUrl] = useState(() => localStorage.getItem(DOWNLOAD_URL_KEY) || '');
    const [editingUrl, setEditingUrl] = useState(false);
    const [urlDraft, setUrlDraft] = useState('');

    const handleCopyId = () => {
        navigator.clipboard.writeText(adminId);
        setCopied(true);
        toast.success('Admin ID copied! Ab employee ke agent setup mein paste karo.');
        setTimeout(() => setCopied(false), 3000);
    };

    // ─── Save custom URL ──────────────────────────────────────────────────────
    const handleSaveUrl = () => {
        const url = urlDraft.trim();
        if (!url) {
            toast.error('Link paste karo pehle.');
            return;
        }
        localStorage.setItem(DOWNLOAD_URL_KEY, url);
        setCustomUrl(url);
        setEditingUrl(false);
        toast.success('✅ Download link save ho gaya!');
    };

    // ─── Electron: Save dist.zip via "Save As" dialog ────────────────────────
    const handleElectronDownload = async () => {
        setDownloading(true);
        try {
            const result = await window.electronAPI.downloadAgentZip();
            if (result.success) {
                toast.success('✅ SentinelAgent.zip save ho gaya!');
            } else if (result.message !== 'Canceled') {
                toast.error('Error: ' + result.message);
            }
        } catch (err) {
            toast.error('Download failed: ' + err.message);
        } finally {
            setDownloading(false);
        }
    };

    // ─── Electron: Open folder in Explorer ───────────────────────────────────
    const handleOpenFolder = async () => {
        const result = await window.electronAPI.openAgentFolder();
        if (result.success) {
            toast.success('📂 Explorer mein dist.zip ka folder khul gaya!');
        } else {
            toast.error('File nahi mili: ' + result.message);
        }
    };

    const serverUrl = 'https://ayush-eye-1.onrender.com';

    const colorMap = {
        blue:   'bg-blue-500/10 text-blue-400',
        violet: 'bg-violet-500/10 text-violet-400',
        emerald:'bg-emerald-500/10 text-emerald-400',
        amber:  'bg-amber-500/10 text-amber-400',
    };

    // ─── Step 1 UI: Different for Electron vs Browser ────────────────────────
    const renderDownloadStep = () => {
        if (isElectron) {
            // Electron mode: direct file access
            return (
                <div className="flex flex-wrap gap-3 mt-2">
                    <button
                        onClick={handleElectronDownload}
                        disabled={downloading}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                    >
                        <Download size={16} />
                        {downloading ? 'Saving...' : 'Save SentinelAgent.zip'}
                    </button>
                    <button
                        onClick={handleOpenFolder}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-semibold transition-all active:scale-95"
                    >
                        <FolderOpen size={16} /> Open in Explorer
                    </button>
                </div>
            );
        }

        // Browser/Render mode: use custom URL
        return (
            <div className="mt-3 space-y-3">
                {/* Mode indicator */}
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-700/50">
                    <Globe size={13} className="text-blue-400" />
                    <span>Browser mode — apna agent ZIP ka link yahan save karo, employees directly download kar sakenge</span>
                </div>

                {customUrl && !editingUrl ? (
                    // URL is set — show download button + edit option
                    <div className="flex flex-wrap items-center gap-3">
                        <a
                            href={customUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-600/20 transition-all active:scale-95"
                        >
                            <Download size={16} /> Download Agent (.zip)
                        </a>
                        <button
                            onClick={() => { setUrlDraft(customUrl); setEditingUrl(true); }}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm font-medium transition-all"
                        >
                            <Link2 size={14} /> Change Link
                        </button>
                    </div>
                ) : (
                    // No URL set or editing — show input
                    <div className="space-y-2">
                        <div className="flex gap-2">
                            <input
                                type="url"
                                value={editingUrl ? urlDraft : ''}
                                onChange={e => setUrlDraft(e.target.value)}
                                placeholder="https://drive.google.com/... ya koi bhi download link"
                                className="flex-1 px-4 py-2.5 bg-[#0f172a] border border-slate-600 focus:border-blue-500 rounded-xl text-slate-200 text-sm placeholder-slate-600 outline-none transition-colors"
                                onFocus={() => { if (!editingUrl) { setEditingUrl(true); setUrlDraft(customUrl); }}}
                            />
                            <button
                                onClick={handleSaveUrl}
                                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all active:scale-95 flex-shrink-0"
                            >
                                <Save size={14} /> Save
                            </button>
                        </div>
                        <div className="bg-[#0f172a] border border-slate-700 rounded-xl p-3 space-y-1.5 text-xs text-slate-400">
                            <p className="font-semibold text-slate-300 mb-1">📌 dist.zip upload karne ke steps:</p>
                            <p>1. <strong className="text-slate-200">Google Drive</strong> kholo → dist.zip upload karo</p>
                            <p>2. File pe right-click → <strong className="text-slate-200">"Share"</strong> → <strong className="text-slate-200">"Anyone with the link"</strong></p>
                            <p>3. Link copy karo aur upar input mein paste karo</p>
                            <p className="text-emerald-400">✅ Employees us link se directly download kar sakenge</p>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const steps = [
        {
            icon: Download,
            color: 'blue',
            title: 'Step 1: Agent Download Karo',
            desc: isElectron
                ? 'Neeche diye button se SentinelAgent.zip apne Desktop ya kisi folder mein save karo.'
                : 'Agent ZIP ka download link set karo taaki employees download kar sakein.',
            action: renderDownloadStep()
        },
        {
            icon: Key,
            color: 'violet',
            title: 'Step 2: Apna Admin ID Copy Karo',
            desc: 'Yeh ID employee ko dena hoga — iske bina agent connect nahi hoga.',
            action: (
                <div className="flex items-center gap-3 mt-2">
                    <div className="flex-1 px-4 py-3 bg-[#0f172a] border border-slate-700 rounded-xl font-mono text-sm text-blue-400 select-all break-all">
                        {adminId || 'Login karo pehle...'}
                    </div>
                    <button
                        onClick={handleCopyId}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 flex-shrink-0 ${
                            copied
                                ? 'bg-emerald-600 text-white'
                                : 'bg-violet-600 hover:bg-violet-500 text-white'
                        }`}
                    >
                        {copied ? <CheckCheck size={16} /> : <Copy size={16} />}
                        {copied ? 'Copied!' : 'Copy ID'}
                    </button>
                </div>
            )
        },
        {
            icon: User,
            color: 'emerald',
            title: 'Step 3: Employee ke PC pe Setup Karo',
            desc: 'ZIP file employee ko bhejo (WhatsApp/USB/Drive), unzip karein aur "Sentinel Agent.exe" run karein:',
            action: (
                <div className="mt-3 bg-[#0f172a] rounded-xl border border-slate-700 p-4 space-y-3">
                    {[
                        { label: 'Admin Invite Code', note: 'Wahi Admin ID paste karo jo aapne step 2 mein copy ki' },
                        { label: 'Your Name', note: 'Employee apna naam likhe (e.g. "Rahul Sharma")' },
                        { label: '"Connect & Start" dabao', note: 'Agent background mein chalu ho jayega', success: true },
                    ].map((item, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${item.success ? 'bg-emerald-600' : 'bg-blue-600'}`}>
                                {item.success ? '✓' : i + 1}
                            </span>
                            <div>
                                <p className="text-slate-300 text-sm font-medium">{item.label}</p>
                                <p className="text-slate-500 text-xs">{item.note}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )
        },
        {
            icon: Monitor,
            color: 'emerald',
            title: 'Step 4: Dashboard pe Check Karo',
            desc: 'Employee connect hone ke baad "Employees" tab ya "Live Monitoring" mein dikh jayega.',
            action: (
                <div className="mt-2 flex items-center gap-2 text-emerald-400 text-sm font-medium bg-emerald-500/10 px-4 py-2.5 rounded-xl border border-emerald-500/20">
                    <Wifi size={16} />
                    Employee automatically aapke dashboard mein dikhne lagega
                </div>
            )
        }
    ];

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">

            {/* Mode Badge */}
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold border ${
                isElectron
                    ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}>
                {isElectron ? <Laptop size={14} /> : <Globe size={14} />}
                {isElectron ? 'Electron App Mode — Direct file access available' : 'Browser Mode — Custom download link required'}
            </div>

            {/* Header Card */}
            <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-6">
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400">
                        <Shield size={28} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Employee Agent Setup</h2>
                        <p className="text-slate-400 text-sm">Employee ke PC pe Sentinel Agent install karo</p>
                    </div>
                </div>
                <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                    <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-amber-400/80 text-xs leading-relaxed">
                        Employee ke PC pe agent install hone ke baad unhe sirf ek baar <strong>aapka Admin ID</strong> enter karna hoga. 
                        Uske baad agent automatically background mein run hoga — employee ko kuch pata nahi chalega.
                    </p>
                </div>
            </div>

            {/* Admin ID Highlight Box */}
            <div className="bg-gradient-to-br from-violet-500/10 to-blue-500/10 rounded-2xl border border-violet-500/30 p-6">
                <div className="flex items-center gap-3 mb-3">
                    <Key size={18} className="text-violet-400" />
                    <h3 className="text-white font-bold">Aapka Admin ID — Employees ko yeh share karo</h3>
                </div>
                <div className="flex items-center gap-3">
                    <code className="flex-1 px-4 py-3.5 bg-[#0f172a] border border-violet-500/30 rounded-xl font-mono text-blue-400 text-sm break-all select-all">
                        {adminId || 'Login karo Admin ID dekhne ke liye'}
                    </code>
                    <button
                        onClick={handleCopyId}
                        className={`flex items-center gap-2 px-5 py-3.5 rounded-xl text-sm font-bold transition-all active:scale-95 flex-shrink-0 ${
                            copied
                                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                                : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20'
                        }`}
                    >
                        {copied ? <CheckCheck size={16} /> : <Copy size={16} />}
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                <p className="text-slate-500 text-xs mt-2 flex items-center gap-1.5">
                    <Info size={12} />
                    Yeh ID WhatsApp ya email se employee ko bhejo — setup ke waqt enter karna hoga
                </p>
            </div>

            {/* Step by Step Guide */}
            <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700/50">
                    <h3 className="font-bold text-white">Setup Guide — Step by Step</h3>
                </div>
                <div className="divide-y divide-slate-700/30">
                    {steps.map((step, i) => (
                        <div key={i} className="p-6">
                            <div className="flex items-start gap-4">
                                <div className={`p-2.5 rounded-xl flex-shrink-0 ${colorMap[step.color]}`}>
                                    <step.icon size={20} />
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-semibold text-slate-100 mb-1">{step.title}</h4>
                                    <p className="text-slate-400 text-sm">{step.desc}</p>
                                    {step.action}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Technical Info */}
            <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 p-5">
                <h3 className="font-semibold text-slate-300 text-sm mb-3 flex items-center gap-2">
                    <Info size={16} className="text-slate-500" /> Technical Info
                </h3>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#0f172a] rounded-xl p-3">
                        <p className="text-slate-500 text-xs mb-1">Backend Server</p>
                        <p className="text-blue-400 font-mono text-xs break-all">{serverUrl}</p>
                    </div>
                    <div className="bg-[#0f172a] rounded-xl p-3">
                        <p className="text-slate-500 text-xs mb-1">Admin Account</p>
                        <p className="text-slate-300 text-xs">{user?.name || 'N/A'} ({user?.email || 'N/A'})</p>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default AgentDownload;
