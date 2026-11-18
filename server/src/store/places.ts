import type { Store } from './db.ts';

/**
 * Lugares visitados y rutas, a partir de las llegadas (travel.location).
 * El registro da el sitio y, casi siempre, su sistema y planeta o luna; aquí se completa lo que falta
 * (estaciones de salto, Levski, Grim HEX…) y se agrupan las lunas bajo su planeta.
 */

/** Lunas → planeta. */
export const MOON_OF: Record<string, string> = {
  Arial: 'Hurston', Aberdeen: 'Hurston', Magda: 'Hurston', Ita: 'Hurston',
  Cellin: 'Crusader', Daymar: 'Crusader', Yela: 'Crusader',
  Lyria: 'ArcCorp', Wala: 'ArcCorp',
  Calliope: 'microTech', Clio: 'microTech', Euterpe: 'microTech',
  Ignis: 'Pyro V', Vatra: 'Pyro V', Adir: 'Pyro V', Fairo: 'Pyro V', Fuego: 'Pyro V', Vuur: 'Pyro V',
};

/** Planetas por sistema, en orden desde la estrella. */
export const SYSTEMS: Record<string, string[]> = {
  Stanton: ['Hurston', 'Crusader', 'ArcCorp', 'microTech'],
  Pyro: ['Pyro I', 'Pyro II', 'Pyro III', 'Pyro IV', 'Pyro V', 'Pyro VI'],
  Nyx: ['Nyx I', 'Nyx II', 'Delamar', 'Nyx III'],
};

/** Conexiones por salto entre sistemas. */
export const JUMPS: [string, string][] = [
  ['Stanton', 'Pyro'],
  ['Pyro', 'Nyx'],
  ['Nyx', 'Castra'],
  ['Stanton', 'Magnus'],
];

export interface Place {
  code: string;
  name: string;
  system: string | null;
  /** Planeta o luna donde está (o null si está en el espacio: estaciones de salto, cinturones…). */
  body: string | null;
  /** Planeta al que pertenece (para lunas, su planeta). */
  planet: string | null;
  visits: number;
  first: string;
  last: string;
}

export interface RouteStop {
  ts: string;
  code: string;
  name: string;
  system: string | null;
  planet: string | null;
}

/** Completa sistema y planeta cuando el registro no los trae. */
export function placeInfo(code: string, system: string | null, body: string | null): { system: string | null; body: string | null; planet: string | null } {
  let sys = system;
  let b = body;
  const jp = /^RR_JP_([A-Z][a-z]+)/.exec(code);
  if (!sys && jp) sys = jp[1]!;
  if (/^Nyx_Levski/i.test(code)) (sys ??= 'Nyx'), (b ??= 'Delamar');
  if (/^GrimHEX/i.test(code)) (sys ??= 'Stanton'), (b ??= 'Yela');
  const st = /^Stanton(\d)/.exec(code);
  if (!sys && st) sys = 'Stanton';
  if (!sys && /Stanton/i.test(code)) sys = 'Stanton';
  if (!sys && /Pyro/i.test(code)) sys = 'Pyro';
  if (!sys && /Nyx/i.test(code)) sys = 'Nyx';
  const planet = b ? (MOON_OF[b] ?? b) : null;
  return { system: sys, body: b, planet };
}

interface Row {
  session_id: number;
  ts: string;
  data: string;
}

export function foldPlaces(rows: Row[]): Place[] {
  const map = new Map<string, Place>();
  for (const r of rows) {
    const d = JSON.parse(r.data) as { code?: string; name?: string; system?: string | null; body?: string | null };
    if (!d.code) continue;
    const info = placeInfo(d.code, d.system ?? null, d.body ?? null);
    const p = map.get(d.code);
    if (p) {
      p.visits++;
      p.last = r.ts;
    } else {
      map.set(d.code, { code: d.code, name: d.name ?? d.code, ...info, visits: 1, first: r.ts, last: r.ts });
    }
  }
  return [...map.values()].sort((a, b) => b.visits - a.visits);
}

export function loadPlaces(store: Store): { places: Place[]; route: RouteStop[]; routeSessionId: number | null } {
  const rows = store.db.prepare(`SELECT session_id, ts, data FROM events WHERE type = 'travel.location' ORDER BY id`).all() as unknown as Row[];
  const places = foldPlaces(rows);
  // Ruta de la última sesión con viajes.
  const lastSession = rows.at(-1)?.session_id ?? null;
  const route: RouteStop[] = rows
    .filter((r) => r.session_id === lastSession)
    .map((r) => {
      const d = JSON.parse(r.data) as { code: string; name?: string; system?: string | null; body?: string | null };
      const info = placeInfo(d.code, d.system ?? null, d.body ?? null);
      return { ts: r.ts, code: d.code, name: d.name ?? d.code, system: info.system, planet: info.planet };
    });
  return { places, route, routeSessionId: lastSession };
}
