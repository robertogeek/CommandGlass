import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Store } from './db.ts';
import { getSetting, setSetting } from './economy.ts';

/**
 * Token de UEX del jugador. Es uno para toda la app: se guarda en la carpeta común (uex-token.json), no en el
 * historial de cada versión del juego, así que no se vuelve a pedir al cambiar entre LIVE y PTU ni al actualizar.
 * También se copia en los ajustes del historial (donde estaba antes de la 0.1.6), por compatibilidad.
 * Nunca sale del PC salvo hacia UEX, y nunca vuelve a la interfaz.
 */

const file = (sharedDir: string) => join(sharedDir, 'uex-token.json');

function readShared(sharedDir: string): string | null {
  try {
    const t = (JSON.parse(readFileSync(file(sharedDir), 'utf8')) as { token?: unknown }).token;
    return typeof t === 'string' && t ? t : null;
  } catch {
    return null;
  }
}

function writeShared(sharedDir: string, token: string): void {
  mkdirSync(sharedDir, { recursive: true });
  // Escritura atómica: un corte a medias no deja un archivo roto.
  const tmp = `${file(sharedDir)}.tmp`;
  writeFileSync(tmp, JSON.stringify({ token }));
  renameSync(tmp, file(sharedDir));
}

/** El token: el común si existe; si no, el de este historial (y se pasa al común para las demás versiones). */
export function readUexToken(store: Store, sharedDir: string): string | null {
  const shared = readShared(sharedDir);
  if (shared) return shared;
  const own = getSetting<string>(store, 'uexToken');
  if (own && !existsSync(file(sharedDir))) {
    try {
      writeShared(sharedDir, own);
    } catch {
      /* sin permiso de escritura: se sigue usando el del historial */
    }
  }
  return own;
}

export function saveUexToken(store: Store, sharedDir: string, token: string): void {
  writeShared(sharedDir, token);
  setSetting(store, 'uexToken', token);
}
