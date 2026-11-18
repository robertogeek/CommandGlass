import type { EventDraft, LogLine, Mention, ParserContext } from './types.ts';
import { actorName, isEntityName, itemName, locationInfo, qtTargetName, shardInfo, shipName, stripEntityId } from './names.ts';

/**
 * Reglas de interpretación del Game.log.
 * Cada regla recibe una línea con su etiqueta (<Tag>) y devuelve 0..n eventos.
 * Los formatos cambian entre parches: cuando CIG cambie uno, se añade aquí una
 * variante nueva en lugar de modificar la antigua, para que el historial siga leyéndose.
 */

export interface RuleApi {
  ctx: ParserContext;
  isMe(name?: string | null, geid?: string | null): boolean;
  /** true la primera vez que se ve `key` dentro de la ventana de tiempo. */
  once(key: string, windowMs: number, ts: string): boolean;
  /** Recuerda un valor y devuelve true si ha cambiado respecto al anterior. */
  changed(key: string, value: string): boolean;
}

export type Rule = (line: LogLine, api: RuleApi) => EventDraft | EventDraft[] | null;

const REASONS: Record<string, string> = {
  Combat: 'combate',
  Collision: 'colisión',
  SelfDestruct: 'autodestrucción',
  Crash: 'accidente',
  Hazard: 'peligro ambiental',
  BoundaryViolation: 'límite del mapa',
};

function playerMention(name: string | undefined, geid: string | undefined, role: string, api: RuleApi): Mention[] {
  if (!name || isEntityName(name) || api.isMe(name, geid)) return [];
  return [{ name, geid: geid && geid !== '0' ? geid : undefined, role }];
}

// ---------------------------------------------------------------- identidad y sesión

const login: Rule = (l, api) => {
  const m = /geid (\d+) - accountId (\d+) - name (\S+) - state (\w+)/.exec(l.body);
  if (!m) return null;
  api.ctx.playerGeid = m[1]!;
  api.ctx.playerName = m[3]!;
  return {
    type: 'session.login',
    category: 'system',
    importance: 1,
    summary: `Sesión iniciada como ${m[3]}`,
    data: { geid: m[1], accountId: m[2], name: m[3] },
  };
};

const joinPu: Rule = (l) => {
  const m = /address\[([^\]]+)\] port\[(\d+)\] shard\[([^\]]+)\]/.exec(l.body);
  if (!m) return null;
  const info = shardInfo(m[3]!);
  return {
    type: 'session.shard',
    category: 'system',
    importance: 1,
    summary: `Entras en el universo · shard ${info.label}`,
    data: { address: m[1], port: Number(m[2]), shard: m[3], region: info.region, label: info.label },
  };
};

const systemQuit: Rule = (l) => {
  const m = /reason=([^,]+)/.exec(l.body);
  return {
    type: 'session.quit',
    category: 'system',
    importance: 1,
    summary: 'Cierras el juego',
    data: { reason: m?.[1] ?? null },
  };
};

const channelDisconnected: Rule = (l) => {
  if (!l.body.includes('hostType="GameClient"')) return null;
  const m = /cause=(\d+) reason="([^"]*)"/.exec(l.body);
  return {
    type: 'session.disconnect',
    category: 'system',
    importance: 0,
    summary: `Desconexión del servidor (${m?.[2] ?? '?'})`,
    data: { cause: m?.[1] ?? null, reason: m?.[2] ?? null },
  };
};

// ---------------------------------------------------------------- viajes

const location: Rule = (l, api) => {
  const m = /Player\[([^\]]+)\] requested inventory for Location\[([^\]]+)\]/.exec(l.body);
  if (!m) return null;
  const code = m[2]!;
  if (!api.changed('location', code)) return null;
  const info = locationInfo(code);
  return {
    type: 'travel.location',
    category: 'travel',
    importance: 1,
    summary: `Llegas a ${info.name}${info.system ? ` (${info.system})` : ''}`,
    data: { code, ...info },
  };
};

const qtTarget: Rule = (l, api) => {
  const m = /\| ([A-Za-z0-9_-]+?)\[(\d+)\]\|CSCItemNavigation::OnPlayerSelectedQuantumTarget\|Player has selected point (\S+) as their destination/.exec(l.body);
  if (!m) return null;
  const target = m[3]!;
  if (!api.changed('qtTarget', target)) return null;
  return {
    type: 'travel.qt_target',
    category: 'travel',
    importance: 0,
    summary: `Fijas destino cuántico: ${qtTargetName(target)}`,
    data: { target, targetName: qtTargetName(target), ship: stripEntityId(m[1]!), shipName: shipName(m[1]!) },
  };
};

