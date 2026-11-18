import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { VehicleName } from '../store/hangar.ts';

/**
 * Catálogo de naves y componentes de la Star Citizen Wiki (api.star-citizen.wiki), con copia local en data/game/wiki/.
 * Cada respuesta se guarda 7 días; si la wiki no responde se usa la copia aunque sea vieja.
 */

const API = 'https://api.star-citizen.wiki/api';
const MAX_AGE_MS = 7 * 24 * 3600_000;
const HEADERS = { accept: 'application/json', 'user-agent': 'CommandGlass (herramienta de fans de Star Citizen)' };

type Raw = Record<string, any>;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Tamaño de componente: la wiki usa números (2) o letras (S/M/L). */
export function sizeNumber(v: unknown): number | null {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().toUpperCase();
  if (/^\d+$/.test(s)) return Number(s);
  return ({ XS: 0, S: 1, M: 2, L: 3, XL: 4, C: 4 } as Record<string, number>)[s] ?? null;
}

export type ComponentType = 'Shield' | 'PowerPlant' | 'Cooler' | 'QuantumDrive';
export const COMPONENT_LABEL: Record<ComponentType, string> = {
  Shield: 'Escudo',
  PowerPlant: 'Planta de energía',
  Cooler: 'Refrigerador',
  QuantumDrive: 'Motor cuántico',
};

export interface StockItem {
  slot: string;
  type: string;
  size: number | null;
  name: string;
  className: string;
}

export interface ShipSpec {
  className: string;
  name: string;
  manufacturer: string | null;
  role: string | null;
  size: number | null;
  crew: { min: number | null; max: number | null };
  cargo: number | null;
  medicalTier: number | null;
  speed: { scm: number | null; max: number | null };
  quantum: { speed: number | null; range: number | null; fuel: number | null; spool: number | null };
  hull: number | null;
  shield: { hp: number | null; faces: string | null };
  weapons: { turretDps: number | null; missiles: number | null; missileDamage: number | null };
  insurance: { claim: number | null; expedite: number | null; expediteCost: number | null };
  image: string | null;
  description: string | null;
  webUrl: string | null;
  stock: StockItem[];
  version: string | null;
}

export interface Upgrade {
  name: string;
  className: string;
  manufacturer: string | null;
  grade: string | null;
  klass: string | null;
  /** Valor de la estadística con la que se ordena (más es mejor). */
  stat: number | null;
  statLabel: string;
  price: number | null;
  shop: string | null;
}

const STAT: Record<ComponentType, { label: string; pick: (i: Raw) => number | null }> = {
  Shield: { label: 'Vida del escudo', pick: (i) => num(i.shield?.max_health) },
  PowerPlant: { label: 'Segmentos de energía', pick: (i) => num(i.power_plant?.power_segment_generation) ?? num(i.power_plant?.power_output) },
  Cooler: { label: 'Segmentos de refrigeración', pick: (i) => num(i.cooler?.coolant_segment_generation) ?? num(i.cooler?.cooling_rate) },
  QuantumDrive: { label: 'Velocidad (Mm/s)', pick: (i) => { const v = num(i.quantum_drive?.standard_jump?.drive_speed); return v === null ? null : Math.round(v / 1e5) / 10; } },
};

const STOCK_TYPES = new Set(['Shield', 'PowerPlant', 'Cooler', 'QuantumDrive', 'WeaponGun', 'Turret', 'MissileLauncher', 'Radar']);

/** Recorre los puertos de la nave (y sus hijos) y devuelve lo que lleva montado de serie. */
export function stockLoadout(ports: Raw[] | undefined): StockItem[] {
  const out: StockItem[] = [];
  const walk = (list: Raw[] | undefined, depth: number) => {
    for (const p of list ?? []) {
      const it = p.equipped_item as Raw | undefined;
      if (it?.name && STOCK_TYPES.has(String(it.type))) {
        out.push({ slot: String(p.name ?? ''), type: String(it.type), size: num(p.sizes?.max) ?? sizeNumber(it.size), name: String(it.name), className: String(it.class_name ?? '') });
      }
      if (depth < 3) walk((it?.ports as Raw[] | undefined) ?? (p.ports as Raw[] | undefined), depth + 1);
    }
  };
  walk(ports, 0);
  return out;
}

function cheapest(i: Raw): { price: number | null; shop: string | null } {
  const offers = ((i.uex_prices?.purchase ?? []) as Raw[]).filter((o) => num(o.price_buy));
  offers.sort((a, b) => a.price_buy - b.price_buy);
  const o = offers[0];
  return o ? { price: o.price_buy, shop: String(o.terminal_name ?? o.starmap_location?.name ?? '') || null } : { price: null, shop: null };
}

export class WikiCatalog {
  private dir: string;

