import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { backupKeyFromFilename } from '../parser/line.ts';
import type { Store } from '../store/db.ts';
import { SessionIngestor } from './session.ts';

export interface ImportProgress {
  file: string;
  index: number;
  total: number;
  events: number;
  skipped: boolean;
}

/** Importa (o completa) todos los logs archivados en logbackups/, del más antiguo al más reciente. */
export function importBackups(
  store: Store,
  dir: string,
  onProgress?: (p: ImportProgress) => void,
): { files: number; imported: number; events: number } {
  if (!existsSync(dir)) return { files: 0, imported: 0, events: 0 };
  const files = readdirSync(dir)
    .filter((f) => backupKeyFromFilename(f))
    .map((f) => ({ name: f, path: join(dir, f), stat: statSync(join(dir, f)) }))
    .sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);

  let imported = 0;
  let total = 0;
  files.forEach((f, index) => {
    const key = backupKeyFromFilename(f.name)!;
    const existing = store.getSession(key);
    const ing = new SessionIngestor(store, key);
    if (existing && ing.offset >= f.stat.size) {
      onProgress?.({ file: f.name, index, total: files.length, events: 0, skipped: true });
      return;
    }
    let events;
    try {
      events = ing.readFrom(f.path);
    } catch (err) {
      // Un log dañado o ilegible no impide arrancar: se salta y se sigue con los demás.
      console.warn(`Historial: no se ha podido leer ${f.name} (${(err as Error).message})`);
      onProgress?.({ file: f.name, index, total: files.length, events: 0, skipped: true });
      return;
    }
    imported++;
    total += events.length;
    onProgress?.({ file: f.name, index, total: files.length, events: events.length, skipped: false });
  });
  return { files: files.length, imported, events: total };
}
