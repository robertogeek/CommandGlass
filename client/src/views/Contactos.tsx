import { ArrowLeft, Rocket, ShieldAlert, ShieldCheck, Shield, Swords, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EventRow } from '../components/EventRow.tsx';
import { ago, day, duration, n, sameDay, shortDay } from '../format.ts';
import { getJson, mergeEvents, postJson, useLive } from '../live.tsx';
import type { Contact, ContactDetail, GameEvent, Mark } from '../types.ts';

type Filter = 'session' | 'all' | 'mates' | 'rivals' | 'met';
type Sort = 'recent' | 'often' | 'sessions';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'session', label: 'Esta sesión' },
  { id: 'all', label: 'Todos' },
  { id: 'mates', label: 'Compañeros' },
  { id: 'rivals', label: 'Rivales' },
  { id: 'met', label: 'Encuentros' },
];

const MARKS: { id: Mark; label: string; icon: typeof Shield }[] = [
  { id: 'ally', label: 'Aliado', icon: ShieldCheck },
  { id: 'neutral', label: 'Neutral', icon: Shield },
  { id: 'hostile', label: 'Hostil', icon: ShieldAlert },
];

const PAGE = 150;
const EVENTS_PAGE = 60;

const isMate = (c: Contact) => c.counts.party + c.counts.crew + c.counts.friend > 0;
const isRival = (c: Contact) => c.counts.nemesis + c.counts.victim > 0;
const isHere = (c: Contact) => c.inSession > 0 || c.presence !== null;

interface Tag {
  label: string;
  tone: '' | 'green' | 'amber' | 'red' | 'violet' | 'muted';
}

function tagsFor(c: Contact, live: boolean): Tag[] {
  const t: Tag[] = [];
  if (live && c.presence?.aboard) t.push({ label: 'A bordo contigo', tone: 'green' });
  if (live && c.presence?.inParty) t.push({ label: c.presence.online ? 'En tu grupo' : 'Grupo · desconectado', tone: c.presence.online ? 'green' : 'muted' });
  if (c.counts.nemesis) t.push({ label: `Te ha eliminado ×${c.counts.nemesis}`, tone: 'red' });
  if (c.counts.victim) t.push({ label: `Eliminado por ti ×${c.counts.victim}`, tone: 'amber' });
  if (c.counts.friend) t.push({ label: 'Amigo', tone: 'violet' });
  if (c.counts.groupSessions) t.push({ label: `En grupo · ${c.counts.groupSessions} ${c.counts.groupSessions === 1 ? 'sesión' : 'sesiones'}`, tone: '' });
  if (c.counts.combat) t.push({ label: 'Visto en combate', tone: 'muted' });
  if (!t.length && c.counts.nearby) t.push({ label: 'Visto cerca', tone: 'muted' });
  return t;
}

