import { contextBridge, ipcRenderer } from 'electron';

// Lo único que la ventana puede pedir a Windows. Todo lo demás va por la API HTTP del servidor local.
contextBridge.exposeInMainWorld('commandglass', {
  chooseGameDir: () => ipcRenderer.invoke('cg:choose-game-dir'),
  getOpenAtLogin: () => ipcRenderer.invoke('cg:get-open-at-login'),
  setOpenAtLogin: (on: boolean) => ipcRenderer.invoke('cg:set-open-at-login', on),
  openDataDir: () => ipcRenderer.invoke('cg:open-data-dir'),
  getChannels: () => ipcRenderer.invoke('cg:get-channels'),
  setChannel: (ch: string) => ipcRenderer.invoke('cg:set-channel', ch),
  canLaunchTelemetry: () => ipcRenderer.invoke('cg:can-launch-telemetry'),
  launchTelemetry: (closeFirst: boolean) => ipcRenderer.invoke('cg:launch-telemetry', closeFirst),
  getUpdate: () => ipcRenderer.invoke('cg:get-update'),
  installUpdate: () => ipcRenderer.invoke('cg:install-update'),
  checkUpdate: () => ipcRenderer.invoke('cg:check-update'),
  getScreens: () => ipcRenderer.invoke('cg:get-screens'),
  toggleScreen: (id: number) => ipcRenderer.invoke('cg:toggle-screen', id),
  onScreens: (cb: (s: unknown) => void) => {
    const fn = (_e: unknown, s: unknown) => cb(s);
    ipcRenderer.on('cg:screens', fn);
    return () => ipcRenderer.removeListener('cg:screens', fn);
  },
  /** Avisa cuando cambia el estado de la actualización; devuelve la función para dejar de escuchar. */
  onUpdate: (cb: (s: unknown) => void) => {
    const fn = (_e: unknown, s: unknown) => cb(s);
    ipcRenderer.on('cg:update', fn);
    return () => ipcRenderer.removeListener('cg:update', fn);
  },
});
