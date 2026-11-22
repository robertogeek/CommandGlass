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
  | { ok: false; reason: 'not-found' | 'game-running' | 'launcher-running' | 'failed'; detail?: string };

function run(file: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 10_000 }, (_err, stdout) => resolve(String(stdout ?? '')));
  });
}

async function isRunning(exe: string): Promise<boolean> {
  const out = await run('tasklist', ['/FI', `IMAGENAME eq ${exe}`, '/FO', 'CSV', '/NH']);
  return out.toLowerCase().includes(`"${exe.toLowerCase()}"`);
}

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
  let closed = false;
  if (await isRunning(LAUNCHER_EXE)) {
    if (!closeFirst) return { ok: false, reason: 'launcher-running' };
    // Se queda en la bandeja al cerrar su ventana, así que hay que terminar el proceso (y sus hijos).
    await run('taskkill', ['/IM', LAUNCHER_EXE, '/T', '/F']);
    if (!(await waitUntilClosed(LAUNCHER_EXE, 10_000))) return { ok: false, reason: 'failed', detail: 'still running' };
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
    return { ok: false, reason: 'failed', detail: (err as Error).message };
  }
}
