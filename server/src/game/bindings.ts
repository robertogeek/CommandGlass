import { tx } from '../i18n.ts';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCryXml, parseTextXml, type XmlNode } from './cryxml.ts';
import { keyLabel, parseCombo } from './keys.ts';
import { extractFromP4k } from './p4k.ts';

/**
 * Catálogo de controles: las teclas por defecto del juego (Data.p4k → Libs/Config/defaultProfile.xml)
 * con tus cambios encima (user/client/0/Profiles/default/actionmaps.xml) y los textos oficiales en español.
 *
 * Los ficheros del juego solo se leen. Lo extraído se copia en data/game/ y se vuelve a extraer
 * cuando cambia Data.p4k (cada parche), comparando tamaño y fecha.
 */

const CACHE_VERSION = 3;
const PROFILE = 'Data/Libs/Config/defaultProfile.xml';
const LANG_ES = 'Data/Localization/spanish_(spain)/global.ini';
const LANG_EN = 'Data/Localization/english/global.ini';

export interface SendPlan {
  /** Cuánto mantener pulsada la tecla en un toque (ms). */
  holdMs: number;
  /** Pulsaciones seguidas (2 = doble toque). */
  taps: number;
  /** La acción responde a mantener pulsado: el botón puede funcionar como "mientras lo tocas". */
  momentary: boolean;
}

export interface BoundAction {
  id: string;
  map: string;
  name: string;
  label: string;
  description: string | null;
  keys: string[] | null;
  keyLabels: string[];
  /** Se puede enviar desde la botonera (solo teclado; ratón y ejes no). */
  sendable: boolean;
  mode: string;
  plan: SendPlan;
  /** La has cambiado tú en el juego. */
  custom: boolean;
}

export interface BindingMap {
  name: string;
  label: string;
  category: string;
  actions: BoundAction[];
}

export interface Catalog {
  maps: BindingMap[];
  extractedAt: string;
  userProfile: string | null;
  userProfileChangedAt: string | null;
}

interface DefaultAction {
  name: string;
  labelKey: string;
  descKey: string;
  keyboard: string;
  mode: string;
}

interface DefaultMap {
  name: string;
  labelKey: string;
  categoryKey: string;
  actions: DefaultAction[];
}

interface ModeInfo {
  pressThreshold: number;
  releaseThreshold: number;
  multiTap: number;
  onHold: boolean;
  onRelease: boolean;
  retriggerable: boolean;
}

interface Cache {
  version: number;
  p4kSize: number;
  p4kMtimeMs: number;
  extractedAt: string;
  maps: DefaultMap[];
  modes: Record<string, ModeInfo>;
  labelsEn: Record<string, string>;
  labelsEs: Record<string, string>;
}

/** Idioma de los nombres del juego: el que usas en Star Citizen. */
export type GameLang = 'en' | 'es';

export class BindingsService {
  private gameDir: string;
  private cacheDir: string;
  private cache: Cache | null = null;
  private catalogs = new Map<GameLang, Catalog>();
  private userMtime = -1;

  constructor(gameDir: string, dataDir: string) {
    this.gameDir = gameDir;
    this.cacheDir = join(dataDir, 'game');
  }

  get p4kPath() {
    return join(this.gameDir, 'Data.p4k');
  }

  get userProfilePath() {
    return join(this.gameDir, 'user', 'client', '0', 'Profiles', 'default', 'actionmaps.xml');
  }

  /** Catálogo actual. Reextrae si el juego se ha actualizado y relee tu perfil si lo has cambiado. */
  get(lang: GameLang = 'en'): Catalog {
    const defaults = this.loadDefaults();
    const userStat = existsSync(this.userProfilePath) ? statSync(this.userProfilePath) : null;
    const userMtime = userStat?.mtimeMs ?? 0;
    if (defaults !== this.cache || userMtime !== this.userMtime) {
      this.cache = defaults;
      this.userMtime = userMtime;
      this.catalogs.clear();
    }
    let catalog = this.catalogs.get(lang);
    if (!catalog) {
      const overrides = userStat ? readUserOverrides(readFileSync(this.userProfilePath, 'utf8')) : new Map<string, UserOverride>();
      // En español, lo que la traducción oficial no cubre sale en inglés, como en el propio juego.
      const labels = lang === 'es' ? { ...defaults.labelsEn, ...defaults.labelsEs } : defaults.labelsEn;
      catalog = buildCatalog(defaults, labels, overrides, userStat ? this.userProfilePath : null, userStat ? new Date(userMtime).toISOString() : null, lang);
      this.catalogs.set(lang, catalog);
    }
    return catalog;
  }

