/** Una línea del Game.log ya troceada. */
export interface LogLine {
  /** Marca de tiempo ISO (UTC) tal y como viene en el log. */
  ts: string;
  /** Notice, Error, Warning... o null si la línea no lo trae. */
  level: string | null;
  /** Etiqueta entre <...> tras el nivel, p. ej. "Vehicle Destroyed". */
  tag: string | null;
  /** Resto de la línea tras la etiqueta. */
  body: string;
  raw: string;
}

export type Category =
  | 'combat'
  | 'travel'
  | 'mission'
  | 'social'
  | 'economy'
  | 'health'
  | 'system';

/**
 * 0 = dato interno (estadísticas, no se muestra por defecto)
 * 1 = normal (aparece en la bitácora)
 * 2 = destacado (pérdidas, kills, muertes, recompensas)
 */
export type Importance = 0 | 1 | 2;

export interface Mention {
  name: string;
  geid?: string;
  /** killer, victim, owner, nearby, party... */
  role: string;
}

export interface GameEvent {
  ts: string;
  type: string;
  category: Category;
  importance: Importance;
  /** Texto corto en castellano para la bitácora. */
  summary: string;
  data: Record<string, unknown>;
  mentions?: Mention[];
}

export type EventDraft = Omit<GameEvent, 'ts'> & { ts?: string };

/** Lo que el parser sabe de la partida mientras lee (quién eres, etc.). */
export interface ParserContext {
  playerName: string | null;
  playerGeid: string | null;
}
