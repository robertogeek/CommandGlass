import { Activity, Crosshair, FileText, HeartPulse, MapPin, Rocket, ShieldAlert, ShieldCheck, Target } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ContractGains } from '../components/ContractGains.tsx';
import { EventRow } from '../components/EventRow.tsx';
import { useLang } from '../lang.tsx';
import { BODY_PART, MEDBED, SEVERITY } from '../terms.ts';
import { duration, hhmm, n } from '../format.ts';
import { getJson, mergeEvents, useLive } from '../live.tsx';
import type { GameEvent, LiveState } from '../types.ts';

export function Ahora() {
  const { snapshot, liveEvents } = useLive();
  const state = snapshot?.state ?? null;
  const sessionId = snapshot?.status.sessionId ?? null;
  const [recent, setRecent] = useState<GameEvent[]>([]);
  const [baseline, setBaseline] = useState(0);
  useTick(30_000);

  useEffect(() => {
    if (sessionId === null) return;
    getJson<GameEvent[]>('/api/events?session=current&min=1&limit=14').then((evs) => {
      setRecent(evs);
      setBaseline(evs[0]?.id ?? 0);
    });
  }, [sessionId]);

  const feed = useMemo(
    () => mergeEvents(liveEvents.filter((e) => e.importance >= 1 && e.sessionId === sessionId), recent).slice(0, 14),
    [liveEvents, recent, sessionId],
  );

  if (!state) {
    return (
      <div className="soon-view">
        <div>
          <h2>Esperando al juego</h2>
          <p>Cuando arranques Star Citizen, aquí verás dónde estás, en qué nave y qué contratos llevas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="grid g3">
        <LocationCard s={state} />
        <ZoneCard s={state} />
        <ShipCard s={state} />
      </div>

      <div className="grid g3">
        <MissionsCard s={state} />
        <HealthCard s={state} />
        <SessionCard s={state} />
      </div>

      <div className="panel">
        <div className="label"><Activity size={14} aria-hidden /> Bitácora en directo</div>
        {feed.length === 0 && <div className="empty">Aún no ha pasado nada en esta sesión.</div>}
        {feed.map((e) => (
          <EventRow key={e.id} e={e} fresh={e.id > baseline} />
        ))}
      </div>
    </div>
  );
}

function LocationCard({ s }: { s: LiveState }) {
  const loc = s.location;
  return (
    <div className="panel">
      <div className="label"><MapPin size={14} aria-hidden /> Ubicación</div>
      {loc ? (
        <>
          <div className="big">{loc.name}</div>
          <div className="sub">
            {[loc.body, loc.system].filter(Boolean).join(' · ') || 'Sistema desconocido'} · desde las {hhmm(loc.since)}
          </div>
        </>
      ) : (
        <>
          <div className="big faint">En ruta</div>
          <div className="sub">{s.lastQt ? `Último destino: ${s.lastQt.name}` : 'Sin ubicación registrada aún'}</div>
        </>
      )}
    </div>
  );
}

function ZoneCard({ s }: { s: LiveState }) {
  const j = s.jurisdiction;
  const lawless = !!j?.lawless;
  return (
    <div className={`panel ${lawless ? 'warn' : s.armistice ? 'safe' : ''}`}>
      <div className="label">
        {lawless ? <ShieldAlert size={14} aria-hidden /> : <ShieldCheck size={14} aria-hidden />} Jurisdicción
      </div>
      <div className="big">{j ? (lawless ? 'Sin ley' : j.name) : '—'}</div>
      <div className="sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {s.armistice && <span className="badge green">Armisticio</span>}
        {s.monitored === true && <span className="badge">Espacio vigilado</span>}
        {s.monitored === false && <span className="badge amber">Sin vigilancia</span>}
        {lawless && <span className="badge amber">Precaución</span>}
      </div>
    </div>
  );
}

function ShipCard({ s }: { s: LiveState }) {
  const ship = s.ship;
  return (
    <div className="panel">
      <div className="label"><Rocket size={14} aria-hidden /> Nave</div>
      {ship ? (
        <>
          <div className="big">{ship.name}</div>
          <div className="sub">
            {ship.own ? 'Tuya' : `De ${ship.owner}`} · a bordo desde las {hhmm(ship.since)}
          </div>
        </>
      ) : (
        <>
          <div className="big faint">A pie</div>
          <div className="sub">No estás en ninguna nave</div>
        </>
      )}
    </div>
  );
}

function MissionsCard({ s }: { s: LiveState }) {
  return (
    <div className="panel">
      <div className="label"><FileText size={14} aria-hidden /> Contratos activos · {s.missions.length}</div>
      {s.missions.length === 0 && <div className="empty">Ningún contrato activo. Acepta uno en el mobiGlas del juego.</div>}
      {s.missions.map((m) => (
        <div className="mission" key={m.id}>
          <div className="t">{m.title}</div>
          <ContractGains intel={m.intel} />
          {m.objective ? (
            <div className="o"><Target size={14} aria-hidden /> {m.objective}</div>
          ) : (
            <div className="sub">Aceptado a las {hhmm(m.acceptedAt)}{m.objectivesDone ? ` · ${m.objectivesDone} objetivos cumplidos` : ''}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function HealthCard({ s }: { s: LiveState }) {
  const { t } = useLang();
  const injuries = s.injuries ?? [];
  const downed = s.downedAt && Date.now() - Date.parse(s.downedAt) < 15 * 60_000;
  // El nivel más exigente manda: nivel 1 = solo hospitales y camas de nivel 1.
  const worstTier = injuries.length ? Math.min(...injuries.map((i) => i.tier || 3)) : null;
  const tone = downed ? 'warn' : injuries.some((i) => i.severity === 'Severe') ? 'warn' : '';
  return (
    <div className={`panel ${tone}`}>
      <div className="label"><HeartPulse size={14} aria-hidden /> Salud</div>
      {downed ? (
        <>
          <div className="big">Incapacitado</div>
          <div className="sub">Desde las {hhmm(s.downedAt!)}. Pide rescate manteniendo la tecla en el juego o desde Mandos.</div>
          <a className="chip on health-cta" href="#mandos">Ir a Mandos</a>
        </>
      ) : injuries.length === 0 ? (
        <>
          <div className="big">Sin heridas</div>
          <div className="sub">{s.lastDeathAt ? `Última muerte a las ${hhmm(s.lastDeathAt)}` : 'Nada que curar en esta sesión.'}</div>
        </>
      ) : (
        <>
          <div className="big">{injuries.length} {injuries.length === 1 ? 'herida' : 'heridas'}</div>
          {injuries.map((i) => (
            <div key={i.part} className="kv">
              <span>{BODY_PART[i.part] ? t(BODY_PART[i.part]!) : i.part}</span>
              <span className={i.severity === 'Severe' ? 'desk-bad' : 'faint'}>{SEVERITY[i.severity] ? t(SEVERITY[i.severity]!) : i.severity} · Tier {i.tier}</span>
            </div>
          ))}
          <div className="sub health-tip">
            Necesitas una {t(MEDBED)} de Tier {worstTier} o mejor (cuanto menor el número, mejor). Los hospitales de las ciudades curan todo.
          </div>
        </>
      )}
    </div>
  );
}

function SessionCard({ s }: { s: LiveState }) {
  const st = s.stats;
  return (
    <div className="panel">
      <div className="label">
        <Crosshair size={14} aria-hidden /> Esta sesión {s.startedAt && `· ${duration(s.startedAt, s.endedAt)}`}
      </div>
      <div className="stat-grid">
        <Stat v={st.missionsCompleted} k="Contratos completados" tone="good" />
        <Stat v={st.missionsFailed} k="Contratos fallidos" tone={st.missionsFailed ? 'bad' : undefined} />
        <Stat v={st.vehiclesDestroyed} k="Naves destruidas" />
        <Stat v={st.shipsLost} k="Naves perdidas" tone={st.shipsLost ? 'bad' : undefined} />
        <Stat v={st.deaths} k="Muertes" tone={st.deaths ? 'bad' : undefined} />
        <Stat v={st.qtJumps} k="Saltos cuánticos" />
        {st.kills > 0 && <Stat v={st.kills} k="Bajas" />}
        {st.rewardsAuec > 0 && <Stat v={st.rewardsAuec} k="aUEC en recompensas" tone="good" />}
        {st.spentAuec > 0 && <Stat v={st.spentAuec} k="aUEC gastados" />}
      </div>
    </div>
  );
}

function Stat({ v, k, tone }: { v: number; k: string; tone?: 'good' | 'bad' }) {
  return (
    <div className={`stat ${tone ?? ''}`}>
      <div className="v">{n(v)}</div>
      <div className="k">{k}</div>
    </div>
  );
}

function useTick(ms: number) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
