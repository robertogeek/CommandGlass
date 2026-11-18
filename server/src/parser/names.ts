/**
 * Convierte los identificadores internos del juego en nombres legibles.
 * Es una primera aproximación: más adelante se cruzará con la API de star-citizen.wiki.
 */

const MANUFACTURERS: Record<string, string> = {
  AEGS: 'Aegis',
  ANVL: 'Anvil',
  AOPOA: 'Aopoa',
  XIAN: 'Aopoa',
  ARGO: 'Argo',
  BANU: 'Banu',
  CNOU: 'C.O.',
  CRUS: 'Crusader',
  DRAK: 'Drake',
  ESPR: 'Esperia',
  GAMA: 'Gatac',
  GLSN: 'Gallenson',
  GRIN: 'Greycat',
  KRIG: 'Kruger',
  MISC: 'MISC',
  MRAI: 'Mirai',
  ORIG: 'Origin',
  RSI: 'RSI',
  TMBL: 'Tumbril',
  VNCL: 'Vanduul',
};

const AI_SUFFIXES: [RegExp, string][] = [
  [/_PU_AI_CRIM$/i, ' (IA criminal)'],
  [/_PU_AI_NT$/i, ' (IA Nine Tails)'],
  [/_PU_AI_UEE$/i, ' (IA UEE)'],
  [/_PU_AI_SEC$/i, ' (IA seguridad)'],
  [/_PU_AI_CIV$/i, ' (IA civil)'],
  [/_PU_AI_[A-Z0-9_]+$/i, ' (IA)'],
  [/_AI_[A-Z0-9_]+$/i, ' (IA)'],
];

/** Quita el sufijo numérico de entidad: "RSI_Skylark_939541665607" -> "RSI_Skylark". */
export function stripEntityId(name: string): string {
  return name.replace(/_\d{6,}$/, '');
}

/** ¿Tiene pinta de entidad del juego (y no de jugador)? */
/** Cosas del escenario que el log trata como "asesino": peligros, límites del mapa, objetos. */
const ENVIRONMENT_RE = /^(Hazard[_-]|PlanetKillVolume|StreamingSOC_)/;

export function isEntityName(name: string): boolean {
  return /_\d{6,}$/.test(name) || /^PU_/.test(name) || ENVIRONMENT_RE.test(name) || name === 'unknown' || name === '';
}

/** "RSI_Constellation_Mk5_Centaurus" -> "RSI Constellation Mk5 Centaurus" */
export function shipName(cls: string): string {
  let base = stripEntityId(cls);
  let suffix = '';
  for (const [re, label] of AI_SUFFIXES) {
    if (re.test(base)) {
      base = base.replace(re, '');
      suffix = label;
      break;
    }
  }
  base = base.replace(/_PU$/i, '');
  const parts = base.split('_').filter(Boolean);
  const first = parts[0];
  if (first && MANUFACTURERS[first.toUpperCase()]) {
    parts[0] = MANUFACTURERS[first.toUpperCase()]!;
  }
  return parts.join(' ') + suffix;
}

/** Nombre de un actor del log: jugador tal cual, NPC/entidad humanizado. */
export function actorName(name: string): string {
  if (!name || name === 'unknown') return 'desconocido';
  if (/^PU_/.test(name)) {
    const n = stripEntityId(name)
      .replace(/^PU_/, '')
      .replace(/[-_]+/g, ' ');
    return `NPC (${n})`;
  }
  if (/^Hazard[_-]/.test(name)) return 'un peligro del entorno';
  if (/^PlanetKillVolume/.test(name)) return 'el límite del planeta';
  if (/^StreamingSOC_/.test(name)) return 'un objeto del escenario';
  if (isEntityName(name)) return shipName(name);
  return name;
}

const SYSTEMS: Record<string, string> = {
  Stanton1: 'Hurston',
  Stanton1a: 'Arial',
  Stanton1b: 'Aberdeen',
  Stanton1c: 'Magda',
  Stanton1d: 'Ita',
  Stanton2: 'Crusader',
  Stanton2a: 'Cellin',
  Stanton2b: 'Daymar',
  Stanton2c: 'Yela',
  Stanton3: 'ArcCorp',
  Stanton3a: 'Lyria',
  Stanton3b: 'Wala',
  Stanton4: 'microTech',
  Stanton4a: 'Calliope',
  Stanton4b: 'Clio',
  Stanton4c: 'Euterpe',
};

