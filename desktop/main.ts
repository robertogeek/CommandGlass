import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray, utilityProcess, type UtilityProcess } from 'electron';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { normalizeGameDir } from '../server/src/game/locate.ts';

/**
 * App de escritorio de CommandGlass.
 * - Arranca el servidor (server.mjs) como proceso hijo y abre una ventana con el QR (/escritorio).
 * - Cerrar la ventana la oculta: la app sigue en la bandeja del sistema mientras juegas.
 * - Una sola instancia: abrirla otra vez trae la ventana al frente.
 */

const PORT = Number(process.env.PORT ?? 8777);
const APP_NAME = 'CommandGlass';
app.setName(APP_NAME);
app.setAppUserModelId('com.spacecowboys.commandglass');

const here = import.meta.dirname;
const isDev = !app.isPackaged;
const root = isDev ? join(here, '..', '..') : process.resourcesPath;
const paths = {
  server: isDev ? join(here, 'server.mjs') : join(root, 'server', 'server.mjs'),
  client: isDev ? join(root, 'client', 'dist') : join(root, 'client'),
  icon: isDev ? join(root, 'client', 'public', 'icon-192.png') : join(root, 'assets', 'icon.png'),
  // En desarrollo se comparte data/ con `npm start`; instalada, %APPDATA%\CommandGlass\data.
  data: isDev ? join(root, 'data') : join(app.getPath('userData'), 'data'),
  // Lo que eligió el usuario en el instalador (carpeta de Star Citizen).
  install: join(dirname(process.execPath), 'install.json'),
};
const logFile = join(app.getPath('userData'), 'logs', 'servidor.log');

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let server: UtilityProcess | null = null;
let serverReady = false;
let quitting = false;
let restarts = 0;
let trayHintShown = false;
const startHidden = process.argv.includes('--hidden');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(boot);
}

function boot() {
  Menu.setApplicationMenu(null);
  mkdirSync(paths.data, { recursive: true });
  mkdirSync(dirname(logFile), { recursive: true });
  createTray();
  registerIpc();
  startServer();
  if (!startHidden) showWindow();
}

// ---------------------------------------------------------------- servidor

function startServer() {
  serverReady = false;
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    CG_DATA_DIR: paths.data,
    CG_CLIENT_DIST: paths.client,
    CG_VERSION: versionLabel(),
    PORT: String(PORT),
  };
  const installDir = readInstallGameDir();
  if (installDir) env.CG_INSTALL_GAME_DIR = installDir;

  const child = utilityProcess.fork(paths.server, [], { env, stdio: 'pipe', serviceName: 'CommandGlass · servidor' });
  server = child;
  const log = (chunk: Buffer) => {
    try {
      appendFileSync(logFile, chunk);
    } catch {
      /* sin registro */
    }
  };
  child.stdout?.on('data', log);
  child.stderr?.on('data', log);
  child.on('message', (m: { type?: string; message?: string }) => {
    if (m?.type === 'ready') {
      serverReady = true;
      restarts = 0;
      loadUi();
    } else if (m?.type === 'error') {
      showError(m.message ?? 'No se ha podido arrancar el servidor.');
    }
  });
  child.on('exit', (code) => {
    if (server !== child) return; // reinicio intencionado
    server = null;
    serverReady = false;
    if (quitting) return;
    // Si se cae, se reintenta un par de veces antes de rendirse.
    if (restarts < 2 && code !== 1) {
      restarts++;
      setTimeout(startServer, 1500);
    } else {
      showError(`El servidor de CommandGlass se ha detenido (código ${code}). Revisa ${logFile}.`);
    }
  });
}

function restartServer() {
  const old = server;
  server = null;
  old?.kill();
  setTimeout(startServer, 600);
  if (win) win.loadURL(loadingPage('Reiniciando CommandGlass…'));
}

function readInstallGameDir(): string | null {
  if (!existsSync(paths.install)) return null;
  try {
    const buf = readFileSync(paths.install);
    // El instalador (NSIS) lo escribe en UTF-16 con BOM para no romper rutas con tildes.
    const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.subarray(2).toString('utf16le') : buf.toString('utf8');
    const dir = (JSON.parse(text.replace(/^\uFEFF/, '')) as { gameDir?: string }).gameDir;
    return typeof dir === 'string' && dir.trim() ? dir : null;
  } catch {
    return null;
  }
}

function saveGameDir(dir: string) {
  const file = join(paths.data, 'config.json');
  let cfg: Record<string, unknown> = {};
  try {
    cfg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    /* primera vez */
  }
  writeFileSync(file, JSON.stringify({ ...cfg, gameDir: dir }, null, 2));
}

// ---------------------------------------------------------------- ventana

function uiUrl() {
  return `http://localhost:${PORT}/escritorio`;
}

