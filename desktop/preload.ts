import { contextBridge, ipcRenderer } from 'electron';

// Lo único que la ventana puede pedir a Windows. Todo lo demás va por la API HTTP del servidor local.
contextBridge.exposeInMainWorld('commandglass', {
  chooseGameDir: () => ipcRenderer.invoke('cg:choose-game-dir'),
  getOpenAtLogin: () => ipcRenderer.invoke('cg:get-open-at-login'),
  setOpenAtLogin: (on: boolean) => ipcRenderer.invoke('cg:set-open-at-login', on),
  openDataDir: () => ipcRenderer.invoke('cg:open-data-dir'),
  getChannels: () => ipcRenderer.invoke('cg:get-channels'),
  setChannel: (ch: string) => ipcRenderer.invoke('cg:set-channel', ch),
});
