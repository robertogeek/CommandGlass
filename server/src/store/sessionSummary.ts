import type { CommunityContracts } from '../game/starstrings.ts';
import { fmtN, tx } from '../i18n.ts';
import { shardInfo } from '../parser/names.ts';
import type { LiveState } from '../state/reducer.ts';
import type { Store } from './db.ts';
import { foldMissions } from './missions.ts';

/** Resumen de una sesión de juego: lo que hiciste, ganaste, perdiste y con quién. */

export interface SessionSummary {
  id: number;
  startedAt: string | null;
  endedAt: string | null;
  minutes: number;
  shard: string | null;
  completed: string[];
  failed: string[];
  reputation: number;
  rewards: number;
  spent: number;
  places: string[];
  ships: string[];
  companions: string[];
  shipsLost: number;
  vehiclesDestroyed: number;
  deaths: number;
  qtJumps: number;
  blueprints: string[];
  crimes: string[];
}

const MISSION_TYPES = [
  'mission.info', 'mission.accepted', 'mission.objective', 'mission.objective_done', 'mission.objective_failed',
  'mission.completed', 'mission.failed', 'mission.abandoned', 'mission.ended',
];

export function buildSessionSummary(store: Store, sessionId: number, community: CommunityContracts | null): SessionSummary | null {
  const s = store.getSessionById(sessionId);
  if (!s) return null;
  const rows = store.db.prepare('SELECT id, session_id, ts, type, data FROM events WHERE session_id = ? ORDER BY id').all(sessionId) as {
    id: number;
    session_id: number;
    ts: string;
    type: string;
    data: string;
  }[];
  const state = s.state ? (JSON.parse(s.state) as LiveState) : null;
  const missions = foldMissions(rows.filter((r) => MISSION_TYPES.includes(r.type)));
  const completed = missions.filter((m) => m.outcome === 'completed');
  const reputation = completed.reduce((a, m) => a + (community?.lookup(m.contract, m.title)?.reputationValue ?? 0), 0);

  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
  const places: string[] = [];
  const ships: string[] = [];
  const blueprints: string[] = [];
  const crimes: string[] = [];
  let rewards = 0;
  let spent = 0;
  for (const r of rows) {
    const d = JSON.parse(r.data) as Record<string, unknown>;
    if (r.type === 'travel.location') places.push(String(d.name ?? ''));
    else if (r.type === 'ship.boarded' && d.own) ships.push(String(d.ship ?? ''));
    else if (r.type === 'travel.qt_arrived') ships.push(String(d.shipName ?? ''));
    else if (r.type === 'economy.reward') rewards += Number(d.amount) || 0;
    else if (r.type === 'economy.buy') spent += Number(d.price) || 0;
    else if (r.type === 'blueprint.received') blueprints.push(String(d.name ?? ''));
    else if (r.type === 'law.crime') crimes.push(String(d.crime ?? ''));
  }
  const companions = (
    store.db
      .prepare(
        `SELECT m.name AS name, COUNT(*) AS n FROM mentions m JOIN events e ON e.id = m.event_id
         WHERE e.session_id = ? AND m.role IN ('party', 'crew', 'host') GROUP BY m.name COLLATE NOCASE ORDER BY n DESC LIMIT 8`,
      )
      .all(sessionId) as { name: string }[]
  ).map((r) => r.name);

  const start = s.started_at ? Date.parse(s.started_at) : NaN;
  const end = s.ended_at ? Date.parse(s.ended_at) : NaN;
  return {
    id: s.id,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    minutes: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 60_000)) : 0,
    shard: state?.shard ? shardInfo(state.shard.id).label : null,
    completed: completed.map((m) => m.title ?? tx('Contrato', 'Contract')),
    failed: missions.filter((m) => m.outcome === 'failed').map((m) => m.title ?? tx('Contrato', 'Contract')),
    reputation,
    rewards,
    spent,
    places: uniq(places),
    ships: uniq(ships),
    companions,
    shipsLost: state?.stats.shipsLost ?? 0,
    vehiclesDestroyed: state?.stats.vehiclesDestroyed ?? 0,
    deaths: state?.stats.deaths ?? 0,
    qtJumps: state?.stats.qtJumps ?? 0,
    blueprints: uniq(blueprints),
    crimes: uniq(crimes),
  };
}

/** Texto para pegar en Discord, en el idioma de la interfaz. */
export function summaryText(s: SessionSummary): string {
  const h = Math.floor(s.minutes / 60);
  const dur = h ? `${h} h ${s.minutes % 60} min` : `${s.minutes} min`;
  const plural = (n: number, es1: string, esN: string, en1: string, enN: string) => tx(n === 1 ? es1 : esN, n === 1 ? en1 : enN);
  const lines = [
    `**${tx('Sesión de Star Citizen', 'Star Citizen session')}** · ${dur}${s.shard ? ` · ${s.shard}` : ''}`,
    `${tx('Contratos', 'Contracts')}: ${s.completed.length} ${plural(s.completed.length, 'completado', 'completados', 'completed', 'completed')}${s.failed.length ? `, ${s.failed.length} ${plural(s.failed.length, 'fallido', 'fallidos', 'failed', 'failed')}` : ''}${s.reputation ? ` · +${fmtN(s.reputation)} rep` : ''}`,
  ];
  if (s.completed.length) lines.push(`> ${s.completed.slice(0, 6).join(' · ')}${s.completed.length > 6 ? ' …' : ''}`);
  if (s.rewards || s.spent) lines.push(`aUEC: +${fmtN(s.rewards)} / −${fmtN(s.spent)}`);
  if (s.places.length) lines.push(`${tx('Ruta', 'Route')}: ${s.places.slice(0, 8).join(' → ')}`);
  if (s.ships.length) lines.push(`${tx('Naves', 'Ships')}: ${s.ships.join(', ')}`);
  const combat = [
    s.vehiclesDestroyed && `${s.vehiclesDestroyed} ${plural(s.vehiclesDestroyed, 'nave destruida', 'naves destruidas', 'ship destroyed', 'ships destroyed')}`,
    s.shipsLost && `${s.shipsLost} ${plural(s.shipsLost, 'perdida', 'perdidas', 'lost', 'lost')}`,
    s.deaths && `${s.deaths} ${plural(s.deaths, 'muerte', 'muertes', 'death', 'deaths')}`,
  ].filter(Boolean);
  if (combat.length) lines.push(`${tx('Combate', 'Combat')}: ${combat.join(' · ')}`);
  if (s.blueprints.length) lines.push(`Blueprints: ${s.blueprints.join(', ')}`);
  if (s.companions.length) lines.push(`${tx('Con', 'With')}: ${s.companions.join(', ')}`);
  lines.push('— CommandGlass');
  return lines.join('\n');
}