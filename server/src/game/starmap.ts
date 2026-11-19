import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Mapa estelar del juego, tal como está en los archivos de cada parche: posiciones reales (en km) de estrellas,
 * planetas, lunas, estaciones, ciudades, puestos y puertas de salto. Lo extrae la Star Citizen Wiki en
 * github.com/StarCitizenWiki/scunpacked-data (starmap.json + starmap_positions.json), un commit por build del juego.
 * Aquí se descarga, se reduce a lo que pinta el mapa y se guarda en data/game/community/starmap.json.
 *
 * No es el starmap de la web de RSI: ese es el del lore (saltos a sistemas que no están en el juego, Delamar
 * como planeta…). Este es el que hay en el juego.
 */

const REPO = 'StarCitizenWiki/scunpacked-data';
const RAW = `https://raw.githubusercontent.com/${REPO}/master/`;
const COMMITS = `https://api.github.com/repos/${REPO}/commits?per_page=1&path=starmap_positions.json`;
const UA = { 'user-agent': 'CommandGlass (herramienta de fans de Star Citizen)' };
const CHECK_EVERY_MS = 12 * 3600_000;
const FILE_VERSION = 1;

export type BodyKind = 'star' | 'planet' | 'moon' | 'city' | 'station' | 'gateway' | 'outpost' | 'asteroid' | 'poi';

export interface MapBody {
  id: string;
  name: string;
  kind: BodyKind;
  parent: string | null;
  /** Posición en km respecto a la estrella (vista desde arriba: el plano de la eclíptica es x/y). */
  x: number;
  y: number;
  /** Radio en km (planetas y lunas). */
  radius?: number;
  /** Oculto en el starmap del juego hasta que lo descubres; solo se manda si has estado allí. */
  hidden?: boolean;
}

export interface MapBelt {
  name: string | null;
  /** Radios en km desde la estrella. */
  inner: number;
  outer: number;
}

export interface MapSystem {
  name: string;
  bodies: MapBody[];
  belts: MapBelt[];
}

export interface StarmapData {
  version: number;
  /** Build del juego del que salen los datos ("4.10.3-LIVE.13165946"). */
  build: string;
  sha: string;
  fetchedAt: string;
  systems: MapSystem[];
  /** Saltos entre sistemas según las puertas que hay en el juego (incluye destinos aún cerrados, como Terra). */
  jumps: [string, string][];
}

interface RawPos {
  uuid: string;
  name: string;
  type: string;
  system: string;
  parent_uuid: string | null;
  hidden: boolean;
  x: number;
  y: number;
}

interface RawObj {
  UUID: string;
  Name: string;
  ParentUUID: string | null;
  HideInStarmap: boolean;
  Size: number;
  NavIcon?: string;
  Type: { Name: string } | null;
  AsteroidRing: { InnerRadius: number; OuterRadius: number } | null;
}

const KIND: Record<string, BodyKind> = {
  Star: 'star',
  Planet: 'planet',
  Moon: 'moon',
  LandingZone: 'city',
  Manmade: 'station',
  Manmade_VisibleOnInteraction: 'station',
  Outpost: 'outpost',
  Outpost_InvalidQT: 'outpost',
  Asteroid_ValidQT: 'asteroid',
  NavPoint: 'poi',
};

/**
 * Cuerpos que el juego tiene en el starmap pero sin posición propia en los datos: se colocan donde está lo que
 * se sabe que hay en ellos. Levski está excavada en Delamar, el asteroide del Glaciem Ring.
 */
const ANCHOR: Record<string, string> = { Delamar: 'Levski' };

/** Anillos y cinturones: nombre del objeto del juego → palabra con la que empiezan sus puntos con posición. */
const BELT_RE = /^(\w+)\s+(Ring|Belt|Halo)$/;

