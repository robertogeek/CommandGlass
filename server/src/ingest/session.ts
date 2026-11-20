import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { PARSER_VERSION } from '../config.ts';
import { buildFromKey } from '../parser/line.ts';
import { LogParser } from '../parser/parser.ts';
import type { GameEvent } from '../parser/types.ts';
import { applyEvent, emptyState, type LiveState } from '../state/reducer.ts';
import type { SessionRow, Store, StoredEvent } from '../store/db.ts';

/**
 * Tamaño de cada lectura del log. Por debajo de ~1 MB Node crea textos normales que se liberan enseguida; con trozos
 * más grandes los guarda fuera del heap y un log de 600 MB llegaba a ocupar 800 MB de RAM mientras se leía.
 */
const READ_CHUNK = 512 * 1024;

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
    const out: StoredEvent[] = [];
    try {
      const size = fstatSync(fd).size;
      // A trozos: hay Game.log de más de 512 MB, más de lo que cabe en un solo texto de JavaScript.
      const buf = Buffer.alloc(Math.min(READ_CHUNK, Math.max(0, size - this.session.byte_offset)));
      while (this.session.byte_offset < size) {
        const start = this.session.byte_offset;
        const n = readSync(fd, buf, 0, Math.min(buf.length, size - start), start);
        if (n <= 0) break;
        // Solo líneas completas: lo que quede tras el último \n se lee en la siguiente pasada.
        const lastNl = buf.subarray(0, n).lastIndexOf(0x0a);
        if (lastNl < 0) {
          if (n < READ_CHUNK) break; // línea a medio escribir: se completa luego
          this.skipTo(start + n); // medio mega sin un salto de línea no es del juego: se descarta
          continue;
        }
        out.push(...this.processText(buf.subarray(0, lastNl + 1).toString('utf8'), start + lastNl + 1));
      }
    } finally {
      closeSync(fd);
    }
    return out;
  }

  private skipTo(offset: number): void {
    this.store.updateSessionProgress(this.session.id, offset, 0, this.state);
    this.session.byte_offset = offset;
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
