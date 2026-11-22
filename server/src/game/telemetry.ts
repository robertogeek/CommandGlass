import http2 from 'node:http2';
import net from 'node:net';

/**
 * Telemetría local del juego (gRPC, Star Citizen 4.10.2 o posterior). Es de SOLO LECTURA.
 *
 * El juego la sirve en 127.0.0.1:2942 solo si el RSI Launcher se abrió con GRPC_CLIENT_SERVER_ENABLED=true.
 * Solo se llama a `TelemetryStream`; nunca a `TriggerGameAction` ni a nada que actúe en el juego.
 * Además, solo se conecta mientras alguien mira la pestaña Telemetría: sin clientes, el juego no genera fotogramas.
 *
 * CIG no publica el esquema: los campos se leen por su número, según docs/telemetria-grpc.md
 * (mapa deducido de capturas reales). Los datos llegan de un puerto sin autenticación, así que se tratan como no fiables:
 * límite de tamaño, tipos comprobados y enums desconocidos tal cual.
 */

const SERVICE = '/sc.game.telemetry.v1.GameTelemetryService/TelemetryStream';
/** 2942 es el de la 4.10; en la 5.0 se ha visto 33740. */
const PORTS = (process.env.CG_TELEMETRY_PORTS ?? '2942,33740').split(',').map(Number).filter((p) => p > 0 && p < 65536);
const MAX_MSG = 1 << 20;
/** Sin peticiones de la pestaña durante este tiempo, se desconecta. */
const IDLE_MS = 45_000;
const RETRY_MS = 4_000;
const STALE_MS = 3_000;
const WAITING_AFTER_MS = 30_000;
/** float máximo: el juego lo usa como «sin dato» (altitud en el espacio). */
const NO_DATA = 1e30;

// ---------------------------------------------------------------- protobuf genérico

type Wire = number | { f32: number } | { f64: number } | Buffer;

function varint(buf: Buffer, i: number): [number, number] {
  let v = 0n;
  let shift = 0n;
  let b: number;
  do {
    if (i >= buf.length || shift > 63n) throw new Error('varint');
    b = buf[i++]!;
    v |= BigInt(b & 0x7f) << shift;
    shift += 7n;
  } while (b & 0x80);
  return [Number(BigInt.asIntN(64, v)), i];
}

/** Un mensaje protobuf sin esquema: número de campo → valores. Los submensajes se leen al pedirlos. */
export class Pb {
  readonly fields: Map<number, Wire[]>;
  private constructor(fields: Map<number, Wire[]>) {
    this.fields = fields;
  }

  static parse(buf: Buffer, depth = 0): Pb | null {
    if (depth > 12) return null;
    const fields = new Map<number, Wire[]>();
    let i = 0;
    try {
      while (i < buf.length) {
        let key: number;
        [key, i] = varint(buf, i);
        const field = Math.floor(key / 8);
        const wt = key & 7;
        if (field < 1) return null;
        let val: Wire;
        if (wt === 0) [val, i] = varint(buf, i);
        else if (wt === 1) {
          if (i + 8 > buf.length) return null;
          val = { f64: buf.readDoubleLE(i) };
          i += 8;
        } else if (wt === 5) {
          if (i + 4 > buf.length) return null;
          val = { f32: buf.readFloatLE(i) };
          i += 4;
        } else if (wt === 2) {
          let len: number;
          [len, i] = varint(buf, i);
          if (len < 0 || i + len > buf.length) return null;
          val = buf.subarray(i, i + len);
          i += len;
        } else return null;
        const list = fields.get(field);
        if (list) list.push(val);
        else fields.set(field, [val]);
      }
    } catch {
      return null;
    }
    return new Pb(fields);
  }

  has(n: number): boolean {
    return this.fields.has(n);
  }

  private last(n: number): Wire | undefined {
    return this.fields.get(n)?.at(-1);
  }

