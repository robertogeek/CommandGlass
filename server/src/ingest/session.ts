import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { PARSER_VERSION } from '../config.ts';
import { buildFromKey } from '../parser/line.ts';
import { LogParser } from '../parser/parser.ts';
import type { GameEvent } from '../parser/types.ts';
import { applyEvent, emptyState, type LiveState } from '../state/reducer.ts';
import type { SessionRow, Store, StoredEvent } from '../store/db.ts';

/**
 * Procesa un fichero de log (vivo o archivado) de forma incremental.
 * Guarda el desplazamiento en bytes, así que se puede retomar donde se quedó:
 * el Game.log en vivo y su copia posterior en logbackups/ comparten clave y offset.
 */
export class SessionIngestor {
  readonly key: string;
  private session: SessionRow;
  private parser: LogParser;
  state: LiveState;
  private remainder = '';
  private store: Store;

  constructor(store: Store, key: string) {
    this.store = store;
    this.key = key;
    this.session = store.openSession(key, buildFromKey(key), PARSER_VERSION);
    const fallback = store.lastKnownPlayer();
    this.parser = new LogParser({
      playerName: this.session.player ?? fallback.name,
      playerGeid: this.session.player_geid ?? fallback.geid,
    });
    this.state = this.session.state ? (JSON.parse(this.session.state) as LiveState) : emptyState();
    this.state.sessionKey = key;
    this.state.build = this.session.build;
    if (!this.state.player.name && this.parser.ctx.playerName) {
      this.state.player = { name: this.parser.ctx.playerName, geid: this.parser.ctx.playerGeid };
    }
  }

  get sessionId(): number {
    return this.session.id;
  }

  get offset(): number {
    return this.session.byte_offset;
  }

  /**
   * Lee desde el offset guardado hasta el final del fichero y procesa las líneas completas.
   * Abre y cierra el fichero en cada llamada para no bloquear al juego.
   */
  readFrom(path: string): StoredEvent[] {
    const fd = openSync(path, 'r');
    let buf: Buffer;
    let size: number;
    try {
      size = fstatSync(fd).size;
      if (size <= this.session.byte_offset) return [];
      buf = Buffer.alloc(size - this.session.byte_offset);
      readSync(fd, buf, 0, buf.length, this.session.byte_offset);
    } finally {
      closeSync(fd);
    }
    // Solo líneas completas: lo que quede tras el último \n se lee en la siguiente pasada.
    const lastNl = buf.lastIndexOf(0x0a);
    if (lastNl < 0) return [];
    const text = buf.subarray(0, lastNl + 1).toString('utf8');
    return this.processText(text, this.session.byte_offset + lastNl + 1);
  }

  processText(text: string, newOffset: number): StoredEvent[] {
    const lines = (this.remainder + text).split('\n');
    this.remainder = '';
    const events: GameEvent[] = [];
    for (const line of lines) {
      if (line) events.push(...this.parser.feed(line));
    }
    for (const e of events) applyEvent(this.state, e);
    if (this.parser.ctx.playerName) {
      this.state.player = { name: this.parser.ctx.playerName, geid: this.parser.ctx.playerGeid };
    }
    return this.store.transaction(() => {
      const stored = this.store.insertEvents(this.session.id, events);
      this.store.updateSessionProgress(this.session.id, newOffset, stored.length, this.state);
      this.session.byte_offset = newOffset;
      return stored;
    });
  }
}
