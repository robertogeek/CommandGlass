import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY, EventRow } from '../components/EventRow.tsx';
import { day, duration, sameDay } from '../format.ts';
import { getJson, mergeEvents, useLive } from '../live.tsx';
import type { Category, GameEvent, SessionSummary } from '../types.ts';

const PAGE = 120;

export function Bitacora() {
  const { snapshot, liveEvents } = useLive();
  const currentSession = snapshot?.status.sessionId ?? null;
  const [session, setSession] = useState<string>('current');
  const [cats, setCats] = useState<Category[]>([]);
  const [details, setDetails] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const baseline = useRef(0);

  useEffect(() => {
    getJson<SessionSummary[]>('/api/sessions?limit=200').then(setSessions);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (session !== 'all') p.set('session', session);
    if (!details) p.set('min', '1');
    if (cats.length) p.set('cat', cats.join(','));
    if (debounced) p.set('q', debounced);
    p.set('limit', String(PAGE));
    return p;
  }, [session, details, cats, debounced]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getJson<GameEvent[]>(`/api/events?${params}`).then((evs) => {
      if (cancelled) return;
      setEvents(evs);
      setDone(evs.length < PAGE);
      baseline.current = evs[0]?.id ?? 0;
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [params]);

  const loadMore = () => {
    const last = events[events.length - 1];
    if (!last) return;
    const p = new URLSearchParams(params);
    p.set('before', String(last.id));
    setLoading(true);
    getJson<GameEvent[]>(`/api/events?${p}`).then((evs) => {
      setEvents((prev) => mergeEvents(prev, evs));
      setDone(evs.length < PAGE);
      setLoading(false);
    });
  };

  // Eventos en directo que encajan con los filtros actuales.
  const shown = useMemo(() => {
    const target = session === 'current' ? currentSession : Number(session);
    const live = liveEvents.filter(
      (e) =>
        (session === 'all' || e.sessionId === target) &&
        (details || e.importance >= 1) &&
        (!cats.length || cats.includes(e.category)) &&
        (!debounced || e.summary.toLowerCase().includes(debounced.toLowerCase())),
    );
    return mergeEvents(live, events);
  }, [liveEvents, events, session, currentSession, details, cats, debounced]);

  const toggleCat = (c: Category) => setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  return (
    <div>
      <div className="toolbar">
        <select className="select" value={session} onChange={(e) => setSession(e.target.value)} aria-label="Sesión">
          <option value="current">Esta sesión</option>
          <option value="all">Todo el historial</option>
          {sessions.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.started_at ? `${day(s.started_at)} · ${duration(s.started_at, s.ended_at)}` : s.key}
            </option>
          ))}
        </select>
        <input
          className="search"
          type="search"
          placeholder="Buscar: Levski, Constellation, nombre de jugador…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar en la bitácora"
        />
      </div>
      <div className="toolbar">
        {(Object.keys(CATEGORY) as Category[]).map((c) => {
          const Icon = CATEGORY[c].icon;
          return (
            <button key={c} className={`chip ${cats.includes(c) ? 'on' : ''}`} onClick={() => toggleCat(c)}>
              <Icon size={15} className={`c-${c}`} aria-hidden /> {CATEGORY[c].label}
            </button>
          );
        })}
        <button className={`chip ${details ? 'on' : ''}`} onClick={() => setDetails((d) => !d)}>
          {details ? 'Ocultar detalles' : 'Ver detalles'}
        </button>
      </div>

      <div className="panel">
        {shown.length === 0 && !loading && (
          <div className="empty">No hay eventos con estos filtros. Prueba a quitar alguno o a buscar en todo el historial.</div>
        )}
        {shown.map((e, i) => {
          const prev = shown[i - 1];
          const newDay = !prev || !sameDay(prev.ts, e.ts);
          return (
            <div key={e.id}>
              {newDay && <div className="day-head">{day(e.ts)}</div>}
              <EventRow e={e} fresh={e.id > baseline.current && baseline.current > 0} />
            </div>
          );
        })}
      </div>

      {!done && shown.length > 0 && (
        <button className="more" onClick={loadMore} disabled={loading}>
          {loading ? 'Cargando…' : 'Cargar más'}
        </button>
      )}
    </div>
  );
}
