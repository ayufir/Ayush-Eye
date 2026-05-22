import React, { useEffect, useState } from 'react';
import { getToken } from '../utils/auth';

const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000'
  : 'https://ayush-eye-1.onrender.com';

const Screenshots = () => {
    const [screenshots, setScreenshots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterName, setFilterName] = useState('');

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
                <div>
                    <h3 className="text-white font-semibold">Automated Background Screenshots</h3>
                    <p className="text-xs text-slate-400">Screenshots are captured automatically every 10 minutes.</p>
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filtered.map(ss => {
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
                                    <h4 className="text-sm font-bold text-white truncate">{ss.employeeName || 'Unknown Employee'}</h4>
                                    <p className="text-xs text-slate-400 mb-2 truncate">PC: {ss.pcName || 'Unknown'}</p>
                                    
                                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 bg-slate-900/50 px-2 py-1.5 rounded-md">
                                        <span>{date.toLocaleDateString()}</span>
                                        <span className="text-blue-400 font-semibold">{date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Screenshots;
