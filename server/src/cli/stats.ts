import { dbPath } from '../config.ts';
import { Store } from '../store/db.ts';

/** Resumen rápido de la base de datos para comprobar que el parser cuadra. */
const store = new Store(dbPath());
const db = store.db;

console.log('== Totales');
console.log(store.overview());

console.log('\n== Eventos por tipo');
for (const r of db
  .prepare('SELECT type, importance, COUNT(*) AS n FROM events GROUP BY type ORDER BY n DESC')
  .all() as { type: string; importance: number; n: number }[]) {
  console.log(`${String(r.n).padStart(6)}  ${r.type} (imp ${r.importance})`);
}

console.log('\n== Ejemplo por tipo');
for (const r of db
  .prepare('SELECT type, summary FROM events WHERE id IN (SELECT MAX(id) FROM events GROUP BY type) ORDER BY type')
  .all() as { type: string; summary: string }[]) {
  console.log(`${r.type.padEnd(30)} ${r.summary}`);
}

console.log('\n== Jugadores más vistos');
for (const r of db
  .prepare(
    `SELECT name, COUNT(*) AS n, GROUP_CONCAT(DISTINCT role) AS roles FROM mentions
     GROUP BY name ORDER BY n DESC LIMIT 15`,
  )
  .all() as { name: string; n: number; roles: string }[]) {
  console.log(`${String(r.n).padStart(5)}  ${r.name}  [${r.roles}]`);
}
store.close();
