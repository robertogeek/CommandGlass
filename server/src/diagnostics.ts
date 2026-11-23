import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { arch, platform, release, totalmem, version as osVersion } from 'node:os';
import { join } from 'node:path';
import { APP_VERSION, PARSER_VERSION, type AppConfig } from './config.ts';
import type { LiveTailer } from './ingest/tailer.ts';
import { getLang } from './i18n.ts';
import { logFiles, redact } from './log.ts';
import { hudTranslator } from './parser/hudlang.ts';
import type { Store } from './store/db.ts';
import { makeZip } from './zip.ts';

/**
 * Informe de diagnóstico: un .zip que el usuario guarda y nos manda por correo si algo no funciona.
 * Lleva el registro de CommandGlass, un resumen de lo que la app ha entendido del juego y, si el usuario lo
 * deja marcado, el Game.log de la última partida. Nunca lleva el token de UEX ni la clave de emparejamiento.
 * No se envía solo: lo genera el usuario desde la ventana del PC.
 */

export interface ClientReport {
  ts: string;
  device: string;
  remote: boolean;
  kind: 'hello' | 'error';
  message: string;
  detail?: string;
}

const MAX_CLIENT = 100;
const clientReports: ClientReport[] = [];

/** Lo que cuentan los tablets: qué navegador y pantalla tienen y los errores de la interfaz. */
export function addClientReport(r: ClientReport): void {
  clientReports.push(r);
  if (clientReports.length > MAX_CLIENT) clientReports.shift();
}

export function recentClientReports(): ClientReport[] {
  return [...clientReports];
}

/** Lo último del fichero, como mucho `max` bytes (los Game.log de partidas largas pasan de 50 MB). */
function tail(path: string, max: number): Buffer {
  const size = statSync(path).size;
  if (size <= max) return readFileSync(path);
  const buf = Buffer.alloc(max);
  const fd = openSync(path, 'r');
  try {
    readSync(fd, buf, 0, max, size - max);
  } finally {
    closeSync(fd);
  }
  return buf;
}

export interface DiagnosticsDeps {
  config: AppConfig;
  store: Store;
  tailer: LiveTailer;
  sources: Record<string, unknown>;
  devices: { remote: boolean; since: string; agent: string }[];
}

interface Count {
  type: string;
  n: number;
}

