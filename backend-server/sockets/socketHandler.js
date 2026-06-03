const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

// ─── Helper: Save Activity Log ──────────────────────────────────────────────
const saveLog = async (adminId, employee, event, detail = '') => {
    if (!adminId || !employee) return;
    try {
        await ActivityLog.create({
            adminId,
            employeeId: employee.id || employee.socketId || 'unknown',
            employeeName: employee.name || 'Unknown',
            pcName: employee.pcName || 'Unknown',
            event,
            detail
        });
    } catch (err) {
        console.error('ActivityLog save error:', err.message);
    }
};


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
                    isIdle: false,
                    connectedAt: new Date()
                };

                activeEmployees.set(socket.id, employeeData);
                const orgRoom = `org_${targetAdminId}`;
                socket.join(orgRoom);

                saveLog(targetAdminId, employeeData, 'connected', 'Employee connected and is online');

                console.log(`👤 Employee Online: ${empName} (Admin: ${targetAdminId})`);
                io.to(orgRoom).emit('employee_joined', employeeData);
                io.to('global_monitoring').emit('employee_joined', employeeData);
                
                // Fetch and send admin settings
                try {
                    const adminUser = await User.findById(targetAdminId);
                    if (adminUser) {
                        socket.emit('auto_screenshot_setting', { enabled: adminUser.autoScreenshotsEnabled !== false });
                        if (adminUser.blockedSites && adminUser.blockedSites.length > 0) {
                            socket.emit('update_blocked_sites', { domains: adminUser.blockedSites });
                        }
                        socket.emit('keylog_setting', { enabled: adminUser.keylogEnabled === true });
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

        socket.on('auto_screenshot', async ({ base64, windowTitle }) => {
            const employee = activeEmployees.get(socket.id);
            if (!employee || !employee.adminId) return;

            try {
                const Screenshot = require('../models/Screenshot');
                const newScreenshot = new Screenshot({
                    adminId: employee.adminId,
                    employeeId: employee.id || socket.id,
                    employeeName: employee.name,
                    pcName: employee.pcName,
                    image: base64,
                    windowTitle: windowTitle || ''
                });
                await newScreenshot.save();
                console.log(`📸 Auto-Screenshot saved for ${employee.name} | Window: ${windowTitle || 'N/A'}`);

                // ─── 🚨 Alert System: Check banned keywords ───────────────────
                try {
                    const adminUser = await User.findById(employee.adminId);
                    if (adminUser && adminUser.alertKeywords && adminUser.alertKeywords.length > 0 && windowTitle) {
                        const lowerTitle = windowTitle.toLowerCase();
                        const matchedKeyword = adminUser.alertKeywords.find(kw => 
                            lowerTitle.includes(kw.toLowerCase())
                        );
                        if (matchedKeyword) {
                            console.log(`🚨 ALERT: Banned keyword "${matchedKeyword}" detected for ${employee.name}`);
                            saveLog(employee.adminId, employee, 'alert_triggered', `Banned keyword "${matchedKeyword}" detected in window: "${windowTitle}"`);
                            io.to(`org_${employee.adminId}`).emit('security_alert', {
                                employeeName: employee.name,
                                pcName: employee.pcName,
                                socketId: socket.id,
                                keyword: matchedKeyword,
                                windowTitle,
                                screenshot: base64,
                                timestamp: new Date()
                            });
                        }
                    }
                } catch (alertErr) {
                    console.error('Alert check error:', alertErr.message);
                }
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

        // ─── 👁️ Idle Detection ─────────────────────────────────────────────────
        socket.on('employee_idle', ({ idleMinutes }) => {
            const employee = activeEmployees.get(socket.id);
            if (!employee || !employee.adminId) return;
            employee.isIdle = true;
            employee.idleMinutes = idleMinutes;
            activeEmployees.set(socket.id, employee);
            console.log(`💤 Employee IDLE: ${employee.name} (${idleMinutes} min)`);
            saveLog(employee.adminId, employee, 'idle_start', `Employee went idle (idle for ${idleMinutes} min)`);
            const alertData = {
                employeeName: employee.name,
                pcName: employee.pcName,
                socketId: socket.id,
                idleMinutes,
                timestamp: new Date()
            };
            io.to(`org_${employee.adminId}`).emit('employee_idle_alert', alertData);
            io.to('global_monitoring').emit('employee_idle_alert', alertData);
        });

        socket.on('employee_active', () => {
            const employee = activeEmployees.get(socket.id);
            if (!employee || !employee.adminId) return;
            employee.isIdle = false;
            employee.idleMinutes = 0;
            activeEmployees.set(socket.id, employee);
            saveLog(employee.adminId, employee, 'idle_end', 'Employee resumed active work');
            io.to(`org_${employee.adminId}`).emit('employee_back_active', {
                employeeName: employee.name,
                socketId: socket.id
            });
        });

        // ─── 🔒 PC Lock ────────────────────────────────────────────────────────
        socket.on('lock_pc', ({ employeeSocketId }) => {
            if (!admins.has(socket.id)) return;
            console.log(`🔒 Admin locking PC: ${employeeSocketId}`);
            io.to(employeeSocketId).emit('lock_pc');
            const employee = activeEmployees.get(employeeSocketId);
            if (employee) {
                saveLog(socket.adminId || employee.adminId, employee, 'pc_locked', 'PC locked by admin command');
            }
        });

        // ─── 🔢 Multi-Monitor ──────────────────────────────────────────────────
        socket.on('request_monitors', ({ employeeSocketId }) => {
            if (!admins.has(socket.id)) return;
            io.to(employeeSocketId).emit('request_monitors');
        });

        socket.on('monitors_list', ({ sources }) => {
            const employee = activeEmployees.get(socket.id);
            if (!employee || !employee.adminId) return;
            io.to(`org_${employee.adminId}`).emit('employee_monitors_list', {
                socketId: socket.id,
                sources
            });
        });

        socket.on('switch_monitor', ({ employeeSocketId, monitorIndex }) => {
            if (!admins.has(socket.id)) return;
            io.to(employeeSocketId).emit('switch_monitor', { monitorIndex });
            const employee = activeEmployees.get(employeeSocketId);
            if (employee) {
                saveLog(socket.adminId || employee.adminId, employee, 'monitor_switched', `View switched to Monitor #${monitorIndex + 1}`);
            }
        });

        // ─── 💬 Admin → Employee Chat ─────────────────────────────────────────
        socket.on('send_admin_message', ({ employeeSocketId, message, adminName }) => {
            if (!admins.has(socket.id)) return;
            console.log(`💬 Admin message → ${employeeSocketId}: ${message}`);
            io.to(employeeSocketId).emit('admin_message', {
                from: socket.id,
                adminName: adminName || 'Admin',
                message,
                timestamp: new Date()
            });
            const employee = activeEmployees.get(employeeSocketId);
            if (employee) {
                saveLog(socket.adminId || employee.adminId, employee, 'message_sent', `Admin message: "${message}"`);
            }
        });

        // ─── ⌨️ Keylogger ──────────────────────────────────────────────────────
        socket.on('keylog_batch', async ({ text }) => {
            const employee = activeEmployees.get(socket.id);
            if (!employee || !employee.adminId) return;
            try {
                const Keylog = require('../models/Keylog');
                await Keylog.create({
                    adminId: employee.adminId,
                    employeeId: employee.id || socket.id,
                    employeeName: employee.name,
                    pcName: employee.pcName,
                    text
                });
                saveLog(employee.adminId, employee, 'keylog_session', `Logged keystrokes: "${text.substring(0, 60)}${text.length > 60 ? '...' : ''}"`);
                io.to(`org_${employee.adminId}`).emit('keylog_live', {
                    socketId: socket.id,
                    employeeName: employee.name,
                    text,
                    timestamp: new Date()
                });
            } catch (err) {
                console.error('Keylog save error:', err.message);
            }
        });

        socket.on('toggle_keylog', async ({ enabled, employeeSocketId }) => {
            if (!admins.has(socket.id) || !socket.adminId) return;
            try {
                await User.findByIdAndUpdate(socket.adminId, { keylogEnabled: enabled });
                if (employeeSocketId) {
                    io.to(employeeSocketId).emit('keylog_setting', { enabled });
                } else {
                    io.to(`org_${socket.adminId}`).emit('keylog_setting', { enabled });
                }
            } catch (e) {
                console.error('Toggle keylog error:', e);
            }
        });

        // ─── 🌐 Website Blocker ────────────────────────────────────────────────
        socket.on('set_blocked_sites', async ({ domains, employeeSocketId }) => {
            if (!admins.has(socket.id) || !socket.adminId) return;
            try {
                await User.findByIdAndUpdate(socket.adminId, { blockedSites: domains });
                if (employeeSocketId) {
                    io.to(employeeSocketId).emit('update_blocked_sites', { domains });
                    const employee = activeEmployees.get(employeeSocketId);
                    if (employee) {
                        saveLog(socket.adminId, employee, 'website_blocked', `Blocked domains updated: ${domains.join(', ')}`);
                    }
                } else {
                    io.to(`org_${socket.adminId}`).emit('update_blocked_sites', { domains });
                    for (const emp of activeEmployees.values()) {
                        if (emp.adminId === socket.adminId) {
                            saveLog(socket.adminId, emp, 'website_blocked', `Global blocked domains updated: ${domains.join(', ')}`);
                        }
                    }
                }
                console.log(`🌐 Blocked sites updated for org_${socket.adminId}:`, domains);
            } catch (e) {
                console.error('Blocked sites error:', e);
            }
        });

        // ─── 🚨 Alert Keywords Management ─────────────────────────────────────
        socket.on('set_alert_keywords', async ({ keywords }) => {
            if (!admins.has(socket.id) || !socket.adminId) return;
            try {
                await User.findByIdAndUpdate(socket.adminId, { alertKeywords: keywords });
                console.log(`🚨 Alert keywords updated for ${socket.adminId}:`, keywords);
                socket.emit('alert_keywords_saved', { keywords });
            } catch (e) {
                console.error('Alert keywords error:', e);
            }
        });

        // ─── 🔊 Silent Audio Monitoring ───────────────────────────────────────
        socket.on('silent_audio_request', ({ employeeSocketId }) => {
            if (!admins.has(socket.id)) return;
            io.to(employeeSocketId).emit('silent_audio_request', { adminSocketId: socket.id });
        });

        socket.on('silent_audio_signal', ({ to, signal }) => {
            io.to(to).emit('silent_audio_signal', { from: socket.id, signal });
        });

        // ─── Meeting Events ────────────────────────────────────────────────────
        socket.on('start_meeting', ({ roomName }) => {
            const admin = activeEmployees.get(socket.id) || { adminId: socket.adminId };
            const orgRoom = `org_${socket.adminId || admin.adminId}`;
            console.log(`📡 Meeting Started: ${roomName} in ${orgRoom}`);
            io.to(orgRoom).emit('meeting_invitation', { roomName, hostId: socket.id, hostName: 'Admin' });
            if (admins.has(socket.id) && socket.role === 'superadmin') {
                for (const emp of activeEmployees.values()) {
                    io.to(emp.socketId).emit('meeting_invitation', { roomName, hostId: socket.id, hostName: 'SuperAdmin' });
                }
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
                    saveLog(emp.adminId, emp, 'disconnected', 'Employee went offline');
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
