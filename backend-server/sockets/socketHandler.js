const jwt = require('jsonwebtoken');
const User = require('../models/User');

const activeEmployees = new Map();  // socketId -> employee data
const admins = new Set();           // admin socket IDs

const socketHandler = (io) => {
    // Debug helper: write activeEmployees to a file every 5 seconds
    setInterval(() => {
        require('fs').writeFileSync(
            require('path').join(__dirname, '../debug_employees.json'), 
            JSON.stringify({
                activeEmployees: Array.from(activeEmployees.values()),
                admins: Array.from(admins)
            }, null, 2)
        );
    }, 5000);

    io.on('connection', (socket) => {
        require('fs').appendFileSync(require('path').join(__dirname, '../admin_logs.txt'), `[${new Date().toISOString()}] Socket connected: ${socket.id} (IP: ${socket.handshake.address})\n`);
        console.log(`🔌 New Socket Connection: ${socket.id} (IP: ${socket.handshake.address})`);

        socket.on('identify', async (data) => {
            require('fs').appendFileSync(require('path').join(__dirname, '../admin_logs.txt'), `[${new Date().toISOString()}] Identify call: ${socket.id} | Data: ${JSON.stringify(data)}\n`);
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
                        require('fs').appendFileSync(require('path').join(__dirname, '../admin_logs.txt'), `[${new Date().toISOString()}] Superadmin Connected: ${user.email} | ID: ${user._id}\n`);
                    } else {
                        const orgRoom = `org_${user._id.toString()}`;
                        socket.join(orgRoom);
                        const orgEmployees = Array.from(activeEmployees.values())
                            .filter(emp => emp.adminId === socket.adminId);
                        socket.emit('initial_employee_list', orgEmployees);
                        console.log(`🛡️ Admin Connected: ${user.email} (Room: ${orgRoom})`);
                        require('fs').appendFileSync(require('path').join(__dirname, '../admin_logs.txt'), `[${new Date().toISOString()}] Admin Connected: ${user.email} | ID: ${user._id} | Found ${orgEmployees.length} employees\n`);
                    }
                } catch (err) {
                    console.error('❌ Auth Error:', err.message);
                    socket.emit('auth_error', { message: 'Authentication failed' });
                    require('fs').appendFileSync(require('path').join(__dirname, '../admin_logs.txt'), `[${new Date().toISOString()}] Auth Error: ${err.message}\n`);
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
                
                // Fetch and send auto screenshot setting
                try {
                    const adminUser = await User.findById(targetAdminId);
                    if (adminUser) {
                        socket.emit('auto_screenshot_setting', { enabled: adminUser.autoScreenshotsEnabled !== false });
                    }
                } catch (err) {
                    console.error('Error fetching admin settings:', err.message);
                }
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

        socket.on('toggle_auto_screenshots', async ({ enabled }) => {
            if (admins.has(socket.id) && socket.adminId) {
                try {
                    await User.findByIdAndUpdate(socket.adminId, { autoScreenshotsEnabled: enabled });
                    const orgRoom = `org_${socket.adminId}`;
                    io.to(orgRoom).emit('auto_screenshot_setting', { enabled });
                    console.log(`📸 Admin ${socket.adminId} toggled auto screenshots: ${enabled}`);
                } catch (e) {
                    console.error('Error toggling auto screenshots:', e);
                }
            }
        });

        socket.on('screenshot_result', ({ to, base64 }) => {
            io.to(to).emit('screenshot_result', { base64 });
        });

        socket.on('auto_screenshot', async ({ base64 }) => {
            const employee = activeEmployees.get(socket.id);
            if (!employee || !employee.adminId) return;

            try {
                const Screenshot = require('../models/Screenshot');
                const newScreenshot = new Screenshot({
                    adminId: employee.adminId,
                    employeeId: employee.id || socket.id,
                    employeeName: employee.name,
                    pcName: employee.pcName,
                    image: base64
                });
                await newScreenshot.save();
                console.log(`📸 Auto-Screenshot saved for ${employee.name}`);
            } catch (error) {
                console.error('Error saving auto screenshot:', error);
            }
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
            
            // Broadcast to the org room
            io.to(orgRoom).emit('meeting_invitation', { roomName, hostId: socket.id, hostName: 'Admin' });
            
            // If the user is a superadmin, also broadcast to all employees directly or via global_monitoring
            // Since employees don't join global_monitoring, we must iterate or just let them use the sidebar.
            // Wait, we can emit to all active employees that belong to this superadmin's view.
            if (admins.has(socket.id) && socket.role === 'superadmin') {
                for (const emp of activeEmployees.values()) {
                    io.to(emp.socketId).emit('meeting_invitation', { roomName, hostId: socket.id, hostName: 'SuperAdmin' });
                }
                console.log(`📡 SuperAdmin Meeting Broadcasted to all online employees.`);
            }
        });

        socket.on('invite_employee_to_meeting', ({ employeeSocketId, roomName }) => {
            console.log(`📡 Direct Invitation: Admin invites employee ${employeeSocketId} to "${roomName}"`);
            io.to(employeeSocketId).emit('meeting_invitation', { roomName, hostId: socket.id, hostName: 'Admin' });
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

        socket.on('send_meeting_chat', ({ text }) => {
            const user = activeEmployees.get(socket.id) || { name: 'Admin', adminId: socket.adminId };
            const orgRoom = `org_${socket.adminId || user.adminId}`;
            console.log(`💬 Meeting Chat [${orgRoom}]: ${user.name}: ${text}`);
            socket.to(orgRoom).emit('meeting_chat_message', { sender: user.name, text });
        });

        socket.on('employee_request_meeting', () => {
            const employee = activeEmployees.get(socket.id);
            if (!employee || !employee.adminId) return;
            const orgRoom = `org_${employee.adminId}`;
            console.log(`📞 Employee requesting meeting: ${employee.name} (Socket: ${socket.id})`);
            socket.to(orgRoom).emit('employee_meeting_requested', {
                employeeSocketId: socket.id,
                employeeName: employee.name
            });
        });

        socket.on('decline_meeting_request', ({ to }) => {
            console.log(`❌ Admin declined meeting request for employee: ${to}`);
            io.to(to).emit('meeting_declined');
        });

        socket.on('end_meeting', () => {
            const user = activeEmployees.get(socket.id) || { adminId: socket.adminId };
            const orgRoom = `org_${socket.adminId || user.adminId}`;
            console.log(`🛑 Meeting Ended in ${orgRoom}`);
            socket.to(orgRoom).emit('meeting_ended');
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
