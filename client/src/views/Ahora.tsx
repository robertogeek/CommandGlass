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
  const { t } = useLang();
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
          <h2>{t('Esperando al juego', 'Waiting for the game')}</h2>
          <p>
            {t(
              'Cuando arranques Star Citizen, aquí verás dónde estás, en qué nave y qué contratos llevas.',
              "Once you launch Star Citizen, you'll see here where you are, which ship you're in and which contracts you have.",
            )}
          </p>
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
        <div className="label"><Activity size={14} aria-hidden /> {t('Bitácora en directo', 'Live logbook')}</div>
        {feed.length === 0 && <div className="empty">{t('Aún no ha pasado nada en esta sesión.', 'Nothing has happened this session yet.')}</div>}
        {feed.map((e) => (
          <EventRow key={e.id} e={e} fresh={e.id > baseline} />
        ))}
      </div>
    </div>
  );
}

function LocationCard({ s }: { s: LiveState }) {
  const { t } = useLang();
  const loc = s.location;
  return (
    <div className="panel">
      <div className="label"><MapPin size={14} aria-hidden /> {t('Ubicación', 'Location')}</div>
      {loc ? (
        <>
          <div className="big">{loc.name}</div>
          <div className="sub">
            {[loc.body, loc.system].filter(Boolean).join(' · ') || t('Sistema desconocido', 'Unknown system')} · {t('desde las', 'since')} {hhmm(loc.since)}
          </div>
        </>
      ) : (
        <>
          <div className="big faint">{t('En ruta', 'In transit')}</div>
          <div className="sub">{s.lastQt ? t(`Último destino: ${s.lastQt.name}`, `Last destination: ${s.lastQt.name}`) : t('Sin ubicación registrada aún', 'No location recorded yet')}</div>
        </>
      )}
    </div>
  );
}

function ZoneCard({ s }: { s: LiveState }) {
  const { t } = useLang();
  const j = s.jurisdiction;
  const lawless = !!j?.lawless;
  return (
    <div className={`panel ${lawless ? 'warn' : s.armistice ? 'safe' : ''}`}>
      <div className="label">
        {lawless ? <ShieldAlert size={14} aria-hidden /> : <ShieldCheck size={14} aria-hidden />} {t('Jurisdicción', 'Jurisdiction')}
      </div>
      <div className="big">{j ? (lawless ? t('Sin ley', 'Lawless') : j.name) : '—'}</div>
      <div className="sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {s.armistice && <span className="badge green">{t('Armisticio', 'Armistice Zone')}</span>}
        {s.monitored === true && <span className="badge">{t('Espacio vigilado', 'Monitored Space')}</span>}
        {s.monitored === false && <span className="badge amber">{t('Sin vigilancia', 'Unmonitored Space')}</span>}
        {lawless && <span className="badge amber">{t('Precaución', 'Caution')}</span>}
      </div>
    </div>
  );
}

function ShipCard({ s }: { s: LiveState }) {
  const { t } = useLang();
  const ship = s.ship;
  return (
    <div className="panel">
      <div className="label"><Rocket size={14} aria-hidden /> {t('Nave', 'Ship')}</div>
      {ship ? (
        <>
          <div className="big">{ship.name}</div>
          <div className="sub">
            {ship.own ? t('Tuya', 'Yours') : t(`De ${ship.owner}`, `${ship.owner}'s`)} · {t('a bordo desde las', 'aboard since')} {hhmm(ship.since)}
          </div>
        </>
      ) : (
        <>
          <div className="big faint">{t('A pie', 'On foot')}</div>
          <div className="sub">{t('No estás en ninguna nave', "You're not in a ship")}</div>
        </>
      )}
    </div>
  );
}

