const { contextBridge, ipcRenderer: ipc } = require('electron');
contextBridge.exposeInMainWorld('tb', {
  loadSync: () => ipc.sendSync('tb:load'),
  save: j => ipc.send('tb:save', j),
  saveSync: j => ipc.sendSync('tb:saveSync', j),
  filePut: (id, meta, buf) => ipc.invoke('tb:filePut', id, meta, buf),
  fileGet: id => ipc.invoke('tb:fileGet', id),
  lib: n => ipc.invoke('tb:lib', n),
  fileDel: id => ipc.invoke('tb:fileDel', id),
  startOllama: () => ipc.invoke('tb:startOllama'),
  net: o => ipc.invoke('tb:net', o),
  netCancel: id => ipc.send('tb:netCancel', id),
  onClose: cb => ipc.on('tb:flush', () => cb()),
  closed: () => ipc.send('tb:flushed')
});
