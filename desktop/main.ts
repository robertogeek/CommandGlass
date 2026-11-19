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
// Instalada desde la Microsoft Store (paquete MSIX): el arranque con Windows lo gestiona Windows y no hay install.json.
const isStore = Boolean(process.windowsStore);
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

// Idioma de la bandeja y los diálogos: el mismo ajuste que la interfaz (lo guarda el servidor); hasta saberlo, el de Windows.
let uiLang: 'en' | 'es' = 'en';
const T = (es: string, en: string) => (uiLang === 'es' ? es : en);
let refreshTray: () => void = () => {};

/** Lee el idioma guardado en el servidor y, si ha cambiado, rehace el menú de la bandeja. */
async function syncLang() {
  if (!serverReady) return;
  try {
    const r = await fetch(`http://localhost:${PORT}/api/settings`);
    const l = ((await r.json()) as { lang?: string }).lang;
    if ((l === 'en' || l === 'es') && l !== uiLang) {
      uiLang = l;
      refreshTray();
    }
  } catch {
    /* servidor aún no disponible */
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(boot);
}

function boot() {
  uiLang = app.getLocale().toLowerCase().startsWith('es') ? 'es' : 'en';
  Menu.setApplicationMenu(null);
  mkdirSync(paths.data, { recursive: true });
  mkdirSync(dirname(logFile), { recursive: true });
  createTray();
  registerIpc();
  startServer();
  if (!startHidden) showWindow();
  setInterval(() => void syncLang(), 20_000);
}

// ---------------------------------------------------------------- servidor

// ---------------------------------------------------------------- versión del juego (LIVE / PTU…)

const CHANNELS = ['LIVE', 'PTU', 'EPTU', 'TECH-PREVIEW'] as const;
type Channel = (typeof CHANNELS)[number];
const channelFile = join(app.getPath('userData'), 'channel.json');

function readChannel(): Channel {
  try {
    const c = (JSON.parse(readFileSync(channelFile, 'utf8')) as { channel?: string }).channel;
    return (CHANNELS as readonly string[]).includes(c ?? '') ? (c as Channel) : 'LIVE';
  } catch {
    return 'LIVE';
  }
}

/** Cada versión del juego tiene su propio historial: data (LIVE), data-PTU… */
function dataDirFor(ch: Channel): string {
  return ch === 'LIVE' ? paths.data : `${paths.data}-${ch}`;
}

/** Carpeta StarCitizen (la que contiene LIVE, PTU…), a partir de la carpeta del juego que ya conocemos. */
function starCitizenRoot(): string | null {
  let dir: string | null = null;
  try {
    dir = (JSON.parse(readFileSync(join(paths.data, 'config.json'), 'utf8')) as { gameDir?: string }).gameDir ?? null;
  } catch {
    /* aún sin configuración */
  }
  dir ??= readInstallGameDir();
  if (!dir) return null;
  const base = dir.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';
  return (CHANNELS as readonly string[]).includes(base.toUpperCase()) ? dirname(dir) : null;
}

function availableChannels(): Channel[] {
  const root = starCitizenRoot();
  if (!root) return ['LIVE'];
  return CHANNELS.filter((ch) => ch === 'LIVE' || normalizeGameDir(join(root, ch)) === join(root, ch));
}

function startServer() {
  serverReady = false;
  const channel = readChannel();
  const dataDir = dataDirFor(channel);
  mkdirSync(dataDir, { recursive: true });
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    CG_DATA_DIR: dataDir,
    CG_CLIENT_DIST: paths.client,
    CG_VERSION: versionLabel(),
    PORT: String(PORT),
    CG_LOCALE: app.getLocale(),
  };
  const installDir = readInstallGameDir();
  if (installDir) env.CG_INSTALL_GAME_DIR = installDir;
  const root = starCitizenRoot();
  if (channel !== 'LIVE' && root) env.SC_GAME_DIR = join(root, channel);

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
      void syncLang();
    } else if (m?.type === 'error') {
      showError(m.message ?? T('No se ha podido arrancar el servidor.', 'The server could not start.'));
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
      showError(T(`El servidor de CommandGlass se ha detenido (código ${code}). Revisa ${logFile}.`, `The CommandGlass server stopped (code ${code}). Check ${logFile}.`));
    }
  });
}

