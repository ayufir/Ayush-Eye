const jwt = require('jsonwebtoken');
const User = require('../models/User');

const activeEmployees = new Map();  // socketId -> employee data
const admins = new Set();           // admin socket IDs

const socketHandler = (io) => {
    io.on('connection', (socket) => {
        console.log(`🔌 New Socket Connection: ${socket.id} (IP: ${socket.handshake.address})`);

        socket.on('identify', async (data) => {
            console.log(`📡 [${socket.id}] Identify Data:`, JSON.stringify(data));
            const { role, adminId, token, name, employeeName } = data;
            
            if (role === 'admin' || role === 'superadmin') {
                try {
                    if (!token) throw new Error('No token provided');
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    const user = await User.findById(decoded.id);

                    if (!user || !user.isActive) {
                        return socket.emit('auth_error', { message: 'Account suspended' });
                    }

                    socket.adminId = user._id.toString();
                    socket.role = user.role;
                    admins.add(socket.id);

                    if (user.role === 'superadmin') {
                        socket.join('global_monitoring');
                        const allEmployees = Array.from(activeEmployees.values());
                        socket.emit('initial_employee_list', allEmployees);
                        console.log(`👑 Superadmin Connected: ${user.email} (Global Mode)`);
                    } else {
                        const orgRoom = `org_${user._id.toString()}`;
                        socket.join(orgRoom);
                        const orgEmployees = Array.from(activeEmployees.values())
                            .filter(emp => emp.adminId === socket.adminId);
                        socket.emit('initial_employee_list', orgEmployees);
                        console.log(`🛡️ Admin Connected: ${user.email} (Room: ${orgRoom})`);
                    }
                } catch (err) {
                    console.error('❌ Auth Error:', err.message);
                    socket.emit('auth_error', { message: 'Authentication failed' });
                }
            } else if (role === 'employee' || !role) {
                const targetAdminId = adminId || data.adminId;
                const empName = employeeName || name || 'Unknown Employee';

                if (!targetAdminId) return;

                const employeeData = {
                    ...data,
                    adminId: targetAdminId,
                    name: empName,
                    socketId: socket.id,
                    status: 'online',
                    connectedAt: new Date()
                };

                activeEmployees.set(socket.id, employeeData);
                const orgRoom = `org_${targetAdminId}`;
                socket.join(orgRoom);

                console.log(`👤 Employee Online: ${empName} (Admin: ${targetAdminId})`);
                io.to(orgRoom).emit('employee_joined', employeeData);
                io.to('global_monitoring').emit('employee_joined', employeeData);
            }
        });

        socket.on('employee_identify', (data) => {
            socket.emit('identify', { ...data, role: 'employee' });
        });

        socket.on('rtc_signal', ({ to, signal }) => {
            io.to(to).emit('rtc_signal', { from: socket.id, signal });
            console.log(`📡 Signal forwarded: ${signal.type} from ${socket.id} → ${to}`);
        });

        socket.on('intercom_signal', ({ to, signal }) => {
            io.to(to).emit('intercom_signal', { from: socket.id, signal });
            console.log(`🎤 Intercom signal: ${signal.type} from ${socket.id} → ${to}`);
        });

        socket.on('remote_control', ({ to, action, data }) => {
            io.to(to).emit('remote_control', { from: socket.id, action, data });
        });

        socket.on('screenshot_result', ({ to, base64 }) => {
            io.to(to).emit('screenshot_result', { base64 });
        });

        socket.on('request_view', ({ employeeSocketId }) => {
            if (admins.has(socket.id) && activeEmployees.has(employeeSocketId)) {
                io.to(employeeSocketId).emit('view_request', { adminId: socket.id });
                console.log(`📺 View request: Admin ${socket.id} → Employee ${employeeSocketId}`);
            }
        });

        socket.on('activity_log', (data) => {
            const employee = activeEmployees.get(socket.id);
            if (employee && employee.adminId) {
                const logData = { ...data, employeeId: employee.id, socketId: socket.id };
                io.to(`org_${employee.adminId}`).emit('activity_update', logData);
            }
        });

        socket.on('start_meeting', ({ roomName }) => {
            const admin = activeEmployees.get(socket.id) || { adminId: socket.adminId };
            const orgRoom = `org_${socket.adminId || admin.adminId}`;
            console.log(`📡 Meeting Started: ${roomName} in ${orgRoom}`);
            io.to(orgRoom).emit('meeting_invitation', { roomName, hostId: socket.id, hostName: 'Admin' });
        });

        socket.on('join_meeting', ({ hostId, roomName }) => {
            console.log(`👤 Participant Joined: ${socket.id} joins meeting of ${hostId}`);
            io.to(hostId).emit('participant_joined', {
                participantId: socket.id,
                name: activeEmployees.get(socket.id)?.name || 'Guest'
            });
        });

        socket.on('meeting_signal', ({ to, signal }) => {
            io.to(to).emit('meeting_signal', { from: socket.id, signal });
        });

        socket.on('disconnect', () => {
            if (activeEmployees.has(socket.id)) {
                const emp = activeEmployees.get(socket.id);
                activeEmployees.delete(socket.id);
                if (emp.adminId) {
                    io.to(`org_${emp.adminId}`).emit('employee_status_change', {
                        employeeId: emp.id,
                        socketId: socket.id,
                        status: 'offline'
                    });
                }
                console.log(`👤 Employee disconnected: ${emp.name}`);
            }
            if (admins.has(socket.id)) {
                admins.delete(socket.id);
                console.log(`🛡️ Admin disconnected: ${socket.id}`);
            }
            console.log(`🔌 Disconnected: ${socket.id}`);
        });
    });

    return { activeEmployees, admins };
};

module.exports = socketHandler;
