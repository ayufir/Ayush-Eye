const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

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

    // ─── Agent Download Route ─────────────────────────────────────────────────
    // Employee agent ko download karne ke liye — admin dashboard se link hoga
    router.get('/download-agent', (req, res) => {
        // Check if a pre-built zip exists in public
        const zipPath = path.join(__dirname, '../public/SentinelAgent.zip');
        if (fs.existsSync(zipPath)) {
            res.setHeader('Content-Disposition', 'attachment; filename="SentinelAgent.zip"');
            res.setHeader('Content-Type', 'application/zip');
            return res.sendFile(zipPath);
        }
        // If no zip, tell admin to build it
        res.status(404).json({ 
            message: 'Agent package not found. Please build the agent first: cd employee-agent && npm run package',
            buildCommand: 'cd employee-agent && npm run package'
        });
    });

    const Screenshot = require('../models/Screenshot');
    const authenticate = require('../middleware/authMiddleware');

    router.get('/screenshots', authenticate, async (req, res) => {
        try {
            const adminId = req.user.id;
            let query = { adminId };
            
            // Allow superadmin to view all if they want, but default to their own if they act as admin. 
            // For now, superadmin might want to view all:
            if (req.user.role === 'superadmin') {
                query = {}; 
            }

            // Fetch last 100 screenshots to prevent payload from being too huge
            const screenshots = await Screenshot.find(query)
                                        .sort({ takenAt: -1 })
                                        .limit(100);
            res.json(screenshots);
        } catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Server error fetching screenshots' });
        }
    });

    return router;
};

module.exports = systemRoutes;

