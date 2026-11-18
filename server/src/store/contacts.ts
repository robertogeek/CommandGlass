import type { Store } from './db.ts';

/**
 * Contactos: los jugadores que aparecen en tus eventos (tabla `mentions`), agregados por nombre.
 *
 * Roles que guarda el parser y cómo se agrupan aquí:
 * - party, crew, host, friend → compañeros (grupo, tripulación, amigo)
 * - nemesis → te ha matado o te ha destruido la nave
 * - victim  → le has matado o destruido la nave tú
 * - killer, killed → los has visto en un combate ajeno
 * - nearby → coincidisteis (por ejemplo, en el mismo vagón de tren)
 */

export type Mark = 'ally' | 'neutral' | 'hostile';
const MARKS: readonly Mark[] = ['ally', 'neutral', 'hostile'];

export interface ContactCounts {
  party: number;
  /** Sesiones en las que fuisteis en el mismo grupo o en la misma nave. */
  groupSessions: number;
  crew: number;
  friend: number;
  nemesis: number;
  victim: number;
  combat: number;
  nearby: number;
}

export interface Presence {
  /** Está en tu grupo ahora mismo (según los avisos de esta sesión). */
  inParty: boolean;
  /** Conectado, si está en tu grupo. */
  online: boolean;
  /** Va contigo en la nave (canal de la nave en la que estás). */
  aboard: boolean;
}

export interface Contact {
  name: string;
  geid: string | null;
  events: number;
  sessions: number;
  firstSeen: string;
  lastSeen: string;
  counts: ContactCounts;
  /** Eventos con él en la sesión actual. */
  inSession: number;
  presence: Presence | null;
  mark: Mark | null;
  note: string | null;
}

export interface SharedShip {
  ship: string;
  owner: string;
  /** La nave es tuya (él subió a tu nave) o suya (tú subiste a la suya). */
  own: boolean;
  times: number;
  last: string;
}

export interface ContactDetail extends Contact {
  ships: SharedShip[];
  recentSessions: { id: number; startedAt: string | null; endedAt: string | null; events: number }[];
}

interface AggRow {
  name: string;
  geid: string | null;
  events: number;
  sessions: number;
  firstSeen: string;
  lastSeen: string;
  party: number;
  groupSessions: number;
  crew: number;
  friend: number;
  nemesis: number;
  victim: number;
  combat: number;
  nearby: number;
  inSession: number;
}

const AGG_SELECT = `
  SELECT m.name AS name, MAX(m.geid) AS geid,
         COUNT(DISTINCT m.event_id) AS events,
         COUNT(DISTINCT e.session_id) AS sessions,
         MIN(e.ts) AS firstSeen, MAX(e.ts) AS lastSeen,
         SUM(m.role = 'party') AS party,
         COUNT(DISTINCT CASE WHEN m.role IN ('party', 'crew', 'host') THEN e.session_id END) AS groupSessions,
         SUM(m.role IN ('crew', 'host')) AS crew,
         SUM(m.role = 'friend') AS friend,
         SUM(m.role = 'nemesis') AS nemesis,
         SUM(m.role = 'victim') AS victim,
         SUM(m.role IN ('killer', 'killed')) AS combat,
         SUM(m.role = 'nearby') AS nearby,
         COUNT(DISTINCT CASE WHEN e.session_id = ? THEN m.event_id END) AS inSession
  FROM mentions m JOIN events e ON e.id = m.event_id`;

export function listContacts(store: Store, currentSessionId: number | null): Contact[] {
  const rows = store.db
    .prepare(`${AGG_SELECT} GROUP BY m.name COLLATE NOCASE`)
    .all(currentSessionId ?? -1) as unknown as AggRow[];
  const notes = loadNotes(store);
  const presence = currentSessionId ? sessionPresence(store, currentSessionId) : new Map<string, Presence>();
  return rows.map((r) => toContact(r, notes, presence));
}

export function getContact(store: Store, name: string, currentSessionId: number | null): ContactDetail | null {
  const row = store.db
    .prepare(`${AGG_SELECT} WHERE m.name = ? COLLATE NOCASE GROUP BY m.name COLLATE NOCASE`)
    .get(currentSessionId ?? -1, name) as AggRow | undefined;
  if (!row) return null;
  const notes = loadNotes(store);
  const presence = currentSessionId ? sessionPresence(store, currentSessionId) : new Map<string, Presence>();
  const contact = toContact(row, notes, presence);

  const me = store.lastKnownPlayer().name?.toLowerCase() ?? null;
  const shipRows = store.db
    .prepare(
      `SELECT e.type AS type, json_extract(e.data, '$.ship') AS ship, json_extract(e.data, '$.owner') AS owner,
              COUNT(*) AS times, MAX(e.ts) AS last
       FROM mentions m JOIN events e ON e.id = m.event_id
       WHERE m.name = ? COLLATE NOCASE AND e.type IN ('social.crew_joined', 'ship.boarded')
       GROUP BY e.type, ship, owner ORDER BY times DESC, last DESC`,
    )
    .all(name) as { type: string; ship: string | null; owner: string | null; times: number; last: string }[];
  const ships: SharedShip[] = shipRows
    .filter((s) => s.ship && s.owner)
    .map((s) => ({
      ship: s.ship!,
      owner: s.owner!,
      own: s.type === 'social.crew_joined' && s.owner!.toLowerCase() === me,
      times: s.times,
      last: s.last,
    }));

  const recentSessions = (
    store.db
      .prepare(
        `SELECT s.id AS id, s.started_at AS startedAt, s.ended_at AS endedAt, COUNT(DISTINCT m.event_id) AS events
         FROM mentions m JOIN events e ON e.id = m.event_id JOIN sessions s ON s.id = e.session_id
         WHERE m.name = ? COLLATE NOCASE
         GROUP BY s.id ORDER BY s.started_at DESC LIMIT 12`,
      )
      .all(name) as { id: number; startedAt: string | null; endedAt: string | null; events: number }[]
  ).map((r) => ({ ...r }));

  return { ...contact, ships, recentSessions };
}