/** Nombre seleccionado en el hash: "#contactos/Nombre". */
function useSelected(): [string | null, (name: string | null) => void] {
  const read = () => {
    const [, rest] = window.location.hash.replace('#', '').split(/\/(.*)/);
    return rest ? decodeURIComponent(rest) : null;
  };
  const [name, setName] = useState(read);
  useEffect(() => {
    const on = () => setName(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [name, (next) => (window.location.hash = next ? `contactos/${encodeURIComponent(next)}` : 'contactos')];
}

export function Contactos() {
  const { snapshot, liveEvents } = useLive();
  const live = Boolean(snapshot?.status.active && !snapshot.state?.endedAt);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [sort, setSort] = useState<Sort>('recent');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [selected, select] = useSelected();
  const lastLiveId = useRef(liveEvents[0]?.id ?? 0);

  const load = () => getJson<Contact[]>('/api/contacts').then(setContacts);
  useEffect(() => {
    load();
  }, []);

  // Cuando llega un evento en directo que menciona a alguien, se refresca la lista (agrupando ráfagas).
  useEffect(() => {
    const newest = liveEvents[0]?.id ?? 0;
    const fresh = liveEvents.filter((e) => e.id > lastLiveId.current);
    lastLiveId.current = Math.max(lastLiveId.current, newest);
    if (!fresh.some((e) => e.mentions?.length || e.category === 'social')) return;
    const t = setTimeout(load, 1500);
    return () => clearTimeout(t);
  }, [liveEvents]);

  const sessionCount = useMemo(() => contacts?.filter(isHere).length ?? 0, [contacts]);
  // Por defecto: los de esta sesión si hay alguno; si no, todos.
  const activeFilter: Filter = filter ?? (sessionCount > 0 ? 'session' : 'all');

  const shown = useMemo(() => {
    if (!contacts) return [];
    const q = query.trim().toLowerCase();
    const list = contacts.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !(c.note ?? '').toLowerCase().includes(q)) return false;
      switch (activeFilter) {
        case 'session': return isHere(c);
        case 'mates': return isMate(c);
        case 'rivals': return isRival(c);
        case 'met': return !isMate(c) && !isRival(c);
        default: return true;
      }
    });
    const by: Record<Sort, (a: Contact, b: Contact) => number> = {
      recent: (a, b) => b.lastSeen.localeCompare(a.lastSeen),
      often: (a, b) => b.events - a.events,
      sessions: (a, b) => b.sessions - a.sessions || b.events - a.events,
    };
    const presenceRank = (c: Contact) => (c.presence?.aboard ? 2 : c.presence?.online ? 1 : 0);
    return list.sort((a, b) =>
      activeFilter === 'session' ? presenceRank(b) - presenceRank(a) || b.inSession - a.inSession : by[sort](a, b),
    );
  }, [contacts, query, activeFilter, sort]);

  useEffect(() => setLimit(PAGE), [query, activeFilter, sort]);

  const counts: Record<Filter, number> = useMemo(() => {
    const all = contacts ?? [];
    return {
      session: sessionCount,
      all: all.length,
      mates: all.filter(isMate).length,
      rivals: all.filter(isRival).length,
      met: all.filter((c) => !isMate(c) && !isRival(c)).length,
    };
  }, [contacts, sessionCount]);

  const onSaved = (name: string, mark: Mark | null, note: string | null) =>
    setContacts((prev) => prev?.map((c) => (c.name === name ? { ...c, mark, note } : c)) ?? prev);

  return (
    <div className={`contacts ${selected ? 'has-selection' : ''}`}>
      <section className="contacts-list" aria-label="Lista de contactos">
        <div className="toolbar">
          <input
            className="search"
            type="search"
            placeholder="Buscar jugador o nota…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar contactos"
          />
          <select
            className="select"
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Ordenar"
            disabled={activeFilter === 'session'}
          >
            <option value="recent">Recientes</option>
            <option value="often">Más encuentros</option>
            <option value="sessions">Más sesiones</option>
          </select>
        </div>
        <div className="toolbar">
          {FILTERS.map((f) => (
            <button key={f.id} className={`chip ${activeFilter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label} <span className="chip-n">{n(counts[f.id])}</span>
            </button>
          ))}
        </div>

        <div className="panel contact-rows">
          {contacts === null && <div className="empty">Cargando contactos…</div>}
          {contacts !== null && shown.length === 0 && (
            <div className="empty">
              {activeFilter === 'session'
                ? 'Aún no te has cruzado con nadie en esta sesión. Aquí aparecerán tu grupo, tu tripulación y quien te dispare.'
                : 'Nadie coincide con la búsqueda. Prueba con otro nombre o con otro filtro.'}
            </div>
          )}
          {shown.slice(0, limit).map((c) => (
            <ContactRow key={c.name} c={c} live={live} on={c.name === selected} onClick={() => select(c.name)} />
          ))}
          {shown.length > limit && (
            <button className="more" onClick={() => setLimit((l) => l + PAGE)}>
              Mostrar más ({n(shown.length - limit)})
            </button>
          )}
        </div>
      </section>

      <section className="contacts-detail" aria-label="Ficha del contacto">
        {selected ? (
          <ContactCard key={selected} name={selected} live={live} onBack={() => select(null)} onSaved={onSaved} />
        ) : (
          <div className="contacts-placeholder">
            <Users size={40} strokeWidth={1.4} className="accent" aria-hidden />
            <p>Elige un jugador para ver vuestro historial: sesiones juntos, naves compartidas y combates.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function ContactRow({ c, live, on, onClick }: { c: Contact; live: boolean; on: boolean; onClick: () => void }) {
  const tags = tagsFor(c, live).slice(0, 3);
  const dot = live && c.presence ? (c.presence.aboard || c.presence.online ? 'live' : '') : null;
  return (
    <button className={`contact-row ${on ? 'on' : ''} ${c.mark ? `mark-${c.mark}` : ''}`} onClick={onClick} aria-current={on ? 'true' : undefined}>
      <span className="contact-name">
        {dot !== null && <span className={`dot ${dot}`} aria-hidden />}
        <span className="nm">{c.name}</span>
        {c.mark === 'hostile' && <ShieldAlert size={15} className="c-combat" aria-label="Hostil" />}
        {c.mark === 'ally' && <ShieldCheck size={15} className="c-economy" aria-label="Aliado" />}
      </span>
      <span className="contact-meta">
        {c.sessions} {c.sessions === 1 ? 'sesión' : 'sesiones'} · {ago(c.lastSeen)}
      </span>
      {tags.length > 0 && (
        <span className="contact-tags">
          {tags.map((t) => (
            <span key={t.label} className={`badge ${t.tone}`}>{t.label}</span>
          ))}
        </span>
      )}
    </button>
  );
}

function ContactCard({
  name,
  live,
  onBack,
  onSaved,
}: {
  name: string;
  live: boolean;
  onBack: () => void;
  onSaved: (name: string, mark: Mark | null, note: string | null) => void;
}) {
  const { liveEvents } = useLive();
  const [detail, setDetail] = useState<ContactDetail | null | 'missing'>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getJson<ContactDetail>(`/api/contacts/${encodeURIComponent(name)}`)
      .then(setDetail)
      .catch(() => setDetail('missing'));
    loadEvents();
  }, [name]);

  const loadEvents = (before?: number) => {
    const p = new URLSearchParams({ mention: name, limit: String(EVENTS_PAGE) });
    if (before) p.set('before', String(before));
    setLoading(true);
    getJson<GameEvent[]>(`/api/events?${p}`).then((evs) => {
      setEvents((prev) => (before ? mergeEvents(prev, evs) : evs));
      setDone(evs.length < EVENTS_PAGE);
      setLoading(false);
    });
  };

  const lower = name.toLowerCase();
  const timeline = useMemo(
    () => mergeEvents(liveEvents.filter((e) => e.mentions?.some((m) => m.name.toLowerCase() === lower)), events),
    [liveEvents, events, lower],
  );

  if (detail === 'missing') {
    return (
      <div className="panel">
        <BackButton onBack={onBack} />
        <div className="empty">No hay registros de {name}. Puede que el nombre haya cambiado o que el historial se haya reprocesado.</div>
      </div>
    );
  }
  if (!detail) return <div className="panel"><div className="empty">Cargando ficha…</div></div>;

  const c = detail;
  const tags = tagsFor(c, live);

  return (
    <div className="stack">
      <div className={`panel ${c.mark === 'hostile' ? 'hostile' : ''}`}>
        <BackButton onBack={onBack} />
        <div className="label"><Users size={14} aria-hidden /> Contacto</div>
        <div className="big">{c.name}</div>
        <div className="sub">
          Primera vez {shortDay(c.firstSeen)} · última {ago(c.lastSeen)}
          {c.geid && <span className="faint"> · GEID {c.geid}</span>}
        </div>
        {tags.length > 0 && (
          <div className="contact-tags" style={{ marginTop: 10 }}>
            {tags.map((t) => <span key={t.label} className={`badge ${t.tone}`}>{t.label}</span>)}
          </div>
        )}
        <NoteEditor
          contact={c}
          onSaved={(mark, note) => {
            setDetail({ ...c, mark, note });
            onSaved(c.name, mark, note);
          }}
        />
      </div>

      <div className="grid g2">
        <div className="panel">
          <div className="label"><Users size={14} aria-hidden /> Juntos</div>
          <div className="stat-grid">
            <div className="stat"><div className="v">{n(c.sessions)}</div><div className="k">sesiones coincidiendo</div></div>
            <div className="stat"><div className="v">{n(c.counts.groupSessions)}</div><div className="k">en grupo o nave</div></div>
            <div className="stat"><div className="v">{n(c.events)}</div><div className="k">encuentros</div></div>
          </div>
        </div>
        <div className={`panel ${c.counts.nemesis ? 'warn' : ''}`}>
          <div className="label"><Swords size={14} aria-hidden /> Combate</div>
          <div className="stat-grid">
            <div className={`stat ${c.counts.nemesis ? 'bad' : ''}`}><div className="v">{n(c.counts.nemesis)}</div><div className="k">te ha eliminado</div></div>
            <div className={`stat ${c.counts.victim ? 'good' : ''}`}><div className="v">{n(c.counts.victim)}</div><div className="k">eliminado por ti</div></div>
            <div className="stat"><div className="v">{n(c.counts.combat)}</div><div className="k">combates ajenos</div></div>
          </div>
        </div>
      </div>

      {c.ships.length > 0 && (
        <div className="panel">
          <div className="label"><Rocket size={14} aria-hidden /> Naves compartidas</div>
          {c.ships.map((s) => (
            <div key={`${s.own}-${s.ship}-${s.owner}`} className="kv">
              <span>{s.own ? `Tu ${s.ship}` : `${s.ship} de ${s.owner}`}</span>
              <span className="faint">{s.own ? 'subió a bordo' : 'subiste tú'} ×{s.times} · {ago(s.last)}</span>
            </div>
          ))}
        </div>
      )}

      {c.recentSessions.length > 0 && (
        <div className="panel">
          <div className="label">Últimas sesiones en las que coincidisteis</div>
          {c.recentSessions.map((s) => (
            <div key={s.id} className="kv">
              <span>{s.startedAt ? day(s.startedAt) : `Sesión ${s.id}`}</span>
              <span className="faint">
                {s.startedAt ? duration(s.startedAt, s.endedAt) : ''} · {s.events} {s.events === 1 ? 'evento' : 'eventos'}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <div className="label">Historial con {c.name}</div>
        {timeline.length === 0 && !loading && <div className="empty">Sin eventos.</div>}
        {timeline.map((e, i) => {
          const prev = timeline[i - 1];
          return (
            <div key={e.id}>
              {(!prev || !sameDay(prev.ts, e.ts)) && <div className="day-head in-panel">{day(e.ts)}</div>}
              <EventRow e={e} />
            </div>
          );
        })}
        {!done && timeline.length > 0 && (
          <button className="more" onClick={() => loadEvents(events[events.length - 1]?.id)} disabled={loading}>
            {loading ? 'Cargando…' : 'Cargar más'}
          </button>
        )}
      </div>
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button className="back" onClick={onBack}>
      <ArrowLeft size={18} aria-hidden /> Contactos
    </button>
  );
}

function NoteEditor({ contact, onSaved }: { contact: Contact; onSaved: (mark: Mark | null, note: string | null) => void }) {
  const [mark, setMark] = useState<Mark | null>(contact.mark);
  const [note, setNote] = useState(contact.note ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const save = (nextMark: Mark | null, nextNote: string) => {
    setStatus('saving');
    postJson<{ mark: Mark | null; note: string | null }>(`/api/contacts/${encodeURIComponent(contact.name)}/note`, {
      mark: nextMark,
      note: nextNote,
    })
      .then((r) => {
        setStatus('saved');
        onSaved(r.mark, r.note);
      })
      .catch(() => setStatus('error'));
  };

  const pickMark = (m: Mark) => {
    const next = mark === m ? null : m;
    setMark(next);
    save(next, note);
  };

  return (
    <div className="note-editor">
      <div className="segmented" role="group" aria-label="Marca">
        {MARKS.map((m) => (
          <button key={m.id} className={`seg ${mark === m.id ? `on ${m.id}` : ''}`} onClick={() => pickMark(m.id)} aria-pressed={mark === m.id}>
            <m.icon size={16} aria-hidden /> {m.label}
          </button>
        ))}
      </div>
      <label className="note-label" htmlFor="contact-note">Tu nota</label>
      <textarea
        id="contact-note"
        className="note"
        rows={2}
        placeholder="Por ejemplo: pirata en Pyro, vuela una Corsair"
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setStatus('idle');
        }}
        onBlur={() => {
          if (note.trim() !== (contact.note ?? '')) save(mark, note);
        }}
        maxLength={2000}
      />
      <div className="note-status" aria-live="polite">
        {status === 'saving' && 'Guardando…'}
        {status === 'saved' && 'Guardado'}
        {status === 'error' && 'No se ha podido guardar. Comprueba la conexión con el PC y vuelve a intentarlo.'}
      </div>
    </div>
  );
}