  /** Busca una acción concreta por "mapa.acción" (las teclas no dependen del idioma). */
  find(id: string): BoundAction | null {
    for (const m of this.get('en').maps) for (const a of m.actions) if (a.id === id) return a;
    return null;
  }

  private loadDefaults(): Cache {
    if (!existsSync(this.p4kPath)) throw new Error(tx(`No encuentro Data.p4k en ${this.gameDir}`, `Data.p4k not found in ${this.gameDir}`));
    const st = statSync(this.p4kPath);
    if (this.cache && this.cache.p4kSize === st.size && this.cache.p4kMtimeMs === st.mtimeMs) return this.cache;

    const metaFile = join(this.cacheDir, 'bindings.json');
    if (existsSync(metaFile)) {
      try {
        const c = JSON.parse(readFileSync(metaFile, 'utf8')) as Cache;
        if (c.version === CACHE_VERSION && c.p4kSize === st.size && c.p4kMtimeMs === st.mtimeMs) return c;
      } catch {
        /* caché dañada: se regenera */
      }
    }

    const t0 = Date.now();
    const files = extractFromP4k(this.p4kPath, [PROFILE, LANG_ES, LANG_EN]);
    const profileBuf = files.get(PROFILE);
    if (!profileBuf) throw new Error(tx('No encuentro defaultProfile.xml dentro de Data.p4k', 'defaultProfile.xml not found inside Data.p4k'));
    mkdirSync(this.cacheDir, { recursive: true });
    // Copia de lo extraído, por si quieres revisarlo (formato binario CryXmlB).
    writeFileSync(join(this.cacheDir, 'defaultProfile.cryxml'), profileBuf);

    const root = parseCryXml(profileBuf);
    const { maps, modes } = readDefaultProfile(root);
    const used = new Set<string>();
    for (const m of maps) {
      used.add(m.labelKey);
      used.add(m.categoryKey);
      for (const a of m.actions) used.add(a.labelKey), used.add(a.descKey);
    }
    const cache: Cache = {
      version: CACHE_VERSION,
      p4kSize: st.size,
      p4kMtimeMs: st.mtimeMs,
      extractedAt: new Date().toISOString(),
      maps,
      modes,
      labelsEn: pickLabels(files.get(LANG_EN), used),
      labelsEs: pickLabels(files.get(LANG_ES), used),
    };
    writeFileSync(metaFile, JSON.stringify(cache));
    console.log(`[controles] ${maps.reduce((n, m) => n + m.actions.length, 0)} acciones extraídas de Data.p4k en ${Date.now() - t0} ms`);
    return cache;
  }
}

// ---------------------------------------------------------------- perfil por defecto

function readDefaultProfile(root: XmlNode): { maps: DefaultMap[]; modes: Record<string, ModeInfo> } {
  const modes: Record<string, ModeInfo> = {};
  for (const m of root.children.find((c) => c.tag === 'ActivationModes')?.children ?? []) {
    const a = m.attrs;
    if (!a.name) continue;
    modes[a.name] = {
      pressThreshold: Number(a.pressTriggerThreshold ?? -1),
      releaseThreshold: Number(a.releaseTriggerThreshold ?? -1),
      multiTap: Number(a.multiTap ?? 1),
      onHold: a.onHold === '1',
      onRelease: a.onRelease === '1',
      retriggerable: a.retriggerable === '1',
    };
  }
  const maps: DefaultMap[] = root.children
    .filter((c) => c.tag === 'actionmap' && c.attrs.name)
    .map((m) => ({
      name: m.attrs.name!,
      labelKey: stripAt(m.attrs.UILabel),
      categoryKey: stripAt(m.attrs.UICategory),
      actions: m.children
        .filter((a) => a.tag === 'action' && a.attrs.name)
        .map((a) => {
          const kbChild = a.children.find((c) => c.tag === 'keyboard');
          const keyboard = a.attrs.keyboard ?? kbChild?.attrs.input ?? kbChild?.children.find((c) => c.attrs.input)?.attrs.input ?? '';
          return {
            name: a.attrs.name!,
            labelKey: stripAt(a.attrs.UILabel),
            descKey: stripAt(a.attrs.UIDescription),
            keyboard,
            mode: kbChild?.attrs.activationMode ?? a.attrs.activationMode ?? '',
          };
        }),
    }));
  return { maps, modes };
}