/** Reduce los dos ficheros de scunpacked a lo que necesita el mapa. */
export function reduceStarmap(positions: { entities: RawPos[] }, objects: RawObj[], build: string, sha: string, fetchedAt: string): StarmapData {
  const objBy = new Map(objects.map((o) => [o.UUID, o]));
  const ents = positions.entities;
  const starOf = new Map<string, RawPos>();
  for (const e of ents) if (e.type === 'Star') starOf.set(e.system, e);

  const systems: MapSystem[] = [];
  const jumps = new Map<string, [string, string]>();
  for (const [sys, star] of starOf) {
    const bodies: MapBody[] = [];
    const seen = new Map<string, number>();
    const idOf = new Map<string, string>();
    for (const e of ents) {
      if (e.system !== sys || !e.name) continue;
      const kind = KIND[e.type];
      if (!kind) continue;
      // Las clínicas de las estaciones van dentro de la estación: no son un sitio aparte en el mapa.
      if (e.hidden && / Clinic$/.test(e.name)) continue;
      // Los asteroides con nombre solo cuentan si son un sitio (bases); los visibles sin más son marcas de minería.
      if (kind === 'asteroid' && !e.hidden && /^(RAB|RMB)-|^Cluster |^PY|^CRU L|^Mining Base /.test(e.name)) continue;
      const n = seen.get(e.uuid) ?? 0;
      seen.set(e.uuid, n + 1);
      const id = n ? `${e.uuid}#${n}` : e.uuid;
      if (!n) idOf.set(e.uuid, id);
      const o = objBy.get(e.uuid);
      const isGateway = kind === 'station' && / Gateway$/.test(e.name);
      // Levski es "Manmade" pero el juego la marca como zona de aterrizaje, igual que Lorville o Area18.
      const finalKind: BodyKind = isGateway ? 'gateway' : kind === 'station' && o?.NavIcon === 'LandingZone' ? 'city' : kind;
      const body: MapBody = { id, name: e.name, kind: finalKind, parent: e.parent_uuid, x: Math.round(e.x / 1000), y: Math.round(e.y / 1000) };
      if ((kind === 'planet' || kind === 'moon') && o?.Size) body.radius = Math.round(o.Size / 1000);
      if (e.hidden) body.hidden = true;
      bodies.push(body);
      if (isGateway && !e.hidden) {
        const to = e.name.replace(/ Gateway$/, '');
        const a = star.name;
        const pair: [string, string] = a < to ? [a, to] : [to, a];
        jumps.set(pair.join('|'), pair);
      }
    }
    // Padres que no se pintan (anillos, puntos ocultos) → el cuerpo pintado más cercano hacia arriba, o la estrella.
    const kept = new Set(bodies.map((b) => b.id));
    for (const b of bodies) {
      let p = b.parent;
      while (p && !kept.has(p)) p = objBy.get(p)?.ParentUUID ?? null;
      b.parent = b.kind === 'star' ? null : (p ?? star.uuid);
    }
    // Cuerpos sin posición en los datos (Delamar).
    for (const o of objects) {
      const anchorName = ANCHOR[o.Name];
      if (!anchorName || o.HideInStarmap) continue;
      const anchor = bodies.find((b) => b.name === anchorName);
      if (!anchor || bodies.some((b) => b.name === o.Name)) continue;
      const kind = KIND[o.Type?.Name ?? ''] ?? 'moon';
      bodies.push({ id: o.UUID, name: o.Name, kind, parent: star.uuid, x: anchor.x, y: anchor.y, radius: Math.round(o.Size / 1000) });
      anchor.parent = o.UUID;
    }
    // Anillos: el de la propia estrella (AsteroidRing) y los objetos "X Ring/Belt" con los puntos que llevan su nombre.
    const belts: MapBelt[] = [];
    const starObj = objBy.get(star.uuid);
    if (starObj?.AsteroidRing) belts.push({ name: null, inner: Math.round(starObj.AsteroidRing.InnerRadius / 1000), outer: Math.round(starObj.AsteroidRing.OuterRadius / 1000) });
    for (const o of objects) {
      const m = BELT_RE.exec(o.Name);
      if (!m || o.ParentUUID !== star.uuid || o.HideInStarmap) continue;
      const word = m[1]!;
      const rs = ents.filter((e) => e.system === sys && e.name.startsWith(`${word} `)).map((e) => Math.hypot(e.x, e.y) / 1000);
      if (!rs.length) continue;
      const lo = Math.min(...rs);
      const hi = Math.max(...rs);
      const pad = Math.max(200_000, (hi - lo) * 0.1);
      belts.push({ name: o.Name, inner: Math.round(lo - pad), outer: Math.round(hi + pad) });
    }
    systems.push({ name: star.name, bodies, belts });
  }
  const order = ['Stanton', 'Pyro', 'Nyx'];
  systems.sort((a, b) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99) || a.name.localeCompare(b.name));
  return { version: FILE_VERSION, build, sha, fetchedAt, systems, jumps: [...jumps.values()] };
}

export class GameStarmap {
  private file: string;
  private data: StarmapData | null = null;
  private checkedAt = 0;
  private refreshing: Promise<void> | null = null;
  lastError: string | null = null;

  constructor(dataDir: string) {
    const dir = join(dataDir, 'game', 'community');
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'starmap.json');
    if (existsSync(this.file)) {
      try {
        const d = JSON.parse(readFileSync(this.file, 'utf8')) as StarmapData;
        if (d.version === FILE_VERSION) this.data = d;
      } catch {
        /* se vuelve a descargar */
      }
    }
  }

  /** Lo que haya ahora mismo; si toca, mira en segundo plano si hay datos de un parche nuevo. */
  get(): StarmapData | null {
    if (Date.now() - this.checkedAt > CHECK_EVERY_MS) void this.refresh();
    return this.data;
  }

  get info() {
    return { source: 'scunpacked-data (Star Citizen Wiki)', build: this.data?.build ?? null, fetchedAt: this.data?.fetchedAt ?? null, error: this.lastError };
  }

  refresh(): Promise<void> {
    this.checkedAt = Date.now();
    this.refreshing ??= (async () => {
      const res = await fetch(COMMITS, { headers: { ...UA, accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
      const [last] = (await res.json()) as { sha: string; commit: { message: string } }[];
      if (!last) throw new Error('sin commits');
      if (this.data?.sha === last.sha) return;
      const get = async (name: string) => {
        const r = await fetch(`${RAW}${name}`, { headers: UA, signal: AbortSignal.timeout(60_000) });
        if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
        return r.json();
      };
      const [positions, objects] = await Promise.all([get('starmap_positions.json'), get('starmap.json')]);
      const build = last.commit.message.split('\n')[0]!.trim();
      const data = reduceStarmap(positions as { entities: RawPos[] }, objects as RawObj[], build, last.sha, new Date().toISOString());
      if (!data.systems.length) throw new Error('los datos no traen sistemas');
      this.data = data;
      writeFileSync(this.file, JSON.stringify(data));
      this.lastError = null;
      console.log(`[comunidad] Starmap ${build}: ${data.systems.map((s) => `${s.name} ${s.bodies.length}`).join(', ')}`);
    })()
      .catch((err: Error) => {
        this.lastError = err.message;
        // Sin red: se reintenta en una hora, sin tocar la copia que hubiera.
        this.checkedAt = Date.now() - CHECK_EVERY_MS + 3600_000;
        console.warn(`[comunidad] Starmap: ${err.message}`);
      })
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }
}

/** "Arc Corp Mining Area 048" y "ArcCorp Mining Area 048" son lo mismo. */
export function normName(s: string): string {
  return s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
}
