import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extractFromP4k } from './p4k.ts';

/**
 * Nombres oficiales del juego en inglés y en español (global.ini dentro de Data.p4k): sitios, naves y objetos.
 * Solo lectura del juego; la copia filtrada va a data/game/names.json y se renueva cuando cambia Data.p4k.
 */

const EN = 'Data/Localization/english/global.ini';
const ES = 'Data/Localization/spanish_(spain)/global.ini';
const CACHE_VERSION = 2;

/** Solo lo que hace falta: sitios del universo, naves y objetos. Sin descripciones. */
const KEEP = /^(Stanton|Pyro|Nyx|Castra|Magnus|Terra|Delamar|RR_|item_Name|vehicle_Name|mission_items_QTQuantumBeacon$|Marker_Classification_PartyMember$)/i;

interface Cache {
  version: number;
  p4kSize: number;
  p4kMtimeMs: number;
  en: Record<string, string>;
  es: Record<string, string>;
}

export interface Names {
  en: Map<string, string>;
  es: Map<string, string>;
}

function pick(buf: Buffer | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!buf) return out;
  for (const line of buf.toString('utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).replace(/,P$/, '');
    if (!KEEP.test(key) || /_desc(ription)?$/i.test(key)) continue;
    out[key.toLowerCase()] = line.slice(eq + 1).trim();
  }
  return out;
}

export function loadGameNames(gameDir: string, dataDir: string): Names {
  const p4k = join(gameDir, 'Data.p4k');
  const file = join(dataDir, 'game', 'names.json');
  if (!existsSync(p4k)) throw new Error('No encuentro Data.p4k');
  const st = statSync(p4k);
  if (existsSync(file)) {
    try {
      const c = JSON.parse(readFileSync(file, 'utf8')) as Cache;
      if (c.version === CACHE_VERSION && c.p4kSize === st.size && c.p4kMtimeMs === st.mtimeMs) {
        return { en: new Map(Object.entries(c.en)), es: new Map(Object.entries(c.es)) };
      }
    } catch {
      /* se regenera */
    }
  }
  const files = extractFromP4k(p4k, [EN, ES]);
  const cache: Cache = { version: CACHE_VERSION, p4kSize: st.size, p4kMtimeMs: st.mtimeMs, en: pick(files.get(EN)), es: pick(files.get(ES)) };
  mkdirSync(join(dataDir, 'game'), { recursive: true });
  writeFileSync(file, JSON.stringify(cache));
  return { en: new Map(Object.entries(cache.en)), es: new Map(Object.entries(cache.es)) };
}
