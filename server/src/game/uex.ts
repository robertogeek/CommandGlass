import { tx } from '../i18n.ts';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Mercado de UEX (uexcorp.space, API 2.0): precios de mercancías por terminal, que reportan los propios jugadores.
 * Cada usuario pone su token (se crea gratis en uexcorp.space → My Apps) y se guarda solo en sus ajustes locales;
 * nunca se devuelve a la interfaz ni se escribe en el registro.
 * Terminales, mercancías y naves se guardan un día en data/game/uex/; los precios, 20 minutos.
 * Límite de la API: 120 peticiones por minuto. CommandGlass hace como mucho cuatro cada 20 minutos.
 */

/**
 * La API de UEX responde en dos dominios. Si uno no contesta se prueba el otro, y se sigue con el que funcionó:
 * en España las operadoras bloquean a ratos rangos de IP de Cloudflare (durante el fútbol) y api.uexcorp.uk
 * se quedaba sin respuesta mientras api.uexcorp.space seguía funcionando.
 */
const HOSTS = ['https://api.uexcorp.uk/2.0/', 'https://api.uexcorp.space/2.0/'];
let preferred = 0;

/** Pide un recurso a UEX probando sus dominios. Solo cambia de dominio si no hay respuesta; un 401 o un 500 valen. */
export async function uexFetch(resource: string, headers: Record<string, string>, timeoutMs: number, fetchImpl: typeof fetch = fetch): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < HOSTS.length; i++) {
    const idx = (preferred + i) % HOSTS.length;
    try {
      const res = await fetchImpl(HOSTS[idx] + resource, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (idx !== preferred) console.log(`[uex] ${new URL(HOSTS[preferred]!).host} no responde; se usa ${new URL(HOSTS[idx]!).host}`);
      preferred = idx;
      return res;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

const DAY = 24 * 3600_000;
const PRICES_MAX_AGE = 20 * 60_000;

export interface UexTerminal {
  id: number;
  name: string;
  displayname: string;
  nickname: string;
  star_system_name: string | null;
  planet_name: string | null;
  moon_name: string | null;
  space_station_name: string | null;
  city_name: string | null;
  outpost_name: string | null;
  is_available_live: number;
  is_visible: number;
  is_player_owned: number;
  max_container_size: number | null;
}

export interface UexCommodity {
  id: number;
  name: string;
  code: string;
  is_illegal: number;
  is_raw: number;
}

export interface UexPrice {
  id_commodity: number;
  id_terminal: number;
  price_buy: number;
  price_sell: number;
  scu_buy: number;
  scu_sell_stock: number;
  scu_sell: number;
  date_modified: number;
  commodity_name: string;
  terminal_name: string;
}

export interface UexVehicle {
  id: number;
  name: string;
  name_full: string;
  scu: number;
  company_name: string | null;
}

interface Cached<T> {
  fetchedAt: string;
  data: T[];
}

export const normName = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');

/** Terminales de mercancías del sitio donde estás. Para las estaciones de salto, la del sistema en el que estás. */
export function terminalsAt(terminals: UexTerminal[], place: string, system: string | null): UexTerminal[] {
  const n = normName(place);
  if (n.length < 3) return [];
  const live = terminals.filter((t) => t.is_available_live && t.is_visible && (!system || !t.star_system_name || t.star_system_name === system));
  const names = (t: UexTerminal) => [t.displayname, t.space_station_name, t.city_name, t.outpost_name, t.nickname].filter(Boolean).map((x) => normName(x!));
  const exact = live.filter((t) => names(t).includes(n));
  if (exact.length) return exact;
  // "Seraphim Station" ↔ "Seraphim", "Arc Corp Mining Area 048" ↔ "ArcCorp Mining Area 048"…
  return live.filter((t) => names(t).some((k) => k.length > 4 && (n.includes(k) || k.includes(n))));
}

/** Nave de UEX por el nombre que da el juego ("Cutlass Black", "Drake Cutlass Black"…). */
export function vehicleByName(vehicles: UexVehicle[], name: string): UexVehicle | null {
  const n = normName(name);
  if (!n) return null;
  const exact = vehicles.find((v) => normName(v.name) === n || normName(v.name_full) === n);
  if (exact) return exact;
  // El nombre más largo que esté contenido en el del juego: "Drake Cutlass Black LTI" → "Cutlass Black".
  return (
    vehicles
      .filter((v) => normName(v.name).length > 3 && n.includes(normName(v.name)))
      .sort((a, b) => b.name.length - a.name.length)[0] ?? null
  );
}

export interface Route {
  commodity: string;
  commodityId: number;
  illegal: boolean;
  from: { id: number; name: string; system: string | null };
  to: { id: number; name: string; system: string | null };
  buy: number;
  sell: number;
  /** SCU que llevas: lo que cabe en la nave, lo que hay en la terminal y lo que te puedes permitir. */
  scu: number;
  investment: number;
  profit: number;
  /** Fecha del dato más antiguo de los dos precios. */
  updated: string;
}

/**
 * Mejores rutas de compra y venta: compras donde se vende más barato y vendes donde más pagan, dentro del mismo sistema.
 * `from`: terminales de origen (donde estás); si no, cualquiera del sistema.
 */
export function bestRoutes(
  prices: UexPrice[],
  terminals: UexTerminal[],
  commodities: UexCommodity[],
  opts: { from?: number[]; system?: string | null; scu: number; budget?: number | null; illegal?: boolean; limit?: number },
): Route[] {
  const term = new Map(terminals.filter((t) => t.is_available_live && t.is_visible).map((t) => [t.id, t]));
  const com = new Map(commodities.map((c) => [c.id, c]));
  const from = opts.from?.length ? new Set(opts.from) : null;
  const byCommodity = new Map<number, { buys: UexPrice[]; sells: UexPrice[] }>();
  for (const p of prices) {
    const t = term.get(p.id_terminal);
    if (!t) continue;
    if (opts.system && t.star_system_name !== opts.system) continue;
    const g = byCommodity.get(p.id_commodity) ?? { buys: [], sells: [] };
    if (p.price_buy > 0 && (!from || from.has(p.id_terminal))) g.buys.push(p);
    if (p.price_sell > 0) g.sells.push(p);
    byCommodity.set(p.id_commodity, g);
  }
  const out: Route[] = [];
  for (const [id, { buys, sells }] of byCommodity) {
    const c = com.get(id);
    if (c?.is_illegal && !opts.illegal) continue;
    for (const b of buys) {
      const tb = term.get(b.id_terminal)!;
      // La mejor venta de esta mercancía desde esta compra, en el mismo sistema.
      let best: UexPrice | null = null;
      for (const s of sells) {
        if (s.id_terminal === b.id_terminal) continue;
        if (term.get(s.id_terminal)!.star_system_name !== tb.star_system_name) continue;
        if (!best || s.price_sell > best.price_sell) best = s;
      }
      if (!best || best.price_sell <= b.price_buy) continue;
      let scu = opts.scu;
      if (b.scu_buy > 0) scu = Math.min(scu, b.scu_buy);
      if (opts.budget && opts.budget > 0) scu = Math.min(scu, Math.floor(opts.budget / b.price_buy));
      if (scu <= 0) continue;
      const ts = term.get(best.id_terminal)!;
      out.push({
        commodity: c?.name ?? b.commodity_name,
        commodityId: id,
        illegal: Boolean(c?.is_illegal),
        from: { id: tb.id, name: tb.name, system: tb.star_system_name },
        to: { id: ts.id, name: ts.name, system: ts.star_system_name },
        buy: b.price_buy,
        sell: best.price_sell,
        scu,
        investment: scu * b.price_buy,
        profit: scu * (best.price_sell - b.price_buy),
        updated: new Date(1000 * Math.min(b.date_modified, best.date_modified)).toISOString(),
      });
    }
  }
  return out.sort((a, b) => b.profit - a.profit).slice(0, opts.limit ?? 12);
}

export class UexMarket {
  private dir: string;
  private getToken: () => string | null;
  private cache = new Map<string, Cached<unknown>>();
  private pending = new Map<string, Promise<unknown[]>>();
  lastError: string | null = null;

  constructor(dataDir: string, getToken: () => string | null) {
    this.dir = join(dataDir, 'game', 'uex');
    mkdirSync(this.dir, { recursive: true });
    this.getToken = getToken;
  }

  get configured() {
    return Boolean(this.getToken());
  }

  fetchedAt(resource: string): string | null {
    return this.cache.get(resource)?.fetchedAt ?? this.readFile(resource)?.fetchedAt ?? null;
  }

  private file(resource: string) {
    return join(this.dir, `${resource.replace(/[^a-z0-9]+/gi, '_')}.json`);
  }

  private readFile(resource: string): Cached<unknown> | null {
    const f = this.file(resource);
    if (!existsSync(f)) return null;
    try {
      return JSON.parse(readFileSync(f, 'utf8')) as Cached<unknown>;
    } catch {
      return null;
    }
  }

  /** Comprueba un token nuevo antes de guardarlo. No lo guarda ni lo escribe en ningún sitio. */
  static async check(token: string): Promise<boolean> {
    const res = await uexFetch('game_versions', { authorization: `Bearer ${token}`, accept: 'application/json', 'user-agent': 'CommandGlass' }, 10_000);
    if (res.status === 401 || res.status === 403) return false;
    const j = (await res.json().catch(() => null)) as { status?: string } | null;
    return res.ok && j?.status === 'ok';
  }

  /** Devuelve la copia guardada y la renueva si ha caducado. Sin red, se queda con la copia que hubiera. */
  async get<T>(resource: string, maxAge: number): Promise<T[]> {
    let c = this.cache.get(resource) ?? this.readFile(resource);
    if (c) this.cache.set(resource, c);
    if (c && Date.now() - Date.parse(c.fetchedAt) < maxAge) return c.data as T[];
    const token = this.getToken();
    if (!token) return (c?.data as T[]) ?? [];
    let p = this.pending.get(resource);
    if (!p) {
      p = (async () => {
        const res = await uexFetch(resource, { authorization: `Bearer ${token}`, accept: 'application/json', 'user-agent': 'CommandGlass (herramienta de fans de Star Citizen)' }, 30_000);
        if (res.status === 401 || res.status === 403) throw new Error(tx('UEX no acepta el token: revísalo en uexcorp.space → My Apps', 'UEX rejects the token: check it at uexcorp.space → My Apps'));
        if (res.status === 429) throw new Error(tx('UEX pide esperar un poco (demasiadas consultas)', 'UEX asks you to wait a bit (too many requests)'));
        if (!res.ok) throw new Error(tx(`UEX respondió ${res.status}`, `UEX responded ${res.status}`));
        const j = (await res.json()) as { status?: string; data?: unknown[] };
        if (j.status !== 'ok' || !Array.isArray(j.data)) throw new Error(tx('UEX no ha devuelto datos', 'UEX returned no data'));
        const fresh: Cached<unknown> = { fetchedAt: new Date().toISOString(), data: j.data };
        this.cache.set(resource, fresh);
        writeFileSync(this.file(resource), JSON.stringify(fresh));
        this.lastError = null;
        return j.data;
      })().finally(() => this.pending.delete(resource));
      this.pending.set(resource, p);
    }
    try {
      return (await p) as T[];
    } catch (err) {
      this.lastError = (err as Error).message;
      console.warn(`[uex] ${resource}: ${this.lastError}`);
      if (c) {
        // Se reintenta dentro de cinco minutos, no en cada consulta.
        const retry = { ...c, fetchedAt: new Date(Date.now() - maxAge + 5 * 60_000).toISOString() };
        this.cache.set(resource, retry);
      }
      return (c?.data as T[]) ?? [];
    }
  }

  terminals = () => this.get<UexTerminal>('terminals?type=commodity', DAY);
  commodities = () => this.get<UexCommodity>('commodities', DAY);
  vehicles = () => this.get<UexVehicle>('vehicles', DAY);
  prices = () => this.get<UexPrice>('commodities_prices_all', PRICES_MAX_AGE);

  /** Borra lo descargado con el token anterior para que no se mezcle. */
  forget() {
    this.cache.clear();
    this.lastError = null;
  }
}