  /** Número: varint o float. Ausente = 0, porque protobuf omite los ceros. */
  num(n: number): number {
    const v = this.last(n);
    if (typeof v === 'number') return v;
    if (v && !Buffer.isBuffer(v)) return 'f32' in v ? v.f32 : v.f64;
    return 0;
  }

  bool(n: number): boolean {
    return this.num(n) !== 0;
  }

  str(n: number): string {
    const v = this.last(n);
    return Buffer.isBuffer(v) ? v.toString('utf8').slice(0, 200) : '';
  }

  msg(n: number): Pb | null {
    const v = this.last(n);
    return Buffer.isBuffer(v) ? Pb.parse(v) : null;
  }

  msgs(n: number): Pb[] {
    return (this.fields.get(n) ?? []).flatMap((v) => (Buffer.isBuffer(v) ? [Pb.parse(v)].filter((m): m is Pb => !!m) : []));
  }

  /** Árbol legible para la vista de depuración: campo → valor (texto si lo parece, si no, submensaje). */
  toJSON(depth = 0): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, vals] of this.fields) {
      const shown = vals.map((v) => {
        if (typeof v === 'number') return v;
        if (!Buffer.isBuffer(v)) return 'f32' in v ? round(v.f32) : round(v.f64);
        const text = v.toString('utf8');
        if (v.length > 1 && /^[\w .,:'()\-/]+$/.test(text)) return text;
        const sub = depth < 8 && v.length ? Pb.parse(v, depth + 1) : null;
        if (sub) return sub.toJSON(depth + 1);
        return v.length ? v.toString('hex') : '';
      });
      out[k] = shown.length === 1 ? shown[0] : shown;
    }
    return out;
  }
}

function round(x: number): number {
  if (!Number.isFinite(x) || Math.abs(x) >= NO_DATA) return x;
  return Math.round(x * 10_000) / 10_000;
}

// ---------------------------------------------------------------- fotograma → datos

export interface Vital {
  current: number;
  max: number;
}

export interface TelemetryActor {
  health: Vital;
  oxygen: Vital;
  hunger: Vital;
  thirst: Vital;
  bodyTemperature: number;
  intoxication: number;
  heartRate: number;
  gravity: number;
  /** En atmósferas (1 = 1013 hPa). */
  pressure: number;
  /** 1 a pie, 2 EVA, 3 sentado (0 o desconocido: tal cual). */
  locomotion: number;
  /** 1 piloto, 2 artillero, 3 tripulante. */
  crewRole: number;
  seatName: string;
  uecBalance: number | null;
  externalTemperature: number;
  radiation: number;
  breathable: boolean;
}

export interface TelemetryVehicle {
  name: string;
  className: string;
  /** 1 nave, 2 tierra, 3 gravlev, 4 barco. */
  type: number;
  /** pwr, wpn, thr, shld, cool, qdrv, radr, prox, hit, misl: 1 NOMINAL … 6 MAJOR_ON. */
  annunciators: number[];
  landed: boolean;
  /** 1 recogido, 2 bajando, 3 fuera, 4 subiendo. */
  gear: number;
  vtol: number;
  speed: number;
  hydrogen: number;
  quantum: number | null;
  gForce: number;
  gForceMax: number;
  boost: { engaged: boolean; output: number; reserves: number };
  altitude: number | null;
  radarAltitude: number | null;
  verticalSpeed: number;
  atmosphericDensity: number | null;
  heading: number;
  /** powerplants, engines, weapons, coolers, life_support, gravity_generators, sensors, shield_generators, shield_emitters. */
  power: boolean[];
  /** Ajustes de vuelo (IFCS) por posición: aún sin saber cuál es cuál. */
  ifcs: boolean[];
}

export interface TelemetryWeapons {
  weapons: { name: string; powered: boolean; ready: boolean; inGroup: boolean }[];
  /** type: 1 DECOY, 2 NOISE. */
  countermeasures: { type: number; amount: number }[];
}

export interface TelemetryFrame {
  actor: TelemetryActor | null;
  vehicle: TelemetryVehicle | null;
  weapons: TelemetryWeapons | null;
  /** Bloques de primer nivel que trae el fotograma. */
  blocks: number[];
}

