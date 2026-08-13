const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    platform: process.platform,
    hideWindow: () => ipcRenderer.send('hide-window'),
    onRestore: (callback) => {
        ipcRenderer.removeAllListeners('window-restored');
        ipcRenderer.on('window-restored', (event, volume) => callback(volume));
    },
    onPrepareHide: (callback) => {
        ipcRenderer.removeAllListeners('prepare-to-hide');
        ipcRenderer.on('prepare-to-hide', callback);
    },
    openSettings: () => ipcRenderer.send('open-settings'),
    launchServer: (url) => ipcRenderer.send('launch-server', url),
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    setVolume: (volume) => ipcRenderer.send('set-volume', volume),
    onVolumeUpdate: (callback) => {
        ipcRenderer.removeAllListeners('update-volume');
        ipcRenderer.on('update-volume', (event, volume) => callback(volume));
    },
    onStatusUpdate: (callback) => {
        ipcRenderer.removeAllListeners('status-update');
        ipcRenderer.on('status-update', (event, status) => callback(status));
    },
    onAutoInfoUpdate: (callback) => {
        ipcRenderer.removeAllListeners('auto-info-update');
        ipcRenderer.on('auto-info-update', (event, info) => callback(info));
    },
    onServersConfigUpdate: (callback) => {
        ipcRenderer.removeAllListeners('servers-config-update');
        ipcRenderer.on('servers-config-update', (event, cfg) => callback(cfg));
    },
    onUpdateAvailable: (callback) => {
        ipcRenderer.removeAllListeners('update-available');
        ipcRenderer.on('update-available', (event, info) => callback(info));
    },
    openExternalUrl: (url) => ipcRenderer.send('open-external-url', url),
    getAutoInfo: () => ipcRenderer.invoke('get-auto-info'),
    saveSettings: (settings) => ipcRenderer.send('save-settings', settings),
    getSettings: () => ipcRenderer.invoke('get-settings')
});
