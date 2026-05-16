const express = require('express');
const router = express.Router();

const systemRoutes = (activeEmployees, admins) => {
    router.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            employees: activeEmployees.size,
            admins: admins.size,
            timestamp: new Date()
        });
    });

    router.get('/employees', (req, res) => {
        res.json(Array.from(activeEmployees.values()));
    });

    return router;
};

module.exports = systemRoutes;
