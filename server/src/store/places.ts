import { normName, type MapBody, type StarmapData } from '../game/starmap.ts';
import { jumpGate } from '../parser/names.ts';
import type { Store } from './db.ts';

/**
 * Lugares visitados y rutas, a partir de las llegadas (travel.location).
 * El registro da el sitio y, casi siempre, su sistema y planeta o luna; aquí se completa lo que falta
 * (estaciones de salto, Levski, Grim HEX…), se agrupan las lunas bajo su planeta y se busca cada sitio
 * en el starmap del juego para pintarlo en su posición real.
 */

/** Lunas → planeta. */
export const MOON_OF: Record<string, string> = {
  Arial: 'Hurston', Aberdeen: 'Hurston', Magda: 'Hurston', Ita: 'Hurston',
  Cellin: 'Crusader', Daymar: 'Crusader', Yela: 'Crusader',
  Lyria: 'ArcCorp', Wala: 'ArcCorp',
  Calliope: 'microTech', Clio: 'microTech', Euterpe: 'microTech',
  Ignis: 'Pyro V', Vatra: 'Pyro V', Adir: 'Pyro V', Fairo: 'Pyro V', Fuego: 'Pyro V', Vuur: 'Pyro V',
};

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
  body: string | null;
  planet: string | null;
}

/** Dónde cae un sitio en el starmap del juego. */
export interface PlaceAt {
  /** Id del objeto del starmap (el propio sitio o, si no está, su planeta o luna). */
  at: string | null;
  /** true si es el propio sitio; false si se ha colocado en su planeta, luna o cinturón. */
  exact: boolean;
  /** Cinturón de asteroides donde está, si es lo único que se sabe (bases del Keeger Belt…). */
  belt: string | null;
}

/** Completa sistema y planeta cuando el registro no los trae. */
export function placeInfo(code: string, system: string | null, body: string | null): { system: string | null; body: string | null; planet: string | null } {
  let sys = system;
  let b = body;
  const jp = jumpGate(code);
  if (!sys && jp) sys = jp.from;
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

/** Busca sitios del registro en el starmap: por nombre, y si no, su planeta o luna, o su cinturón. */
export function placeLocator(map: StarmapData | null): (p: { code: string; name: string; system: string | null; body: string | null }) => PlaceAt {
  const index = new Map<string, Map<string, MapBody>>();
  for (const s of map?.systems ?? []) {
    const idx = new Map<string, MapBody>();
    // Lo visible antes que lo oculto si se llaman igual.
    for (const b of [...s.bodies].sort((a, c) => Number(!!a.hidden) - Number(!!c.hidden))) {
      const k = normName(b.name);
      if (!idx.has(k)) idx.set(k, b);
    }
    index.set(s.name.toLowerCase(), idx);
  }
  const beltsOf = new Map((map?.systems ?? []).map((s) => [s.name.toLowerCase(), s.belts]));
  return (p) => {
    const none: PlaceAt = { at: null, exact: false, belt: null };
    const sys = p.system?.toLowerCase() ?? '';
    const idx = index.get(sys);
    if (!idx) return none;
    const hit = idx.get(normName(p.name));
    if (hit) return { at: hit.id, exact: true, belt: null };
    const belt = beltsOf.get(sys)?.find((b) => b.name && new RegExp(b.name.split(' ')[0]!, 'i').test(p.code));
    if (belt) return { at: null, exact: false, belt: belt.name };
    const body = p.body ? idx.get(normName(p.body)) : undefined;
    if (body) return { at: body.id, exact: false, belt: null };
    return none;
  };
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
      return { ts: r.ts, code: d.code, name: d.name ?? d.code, system: info.system, body: info.body, planet: info.planet };
    });
  return { places, route, routeSessionId: lastSession };
}

/** Saltos usados: cada llegada a una puerta cuenta para el salto entre su sistema y el de destino. */
export function jumpVisits(places: Place[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of places) {
    const jp = jumpGate(p.code);
    if (!jp) continue;
    const k = [jp.from, jp.to].sort().join('|');
    out.set(k, (out.get(k) ?? 0) + p.visits);
  }
  return out;
}
