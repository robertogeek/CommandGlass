/**
 * Avisos del HUD en otro idioma → texto en inglés del juego, para que las reglas los reconozcan.
 *
 * El Game.log guarda los avisos tal y como se ven en pantalla: con una traducción (oficial o de la
 * comunidad, como la de Ozzyto) llega "Contrato aceptado: X" en vez de "Contract Accepted: X".
 * Con el global.ini del idioma activo y el inglés del juego se deshace la traducción clave a clave.
 */

/** Claves de global.ini que pueden salir como aviso del HUD (y los nombres que van dentro). */
export const HUD_KEY =
  /^(hud_|mobiGlas_ui_|notification_|ATC_GatewayQueue_|crafting_hud_|comms_local_|text_(UEC|MER)_reward|Mission_(Multi)?Reward_Notification|TheCollector_|refinery_ui_(job|multipleJobs)Complete|Jurisdictions_Name_|kiosk_TransactionComplete|Temp_CovalexShipping_Transaction)/i;

/** Textos que se sustituyen dentro de otro aviso (nombres de jurisdicción). */
const VALUE_KEY = /^Jurisdictions_Name_/i;

export interface HudStrings {
  /** Carpeta del idioma (spanish_(spain), french_(france)…). */
  lang: string;
  /** clave → texto en inglés del juego. */
  en: Record<string, string>;
  /** clave → texto en el idioma activo. */
  loc: Record<string, string>;
}

// %s, %ls, %S, %i, %u, %.0f, %1$s… y las etiquetas del juego ~mission(...), ~quantumLink(...).
const PLACEHOLDER = /%(?:(\d+)\$)?[-+ 0#]*\d*(?:\.\d+)?(?:ll|l|h)?[sSdiufgxXc]|~\w+\([^)]*\)/g;

interface Template {
  re: RegExp;
  /** Partes del texto inglés: literales y huecos (índice de la captura). */
  en: (string | number)[];
  weight: number;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
const unescapeIni = (s: string) => s.replace(/\\n/g, '\n').trim();

/** Trozos de una plantilla: literales y huecos, con el orden posicional si lo trae (%2$s). */
function parts(tpl: string): { lits: string[]; slots: (number | null)[] } {
  const lits: string[] = [];
  const slots: (number | null)[] = [];
  let last = 0;
  for (const m of tpl.matchAll(PLACEHOLDER)) {
    lits.push(tpl.slice(last, m.index));
    slots.push(m[1] ? Number(m[1]) - 1 : null);
    last = m.index! + m[0].length;
  }
  lits.push(tpl.slice(last));
  return { lits, slots };
}

function firstWord(s: string): string {
  return /^\s*([^\s%~:.,!-]+)/.exec(s)?.[1]?.toLowerCase() ?? '';
}

export class HudTranslator {
  readonly lang: string;
  /** Textos sin huecos: texto traducido → inglés. */
  private exact = new Map<string, string>();
  /** Plantillas con huecos, por la primera palabra del texto traducido ('' = empieza por un hueco). */
  private byWord = new Map<string, Template[]>();
  /** Plantillas de varias líneas (se prueban con el aviso entero). */
  private multi: Template[] = [];
  private values = new Map<string, string>();
  readonly size: number;

  constructor(strings: HudStrings) {
    this.lang = strings.lang;
    let size = 0;
    for (const [key, rawLoc] of Object.entries(strings.loc)) {
      const rawEn = strings.en[key];
      if (rawEn === undefined) continue;
      const en = unescapeIni(rawEn);
      const loc = unescapeIni(rawLoc);
      if (!loc || norm(loc) === norm(en)) continue;
      if (VALUE_KEY.test(key)) {
        this.values.set(norm(loc), en);
        continue;
      }
      const L = parts(loc);
      const E = parts(en);
      if (L.slots.length === 0) {
        if (E.slots.length > 0) continue;
        if (!this.exact.has(norm(loc))) this.exact.set(norm(loc), en);
        size++;
        continue;
      }
      if (L.slots.length !== E.slots.length) continue;
      const literal = L.lits.join('').replace(/\s+/g, '');
      if (literal.length < 3) continue; // "%s" a secas lo traduciría todo
      // Captura i del texto traducido = hueco número i (o el que diga %n$).
      const order = L.slots.map((s, i) => s ?? i);
      const capOf = new Map(order.map((slot, i) => [slot, i]));
      const re = new RegExp(`^${L.lits.map(escape).join('(.+?)')}$`, 'isu');
      const enParts: (string | number)[] = [];
      E.lits.forEach((lit, i) => {
        if (lit) enParts.push(lit);
        if (i < E.slots.length) enParts.push(capOf.get(E.slots[i] ?? i) ?? i);
      });
      const tpl: Template = { re, en: enParts, weight: literal.length };
      if (loc.includes('\n')) this.multi.push(tpl);
      else {
        const w = firstWord(loc);
        const list = this.byWord.get(w) ?? [];
        list.push(tpl);
        this.byWord.set(w, list);
      }
      size++;
    }
    // Las plantillas más concretas primero.
    for (const list of [this.multi, ...this.byWord.values()]) list.sort((a, b) => b.weight - a.weight);
    this.size = size;
  }

  private fill(tpl: Template, m: RegExpExecArray): string {
    return tpl.en.map((p) => (typeof p === 'number' ? this.value(m[p + 1] ?? '') : p)).join('');
  }

  private value(v: string): string {
    return this.values.get(norm(v)) ?? v;
  }

  private line(s: string): string | null {
    const ex = this.exact.get(norm(s));
    if (ex !== undefined) return ex;
    for (const w of [firstWord(s), '']) {
      for (const tpl of this.byWord.get(w) ?? []) {
        const m = tpl.re.exec(s.trim());
        if (m) return this.fill(tpl, m);
      }
    }
    // Avisos compuestos ("Lesiones graves detectadas - Torso - Tratamiento de nivel 1 requerido").
    if (s.includes(' - ')) {
      const segs = s.split(' - ');
      const out = segs.map((seg) => this.exact.get(norm(seg)) ?? seg);
      if (out.some((seg, i) => seg !== segs[i])) return out.join(' - ');
    }
    return null;
  }

  /** El aviso en inglés del juego, o null si no hay nada que traducir. */
  toEnglish(text: string): string | null {
    const whole = this.exact.get(norm(text));
    if (whole !== undefined) return whole;
    for (const tpl of this.multi) {
      const m = tpl.re.exec(text.trim());
      if (m) return this.fill(tpl, m);
    }
    const lines = text.split('\n');
    let changed = false;
    const out = lines.map((l) => {
      const t = l.trim() ? this.line(l) : null;
      if (t === null) return l;
      changed = true;
      return t;
    });
    return changed ? out.join('\n') : null;
  }
}

let current: HudTranslator | null = null;

/** Traductor del idioma activo del juego (null = el juego va en inglés). */
export function setHudTranslator(t: HudTranslator | null): void {
  current = t;
}

export function hudTranslator(): HudTranslator | null {
  return current;
}