const qtArrived: Rule = (l) => {
  const m = /\| ([A-Za-z0-9_-]+?)\[(\d+)\]\|CSCItemNavigation::OnQuantumDriveArrived/.exec(l.body);
  if (!m) return null;
  return {
    type: 'travel.qt_arrived',
    category: 'travel',
    importance: 1,
    summary: `Salto cuántico completado con ${shipName(m[1]!)}`,
    data: { ship: stripEntityId(m[1]!), shipName: shipName(m[1]!), vehicleId: m[2] },
  };
};

const clearDriver: Rule = (l, api) => {
  const m = /Local client node \[(\d+)\] releasing control token for '([^']+)' \[(\d+)\]/.exec(l.body);
  if (!m || !api.isMe(null, m[1])) return null;
  return {
    type: 'ship.controls_released',
    category: 'travel',
    importance: 0,
    summary: `Dejas los mandos de ${shipName(m[2]!)}`,
    data: { ship: stripEntityId(m[2]!), shipName: shipName(m[2]!), vehicleId: m[3] },
  };
};

// ---------------------------------------------------------------- combate

function vehicleDestroyedEvent(
  api: RuleApi,
  d: {
    vehicle: string;
    vehicleId: string;
    cls: string;
    ownerGeid: string | null;
    driver: string | null;
    driverGeid: string | null;
    reason: string;
    fromLevel: number;
    toLevel: number;
    killer: string;
    killerGeid: string;
    zone?: string | null;
    format: '2025' | '2026';
  },
): EventDraft {
  const ship = shipName(d.cls);
  const reasonEs = REASONS[d.reason] ?? d.reason;
  const mine = api.isMe(null, d.ownerGeid) || api.isMe(d.driver, d.driverGeid);
  const byMe = api.isMe(d.killer, d.killerGeid);
  const destroyed = d.toLevel >= 2;
  const state = destroyed ? 'destruida' : 'inutilizada';
  const killerName = actorName(d.killer);

  let summary: string;
  let importance: 0 | 1 | 2 = 1;
  if (mine && byMe) {
    summary = `Tu ${ship} ${state} · ${reasonEs}`;
    importance = 2;
  } else if (mine) {
    summary = `Tu ${ship} ${state} por ${killerName} · ${reasonEs}`;
    importance = 2;
  } else if (byMe) {
    summary = `Has ${destroyed ? 'destruido' : 'inutilizado'} ${ship}`;
    importance = 2;
  } else {
    summary = `${ship} ${state} por ${killerName} · ${reasonEs}`;
  }

  return {
    type: 'combat.vehicle_destroyed',
    category: 'combat',
    importance,
    summary,
    data: { ...d, ship, killerName, reasonEs, mine, byMe, destroyed },
    mentions: [
      ...playerMention(d.killer, d.killerGeid, mine ? 'nemesis' : 'killer', api),
      ...playerMention(d.driver ?? undefined, d.driverGeid ?? undefined, byMe ? 'victim' : 'pilot', api),
    ],
  };
}

/** Formato 2026: <Vehicle Destroyed> */
const vehicleDestroyed: Rule = (l, api) => {
  const m = /Vehicle '([^']+)' \[(\d+)\] class '([^']+)' \(owner player \[(\d+)\], driver \[(\d+)\]\) destroyed: reason \[([^\]]+)\] level \[(\d+)\] -> \[(\d+)\].*?killer '([^']*)' \[(\d+)\]/.exec(l.body);
  if (!m) return null;
  return vehicleDestroyedEvent(api, {
    vehicle: m[1]!,
    vehicleId: m[2]!,
    cls: m[3]!,
    ownerGeid: m[4] === '0' ? null : m[4]!,
    driver: null,
    driverGeid: m[5] === '0' ? null : m[5]!,
    reason: m[6]!,
    fromLevel: Number(m[7]),
    toLevel: Number(m[8]),
    killer: m[9]!,
    killerGeid: m[10]!,
    format: '2026',
  });
};

