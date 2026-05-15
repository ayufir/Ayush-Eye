// Enhanced backend server with proper WebRTC signaling for screen sharing
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Middleware
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('MongoDB error:', err));

// ─── Database Models ──────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['superadmin', 'admin'], default: 'admin' },
    expiryDate: { type: Date, default: null }, // Null for lifetime or superadmin
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Seed Superadmin
const seedSuperAdmin = async () => {
    const count = await User.countDocuments({ role: 'superadmin' });
    if (count === 0) {
        const hashedPassword = await bcrypt.hash('superadmin123', 10);
        await User.create({
            name: 'Master Control',
            email: 'master@sentinel.com',
            password: hashedPassword,
            role: 'superadmin'
        });
        console.log('👑 Superadmin seeded: master@sentinel.com / superadmin123');
    }
};
seedSuperAdmin();

// ─── Auth Middleware ──────────────────────────────────────────────────────────
const authenticate = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Unauthorized' });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user || !user.isActive) {
            return res.status(403).json({ 
                message: 'Your account has been SUSPENDED by owner Ayush Shrivastava. Please call 9407884443 to reactivate.' 
            });
        }

        // Check Expiry for Admins
        if (user.role === 'admin' && user.expiryDate && new Date() > user.expiryDate) {
            return res.status(403).json({ message: 'Your license has expired. Please contact Superadmin.' });
        }

        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

// ─── In-Memory State ──────────────────────────────────────────────────────────
const activeEmployees = new Map();  // socketId -> employee data
const admins = new Set();           // admin socket IDs

// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // ── Identify ──────────────────────────────────────────────────────────────
    socket.on('identify', async (data) => {
        if (data.role === 'employee') {
            const employeeData = {
                ...data,
                socketId: socket.id,
                status: 'online',
                connectedAt: new Date()
            };
            activeEmployees.set(socket.id, employeeData);

            // Notify all admins of new employee
            admins.forEach(adminId => {
                io.to(adminId).emit('employee_joined', employeeData);
            });

            admins.forEach(adminId => {
                io.to(adminId).emit('employee_status_change', {
                    employeeId: data.id,
                    socketId: socket.id,
                    status: 'online'
                });
            });

            console.log(`👤 Employee connected: ${data.name} [${socket.id}]`);

        } else if (data.role === 'admin') {
            // Validate token for admin
            try {
                if (!data.token) throw new Error('Missing token');
                const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
                const user = await User.findById(decoded.id);

                if (!user || !user.isActive) {
                    socket.emit('auth_error', { message: 'Account disabled' });
                    return;
                }

                if (user.role === 'admin' && user.expiryDate && new Date() > user.expiryDate) {
                    socket.emit('auth_error', { message: 'License expired' });
                    return;
                }

                // Join organization room
                const orgRoom = `org_${user._id}`;
                socket.join(orgRoom);
                admins.add(socket.id);
                
                // Store adminId in socket for later use
                socket.adminId = user._id.toString();

                // Send only employees belonging to this organization
                const employeeList = Array.from(activeEmployees.values())
                    .filter(emp => emp.adminId === socket.adminId);
                
                socket.emit('initial_employee_list', employeeList);
                console.log(`🛡️ Admin verified: ${user.email} joined ${orgRoom}`);
            } catch (err) {
                socket.emit('auth_error', { message: 'Authentication failed' });
                console.log(`🚫 Admin auth failed: ${err.message}`);
            }
        }
    });

    // ── Employee Identification (Isolated) ────────────────────────────────────
    socket.on('employee_identify', (data) => {
        // data should include: adminId (the client's ID), name, pcName, etc.
        const { adminId, name } = data;
        if (!adminId) return console.log('❌ Employee connected without adminId');

        const employeeData = {
            ...data,
            socketId: socket.id,
            status: 'online',
            connectedAt: new Date()
        };
        activeEmployees.set(socket.id, employeeData);

        const orgRoom = `org_${adminId}`;
        socket.join(orgRoom);

        // Notify only the admins of THIS organization
        io.to(orgRoom).emit('employee_joined', employeeData);
        io.to(orgRoom).emit('employee_status_change', {
            employeeId: data.id,
            socketId: socket.id,
            status: 'online'
        });

        console.log(`👤 Employee connected: ${name} to ${orgRoom}`);
    });

    // ── WebRTC Signaling ──────────────────────────────────────────────────────
    socket.on('rtc_signal', ({ to, signal }) => {
        // Forward signal to target socket
        io.to(to).emit('rtc_signal', {
            from: socket.id,
            signal: signal
        });
        console.log(`📡 Signal forwarded: ${signal.type} from ${socket.id} → ${to}`);
    });

    socket.on('intercom_signal', ({ to, signal }) => {
        io.to(to).emit('intercom_signal', {
            from: socket.id,
            signal: signal
        });
        console.log(`🎤 Intercom signal: ${signal.type} from ${socket.id} → ${to}`);
    });

    // ── Admin requests to view employee screen ────────────────────────────────
    socket.on('request_view', ({ employeeSocketId }) => {
        if (admins.has(socket.id) && activeEmployees.has(employeeSocketId)) {
            io.to(employeeSocketId).emit('view_request', { adminId: socket.id });
            console.log(`📺 View request: Admin ${socket.id} → Employee ${employeeSocketId}`);
        }
    });

    // ── Activity Logs ─────────────────────────────────────────────────────────
    socket.on('activity_log', (data) => {
        const employee = activeEmployees.get(socket.id);
        if (employee && employee.adminId) {
            const logData = { ...data, employeeId: employee.id, socketId: socket.id };
            io.to(`org_${employee.adminId}`).emit('activity_update', logData);
        }
    });

    // ── Disconnect ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        if (activeEmployees.has(socket.id)) {
            const emp = activeEmployees.get(socket.id);
            activeEmployees.delete(socket.id);

            if (emp.adminId) {
                // Notify only admins of this organization
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

// ─── REST APIs ────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        employees: activeEmployees.size,
        admins: admins.size,
        timestamp: new Date()
    });
});

