const User = require('../models/User');
const bcrypt = require('bcryptjs');

exports.createAdmin = async (req, res) => {
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
};

exports.listAdmins = async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ message: 'Forbidden' });
    const admins = await User.find({ role: 'admin' }).select('-password');
    res.json(admins);
};

exports.toggleStatus = async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ message: 'Forbidden' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.isActive = !user.isActive;
    await user.save();
    res.json({ message: `Admin ${user.isActive ? 'activated' : 'deactivated'}`, user });
};

exports.extendExpiry = async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ message: 'Forbidden' });
    const { newExpiry } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    user.expiryDate = new Date(newExpiry);
    await user.save();
    res.json({ message: 'Expiry date updated successfully', user });
};

exports.updateAdmin = async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ message: 'Forbidden' });
    
    const { name, email, password, expiryDate } = req.body;
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        if (email && email !== user.email) {
            const existingUser = await User.findOne({ email });
            if (existingUser) return res.status(400).json({ message: 'Email already exists' });
            user.email = email;
        }

        if (name) user.name = name;
        
        if (password && password.trim() !== '') {
            user.password = await bcrypt.hash(password, 10);
        }
        
        if (expiryDate !== undefined) {
            user.expiryDate = expiryDate ? new Date(expiryDate) : null;
        }

        await user.save();
        res.json({ message: 'Admin updated successfully', user });
    } catch (err) {
        res.status(500).json({ message: 'Error updating admin' });
    }
};

exports.deleteAdmin = async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ message: 'Forbidden' });
    
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        res.json({ message: 'Admin deleted successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error deleting admin' });
    }
};
