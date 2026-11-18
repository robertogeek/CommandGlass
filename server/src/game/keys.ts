/**
 * Nombres de tecla de Star Citizen → scan codes (set 1).
 * Se envían por scan code, no por carácter: así da igual la distribución del teclado (español, US…),
 * igual que hace el propio juego al leer el teclado.
 */

export interface ScanKey {
  code: number;
  extended: boolean;
}

const BASE: Record<string, number> = {
  escape: 0x01, '1': 0x02, '2': 0x03, '3': 0x04, '4': 0x05, '5': 0x06, '6': 0x07, '7': 0x08, '8': 0x09, '9': 0x0a, '0': 0x0b,
  minus: 0x0c, equals: 0x0d, backspace: 0x0e, tab: 0x0f,
  q: 0x10, w: 0x11, e: 0x12, r: 0x13, t: 0x14, y: 0x15, u: 0x16, i: 0x17, o: 0x18, p: 0x19,
  lbracket: 0x1a, rbracket: 0x1b, enter: 0x1c, lctrl: 0x1d,
  a: 0x1e, s: 0x1f, d: 0x20, f: 0x21, g: 0x22, h: 0x23, j: 0x24, k: 0x25, l: 0x26,
  semicolon: 0x27, apostrophe: 0x28, grave: 0x29, lshift: 0x2a, backslash: 0x2b,
  z: 0x2c, x: 0x2d, c: 0x2e, v: 0x2f, b: 0x30, n: 0x31, m: 0x32, comma: 0x33, period: 0x34, slash: 0x35,
  rshift: 0x36, np_multiply: 0x37, lalt: 0x38, space: 0x39, capslock: 0x3a,
  f1: 0x3b, f2: 0x3c, f3: 0x3d, f4: 0x3e, f5: 0x3f, f6: 0x40, f7: 0x41, f8: 0x42, f9: 0x43, f10: 0x44,
  numlock: 0x45, scrolllock: 0x46,
  np_7: 0x47, np_8: 0x48, np_9: 0x49, np_subtract: 0x4a, np_4: 0x4b, np_5: 0x4c, np_6: 0x4d, np_add: 0x4e,
  np_1: 0x4f, np_2: 0x50, np_3: 0x51, np_0: 0x52, np_period: 0x53, f11: 0x57, f12: 0x58,
};

// Teclas con prefijo E0.
const EXTENDED: Record<string, number> = {
  np_enter: 0x1c, rctrl: 0x1d, np_divide: 0x35, ralt: 0x38,
  home: 0x47, up: 0x48, pgup: 0x49, left: 0x4b, right: 0x4d, end: 0x4f, down: 0x50, pgdn: 0x51, insert: 0x52, delete: 0x53,
};

const ALIASES: Record<string, string> = { ']': 'rbracket', '[': 'lbracket', ',': 'comma', '.': 'period', '/': 'slash', '-': 'minus', '=': 'equals' };

const MODIFIERS = new Set(['lalt', 'ralt', 'lctrl', 'rctrl', 'lshift', 'rshift']);

export function scanKey(name: string): ScanKey | null {
  const k = ALIASES[name] ?? name.toLowerCase();
  if (k in EXTENDED) return { code: EXTENDED[k]!, extended: true };
  if (k in BASE) return { code: BASE[k]!, extended: false };
  return null;
}

/** Nombre legible para la chuleta: "lalt+n" → ["Alt izq.", "N"]. */
export function keyLabel(name: string): string {
  const k = ALIASES[name] ?? name.toLowerCase();
  const LABELS: Record<string, string> = {
    lalt: 'Alt izq.', ralt: 'Alt der.', lctrl: 'Ctrl izq.', rctrl: 'Ctrl der.', lshift: 'Mayús izq.', rshift: 'Mayús der.',
    space: 'Espacio', enter: 'Intro', escape: 'Esc', backspace: 'Retroceso', tab: 'Tab', capslock: 'Bloq Mayús',
    up: '↑', down: '↓', left: '←', right: '→', pgup: 'RePág', pgdn: 'AvPág', home: 'Inicio', end: 'Fin', insert: 'Insert', delete: 'Supr',
    lbracket: '[', rbracket: ']', comma: ',', period: '.', slash: '/', backslash: '\\', minus: '-', equals: '=', semicolon: ';', apostrophe: "'", grave: 'º',
    np_add: 'Num +', np_subtract: 'Num -', np_multiply: 'Num *', np_divide: 'Num /', np_period: 'Num .', np_enter: 'Num Intro',
    mouse1: 'Clic izq.', mouse2: 'Clic der.', mouse3: 'Clic central', mwheel_up: 'Rueda ↑', mwheel_down: 'Rueda ↓', maxis_z: 'Rueda',
  };
  if (LABELS[k]) return LABELS[k]!;
  if (/^np_\d$/.test(k)) return `Num ${k.slice(3)}`;
  return k.toUpperCase();
}

export interface ParsedCombo {
  /** Teclas en el orden en que se pulsan: modificadores primero. */
  keys: string[];
  /** Si alguna parte no es de teclado (ratón, ejes, VR), la botonera no puede enviarla. */
  sendable: boolean;
}

/** "lalt+n" | "f6+lalt" | " " → teclas ordenadas (modificadores primero). */
export function parseCombo(raw: string | undefined | null): ParsedCombo | null {
  const parts = (raw ?? '').trim().split('+').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const keys = [...parts.filter((k) => MODIFIERS.has(k.toLowerCase())), ...parts.filter((k) => !MODIFIERS.has(k.toLowerCase()))].map(
    (k) => ALIASES[k] ?? k.toLowerCase(),
  );
  return { keys, sendable: keys.every((k) => scanKey(k) !== null) };
}
