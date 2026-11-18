import { backupsDir, dbPath, loadConfig } from '../config.ts';
import { importBackups } from '../ingest/importer.ts';
import { Store } from '../store/db.ts';

const config = loadConfig();
const store = new Store(dbPath());
const dir = backupsDir(config);
console.log(`Importando historial desde ${dir}`);
const t0 = Date.now();
const res = importBackups(store, dir, (p) => {
  if (!p.skipped) console.log(`  [${p.index + 1}/${p.total}] ${p.file} → ${p.events} eventos`);
});
console.log(
  `Listo: ${res.imported} de ${res.files} logs procesados, ${res.events} eventos nuevos en ${((Date.now() - t0) / 1000).toFixed(1)} s`,
);
console.log(store.overview());
store.close();