  constructor(dataDir: string) {
    this.dir = join(dataDir, 'game', 'wiki');
    mkdirSync(this.dir, { recursive: true });
  }

  /** Descarga con copia local; si falla la red, devuelve la copia aunque haya caducado. */
  private async cached<T>(key: string, load: () => Promise<T>): Promise<T | null> {
    const file = join(this.dir, `${key.replace(/[^\w.-]+/g, '_')}.json`);
    let old: { at: string; data: T } | null = null;
    if (existsSync(file)) {
      try {
        old = JSON.parse(readFileSync(file, 'utf8')) as { at: string; data: T };
        if (Date.now() - Date.parse(old.at) < MAX_AGE_MS) return old.data;
      } catch {
        old = null;
      }
    }
    try {
      const data = await load();
      writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), data }));
      return data;
    } catch (err) {
      console.warn(`[wiki] ${key}: ${(err as Error).message}`);
      return old?.data ?? null;
    }
  }

  private async get(path: string): Promise<Raw> {
    const res = await fetch(`${API}${path}`, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
    if (res.status === 404) return { data: null };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as Raw;
  }

  async vehicleNames(): Promise<VehicleName[]> {
    return (
      (await this.cached('vehicles', async () => {
        const out: VehicleName[] = [];
        let page = 1;
        let last = 1;
        do {
          const j = await this.get(`/vehicles?page%5Bsize%5D=200&page%5Bnumber%5D=${page}`);
          for (const v of (j.data ?? []) as Raw[]) {
            if (v.class_name && !/_Display$|_Template$/i.test(v.class_name)) out.push({ className: v.class_name, name: v.name, gameName: v.game_name ?? null });
          }
          last = j.meta?.last_page ?? page;
          page++;
        } while (page <= last && page <= 20);
        return out;
      })) ?? []
    );
  }

  async ship(className: string): Promise<ShipSpec | null> {
    return this.cached(`ship-${className}`, async () => {
      const d = (await this.get(`/vehicles/${encodeURIComponent(className)}`)).data as Raw | null;
      if (!d) return null;
      return {
        className: d.class_name,
        name: d.game_name ?? d.name,
        manufacturer: d.manufacturer?.name ?? null,
        role: d.role ?? d.career ?? null,
        size: num(d.size_class),
        crew: { min: num(d.crew?.min), max: num(d.crew?.max) },
        cargo: num(d.cargo_capacity),
        medicalTier: num(d.max_medical_tier),
        speed: { scm: num(d.speed?.scm), max: num(d.speed?.max) },
        quantum: {
          speed: num(d.quantum?.quantum_speed),
          range: num(d.quantum?.quantum_range),
          fuel: num(d.quantum?.quantum_fuel_capacity),
          spool: num(d.quantum?.quantum_spool_time),
        },
        hull: num(d.health),
        shield: { hp: num(d.shield?.hp ?? d.shield_hp), faces: d.shield?.face_type ?? d.shield_face_type ?? null },
        weapons: { turretDps: num(d.weaponry?.turret_dps), missiles: num(d.weaponry?.missiles?.count), missileDamage: num(d.weaponry?.total_missile_damage) },
        insurance: { claim: num(d.insurance?.claim_time), expedite: num(d.insurance?.expedite_time), expediteCost: num(d.insurance?.expedite_cost) },
        image: d.images?.thumbnail_url ?? d.images?.original_url ?? null,
        description: typeof d.game_description === 'string' ? d.game_description : typeof d.description === 'string' ? d.description : null,
        webUrl: d.web_url ?? null,
        stock: stockLoadout(d.ports),
        version: d.version ?? null,
      } satisfies ShipSpec;
    });
  }

  async upgrades(type: ComponentType, size: number): Promise<Upgrade[]> {
    const stat = STAT[type];
    return (
      (await this.cached(`items-${type}-${size}`, async () => {
        const j = await this.get(`/items?filter%5Btype%5D=${type}&filter%5Bsize%5D=${size}&page%5Bsize%5D=100`);
        return ((j.data ?? []) as Raw[])
          .map((i) => ({
            name: String(i.name),
            className: String(i.class_name),
            manufacturer: i.manufacturer?.name ?? null,
            grade: i.grade ?? null,
            klass: i.class ?? null,
            stat: stat.pick(i),
            statLabel: stat.label,
            ...cheapest(i),
          }))
          .sort((a, b) => (b.stat ?? -1) - (a.stat ?? -1));
      })) ?? []
    );
  }

  async itemName(className: string): Promise<string | null> {
    return this.cached(`item-${className}`, async () => {
      const d = (await this.get(`/items/${encodeURIComponent(className)}`)).data as Raw | null;
      return d?.name ? String(d.name) : null;
    });
  }
}