const stripAt = (s: string | undefined) => (s ?? '').replace(/^@/, '');

function pickLabels(buf: Buffer | undefined, used: Set<string>): Record<string, string> {
  const out: Record<string, string> = {};
  if (!buf) return out;
  const text = buf.toString('utf8').replace(/^﻿/, '');
  for (const line of text.split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).replace(/,P$/, '');
    // Algunos textos traen saltos de línea escritos como "\n" para el menú del juego.
    if (used.has(key)) out[key] = line.slice(eq + 1).replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim();
  }
  return out;
}

// ---------------------------------------------------------------- perfil del usuario

export interface UserOverride {
  keyboard: string;
  mode?: string;
  multiTap?: number;
}

/** Solo los cambios de teclado (kb1_…); los de joystick o ratón no afectan a la botonera. */
export function readUserOverrides(xml: string): Map<string, UserOverride> {
  const out = new Map<string, UserOverride>();
  const root = parseTextXml(xml);
  const walk = (n: XmlNode, map: string | null) => {
    if (n.tag === 'actionmap') map = n.attrs.name ?? null;
    if (n.tag === 'action' && map && n.attrs.name) {
      for (const r of n.children) {
        const input = r.attrs.input;
        if (r.tag !== 'rebind' || !input || !/^kb\d*_/.test(input)) continue;
        out.set(`${map}.${n.attrs.name}`, {
          keyboard: input.replace(/^kb\d*_/, ''),
          mode: r.attrs.activationMode,
          multiTap: r.attrs.multiTap ? Number(r.attrs.multiTap) : undefined,
        });
      }
    }
    for (const c of n.children) walk(c, map);
  };
  walk(root, null);
  return out;
}

// ---------------------------------------------------------------- catálogo final

export function planFor(mode: string, info: ModeInfo | undefined, multiTap?: number): SendPlan {
  const taps = multiTap ?? info?.multiTap ?? 1;
  const press = info && info.pressThreshold > 0 ? Math.round(info.pressThreshold * 1000) + 150 : 0;
  const holdMs = press || 50;
  const momentary = !mode || !info ? true : info.onHold || (info.onRelease && info.releaseThreshold < 0) || info.retriggerable;
  return { holdMs, taps: Math.max(1, Math.min(taps, 3)), momentary };
}

function buildCatalog(
  c: Cache,
  labels: Record<string, string>,
  overrides: Map<string, UserOverride>,
  userProfile: string | null,
  userProfileChangedAt: string | null,
  lang: GameLang = 'en',
): Catalog {
  const label = (key: string, fallback: string) => (key && labels[key]) || fallback;
  const maps: BindingMap[] = c.maps.map((m) => ({
    name: m.name,
    label: label(m.labelKey, m.name),
    category: label(m.categoryKey, ''),
    actions: m.actions.map((a) => {
      const id = `${m.name}.${a.name}`;
      const o = overrides.get(id);
      const raw = o ? o.keyboard : a.keyboard;
      const mode = o?.mode ?? a.mode;
      const combo = parseCombo(raw);
      return {
        id,
        map: m.name,
        name: a.name,
        label: label(a.labelKey, a.name),
        description: (a.descKey && labels[a.descKey]) || null,
        keys: combo?.keys ?? null,
        keyLabels: combo?.keys.map((k) => keyLabel(k, lang)) ?? [],
        sendable: Boolean(combo?.sendable),
        mode,
        plan: planFor(mode, c.modes[mode], o?.multiTap),
        custom: Boolean(o),
      };
    }),
  }));
  return { maps, extractedAt: c.extractedAt, userProfile, userProfileChangedAt };
}
