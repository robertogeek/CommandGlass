import { EventEmitter } from 'node:events';
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import { backupKeyFromHeader } from '../parser/line.ts';
import type { LiveState } from '../state/reducer.ts';
import type { Store, StoredEvent } from '../store/db.ts';
import { SessionIngestor } from './session.ts';

export interface TailerStatus {
  path: string;
  found: boolean;
  sessionKey: string | null;
  sessionId: number | null;
  lastWriteAt: string | null;
  /** El juego ha escrito en el log hace poco: casi seguro que estás jugando. */
  active: boolean;
}

export interface TailerEvents {
  events: [StoredEvent[], LiveState];
  session: [LiveState];
}

/**
 * Vigila Game.log. Cada segundo comprueba si ha crecido y procesa lo nuevo.
 * Si cambia la cabecera (el juego se ha reiniciado), empieza una sesión nueva.
 */
export class LiveTailer extends EventEmitter<TailerEvents> {
  private timer: NodeJS.Timeout | null = null;
  private ingestor: SessionIngestor | null = null;
  private lastMtime = 0;
  private store: Store;
  readonly path: string;
  private intervalMs: number;

  constructor(store: Store, path: string, intervalMs = 1000) {
    super();
    this.store = store;
    this.path = path;
    this.intervalMs = intervalMs;
  }

  start(): void {
    this.tick();
    this.timer = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get state(): LiveState | null {
    return this.ingestor?.state ?? null;
  }

  status(): TailerStatus {
    return {
      path: this.path,
      found: existsSync(this.path),
      sessionKey: this.ingestor?.key ?? null,
      sessionId: this.ingestor?.sessionId ?? null,
      lastWriteAt: this.lastMtime ? new Date(this.lastMtime).toISOString() : null,
      active: this.lastMtime > 0 && Date.now() - this.lastMtime < 90_000,
    };
  }

  private tick(): void {
    try {
      if (!existsSync(this.path)) return;
      const st = statSync(this.path);
      this.lastMtime = st.mtimeMs;
      const key = this.readKey();
      if (!key) return;
      if (!this.ingestor || this.ingestor.key !== key) {
        this.ingestor = new SessionIngestor(this.store, key);
        this.emit('session', this.ingestor.state);
      }
      if (st.size > this.ingestor.offset) {
        const events = this.ingestor.readFrom(this.path);
        if (events.length) this.emit('events', events, this.ingestor.state);
      }
    } catch (err) {
      // El juego puede estar rotando el fichero justo ahora: se reintenta en el siguiente ciclo.
      if ((err as NodeJS.ErrnoException).code !== 'EBUSY') console.error('[tailer]', (err as Error).message);
    }
  }

  private readKey(): string | null {
    const fd = openSync(this.path, 'r');
    try {
      const buf = Buffer.alloc(512);
      const n = readSync(fd, buf, 0, buf.length, 0);
      const first = buf.subarray(0, n).toString('utf8').split('\n')[0] ?? '';
      return backupKeyFromHeader(first);
    } finally {
      closeSync(fd);
    }
  }
}
