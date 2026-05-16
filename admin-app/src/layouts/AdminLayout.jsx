import React, { useState } from 'react';
import { 
    LayoutDashboard, Users, Monitor, Image as ImageIcon, 
    FileText, Settings, Bell, ShieldAlert, Activity, LogOut 
} from 'lucide-react';
import { getUser, logout } from '../utils/auth';

const AdminLayout = ({ children, activeTab, setActiveTab, employees, notifications, connectionStatus }) => {
    const user = getUser();

    const menuItems = [
        { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
        { id: 'employees', icon: Users, label: 'Employees' },
        { id: 'monitoring', icon: Monitor, label: 'Live Monitoring', badge: employees.filter(e => e.status === 'online').length },
        { id: 'screenshots', icon: ImageIcon, label: 'Screenshots' },
        { id: 'logs', icon: FileText, label: 'Activity Logs' },
        { id: 'settings', icon: Settings, label: 'Settings' },
    ];

    return (
        <div className="flex h-screen bg-[#0f172a] text-slate-100 overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
            {/* Sidebar */}
            <aside className="w-64 bg-[#1e293b] border-r border-slate-800/60 flex flex-col flex-shrink-0">
                <div className="p-5 border-b border-slate-800/60">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/40">
                            <ShieldAlert size={20} className="text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white tracking-tight">SENTINEL</h1>
                            <p className="text-[10px] text-slate-500 font-medium tracking-widest uppercase">Enterprise Monitor</p>
                        </div>
                    </div>
                </div>

                <div className="mx-4 mt-4 px-3 py-2 rounded-lg bg-slate-900/50 flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                        connectionStatus === 'connected' ? 'bg-emerald-500' :
                        connectionStatus === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'
                    }`} />
                    <span className="text-xs text-slate-400 capitalize font-medium">{connectionStatus}</span>
                </div>

                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {menuItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                                activeTab === item.id
                                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700/60'
                            }`}
                        >
                            <item.icon size={18} />
                            <span className="flex-1 text-left">{item.label}</span>
                            {item.badge > 0 && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                    activeTab === item.id ? 'bg-white/20 text-white' : 'bg-emerald-500/20 text-emerald-400'
                                }`}>
                                    {item.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </nav>

                <div className="p-4 border-t border-slate-800/60 space-y-2">
                    <div className="flex items-center gap-3 px-2">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-sm font-bold shadow-lg">
                            {user?.name?.charAt(0) || 'A'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-slate-100 truncate">{user?.name || 'Admin User'}</p>
                            <p className="text-[10px] text-blue-400 font-mono tracking-tighter select-all" title="Click to copy Admin ID">ID: {user?.id}</p>
                        </div>
                    </div>
                    <button 
                        onClick={() => { if(confirm('Logout?')) logout(); }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-400/10 transition-all"
                    >
                        <LogOut size={16} /> Logout
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-[#1e293b]/50 border-b border-slate-800/60 px-6 py-3.5 flex items-center justify-between backdrop-blur-sm flex-shrink-0">
                    <div>
                        <h2 className="text-base font-semibold text-slate-100 capitalize">{activeTab.replace('-', ' ')}</h2>
                        <p className="text-xs text-slate-500">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button className="relative p-2 hover:bg-slate-700/60 rounded-xl transition-colors">
                            <Bell size={18} className="text-slate-400" />
                            {notifications.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />}
                        </button>
                        <button className="p-2 hover:bg-slate-700/60 rounded-xl transition-colors">
                            <Activity size={18} className="text-slate-400" />
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-6 bg-[#0f172a]">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
