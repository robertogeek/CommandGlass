import type { GameEvent } from './parser/types.ts';

/**
 * Alertas para el tablet: de los eventos en directo, los que merecen un aviso emergente.
 * Se calculan en el servidor para que todos los dispositivos vean lo mismo; cada tablet decide si suena.
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

const ROLE_TEXT: Record<string, string> = {
  nearby: 'está en tu vagón',
  nemesis: 'te ha atacado',
  killer: 'está combatiendo cerca',
  killed: 'está en un combate cerca',
  victim: 'ha caído en combate contigo',
  party: 'está en tu grupo',
  crew: 'ha subido a tu nave',
  host: 'es el dueño de la nave en la que vas',
  friend: 'es tu amigo',
};

export function alertsFor(events: (GameEvent & { id?: number })[], ctx: AlertContext): Alert[] {
  const out: Alert[] = [];
  const add = (e: GameEvent & { id?: number }, kind: string, level: AlertLevel, title: string, body: string | null = null, href: string | null = null) =>
    out.push({ id: `${e.id ?? e.ts}-${kind}`, ts: e.ts, level, kind, title, body, href });

  for (const e of events) {
    const d = e.data as Record<string, unknown>;
    switch (e.type) {
      case 'zone.jurisdiction':
        if (d.lawless) add(e, 'lawless', 'warn', 'Espacio sin ley', 'Aquí nadie te protege: atento a otros jugadores.', '#ahora');
        break;
      case 'health.injury':
        add(e, 'injury', d.severity === 'Severe' ? 'danger' : 'warn', 'Herida', e.summary.replace(/^Herida /, ''), '#ahora');
        break;
      case 'health.downed':
        add(e, 'downed', 'danger', 'Incapacitado', 'Pide rescate desde Mandos o espera a los servicios de emergencia.', '#mandos');
        break;
      case 'combat.vehicle_destroyed':
        if (d.mine && d.destroyed) add(e, 'ship-lost', 'danger', 'Nave perdida', e.summary, '#combate');
        else if (d.byMe && d.destroyed) add(e, 'kill', 'good', 'Objetivo destruido', e.summary, '#combate');
        break;
      case 'law.crime':
        add(e, 'crime', 'danger', 'Delito cometido', e.summary.replace(/^Delito cometido: /, ''), '#combate');
        break;
      case 'economy.refinery':
        add(e, 'refinery', 'good', 'Refinería lista', e.summary.replace(/^Refinería lista en /, ''), '#comercio');
        break;
      case 'blueprint.received':
        add(e, 'blueprint', 'good', 'Blueprint conseguida', String(d.name ?? ''), '#hangar');
        break;
      case 'mission.failed':
        add(e, 'mission-failed', 'warn', 'Contrato fallido', String(d.title ?? ''), '#contratos');
        break;
      case 'session.quit':
        add(e, 'session-end', 'info', 'Sesión terminada', 'Tienes el resumen de la partida en Archivo.', '#archivo');
        break;
    }
    // Un jugador marcado como hostil aparece en cualquier evento.
    for (const m of e.mentions ?? []) {
      if (!ctx.hostiles.has(m.name.toLowerCase())) continue;
      add(e, `hostile-${m.name}`, 'danger', `Hostil: ${m.name}`, ROLE_TEXT[m.role] ?? 'aparece en tu partida', `#contactos/${encodeURIComponent(m.name)}`);
    }
  }
  return out;
}