const finite = (x: number): number => (Number.isFinite(x) ? x : 0);
const maybe = (x: number): number | null => (!Number.isFinite(x) || Math.abs(x) >= NO_DATA ? null : x);
const vital = (m: Pb | null): Vital => ({ current: finite(m?.num(1) ?? 0), max: finite(m?.num(2) ?? 0) });

export function readFrame(buf: Buffer): TelemetryFrame | null {
  const root = Pb.parse(buf);
  if (!root) return null;
  const blocks = [...root.fields.keys()].sort((a, b) => a - b);

  let actor: TelemetryActor | null = null;
  const a = root.msg(6);
  if (a) {
    const v = a.msg(1);
    const s = a.msg(2);
    const e = a.msg(3);
    const uec = s?.has(4) ? s.num(4) : null;
    actor = {
      health: vital(v?.msg(1) ?? null),
      oxygen: vital(v?.msg(2) ?? null),
      hunger: vital(v?.msg(3) ?? null),
      thirst: vital(v?.msg(4) ?? null),
      bodyTemperature: finite(v?.msg(5)?.num(1) ?? 0),
      intoxication: finite(v?.num(6) ?? 0),
      heartRate: finite(v?.num(7) ?? 0),
      gravity: finite(v?.num(8) ?? 0),
      pressure: finite(v?.num(9) ?? 0),
      locomotion: s?.num(1) ?? 0,
      crewRole: s?.num(2) ?? 0,
      seatName: s?.str(3) ?? '',
      uecBalance: uec != null && Number.isSafeInteger(uec) ? uec : null,
      externalTemperature: finite(e?.num(1) ?? 0),
      radiation: finite(e?.num(2) ?? 0),
      breathable: e?.bool(3) ?? false,
    };
  }

  let vehicle: TelemetryVehicle | null = null;
  const vs = root.msg(3)?.msg(2);
  if (vs) {
    const ann = vs.msg(7);
    const flight = vs.msg(8);
    const fs = flight?.msg(1);
    const settings = flight?.msg(2);
    const ins = flight?.msg(3);
    const g = ins?.msg(4);
    const boost = ins?.msg(5);
    const power = vs.msg(9);
    const density = finite(ins?.num(9) ?? 0);
    const ifcs: boolean[] = [];
    if (settings) {
      const top = Math.min(32, Math.max(0, ...settings.fields.keys()));
      for (let i = 1; i <= top; i++) {
        const sub = settings.msg(i);
        ifcs.push(sub ? [...sub.fields.keys()].some((k) => sub.bool(k)) : settings.bool(i));
      }
    }
    vehicle = {
      name: vs.str(1),
      className: vs.str(2),
      type: vs.num(4),
      annunciators: Array.from({ length: 10 }, (_, i) => ann?.num(i + 1) ?? 0),
      landed: fs?.bool(1) ?? false,
      gear: fs?.num(2) ?? 0,
      vtol: fs?.num(3) ?? 0,
      speed: finite(ins?.num(1) ?? 0),
      hydrogen: finite(ins?.num(2) ?? 0),
      quantum: ins?.has(3) ? maybe(ins.num(3)) : null,
      gForce: finite(g?.num(1) ?? 0),
      gForceMax: finite(g?.num(2) ?? 0),
      boost: { engaged: boost?.bool(1) ?? false, output: finite(boost?.num(2) ?? 0), reserves: finite(boost?.num(3) ?? 0) },
      altitude: maybe(ins?.num(6) ?? 0),
      radarAltitude: maybe(ins?.num(7) ?? 0),
      verticalSpeed: finite(ins?.num(8) ?? 0),
      // En el espacio el campo desaparece (vale 0): «fuera de la atmósfera».
      atmosphericDensity: density > 0 ? density : null,
      heading: finite(ins?.num(10) ?? 0),
      power: Array.from({ length: 9 }, (_, i) => power?.bool(i + 1) ?? false),
      ifcs,
    };
  }

  let weapons: TelemetryWeapons | null = null;
  const w = root.msg(4);
  if (w) {
    weapons = {
      weapons: w.msgs(4).slice(0, 64).map((x) => ({ name: x.str(1), powered: x.bool(2), ready: x.bool(3), inGroup: x.bool(4) })),
      countermeasures: w.msgs(5).slice(0, 8).map((x) => ({ type: x.num(1), amount: Math.max(0, Math.round(x.num(2))) })),
    };
  }

  return { actor, vehicle, weapons, blocks };
}

