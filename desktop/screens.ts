import { BrowserWindow, ipcMain, screen, type Display, type IpcMainEvent } from 'electron';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * CommandGlass en las pantallas de este PC: la interfaz del tablet a pantalla completa en un monitor secundario
 * (o una pantalla táctil como la Xeneon Edge), en hasta dos ventanas.
 *
 * Son ventanas que no se activan al tocarlas ni al hacer clic (WS_EX_NOACTIVATE, como el teclado en pantalla de
 * Windows): Star Citizen sigue en primer plano y Mandos le puede mandar las teclas, con la misma comprobación de
 * seguridad de siempre. Solo para escribir (un buscador, una nota) la ventana coge el foco un momento y, al
 * terminar, se lo devuelve al juego.
 */

export const MAX_SCREENS = 2;

export interface ScreenInfo {
  id: number;
  label: string;
  width: number;
  height: number;
  primary: boolean;
  open: boolean;
}

interface Saved {
  /** Pantallas abiertas (para volver a abrirlas al arrancar) y la sección que enseñaba cada una. */
  open: { displayId: number; hash: string }[];
}

interface Options {
  file: string;
  url: () => string;
  preload: string;
  icon: string;
  log: (line: string) => void;
  /** Enlaces externos: el de Discord se abre en su app (ver main.ts). */
  openExternal: (url: string) => void;
  /** La lista ha cambiado (para la ventana del PC y la bandeja). */
  changed: () => void;
  T: (es: string, en: string) => string;
}

export function createScreens(o: Options) {
  const wins = new Map<number, BrowserWindow>();
  const hashes = new Map<number, string>();
  let quitting = false;

  const read = (): Saved => {
    try {
      const s = JSON.parse(readFileSync(o.file, 'utf8')) as Saved;
      return Array.isArray(s.open) ? s : { open: [] };
    } catch {
      return { open: [] };
    }
  };
  const save = () => {
    if (quitting) return; // al salir de la app se cierran todas, pero se recuerdan para la próxima vez
    try {
      writeFileSync(o.file, JSON.stringify({ open: [...wins.keys()].map((id) => ({ displayId: id, hash: hashes.get(id) ?? '' })) } satisfies Saved));
    } catch {
      /* sin disco: no se recuerdan */
    }
  };

  const displayLabel = (d: Display, i: number) => {
    const name = d.label?.trim();
    const n = o.T(`Pantalla ${i + 1}`, `Display ${i + 1}`);
    return name ? `${n} · ${name}` : n;
  };

  function list(): ScreenInfo[] {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: displayLabel(d, i),
      width: Math.round(d.size.width * d.scaleFactor),
      height: Math.round(d.size.height * d.scaleFactor),
      primary: d.id === primary,
      open: wins.has(d.id),
    }));
  }

  function open(displayId: number, hash = ''): { ok: boolean; message?: string } {
    const d = screen.getAllDisplays().find((x) => x.id === displayId);
    if (!d) return { ok: false, message: o.T('Esa pantalla ya no está conectada.', 'That display is no longer connected.') };
    const existing = wins.get(displayId);
    if (existing) {
      existing.showInactive();
      return { ok: true };
    }
    if (wins.size >= MAX_SCREENS) {
      return { ok: false, message: o.T(`Como mucho ${MAX_SCREENS} pantallas a la vez.`, `At most ${MAX_SCREENS} displays at a time.`) };
    }
    const win = new BrowserWindow({
      ...d.bounds,
      frame: false,
      // No se activa al tocarla: el juego sigue en primer plano (en Windows también la quita de la barra de tareas).
      focusable: false,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      show: false,
      backgroundColor: '#04070b',
      icon: o.icon,
      title: 'CommandGlass',
      webPreferences: { preload: o.preload, contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    wins.set(displayId, win);
    hashes.set(displayId, hash);
    win.setBounds(d.bounds);
    win.once('ready-to-show', () => win.showInactive());
    win.on('closed', () => {
      wins.delete(displayId);
      save();
      o.changed();
    });
    win.webContents.on('did-navigate-in-page', (_e, url) => {
      hashes.set(displayId, new URL(url).hash.replace(/^#/, ''));
      save();
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^(https?|mailto):/.test(url)) o.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
      if (!url.startsWith(o.url())) e.preventDefault();
    });
    void win.loadURL(`${o.url()}${hash ? `#${hash}` : ''}`);
    o.log(`[pantallas] abierta en ${displayLabel(d, screen.getAllDisplays().indexOf(d))} (${d.bounds.width}×${d.bounds.height})`);
    save();
    o.changed();
    return { ok: true };
  }

  function close(displayId: number) {
    wins.get(displayId)?.close();
  }

  function toggle(displayId: number) {
    if (wins.has(displayId)) {
      close(displayId);
      return { ok: true };
    }
    return open(displayId);
  }

  /** Al arrancar: las que estaban abiertas, si su pantalla sigue conectada. */
  function restore() {
    const ids = new Set(screen.getAllDisplays().map((d) => d.id));
    for (const s of read().open.slice(0, MAX_SCREENS)) if (ids.has(s.displayId)) open(s.displayId, s.hash);
  }

  /** Recargar todas (el servidor se ha reiniciado: otra versión del juego, otra carpeta…). */
  function reload() {
    for (const w of wins.values()) w.webContents.reload();
  }

  screen.on('display-removed', (_e, d) => close(d.id));
  screen.on('display-metrics-changed', (_e, d) => wins.get(d.id)?.setBounds(d.bounds));

  // ---------------------------------------------------------------- escribir texto

  const owner = (e: IpcMainEvent) => [...wins.values()].find((w) => w.webContents === e.sender) ?? null;

  ipcMain.on('cg:screen-keyboard', (e, on: unknown) => {
    const win = owner(e);
    if (!win) return;
    if (on === true) {
      // Para escribir hace falta el teclado: la ventana coge el foco mientras tanto.
      win.setFocusable(true);
      win.focus();
    } else {
      win.setFocusable(false);
      win.blur();
      focusGame();
    }
  });

  /**
   * Devuelve el primer plano a Star Citizen. Lo pide un PowerShell lanzado desde esta app mientras aún está en primer
   * plano (Windows solo deja cambiarlo a quien lo tiene). Si el juego no está abierto, no hace nada.
   */
  function focusGame() {
    const ps = String.raw`$p = Get-Process StarCitizen -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($p) {
  Add-Type -Namespace CG -Name W -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetForegroundWindow(System.IntPtr h);'
  [void][CG.W]::SetForegroundWindow($p.MainWindowHandle)
}`;
    try {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true, stdio: 'ignore' });
      child.on('error', () => {});
    } catch {
      /* sin PowerShell: el jugador hace clic en el juego */
    }
  }

  return {
    list,
    toggle,
    restore,
    reload,
    get count() {
      return wins.size;
    },
    /** Al salir de la app: se cierran sin olvidarlas. */
    closeAllForQuit() {
      quitting = true;
      for (const w of wins.values()) w.destroy();
    },
  };
}
