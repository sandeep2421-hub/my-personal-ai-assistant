const { contextBridge, ipcRenderer } = require('electron');

// Expose only whitelisted channels to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  on: (channel, callback) => {
    const validChannels = [
      'toggle-mode',
      'capture-screenshot',
      'clipboard-text',
      'send-to-ai',
      'auto-type-code',
      'ghost-mode-toggled',
      'scroll-down',
      'scroll-up',
      'clear-all'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  // Remove all listeners for a channel (used in useEffect cleanup to prevent duplicates)
  off: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
  invoke: (channel, data) => {
    const validChannels = ['take-screenshot', 'auto-type-code', 'get-initial-license', 'set-ghost-mode', 'get-api-key'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
  }
});
