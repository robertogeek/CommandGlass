import { CheckCircle2, ChevronDown, ChevronRight, Circle, CircleDot, ClipboardList, Crosshair, History, Lightbulb, Package, Users, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ago, day, duration, hhmm, n } from '../format.ts';
import { getJson, useLive } from '../live.tsx';
import { useLang } from '../lang.tsx';
import { MISSION_KIND } from '../terms.ts';
import type { Briefing, Mission, MissionIntel, MissionKind, MissionsResponse, Outcome, WikiInfo } from '../types.ts';

/**
 * Contratos: briefing de lo que tienes en curso, cómo te va por tipo y todo tu historial.
 * El briefing mezcla una guía por tipo de contrato con los pasos reales de la última vez que hiciste ese mismo contrato.
 */

const OUTCOME: Record<Outcome, { label: string; tone: string }> = {
  completed: { label: 'Completado', tone: 'green' },
  failed: { label: 'Fallido', tone: 'red' },
  abandoned: { label: 'Abandonado', tone: 'amber' },
  open: { label: 'Sin cerrar', tone: 'muted' },
};

const PAGE = 60;

export function Contratos() {
  const { t: tr } = useLang();
  const { snapshot, liveEvents } = useLive();
  const [data, setData] = useState<MissionsResponse | null>(null);
  const [kind, setKind] = useState<MissionKind | 'all'>('all');
  const [outcome, setOutcome] = useState<Outcome | 'all'>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);

  const load = () => getJson<MissionsResponse>('/api/missions').then(setData).catch(() => setData(null));
  useEffect(() => {
    load();
  }, []);
  // Un aviso de contrato en directo refresca la lista (y el briefing).
  const lastMissionEvent = liveEvents.find((e) => e.category === 'mission')?.id ?? 0;
  useEffect(() => {
    if (!lastMissionEvent) return;
    const t = setTimeout(load, 1200);
    return () => clearTimeout(t);
  }, [lastMissionEvent]);

  const activeIds = useMemo(() => new Set(snapshot?.state?.missions.map((m) => m.id) ?? []), [snapshot]);
  const live = Boolean(snapshot?.status.active && !snapshot.state?.endedAt);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.missions ?? []).filter(
      (m) =>
        (kind === 'all' || m.kind === kind) &&
        (outcome === 'all' || m.outcome === outcome) &&
        (!q || (m.title ?? '').toLowerCase().includes(q) || m.objectives.some((o) => o.text.toLowerCase().includes(q))),
    );
  }, [data, kind, outcome, query]);
  useEffect(() => setLimit(PAGE), [kind, outcome, query]);

  if (!data) return <div className="panel"><div className="empty">Cargando contratos…</div></div>;

  const t = data.totals;
  const maxKind = Math.max(1, ...data.kinds.map((k) => k.total));

  return (
    <div className="stack">
      <section aria-label="En curso">
        {live && activeIds.size > 0 ? (
          <div className="stack">
            {[...activeIds].map((id) => <BriefingCard key={`${id}-${lastMissionEvent}`} id={id} />)}
          </div>
        ) : (
          <div className="panel">
            <div className="label"><ClipboardList size={14} aria-hidden /> En curso</div>
            <div className="empty">
              {live
                ? 'Sin contratos activos. Acepta uno en el mobiGlas del juego y aquí tendrás su briefing paso a paso.'
                : 'Cuando estés jugando, aquí verás el briefing de los contratos que tengas activos.'}
            </div>
          </div>
        )}
      </section>

      <div className="grid g2">
        <section className="panel" aria-label="Resumen">
          <div className="label"><History size={14} aria-hidden /> Tu historial</div>
          <div className="stat-grid">
            <div className="stat"><div className="v">{n(t.total)}</div><div className="k">aceptados</div></div>
            <div className="stat good"><div className="v">{n(t.completed)}</div><div className="k">completados</div></div>
            <div className="stat"><div className="v">{t.successRate === null ? '—' : `${t.successRate} %`}</div><div className="k">de éxito</div></div>
            <div className={`stat ${t.failed ? 'bad' : ''}`}><div className="v">{n(t.failed)}</div><div className="k">fallidos</div></div>
            <div className="stat"><div className="v">{n(t.abandoned)}</div><div className="k">abandonados</div></div>
            <div className="stat"><div className="v">{n(t.total - t.completed - t.failed - t.abandoned)}</div><div className="k">sin cerrar</div></div>
          </div>
          <p className="faint kind-note">«Sin cerrar»: el juego se cerró con el contrato a medias y el registro no dice cómo acabó.</p>
        </section>

        <section className="panel" aria-label="Por tipo">
          <div className="label"><Crosshair size={14} aria-hidden /> Por tipo</div>
          {data.kinds.map((k) => (
            <button key={k.kind} className={`kind-row ${kind === k.kind ? 'on' : ''}`} onClick={() => setKind(kind === k.kind ? 'all' : k.kind)}>
              <span className="kind-name">{tr(MISSION_KIND[k.kind] ?? { en: k.label, es: k.label })}</span>
              <span className="kind-bar" aria-hidden>
                <span className="ok" style={{ width: `${(100 * k.completed) / maxKind}%` }} />
                <span className="bad" style={{ width: `${(100 * k.failed) / maxKind}%` }} />
                <span className="ab" style={{ width: `${(100 * k.abandoned) / maxKind}%` }} />
                <span className="rest" style={{ width: `${(100 * (k.total - k.completed - k.failed - k.abandoned)) / maxKind}%` }} />
              </span>
              <span className="kind-num">
                {k.completed}/{k.total}
                {k.medianMinutes !== null && <span className="faint"> · {k.medianMinutes} min</span>}
              </span>
            </button>
          ))}
          <p className="faint kind-note">Verde: completados · rojo: fallidos · ámbar: abandonados. Los minutos son la mediana hasta completar. Toca un tipo para filtrar.</p>
        </section>
      </div>

      {data.factions.length > 0 && (
        <section className="panel" aria-label="Facciones">
          <div className="label"><Users size={14} aria-hidden /> Reputación estimada por facción</div>
          <div className="faction-grid">
            {data.factions.slice(0, 12).map((f) => (
              <div key={f.faction} className="faction">
                <div className="faction-name">{f.faction}</div>
                <div className="faction-rep">{f.reputation ? `+${n(f.reputation)}` : '—'}</div>
                <div className="faint faction-sub">{f.completed} de {f.total} contratos completados</div>
              </div>
            ))}
          </div>
          <p className="faint kind-note">
            Suma de la reputación que da cada contrato completado según la wiki, con los valores del parche actual. Es una estimación: el juego no escribe tu reputación real en el registro. Datos de{' '}
            <a href="https://api.star-citizen.wiki" target="_blank" rel="noreferrer">api.star-citizen.wiki</a>.
          </p>
        </section>
      )}

      <section aria-label="Historial">
        <div className="toolbar">
          <input className="search" type="search" placeholder="Buscar contrato u objetivo…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar contratos" />
          {(['all', 'completed', 'failed', 'abandoned', 'open'] as const).map((o) => (
            <button key={o} className={`chip ${outcome === o ? 'on' : ''}`} onClick={() => setOutcome(o)}>
              {o === 'all' ? 'Todos' : OUTCOME[o].label}
            </button>
          ))}
          {kind !== 'all' && (
            <button className="chip on" onClick={() => setKind('all')}>
              {tr(MISSION_KIND[kind] ?? { en: kind, es: kind })} ✕
            </button>
          )}
        </div>
        <div className="panel mission-list">
          {shown.length === 0 && <div className="empty">Ningún contrato coincide. Prueba a quitar algún filtro.</div>}
          {shown.slice(0, limit).map((m) => (
            <MissionRow key={m.id} m={m} active={activeIds.has(m.id)} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} />
          ))}
          {shown.length > limit && (
            <button className="more" onClick={() => setLimit((l) => l + PAGE)}>Mostrar más ({n(shown.length - limit)})</button>
          )}
        </div>
      </section>
    </div>
  );
}

