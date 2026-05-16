const { ipcRenderer } = require('electron');
const { log } = require('../utils/logger');

let lastRequester = null;

const initRemoteControl = (socket) => {
    socket.on('remote_control', (data) => {
        const { action, data: actionData, from } = data;
        lastRequester = from;
        log(`🖱️ Remote Action: ${action}`, 'warn');
        ipcRenderer.send('execute-remote-action', { action, data: actionData });
    });

    ipcRenderer.on('screenshot-captured', (event, { base64 }) => {
        log('📸 Screenshot captured! Sending to admin...', 'ok');
        socket.emit('screenshot_result', { to: lastRequester, base64 });
    });
};

module.exports = { initRemoteControl };
