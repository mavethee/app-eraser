const { contextBridge, ipcRenderer } = require('electron');

// Expose safe IPC methods to the Renderer via a global 'api' object
contextBridge.exposeInMainWorld('api', {
  // Renderer to Main (One-way messages/commands)
  send: (channel, data) => {
    const safeChannels = ['app-quit', 'handle-error', 'show-in-finder', 'close-app-request'];
    if (safeChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  // Renderer to Main (Two-way requests for data or dialogs)
  invoke: (channel, data) => {
    const safeChannels = ['get-app-info', 'select-app-from-finder', 'confirm-dialog', 'trash-files'];
    if (safeChannels.includes(channel)) {
      // Must return the promise from ipcRenderer.invoke
      return ipcRenderer.invoke(channel, data);
    }
    // Handle unwhitelisted channels by returning a rejected promise
    return Promise.reject(new Error(`Invalid IPC channel: ${channel}`));
  },
});

// --- CRITICAL D&D FIX: Handle the entire drop event only AFTER the DOM is ready ---
window.addEventListener('DOMContentLoaded', () => {
  const dropZone = window.document.getElementById('drag-drop-zone');

  if (dropZone) {
    dropZone.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const { files } = event.dataTransfer;
      if (files.length > 0 && files[0].path) {
        // Securely post the path back into the Renderer's context
        window.postMessage({
          type: 'dropped-file-path',
          detail: files[0].path,
        }, '*');
      }
    });
  }

  // Ensure dragover is still prevented to allow the drop event
  const dragOverZones = [
    dropZone,
    window.document.getElementById('files-list'),
  ];
  dragOverZones.forEach((zone) => {
    if (zone) {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    }
  });
});