app.get('/api/employees', (req, res) => {
    res.json(Array.from(activeEmployees.values()));
});

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        if (!user.isActive) {
            return res.status(403).json({ 
                message: 'Your account has been SUSPENDED by owner Ayush Shrivastava. Please call 9407884443 to reactivate.' 
            });
        }

        if (user.role === 'admin' && user.expiryDate && new Date() > user.expiryDate) {
            return res.status(403).json({ message: 'License expired' });
        }

        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role, expiryDate: user.expiryDate } });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// ─── Superadmin Routes ────────────────────────────────────────────────────────
app.post('/api/admin/create', authenticate, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ message: 'Forbidden' });
    
    const { name, email, password, expiryDate } = req.body;
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: 'Email already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await User.create({
            name,
            email,
            password: hashedPassword,
            role: 'admin',
            expiryDate: expiryDate ? new Date(expiryDate) : null
        });

        res.status(201).json({ message: 'Admin created successfully', user: newUser });
    } catch (err) {
        res.status(500).json({ message: 'Error creating admin' });
    }
});

app.get('/api/admin/list', authenticate, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ message: 'Forbidden' });
    const admins = await User.find({ role: 'admin' }).select('-password');
    res.json(admins);
});

app.patch('/api/admin/:id/toggle-status', authenticate, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ message: 'Forbidden' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.isActive = !user.isActive;
    await user.save();
    res.json({ message: `Admin ${user.isActive ? 'activated' : 'deactivated'}`, user });
});

app.patch('/api/admin/:id/extend-expiry', authenticate, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ message: 'Forbidden' });
    const { newExpiry } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.expiryDate = new Date(newExpiry);
    await user.save();
    res.json({ message: 'Expiry date updated', user });
});

app.get('/api/auth/verify', authenticate, (req, res) => {
    res.json({ isActive: req.user.isActive, role: req.user.role });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Sentinel Backend running on port ${PORT}`);
});