function MissionRow({ m, active, open, onToggle }: { m: Mission & { faction?: string | null }; active: boolean; open: boolean; onToggle: () => void }) {
  const [brief, setBrief] = useState(false);
  const o = active ? { label: 'En curso', tone: '' } : OUTCOME[m.outcome];
  const took = m.acceptedAt && m.endedAt ? duration(m.acceptedAt, m.endedAt) : null;
  return (
    <div className={`mission-row ${open ? 'open' : ''}`}>
      <button className="mission-head" onClick={onToggle} aria-expanded={open}>
        {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        <span className="mission-title">{m.title ?? 'Contrato sin título'}</span>
        <span className={`badge ${o.tone}`}>{o.label}</span>
        <span className="faint mission-when">{m.acceptedAt ? `${ago(m.acceptedAt)} · ${hhmm(m.acceptedAt)}` : ''}{took ? ` · ${took}` : ''}</span>
      </button>
      {open && (
        <div className="mission-body">
          <div className="faint">{m.acceptedAt ? day(m.acceptedAt) : ''}{m.faction ? ` · ${m.faction}` : ''}{m.contract ? ` · ${m.contract}` : ''}</div>
          {m.objectives.length ? <Steps objectives={m.objectives} /> : <div className="empty">Sin objetivos registrados.</div>}
          <div>
            <button className="chip" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
              <ClipboardList size={15} aria-hidden /> {brief ? 'Ocultar briefing' : 'Ver briefing'}
            </button>
          </div>
          {brief && <BriefingCard id={m.id} />}
        </div>
      )}
    </div>
  );
}

function Steps({ objectives }: { objectives: Mission['objectives'] }) {
  return (
    <ol className="brief-steps">
      {objectives.map((o, i) => (
        <li key={i} className={o.state}>
          {o.state === 'done' ? <CheckCircle2 size={16} aria-label="Cumplido" /> : o.state === 'active' ? <CircleDot size={16} aria-label="En curso" /> : o.state === 'failed' ? <XCircle size={16} aria-label="Fallido" /> : <Circle size={16} aria-label="Retirado" />}
          <span>{o.text}</span>
        </li>
      ))}
    </ol>
  );
}

interface MissionDetail {
  mission: Mission;
  briefing: Briefing;
  intel: MissionIntel | null;
  wiki: WikiInfo;
}

function IntelBox({ intel, wiki }: { intel: MissionIntel; wiki: WikiInfo }) {
  const reward = intel.rewardMin ? `${n(intel.rewardMin)}${intel.rewardMax && intel.rewardMax > intel.rewardMin ? `–${n(intel.rewardMax)}` : ''} ${intel.currency === 'UEC' || !intel.currency ? 'aUEC' : intel.currency}` : null;
  const enemies = intel.enemies.max ? (intel.enemies.min && intel.enemies.min !== intel.enemies.max ? `${intel.enemies.min}–${intel.enemies.max}` : String(intel.enemies.max)) : null;
  return (
    <div className="intel">
      <div className="intel-grid">
        {intel.giver && <div><span className="k">Lo da</span><span className="v">{intel.giver}</span></div>}
        {intel.faction && intel.faction !== intel.giver && <div><span className="k">Facción</span><span className="v">{intel.faction}</span></div>}
        {intel.rankRequired && <div><span className="k">Rango necesario</span><span className="v">{intel.rankRequired}</span></div>}
        {reward && <div><span className="k">Recompensa</span><span className="v">{reward}</span></div>}
        {intel.systems.length > 0 && <div><span className="k">Sistema</span><span className="v">{intel.systems.join(', ')}</span></div>}
        {enemies && <div><span className="k">Enemigos</span><span className="v">{enemies}</span></div>}
        {intel.minutes && <div><span className="k">Tiempo límite</span><span className="v">{intel.minutes} min</span></div>}
      </div>
      {intel.reputation.length > 0 && (
        <div className="intel-rep">
          {intel.reputation.map((r) => (
            <span key={`${r.faction}-${r.scope}`} className="badge green">+{n(r.amount)} {r.faction}</span>
          ))}
        </div>
      )}
      <div className="intel-flags">
        {intel.illegal && <span className="badge red">Ilegal</span>}
        {intel.shareable && <span className="badge">Compartible con el grupo</span>}
        {intel.combat && <span className="badge amber">Con combate</span>}
      </div>
      <p className="faint intel-credit">
        Datos de <a href={intel.webUrl ?? 'https://star-citizen.wiki'} target="_blank" rel="noreferrer">api.star-citizen.wiki</a>
        {wiki.gameVersion ? ` · parche ${wiki.gameVersion.split('-')[0]}` : ''}
      </p>
    </div>
  );
}

function BriefingCard({ id }: { id: string }) {
  const { t } = useLang();
  const [d, setD] = useState<MissionDetail | null>(null);
  useEffect(() => {
    getJson<MissionDetail>(`/api/missions/${encodeURIComponent(id)}`).then(setD).catch(() => setD(null));
  }, [id]);
  if (!d) return <div className="panel"><div className="empty">Preparando briefing…</div></div>;
  const { mission: m, briefing: b, intel } = d;
  const current = [...m.objectives].reverse().find((o) => o.state === 'active');
  const doneTexts = new Set(m.objectives.filter((o) => o.state === 'done').map((o) => o.text));

  return (
    <article className="panel brief" aria-label={`Briefing: ${m.title ?? 'contrato'}`}>
      <div className="label"><ClipboardList size={14} aria-hidden /> Briefing · {t(MISSION_KIND[b.kind] ?? { en: b.label, es: b.label })}</div>
      <div className="big">{m.title ?? 'Contrato en curso'}</div>
      <div className="sub">
        {m.acceptedAt ? `Aceptado a las ${hhmm(m.acceptedAt)} · hace ${duration(m.acceptedAt)}` : ''}
        {b.record.total > 0 && ` · lo has hecho ${b.record.total} ${b.record.total === 1 ? 'vez' : 'veces'} (${b.record.completed} completado${b.record.completed === 1 ? '' : 's'})`}
      </div>

      {intel && <IntelBox intel={intel} wiki={d.wiki} />}

      {current && (
        <div className="brief-now">
          <CircleDot size={18} aria-hidden />
          <div>
            <div className="k">Ahora</div>
            <div className="v">{current.text}</div>
          </div>
        </div>
      )}

      <div className="grid g2 brief-grid">
        <div>
          <h3 className="brief-h">{b.previous ? `Pasos de la última vez (${ago(b.previous.at)})` : 'Cómo suele ir'}</h3>
          {b.previous ? (
            <ol className="brief-steps">
              {b.previous.steps.map((s, i) => {
                const done = doneTexts.has(s);
                const now = current?.text === s;
                return (
                  <li key={i} className={done ? 'done' : now ? 'active' : ''}>
                    {done ? <CheckCircle2 size={16} aria-label="Cumplido" /> : now ? <CircleDot size={16} aria-label="En curso" /> : <Circle size={16} aria-label="Pendiente" />}
                    <span>{s}</span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <ol className="brief-steps">
              {b.outline.map((s, i) => (
                <li key={i}><Circle size={16} aria-hidden /><span>{s}</span></li>
              ))}
            </ol>
          )}
          {m.objectives.length > 0 && (
            <>
              <h3 className="brief-h">Lo que llevas en esta</h3>
              <Steps objectives={m.objectives} />
            </>
          )}
        </div>
        <div>
          <h3 className="brief-h"><Package size={14} aria-hidden /> Qué llevar</h3>
          <ul className="brief-list">{b.gear.map((g) => <li key={g}>{g}</li>)}</ul>
          <h3 className="brief-h"><Lightbulb size={14} aria-hidden /> Consejos</h3>
          <ul className="brief-list">{b.tips.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      </div>
    </article>
  );
}
