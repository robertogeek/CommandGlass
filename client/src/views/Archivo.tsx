import { Archive, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { day, duration, n } from '../format.ts';
import { SessionSummaryCard } from '../components/SessionSummary.tsx';
import { useLang } from '../lang.tsx';
import { getJson } from '../live.tsx';
import type { Overview, SessionSummary } from '../types.ts';

interface Wrapped {
  year: number;
  years: number[];
  hours: number;
  sessions: number;
  longest: { startedAt: string; minutes: number } | null;
  busiestDay: { day: string; minutes: number } | null;
  missions: { completed: number; accepted: number; topKinds: { label: string; completed: number }[] };
  ships: { name: string; uses: number }[];
  places: { name: string; visits: number }[];
  companions: { name: string; sessions: number }[];
  nemeses: { name: string; times: number }[];
  deaths: number;
  shipsLost: number;
  vehiclesDestroyed: number;
  qtJumps: number;
  spent: number;
  rewards: number;
}

function YearInReview() {
  const { t } = useLang();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [w, setW] = useState<Wrapped | null>(null);
  useEffect(() => {
    getJson<Wrapped>(`/api/wrapped?year=${year}`).then(setW).catch(() => setW(null));
  }, [year]);
  if (!w) return null;
  const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);
  const list = (items: { name: string; v: string }[], empty: string) =>
    items.length ? items.map((i, k) => <div key={i.name} className="kv"><span><span className="wrap-rank">{k + 1}</span> {i.name}</span><span className="faint">{i.v}</span></div>) : <div className="empty">{empty}</div>;

  return (
    <section className="panel wrapped" aria-label={t(`Tu ${w.year} en Star Citizen`, `Your ${w.year} in Star Citizen`)}>
      <div className="toolbar">
        <div className="label wrap-title"><Sparkles size={14} aria-hidden /> {t(`Tu ${w.year} en el verso`, `Your ${w.year} in the 'verse`)}</div>
        {w.years.map((y) => (
          <button key={y} className={`chip ${y === year ? 'on' : ''}`} onClick={() => setYear(y)}>{y}</button>
        ))}
      </div>
      <div className="grid g4">
        <div className="stat">
          <div className="v">{n(w.hours)}</div>
          <div className="k">
            {t(
              `horas en ${n(w.sessions)} sesiones`,
              `${w.hours === 1 ? 'hour' : 'hours'} across ${n(w.sessions)} ${w.sessions === 1 ? 'session' : 'sessions'}`,
            )}
          </div>
        </div>
        <div className="stat good"><div className="v">{n(w.missions.completed)}</div><div className="k">{t('contratos completados', 'contracts completed')}</div></div>
        <div className="stat"><div className="v">{n(w.qtJumps)}</div><div className="k">{t('saltos cuánticos', 'quantum jumps')}</div></div>
        <div className="stat"><div className="v">{n(w.vehiclesDestroyed)}</div><div className="k">{t('naves destruidas', 'ships destroyed')}</div></div>
        <div className="stat bad"><div className="v">{n(w.deaths)}</div><div className="k">{t('muertes', 'deaths')}</div></div>
        <div className="stat bad"><div className="v">{n(w.shipsLost)}</div><div className="k">{t('naves perdidas', 'ships lost')}</div></div>
        <div className="stat"><div className="v">{n(w.spent)}</div><div className="k">{t('aUEC gastados', 'aUEC spent')}</div></div>
        <div className="stat good"><div className="v">{n(w.rewards)}</div><div className="k">{t('aUEC en recompensas', 'aUEC in rewards')}</div></div>
      </div>
      <div className="grid g3 wrap-lists">
        <div>
          <h3 className="brief-h">{t('Tus naves favoritas', 'Your favorite ships')}</h3>
          {list(
            w.ships.map((s) => ({ name: s.name, v: t(`${s.uses} usos`, `${s.uses} ${s.uses === 1 ? 'use' : 'uses'}`) })),
            t('Sin naves propias registradas este año.', 'No ships of your own recorded this year.'),
          )}
          <h3 className="brief-h">{t('Tus sitios', 'Your places')}</h3>
          {list(w.places.map((p) => ({ name: p.name, v: `${p.visits}×` })), t('Sin viajes registrados.', 'No trips recorded.'))}
        </div>
        <div>
          <h3 className="brief-h">{t('Con quién más has jugado', "Who you've played with most")}</h3>
          {list(
            w.companions.map((c) => ({ name: c.name, v: t(`${c.sessions} sesiones`, `${c.sessions} ${c.sessions === 1 ? 'session' : 'sessions'}`) })),
            t('Este año has ido por libre.', "You've flown solo this year."),
          )}
          <h3 className="brief-h">{t('Tu némesis', 'Your nemesis')}</h3>
          {list(
            w.nemeses.map((c) => ({ name: c.name, v: t(`te eliminó ${c.times}×`, `killed you ${c.times}×`) })),
            t('Nadie te ha eliminado. Bien jugado.', 'Nobody has killed you. Well played.'),
          )}
        </div>
        <div>
          <h3 className="brief-h">{t('Contratos por tipo', 'Contracts by type')}</h3>
          {list(w.missions.topKinds.map((k) => ({ name: k.label, v: `${k.completed}` })), t('Sin contratos completados.', 'No contracts completed.'))}
          <h3 className="brief-h">{t('Récords', 'Records')}</h3>
          {w.longest && <div className="kv"><span>{t('Sesión más larga', 'Longest session')}</span><span className="faint">{hm(w.longest.minutes)} · {day(w.longest.startedAt)}</span></div>}
          {w.busiestDay && <div className="kv"><span>{t('Día con más juego', 'Busiest day')}</span><span className="faint">{hm(w.busiestDay.minutes)} · {day(w.busiestDay.day)}</span></div>}
        </div>
      </div>
    </section>
  );
}

