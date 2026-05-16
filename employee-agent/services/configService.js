const os = require('os');
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

const DEFAULT_ADMIN_ID = "6a08156c659055093275400a";

const getAdminId = () => {
    try {
        const exePath = process.execPath;
        const fileName = path.basename(exePath);
        const match = fileName.match(/Sentinel_([a-f0-9]+)/i);
        
        if (match && match[1]) {
            log(`Admin ID detected from filename: ${match[1]}`);
            return match[1];
        }
    } catch (err) {
        log(`Error reading filename: ${err.message}`);
    }
    
    log(`No ID in filename. Using Default Admin ID: ${DEFAULT_ADMIN_ID}`);
    return DEFAULT_ADMIN_ID;
};

const loadConfig = () => {
    let config = {
        serverUrl: 'https://ayush-eye-1.onrender.com',
        adminId: getAdminId(),
        employeeName: os.hostname()
    };

    const possiblePaths = [
        './config.json',
        path.join(process.cwd(), 'config.json'),
        path.join(__dirname, '..', 'config.json'),
        path.join(process.resourcesPath, 'config.json'),
        path.join(process.resourcesPath, '..', 'config.json')
    ];

    for (const p of possiblePaths) {
        try {
            if (fs.existsSync(p)) {
                const fileData = fs.readFileSync(p, 'utf8');
                const fileConfig = JSON.parse(fileData);
                if (fileConfig.serverUrl) config.serverUrl = fileConfig.serverUrl;
                if (fileConfig.adminId) config.adminId = fileConfig.adminId;
                if (fileConfig.employeeName) config.employeeName = fileConfig.employeeName;
                log('✅ Loaded Config from: ' + p, 'ok');
                break;
            }
        } catch (e) {}
    }

    return config;
};

module.exports = { loadConfig };
