const jwt = require('jsonwebtoken');
const User = require('../models/User');

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

        if (user.role === 'admin' && user.expiryDate && new Date() > user.expiryDate && user.email !== 'ankit@gmail.com') {
            return res.status(403).json({ message: 'Your license has expired. Please contact Superadmin.' });
        }

        req.user = user;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

module.exports = authenticate;