function restartServer() {
  const old = server;
  server = null;
  old?.kill();
  setTimeout(startServer, 600);
  if (win) win.loadURL(loadingPage(T('Reiniciando CommandGlass…', 'Restarting CommandGlass…')));
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
  // La carpeta elegida pasa a ser la de LIVE; las demás versiones se buscan a su lado.
  if (readChannel() !== 'LIVE') writeFileSync(channelFile, JSON.stringify({ channel: 'LIVE' }));
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
          content: T('Sigue funcionando aquí, en la bandeja. Ábrelo desde este icono o desde el menú Inicio.', 'It keeps running here in the tray. Open it from this icon or from the Start menu.'),
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
    win.loadURL(serverReady ? uiUrl() : loadingPage(T('Arrancando CommandGlass…', 'Starting CommandGlass…')));
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
  const html = `<!doctype html><html lang="${uiLang}"><meta charset="utf-8"><title>${APP_NAME}</title>
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
  const refresh = (refreshTray = () =>
    tray?.setContextMenu(
      Menu.buildFromTemplate([
        { label: T('Abrir CommandGlass', 'Open CommandGlass'), click: () => showWindow() },
        { label: T('Abrir en el navegador', 'Open in browser'), click: () => void shell.openExternal(`http://localhost:${PORT}/`) },
        { type: 'separator' },
        isStore
          ? { label: T('Abrir al iniciar Windows…', 'Open at Windows startup…'), click: () => openStartupSettings() }
          : {
              label: T('Abrir al iniciar Windows', 'Open at Windows startup'),
              type: 'checkbox',
              checked: getOpenAtLogin(),
              click: (item) => (setOpenAtLogin(item.checked), refresh()),
            },
        { type: 'separator' },
        { label: T('Salir', 'Quit'), click: () => quit() },
      ]),
    ));
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

/** En la versión de la Store el inicio con Windows es una StartupTask del paquete: se activa en Configuración. */
function openStartupSettings() {
  void shell.openExternal('ms-settings:startupapps');
}

/**
 * Carpeta de datos tal como la ve el Explorador. En un paquete MSIX lo que la app escribe en %APPDATA% acaba en
 * %LOCALAPPDATA%\Packages\<familia>\LocalCache\Roaming, y el Explorador no ve la ruta virtual.
 */
function visibleDataDir(dir: string): string {
  if (!isStore) return dir;
  // C:\Program Files\WindowsApps\<Nombre>_<versión>_<arq>_<recurso>_<IdEditor>\app\CommandGlass.exe
  const full = process.execPath.split(/[\\/]/).find((p) => /^[^_]+_[^_]+_[^_]*_[^_]*_[a-z0-9]{13}$/i.test(p));
  const roaming = app.getPath('appData');
  if (!full || !process.env.LOCALAPPDATA || !dir.startsWith(roaming)) return dir;
  const parts = full.split('_');
  const real = join(process.env.LOCALAPPDATA, 'Packages', `${parts[0]}_${parts.at(-1)}`, 'LocalCache', 'Roaming', dir.slice(roaming.length));
  return existsSync(real) ? real : dir;
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
    if (!fromOurPage(e) || !win) return { ok: false, message: T('No permitido.', 'Not allowed.') };
    const r = await dialog.showOpenDialog(win, {
      title: T('Elige la carpeta de Star Citizen', 'Choose the Star Citizen folder'),
      buttonLabel: T('Usar esta carpeta', 'Use this folder'),
      properties: ['openDirectory'],
      defaultPath: 'C:\\Program Files\\Roberts Space Industries',
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    const dir = normalizeGameDir(r.filePaths[0]);
    if (!dir) {
      return {
        ok: false,
        message: T(
          'En esa carpeta no está Star Citizen. Elige la carpeta StarCitizen o su subcarpeta LIVE (la que contiene Data.p4k).',
          'Star Citizen is not in that folder. Choose the StarCitizen folder or its LIVE subfolder (the one with Data.p4k).',
        ),
      };
    }
    saveGameDir(dir);
    restartServer();
    return { ok: true, gameDir: dir };
  });
  ipcMain.handle('cg:get-channels', (e) => (fromOurPage(e) ? { current: readChannel(), available: availableChannels() } : null));
  ipcMain.handle('cg:set-channel', (e, ch: unknown) => {
    if (!fromOurPage(e) || !availableChannels().includes(ch as Channel)) return false;
    writeFileSync(channelFile, JSON.stringify({ channel: ch }));
    restartServer();
    return true;
  });
  // En la versión de la Store devuelve null: la ventana ofrece abrir la configuración de Windows en su lugar.
  ipcMain.handle('cg:get-open-at-login', (e) => (!fromOurPage(e) ? false : isStore ? null : getOpenAtLogin()));
  ipcMain.handle('cg:set-open-at-login', (e, on: unknown) => {
    if (!fromOurPage(e)) return false;
    if (isStore) return (openStartupSettings(), null);
    return setOpenAtLogin(on === true);
  });
  ipcMain.handle('cg:open-data-dir', async (e) => {
    if (fromOurPage(e)) await shell.openPath(visibleDataDir(dataDirFor(readChannel())));
  });
}

function versionLabel(): string {
  // "0.1.0-beta" → "v0.1.0 beta"
  const [base, pre] = app.getVersion().split('-');
  return `v${base}${pre ? ` ${pre}` : ''}`;
}