/** Formato 2025: <Vehicle Destruction> */
const vehicleDestruction: Rule = (l, api) => {
  const m = /Vehicle '([^']+)' \[(\d+)\] in zone '([^']*)'.*?driven by '([^']*)' \[(\d+)\] advanced from destroy level (\d+) to (\d+) caused by '([^']*)' \[(\d+)\] with '([^']*)'/.exec(l.body);
  if (!m) return null;
  return vehicleDestroyedEvent(api, {
    vehicle: m[1]!,
    vehicleId: m[2]!,
    cls: stripEntityId(m[1]!),
    ownerGeid: null,
    driver: m[4] === 'unknown' ? null : m[4]!,
    driverGeid: m[5] === '0' ? null : m[5]!,
    reason: m[10]!,
    fromLevel: Number(m[6]),
    toLevel: Number(m[7]),
    killer: m[8]!,
    killerGeid: m[9]!,
    zone: m[3]!,
    format: '2025',
  });
};

/** Formato 2025 (eliminado por CIG en noviembre de 2025): <Actor Death> */
const actorDeath: Rule = (l, api) => {
  const m = /CActor::Kill: '([^']+)' \[(\d+)\] in zone '([^']*)' killed by '([^']+)' \[(\d+)\] using '([^']*)' \[[^\]]*\] with damage type '([^']+)'/.exec(l.body);
  if (!m) return null;
  const [, victim, victimGeid, zone, killer, killerGeid, weapon, damageType] = m as unknown as string[];
  const victimIsMe = api.isMe(victim, victimGeid);
  const killerIsMe = api.isMe(killer, killerGeid);
  const weaponName = weapon && weapon !== 'unknown' ? (itemName(weapon) ?? shipName(weapon)) : null;
  const victimNpc = isEntityName(victim!);

  let summary: string;
  let importance: 0 | 1 | 2 = 1;
  if (victimIsMe && killerIsMe) {
    summary = `Has muerto (${damageType})`;
    importance = 2;
  } else if (victimIsMe) {
    summary = `Te ha matado ${actorName(killer!)}${weaponName ? ` con ${weaponName}` : ''}`;
    importance = 2;
  } else if (killerIsMe) {
    summary = `Has abatido a ${actorName(victim!)}${weaponName ? ` con ${weaponName}` : ''}`;
    importance = 2;
  } else {
    summary = `${actorName(victim!)} abatido por ${actorName(killer!)}`;
  }

  return {
    type: 'combat.actor_death',
    category: 'combat',
    importance,
    summary,
    data: {
      victim, victimGeid, zone, killer, killerGeid, weapon, weaponName, damageType,
      victimIsMe, killerIsMe, victimNpc,
    },
    mentions: [
      ...playerMention(killer, killerGeid, victimIsMe ? 'nemesis' : 'killer', api),
      ...playerMention(victim, victimGeid, killerIsMe ? 'victim' : 'killed', api),
    ],
  };
};

/** Al morir, el juego registra los objetos a recuperar del cadáver: una ráfaga de líneas. */
const corpse: Rule = (l, api) => {
  if (!api.once('corpse', 60_000, l.ts)) return null;
  return {
    type: 'health.death',
    category: 'health',
    importance: 2,
    summary: 'Has muerto',
    data: {},
  };
};

const medBed: Rule = (l, api) => {
  const m = /Actor: (\S+) .*?med bed name: ([^,]+), vehicle name: ([^,]+), head: (\w+) torso: (\w+) leftArm: (\w+) rightArm: (\w+) leftLeg: (\w+) rightLeg: (\w+)/.exec(l.body);
  if (!m || !api.isMe(m[1])) return null;
  const parts: string[] = [];
  const labels = ['cabeza', 'torso', 'brazo izq.', 'brazo der.', 'pierna izq.', 'pierna der.'];
  for (let i = 0; i < 6; i++) if (m[4 + i] === 'true') parts.push(labels[i]!);
  return {
    type: 'health.medbed',
    category: 'health',
    importance: 1,
    summary: `Curado en cama médica${parts.length ? ` (${parts.join(', ')})` : ''}`,
    data: { bed: m[2], vehicle: m[3] === 'none' ? null : m[3], healed: parts },
  };
};

// ---------------------------------------------------------------- misiones

