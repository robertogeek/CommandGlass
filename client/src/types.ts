// Tipos compartidos con el servidor (copia ligera de server/src).

export type Category = 'combat' | 'travel' | 'mission' | 'social' | 'economy' | 'health' | 'system';

export interface GameEvent {
  id: number;
  sessionId: number;
  ts: string;
  type: string;
  category: Category;
  importance: 0 | 1 | 2;
  summary: string;
  data: Record<string, unknown>;
}

export interface ActiveMission {
  id: string;
  title: string;
  acceptedAt: string;
  objective: string | null;
  objectivesDone: number;
  generator: string | null;
  contract: string | null;
}

export interface LiveState {
  sessionKey: string | null;
  build: string | null;
  startedAt: string | null;
  lastEventAt: string | null;
  endedAt: string | null;
  player: { name: string | null; geid: string | null };
  shard: { id: string; label: string; region: string | null } | null;
  location: { code: string; name: string; system: string | null; body: string | null; since: string } | null;
  jurisdiction: { name: string; lawless: boolean; since: string } | null;
  armistice: boolean;
  monitored: boolean | null;
  ship: { name: string; owner: string; own: boolean; since: string } | null;
  lastQt: { target: string; name: string; at: string } | null;
  missions: ActiveMission[];
  stats: {
    rewardsAuec: number;
    spentAuec: number;
    missionsCompleted: number;
    missionsFailed: number;
    qtJumps: number;
    shipsLost: number;
    vehiclesDestroyed: number;
    kills: number;
    deaths: number;
    locationsVisited: number;
  };
}

export interface TailerStatus {
  path: string;
  found: boolean;
  sessionKey: string | null;
  sessionId: number | null;
  lastWriteAt: string | null;
  active: boolean;
}

export interface Snapshot {
  state: LiveState | null;
  status: TailerStatus;
}

export interface Overview {
  sessions: number;
  firstSession: string | null;
  hoursPlayed: number;
  events: number;
  missionsCompleted: number;
  missionsFailed: number;
  rewardsAuec: number;
  qtJumps: number;
  shipsLost: number;
  vehiclesDestroyed: number;
  kills: number;
  deaths: number;
  playersMet: number;
}

export interface SessionSummary {
  id: number;
  key: string;
  build: string | null;
  started_at: string | null;
  ended_at: string | null;
  player: string | null;
  event_count: number;
}
