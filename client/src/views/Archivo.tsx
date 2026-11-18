import { Archive } from 'lucide-react';
import { useEffect, useState } from 'react';
import { day, duration, n } from '../format.ts';
import { getJson } from '../live.tsx';
import type { Overview, SessionSummary } from '../types.ts';

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
