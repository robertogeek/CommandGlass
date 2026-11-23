import electronUpdater from 'electron-updater';

/**
 * Actualizaciones de la versión de GitHub (el instalador .exe). La de la Microsoft Store la actualiza la Store.
 * - Al abrir la app (y cada 6 horas) mira la última release estable de GitHub (las de pruebas no cuentan).
 *   En la ventana del PC también se puede mirar a mano («Buscar ahora»).
 * - Si hay una versión nueva, la descarga sola.
 * - Descargada: si el juego no está abierto se instala ya y la app vuelve a abrirse; si estás jugando, espera
 *   (botón «Instalar y reiniciar» en la ventana del PC) y, si no, se instala al salir de la app.
 * Las releases van sin firmar, así que no se comprueba la firma del instalador descargado (sí su SHA-512, que
 * viene en latest.yml).
 */

const { autoUpdater } = electronUpdater;

export type UpdateState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'none'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'installing'; version: string }
  | { state: 'error'; message: string };

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 15_000;

let current: UpdateState = { state: 'idle' };

export const updateState = (): UpdateState => current;

export interface UpdaterHooks {
  log: (msg: string) => void;
  /** Cambia el estado (para avisar a la ventana). */
  changed: (s: UpdateState) => void;
  /** ¿Se puede instalar ya, sin molestar? (el juego no está abierto). */
  canInstallNow: () => Promise<boolean>;
  /** Avisar de que hay una versión lista y se instalará al cerrar la app. */
  readyLater: (version: string) => void;
  /** Justo antes de cerrar la app para instalar. */
  beforeInstall: () => void;
}

export function startUpdater(hooks: UpdaterHooks) {
  const set = (s: UpdateState) => {
    current = s;
    hooks.changed(s);
  };
  const log = (level: string) => (m: unknown) => hooks.log(`[actualización] ${level}${String(m)}`);
  autoUpdater.logger = { info: log(''), warn: log('aviso: '), error: log('error: '), debug: () => {} };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Solo la release marcada como «Latest» en GitHub: las versiones de pruebas (pre-release) no se instalan solas.
  autoUpdater.allowPrerelease = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => {
    if (current.state !== 'ready' && current.state !== 'downloading') set({ state: 'checking' });
  });
  autoUpdater.on('update-not-available', (info) => set({ state: 'none', version: info.version }));
  autoUpdater.on('update-available', (info) => set({ state: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => {
    if (current.state === 'downloading') set({ ...current, percent: Math.round(p.percent) });
  });
  autoUpdater.on('update-downloaded', (info) => {
    set({ state: 'ready', version: info.version });
    void hooks.canInstallNow().then((now) => {
      if (now) install();
      else hooks.readyLater(info.version);
    });
  });
  autoUpdater.on('error', (err) => {
    // Sin red o GitHub caído: no pasa nada, se vuelve a mirar más tarde. Una versión ya descargada se conserva.
    if (current.state !== 'ready') set({ state: 'error', message: err?.message ?? String(err) });
  });

  const check = () => {
    if (current.state === 'ready' || current.state === 'installing' || current.state === 'downloading' || current.state === 'checking') return;
    autoUpdater.checkForUpdates().catch(() => {
      /* ya lo cuenta el evento 'error' */
    });
  };
  setTimeout(check, FIRST_CHECK_MS);
  setInterval(check, CHECK_EVERY_MS);

  function install() {
    if (current.state !== 'ready') return;
    set({ state: 'installing', version: current.version });
    hooks.beforeInstall();
    // Instalación silenciosa y la app se vuelve a abrir al terminar (Windows pide permiso: se instala para todos los usuarios).
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  }

  return { install, check };
}
