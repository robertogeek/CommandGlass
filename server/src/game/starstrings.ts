import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Datos de contratos de StarStrings (github.com/MrKraken/StarStrings), un proyecto de la comunidad que los extrae
 * de los ficheros del juego en cada build, para LIVE (rama master) y PTU (rama sc-ptu).
 * Publica src/For_Tool_Creators/contracts.ini para que otras herramientas lo usen: texto de cada contrato con
 * reputación, tiempo de espera, naves que esperar, blueprints posibles y el "Debug Name" que también sale en Game.log.
 * Se descarga una vez al día y se guarda en data/game/community/.
 */

export type Channel = 'LIVE' | 'PTU';

const URL: Record<Channel, string> = {
  LIVE: 'https://raw.githubusercontent.com/MrKraken/StarStrings/master/src/For_Tool_Creators/contracts.ini',
  PTU: 'https://raw.githubusercontent.com/MrKraken/StarStrings/sc-ptu/src/For_Tool_Creators/contracts.ini',
};
const MAX_AGE_MS = 24 * 3600_000;

export interface CommunityContract {
  debugNames: string[];
  title: string;
  /** Reputación tal cual la escriben ("150", "100 - 500"…) y su primer número. */
  reputation: string | null;
  reputationValue: number | null;
  cooldown: string | null;
  /** Oleadas de enemigos: "Hostiles 1: 2x Medium Criminal Combat Ship, 1x Anvil Arrow". */
  hostiles: string[];
  /** Blueprints posibles, agrupados por el rango desde el que se dan. */
  blueprints: { rank: string | null; items: string[] }[];
  /** El título lleva [BP]: el contrato puede dar blueprints. */
  hasBlueprints: boolean;
}

/** "Operative Extraction <EM4>[150 Rep] [BP]*</EM4>" → "Operative Extraction". */
export function cleanTitle(s: string): string {
  return s.replace(/<EM\d>[\s\S]*?<\/EM\d>/g, '').replace(/\s+/g, ' ').trim();
}

const field = (desc: string, label: string) => {
  const m = new RegExp(`<EM\\d>${label}:?</EM\\d>:?\\s*([^<]*?)(?:\\\\n|$)`, 'i').exec(desc);
  return m?.[1]?.trim() || null;
};

/** Bloque con título "<EM4>Título</EM4>\n línea\n línea\n\n". */
function block(desc: string, label: string): string[] {
  const i = desc.search(new RegExp(`<EM\\d>${label}</EM\\d>`, 'i'));
  if (i < 0) return [];
  const rest = desc.slice(i).split('\\n').slice(1);
  const out: string[] = [];
  for (const line of rest) {
    if (!line.trim()) {
      if (out.length) break;
      continue;
    }
    out.push(line.trim());
  }
  return out;
}

export function parseContractsIni(text: string): CommunityContract[] {
  const groups = new Map<string, { title?: string; desc?: string }>();
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).replace(/,P$/, '');
    const value = line.slice(eq + 1);
    const kind = /_title(?=_|$)/i.test(key) ? 'title' : /_desc(?=_|$)/i.test(key) ? 'desc' : null;
    if (!kind) continue;
    const g = key.replace(/_(title|desc)(?=_|$)/i, '_§').toLowerCase();
    const entry = groups.get(g) ?? {};
    entry[kind] = value;
    groups.set(g, entry);
  }
  const out: CommunityContract[] = [];
  for (const { title, desc } of groups.values()) {
    if (!desc) continue;
    const debug = field(desc, 'Debug Name\\(s\\)');
    if (!debug) continue;
    const rep = field(desc, 'Reputation Awarded') ?? (title ? /\[([\d,.\s–-]+) Rep\]/.exec(title)?.[1]?.trim() ?? null : null);
    const bpLines = block(desc, 'Potential Blueprints');
    const blueprints: CommunityContract['blueprints'] = [];
    for (const l of bpLines) {
      const rank = /^<EM\d>(.*?)<\/EM\d>$/.exec(l);
      if (rank) blueprints.push({ rank: rank[1]!.replace(/^Awarded from\s*/i, '').trim(), items: [] });
      else if (l.startsWith('-')) {
        if (!blueprints.length) blueprints.push({ rank: null, items: [] });
        blueprints.at(-1)!.items.push(l.replace(/^-\s*/, ''));
      }
    }
    out.push({
      debugNames: debug.split(/\s*,\s*/).filter(Boolean),
      title: cleanTitle(title ?? ''),
      reputation: rep,
      reputationValue: rep ? Number(/\d[\d,.]*/.exec(rep)?.[0]?.replace(/[,.]/g, '')) || null : null,
      cooldown: field(desc, 'Cooldown'),
      hostiles: block(desc, 'Ships to Expect').filter((l) => /^Hostiles|^Wave|:/i.test(l)),
      blueprints: blueprints.filter((b) => b.items.length),
      hasBlueprints: /\[BP\]/.test(title ?? ''),
    });
  }
  return out;
}

