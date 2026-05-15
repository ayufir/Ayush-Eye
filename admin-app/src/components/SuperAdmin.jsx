import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, 
  UserPlus, 
  Calendar, 
  ShieldCheck, 
  ShieldAlert, 
  X,
  Loader2,
  Clock,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { logout } from '../utils/auth';

export default function SuperAdmin() {
  const [admins, setAdmins] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ name: '', email: '', password: '', expiryDate: '' });

  const fetchAdmins = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/admin/list', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      if (response.ok) {
        setAdmins(data);
      } else {
        toast.error(data.message);
        if (response.status === 401) window.location.href = '/login';
      }
    } catch (error) {
      toast.error('Failed to fetch admins');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:5000/api/admin/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(newAdmin)
      });
      const data = await response.json();
      if (response.ok) {
        toast.success('Admin created successfully');
        setShowAddModal(false);
        setNewAdmin({ name: '', email: '', password: '', expiryDate: '' });
        fetchAdmins();
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error('Failed to create admin');
    }
  };

  const toggleStatus = async (id) => {
    try {
      const response = await fetch(`http://localhost:5000/api/admin/${id}/toggle-status`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (response.ok) {
        toast.success('Status updated');
        fetchAdmins();
      }
    } catch (error) {
      toast.error('Update failed');
    }
  };

  const extendExpiry = async (id, currentExpiry) => {
    const newDate = prompt('Enter new expiry date (YYYY-MM-DD):', currentExpiry ? new Date(currentExpiry).toISOString().split('T')[0] : '');
    if (!newDate) return;

    try {
      const response = await fetch(`http://localhost:5000/api/admin/${id}/extend-expiry`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ newExpiry: newDate })
      });
      if (response.ok) {
        toast.success('Expiry updated');
        fetchAdmins();
      }
    } catch (error) {
      toast.error('Update failed');
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 p-6 md:p-12">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
          <div>
            <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <ShieldCheck size={20} className="text-white" />
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight">SUPERADMIN CONTROL</h1>
            </div>
            <p className="text-slate-500 text-sm">Manage client administrator access and licenses</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 font-medium"
            >
              <UserPlus size={18} /> Add New Admin
            </button>
            <button 
              onClick={logout}
              className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-slate-400 rounded-xl hover:bg-red-600 hover:text-white transition-all font-medium border border-slate-700"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {[
            { label: 'Total Admins', value: admins.length, icon: Users, color: 'text-blue-400', bg: 'bg-blue-400/10' },
            { label: 'Active Licenses', value: admins.filter(a => a.isActive).length, icon: ShieldCheck, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
            { label: 'Expired Licenses', value: admins.filter(a => a.expiryDate && new Date(a.expiryDate) < new Date()).length, icon: ShieldAlert, color: 'text-red-400', bg: 'bg-red-400/10' }
          ].map((stat, i) => (
            <div key={i} className="bg-[#1e293b] border border-slate-700/50 p-6 rounded-2xl shadow-xl">
                <div className="flex items-center gap-4 mb-4">
                    <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                        <stat.icon size={20} />
                    </div>
                    <h3 className="font-semibold text-slate-400">{stat.label}</h3>
                </div>
                <p className="text-3xl font-bold text-white">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-semibold">Admin Name</th>
                  <th className="px-6 py-4 font-semibold">Organization Key</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">Expiry Date</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {isLoading ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-20 text-center">
                      <Loader2 className="animate-spin mx-auto text-blue-500" size={40} />
                    </td>
                  </tr>
                ) : admins.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-20 text-center text-slate-500">No admins found. Add your first client admin.</td>
                  </tr>
                ) : admins.map((admin) => (
                  <tr key={admin._id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-sm">
                              {admin.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                              <p className="font-semibold text-slate-100">{admin.name}</p>
                              <p className="text-xs text-slate-500">{admin.email}</p>
                          </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-xs bg-slate-900 px-3 py-1.5 rounded-lg text-blue-400 border border-slate-700 font-mono">{admin._id}</code>
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => toggleStatus(admin._id)}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          admin.isActive 
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}
                      >
                        {admin.isActive ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Clock size={14} />
                        {admin.expiryDate ? new Date(admin.expiryDate).toLocaleDateString() : 'Never'}
                        {admin.expiryDate && new Date(admin.expiryDate) < new Date() && (
                          <span className="text-red-500 text-[10px] font-bold ml-2">EXPIRED</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => extendExpiry(admin._id, admin.expiryDate)}
                        className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-xl transition-all"
                        title="Manage License"
                      >
                        <Calendar size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#1e293b] border border-slate-700/60 max-w-md w-full p-8 rounded-3xl shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-bold text-white">Create New Admin</h3>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateAdmin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Full Name</label>
                  <input 
                    type="text" required
                    value={newAdmin.name}
                    onChange={e => setNewAdmin({...newAdmin, name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Client Admin Name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Email Address</label>
                  <input 
                    type="email" required
                    value={newAdmin.email}
                    onChange={e => setNewAdmin({...newAdmin, email: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="admin@client.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Password</label>
                  <input 
                    type="password" required
                    value={newAdmin.password}
                    onChange={e => setNewAdmin({...newAdmin, password: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Expiry Date</label>
                  <input 
                    type="date" 
                    value={newAdmin.expiryDate}
                    onChange={e => setNewAdmin({...newAdmin, expiryDate: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-slate-700 bg-slate-900 text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold mt-4 shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98]"
                >
                  Create Client Account
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