const CITIES: Record<string, string> = {
  Orison: 'Orison',
  Area18: 'Area18',
  Lorville: 'Lorville',
  NewBabbage: 'New Babbage',
  Levski: 'Levski',
};

const RR_BODIES: Record<string, string> = {
  ARC: 'ArcCorp',
  HUR: 'Hurston',
  CRU: 'Crusader',
  MIC: 'microTech',
  P3: 'Pyro III',
  P5: 'Pyro V',
};

// ---------------------------------------------------------------- nombres reales del juego

/**
 * Nombres oficiales de los sitios, sacados de la traducción del propio juego (global.ini dentro de Data.p4k).
 * Son nombres propios ("Baijini Point", "Everus Harbor"): iguales en inglés y en español.
 * Los carga el servidor al arrancar; si no están (sin juego instalado), se usan los nombres de respaldo.
 */
let GAME_NAMES: Map<string, string> | null = null;

export function setGameNames(names: Map<string, string> | null): void {
  GAME_NAMES = names;
}

const RR_STANTON: Record<string, string> = { HUR: 'Stanton1', CRU: 'Stanton2', ARC: 'Stanton3', MIC: 'Stanton4' };

/** Claves de global.ini que pueden corresponder a un código de ubicación del registro. */
export function nameKeys(code: string): string[] {
  const keys = [code];
  const rr = /^RR_([A-Z0-9]+)_([A-Z0-9]+)$/i.exec(code);
  if (rr) {
    const [, body, point] = rr as unknown as [string, string, string];
    const sys = RR_STANTON[body.toUpperCase()] ?? (/^P(\d)$/i.test(body) ? `Pyro${body.slice(1)}` : null);
    if (point.toUpperCase() === 'LEO') keys.push(`RR_${body}`);
    if (sys && point.toUpperCase() === 'LEO') keys.push(`${sys}_Transfer`, `${sys}_Transfer_Seraphim`, `${sys}_Station`);
    if (sys && /^L\d$/i.test(point)) keys.push(`${sys}_${point.toUpperCase()}`);
  }
  const jp = /^RR_JP_([A-Z][a-z]+)([A-Z][a-z]+)$/.exec(code);
  if (jp) keys.push(`${jp[1]}_${jp[2]}_JPStation`);
  if (/Delve_Facility/i.test(code)) keys.push(code.replace(/Delve_Facility/i, 'Delving_Facility'));
  const olp = /^Outpost_OLP_(\w+?\d+[a-z]?)_(\w+)$/.exec(code);
  if (olp) keys.push(`${olp[1]}_${olp[2]}`);
  return keys;
}

export function gameName(code: string): string | null {
  if (!GAME_NAMES) return null;
  for (const k of nameKeys(code)) {
    const v = GAME_NAMES.get(k.toLowerCase());
    if (v) return v;
  }
  return null;
}

/** "Nyx_Levski" -> {name:"Levski", system:"Nyx"}; "RR_ARC_LEO" -> {name:"Baijini Point", system:"Stanton"} */
export function locationInfo(code: string): { name: string; system: string | null; body: string | null } {
  const base = fallbackLocationInfo(code);
  const real = gameName(code);
  // El planeta o luna también con su nombre oficial (Pyro3 → Bloom).
  const bodyKey = BODY_KEY[base.body ?? ''] ?? null;
  const body = (bodyKey && GAME_NAMES?.get(bodyKey.toLowerCase())?.trim()) || base.body;
  return { ...base, name: real ?? base.name, body };
}

/** Nombre de respaldo de un cuerpo → su clave en global.ini. */
const BODY_KEY: Record<string, string> = {
  'Pyro I': 'Pyro1', 'Pyro II': 'Pyro2', 'Pyro III': 'Pyro3', 'Pyro IV': 'Pyro4', 'Pyro V': 'Pyro5', 'Pyro VI': 'Pyro6',
};