const endMission: Rule = (l) => {
  const m = /MissionId\[([^\]]+)\] Player\[([^\]]+)\] PlayerId\[(\d+)\] CompletionType\[([^\]]+)\] Reason\[([^\]]+)\]/.exec(l.body);
  if (!m) return null;
  return {
    type: 'mission.ended',
    category: 'mission',
    importance: 0,
    summary: `Misión terminada: ${m[4]}`,
    data: { missionId: m[1], completion: m[4], reason: m[5] },
  };
};

const missionMarker: Rule = (l, api) => {
  const m = /missionId \[([^\]]+)\], generator name \[([^\]]*)\], contract \[([^\]]*)\]/.exec(l.body);
  if (!m || !api.once(`marker:${m[1]}`, 24 * 3600_000, l.ts)) return null;
  return {
    type: 'mission.info',
    category: 'mission',
    importance: 0,
    summary: `Contrato ${m[3]}`,
    data: { missionId: m[1], generator: m[2], contract: m[3] },
  };
};

// ---------------------------------------------------------------- economía y social

const shopBuy: Rule = (l) => {
  const m = /shopName\[([^\]]+)\].*?client_price\[([\d.]+)\].*?itemName\[([^\]]+)\] quantity\[(\d+)\]/.exec(l.body);
  if (!m) return null;
  const price = Math.round(Number(m[2]));
  const qty = Number(m[4]);
  const item = itemName(m[3]!) ?? m[3]!;
  return {
    type: 'economy.buy',
    category: 'economy',
    importance: 1,
    summary: `Compras ${item}${qty > 1 ? ` ×${qty}` : ''} · ${price.toLocaleString('es-ES')} aUEC`,
    data: { shop: m[1], price, item: m[3], quantity: qty },
  };
};

const carriage: Rule = (l, api) => {
  const m = /Player (\S+)\[(\d+)\] (entered|left) this carriage/.exec(l.body);
  if (!m || m[3] !== 'entered' || api.isMe(m[1], m[2])) return null;
  return {
    type: 'social.nearby',
    category: 'social',
    importance: 0,
    summary: `${m[1]} sube a tu vagón`,
    data: { name: m[1], geid: m[2], where: 'tren' },
    mentions: playerMention(m[1], m[2], 'nearby', api),
  };
};

// ---------------------------------------------------------------- equipo personal y flota

/** Puertos del cuerpo que interesan: armadura, mochila, armas a la espalda y en la cadera, medpens, granadas. */
const GEAR_PORT = /^(Armor_(Helmet|Torso|Arms|Legs|Undersuit|Backpack)|Backpack|wep_[a-z_]*\d*|medPen_attach_\d+|grenade_attach_\d+)$/i;

const gearEvent = (port: string, cls: string, api: RuleApi, ts: string): EventDraft | null => {
  if (!GEAR_PORT.test(port) || !api.once(`gear:${port}:${cls}`, 5_000, ts)) return null;
  return {
    type: 'gear.equipped',
    category: 'system',
    importance: 0,
    summary: `Equipo: ${prettyItem(cls)}`,
    data: { port, cls },
  };
};

/** Nombre oficial del objeto en el juego; si no lo tiene, su código tal cual (sin inventar nombre). */
export function prettyItem(cls: string): string {
  return itemName(cls) ?? cls;
}

const attachmentReceived: Rule = (l, api) => {
  const m = /Player\[([^\]]+)\] Attachment\[[^,]+, ([^,]+), \d+\] Status\[[^\]]*\] Port\[([^\]]+)\]/.exec(l.body);
  if (!m || !api.isMe(m[1])) return null;
  return gearEvent(m[3]!, m[2]!, api, l.ts);
};

const equipItem: Rule = (l, api) => {
  const m = /Class\[([^\]]+)\].*?Port\[([^\]]+)\]/.exec(l.body);
  if (!m) return null;
  const port = m[2]!.split(':').pop()!;
  return gearEvent(port, m[1]!, api, l.ts);
};

const storeItem: Rule = (l, api) => {
  const m = /by '([^']+)' \[(\d+)\].*?Class\[([^\]]+)\]/.exec(l.body);
  if (!m || !api.isMe(m[1], m[2])) return null;
  return { type: 'gear.stored', category: 'system', importance: 0, summary: `Guardas ${prettyItem(m[3]!)}`, data: { cls: m[3] } };
};

