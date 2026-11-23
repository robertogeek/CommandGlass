import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HUD_KEY, type HudStrings } from '../parser/hudlang.ts';
import { extractFromP4k } from './p4k.ts';

/**
 * Idioma con el que el jugador ve el juego y sus textos de avisos.
 * Solo lectura: user.cfg (g_language), la traducción suelta en data/Localization/<idioma>/global.ini
 * (así se instalan las de la comunidad) o, si no hay, la que trae Data.p4k.
 */

const EN = 'Data/Localization/english/global.ini';
const CACHE_VERSION = 2;

interface Cache {
  version: number;
  /** Qué claves se guardaron: si la app reconoce avisos nuevos (HUD_KEY cambia), hay que volver a leerlas. */
  keys?: string;
  sig: string;
  strings: HudStrings;
}

/** g_language de user.cfg (null si no está: el juego va en inglés). */
export function gameLanguage(gameDir: string): string | null {
  const cfg = join(gameDir, 'user.cfg');
  if (!existsSync(cfg)) return null;
  try {
    for (const line of readFileSync(cfg, 'utf8').split(/\r?\n/)) {
      const m = /^\s*g_language\s*=\s*([^\s;]+)/i.exec(line);
      if (m) return m[1]!.toLowerCase();
    }
  } catch {
    /* sin acceso: inglés */
  }
  return null;
}

/** Firma de lo que hay en disco: si cambia algo (parche, idioma, traducción nueva), se vuelve a leer. */
export function gameLanguageSignature(gameDir: string): string {
  const lang = gameLanguage(gameDir) ?? 'english';
  const stamp = (p: string) => {
    try {
      const st = statSync(p);
      return `${st.size}:${Math.round(st.mtimeMs)}`;
    } catch {
      return '-';
    }
  };
  return [lang, stamp(join(gameDir, 'Data.p4k')), stamp(join(gameDir, 'data', 'Localization', lang, 'global.ini'))].join('|');
}

function pick(buf: Buffer | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!buf) return out;
  for (const line of buf.toString('utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).replace(/^\W+/, '').replace(/,P$/i, '').trim();
    if (!HUD_KEY.test(key)) continue;
    out[key.toLowerCase()] = line.slice(eq + 1);
  }
  return out;
}

/** Textos de avisos en inglés y en el idioma del juego; null si el juego va en inglés. */
export function loadHudStrings(gameDir: string, dataDir: string): HudStrings | null {
  const lang = gameLanguage(gameDir);
  if (!lang || lang === 'english') return null;
  const p4k = join(gameDir, 'Data.p4k');
  if (!existsSync(p4k)) throw new Error('No encuentro Data.p4k');
  const sig = gameLanguageSignature(gameDir);
  const file = join(dataDir, 'game', 'hudlang.json');
  if (existsSync(file)) {
    try {
      const c = JSON.parse(readFileSync(file, 'utf8')) as Cache;
      if (c.version === CACHE_VERSION && c.keys === HUD_KEY.source && c.sig === sig) return c.strings;
    } catch {
      /* se regenera */
    }
  }
  const loose = join(gameDir, 'data', 'Localization', lang, 'global.ini');
  const inP4k = `Data/Localization/${lang}/global.ini`;
  const files = extractFromP4k(p4k, existsSync(loose) ? [EN] : [EN, inP4k]);
  const locBuf = existsSync(loose) ? readFileSync(loose) : files.get(inP4k);
  if (!locBuf) throw new Error(`No encuentro los textos del idioma ${lang}`);
  const strings: HudStrings = { lang, en: pick(files.get(EN)), loc: pick(locBuf) };
  mkdirSync(join(dataDir, 'game'), { recursive: true });
  writeFileSync(file, JSON.stringify({ version: CACHE_VERSION, keys: HUD_KEY.source, sig, strings } satisfies Cache));
  return strings;
}
