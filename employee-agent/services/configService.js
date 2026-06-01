const os = require('os');
const fs = require('fs');
const path = require('path');
const { log } = require('../utils/logger');

// Persistent config path
const persistentConfigPath = path.join(os.homedir(), '.sentinel-agent', 'config.json');

const getAdminIdFromFilename = () => {
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
    return null;
};

const loadConfig = () => {
    let isDev = false;
    try {
        const electron = require('electron');
        if (electron.app) {
            isDev = !electron.app.isPackaged;
        } else {
            isDev = process.execPath.toLowerCase().includes('electron.exe') || process.execPath.toLowerCase().includes('node_modules');
        }
    } catch (e) {
        isDev = process.execPath.toLowerCase().includes('electron.exe') || process.execPath.toLowerCase().includes('node_modules');
    }

    let config = {
        serverUrl: isDev ? 'http://localhost:5000' : 'https://ayush-eye-1.onrender.com',
        adminId: getAdminIdFromFilename(),
        employeeName: os.hostname()
    };

    const possiblePaths = [
        persistentConfigPath,
        './config.json',
        path.join(process.cwd(), 'config.json'),
        path.join(__dirname, '..', 'config.json'),
        path.join(process.resourcesPath || '', 'config.json'),
        path.join(process.resourcesPath || '', '..', 'config.json')
    ];

    for (const p of possiblePaths) {
        try {
            if (fs.existsSync(p)) {
                const fileData = fs.readFileSync(p, 'utf8');
                const fileConfig = JSON.parse(fileData);
                if (fileConfig.serverUrl) {
                    if (isDev && fileConfig.serverUrl === 'https://ayush-eye-1.onrender.com') {
                        config.serverUrl = 'http://localhost:5000';
                    } else {
                        config.serverUrl = fileConfig.serverUrl;
                    }
                }
                if (fileConfig.adminId) config.adminId = fileConfig.adminId;
                if (fileConfig.employeeName) config.employeeName = fileConfig.employeeName;
                log('✅ Loaded Config from: ' + p, 'ok');
                break;
            }
        } catch (e) {}
    }

    return config;
};

const saveConfig = (newConfig) => {
    try {
        const dir = path.dirname(persistentConfigPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        const currentConfig = loadConfig();
        const mergedConfig = { ...currentConfig, ...newConfig };
        
        fs.writeFileSync(persistentConfigPath, JSON.stringify(mergedConfig, null, 2));
        log(`✅ Saved persistent config to ${persistentConfigPath}`, 'ok');
        return mergedConfig;
    } catch (error) {
        log(`❌ Failed to save config: ${error.message}`, 'error');
        return null;
    }
};

module.exports = { loadConfig, saveConfig };
