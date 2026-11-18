import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Datos de misiones de la Star Citizen Wiki (api.star-citizen.wiki), sacados de los ficheros del juego en cada parche.
 * El `debug_name` de la wiki coincide con el contrato que aparece en Game.log ("InterSec_DefendShip_Nyx_Medium").
 * Se descarga la lista entera (unas 10 peticiones) y se guarda en data/game/; se renueva cada semana.
 * La wiki pide que se la cite: la interfaz lo hace junto a estos datos.
 */

const API = 'https://api.star-citizen.wiki/api/missions';
const MAX_AGE_MS = 7 * 24 * 3600_000;
const CACHE_VERSION = 1;

export interface MissionIntel {
  debugName: string;
  title: string | null;
  giver: string | null;
  faction: string | null;
  rankRequired: string | null;
  reputation: { faction: string; amount: number; scope: string | null }[];
  rewardMin: number | null;
  rewardMax: number | null;
  currency: string | null;
  systems: string[];
  illegal: boolean;
  shareable: boolean;
  combat: boolean;
  enemies: { min: number | null; max: number | null };
  minutes: number | null;
  webUrl: string | null;
  version: string | null;
}

interface Cache {
  cacheVersion: number;
  fetchedAt: string;
  gameVersion: string | null;
  missions: MissionIntel[];
}

type Raw = Record<string, unknown>;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

export function slimMission(m: Raw): MissionIntel {
  const faction = m.faction as { name?: string } | null | undefined;
  const rep = Array.isArray(m.reputation_gained) ? (m.reputation_gained as Raw[]) : [];
  return {
    debugName: String(m.debug_name ?? ''),
    title: str(m.title),
    giver: str(m.mission_giver),
    faction: str(faction?.name),
    rankRequired: str(m.min_standing_name),
    reputation: rep
      .map((r) => ({ faction: String(r.faction ?? ''), amount: Number(r.amount ?? 0), scope: str(r.scope) }))
      .filter((r) => r.faction && r.amount > 0),
    rewardMin: num(m.reward_min) || null,
    rewardMax: num(m.reward_max) || null,
    currency: str(m.reward_currency),
    systems: Array.isArray(m.star_systems) ? (m.star_systems as string[]) : [],
    illegal: m.illegal === true,
    shareable: m.shareable === true,
    combat: m.has_combat === true,
    enemies: { min: num(m.enemy_count_min), max: num(m.enemy_count_max) },
    minutes: num(m.time_to_complete_minutes) || null,
    webUrl: str(m.web_url),
    version: str(m.version),
  };
}

/** Busca por nombre de contrato y, si no, por título; con títulos repetidos, el que comparte prefijo con el contrato. */
export function matchIntel(list: MissionIntel[], contract: string | null, title: string | null): MissionIntel | null {
  if (contract) {
    const c = contract.toLowerCase();
    const hit = list.find((m) => m.debugName.toLowerCase() === c);
    if (hit) return hit;
  }
  if (!title) return null;
  const t = title.toLowerCase().trim();
  const hits = list.filter((m) => (m.title ?? '').toLowerCase().trim() === t);
  if (hits.length <= 1) return hits[0] ?? null;
  const prefix = (contract ?? '').split('_')[0]?.toLowerCase();
  return hits.find((m) => prefix && m.debugName.toLowerCase().startsWith(prefix)) ?? hits[0]!;
}

export class WikiMissions {
  private file: string;
  private cache: Cache | null = null;
  private refreshing: Promise<void> | null = null;
  lastError: string | null = null;

  constructor(dataDir: string) {
    const dir = join(dataDir, 'game');
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'wiki-missions.json');
    if (existsSync(this.file)) {
      try {
        const c = JSON.parse(readFileSync(this.file, 'utf8')) as Cache;
        if (c.cacheVersion === CACHE_VERSION) this.cache = c;
      } catch {
        /* caché dañada: se vuelve a descargar */
      }
    }
  }

  get info() {
    return { fetchedAt: this.cache?.fetchedAt ?? null, gameVersion: this.cache?.gameVersion ?? null, count: this.cache?.missions.length ?? 0, error: this.lastError };
  }

  /** Devuelve lo que haya ya; si está vieja o falta, la renueva en segundo plano. */
  list(): MissionIntel[] {
    const stale = !this.cache || Date.now() - Date.parse(this.cache.fetchedAt) > MAX_AGE_MS;
    if (stale) void this.refresh();
    return this.cache?.missions ?? [];
  }

  private memo = new Map<string, MissionIntel | null>();
  private memoOf: Cache | null = null;

  lookup(contract: string | null, title: string | null): MissionIntel | null {
    const list = this.list();
    if (this.memoOf !== this.cache) {
      this.memo.clear();
      this.memoOf = this.cache;
    }
    const key = `${contract ?? ''}|${title ?? ''}`;
    if (!this.memo.has(key)) this.memo.set(key, matchIntel(list, contract, title));
    return this.memo.get(key) ?? null;
  }

  refresh(): Promise<void> {
    this.refreshing ??= this.download()
      .catch((err: Error) => {
        this.lastError = err.message;
        console.warn(`[wiki] no se han podido descargar las misiones: ${err.message}`);
      })
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }

  private async download(): Promise<void> {
    const out: MissionIntel[] = [];
    let page = 1;
    let last = 1;
    do {
      const res = await fetch(`${API}?page%5Bsize%5D=200&page%5Bnumber%5D=${page}`, {
        headers: { accept: 'application/json', 'user-agent': 'CommandGlass (herramienta de fans de Star Citizen)' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { data?: Raw[]; meta?: { last_page?: number } };
      for (const m of j.data ?? []) if (m.debug_name) out.push(slimMission(m));
      last = j.meta?.last_page ?? page;
      page++;
    } while (page <= last && page <= 50);
    if (!out.length) throw new Error('la wiki no ha devuelto misiones');
    this.cache = { cacheVersion: CACHE_VERSION, fetchedAt: new Date().toISOString(), gameVersion: out[0]?.version ?? null, missions: out };
    this.lastError = null;
    writeFileSync(this.file, JSON.stringify(this.cache));
    console.log(`[wiki] ${out.length} misiones de api.star-citizen.wiki (${this.cache.gameVersion ?? 'versión desconocida'})`);
  }
}
