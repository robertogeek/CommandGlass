import { tx } from './i18n.ts';
import type { GameEvent } from './parser/types.ts';

/**
 * Alertas para el tablet: de los eventos en directo, los que merecen un aviso emergente.
 * Se calculan en el servidor para que todos los dispositivos vean lo mismo; cada tablet decide si suena.
 * Los textos salen en el idioma de la interfaz; los eventos llegan ya con `summary` en ese idioma.
 */

export type AlertLevel = 'info' | 'warn' | 'danger' | 'good';

export interface Alert {
  id: string;
  ts: string;
  level: AlertLevel;
  kind: string;
  title: string;
  body: string | null;
  /** A qué sección lleva al tocarla. */
  href: string | null;
}

export interface AlertContext {
  /** Jugadores marcados como hostiles en Contactos (en minúsculas). */
  hostiles: Set<string>;
}

const ROLE_TEXT: Record<string, [es: string, en: string]> = {
  nearby: ['está en tu vagón', 'is in your train car'],
  nemesis: ['te ha atacado', 'attacked you'],
  killer: ['está combatiendo cerca', 'is fighting nearby'],
  killed: ['está en un combate cerca', 'is in a fight nearby'],
  victim: ['ha caído en combate contigo', 'went down fighting you'],
  party: ['está en tu grupo', 'is in your party'],
  crew: ['ha subido a tu nave', 'boarded your ship'],
  host: ['es el dueño de la nave en la que vas', 'owns the ship you are on'],
  friend: ['es tu amigo', 'is your friend'],
};

const SEVERITY: Record<string, [es: string, en: string]> = {
  Minor: ['leve', 'Minor'],
  Moderate: ['moderada', 'Moderate'],
  Severe: ['grave', 'Severe'],
};

export function alertsFor(events: (GameEvent & { id?: number })[], ctx: AlertContext): Alert[] {
  const out: Alert[] = [];
  const add = (e: GameEvent & { id?: number }, kind: string, level: AlertLevel, title: string, body: string | null = null, href: string | null = null) =>
    out.push({ id: `${e.id ?? e.ts}-${kind}`, ts: e.ts, level, kind, title, body, href });

  for (const e of events) {
    const d = e.data as Record<string, unknown>;
    switch (e.type) {
      case 'zone.jurisdiction':
        if (d.lawless) add(e, 'lawless', 'warn', tx('Espacio sin ley', 'Ungoverned space'), tx('Aquí nadie te protege: atento a otros jugadores.', 'No one protects you here: watch out for other players.'), '#ahora');
        break;
      case 'health.injury': {
        const sev = SEVERITY[String(d.severity)];
        const sevText = sev ? tx(sev[0], sev[1]) : String(d.severity ?? '');
        const body = tx(`${sevText}: ${d.part} (requiere tratamiento nivel ${d.tier})`, `${sevText}: ${d.part} (Tier ${d.tier} treatment required)`);
        add(e, 'injury', d.severity === 'Severe' ? 'danger' : 'warn', tx('Herida', 'Injury'), body, '#ahora');
        break;
      }
      case 'health.downed':
        add(e, 'downed', 'danger', tx('Incapacitado', 'Incapacitated'), tx('Pide rescate desde Mandos o espera a los servicios de emergencia.', 'Call for rescue from Controls or wait for emergency services.'), '#mandos');
        break;
      case 'combat.vehicle_destroyed':
        if (d.mine && d.destroyed) add(e, 'ship-lost', 'danger', tx('Nave perdida', 'Ship lost'), e.summary, '#combate');
        else if (d.byMe && d.destroyed) add(e, 'kill', 'good', tx('Objetivo destruido', 'Target destroyed'), e.summary, '#combate');
        break;
      case 'law.crime':
        add(e, 'crime', 'danger', tx('Delito cometido', 'Crime committed'), d.against ? tx(`${d.crime} (contra ${d.against})`, `${d.crime} (against ${d.against})`) : String(d.crime ?? ''), '#combate');
        break;
      case 'economy.refinery': {
        const orders = Number(d.orders) || 1;
        add(e, 'refinery', 'good', tx('Refinería lista', 'Refinery ready'), orders > 1 ? tx(`${d.station} (${orders} órdenes)`, `${d.station} (${orders} orders)`) : String(d.station ?? ''), '#comercio');
        break;
      }
      case 'blueprint.received':
        add(e, 'blueprint', 'good', tx('Blueprint conseguida', 'Blueprint received'), String(d.name ?? ''), '#hangar');
        break;
      case 'mission.failed':
        add(e, 'mission-failed', 'warn', tx('Contrato fallido', 'Contract failed'), String(d.title ?? ''), '#contratos');
        break;
      case 'session.quit':
        add(e, 'session-end', 'info', tx('Sesión terminada', 'Session ended'), tx('Tienes el resumen de la partida en Archivo.', 'Your session summary is in the Archive.'), '#archivo');
        break;
    }
    // Un jugador marcado como hostil aparece en cualquier evento.
    for (const m of e.mentions ?? []) {
      if (!ctx.hostiles.has(m.name.toLowerCase())) continue;
      const role = ROLE_TEXT[m.role];
      add(
        e,
        `hostile-${m.name}`,
        'danger',
        tx(`Hostil: ${m.name}`, `Hostile: ${m.name}`),
        role ? tx(role[0], role[1]) : tx('aparece en tu partida', 'shows up in your session'),
        `#contactos/${encodeURIComponent(m.name)}`,
      );
    }
  }
  return out;
}