// ---------------------------------------------------------------- conexión

export type TelemetryLink = 'off' | 'waiting' | 'live' | 'stale';

export interface TelemetrySnapshot extends Omit<TelemetryFrame, 'blocks'> {
  link: TelemetryLink;
  port: number | null;
  hz: number;
  frames: number;
  /** ms desde el último fotograma (null si aún no ha llegado ninguno en esta conexión). */
  lastFrameAgoMs: number | null;
  /** ms esperando datos con la conexión abierta. */
  waitingMs: number | null;
  /** Bloque → ms desde que llegó por última vez (null = nunca en esta conexión). */
  blocks: Record<string, number | null>;
}

export interface TelemetryDebug {
  raw: Record<string, unknown> | null;
  rawBytes: number;
  hzHistory: number[];
  intervalMs: { last: number | null; min: number | null; max: number | null };
}

export class GameTelemetry {
  private session: http2.ClientHttp2Session | null = null;
  private port: number | null = null;
  private connecting = false;
  private connectedAt = 0;
  private lastFrameAt = 0;
  private frames = 0;
  private recent: number[] = [];
  private perSecond = new Map<number, number>();
  private blockSeen = new Map<number, number>();
  private intervals = { last: null as number | null, min: null as number | null, max: null as number | null };
  private last: TelemetryFrame | null = null;
  private lastRaw: Buffer | null = null;
  private lastTouch = 0;
  private timer: NodeJS.Timeout | null = null;

