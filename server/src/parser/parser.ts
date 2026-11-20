import { hudTranslator } from './hudlang.ts';
import { splitLine } from './line.ts';
import { RULES, classifyNotification, type RuleApi } from './rules.ts';
import type { GameEvent, LogLine, ParserContext } from './types.ts';

const NOTIF_TAG = 'SHUDEvent_OnNotification';
const NOTIF_RE = /^Added notification "([\s\S]*?)" \[(\d+)\] to queue[\s\S]*?MissionId: \[([^\]]*)\]/;

/**
 * Parser con estado de una sesión (un fichero Game.log).
 * Se alimenta línea a línea y devuelve los eventos que reconoce.
 */
export class LogParser {
  readonly ctx: ParserContext;
  private pendingNotif: { ts: string; body: string } | null = null;
  private onceSeen = new Map<string, number>();
  private lastValues = new Map<string, string>();
  private lastTs: string | null = null;
  private api: RuleApi;

  constructor(ctx?: Partial<ParserContext>) {
    this.ctx = { playerName: ctx?.playerName ?? null, playerGeid: ctx?.playerGeid ?? null };
    this.api = {
      ctx: this.ctx,
      isMe: (name, geid) =>
        (!!name && !!this.ctx.playerName && name === this.ctx.playerName) ||
        (!!geid && !!this.ctx.playerGeid && geid === this.ctx.playerGeid),
      once: (key, windowMs, ts) => {
        const t = Date.parse(ts);
        const prev = this.onceSeen.get(key);
        if (prev !== undefined && t - prev < windowMs) return false;
        this.onceSeen.set(key, t);
        return true;
      },
      changed: (key, value) => {
        if (this.lastValues.get(key) === value) return false;
        this.lastValues.set(key, value);
        return true;
      },
    };
  }

  get lastTimestamp(): string | null {
    return this.lastTs;
  }

  feed(raw: string): GameEvent[] {
    const line = splitLine(raw.replace(/\r$/, ''));
    if (!line) return [];
    this.lastTs = line.ts;

    // Notificación partida en varias líneas: las siguientes vienen sin [Nivel] <Tag>.
    if (this.pendingNotif) {
      if (line.level === null) {
        this.pendingNotif.body += '\n' + line.body;
        if (!NOTIF_RE.test(this.pendingNotif.body)) return [];
        const done = this.pendingNotif;
        this.pendingNotif = null;
        return this.notification(done.ts, done.body);
      }
      this.pendingNotif = null; // se cortó: se descarta
    }

    if (!line.tag) return [];

    if (line.tag === NOTIF_TAG) {
      if (!line.body.startsWith('Added notification "')) return [];
      if (NOTIF_RE.test(line.body)) return this.notification(line.ts, line.body);
      this.pendingNotif = { ts: line.ts, body: line.body };
      return [];
    }

    const rule = RULES[line.tag];
    if (!rule) return [];
    return this.finish(line, rule(line, this.api));
  }

  private notification(ts: string, body: string): GameEvent[] {
    const m = NOTIF_RE.exec(body);
    if (!m) return [];
    const text = m[1]!;
    const missionId = m[3] ?? null;
    // Juego en otro idioma: se reconoce en inglés; si aun así no hay regla, el aviso se guarda tal cual se vio.
    const english = hudTranslator()?.toEnglish(text) ?? null;
    let ev = classifyNotification(english ?? text, missionId, this.api);
    if (english !== null && ev.type === 'notification') ev = classifyNotification(text, missionId, this.api);
    return [{ ...ev, ts }];
  }

  private finish(line: LogLine, out: ReturnType<(typeof RULES)[string]>): GameEvent[] {
    if (!out) return [];
    const list = Array.isArray(out) ? out : [out];
    return list.map((e) => ({ ...e, ts: e.ts ?? line.ts }));
  }
}
