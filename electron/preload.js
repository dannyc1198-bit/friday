const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('JARVIS', {
  version: '1.0.0',
  platform: process.platform,
});
