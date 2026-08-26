const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onLyricsUpdate: (callback) => {
    ipcRenderer.on('lyrics-update', (event, data) => callback(data));
  },
  onLyricsError: (callback) => {
    ipcRenderer.on('lyrics-error', (event, data) => callback(data));
  },
  onPositionUpdate: (callback) => {
    ipcRenderer.on('position-update', (event, position) => callback(position));
  },
  onTranslationUpdate: (callback) => {
    ipcRenderer.on('translation-update', (event, data) => callback(data));
  },
  setTranslationEnabled: (enabled) => ipcRenderer.invoke('set-translation-enabled', enabled),
  refreshLyrics: () => ipcRenderer.invoke('refresh-lyrics'),
  toggleAlwaysOnTop: () => ipcRenderer.invoke('toggle-always-on-top'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window')
});
