import type { Store } from './db.ts';

/**
 * Contratos reconstruidos a partir de los eventos: cada misión se sigue por su missionId desde que se acepta
 * (o se conoce su tipo) hasta que termina, con sus objetivos en orden.
 */

export type Outcome = 'completed' | 'failed' | 'abandoned' | 'open';

export type Kind = 'caza' | 'mercenario' | 'fps' | 'transporte' | 'recuperacion' | 'recoleccion' | 'infiltracion' | 'evento' | 'otros';

export const KIND_LABEL: Record<Kind, string> = {
  caza: 'Cazarrecompensas',
  mercenario: 'Mercenario',
  fps: 'Combate a pie',
  transporte: 'Transporte',
  recuperacion: 'Recuperación',
  recoleccion: 'Recolección y minería',
  infiltracion: 'Infiltración',
  evento: 'Eventos',
  otros: 'Otros',
};

export interface Objective {
  text: string;
  at: string;
  state: 'active' | 'done' | 'failed' | 'withdrawn';
}

export interface Mission {
  id: string;
  title: string | null;
  contract: string | null;
  generator: string | null;
  kind: Kind;
  sessionId: number;
  acceptedAt: string | null;
  endedAt: string | null;
  outcome: Outcome;
  objectives: Objective[];
}

export interface KindStats {
  kind: Kind;
  label: string;
  total: number;
  completed: number;
  failed: number;
  abandoned: number;
  /** Minutos de mediana entre aceptar y completar. */
  medianMinutes: number | null;
}

const KIND_RULES: [Kind, RegExp][] = [
  ['recuperacion', /Recover|Salvage/i],
  ['fps', /KillFPS|FPSKill|KillNPC|_FPS\b|FPS_|Eliminate All Hostiles/i],
  ['caza', /Bounty|EliminateSpecific|Kill ?Ship|Neutrali[sz]e|Terrorist|Gang Leader|Wanted|Apprehension/i],
  ['mercenario', /DefendShip|Escort|Protect|Patrol|WaveAttack|StationAssault|BoardShip|Retake|Defend|Security|Distress|Under Attack|In Trouble|Swarm|Vanduul|Regrouping|_SWA_/i],
  ['transporte', /Haul|Cargo|Cryopod|MoldSample|System-To-System|Deliver|Supply Run|Courier|Package/i],
  ['recoleccion', /ResourceGathering|Mining|Harvest|Purchase Order|Mined|Research Resource|Manufacturing Resource|Fabrication/i],
  ['infiltracion', /FacilityDelve|Delve|Investigat|Dossier|Hyperion|Lab Sample|Extraction|Data/i],
  ['evento', /Finale|SOO2|Iasi|Collector|Gauntlet|Call to Arms|Story|Welcome to/i],
];

export function missionKind(contract: string | null, generator: string | null, title: string | null): Kind {
  const s = `${contract ?? ''} ${generator ?? ''} ${title ?? ''}`;
  for (const [kind, re] of KIND_RULES) if (re.test(s)) return kind;
  return 'otros';
}

const TYPES = [
  'mission.info', 'mission.accepted', 'mission.objective', 'mission.objective_done', 'mission.objective_failed',
  'mission.completed', 'mission.failed', 'mission.abandoned', 'mission.ended',
];

interface Row {
  session_id: number;
  ts: string;
  type: string;
  data: string;
}

/** Recorre los eventos de misión en orden y arma cada contrato. Pura: se prueba sin base de datos. */
export function foldMissions(rows: Row[]): Mission[] {
  const byId = new Map<string, Mission>();
  const get = (id: string, r: Row) => {
    let m = byId.get(id);
    if (!m) {
      m = { id, title: null, contract: null, generator: null, kind: 'otros', sessionId: r.session_id, acceptedAt: null, endedAt: null, outcome: 'open', objectives: [] };
      byId.set(id, m);
    }
    return m;
  };
  for (const r of rows) {
    const d = JSON.parse(r.data) as Record<string, string | null | undefined>;
    const id = d.missionId;
    if (!id) continue;
    const m = get(id, r);
    switch (r.type) {
      case 'mission.info':
        m.contract ??= d.contract ?? null;
        m.generator ??= d.generator ?? null;
        break;
      case 'mission.accepted':
        m.title = d.title ?? m.title;
        m.acceptedAt ??= r.ts;
        m.sessionId = r.session_id;
        break;
      case 'mission.objective': {
        const text = d.objective ?? '';
        const prev = m.objectives.find((o) => o.text === text && o.state === 'active');
        if (!prev && text) m.objectives.push({ text, at: r.ts, state: 'active' });
        break;
      }
      case 'mission.objective_done':
      case 'mission.objective_failed': {
        const text = d.objective ?? '';
        const state: Objective['state'] = r.type === 'mission.objective_done' ? 'done' : /Withdrawn|retirado/i.test(String(d.text ?? '')) ? 'withdrawn' : 'failed';
        const o = [...m.objectives].reverse().find((x) => x.text === text);
        if (o) o.state = state;
        else if (text) m.objectives.push({ text, at: r.ts, state });
        break;
      }
      case 'mission.completed':
        m.title = d.title ?? m.title;
        m.outcome = 'completed';
        m.endedAt = r.ts;
        break;
      case 'mission.failed':
        m.title = d.title ?? m.title;
        m.outcome = 'failed';
        m.endedAt = r.ts;
        break;
      case 'mission.abandoned':
        m.title = d.title ?? m.title;
        m.outcome = 'abandoned';
        m.endedAt = r.ts;
        break;
      case 'mission.ended': {
        m.endedAt ??= r.ts;
        if (m.outcome === 'open') {
          const c = String(d.completion ?? '');
          m.outcome = c === 'Complete' ? 'completed' : c === 'Fail' ? 'failed' : c === 'Abandon' || c === 'Deactivate' ? 'abandoned' : 'open';
        }
        break;
      }
    }
  }
  const out: Mission[] = [];
  for (const m of byId.values()) {
    // Solo los contratos que llegaste a aceptar (los marcadores sueltos de otras misiones no cuentan).
    if (!m.acceptedAt) continue;
    m.kind = missionKind(m.contract, m.generator, m.title);
    // Al terminar, lo que siguiera "en curso" ya no lo está.
    if (m.outcome !== 'open') for (const o of m.objectives) if (o.state === 'active') o.state = m.outcome === 'completed' ? 'done' : 'failed';
    out.push(m);
  }
  return out.sort((a, b) => (b.acceptedAt ?? '').localeCompare(a.acceptedAt ?? ''));
}

