import React, { useEffect, useState } from 'react';
import { getToken, getUser } from '../utils/auth';

const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000'
  : 'https://ayush-eye-1.onrender.com';

const Screenshots = ({ socket }) => {
    const [screenshots, setScreenshots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterName, setFilterName] = useState('');
    const [autoEnabled, setAutoEnabled] = useState(getUser()?.autoScreenshotsEnabled !== false);

    const handleToggle = () => {
        const newValue = !autoEnabled;
        setAutoEnabled(newValue);
        
        const user = getUser();
        if (user) {
            user.autoScreenshotsEnabled = newValue;
            localStorage.setItem('user', JSON.stringify(user));
        }
        
        if (socket) {
            socket.emit('toggle_auto_screenshots', { enabled: newValue });
        }
    };

    useEffect(() => {
        const fetchScreenshots = async () => {
            try {
                const res = await fetch(`${BACKEND_URL}/api/screenshots`, {
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });
                const data = await res.json();
                if (Array.isArray(data)) {
                    setScreenshots(data);
                }
            } catch (err) {
                console.error('Failed to fetch screenshots:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchScreenshots();
        
        // Refresh every 10 minutes to auto-load new ones
        const interval = setInterval(fetchScreenshots, 600000);
        return () => clearInterval(interval);
    }, []);

    const filtered = screenshots.filter(s => 
        s.employeeName?.toLowerCase().includes(filterName.toLowerCase()) ||
        s.pcName?.toLowerCase().includes(filterName.toLowerCase())
    );

    if (loading) {
        return <div className="text-slate-400 flex items-center justify-center h-full">Loading historical screenshots...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-slate-800/50 p-4 rounded-xl border border-slate-700/60">
                <div className="flex items-center gap-6">
                    <div>
                        <h3 className="text-white font-semibold">Automated Background Screenshots</h3>
                        <p className="text-xs text-slate-400">Screenshots are captured automatically every 10 minutes.</p>
                    </div>
                    <div className="flex items-center gap-2 border-l border-slate-700 pl-6">
                        <button 
                            onClick={handleToggle}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${autoEnabled ? 'bg-blue-600' : 'bg-slate-600'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                        <span className={`text-xs font-bold ${autoEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>{autoEnabled ? 'ON' : 'OFF'}</span>
                    </div>
                </div>
                <input 
                    type="text" 
                    placeholder="Search by Employee Name..." 
                    className="bg-slate-900 border border-slate-700 text-sm text-white rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500 w-64"
                    value={filterName}
                    onChange={e => setFilterName(e.target.value)}
                />
            </div>

            {filtered.length === 0 ? (
                <div className="text-center py-20 text-slate-500">
                    <p className="text-lg mb-2">No screenshots found</p>
                    <p className="text-sm">Wait for the background agent to capture the first batch.</p>
                </div>
            ) : (
                <div className="space-y-10">
                    {Object.entries(
                        filtered.reduce((acc, ss) => {
                            const name = ss.employeeName || 'Unknown Employee';
                            if (!acc[name]) acc[name] = [];
                            acc[name].push(ss);
                            return acc;
                        }, {})
                    ).map(([employeeName, empScreenshots]) => (
                        <div key={employeeName} className="space-y-4 bg-[#1e293b]/30 p-6 rounded-2xl border border-slate-700/50">
                            <h4 className="text-xl font-bold text-slate-200 border-b border-slate-700/50 pb-3 flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm">
                                    {employeeName.charAt(0)}
                                </div>
                                {employeeName}
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                {empScreenshots.map(ss => {
                                    const date = new Date(ss.takenAt);
                                    return (
                                        <div key={ss._id} className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700/60 shadow-lg hover:shadow-xl transition-all group">
                                            <div className="aspect-video bg-black relative overflow-hidden">
                                                <img 
                                                    src={ss.image} 
                                                    alt="Screenshot" 
                                                    className="w-full h-full object-contain opacity-90 group-hover:opacity-100 transition-opacity cursor-pointer"
                                                    onClick={() => window.open(ss.image, '_blank')}
                                                />
                                            </div>
                                            <div className="p-4">
                                                <p className="text-xs text-slate-400 mb-3 truncate font-medium">💻 PC: {ss.pcName || 'Unknown'}</p>
                                                
                                                <div className="flex justify-between items-center text-[11px] font-mono text-slate-400 bg-slate-900/80 px-3 py-2 rounded-lg border border-slate-700/50">
                                                    <span>{date.toLocaleDateString()}</span>
                                                    <span className="text-blue-400 font-bold tracking-wide">{date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default Screenshots;