function fallbackLocationInfo(code: string): { name: string; system: string | null; body: string | null } {
  const parts = code.split('_');
  const head = parts[0] ?? '';

  if (head === 'RR') {
    const body = parts[1] ?? '';
    const point = parts[2] ?? '';
    // Respaldo sin traducir: en el juego la estación de A hacia B se llama "B Gateway".
    if (body === 'JP') {
      const [from, to] = point.split(/(?<=[a-z])(?=[A-Z])/);
      return { name: to ? `${to} Gateway` : point, system: from ?? null, body: null };
    }
    const bodyName = RR_BODIES[body] ?? body;
    const system = body.startsWith('P') ? 'Pyro' : 'Stanton';
    return { name: `${body} ${point}`, system, body: bodyName };
  }

  const sysMatch = /^(Stanton|Pyro|Nyx|Castra|Magnus)(\d*[a-z]?)$/.exec(head);
  if (sysMatch) {
    const system = sysMatch[1]!;
    const body = SYSTEMS[head] ?? null;
    const rest = parts.slice(1);
    const city = rest.length === 1 ? CITIES[rest[0]!] : undefined;
    const name = city ?? humanizeWords(rest.join(' '));
    return { name: name || body || system, system, body };
  }

  if (/AsteroidClusterBase_Nyx/.test(code)) {
    return { name: 'Moraine Base', system: 'Nyx', body: null };
  }
  if (/^PrisonMine_/.test(code)) {
    return { name: 'Klescher Rehabilitation Facility', system: 'Stanton', body: 'Aberdeen' };
  }
  if (/^Outpost_OLP_(Stanton\d+[a-z]?)_(\w+)/.test(code)) {
    const m = /^Outpost_OLP_(Stanton\d+[a-z]?)_(\w+)/.exec(code)!;
    return { name: humanizeWords(m[2]!), system: 'Stanton', body: SYSTEMS[m[1]!] ?? null };
  }
  return { name: humanizeWords(code.replace(/_/g, ' ')), system: null, body: null };
}

function humanizeWords(s: string): string {
  return s
    .replace(/ASD Delve Facility (\d+)/i, 'ASD Facility $1')
    // Formato con el que el juego nombra estas instalaciones (no vienen en global.ini).
    .replace(/Hurdyn ?Mining HDMS ?([A-Za-z]+)/i, 'HDMS-$1')
    .replace(/Arc ?Corp Area ?(\d+)/i, 'ArcCorp Mining Area $1')
    .replace(/Shubin SAL ?(\d+)/i, 'Shubin Mining Facility SAL-$1')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nombre del destino de un salto cuántico. */
export function qtTargetName(code: string): string {
  if (/^MISSION_QT_Bounty_Beacon/i.test(code)) return 'Baliza de recompensa';
  if (/^MISSION_QT_/i.test(code)) return 'Baliza de misión';
  if (/^PartyMemberMarker_/i.test(code)) return 'Miembro del grupo';
  if (/^NavPoint_Dynamic/i.test(code)) return 'Punto de navegación';
  if (/^ObjectContainer_RestStop/i.test(code)) return 'Estación de descanso';
  const jp = /rs_ext_(\w+)-(\w+)_jp\d/i.exec(code);
  if (jp) return `Punto de salto ${cap(jp[1]!)} → ${cap(jp[2]!)}`;
  if (/^levski/i.test(code)) return 'Levski';
  const city = /^(\w+?)_(City_objectContainer|LOC)$/i.exec(code);
  if (city) return CITIES[city[1]!] ?? city[1]!;
  const ooc = /^OOC_(Stanton_?\d[a-z]?)_?(\w*)$/i.exec(code);
  if (ooc) return humanizeWords(ooc[2]?.replace(/_/g, ' ') || ooc[1]!);
  const lp = /^LOC_RR_S(\d)_L(\d)$/i.exec(code);
  if (lp) return `Punto Lagrange L${lp[2]} (Stanton ${lp[1]})`;
  return humanizeWords(code.replace(/_/g, ' '));
}

function cap(s: string): string {
  const map: Record<string, string> = { stan: 'Stanton', cru: 'Crusader', arc: 'ArcCorp' };
  return map[s.toLowerCase()] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

/** "pub_euw1b_13165946_220" -> {region:"euw1b", label:"EU oeste · 220"} */
export function shardInfo(shard: string): { region: string | null; label: string } {
  const m = /^pub_([a-z]+\d*[a-z]?)_\d+_(\d+)$/.exec(shard);
  if (!m) return { region: null, label: shard };
  const region = m[1]!;
  const area = region.startsWith('euw') ? 'Europa oeste'
    : region.startsWith('use') ? 'EE. UU. este'
    : region.startsWith('usw') ? 'EE. UU. oeste'
    : region.startsWith('apse') ? 'Asia-Pacífico'
    : region;
  return { region, label: `${area} · ${m[2]}` };
}
