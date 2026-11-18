import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Localiza la carpeta LIVE de Star Citizen (la que tiene Data.p4k, Game.log y logbackups/).
 * Orden: lo que diga el lanzador de RSI en su log → rutas habituales en todas las unidades.
 * Solo lee; nunca escribe en la carpeta del juego.
 */

/** Una carpeta vale si tiene el juego instalado (Data.p4k) o al menos un Game.log. */
export function isGameDir(dir: string): boolean {
  return existsSync(join(dir, 'Data.p4k')) || existsSync(join(dir, 'Game.log'));
}

/**
 * Acepta también la carpeta de arriba (…\StarCitizen) o la del lanzador (…\Roberts Space Industries)
 * y baja hasta LIVE. Devuelve null si ahí no hay juego.
 */
export function normalizeGameDir(dir: string): string | null {
  const clean = dir.trim().replace(/[\\/]+$/, '');
  if (!clean) return null;
  const candidates = [clean, join(clean, 'LIVE'), join(clean, 'StarCitizen', 'LIVE'), join(clean, 'PTU'), join(clean, 'StarCitizen', 'PTU')];
  return candidates.find(isGameDir) ?? null;
}

/** Rutas que el lanzador de RSI escribe al arrancar el juego: "Launching Star Citizen LIVE from (C:\…\LIVE)". */
export function gameDirsFromLauncherLog(text: string): string[] {
  const found: { channel: string; dir: string }[] = [];
  for (const m of text.matchAll(/Launching Star Citizen (\w+) from \((.+?)\)/g)) {
    found.push({ channel: m[1]!, dir: m[2]!.replace(/\\\\/g, '\\') });
  }
  // Las más recientes primero, y LIVE antes que PTU/EPTU.
  const ordered = found.reverse().sort((a, b) => Number(b.channel === 'LIVE') - Number(a.channel === 'LIVE'));
  return [...new Set(ordered.map((f) => f.dir))];
}

const COMMON_SUBPATHS = [
  'Program Files\\Roberts Space Industries\\StarCitizen\\LIVE',
  'Roberts Space Industries\\StarCitizen\\LIVE',
  'StarCitizen\\LIVE',
  'Games\\Roberts Space Industries\\StarCitizen\\LIVE',
  'Games\\StarCitizen\\LIVE',
  'Program Files (x86)\\Roberts Space Industries\\StarCitizen\\LIVE',
];

export interface LocateOptions {
  appData?: string | undefined;
  drives?: string[];
}

export function locateGameDir(opts: LocateOptions = {}): string | null {
  const appData = opts.appData ?? process.env.APPDATA;
  if (appData) {
    for (const file of ['log.log', 'log.old.log']) {
      const path = join(appData, 'rsilauncher', 'logs', file);
      if (!existsSync(path)) continue;
      try {
        for (const dir of gameDirsFromLauncherLog(readFileSync(path, 'utf8'))) {
          if (isGameDir(dir)) return dir;
        }
      } catch {
        /* log bloqueado o ilegible: se sigue con las rutas habituales */
      }
    }
  }
  const drives = opts.drives ?? 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((d) => `${d}:\\`);
  for (const drive of drives) {
    if (!existsSync(drive)) continue;
    for (const sub of COMMON_SUBPATHS) {
      const dir = join(drive, sub);
      if (isGameDir(dir)) return dir;
    }
  }
  return null;
}