const vehicleList: Rule = (l, api) => {
  const m = /Retrieved (\d+) entitlements out of (\d+) vehic/.exec(l.body);
  if (!m || !api.changed('fleet', `${m[1]}/${m[2]}`)) return null;
  return {
    type: 'ship.fleet',
    category: 'travel',
    importance: 0,
    summary: `Tu hangar tiene ${m[2]} vehículos`,
    data: { total: Number(m[2]), entitlements: Number(m[1]) },
  };
};

const partyAccept: Rule = () => ({
  type: 'social.party_invite_accepted',
  category: 'social',
  importance: 0,
  summary: 'Aceptas una invitación de grupo',
  data: {},
});

// ---------------------------------------------------------------- notificaciones del HUD

/** Clasifica el texto de una notificación del HUD. */
export function classifyNotification(
  text: string,
  missionId: string | null,
  api: RuleApi,
): EventDraft {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const title = (lines[0] ?? '').replace(/:\s*$/, '').trim();
  const detail = lines.slice(1).join(' ').replace(/:\s*$/, '').trim();
  const mission = missionId && !/^0{8}-/.test(missionId) ? missionId : null;
  let m: RegExpExecArray | null;

  const ev = (
    type: string,
    category: EventDraft['category'],
    importance: EventDraft['importance'],
    summary: string,
    data: Record<string, unknown> = {},
    mentions?: Mention[],
  ): EventDraft => ({ type, category, importance, summary, data: { text: title, detail: detail || undefined, missionId: mission, ...data }, mentions });

  // Zonas
  if ((m = /^Entered (.+) Jurisdiction$/.exec(title))) {
    const name = m[1]!;
    const lawless = name === 'Ungoverned';
    return ev('zone.jurisdiction', 'travel', 1, lawless ? 'Entras en espacio sin ley' : `Jurisdicción: ${name}`, { name, lawless });
  }
  if (/^Entered Monitored Space$/.test(title)) return ev('zone.monitored', 'travel', 0, 'Entras en espacio vigilado', { on: true });
  if (/^Exited Monitored Space$/.test(title)) return ev('zone.monitored', 'travel', 0, 'Sales del espacio vigilado', { on: false });
  if (/^Entering Armistice Zone/.test(title)) return ev('zone.armistice', 'travel', 0, 'Entras en zona de armisticio', { on: true });
  if (/^Leaving Armistice Zone/.test(title)) return ev('zone.armistice', 'travel', 0, 'Sales de la zona de armisticio', { on: false });
  if (/^Entering Private Property/.test(title)) return ev('zone.private', 'travel', 0, 'Entras en propiedad privada', { on: true });
  if (/^Leaving Private Property/.test(title)) return ev('zone.private', 'travel', 0, 'Sales de propiedad privada', { on: false });
  if (/^Entering Restricted Area/.test(title)) return ev('zone.restricted', 'travel', 1, 'Entras en zona restringida', { on: true });
  if (/^Leaving Restricted Area/.test(title)) return ev('zone.restricted', 'travel', 0, 'Sales de zona restringida', { on: false });

  // Contratos y objetivos
  if ((m = /^Contract Accepted:\s*(.+)$/.exec(title))) return ev('mission.accepted', 'mission', 1, `Contrato aceptado: ${m[1]}`, { title: m[1] });
  if ((m = /^Contract Complete:\s*(.+)$/.exec(title))) return ev('mission.completed', 'mission', 2, `Contrato completado: ${m[1]}`, { title: m[1] });
  if ((m = /^Contract Failed:\s*(.+)$/.exec(title))) return ev('mission.failed', 'mission', 2, `Contrato fallido: ${m[1]}`, { title: m[1] });
  if ((m = /^Contract Abandoned:\s*(.+)$/.exec(title))) return ev('mission.abandoned', 'mission', 1, `Contrato abandonado: ${m[1]}`, { title: m[1] });
  if ((m = /^Contract (Shared|Available):\s*(.+)$/.exec(title))) return ev('mission.offered', 'mission', 0, `Contrato ${m[1] === 'Shared' ? 'compartido' : 'disponible'}: ${m[2]}`, { title: m[2] });
  if ((m = /^New Objective:\s*(.+)$/.exec(title))) return ev('mission.objective', 'mission', 1, `Nuevo objetivo: ${m[1]}`, { objective: m[1] });
  if ((m = /^Objective Complete:\s*(.+)$/.exec(title))) return ev('mission.objective_done', 'mission', 1, `Objetivo cumplido: ${m[1]}`, { objective: m[1] });
  if ((m = /^Objective (Withdrawn|Failed):\s*(.+)$/.exec(title))) return ev('mission.objective_failed', 'mission', m[1] === 'Failed' ? 1 : 0, `Objetivo ${m[1] === 'Failed' ? 'fallido' : 'retirado'}: ${m[2]}`, { objective: m[2] });
  if ((m = /^Journal Entry Added:\s*(.+)$/.exec(title))) return ev('mission.journal', 'mission', 0, `Entrada en el diario: ${m[1]}`, { title: m[1] });

  // Economía
  if ((m = /^Awarded ([\d.,]+) aUEC/.exec(title))) {
    const amount = Number(m[1]!.replace(/[.,]/g, ''));
    return ev('economy.reward', 'economy', 2, `Recompensa: ${amount.toLocaleString('es-ES')} aUEC`, { amount });
  }
  if ((m = /^You've Earned: (\d+) Rewards?/.exec(title))) return ev('economy.reward_items', 'economy', 1, `Has ganado ${m[1]} recompensas`, { count: Number(m[1]) });
  if (/^Transaction Complete/.test(title)) return ev('economy.transaction', 'economy', 0, 'Transacción completada');

  // Naves (canales de comunicación de la nave)
  if ((m = /^You have joined channel '(.+) : (.+)'\.?$/.exec(title))) {
    const [ship, owner] = [m[1]!, m[2]!];
    const own = api.isMe(owner);
    return ev('ship.boarded', 'travel', 1, own ? `Subes a tu ${ship}` : `Subes a la ${ship} de ${owner}`, { ship, owner, own }, playerMention(owner, undefined, 'host', api));
  }
  if ((m = /^You have left the channel '(.+) : (.+)'\.?$/.exec(title))) {
    return ev('ship.left', 'travel', 0, `Bajas de ${m[1]}`, { ship: m[1], owner: m[2] });
  }
  if (/^New Member Joined$/.test(title) && (m = /^(\S+) has joined the channel '(.+) : (.+)'/.exec(detail))) {
    return ev('social.crew_joined', 'social', 1, `${m[1]} sube a ${api.isMe(m[3]) ? 'tu' : 'la'} ${m[2]}`, { name: m[1], ship: m[2], owner: m[3] }, playerMention(m[1], undefined, 'crew', api));
  }
  if (/^Member Left$/.test(title) && (m = /^(\S+) has left the channel '(.+) : (.+)'/.exec(detail))) {
    return ev('social.crew_left', 'social', 0, `${m[1]} baja de ${m[2]}`, { name: m[1], ship: m[2], owner: m[3] });
  }

  // Grupo
  if (/^You have joined$/.test(title) && /^party/.test(detail)) return ev('social.party_joined', 'social', 1, 'Te unes a un grupo');
  if (/^Party Disbanded$/.test(title)) return ev('social.party_disbanded', 'social', 1, 'El grupo se ha disuelto');
  if (/^New Party Leader$/.test(title)) return ev('social.party_leader', 'social', 0, `Nuevo líder de grupo${detail ? `: ${detail}` : ''}`);
  if (/^Party Launch$/.test(title)) return ev('social.party_launch', 'social', 0, 'Lanzamiento de grupo');
  if ((m = /^Quantum Travel Calibration (Started|Complete) By (.+)$/.exec(title))) {
    const who = m[2]!;
    return ev('social.party_qt', 'social', 0, `${api.isMe(who) ? 'Calibras' : `${who} calibra`} el salto cuántico del grupo`, { name: who, phase: m[1] }, playerMention(who, undefined, 'party', api));
  }

  if (/^You have created$/.test(title) && /^party/.test(detail)) return ev('social.party_created', 'social', 1, 'Creas un grupo');
  if (/^Party$/.test(title) && (m = /^(\S+) (connected|disconnected)\.?$/.exec(detail))) {
    const on = m[2] === 'connected';
    return ev('social.party_presence', 'social', 0, `${m[1]} se ha ${on ? 'conectado' : 'desconectado'}`, { name: m[1], online: on }, playerMention(m[1], undefined, 'party', api));
  }
  if (/^New Member Joined$/.test(title) && (m = /^(\S+) has joined the party/.exec(detail))) {
    return ev('social.party_member_joined', 'social', 1, `${m[1]} se une al grupo`, { name: m[1] }, playerMention(m[1], undefined, 'party', api));
  }
  if (/^Member Left$/.test(title) && (m = /^(\S+) has left the party/.exec(detail))) {
    return ev('social.party_member_left', 'social', 0, `${m[1]} deja el grupo`, { name: m[1] });
  }
  if (/^Party Invite Received/.test(detail)) {
    return ev('social.party_invite', 'social', 1, `${title} te invita a su grupo`, { name: title }, playerMention(title, undefined, 'party', api));
  }
  if (/^Friend Added$/.test(title) && detail) {
    return ev('social.friend_added', 'social', 1, `Nuevo amigo: ${detail}`, { name: detail }, playerMention(detail, undefined, 'friend', api));
  }
  if ((m = /^(\S+) has started to QT to your current location/.exec(title))) {
    return ev('social.party_qt_to_you', 'social', 0, `${m[1]} viene hacia ti en salto cuántico`, { name: m[1] }, playerMention(m[1], undefined, 'party', api));
  }

  // Salud
  if ((m = /^(Minor|Moderate|Severe) Injury Detected - (.+?) - Tier (\d) Treatment Required/.exec(title))) {
    const sev: Record<string, string> = { Minor: 'leve', Moderate: 'moderada', Severe: 'grave' };
    return ev('health.injury', 'health', m[1] === 'Severe' ? 2 : 1, `Herida ${sev[m[1]!]}: ${m[2]} (requiere tratamiento nivel ${m[3]})`, { severity: m[1], part: m[2], tier: Number(m[3]) });
  }
  if (/^Standby, Local Emergency Services Are En Route/.test(title)) return ev('health.downed', 'health', 2, 'Incapacitado: los servicios de emergencia están en camino');

  // Ley
  if ((m = /^Crime Committed: (.+)$/.exec(title))) {
    return ev('law.crime', 'combat', 2, `Delito cometido: ${m[1]}${detail ? ` (${detail.replace(/^against /, 'contra ')})` : ''}`, { crime: m[1], against: detail.replace(/^against /, '') || null });
  }
  if (/^Restricted Area$/.test(title) && /relocated/.test(detail)) return ev('zone.relocated', 'travel', 1, 'Te han sacado de una zona restringida');

  // Economía (otros)
  if ((m = /^(?:(\d+)|A) Refinery Work Orders? ha(?:s|ve) been Completed at (.+)$/.exec(title))) {
    return ev('economy.refinery', 'economy', 1, `Refinería lista en ${m[2]}${m[1] ? ` (${m[1]} órdenes)` : ''}`, { orders: Number(m[1] ?? 1), station: m[2] });
  }

  // Hangar
  if (/^Hangar Request Completed/.test(title)) return ev('ship.hangar_ready', 'travel', 1, 'Hangar asignado');
  if (/^Joined hangar queue/.test(title)) return ev('ship.hangar_queue', 'travel', 0, 'En cola para un hangar');

  return ev('notification', 'system', 0, detail ? `${title}: ${detail}` : title);
}

// ---------------------------------------------------------------- tabla de reglas

export const RULES: Record<string, Rule> = {
  'AccountLoginCharacterStatus_Character': login,
  'Join PU': joinPu,
  'SystemQuit': systemQuit,
  'Channel Disconnected': channelDisconnected,
  'RequestLocationInventory': location,
  'Player Selected Quantum Target - Local': qtTarget,
  'Quantum Drive Arrived - Arrived at Final Destination': qtArrived,
  'Vehicle Control Flow': clearDriver,
  'Vehicle Destroyed': vehicleDestroyed,
  'Vehicle Destruction': vehicleDestruction,
  'Actor Death': actorDeath,
  'Adding non kept item [CSCActorCorpseUtils::PopulateItemPortForItemRecoveryEntitlement]': corpse,
  'MED BED HEAL': medBed,
  'EndMission': endMission,
  'CLocalMissionPhaseMarker::CreateMarker': missionMarker,
  'CEntityComponentShopUIProvider::SendShopBuyRequest': shopBuy,
  'Player entered carriage': carriage,
  'Accept invitation': partyAccept,
  'AttachmentReceived': attachmentReceived,
  'EquipItem': equipItem,
  'StoreItem': storeItem,
  'VehicleListQuery': vehicleList,
};