export function setContactNote(store: Store, name: string, mark: unknown, note: unknown): { mark: Mark | null; note: string | null } {
  const cleanMark = typeof mark === 'string' && (MARKS as readonly string[]).includes(mark) ? (mark as Mark) : null;
  const cleanNote = typeof note === 'string' && note.trim() ? note.trim().slice(0, 2000) : null;
  if (!cleanMark && !cleanNote) {
    store.db.prepare('DELETE FROM contact_notes WHERE name = ?').run(name);
  } else {
    store.db
      .prepare(
        `INSERT INTO contact_notes (name, mark, note, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET mark = excluded.mark, note = excluded.note, updated_at = excluded.updated_at`,
      )
      .run(name, cleanMark, cleanNote, new Date().toISOString());
  }
  return { mark: cleanMark, note: cleanNote };
}

/** Jugadores que has marcado como hostiles (en minúsculas), para las alertas. */
export function hostileNames(store: Store): Set<string> {
  const rows = store.db.prepare("SELECT name FROM contact_notes WHERE mark = 'hostile'").all() as { name: string }[];
  return new Set(rows.map((r) => r.name.toLowerCase()));
}

// ---------------------------------------------------------------- internos

function loadNotes(store: Store): Map<string, { mark: Mark | null; note: string | null }> {
  const rows = store.db.prepare('SELECT name, mark, note FROM contact_notes').all() as {
    name: string;
    mark: Mark | null;
    note: string | null;
  }[];
  return new Map(rows.map((r) => [r.name.toLowerCase(), { mark: r.mark, note: r.note }]));
}

function toContact(
  r: AggRow,
  notes: Map<string, { mark: Mark | null; note: string | null }>,
  presence: Map<string, Presence>,
): Contact {
  const key = r.name.toLowerCase();
  const n = notes.get(key);
  return {
    name: r.name,
    geid: r.geid,
    events: r.events,
    sessions: r.sessions,
    firstSeen: r.firstSeen,
    lastSeen: r.lastSeen,
    counts: {
      party: r.party,
      groupSessions: r.groupSessions,
      crew: r.crew,
      friend: r.friend,
      nemesis: r.nemesis,
      victim: r.victim,
      combat: r.combat,
      nearby: r.nearby,
    },
    inSession: r.inSession,
    presence: presence.get(key) ?? null,
    mark: n?.mark ?? null,
    note: n?.note ?? null,
  };
}

/**
 * Reconstruye quién está ahora en tu grupo y en tu nave recorriendo los avisos de la sesión en orden.
 * Los avisos de "sale del grupo" no llevan mención, así que se leen del propio evento.
 */
export function sessionPresence(store: Store, sessionId: number): Map<string, Presence> {
  const rows = store.db
    .prepare(
      `SELECT type, json_extract(data, '$.name') AS name, json_extract(data, '$.online') AS online
       FROM events WHERE session_id = ? AND type IN (
         'social.party_member_joined', 'social.party_member_left', 'social.party_presence',
         'social.party_disbanded', 'social.party_qt', 'social.party_qt_to_you',
         'social.crew_joined', 'social.crew_left', 'ship.left', 'ship.boarded'
       ) ORDER BY id`,
    )
    .all(sessionId) as { type: string; name: string | null; online: number | null }[];
  return replayPresence(rows);
}

export function replayPresence(rows: { type: string; name: string | null; online: number | boolean | null }[]): Map<string, Presence> {
  const map = new Map<string, Presence>();
  const get = (name: string) => {
    const key = name.toLowerCase();
    let p = map.get(key);
    if (!p) map.set(key, (p = { inParty: false, online: false, aboard: false }));
    return p;
  };
  for (const r of rows) {
    switch (r.type) {
      case 'social.party_member_joined':
      case 'social.party_qt':
      case 'social.party_qt_to_you':
        if (r.name) Object.assign(get(r.name), { inParty: true, online: true });
        break;
      case 'social.party_presence':
        if (r.name) Object.assign(get(r.name), { inParty: true, online: Boolean(r.online) });
        break;
      case 'social.party_member_left':
        if (r.name) Object.assign(get(r.name), { inParty: false, online: false });
        break;
      case 'social.party_disbanded':
        for (const p of map.values()) Object.assign(p, { inParty: false, online: false });
        break;
      case 'social.crew_joined':
        if (r.name) get(r.name).aboard = true;
        break;
      case 'social.crew_left':
        if (r.name) get(r.name).aboard = false;
        break;
      // Al cambiar de nave, la tripulación anterior deja de ir contigo.
      case 'ship.left':
      case 'ship.boarded':
        for (const p of map.values()) p.aboard = false;
        break;
    }
  }
  for (const [k, p] of map) if (!p.inParty && !p.aboard) map.delete(k);
  return map;
}