export function buildDiagnostics({ config, store, tailer, sources, devices }: DiagnosticsDeps, opts: { gameLog: boolean }): { name: string; zip: Buffer } {
  const now = new Date();
  const db = store.db;
  const lines: string[] = [];
  const out = (s = '') => lines.push(s);

  out('CommandGlass · informe de diagnóstico');
  out(`Creado: ${now.toISOString()}`);
  out();
  out('== App');
  out(`Versión: ${APP_VERSION} · parser ${PARSER_VERSION} · idioma ${getLang()}`);
  out(`Windows: ${osVersion()} (${release()}, ${platform()} ${arch()}) · ${Math.round(totalmem() / 2 ** 30)} GB RAM`);
  out(`Node ${process.versions.node}${process.versions.electron ? ` · Electron ${process.versions.electron}` : ''}`);
  out();

  out('== Juego');
  out(`Carpeta: ${config.gameDir} (${config.gameDirFound ? 'encontrada' : 'NO encontrada'})`);
  const st = tailer.status();
  out(`Game.log: ${st.found ? 'sí' : 'NO'} · última escritura ${st.lastWriteAt ?? '—'} · ${st.active ? 'partida en directo' : 'sin partida ahora'}`);
  out(`Sesión actual: ${st.sessionKey ?? '—'}`);
  const userCfg = join(config.gameDir, 'user.cfg');
  let cfgText: string | null = null;
  if (existsSync(userCfg)) {
    try {
      cfgText = readFileSync(userCfg, 'utf8');
      const langLine = cfgText.split(/\r?\n/).filter((l) => /g_language/i.test(l));
      out(`Idioma del juego (user.cfg): ${langLine.length ? langLine.join(' · ') : 'no indicado (inglés)'}`);
    } catch {
      out('user.cfg: no se puede leer');
    }
  } else {
    out('user.cfg: no hay (el juego va en inglés salvo que se cambie de otra forma)');
  }
  const hud = hudTranslator();
  out(`Avisos del juego: ${hud ? `se traducen desde ${hud.lang} (${hud.size} textos)` : 'en inglés, sin traducir'}`);
  out();

  out('== Ajustes');
  const settings = db.prepare('SELECT key, value FROM settings ORDER BY key').all() as { key: string; value: string }[];
  for (const s of settings) {
    // Ni el token de UEX ni nada que parezca una clave.
    const secret = /token|key|secret|pass/i.test(s.key);
    out(`${s.key}: ${secret ? (s.value && s.value !== 'null' && s.value !== '""' ? '(configurado)' : '(vacío)') : s.value.slice(0, 200)}`);
  }
  out();

  out('== Fuentes de datos');
  for (const [k, v] of Object.entries(sources)) out(`${k}: ${JSON.stringify(v)}`);
  out();

  out('== Dispositivos conectados ahora');
  if (!devices.length) out('(ninguno)');
  for (const d of devices) out(`${d.agent} · ${d.remote ? 'tablet' : 'este PC'} · desde ${d.since}`);
  out();

  out('== Últimas sesiones');
  const sessions = db
    .prepare('SELECT id, key, build, started_at, ended_at, event_count, parser_version FROM sessions ORDER BY id DESC LIMIT 12')
    .all() as { id: number; key: string; build: string | null; started_at: string | null; ended_at: string | null; event_count: number; parser_version: number }[];
  for (const s of sessions) out(`#${s.id} ${s.key} · build ${s.build ?? '—'} · ${s.started_at ?? '?'} → ${s.ended_at ?? '…'} · ${s.event_count} eventos · parser ${s.parser_version}`);
  out();

  const last = sessions[0]?.id ?? null;
  const counts = (where: string, ...args: (number | string)[]) =>
    db.prepare(`SELECT type, COUNT(*) AS n FROM events ${where} GROUP BY type ORDER BY n DESC`).all(...args) as unknown as Count[];
  const all = counts('');
  const n = (list: Count[], type: string) => list.find((c) => c.type === type)?.n ?? 0;

  out('== Contratos (para ver si se reconocen)');
  const lastCounts = last ? counts('WHERE session_id = ?', last) : [];
  for (const [label, list] of [['Todo el historial', all], ['Última sesión', lastCounts]] as const) {
    out(
      `${label}: ${n(list, 'mission.info')} marcadores de misión · ${n(list, 'mission.accepted')} aceptados · ${n(list, 'mission.completed')} completados · ${n(list, 'mission.failed')} fallidos · ${n(list, 'mission.ended')} terminados`,
    );
  }
  if (n(all, 'mission.info') > 0 && n(all, 'mission.accepted') === 0) {
    out('AVISO: hay marcadores de misión pero ningún contrato aceptado: los avisos del juego no se están reconociendo (¿idioma o traducción sin cargar?).');
  }
  out();

  out('== Eventos por tipo (todo el historial)');
  for (const c of all) out(`${c.type}: ${c.n}`);
  out();

  out('== Avisos del juego que la app no reconoce (últimos 80)');
  const notes = db.prepare(`SELECT ts, data FROM events WHERE type = 'notification' ORDER BY id DESC LIMIT 80`).all() as { ts: string; data: string }[];
  if (!notes.length) out('(ninguno)');
  for (const r of notes) {
    const d = JSON.parse(r.data) as { text?: string; detail?: string; missionId?: string };
    out(`${r.ts} ${d.text ?? ''}${d.detail ? ` | ${d.detail}` : ''}${d.missionId ? ` [misión ${d.missionId}]` : ''}`);
  }
  out();

  out('== Tablets (navegador, pantalla y errores de la interfaz)');
  const reports = recentClientReports();
  if (!reports.length) out('(nada todavía: abre CommandGlass en el tablet antes de crear el informe)');
  for (const r of reports) out(`${r.ts} ${r.device}${r.remote ? '' : ' (PC)'} · ${r.kind === 'hello' ? 'conexión' : 'ERROR'}: ${r.message}${r.detail ? `\n    ${r.detail.replace(/\n/g, '\n    ')}` : ''}`);
  out();

  // Lo que hace la app de escritorio por su cuenta (botón de telemetría, pantallas de este PC, actualizaciones).
  // Solo esas líneas: el resto de ese registro repite lo del servidor.
  out('== App de escritorio (telemetría, pantallas de este PC y actualizaciones; últimas 60)');
  const desktopLog = process.env.CG_DESKTOP_LOG;
  let desktopLines: string[] = [];
  try {
    if (desktopLog && existsSync(desktopLog)) {
      desktopLines = tail(desktopLog, 2 ** 20)
        .toString('utf8')
        .split(/\r?\n/)
        .filter((l) => /\[(telemetría|pantallas|actualización)\]/.test(l))
        .slice(-60);
    }
  } catch {
    /* sin registro */
  }
  if (!desktopLines.length) out('(nada todavía)');
  for (const l of desktopLines) out(l);
  out();

  const state = tailer.state;
  const files: { name: string; data: Buffer | string }[] = [
    { name: 'informe.txt', data: redact(lines.join('\n')) },
    { name: 'estado.json', data: redact(JSON.stringify({ status: st, state }, null, 2)) },
  ];
  for (const f of logFiles()) files.push({ name: f.split(/[\\/]/).pop()!, data: readFileSync(f) });
  if (cfgText !== null) files.push({ name: 'user.cfg', data: cfgText });
  if (opts.gameLog && st.found) {
    try {
      files.push({ name: 'Game.log', data: tail(st.path, 40 * 2 ** 20) });
    } catch (err) {
      files.push({ name: 'Game.log.txt', data: `No se ha podido leer el Game.log: ${(err as Error).message}` });
    }
  }
  const stamp = now.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  return { name: `CommandGlass-informe-${stamp}.zip`, zip: makeZip(files, now) };
}