function MissionsCard({ s }: { s: LiveState }) {
  const { t } = useLang();
  return (
    <div className="panel">
      <div className="label"><FileText size={14} aria-hidden /> {t('Contratos activos', 'Active contracts')} · {s.missions.length}</div>
      {s.missions.length === 0 && (
        <div className="empty">{t('Ningún contrato activo. Acepta uno en el mobiGlas del juego.', 'No active contracts. Accept one from your in-game mobiGlas.')}</div>
      )}
      {s.missions.map((m) => (
        <div className="mission" key={m.id}>
          <div className="t">{m.title}</div>
          <ContractGains intel={m.intel} />
          {m.objective ? (
            <div className="o"><Target size={14} aria-hidden /> {m.objective}</div>
          ) : (
            <div className="sub">
              {t('Aceptado a las', 'Accepted at')} {hhmm(m.acceptedAt)}
              {m.objectivesDone
                ? t(` · ${m.objectivesDone} objetivos cumplidos`, ` · ${m.objectivesDone} ${m.objectivesDone === 1 ? 'objective' : 'objectives'} complete`)
                : ''}
            </div>
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
      <div className="label"><HeartPulse size={14} aria-hidden /> {t('Salud', 'Health')}</div>
      {downed ? (
        <>
          <div className="big">{t('Incapacitado', 'Incapacitated')}</div>
          <div className="sub">
            {t(
              `Desde las ${hhmm(s.downedAt!)}. Pide rescate manteniendo la tecla en el juego o desde Mandos.`,
              `Since ${hhmm(s.downedAt!)}. Call for rescue by holding the key in game or from Controls.`,
            )}
          </div>
          <a className="chip on health-cta" href="#mandos">{t('Ir a Mandos', 'Go to Controls')}</a>
        </>
      ) : injuries.length === 0 ? (
        <>
          <div className="big">{t('Sin heridas', 'No injuries')}</div>
          <div className="sub">
            {s.lastDeathAt
              ? t(`Última muerte a las ${hhmm(s.lastDeathAt)}`, `Last death at ${hhmm(s.lastDeathAt)}`)
              : t('Nada que curar en esta sesión.', 'Nothing to heal this session.')}
          </div>
        </>
      ) : (
        <>
          <div className="big">{injuries.length} {injuries.length === 1 ? t('herida', 'injury') : t('heridas', 'injuries')}</div>
          {injuries.map((i) => (
            <div key={i.part} className="kv">
              <span>{BODY_PART[i.part] ? t(BODY_PART[i.part]!) : i.part}</span>
              <span className={i.severity === 'Severe' ? 'desk-bad' : 'faint'}>{SEVERITY[i.severity] ? t(SEVERITY[i.severity]!) : i.severity} · Tier {i.tier}</span>
            </div>
          ))}
          <div className="sub health-tip">
            {t(
              `Necesitas una ${t(MEDBED)} de Tier ${worstTier} o mejor (cuanto menor el número, mejor). Los hospitales de las ciudades curan todo.`,
              `You need a Tier ${worstTier} ${t(MEDBED)} or better (the lower the number, the better). City hospitals heal everything.`,
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SessionCard({ s }: { s: LiveState }) {
  const { t } = useLang();
  const st = s.stats;
  return (
    <div className="panel">
      <div className="label">
        <Crosshair size={14} aria-hidden /> {t('Esta sesión', 'This session')} {s.startedAt && `· ${duration(s.startedAt, s.endedAt)}`}
      </div>
      <div className="stat-grid">
        <Stat v={st.missionsCompleted} k={t('Contratos completados', 'Contracts completed')} tone="good" />
        <Stat v={st.missionsFailed} k={t('Contratos fallidos', 'Contracts failed')} tone={st.missionsFailed ? 'bad' : undefined} />
        <Stat v={st.vehiclesDestroyed} k={t('Naves destruidas', 'Ships destroyed')} />
        <Stat v={st.shipsLost} k={t('Naves perdidas', 'Ships lost')} tone={st.shipsLost ? 'bad' : undefined} />
        <Stat v={st.deaths} k={t('Muertes', 'Deaths')} tone={st.deaths ? 'bad' : undefined} />
        <Stat v={st.qtJumps} k={t('Saltos cuánticos', 'Quantum jumps')} />
        {st.kills > 0 && <Stat v={st.kills} k={t('Bajas', 'Kills')} />}
        {st.rewardsAuec > 0 && <Stat v={st.rewardsAuec} k={t('aUEC en recompensas', 'aUEC in rewards')} tone="good" />}
        {st.spentAuec > 0 && <Stat v={st.spentAuec} k={t('aUEC gastados', 'aUEC spent')} />}
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
