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
  /** Solo en eventos recibidos en directo. */
  mentions?: { name: string; geid?: string; role: string }[];
}

export interface BoundAction {
  id: string;
  map: string;
  name: string;
  label: string;
  description: string | null;
  keys: string[] | null;
  keyLabels: string[];
  sendable: boolean;
  mode: string;
  plan: { holdMs: number; taps: number; momentary: boolean };
  custom: boolean;
}

export interface BindingMap {
  name: string;
  label: string;
  category: string;
  actions: BoundAction[];
}

export interface ControlsResponse {
  available: boolean;
  error?: string;
  catalog: { maps: BindingMap[]; extractedAt: string; userProfile: string | null; userProfileChangedAt: string | null } | null;
}

export type SendResult = { ok: true } | { ok: false; reason: string; message: string; foreground?: string };

export type MissionKind = 'caza' | 'mercenario' | 'fps' | 'transporte' | 'recuperacion' | 'recoleccion' | 'infiltracion' | 'evento' | 'otros';
export type Outcome = 'completed' | 'failed' | 'abandoned' | 'open';

export interface Mission {
  id: string;
  title: string | null;
  contract: string | null;
  generator: string | null;
  kind: MissionKind;
  sessionId: number;
  acceptedAt: string | null;
  endedAt: string | null;
  outcome: Outcome;
  objectives: { text: string; at: string; state: 'active' | 'done' | 'failed' | 'withdrawn' }[];
}

export interface KindStats {
  kind: MissionKind;
  label: string;
  total: number;
  completed: number;
  failed: number;
  abandoned: number;
  medianMinutes: number | null;
}

export interface MissionIntel {
  debugName: string;
  title: string | null;
  giver: string | null;
  faction: string | null;
  rankRequired: string | null;
  reputation: { faction: string; amount: number; scope: string | null }[];
  rewardMin: number | null;
  rewardMax: number | null;
  currency: string | null;
  systems: string[];
  illegal: boolean;
  shareable: boolean;
  combat: boolean;
  enemies: { min: number | null; max: number | null };
  minutes: number | null;
  webUrl: string | null;
  version: string | null;
}

export interface WikiInfo {
  fetchedAt: string | null;
  gameVersion: string | null;
  count: number;
  error: string | null;
}

export interface MissionsResponse {
  missions: (Mission & { faction: string | null })[];
  kinds: KindStats[];
  factions: { faction: string; completed: number; total: number; reputation: number }[];
  wiki: WikiInfo;
  totals: { total: number; completed: number; failed: number; abandoned: number; successRate: number | null };
}

export interface Briefing {
  kind: MissionKind;
  label: string;
  outline: string[];
  gear: string[];
  tips: string[];
  previous: { at: string; title: string | null; steps: string[] } | null;
  record: { total: number; completed: number; failed: number; abandoned: number };
}

export interface ShipUse {
  className: string | null;
  name: string;
  own: boolean;
  boarded: number;
  qtJumps: number;
  lost: number;
  sessions: number;
  firstUsed: string;
  lastUsed: string;
}

export interface HangarResponse {
  ships: ShipUse[];
  fleet: { total: number; entitlements: number; at: string } | null;
  loadout: { port: string; cls: string; at: string; name: string }[];
  loadoutAt: string | null;
}

export interface ShipSpec {
  className: string;
  name: string;
  manufacturer: string | null;
  role: string | null;
  size: number | null;
  crew: { min: number | null; max: number | null };
  cargo: number | null;
  medicalTier: number | null;
  speed: { scm: number | null; max: number | null };
  quantum: { speed: number | null; range: number | null; fuel: number | null; spool: number | null };
  hull: number | null;
  shield: { hp: number | null; faces: string | null };
  weapons: { turretDps: number | null; missiles: number | null; missileDamage: number | null };
  insurance: { claim: number | null; expedite: number | null; expediteCost: number | null };
  image: string | null;
  description: string | null;
  webUrl: string | null;
  stock: { slot: string; type: string; size: number | null; name: string; className: string }[];
  version: string | null;
}

export interface UpgradeSlot {
  type: string;
  label: string;
  size: number;
  stock: string[];
  options: { name: string; className: string; manufacturer: string | null; grade: string | null; klass: string | null; stat: number | null; statLabel: string; price: number | null; shop: string | null }[];
}

export type Mark = 'ally' | 'neutral' | 'hostile';

export interface Contact {
  name: string;
  geid: string | null;
  events: number;
  sessions: number;
  firstSeen: string;
  lastSeen: string;
  counts: {
    party: number;
    groupSessions: number;
    crew: number;
    friend: number;
    nemesis: number;
    victim: number;
    combat: number;
    nearby: number;
  };
  inSession: number;
  presence: { inParty: boolean; online: boolean; aboard: boolean } | null;
  mark: Mark | null;
  note: string | null;
}

export interface ContactDetail extends Contact {
  ships: { ship: string; owner: string; own: boolean; times: number; last: string }[];
  recentSessions: { id: number; startedAt: string | null; endedAt: string | null; events: number }[];
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
  injuries?: { part: string; severity: string; tier: number; at: string }[];
  downedAt?: string | null;
  lastDeathAt?: string | null;
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
