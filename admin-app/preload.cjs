const { contextBridge, ipcRenderer } = require('electron');

// Expose safe Electron APIs to the renderer (React app)
// These are the only APIs accessible from the frontend
contextBridge.exposeInMainWorld('electronAPI', {
    // Open dist.zip location in Windows Explorer
    openAgentFolder: () => ipcRenderer.invoke('open-agent-folder'),

    // Open "Save As" dialog and copy the dist.zip to chosen location
    downloadAgentZip: () => ipcRenderer.invoke('download-agent-zip'),

    // Check if running inside Electron
    isElectron: true
});