export class CommunityContracts {
  private dir: string;
  private channel: Channel;
  private entries: CommunityContract[] = [];
  private byDebug = new Map<string, CommunityContract>();
  private byTitle = new Map<string, CommunityContract>();
  private fetchedAt: string | null = null;
  private refreshing: Promise<void> | null = null;
  lastError: string | null = null;

  constructor(dataDir: string, gameDir: string) {
    this.dir = join(dataDir, 'game', 'community');
    mkdirSync(this.dir, { recursive: true });
    this.channel = /[\\/]PTU[\\/]?$|[\\/]EPTU[\\/]?$|[\\/]TECH-PREVIEW/i.test(gameDir) ? 'PTU' : 'LIVE';
    const file = this.file;
    if (existsSync(file)) {
      try {
        const meta = JSON.parse(readFileSync(`${file}.json`, 'utf8')) as { fetchedAt: string };
        this.load(readFileSync(file, 'utf8'), meta.fetchedAt);
      } catch {
        /* se vuelve a descargar */
      }
    }
  }

  private get file() {
    return join(this.dir, `starstrings-contracts-${this.channel}.ini`);
  }

  get info() {
    return { source: 'StarStrings', channel: this.channel, fetchedAt: this.fetchedAt, count: this.entries.length, error: this.lastError };
  }

  private load(text: string, fetchedAt: string) {
    this.entries = parseContractsIni(text);
    this.byDebug = new Map();
    this.byTitle = new Map();
    for (const e of this.entries) {
      for (const d of e.debugNames) this.byDebug.set(d.toLowerCase(), e);
      if (e.title && !this.byTitle.has(e.title.toLowerCase())) this.byTitle.set(e.title.toLowerCase(), e);
    }
    this.fetchedAt = fetchedAt;
  }

  /** Busca por el contrato del registro y, si no, por el título (limpio de marcas). */
  lookup(contract: string | null, title: string | null): CommunityContract | null {
    if (!this.fetchedAt || Date.now() - Date.parse(this.fetchedAt) > MAX_AGE_MS) void this.refresh();
    if (contract) {
      const hit = this.byDebug.get(contract.toLowerCase());
      if (hit) return hit;
    }
    return title ? (this.byTitle.get(cleanTitle(title).toLowerCase()) ?? null) : null;
  }

  refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      const res = await fetch(URL[this.channel], {
        headers: { 'user-agent': 'CommandGlass (herramienta de fans de Star Citizen)' },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const at = new Date().toISOString();
      this.load(text, at);
      if (!this.entries.length) throw new Error('el fichero no trae contratos');
      writeFileSync(this.file, text);
      writeFileSync(`${this.file}.json`, JSON.stringify({ fetchedAt: at }));
      this.lastError = null;
      console.log(`[comunidad] StarStrings ${this.channel}: ${this.entries.length} contratos`);
    })()
      .catch((err: Error) => {
        this.lastError = err.message;
        // Sin red: se reintenta en la siguiente consulta pasada una hora, sin machacar la copia que hubiera.
        this.fetchedAt ??= new Date(Date.now() - MAX_AGE_MS + 3600_000).toISOString();
        console.warn(`[comunidad] StarStrings: ${err.message}`);
      })
      .finally(() => (this.refreshing = null));
    return this.refreshing;
  }
}
