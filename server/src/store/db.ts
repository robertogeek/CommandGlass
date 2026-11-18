import { DatabaseSync } from 'node:sqlite';
import type { GameEvent } from '../parser/types.ts';
import type { LiveState } from '../state/reducer.ts';

export interface SessionRow {
  id: number;
  key: string;
  build: string | null;
  started_at: string | null;
  ended_at: string | null;
  player: string | null;
  player_geid: string | null;
  byte_offset: number;
  event_count: number;
  state: string | null;
  parser_version: number;
}

export interface StoredEvent extends GameEvent {
  id: number;
  sessionId: number;
}

interface EventRow {
  id: number;
  session_id: number;
  ts: string;
  type: string;
  category: string;
  importance: number;
  summary: string;
  data: string;
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  build TEXT,
  started_at TEXT,
  ended_at TEXT,
  player TEXT,
  player_geid TEXT,
  byte_offset INTEGER NOT NULL DEFAULT 0,
  event_count INTEGER NOT NULL DEFAULT 0,
  state TEXT,
  parser_version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ts TEXT NOT NULL,
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  importance INTEGER NOT NULL,
  summary TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_session ON events(session_id, id);
CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS events_type ON events(type);
CREATE TABLE IF NOT EXISTS mentions (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  geid TEXT,
  role TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mentions_name ON mentions(name);
CREATE INDEX IF NOT EXISTS mentions_event ON mentions(event_id);
-- Notas tuyas sobre otros jugadores: no dependen de las sesiones, así que sobreviven a un reprocesado.
-- Ajustes tuyos (como el saldo de la cartera): tampoco dependen de las sesiones.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contact_notes (
  name TEXT PRIMARY KEY COLLATE NOCASE,
  mark TEXT,
  note TEXT,
  updated_at TEXT NOT NULL
);
`;

export interface EventQuery {
  sessionId?: number;
  beforeId?: number;
  limit?: number;
  minImportance?: number;
  categories?: string[];
  search?: string;
  /** Solo eventos en los que aparece este jugador. */
  mention?: string;
}

export class Store {
  readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  getSession(key: string): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE key = ?').get(key) as SessionRow | undefined;
  }

  getSessionById(id: number): SessionRow | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  }

  /** Crea la sesión, o la reinicia si fue procesada con otra versión del parser. */
  openSession(key: string, build: string | null, parserVersion: number): SessionRow {
    const existing = this.getSession(key);
    if (existing && existing.parser_version === parserVersion) return existing;
    if (existing) this.db.prepare('DELETE FROM sessions WHERE id = ?').run(existing.id);
    this.db
      .prepare('INSERT INTO sessions (key, build, parser_version) VALUES (?, ?, ?)')
      .run(key, build, parserVersion);
    return this.getSession(key)!;
  }

  insertEvents(sessionId: number, events: GameEvent[]): StoredEvent[] {
    const insEv = this.db.prepare(
      'INSERT INTO events (session_id, ts, type, category, importance, summary, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    const insMention = this.db.prepare('INSERT INTO mentions (event_id, name, geid, role) VALUES (?, ?, ?, ?)');
    return events.map((e) => {
      const r = insEv.run(sessionId, e.ts, e.type, e.category, e.importance, e.summary, JSON.stringify(e.data));
      const id = Number(r.lastInsertRowid);
      for (const m of e.mentions ?? []) insMention.run(id, m.name, m.geid ?? null, m.role);
      return { ...e, id, sessionId };
    });
  }

  updateSessionProgress(id: number, offset: number, added: number, state: LiveState): void {
    this.db
      .prepare(
        `UPDATE sessions SET byte_offset = ?, event_count = event_count + ?, state = ?,
           started_at = COALESCE(started_at, ?), ended_at = ?, player = ?, player_geid = ?
         WHERE id = ?`,
      )
      .run(
        offset,
        added,
        JSON.stringify(state),
        state.startedAt,
        state.endedAt ?? state.lastEventAt,
        state.player.name,
        state.player.geid,
        id,
      );
  }

  /** Último jugador conocido: sirve para reconocer "tú" en logs sin línea de login. */
  lastKnownPlayer(): { name: string | null; geid: string | null } {
    const row = this.db
      .prepare('SELECT player, player_geid FROM sessions WHERE player IS NOT NULL ORDER BY started_at DESC LIMIT 1')
      .get() as { player: string; player_geid: string } | undefined;
    return { name: row?.player ?? null, geid: row?.player_geid ?? null };
  }

  /** Estados guardados de las últimas sesiones (la más reciente primero). */
  recentStates(limit = 30): LiveState[] {
    const rows = this.db
      .prepare('SELECT state FROM sessions WHERE state IS NOT NULL ORDER BY started_at DESC LIMIT ?')
      .all(limit) as { state: string }[];
    return rows.map((r) => JSON.parse(r.state) as LiveState);
  }

  listSessions(limit = 50): Omit<SessionRow, 'state'>[] {
    return this.db
      .prepare(
        `SELECT id, key, build, started_at, ended_at, player, player_geid, byte_offset, event_count, parser_version
         FROM sessions WHERE event_count > 0 ORDER BY started_at DESC LIMIT ?`,
      )
      .all(limit) as unknown as Omit<SessionRow, 'state'>[];
  }

  queryEvents(q: EventQuery): StoredEvent[] {
    const where: string[] = [];
    const args: (string | number)[] = [];
    if (q.sessionId !== undefined) {
      where.push('session_id = ?');
      args.push(q.sessionId);
    }
    if (q.beforeId !== undefined) {
      where.push('id < ?');
      args.push(q.beforeId);
    }
    if (q.minImportance !== undefined) {
      where.push('importance >= ?');
      args.push(q.minImportance);
    }
    if (q.categories?.length) {
      where.push(`category IN (${q.categories.map(() => '?').join(',')})`);
      args.push(...q.categories);
    }
    if (q.search) {
      where.push('summary LIKE ?');
      args.push(`%${q.search}%`);
    }
    if (q.mention) {
      where.push('id IN (SELECT event_id FROM mentions WHERE name = ? COLLATE NOCASE)');
      args.push(q.mention);
    }
    const sql = `SELECT * FROM events ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
                 ORDER BY id DESC LIMIT ?`;
    args.push(Math.min(q.limit ?? 100, 500));
    const rows = this.db.prepare(sql).all(...args) as unknown as EventRow[];
    return rows.map(toStored);
  }

  /** Totales para la portada y el archivo. */
  overview() {
    const one = (sql: string, ...a: (string | number)[]) =>
      Number((this.db.prepare(sql).get(...a) as { n: number | null } | undefined)?.n ?? 0);
    const sessions = this.db
      .prepare('SELECT started_at, ended_at FROM sessions WHERE started_at IS NOT NULL AND ended_at IS NOT NULL')
      .all() as { started_at: string; ended_at: string }[];
    const playMs = sessions.reduce((acc, s) => acc + Math.max(0, Date.parse(s.ended_at) - Date.parse(s.started_at)), 0);
    return {
      sessions: sessions.length,
      firstSession: (this.db.prepare('SELECT MIN(started_at) AS v FROM sessions').get() as { v: string | null }).v,
      hoursPlayed: Math.round(playMs / 3_600_000),
      events: one('SELECT COUNT(*) AS n FROM events'),
      missionsCompleted: one("SELECT COUNT(*) AS n FROM events WHERE type = 'mission.completed'"),
      missionsFailed: one("SELECT COUNT(*) AS n FROM events WHERE type = 'mission.failed'"),
      rewardsAuec: one("SELECT SUM(json_extract(data, '$.amount')) AS n FROM events WHERE type = 'economy.reward'"),
      qtJumps: one("SELECT COUNT(*) AS n FROM events WHERE type = 'travel.qt_arrived'"),
      shipsLost: one(
        "SELECT COUNT(*) AS n FROM events WHERE type = 'combat.vehicle_destroyed' AND json_extract(data,'$.mine') = 1 AND json_extract(data,'$.destroyed') = 1",
      ),
      vehiclesDestroyed: one(
        "SELECT COUNT(*) AS n FROM events WHERE type = 'combat.vehicle_destroyed' AND json_extract(data,'$.byMe') = 1 AND json_extract(data,'$.mine') = 0 AND json_extract(data,'$.destroyed') = 1",
      ),
      kills: one("SELECT COUNT(*) AS n FROM events WHERE type = 'combat.actor_death' AND json_extract(data,'$.killerIsMe') = 1 AND json_extract(data,'$.victimIsMe') = 0"),
      deaths: (this.db.prepare('SELECT state FROM sessions WHERE state IS NOT NULL').all() as { state: string }[])
        .reduce((acc, r) => acc + ((JSON.parse(r.state) as LiveState).stats?.deaths ?? 0), 0),
      playersMet: one('SELECT COUNT(DISTINCT name) AS n FROM mentions'),
    };
  }
}

function toStored(r: EventRow): StoredEvent {
  return {
    id: r.id,
    sessionId: r.session_id,
    ts: r.ts,
    type: r.type,
    category: r.category as StoredEvent['category'],
    importance: r.importance as StoredEvent['importance'],
    summary: r.summary,
    data: JSON.parse(r.data) as Record<string, unknown>,
  };
}
