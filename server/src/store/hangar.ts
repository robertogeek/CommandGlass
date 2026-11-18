import type { Store } from './db.ts';

/**
 * Tus naves según el registro: en cuáles has subido (y si eran tuyas), con cuáles has saltado en cuántico,
 * cuáles has perdido. El nombre visible ("Anvil F8C Lightning") se une a su clase ("ANVL_Lightning_F8C")
 * con el catálogo de naves de la wiki.
 */

export interface ShipUse {
  /** Clase del juego si se conoce (clave para la ficha de la wiki). */
  className: string | null;
  name: string;
  own: boolean;
  boarded: number;
  qtJumps: number;
  lost: number;
  sessions: number;
  firstUsed: string;
  lastUsed: string;
}

export interface VehicleName {
  className: string;
  name: string;
  gameName: string | null;
}

interface Row {
  session_id: number;
  ts: string;
  type: string;
  data: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Índice nombre visible → clase. Tolera el orden de palabras ("Lightning F8C" / "F8C Lightning"). */
export function nameIndex(vehicles: VehicleName[]) {
  const exact = new Map<string, VehicleName>();
  const bag = new Map<string, VehicleName>();
  const key = (s: string) => norm(s).split(' ').sort().join(' ');
  // Con nombres repetidos (variantes con el mismo nombre visible) gana la clase más corta: la base.
  const put = (m: Map<string, VehicleName>, k: string, v: VehicleName) => {
    const old = m.get(k);
    if (!old || v.className.length < old.className.length) m.set(k, v);
  };
  for (const v of vehicles) {
    for (const n of [v.gameName, v.name, `${v.className.split('_')[0]} ${v.name}`]) {
      if (!n) continue;
      put(exact, norm(n), v);
      put(bag, key(n), v);
    }
    exact.set(norm(v.className), v);
  }
  return (display: string): VehicleName | null => {
    const clean = display.replace(/^@vehicle_name/i, '');
    return exact.get(norm(clean)) ?? bag.get(key(clean)) ?? null;
  };
}

/** Pura: se prueba sin base de datos. */
export function foldShips(rows: Row[], resolve: (display: string) => VehicleName | null): ShipUse[] {
  const map = new Map<string, ShipUse & { sessionSet: Set<number> }>();
  const touch = (className: string | null, name: string, r: Row) => {
    const k = (className ?? name).toLowerCase();
    let s = map.get(k);
    if (!s) {
      s = { className, name, own: false, boarded: 0, qtJumps: 0, lost: 0, sessions: 0, firstUsed: r.ts, lastUsed: r.ts, sessionSet: new Set() };
      map.set(k, s);
    }
    if (className && !s.className) s.className = className;
    s.lastUsed = r.ts > s.lastUsed ? r.ts : s.lastUsed;
    s.firstUsed = r.ts < s.firstUsed ? r.ts : s.firstUsed;
    s.sessionSet.add(r.session_id);
    return s;
  };
  for (const r of rows) {
    const d = JSON.parse(r.data) as Record<string, unknown>;
    if (r.type === 'ship.boarded') {
      const display = String(d.ship ?? '');
      if (!display) continue;
      const v = resolve(display);
      const s = touch(v?.className ?? null, v?.gameName ?? v?.name ?? display.replace(/^@vehicle_name/i, '').replace(/_/g, ' '), r);
      s.boarded++;
      if (d.own === true) s.own = true;
    } else if (r.type === 'travel.qt_arrived') {
      const cls = String(d.ship ?? '');
      if (!cls || /_PU_AI_/i.test(cls)) continue;
      const v = resolve(cls);
      touch(v?.className ?? cls, v?.gameName ?? v?.name ?? String(d.shipName ?? cls), r).qtJumps++;
    } else if (r.type === 'combat.vehicle_destroyed') {
      if (d.mine !== true || d.destroyed !== true) continue;
      const cls = String(d.cls ?? '');
      const v = resolve(cls);
      const s = touch(v?.className ?? cls, v?.gameName ?? v?.name ?? String(d.ship ?? cls), r);
      s.lost++;
      s.own = true;
    }
  }
  return [...map.values()]
    .map(({ sessionSet, ...s }) => ({ ...s, sessions: sessionSet.size }))
    .sort((a, b) => Number(b.own) - Number(a.own) || b.lastUsed.localeCompare(a.lastUsed));
}

export function loadShips(store: Store, resolve: (display: string) => VehicleName | null): ShipUse[] {
  const rows = store.db
    .prepare(`SELECT session_id, ts, type, data FROM events WHERE type IN ('ship.boarded', 'travel.qt_arrived', 'combat.vehicle_destroyed') ORDER BY id`)
    .all() as unknown as Row[];
  return foldShips(rows, resolve);
}