export function Archivo() {
  const { t, lang } = useLang();
  const [picked, setPicked] = useState<number | null>(null);
  const [o, setO] = useState<Overview | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    getJson<Overview>('/api/overview').then(setO);
    getJson<SessionSummary[]>('/api/sessions?limit=60').then(setSessions);
  }, []);

  if (!o) return null;

  const tiles: [number, string][] = [
    [o.hoursPlayed, t('Horas registradas', 'Hours recorded')],
    [o.sessions, t('Sesiones', 'Sessions')],
    [o.missionsCompleted, t('Contratos completados', 'Contracts completed')],
    [o.vehiclesDestroyed, t('Naves destruidas', 'Ships destroyed')],
    [o.kills, t('Bajas (era 2025)', 'Kills (2025 era)')],
    [o.deaths, t('Muertes', 'Deaths')],
    [o.qtJumps, t('Saltos cuánticos', 'Quantum jumps')],
    [o.playersMet, t('Jugadores con los que te has cruzado', "Players you've crossed paths with")],
  ];

  return (
    <div className="stack">
      <SessionSummaryCard key={picked ?? 'last'} id={picked ?? 'last'} />
      <YearInReview />
      <div className="panel">
        <div className="label">
          <Archive size={14} aria-hidden /> {t('Tu historial', 'Your history')}
          {o.firstSession && (lang === 'es' ? ` desde el ${day(o.firstSession).toLowerCase()}` : ` since ${day(o.firstSession)}`)}
        </div>
        <div className="grid g4">
          {tiles.map(([v, k]) => (
            <div className="stat" key={k}>
              <div className="v">{n(v)}</div>
              <div className="k">{k}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel sessions">
        <div className="label">{t('Últimas sesiones', 'Recent sessions')}</div>
        <div className="row head">
          <span>{t('Fecha', 'Date')}</span>
          <span>{t('Duración', 'Duration')}</span>
          <span>Build</span>
          <span>{t('Eventos', 'Events')}</span>
        </div>
        {sessions.map((s) => (
          <div className={`row session-row ${picked === s.id ? 'on' : ''}`} key={s.id} role="button" tabIndex={0}
            onClick={() => (setPicked(s.id), window.scrollTo({ top: 0 }), document.querySelector('.view')?.scrollTo({ top: 0, behavior: 'smooth' }))}
            onKeyDown={(e) => e.key === 'Enter' && setPicked(s.id)}>
            <span>{s.started_at ? day(s.started_at) : s.key}</span>
            <span>{s.started_at ? duration(s.started_at, s.ended_at) : '—'}</span>
            <span className="faint">{s.build}</span>
            <span>{n(s.event_count)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
