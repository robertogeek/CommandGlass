import type { GameEvent } from '../parser/types.ts';

export interface ActiveMission {
  id: string;
  title: string;
  acceptedAt: string;
  objective: string | null;
  objectivesDone: number;
  generator: string | null;
  contract: string | null;
}

export interface SessionStats {
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
  stats: SessionStats;
  lastDeathAt: string | null;
  missionInfo: Record<string, { generator: string | null; contract: string | null }>;
  /** Equipo personal visto en esta sesión: puerto → clase del objeto. */
  loadout: Record<string, { cls: string; at: string }>;
  /** Naves en tu hangar según el juego (ASOP). */
  fleet: { total: number; entitlements: number; at: string } | null;
  /** Heridas activas: se borran con la cama médica o al morir. */
  injuries: { part: string; severity: string; tier: number; at: string }[];
  downedAt: string | null;
}

export function emptyState(): LiveState {
  return {
    sessionKey: null,
    build: null,
    startedAt: null,
    lastEventAt: null,
    endedAt: null,
    player: { name: null, geid: null },
    shard: null,
    location: null,
    jurisdiction: null,
    armistice: false,
    monitored: null,
    ship: null,
    lastQt: null,
    missions: [],
    lastDeathAt: null,
    missionInfo: {},
    loadout: {},
    fleet: null,
    injuries: [],
    downedAt: null,
    stats: {
      rewardsAuec: 0,
      spentAuec: 0,
      missionsCompleted: 0,
      missionsFailed: 0,
      qtJumps: 0,
      shipsLost: 0,
      vehiclesDestroyed: 0,
      kills: 0,
      deaths: 0,
      locationsVisited: 0,
    },
  };
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function recentDeath(s: LiveState, ts: string): boolean {
  // La ráfaga del cadáver llega al reaparecer, a veces minutos después de la muerte.
  return !!s.lastDeathAt && Date.parse(ts) - Date.parse(s.lastDeathAt) < 10 * 60_000;
}

/** Aplica un evento al estado (muta y devuelve el mismo objeto). */
export function applyEvent(s: LiveState, e: GameEvent): LiveState {
  const d = e.data;
  s.lastEventAt = e.ts;
  s.startedAt ??= e.ts;

  switch (e.type) {
    case 'session.login':
      s.player = { name: str(d.name), geid: str(d.geid) };
      break;
    case 'session.shard':
      s.shard = { id: String(d.shard), label: String(d.label), region: str(d.region) };
      s.endedAt = null;
      break;
    case 'session.quit':
      s.endedAt = e.ts;
      s.ship = null;
      break;
    case 'travel.location':
      s.location = { code: String(d.code), name: String(d.name), system: str(d.system), body: str(d.body), since: e.ts };
      s.stats.locationsVisited++;
      break;
    case 'zone.jurisdiction':
      s.jurisdiction = { name: String(d.name), lawless: Boolean(d.lawless), since: e.ts };
      break;
    case 'zone.armistice':
      s.armistice = Boolean(d.on);
      break;
    case 'zone.monitored':
      s.monitored = Boolean(d.on);
      break;
    case 'ship.boarded':
      s.ship = { name: String(d.ship), owner: String(d.owner), own: Boolean(d.own), since: e.ts };
      break;
    case 'ship.left':
      if (s.ship && s.ship.name === d.ship) s.ship = null;
      break;
    case 'travel.qt_target':
      s.lastQt = { target: String(d.target), name: String(d.targetName), at: e.ts };
      break;
    case 'travel.qt_arrived':
      s.stats.qtJumps++;
      break;
    case 'mission.accepted': {
      const id = str(d.missionId);
      if (id && !s.missions.some((m) => m.id === id)) {
        const info = s.missionInfo[id];
        s.missions.push({
          id,
          title: String(d.title),
          acceptedAt: e.ts,
          objective: null,
          objectivesDone: 0,
          generator: info?.generator ?? null,
          contract: info?.contract ?? null,
        });
      }
      break;
    }
    case 'mission.info': {
      const id = String(d.missionId);
      // El marcador puede llegar antes o después del "Contract Accepted".
      s.missionInfo[id] = { generator: str(d.generator), contract: str(d.contract) };
      const keys = Object.keys(s.missionInfo);
      if (keys.length > 30) delete s.missionInfo[keys[0]!];
      const m = s.missions.find((x) => x.id === id);
      if (m) {
        m.generator = str(d.generator);
        m.contract = str(d.contract);
      }
      break;
    }
    case 'mission.objective': {
      const m = s.missions.find((x) => x.id === d.missionId);
      if (m) m.objective = String(d.objective);
      break;
    }
    case 'mission.objective_done': {
      const m = s.missions.find((x) => x.id === d.missionId);
      if (m) {
        m.objectivesDone++;
        if (m.objective === d.objective) m.objective = null;
      }
      break;
    }
    case 'mission.completed':
      s.stats.missionsCompleted++;
      s.missions = s.missions.filter((m) => m.id !== d.missionId);
      break;
    case 'mission.failed':
      s.stats.missionsFailed++;
      s.missions = s.missions.filter((m) => m.id !== d.missionId);
      break;
    case 'mission.abandoned':
    case 'mission.ended':
      s.missions = s.missions.filter((m) => m.id !== d.missionId);
      break;
    case 'economy.reward':
      s.stats.rewardsAuec += Number(d.amount) || 0;
      break;
    case 'economy.buy':
      s.stats.spentAuec += (Number(d.price) || 0) * (Number(d.quantity) || 1);
      break;
    case 'combat.vehicle_destroyed':
      if (d.destroyed && d.mine) s.stats.shipsLost++;
      if (d.destroyed && d.byMe && !d.mine) s.stats.vehiclesDestroyed++;
      break;
    case 'combat.actor_death':
      if (d.victimIsMe) {
        if (!recentDeath(s, e.ts)) s.stats.deaths++;
        s.lastDeathAt = e.ts;
      } else if (d.killerIsMe) s.stats.kills++;
      break;
    case 'health.death':
      // En 2025 la misma muerte aparece como <Actor Death> y como ráfaga de cadáver.
      if (!recentDeath(s, e.ts)) s.stats.deaths++;
      s.lastDeathAt = e.ts;
      s.ship = null;
      s.injuries = [];
      s.downedAt = null;
      break;
    case 'health.injury': {
      const part = String(d.part ?? '');
      s.injuries = [...(s.injuries ?? []).filter((i) => i.part !== part), { part, severity: String(d.severity ?? ''), tier: Number(d.tier) || 0, at: e.ts }];
      break;
    }
    case 'health.downed':
      s.downedAt = e.ts;
      break;
    case 'health.medbed':
      s.injuries = [];
      s.downedAt = null;
      break;
    case 'gear.equipped':
      s.loadout ??= {};
      s.loadout[String(d.port)] = { cls: String(d.cls), at: e.ts };
      break;
    case 'gear.stored':
      s.loadout ??= {};
      for (const [port, v] of Object.entries(s.loadout)) if (v.cls === d.cls) delete s.loadout[port];
      break;
    case 'ship.fleet':
      s.fleet = { total: Number(d.total) || 0, entitlements: Number(d.entitlements) || 0, at: e.ts };
      break;
  }
  return s;
}
