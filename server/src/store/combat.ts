import { tx } from '../i18n.ts';
import { actorName } from '../parser/names.ts';
import { REASONS } from '../parser/rules.ts';
import type { Store } from './db.ts';

/** Combate y ley a partir del registro: naves perdidas y destruidas, causas, némesis y delitos. */

interface Row {
  id: number;
  ts: string;
  type: string;
  summary: string;
  summary_en: string | null;
  data: string;
}

const count = <T extends string>(items: T[]) => {
  const m = new Map<T, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n);
};

export interface CombatSummary {
  shipsLost: number;
  vehiclesDestroyed: number;
  deaths: number;
  kills2025: number;
  lostBy: { key: string; n: number }[];
  lostReasons: { key: string; n: number }[];
  lostShips: { key: string; n: number }[];
  destroyedShips: { key: string; n: number }[];
  deathCauses: { key: string; n: number }[];
  crimes: { ts: string; crime: string; against: string | null }[];
  crimeTypes: { key: string; n: number }[];
  refinery: { ts: string; station: string; orders: number }[];
  feed: { id: number; ts: string; type: string; summary: string; tone: 'bad' | 'good' | 'neutral' }[];
}

export function foldCombat(rows: Row[]): CombatSummary {
  const lostBy: string[] = [];
  const lostReasons: string[] = [];
  const lostShips: string[] = [];
  const destroyedShips: string[] = [];
  const deathCauses: string[] = [];
  const crimes: CombatSummary['crimes'] = [];
  const refinery: CombatSummary['refinery'] = [];
  const feed: CombatSummary['feed'] = [];
  let deaths = 0;
  let kills2025 = 0;
  let lastDeath = 0;

  for (const row of rows) {
    // El texto de la bitácora, en el idioma de la interfaz.
    const r = { ...row, summary: tx(row.summary, row.summary_en ?? row.summary) };
    const d = JSON.parse(r.data) as Record<string, unknown>;
    switch (r.type) {
      case 'combat.vehicle_destroyed': {
        if (!d.destroyed) break;
        if (d.mine) {
          // Quién: un jugador por su nombre, los NPC agrupados, y tú mismo (colisiones, autodestrucción).
          const killer = d.byMe ? tx('Tú mismo', 'Yourself') : d.killer ? actorName(String(d.killer)) : String(d.killerName ?? tx('desconocido', 'unknown'));
          lostBy.push(/^NPC \(/.test(killer) ? 'NPC' : killer);
          const reason = REASONS[String(d.reason)];
          lostReasons.push(reason ? tx(reason.es, reason.en) : String(d.reasonEs ?? d.reason ?? '—'));
          lostShips.push(String(d.ship ?? '—'));
          feed.push({ id: r.id, ts: r.ts, type: r.type, summary: r.summary, tone: 'bad' });
        } else if (d.byMe) {
          destroyedShips.push(String(d.ship ?? '—').replace(/ \(IA[^)]*\)$/, ''));
          feed.push({ id: r.id, ts: r.ts, type: r.type, summary: r.summary, tone: 'good' });
        }
        break;
      }
      case 'combat.actor_death':
        if (d.victimIsMe) {
          deathCauses.push(d.killerIsMe ? `${tx('Tú mismo', 'Yourself')} (${d.damageType ?? '?'})` : String(d.damageType ?? '?'));
          feed.push({ id: r.id, ts: r.ts, type: r.type, summary: r.summary, tone: 'bad' });
        } else if (d.killerIsMe) {
          kills2025++;
          feed.push({ id: r.id, ts: r.ts, type: r.type, summary: r.summary, tone: 'good' });
        }
        break;
      case 'health.death': {
        // Misma regla que el estado de sesión: una muerte de 2025 y su ráfaga de cadáver cuentan una vez.
        const t = Date.parse(r.ts);
        if (t - lastDeath > 10 * 60_000) deaths++;
        lastDeath = t;
        break;
      }
      case 'law.crime':
        crimes.push({ ts: r.ts, crime: String(d.crime ?? '—'), against: (d.against as string | null) ?? null });
        feed.push({ id: r.id, ts: r.ts, type: r.type, summary: r.summary, tone: 'bad' });
        break;
      case 'economy.refinery':
        refinery.push({ ts: r.ts, station: String(d.station ?? '—'), orders: Number(d.orders) || 1 });
        break;
    }
    if (r.type === 'combat.actor_death' && d.victimIsMe) lastDeath = Date.parse(r.ts);
  }
  const actorDeaths = deathCauses.length;
  return {
    shipsLost: lostShips.length,
    vehiclesDestroyed: destroyedShips.length,
    deaths: Math.max(deaths, actorDeaths),
    kills2025,
    lostBy: count(lostBy).slice(0, 10),
    lostReasons: count(lostReasons),
    lostShips: count(lostShips).slice(0, 10),
    destroyedShips: count(destroyedShips).slice(0, 12),
    deathCauses: count(deathCauses).slice(0, 8),
    crimes: crimes.reverse().slice(0, 40),
    crimeTypes: count(crimes.map((c) => c.crime)),
    refinery: refinery.reverse().slice(0, 30),
    feed: feed.reverse().slice(0, 60),
  };
}

export function loadCombat(store: Store): CombatSummary {
  const rows = store.db
    .prepare(
      `SELECT id, ts, type, summary, summary_en, data FROM events
       WHERE type IN ('combat.vehicle_destroyed', 'combat.actor_death', 'health.death', 'law.crime', 'economy.refinery') ORDER BY id`,
    )
    .all() as unknown as Row[];
  return foldCombat(rows);
}
