import { Archive, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { day, duration, n } from '../format.ts';
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
    <section className="panel wrapped" aria-label={`Tu ${w.year} en Star Citizen`}>
      <div className="toolbar">
        <div className="label wrap-title"><Sparkles size={14} aria-hidden /> Tu {w.year} en el verso</div>
        {w.years.map((y) => (
          <button key={y} className={`chip ${y === year ? 'on' : ''}`} onClick={() => setYear(y)}>{y}</button>
        ))}
      </div>
      <div className="grid g4">
        <div className="stat"><div className="v">{n(w.hours)}</div><div className="k">horas en {n(w.sessions)} sesiones</div></div>
        <div className="stat good"><div className="v">{n(w.missions.completed)}</div><div className="k">contratos completados</div></div>
        <div className="stat"><div className="v">{n(w.qtJumps)}</div><div className="k">saltos cuánticos</div></div>
        <div className="stat"><div className="v">{n(w.vehiclesDestroyed)}</div><div className="k">naves destruidas</div></div>
        <div className="stat bad"><div className="v">{n(w.deaths)}</div><div className="k">muertes</div></div>
        <div className="stat bad"><div className="v">{n(w.shipsLost)}</div><div className="k">naves perdidas</div></div>
        <div className="stat"><div className="v">{n(w.spent)}</div><div className="k">aUEC gastados</div></div>
        <div className="stat good"><div className="v">{n(w.rewards)}</div><div className="k">aUEC en recompensas</div></div>
      </div>
      <div className="grid g3 wrap-lists">
        <div>
          <h3 className="brief-h">Tus naves favoritas</h3>
          {list(w.ships.map((s) => ({ name: s.name, v: `${s.uses} usos` })), 'Sin naves propias registradas este año.')}
          <h3 className="brief-h">Tus sitios</h3>
          {list(w.places.map((p) => ({ name: p.name, v: `${p.visits}×` })), 'Sin viajes registrados.')}
        </div>
        <div>
          <h3 className="brief-h">Con quién más has jugado</h3>
          {list(w.companions.map((c) => ({ name: c.name, v: `${c.sessions} sesiones` })), 'Este año has ido por libre.')}
          <h3 className="brief-h">Tu némesis</h3>
          {list(w.nemeses.map((c) => ({ name: c.name, v: `te eliminó ${c.times}×` })), 'Nadie te ha eliminado. Bien jugado.')}
        </div>
        <div>
          <h3 className="brief-h">Contratos por tipo</h3>
          {list(w.missions.topKinds.map((k) => ({ name: k.label, v: `${k.completed}` })), 'Sin contratos completados.')}
          <h3 className="brief-h">Récords</h3>
          {w.longest && <div className="kv"><span>Sesión más larga</span><span className="faint">{hm(w.longest.minutes)} · {day(w.longest.startedAt)}</span></div>}
          {w.busiestDay && <div className="kv"><span>Día con más juego</span><span className="faint">{hm(w.busiestDay.minutes)} · {day(w.busiestDay.day)}</span></div>}
        </div>
      </div>
    </section>
  );
}

export function Archivo() {
  const [o, setO] = useState<Overview | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    getJson<Overview>('/api/overview').then(setO);
    getJson<SessionSummary[]>('/api/sessions?limit=60').then(setSessions);
  }, []);

  if (!o) return null;

  const tiles: [number, string][] = [
    [o.hoursPlayed, 'Horas registradas'],
    [o.sessions, 'Sesiones'],
    [o.missionsCompleted, 'Contratos completados'],
    [o.vehiclesDestroyed, 'Naves destruidas'],
    [o.kills, 'Bajas (era 2025)'],
    [o.deaths, 'Muertes'],
    [o.qtJumps, 'Saltos cuánticos'],
    [o.playersMet, 'Jugadores con los que te has cruzado'],
  ];

  return (
    <div className="stack">
      <YearInReview />
      <div className="panel">
        <div className="label"><Archive size={14} aria-hidden /> Tu historial{o.firstSession && ` desde el ${day(o.firstSession).toLowerCase()}`}</div>
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
        <div className="label">Últimas sesiones</div>
        <div className="row head">
          <span>Fecha</span>
          <span>Duración</span>
          <span>Build</span>
          <span>Eventos</span>
        </div>
        {sessions.map((s) => (
          <div className="row" key={s.id}>
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
