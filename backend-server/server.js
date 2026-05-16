const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const socketHandler = require('./sockets/socketHandler');

const systemRoutes = require('./routes/systemRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 60000,
    pingInterval: 25000
});

// Connect to Database
connectDB();

// Middleware
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.json());

// Socket.IO Setup
const { activeEmployees, admins } = socketHandler(io);

// Routes
app.use('/api', systemRoutes(activeEmployees, admins));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);


// Start Server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Sentinel Backend running in MVC structure on port ${PORT}`);
});
