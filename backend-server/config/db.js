const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            bufferCommands: false,
        });
        console.log('✅ Connected to MongoDB');
        await seedSuperAdmin();
    } catch (err) {
        console.error('⚠️ Database connection failed, but server will continue running.');
    }
};

const seedSuperAdmin = async () => {
    const User = mongoose.model('User');
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

    const ankitExists = await User.findOne({ email: 'ankit@gmail.com' });
    if (!ankitExists) {
        const hashedPass = await bcrypt.hash('admin123', 10); 
        await User.create({
            name: 'Ankit Sir',
            email: 'ankit@gmail.com',
            password: hashedPass,
            role: 'admin',
            isActive: true
        });
        console.log('👤 Seeded Admin: ankit@gmail.com / admin123');
    }
};

module.exports = connectDB;
