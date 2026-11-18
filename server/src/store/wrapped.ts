import type { LiveState } from '../state/reducer.ts';
import type { Store } from './db.ts';
import { loadEconomy } from './economy.ts';
import { foldShips, type VehicleName } from './hangar.ts';
import { KIND_LABEL, loadMissions } from './missions.ts';
import { foldPlaces } from './places.ts';

/** Resumen de un año de juego ("tu año en Star Citizen"). */

export interface Wrapped {
  year: number;
  years: number[];
  hours: number;
  sessions: number;
  longest: { startedAt: string; minutes: number } | null;
  busiestDay: { day: string; minutes: number } | null;
  missions: { completed: number; accepted: number; topKinds: { label: string; completed: number }[] };
  ships: { name: string; uses: number }[];
  places: { name: string; visits: number }[];
  companions: { name: string; sessions: number }[];
  nemeses: { name: string; times: number }[];
  deaths: number;
  shipsLost: number;
  vehiclesDestroyed: number;
  qtJumps: number;
  spent: number;
  rewards: number;
}

export function buildWrapped(store: Store, year: number, resolve: (display: string) => VehicleName | null): Wrapped {
  const inYear = (ts: string | null | undefined) => !!ts && ts.startsWith(String(year));
  const years = (store.db.prepare("SELECT DISTINCT substr(started_at, 1, 4) AS y FROM sessions WHERE started_at IS NOT NULL ORDER BY y DESC").all() as { y: string }[])
    .map((r) => Number(r.y))
    .filter(Boolean);

  const sessions = store.db
    .prepare('SELECT started_at, ended_at, state FROM sessions WHERE started_at LIKE ? AND ended_at IS NOT NULL')
    .all(`${year}%`) as { started_at: string; ended_at: string; state: string | null }[];
  let totalMin = 0;
  let longest: Wrapped['longest'] = null;
  const byDay = new Map<string, number>();
  let deaths = 0, shipsLost = 0, vehiclesDestroyed = 0, qtJumps = 0;
  for (const s of sessions) {
    const min = Math.max(0, (Date.parse(s.ended_at) - Date.parse(s.started_at)) / 60_000);
    totalMin += min;
    if (!longest || min > longest.minutes) longest = { startedAt: s.started_at, minutes: Math.round(min) };
    const d = s.started_at.slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + min);
    if (s.state) {
      const st = (JSON.parse(s.state) as LiveState).stats;
      deaths += st?.deaths ?? 0;
      shipsLost += st?.shipsLost ?? 0;
      vehiclesDestroyed += st?.vehiclesDestroyed ?? 0;
      qtJumps += st?.qtJumps ?? 0;
    }
  }
  const busiest = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];

  const missions = loadMissions(store).filter((m) => inYear(m.acceptedAt));
  const kinds = new Map<string, number>();
  for (const m of missions) if (m.outcome === 'completed') kinds.set(KIND_LABEL[m.kind], (kinds.get(KIND_LABEL[m.kind]) ?? 0) + 1);

  const shipRows = store.db
    .prepare(`SELECT session_id, ts, type, data FROM events WHERE type IN ('ship.boarded', 'travel.qt_arrived', 'combat.vehicle_destroyed') AND ts LIKE ? ORDER BY id`)
    .all(`${year}%`) as { session_id: number; ts: string; type: string; data: string }[];
  const ships = foldShips(shipRows, resolve)
    .filter((s) => s.own)
    .map((s) => ({ name: s.name, uses: s.boarded + s.qtJumps }))
    .sort((a, b) => b.uses - a.uses)
    .slice(0, 5);

  const placeRows = store.db
    .prepare(`SELECT session_id, ts, data FROM events WHERE type = 'travel.location' AND ts LIKE ? ORDER BY id`)
    .all(`${year}%`) as { session_id: number; ts: string; data: string }[];
  const places = foldPlaces(placeRows).slice(0, 5).map((p) => ({ name: p.name, visits: p.visits }));

  const companions = (
    store.db
      .prepare(
        `SELECT m.name AS name, COUNT(DISTINCT e.session_id) AS sessions FROM mentions m JOIN events e ON e.id = m.event_id
         WHERE m.role IN ('party', 'crew', 'host') AND e.ts LIKE ? GROUP BY m.name COLLATE NOCASE ORDER BY sessions DESC LIMIT 5`,
      )
      .all(`${year}%`) as { name: string; sessions: number }[]
  ).map((r) => ({ ...r }));
  const nemeses = (
    store.db
      .prepare(
        `SELECT m.name AS name, COUNT(*) AS times FROM mentions m JOIN events e ON e.id = m.event_id
         WHERE m.role = 'nemesis' AND e.ts LIKE ? GROUP BY m.name COLLATE NOCASE ORDER BY times DESC LIMIT 3`,
      )
      .all(`${year}%`) as { name: string; times: number }[]
  ).map((r) => ({ ...r }));

  const { purchases, rewards } = loadEconomy(store);

  return {
    year,
    years,
    hours: Math.round(totalMin / 60),
    sessions: sessions.length,
    longest,
    busiestDay: busiest ? { day: busiest[0], minutes: Math.round(busiest[1]) } : null,
    missions: {
      accepted: missions.length,
      completed: missions.filter((m) => m.outcome === 'completed').length,
      topKinds: [...kinds.entries()].map(([label, completed]) => ({ label, completed })).sort((a, b) => b.completed - a.completed).slice(0, 4),
    },
    ships,
    places,
    companions,
    nemeses,
    deaths,
    shipsLost,
    vehiclesDestroyed,
    qtJumps,
    spent: purchases.filter((p) => inYear(p.ts)).reduce((a, p) => a + p.price, 0),
    rewards: rewards.filter((r) => inYear(r.ts)).reduce((a, r) => a + r.amount, 0),
  };
}
