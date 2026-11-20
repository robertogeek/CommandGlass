import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isGameDir, locateGameDir, normalizeGameDir } from './game/locate.ts';

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** En la app instalada, %APPDATA%\CommandGlass (lo pasa la app de escritorio). En desarrollo, data/. */
export const DATA_DIR = process.env.CG_DATA_DIR ?? join(ROOT_DIR, 'data');
export const CLIENT_DIST = process.env.CG_CLIENT_DIST ?? join(ROOT_DIR, 'client', 'dist');
export const APP_VERSION = process.env.CG_VERSION ?? 'desarrollo';

/** Súbelo cuando cambien las reglas: el historial se vuelve a procesar entero. */
export const PARSER_VERSION = 15;

export interface AppConfig {
  /** Carpeta LIVE (o PTU) de Star Citizen, donde están Game.log y logbackups/. */
  gameDir: string;
  /** false si no se ha encontrado el juego: la interfaz pide elegir la carpeta. */
  gameDirFound: boolean;
  port: number;
  /** Clave para emparejar el iPad. Se genera la primera vez. */
  pairKey: string;
}

interface SavedConfig {
  gameDir?: string;
  port?: number;
  pairKey?: string;
}

const CONFIG_FILE = join(DATA_DIR, 'config.json');
const FALLBACK_GAME_DIR = 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE';

export function readSavedConfig(): SavedConfig {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as SavedConfig;
  } catch {
    return {};
  }
}

export function writeSavedConfig(patch: SavedConfig): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify({ ...readSavedConfig(), ...patch }, null, 2));
}

export function loadConfig(): AppConfig {
  mkdirSync(DATA_DIR, { recursive: true });
  const saved = readSavedConfig();
  // Orden: variable de entorno → elegida antes → la que indicó el instalador → detección automática.
  const candidates = [process.env.SC_GAME_DIR, saved.gameDir, process.env.CG_INSTALL_GAME_DIR];
  let gameDir: string | null = null;
  for (const c of candidates) {
    if (!c) continue;
    gameDir = normalizeGameDir(c);
    if (gameDir) break;
  }
  gameDir ??= locateGameDir();

  const config: AppConfig = {
    gameDir: gameDir ?? saved.gameDir ?? FALLBACK_GAME_DIR,
    gameDirFound: gameDir !== null && isGameDir(gameDir),
    port: Number(process.env.PORT ?? saved.port ?? 8777),
    pairKey: saved.pairKey ?? randomBytes(12).toString('hex'),
  };
  const next: SavedConfig = {
    ...saved,
    // Solo se recuerda una carpeta que de verdad tiene el juego.
    ...(config.gameDirFound ? { gameDir: config.gameDir } : {}),
    port: config.port,
    pairKey: config.pairKey,
  };
  if (JSON.stringify(saved) !== JSON.stringify(next)) writeSavedConfig(next);
  return config;
}

export const gameLogPath = (c: AppConfig) => join(c.gameDir, 'Game.log');
export const backupsDir = (c: AppConfig) => join(c.gameDir, 'logbackups');
export const dbPath = () => join(DATA_DIR, 'sc-master.db');

export function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}
