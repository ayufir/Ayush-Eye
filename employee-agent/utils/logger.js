const fs = require('fs');

const log = (msg, type = '') => {
    console.log(msg);
    const logLine = new Date().toLocaleTimeString() + ' — ' + msg + '\n';
    try {
        fs.appendFileSync('debug.log', logLine);
    } catch (e) {}

    if (typeof document !== 'undefined') {
        const logEl = document.getElementById('log');
        if (logEl) {
            const p = document.createElement('p');
            p.textContent = logLine;
            p.className = type;
            logEl.prepend(p);
        }
    }
};

const setStatus = (text, connected = false) => {
    if (typeof document !== 'undefined') {
        const dot = document.getElementById('dot');
        const statusText = document.getElementById('statusText');
        if (dot) dot.className = 'dot' + (connected ? ' connected' : '');
        if (statusText) statusText.textContent = text;
    }
};

module.exports = { log, setStatus };