export function loadMissions(store: Store): Mission[] {
  const rows = store.db
    .prepare(`SELECT session_id, ts, type, data FROM events WHERE type IN (${TYPES.map(() => '?').join(',')}) ORDER BY id`)
    .all(...TYPES) as unknown as Row[];
  return foldMissions(rows);
}

export function kindStats(missions: Mission[]): KindStats[] {
  const groups = new Map<Kind, Mission[]>();
  for (const m of missions) groups.set(m.kind, [...(groups.get(m.kind) ?? []), m]);
  return [...groups.entries()]
    .map(([kind, list]) => {
      const mins = list
        .filter((m) => m.outcome === 'completed' && m.acceptedAt && m.endedAt)
        .map((m) => (Date.parse(m.endedAt!) - Date.parse(m.acceptedAt!)) / 60_000)
        .filter((n) => n > 0 && n < 600)
        .sort((a, b) => a - b);
      return {
        kind,
        label: KIND_LABEL[kind],
        total: list.length,
        completed: list.filter((m) => m.outcome === 'completed').length,
        failed: list.filter((m) => m.outcome === 'failed').length,
        abandoned: list.filter((m) => m.outcome === 'abandoned').length,
        medianMinutes: mins.length ? Math.round(mins[Math.floor(mins.length / 2)]!) : null,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface FactionStats {
  faction: string;
  completed: number;
  total: number;
  /** Reputación estimada: suma de lo que da cada contrato completado según la wiki (valores del parche actual). */
  reputation: number;
}

export function factionStats(
  missions: Mission[],
  intelOf: (m: Mission) => { faction: string | null; reputation: { faction: string; amount: number }[] } | null,
): FactionStats[] {
  const map = new Map<string, FactionStats>();
  const row = (f: string) => {
    let s = map.get(f);
    if (!s) map.set(f, (s = { faction: f, completed: 0, total: 0, reputation: 0 }));
    return s;
  };
  for (const m of missions) {
    const intel = intelOf(m);
    if (!intel?.faction) continue;
    const s = row(intel.faction);
    s.total++;
    if (m.outcome !== 'completed') continue;
    s.completed++;
    for (const r of intel.reputation) row(r.faction).reputation += r.amount;
  }
  return [...map.values()].filter((s) => s.total > 0 || s.reputation > 0).sort((a, b) => b.reputation - a.reputation || b.completed - a.completed);
}

// ---------------------------------------------------------------- briefing

export interface Briefing {
  kind: Kind;
  label: string;
  /** Pasos típicos de este tipo de contrato. */
  outline: string[];
  /** Qué llevar. */
  gear: string[];
  /** Consejos rápidos. */
  tips: string[];
  /** Pasos reales de la última vez que hiciste este mismo contrato (si lo completaste). */
  previous: { at: string; title: string | null; steps: string[] } | null;
  /** Cómo te ha ido otras veces con este contrato. */
  record: { total: number; completed: number; failed: number; abandoned: number };
}

const PLAYBOOK: Record<Kind, { outline: string[]; gear: string[]; tips: string[] }> = {
  caza: {
    outline: ['Fija la baliza de recompensa y salta en cuántico', 'Localiza al objetivo (escáner y marcador)', 'Neutralízalo', 'El pago llega al confirmar la baja'],
    gear: ['Nave de combate con escudos al máximo', 'Señuelos y ruido', 'Misiles si el objetivo es de rango alto'],
    tips: ['En dificultad alta suele venir escolta: empieza por la escolta o aléjalo de ella.', 'Reparte energía a escudos al entrar y a armas cuando lo tengas fijado.', 'Si el objetivo huye en cuántico, la baliza se actualiza: vuelve a fijarla.'],
  },
  mercenario: {
    outline: ['Ve al punto indicado', 'Protege o patrulla hasta que acaben las oleadas', 'Mantén con vida al objetivo protegido', 'Vuelve o espera la confirmación'],
    gear: ['Nave de combate o con torretas tripuladas', 'Señuelos y ruido', 'Kit de reparación si vas a abordar'],
    tips: ['Las oleadas llegan por tandas: no gastes todos los misiles en la primera.', 'Si hay que proteger una nave, no la uses de escudo: se cuenta como fallo si cae.', 'En abordajes, limpia la nave por cubiertas y cuidado con el fuego amigo.'],
  },
  fps: {
    outline: ['Viaja hasta la instalación', 'Entra y limpia la zona', 'Neutraliza a los objetivos marcados', 'Sal y confirma'],
    gear: ['Armadura media o pesada', 'Fusil y arma secundaria con cargadores de sobra', 'Medpens y granadas', 'Casco con visor para interiores oscuros'],
    tips: ['Cura las heridas antes de entrar: una herida de nivel 2-3 limita el combate.', 'Revisa esquinas y ascensores: los NPC suelen esperar ahí.', 'Lleva la linterna a mano (en Mandos tienes el botón).'],
  },
  transporte: {
    outline: ['Recoge la carga en el punto de origen', 'Cárgala en la nave (rayo tractor o ascensor de carga)', 'Viaja al destino', 'Entrega toda la carga para cobrar'],
    gear: ['Nave con bodega suficiente (mira el SCU del contrato)', 'Multiherramienta con rayo tractor'],
    tips: ['Pide zona de carga al llegar (también en Mandos).', 'Asegura la carga antes de saltar: las cajas sueltas se caen.', 'En contratos entre sistemas, revisa el combustible cuántico antes del salto.'],
  },
  recuperacion: {
    outline: ['Ve al lugar del pecio o del robo', 'Encuentra la carga o los datos', 'Recupéralos (a mano, tractor o hackeo)', 'Llévalos al punto de entrega'],
    gear: ['Multiherramienta con rayo tractor', 'Arma por si hay defensores', 'Medpens'],
    tips: ['Los pecios suelen tener NPC de guardia: entra armado.', 'Mira el inventario de la nave al recoger: algunos objetos no se ven a simple vista.'],
  },
  recoleccion: {
    outline: ['Ve a la zona de recolección', 'Extrae o recoge el material pedido', 'Llévalo al punto de entrega', 'Entrega la cantidad completa'],
    gear: ['Nave minera o multiherramienta de minería', 'Mochila con espacio', 'Módulos de minería si es mineral'],
    tips: ['Comprueba la cantidad exacta que piden antes de salir.', 'En minería, vigila el medidor de inestabilidad y usa los módulos (en Mandos).'],
  },
  infiltracion: {
    outline: ['Llega a la instalación', 'Avanza por las zonas hasta los terminales u objetos', 'Consigue lo que pide el contrato', 'Sal y entrega'],
    gear: ['Armadura media', 'Arma silenciosa o de corto alcance', 'Medpens', 'Linterna y casco con visor'],
    tips: ['Estas instalaciones tienen varias alas: apunta qué te falta en el diario.', 'Algunas puertas necesitan tarjetas que sueltan los NPC: registra los cuerpos.'],
  },
  evento: {
    outline: ['Sigue los objetivos del evento por fases', 'Coordina con tu grupo si es multijugador'],
    gear: ['Depende de la fase: lleva equipo de combate y nave preparada'],
    tips: ['Los eventos cambian con cada parche: los pasos de la última vez son la mejor guía.'],
  },
  otros: {
    outline: ['Sigue los objetivos según aparezcan'],
    gear: ['Equipo estándar: armadura, arma, medpens'],
    tips: ['Los pasos de la última vez, si los hay, te dan una idea de lo que viene.'],
  },
};

export function briefingFor(m: Mission, all: Mission[]): Briefing {
  const same = all.filter((x) => x.id !== m.id && x.contract && x.contract === m.contract);
  const prev = same.find((x) => x.outcome === 'completed' && x.objectives.length > 1) ?? null;
  const p = PLAYBOOK[m.kind];
  return {
    kind: m.kind,
    label: KIND_LABEL[m.kind],
    outline: p.outline,
    gear: p.gear,
    tips: p.tips,
    previous: prev
      ? { at: prev.acceptedAt ?? prev.endedAt ?? '', title: prev.title, steps: [...new Set(prev.objectives.filter((o) => o.state !== 'withdrawn').map((o) => o.text))] }
      : null,
    record: {
      total: same.length,
      completed: same.filter((x) => x.outcome === 'completed').length,
      failed: same.filter((x) => x.outcome === 'failed').length,
      abandoned: same.filter((x) => x.outcome === 'abandoned').length,
    },
  };
}
