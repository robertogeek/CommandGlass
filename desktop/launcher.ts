import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Abrir el RSI Launcher con la telemetría del juego encendida (GRPC_CLIENT_SERVER_ENABLED=true).
 * El juego hereda las variables de entorno del launcher, así que basta con lanzarlo con ella puesta.
 * No toca ningún archivo ni ajuste: la variable solo vive en ese proceso y desaparece al cerrarlo.
 */

const LAUNCHER_EXE = 'RSI Launcher.exe';
const GAME_EXE = 'StarCitizen.exe';
// Clave de desinstalación del RSI Launcher (electron-builder la deriva de su appId: es la misma en todos los PCs).
const UNINSTALL_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\81bfc699-f883-50c7-b674-2483b6baae23';

export type LaunchResult =
  | { ok: true; closed: boolean }
  | {
      ok: false;
      /**
       * needs-admin: el launcher está puesto para abrirse como administrador; Windows no deja pasarle la variable.
       * cannot-close: sigue abierto (casi siempre en la bandeja) y Windows no deja cerrarlo desde aquí.
       */
      reason: 'not-found' | 'game-running' | 'launcher-running' | 'needs-admin' | 'cannot-close' | 'failed';
      detail?: string;
    };

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 10_000 }, (_err, stdout) => resolve(String(stdout ?? '')));
  });
}

/** Como run, pero también el código de salida y el error (taskkill avisa por stderr). */
function runFull(file: string, args: string[]): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 10_000 }, (err, stdout, stderr) =>
      resolve({ code: typeof err?.code === 'number' ? err.code : err ? 1 : 0, out: `${stdout ?? ''}${stderr ?? ''}`.trim() }),
    );
  });
}

/**
 * ¿Tiene el launcher «Ejecutar como administrador» (Propiedades → Compatibilidad)? Entonces Windows lo abre con
 * permisos elevados: CommandGlass no puede abrirlo con la variable ni cerrarlo.
 */
async function runsAsAdmin(exe: string): Promise<boolean> {
  for (const hive of ['HKCU', 'HKLM']) {
    const out = await run('reg', ['query', `${hive}\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers`]);
    for (const line of out.split(/\r?\n/)) {
      const m = /^\s+(.+?)\s+REG_SZ\s+(.*)$/.exec(line);
      if (m && m[1]!.toLowerCase() === exe.toLowerCase() && /\bRUNASADMIN\b/i.test(m[2]!)) return true;
    }
  }
  return false;
}

async function isRunning(exe: string): Promise<boolean> {
  const out = await run('tasklist', ['/FI', `IMAGENAME eq ${exe}`, '/FO', 'CSV', '/NH']);
  return out.toLowerCase().includes(`"${exe.toLowerCase()}"`);
}

/** ¿Está Star Citizen abierto? */
export const isGameRunning = (): Promise<boolean> => isRunning(GAME_EXE);

/** Carpeta del launcher según su desinstalador (DisplayIcon apunta a un archivo de su carpeta). */
async function fromRegistry(): Promise<string | null> {
  const out = await run('reg', ['query', UNINSTALL_KEY, '/v', 'DisplayIcon']);
  const m = /DisplayIcon\s+REG_\w+\s+(.+)/.exec(out);
  if (!m?.[1]) return null;
  const icon = m[1].trim().replace(/^"|"$/g, '').replace(/,\d+$/, '');
  return join(dirname(icon), LAUNCHER_EXE);
}

/** Dónde está el RSI Launcher: registro, junto a la carpeta del juego o en la ruta de siempre. */
export async function findLauncher(starCitizenRoot: string | null): Promise<string | null> {
  const candidates = [
    await fromRegistry(),
    // ...\Roberts Space Industries\StarCitizen → ...\Roberts Space Industries\RSI Launcher
    starCitizenRoot ? join(dirname(starCitizenRoot), 'RSI Launcher', LAUNCHER_EXE) : null,
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Roberts Space Industries', 'RSI Launcher', LAUNCHER_EXE),
  ];
  return candidates.find((p): p is string => Boolean(p && existsSync(p))) ?? null;
}

async function waitUntilClosed(exe: string, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (!(await isRunning(exe))) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

/**
 * Abre el launcher con la telemetría. Si ya está abierto no sirve (la segunda copia se cierra y le pasa el
 * testigo a la primera, sin la variable): se avisa, y con `closeFirst` se cierra antes. Con el juego abierto no se
 * toca nada: cerrar el launcher no lo apaga, pero la telemetría no llegaría hasta volver a abrirlo.
 */
export async function launchWithTelemetry(starCitizenRoot: string | null, closeFirst: boolean): Promise<LaunchResult> {
  const exe = await findLauncher(starCitizenRoot);
  if (!exe) return { ok: false, reason: 'not-found' };
  if (await isRunning(GAME_EXE)) return { ok: false, reason: 'game-running' };
  // Con «Ejecutar como administrador» no hay forma de pasarle la variable desde aquí: mejor decirlo antes de cerrar nada.
  if (await runsAsAdmin(exe)) return { ok: false, reason: 'needs-admin', detail: 'RUNASADMIN' };
  let closed = false;
  if (await isRunning(LAUNCHER_EXE)) {
    if (!closeFirst) return { ok: false, reason: 'launcher-running' };
    // Se queda en la bandeja al cerrar su ventana, así que hay que terminar el proceso (y sus hijos).
    const kill = await runFull('taskkill', ['/IM', LAUNCHER_EXE, '/T', '/F']);
    if (!(await waitUntilClosed(LAUNCHER_EXE, 10_000))) {
      // Casi siempre: el launcher se abrió como administrador (Windows no deja cerrarlo a una app normal).
      return { ok: false, reason: 'cannot-close', detail: `taskkill ${kill.code}: ${kill.out.slice(0, 200)}` };
    }
    closed = true;
  }
  // El launcher también es Electron: no debe heredar las variables de Electron ni de Node de CommandGlass.
  const env: NodeJS.ProcessEnv = { GRPC_CLIENT_SERVER_ENABLED: 'true' };
  for (const [k, v] of Object.entries(process.env)) if (!/^(ELECTRON_|NODE_)/i.test(k) && k !== 'GRPC_CLIENT_SERVER_ENABLED') env[k] = v;
  try {
    const child = spawn(exe, [], {
      cwd: dirname(exe),
      env,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    child.unref();
    return { ok: true, closed };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    // ERROR_ELEVATION_REQUIRED (740): el ejecutable pide permisos de administrador.
    if (e.code === 'EACCES' || /\b740\b|elevat/i.test(e.message)) return { ok: false, reason: 'needs-admin', detail: e.message };
    return { ok: false, reason: 'failed', detail: e.message };
  }
}