  /** La pestaña pide datos: se conecta (si hace falta) y sigue conectada mientras siga pidiendo. */
  touch(): void {
    this.lastTouch = Date.now();
    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), RETRY_MS);
      this.timer.unref();
    }
    if (!this.session && !this.connecting) void this.connect();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.disconnect();
  }

  private tick(): void {
    if (Date.now() - this.lastTouch > IDLE_MS) {
      this.stop();
      return;
    }
    if (!this.session && !this.connecting) void this.connect();
  }

  private async connect(): Promise<void> {
    this.connecting = true;
    try {
      let port: number | null = null;
      for (const p of PORTS) if (await portOpen(p)) { port = p; break; }
      if (port === null) return;
      this.open(port);
    } finally {
      this.connecting = false;
    }
  }

  private open(port: number): void {
    const session = http2.connect(`http://127.0.0.1:${port}`);
    this.session = session;
    this.port = port;
    this.connectedAt = Date.now();
    this.resetCounters();
    session.on('error', () => this.disconnect(session));
    session.on('close', () => this.disconnect(session));
    const req = session.request({ ':method': 'POST', ':path': SERVICE, 'content-type': 'application/grpc', te: 'trailers' });
    let pending: Buffer = Buffer.alloc(0);
    req.on('data', (chunk: Buffer) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      while (pending.length >= 5) {
        const len = pending.readUInt32BE(1);
        if (len > MAX_MSG) {
          req.close();
          return this.disconnect(session);
        }
        if (pending.length < 5 + len) break;
        this.onMessage(Buffer.from(pending.subarray(5, 5 + len)));
        pending = pending.subarray(5 + len);
      }
      if (pending.length > MAX_MSG + 5) this.disconnect(session);
    });
    req.on('error', () => this.disconnect(session));
    req.on('close', () => this.disconnect(session));
    req.end(Buffer.from([0, 0, 0, 0, 0])); // TelemetryStreamRequest vacía
    console.log(`[telemetría] conectado al juego en el puerto ${port}`);
  }

  private disconnect(which?: http2.ClientHttp2Session): void {
    const s = this.session;
    if (!s || (which && which !== s)) return;
    this.session = null;
    this.port = null;
    if (!s.destroyed) s.destroy();
    if (this.frames) console.log(`[telemetría] desconectado (${this.frames} fotogramas)`);
  }

  private resetCounters(): void {
    this.lastFrameAt = 0;
    this.frames = 0;
    this.recent = [];
    this.perSecond.clear();
    this.blockSeen.clear();
    this.intervals = { last: null, min: null, max: null };
    this.last = null;
    this.lastRaw = null;
  }

  private onMessage(buf: Buffer): void {
    const frame = readFrame(buf);
    if (!frame) return;
    const now = Date.now();
    if (this.lastFrameAt) {
      const d = now - this.lastFrameAt;
      this.intervals.last = d;
      this.intervals.min = this.intervals.min == null ? d : Math.min(this.intervals.min, d);
      this.intervals.max = this.intervals.max == null ? d : Math.max(this.intervals.max, d);
    }
    this.lastFrameAt = now;
    this.frames++;
    this.recent.push(now);
    while (this.recent.length && now - this.recent[0]! > 2000) this.recent.shift();
    const sec = Math.floor(now / 1000);
    this.perSecond.set(sec, (this.perSecond.get(sec) ?? 0) + 1);
    if (this.perSecond.size > 70) for (const k of this.perSecond.keys()) if (k < sec - 65) this.perSecond.delete(k);
    for (const b of frame.blocks) this.blockSeen.set(b, now);
    this.last = frame;
    this.lastRaw = buf;
  }

  snapshot(): TelemetrySnapshot {
    const now = Date.now();
    const since = this.lastFrameAt ? now - this.lastFrameAt : null;
    let link: TelemetryLink = 'off';
    if (this.session) {
      if (since == null || since > WAITING_AFTER_MS) link = 'waiting';
      else link = since > STALE_MS ? 'stale' : 'live';
    }
    while (this.recent.length && now - this.recent[0]! > 2000) this.recent.shift();
    const blocks: Record<string, number | null> = {};
    for (const [k, name] of [[6, 'actor'], [3, 'vehicle'], [4, 'weapons'], [5, 'events'], [7, 'force_feedback'], [8, 'turret']] as const) {
      const at = this.blockSeen.get(k);
      blocks[name] = at ? now - at : null;
    }
    const fresh = link === 'live' || link === 'stale';
    // El bloque de la nave deja de llegar al levantarte: si lleva más de 1,5 s sin llegar, ya no hay nave.
    const gone = (name: string) => (blocks[name] ?? Infinity) > 1500;
    return {
      link,
      port: this.port,
      hz: Math.round((this.recent.length / 2) * 10) / 10,
      frames: this.frames,
      lastFrameAgoMs: since,
      waitingMs: this.session && link === 'waiting' ? now - (this.lastFrameAt || this.connectedAt) : null,
      blocks,
      actor: fresh ? (this.last?.actor ?? null) : null,
      vehicle: fresh && !(link === 'live' && gone('vehicle')) ? (this.last?.vehicle ?? null) : null,
      weapons: fresh && !(link === 'live' && gone('weapons')) ? (this.last?.weapons ?? null) : null,
    };
  }

  debug(): TelemetryDebug {
    const sec = Math.floor(Date.now() / 1000);
    // Últimos 60 segundos completos (el actual aún se está llenando).
    const hzHistory = Array.from({ length: 60 }, (_, i) => this.perSecond.get(sec - 60 + i) ?? 0);
    return {
      raw: this.lastRaw ? (Pb.parse(this.lastRaw)?.toJSON() ?? null) : null,
      rawBytes: this.lastRaw?.length ?? 0,
      hzHistory,
      intervalMs: { ...this.intervals },
    };
  }
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(800, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}
