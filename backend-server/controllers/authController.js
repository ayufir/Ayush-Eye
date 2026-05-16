const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
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
};

exports.verify = (req, res) => {
    res.json({ isActive: req.user.isActive, role: req.user.role });
};
