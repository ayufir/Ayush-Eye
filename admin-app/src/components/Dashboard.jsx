import React from 'react';
import { Users, Monitor, Clock, TrendingUp } from 'lucide-react';
import useStore from '../store';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: '#1e293b',
            titleColor: '#94a3b8',
            bodyColor: '#f1f5f9',
            borderColor: '#334155',
            borderWidth: 1,
            padding: 12,
            displayColors: false
        }
    },
    scales: {
        x: { display: false },
        y: { display: false }
    }
};

const chartData = {
    labels: ['9AM', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM', '4PM', '5PM'],
    datasets: [{
        fill: true,
        data: [65, 78, 90, 85, 72, 88, 95, 92, 88],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
    }]
};

const StatCard = ({ label, value, icon: Icon, color, hasChart }) => (
    <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 hover:border-blue-500/30 transition-all group overflow-hidden">
        <div className="p-6">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl bg-opacity-10 ${color.bg} ${color.text}`}>
                    <Icon size={24} />
                </div>
                <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">+12%</span>
            </div>
            <h3 className="text-slate-400 text-sm font-medium mb-1">{label}</h3>
            <p className="text-2xl font-bold text-slate-100">{value}</p>
        </div>
        {hasChart && (
            <div className="h-16 w-full opacity-50 group-hover:opacity-100 transition-opacity">
                <Line options={chartOptions} data={chartData} />
            </div>
        )}
    </div>
);

const Dashboard = () => {
    const { employees, setSelectedEmployee } = useStore();
    const onlineCount = employees.filter(e => e.status === 'online').length;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard 
                    label="Total Employees" 
                    value={employees.length} 
                    icon={Users} 
                    color={{ bg: 'bg-blue-500', text: 'text-blue-400' }} 
                    hasChart={true}
                />
                <StatCard 
                    label="Active Now" 
                    value={onlineCount} 
                    icon={Monitor} 
                    color={{ bg: 'bg-emerald-500', text: 'text-emerald-400' }} 
                    hasChart={true}
                />
                <StatCard 
                    label="Average Work Hours" 
                    value="7h 42m" 
                    icon={Clock} 
                    color={{ bg: 'bg-amber-500', text: 'text-amber-400' }} 
                    hasChart={true}
                />
                <StatCard 
                    label="Productivity Score" 
                    value="84%" 
                    icon={TrendingUp} 
                    color={{ bg: 'bg-violet-500', text: 'text-violet-400' }} 
                    hasChart={true}
                />
            </div>

            <div className="bg-[#1e293b] rounded-2xl border border-slate-700/50 overflow-hidden">
                <div className="p-6 border-b border-slate-700/50 flex justify-between items-center">
                    <h3 className="font-semibold text-lg">Online Employees</h3>
                    <button className="text-blue-500 text-sm font-medium hover:underline">View All</button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-800/50 text-slate-400 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Employee</th>
                                <th className="px-6 py-4 font-semibold">Status</th>
                                <th className="px-6 py-4 font-semibold">Active App</th>
                                <th className="px-6 py-4 font-semibold">Idle Time</th>
                                <th className="px-6 py-4 font-semibold">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {employees.map((emp) => (
                                <tr key={emp.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-xs">
                                                {emp.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="font-medium text-slate-200">{emp.name}</p>
                                                <p className="text-xs text-slate-500">{emp.pcName}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter ${
                                            emp.status === 'online' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'
                                        }`}>
                                            {emp.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-300">Visual Studio Code</td>
                                    <td className="px-6 py-4 text-sm text-slate-400">0m</td>
                                    <td className="px-6 py-4">
                                        <button 
                                            onClick={() => setSelectedEmployee(emp)}
                                            className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                                        >
                                            Monitor
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
