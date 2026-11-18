import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = join(ROOT_DIR, 'data');
export const CLIENT_DIST = join(ROOT_DIR, 'client', 'dist');

/** Súbelo cuando cambien las reglas: el historial se vuelve a procesar entero. */
export const PARSER_VERSION = 4;

export interface AppConfig {
  /** Carpeta LIVE (o PTU) de Star Citizen, donde están Game.log y logbackups/. */
  gameDir: string;
  port: number;
  /** Clave para emparejar el iPad. Se genera la primera vez. */
  pairKey: string;
}

const CONFIG_FILE = join(DATA_DIR, 'config.json');

const DEFAULT_GAME_DIRS = [
  'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE',
  'D:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE',
  'D:\\Roberts Space Industries\\StarCitizen\\LIVE',
  'E:\\Roberts Space Industries\\StarCitizen\\LIVE',
];

export function loadConfig(): AppConfig {
  mkdirSync(DATA_DIR, { recursive: true });
  let saved: Partial<AppConfig> = {};
  if (existsSync(CONFIG_FILE)) {
    saved = JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as Partial<AppConfig>;
  }
  const gameDir =
    process.env.SC_GAME_DIR ??
    saved.gameDir ??
    DEFAULT_GAME_DIRS.find((d) => existsSync(join(d, 'Game.log'))) ??
    DEFAULT_GAME_DIRS[0]!;
  const config: AppConfig = {
    gameDir,
    port: Number(process.env.PORT ?? saved.port ?? 8777),
    pairKey: saved.pairKey ?? randomBytes(12).toString('hex'),
  };
  if (JSON.stringify(saved) !== JSON.stringify(config)) {
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  }
  return config;
}

export const gameLogPath = (c: AppConfig) => join(c.gameDir, 'Game.log');
export const backupsDir = (c: AppConfig) => join(c.gameDir, 'logbackups');
export const dbPath = () => join(DATA_DIR, 'sc-master.db');

export function ensureDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}