function showWindow() {
  if (!app.isReady()) return;
  if (!win) {
    win = new BrowserWindow({
      width: 1040,
      height: 760,
      minWidth: 760,
      minHeight: 600,
      title: APP_NAME,
      backgroundColor: '#04070b',
      icon: paths.icon,
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        preload: join(here, 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    win.once('ready-to-show', () => win?.show());
    win.on('close', (e) => {
      if (quitting) return;
      e.preventDefault();
      win?.hide();
      if (!trayHintShown && tray) {
        trayHintShown = true;
        tray.displayBalloon({
          title: APP_NAME,
          content: 'Sigue funcionando aquí, en la bandeja. Ábrelo desde este icono o desde el menú Inicio.',
          iconType: 'info',
        });
      }
    });
    win.on('closed', () => (win = null));
    // Solo la propia página local; cualquier enlace externo se abre en el navegador.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith(`http://localhost:${PORT}/`) && !url.startsWith('data:')) e.preventDefault();
    });
    win.loadURL(serverReady ? uiUrl() : loadingPage('Arrancando CommandGlass…'));
  } else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}

function loadUi() {
  if (win) win.loadURL(uiUrl());
}

function showError(message: string) {
  if (!win) showWindow();
  win?.loadURL(loadingPage(message, true));
}

function loadingPage(text: string, error = false): string {
  const html = `<!doctype html><meta charset="utf-8"><title>${APP_NAME}</title>
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#04070b;color:${error ? '#f5c26b' : '#cdd7e0'};font:16px 'Segoe UI',system-ui,sans-serif;text-align:center;padding:0 32px}
h1{font:700 22px 'Segoe UI',system-ui;letter-spacing:.12em;text-transform:uppercase;color:#e3eaf0;margin:0 0 10px}</style>
<div><h1>${APP_NAME}</h1><p>${escapeHtml(text)}</p></div>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

// ---------------------------------------------------------------- bandeja

function createTray() {
  const image = nativeImage.createFromPath(paths.icon).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip(APP_NAME);
  const refresh = () =>
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir CommandGlass', click: () => showWindow() },
        { label: 'Abrir en el navegador', click: () => void shell.openExternal(`http://localhost:${PORT}/`) },
        { type: 'separator' },
        {
          label: 'Abrir al iniciar Windows',
          type: 'checkbox',
          checked: getOpenAtLogin(),
          click: (item) => (setOpenAtLogin(item.checked), refresh()),
        },
        { type: 'separator' },
        { label: 'Salir', click: () => quit() },
      ]),
    );
  refresh();
  tray.on('click', () => showWindow());
}

function quit() {
  quitting = true;
  server?.kill();
  app.quit();
}

app.on('before-quit', () => {
  quitting = true;
  server?.kill();
});
app.on('window-all-closed', () => {
  /* sigue en la bandeja */
});

// ---------------------------------------------------------------- inicio con Windows

function getOpenAtLogin(): boolean {
  return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
}

function setOpenAtLogin(on: boolean): boolean {
  // Al iniciar Windows arranca oculta, solo en la bandeja.
  app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
  return getOpenAtLogin();
}

// ---------------------------------------------------------------- puente con la ventana

function fromOurPage(e: Electron.IpcMainInvokeEvent): boolean {
  return (e.senderFrame?.url ?? '').startsWith(`http://localhost:${PORT}/`);
}

function registerIpc() {
  ipcMain.handle('cg:choose-game-dir', async (e) => {
    if (!fromOurPage(e) || !win) return { ok: false, message: 'No permitido.' };
    const r = await dialog.showOpenDialog(win, {
      title: 'Elige la carpeta de Star Citizen',
      buttonLabel: 'Usar esta carpeta',
      properties: ['openDirectory'],
      defaultPath: 'C:\\Program Files\\Roberts Space Industries',
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    const dir = normalizeGameDir(r.filePaths[0]);
    if (!dir) {
      return {
        ok: false,
        message: 'En esa carpeta no está Star Citizen. Elige la carpeta StarCitizen o su subcarpeta LIVE (la que contiene Data.p4k).',
      };
    }
    saveGameDir(dir);
    restartServer();
    return { ok: true, gameDir: dir };
  });
  ipcMain.handle('cg:get-open-at-login', (e) => (fromOurPage(e) ? getOpenAtLogin() : false));
  ipcMain.handle('cg:set-open-at-login', (e, on: unknown) => (fromOurPage(e) ? setOpenAtLogin(on === true) : getOpenAtLogin()));
  ipcMain.handle('cg:open-data-dir', async (e) => {
    if (fromOurPage(e)) await shell.openPath(paths.data);
  });
}

function versionLabel(): string {
  // "0.1.0-beta" → "v0.1.0 beta"
  const [base, pre] = app.getVersion().split('-');
  return `v${base}${pre ? ` ${pre}` : ''}`;
}
