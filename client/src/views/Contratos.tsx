import { CheckCircle2, ChevronDown, ChevronRight, Circle, CircleDot, ClipboardList, Crosshair, History, Lightbulb, Package, Users, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ago, day, duration, hhmm, n } from '../format.ts';
import { getJson, useLive } from '../live.tsx';
import { useLang } from '../lang.tsx';
import { MISSION_KIND } from '../terms.ts';
import type { Briefing, CommunityContract, Mission, MissionIntel, MissionKind, MissionsResponse, Outcome, WikiInfo } from '../types.ts';

/**
 * Contratos: briefing de lo que tienes en curso, cómo te va por tipo y todo tu historial.
 * El briefing mezcla una guía por tipo de contrato con los pasos reales de la última vez que hiciste ese mismo contrato.
 */

const OUTCOME: Record<Outcome, { label: { es: string; en: string }; tone: string }> = {
  completed: { label: { es: 'Completado', en: 'Completed' }, tone: 'green' },
  failed: { label: { es: 'Fallido', en: 'Failed' }, tone: 'red' },
  abandoned: { label: { es: 'Abandonado', en: 'Abandoned' }, tone: 'amber' },
  open: { label: { es: 'Sin cerrar', en: 'Unresolved' }, tone: 'muted' },
};

const PAGE = 60;

export function Contratos() {
  const { t } = useLang();
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
    const timer = setTimeout(load, 1200);
    return () => clearTimeout(timer);
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

  if (!data) return <div className="panel"><div className="empty">{t('Cargando contratos…', 'Loading contracts…')}</div></div>;

  const tot = data.totals;
  const maxKind = Math.max(1, ...data.kinds.map((k) => k.total));

  return (
    <div className="stack">
      <section aria-label={t('En curso', 'In progress')}>
        {live && activeIds.size > 0 ? (
          <div className="stack">
            {[...activeIds].map((id) => <BriefingCard key={`${id}-${lastMissionEvent}`} id={id} />)}
          </div>
        ) : (
          <div className="panel">
            <div className="label"><ClipboardList size={14} aria-hidden /> {t('En curso', 'In progress')}</div>
            <div className="empty">
              {live
                ? t(
                    'Sin contratos activos. Acepta uno en el mobiGlas del juego y aquí tendrás su briefing paso a paso.',
                    "No active contracts. Accept one in the in-game mobiGlas and you'll get its step-by-step briefing here.",
                  )
                : t(
                    'Cuando estés jugando, aquí verás el briefing de los contratos que tengas activos.',
                    "While you're playing, you'll see the briefing for your active contracts here.",
                  )}
            </div>
          </div>
        )}
      </section>

      <div className="grid g2">
        <section className="panel" aria-label={t('Resumen', 'Summary')}>
          <div className="label"><History size={14} aria-hidden /> {t('Tu historial', 'Your history')}</div>
          <div className="stat-grid">
            <div className="stat"><div className="v">{n(tot.total)}</div><div className="k">{t('aceptados', 'accepted')}</div></div>
            <div className="stat good"><div className="v">{n(tot.completed)}</div><div className="k">{t('completados', 'completed')}</div></div>
            <div className="stat"><div className="v">{tot.successRate === null ? '—' : `${tot.successRate} %`}</div><div className="k">{t('de éxito', 'success rate')}</div></div>
            <div className={`stat ${tot.failed ? 'bad' : ''}`}><div className="v">{n(tot.failed)}</div><div className="k">{t('fallidos', 'failed')}</div></div>
            <div className="stat"><div className="v">{n(tot.abandoned)}</div><div className="k">{t('abandonados', 'abandoned')}</div></div>
            <div className="stat"><div className="v">{n(tot.total - tot.completed - tot.failed - tot.abandoned)}</div><div className="k">{t('sin cerrar', 'unresolved')}</div></div>
          </div>
          <p className="faint kind-note">
            {t(
              '«Sin cerrar»: el juego se cerró con el contrato a medias y el registro no dice cómo acabó.',
              '“Unresolved”: the game closed mid-contract and the log doesn’t say how it ended.',
            )}
          </p>
        </section>

        <section className="panel" aria-label={t('Por tipo', 'By type')}>
          <div className="label"><Crosshair size={14} aria-hidden /> {t('Por tipo', 'By type')}</div>
          {data.kinds.map((k) => (
            <button key={k.kind} className={`kind-row ${kind === k.kind ? 'on' : ''}`} onClick={() => setKind(kind === k.kind ? 'all' : k.kind)}>
              <span className="kind-name">{t(MISSION_KIND[k.kind] ?? { en: k.label, es: k.label })}</span>
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
          <p className="faint kind-note">
            {t(
              'Verde: completados · rojo: fallidos · ámbar: abandonados. Los minutos son la mediana hasta completar. Toca un tipo para filtrar.',
              'Green: completed · red: failed · amber: abandoned. Minutes are the median time to complete. Tap a type to filter.',
            )}
          </p>
        </section>
      </div>

      {data.factions.length > 0 && (
        <section className="panel" aria-label={t('Facciones', 'Factions')}>
          <div className="label"><Users size={14} aria-hidden /> {t('Reputación estimada por facción', 'Estimated Reputation by faction')}</div>
          <div className="faction-grid">
            {data.factions.slice(0, 12).map((f) => (
              <div key={f.faction} className="faction">
                <div className="faction-name">{f.faction}</div>
                <div className="faction-rep">{f.reputation ? `+${n(f.reputation)}` : '—'}</div>
                <div className="faint faction-sub">
                  {t(
                    `${f.completed} de ${f.total} contratos completados`,
                    `${f.completed} of ${f.total} ${f.total === 1 ? 'contract' : 'contracts'} completed`,
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="faint kind-note">
            {t(
              'Suma de la reputación que da cada contrato completado según la wiki, con los valores del parche actual. Es una estimación: el juego no escribe tu reputación real en el registro. Datos de',
              'Sum of the Reputation each completed contract awards according to the wiki, using current-patch values. It’s an estimate: the game doesn’t write your actual Reputation to the log. Data from',
            )}{' '}
            <a href="https://api.star-citizen.wiki" target="_blank" rel="noreferrer">api.star-citizen.wiki</a>.
          </p>
        </section>
      )}

      <section aria-label={t('Historial', 'History')}>
        <div className="toolbar">
          <input
            className="search"
            type="search"
            placeholder={t('Buscar contrato u objetivo…', 'Search contract or objective…')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('Buscar contratos', 'Search contracts')}
          />
          {(['all', 'completed', 'failed', 'abandoned', 'open'] as const).map((o) => (
            <button key={o} className={`chip ${outcome === o ? 'on' : ''}`} onClick={() => setOutcome(o)}>
              {o === 'all' ? t('Todos', 'All') : t(OUTCOME[o].label)}
            </button>
          ))}
          {kind !== 'all' && (
            <button className="chip on" onClick={() => setKind('all')}>
              {t(MISSION_KIND[kind] ?? { en: kind, es: kind })} ✕
            </button>
          )}
        </div>
        <div className="panel mission-list">
          {shown.length === 0 && <div className="empty">{t('Ningún contrato coincide. Prueba a quitar algún filtro.', 'No contracts match. Try removing a filter.')}</div>}
          {shown.slice(0, limit).map((m) => (
            <MissionRow key={m.id} m={m} active={activeIds.has(m.id)} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} />
          ))}
          {shown.length > limit && (
            <button className="more" onClick={() => setLimit((l) => l + PAGE)}>{t('Mostrar más', 'Show more')} ({n(shown.length - limit)})</button>
          )}
        </div>
      </section>
    </div>
  );
}

function MissionRow({ m, active, open, onToggle }: { m: Mission & { faction?: string | null }; active: boolean; open: boolean; onToggle: () => void }) {
  const { t } = useLang();
  const [brief, setBrief] = useState(false);
  const o = active ? { label: t('En curso', 'In progress'), tone: '' } : { label: t(OUTCOME[m.outcome].label), tone: OUTCOME[m.outcome].tone };
  const took = m.acceptedAt && m.endedAt ? duration(m.acceptedAt, m.endedAt) : null;
  return (
    <div className={`mission-row ${open ? 'open' : ''}`}>
      <button className="mission-head" onClick={onToggle} aria-expanded={open}>
        {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        <span className="mission-title">{m.title ?? t('Contrato sin título', 'Untitled contract')}</span>
        <span className={`badge ${o.tone}`}>{o.label}</span>
        <span className="faint mission-when">{m.acceptedAt ? `${ago(m.acceptedAt)} · ${hhmm(m.acceptedAt)}` : ''}{took ? ` · ${took}` : ''}</span>
      </button>
      {open && (
        <div className="mission-body">
          <div className="faint">{m.acceptedAt ? day(m.acceptedAt) : ''}{m.faction ? ` · ${m.faction}` : ''}{m.contract ? ` · ${m.contract}` : ''}</div>
          {m.objectives.length ? <Steps objectives={m.objectives} /> : <div className="empty">{t('Sin objetivos registrados.', 'No objectives recorded.')}</div>}
          <div>
            <button className="chip" onClick={() => setBrief((b) => !b)} aria-expanded={brief}>
              <ClipboardList size={15} aria-hidden /> {brief ? t('Ocultar briefing', 'Hide briefing') : t('Ver briefing', 'Show briefing')}
            </button>
          </div>
          {brief && <BriefingCard id={m.id} />}
        </div>
      )}
    </div>
  );
}

function Steps({ objectives }: { objectives: Mission['objectives'] }) {
  const { t } = useLang();
  return (
    <ol className="brief-steps">
      {objectives.map((o, i) => (
        <li key={i} className={o.state}>
          {o.state === 'done' ? (
            <CheckCircle2 size={16} aria-label={t('Cumplido', 'Complete')} />
          ) : o.state === 'active' ? (
            <CircleDot size={16} aria-label={t('En curso', 'In progress')} />
          ) : o.state === 'failed' ? (
            <XCircle size={16} aria-label={t('Fallido', 'Failed')} />
          ) : (
            <Circle size={16} aria-label={t('Retirado', 'Withdrawn')} />
          )}
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
  community: CommunityContract | null;
  communityInfo: { source: string; channel: string; fetchedAt: string | null; count: number };
}

/** Datos extraídos del juego por StarStrings: reputación, espera, oleadas y blueprints. */
function CommunityBox({ c, info }: { c: CommunityContract; info: MissionDetail['communityInfo'] }) {
  const { t } = useLang();
  return (
    <div className="intel community">
      <div className="intel-grid">
        {c.reputation && <div><span className="k">{t('Reputación', 'Reputation')}</span><span className="v rep">+{c.reputation}</span></div>}
        {c.cooldown && <div><span className="k">Cooldown</span><span className="v">{c.cooldown}</span></div>}
        {c.hostiles.length > 0 && <div><span className="k">{t('Oleadas', 'Waves')}</span><span className="v">{c.hostiles.length}</span></div>}
        {c.blueprints.length > 0 && (
          <div>
            <span className="k">Blueprints</span>
            <span className="v">{c.blueprints.reduce((a, b) => a + b.items.length, 0)} {t('posibles', 'possible')}</span>
          </div>
        )}
      </div>
      {c.hostiles.length > 0 && (
        <>
          <h3 className="brief-h">{t('Naves que esperar', 'Ships to expect')}</h3>
          <ul className="brief-list">{c.hostiles.map((h) => <li key={h}>{h}</li>)}</ul>
        </>
      )}
      {c.blueprints.map((b, i) => (
        <div key={i}>
          <h3 className="brief-h">{t('Blueprints posibles', 'Possible Blueprints')}{b.rank ? ` · ${b.rank}` : ''}</h3>
          <div className="intel-rep">{b.items.map((it) => <span key={it} className="badge violet">{it}</span>)}</div>
        </div>
      ))}
      <p className="faint intel-credit">
        {t('Datos de', 'Data from')} <a href="https://github.com/MrKraken/StarStrings" target="_blank" rel="noreferrer">StarStrings</a> (MrKraken),{' '}
        {t('extraídos de los ficheros del juego', 'extracted from the game files')} · {info.channel}
      </p>
    </div>
  );
}

function IntelBox({ intel, wiki }: { intel: MissionIntel; wiki: WikiInfo }) {
  const { t } = useLang();
  const reward = intel.rewardMin ? `${n(intel.rewardMin)}${intel.rewardMax && intel.rewardMax > intel.rewardMin ? `–${n(intel.rewardMax)}` : ''} ${intel.currency === 'UEC' || !intel.currency ? 'aUEC' : intel.currency}` : null;
  const enemies = intel.enemies.max ? (intel.enemies.min && intel.enemies.min !== intel.enemies.max ? `${intel.enemies.min}–${intel.enemies.max}` : String(intel.enemies.max)) : null;
  return (
    <div className="intel">
      <div className="intel-grid">
        {intel.giver && <div><span className="k">{t('Lo da', 'Offered by')}</span><span className="v">{intel.giver}</span></div>}
        {intel.faction && intel.faction !== intel.giver && <div><span className="k">{t('Facción', 'Faction')}</span><span className="v">{intel.faction}</span></div>}
        {intel.rankRequired && <div><span className="k">{t('Rango necesario', 'Required rank')}</span><span className="v">{intel.rankRequired}</span></div>}
        {reward && <div><span className="k">{t('Recompensa', 'Reward')}</span><span className="v">{reward}</span></div>}
        {intel.systems.length > 0 && <div><span className="k">{t('Sistema', intel.systems.length === 1 ? 'System' : 'Systems')}</span><span className="v">{intel.systems.join(', ')}</span></div>}
        {enemies && <div><span className="k">{t('Enemigos', 'Enemies')}</span><span className="v">{enemies}</span></div>}
        {intel.minutes && <div><span className="k">{t('Tiempo límite', 'Time limit')}</span><span className="v">{intel.minutes} min</span></div>}
      </div>
      {intel.reputation.length > 0 && (
        <div className="intel-rep">
          {intel.reputation.map((r) => (
            <span key={`${r.faction}-${r.scope}`} className="badge green">+{n(r.amount)} {r.faction}</span>
          ))}
        </div>
      )}
      <div className="intel-flags">
        {intel.illegal && <span className="badge red">{t('Ilegal', 'Illegal')}</span>}
        {intel.shareable && <span className="badge">{t('Compartible con el grupo', 'Shareable with party')}</span>}
        {intel.combat && <span className="badge amber">{t('Con combate', 'Involves combat')}</span>}
      </div>
      <p className="faint intel-credit">
        {t('Datos de', 'Data from')} <a href={intel.webUrl ?? 'https://star-citizen.wiki'} target="_blank" rel="noreferrer">api.star-citizen.wiki</a>
        {wiki.gameVersion ? ` · ${t('parche', 'patch')} ${wiki.gameVersion.split('-')[0]}` : ''}
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
  if (!d) return <div className="panel"><div className="empty">{t('Preparando briefing…', 'Preparing briefing…')}</div></div>;
  const { mission: m, briefing: b, intel } = d;
  const current = [...m.objectives].reverse().find((o) => o.state === 'active');
  const doneTexts = new Set(m.objectives.filter((o) => o.state === 'done').map((o) => o.text));

  let accepted = '';
  if (m.acceptedAt) {
    const since = duration(m.acceptedAt);
    const justNow = Date.now() - Date.parse(m.acceptedAt) < 60_000;
    accepted = t(
      `Aceptado a las ${hhmm(m.acceptedAt)} · hace ${since}`,
      `Accepted at ${hhmm(m.acceptedAt)} · ${justNow ? 'just now' : `${since} ago`}`,
    );
  }
  const rec = b.record;
  const record =
    rec.total > 0
      ? t(
          ` · lo has hecho ${rec.total} ${rec.total === 1 ? 'vez' : 'veces'} (${rec.completed} completado${rec.completed === 1 ? '' : 's'})`,
          ` · you've done it ${rec.total} ${rec.total === 1 ? 'time' : 'times'} (${rec.completed} completed)`,
        )
      : '';

  return (
    <article className="panel brief" aria-label={`Briefing: ${m.title ?? t('contrato', 'contract')}`}>
      <div className="label"><ClipboardList size={14} aria-hidden /> Briefing · {t(MISSION_KIND[b.kind] ?? { en: b.label, es: b.label })}</div>
      <div className="big">{m.title ?? t('Contrato en curso', 'Active contract')}</div>
      <div className="sub">
        {accepted}
        {record}
      </div>

      {d.community && <CommunityBox c={d.community} info={d.communityInfo} />}
      {intel && <IntelBox intel={intel} wiki={d.wiki} />}

      {current && (
        <div className="brief-now">
          <CircleDot size={18} aria-hidden />
          <div>
            <div className="k">{t('Ahora', 'Now')}</div>
            <div className="v">{current.text}</div>
          </div>
        </div>
      )}

      <div className="grid g2 brief-grid">
        <div>
          <h3 className="brief-h">
            {b.previous
              ? t(`Pasos de la última vez (${ago(b.previous.at)})`, `Steps from last time (${ago(b.previous.at)})`)
              : t('Cómo suele ir', 'How it usually goes')}
          </h3>
          {b.previous ? (
            <ol className="brief-steps">
              {b.previous.steps.map((s, i) => {
                const done = doneTexts.has(s);
                const now = current?.text === s;
                return (
                  <li key={i} className={done ? 'done' : now ? 'active' : ''}>
                    {done ? (
                      <CheckCircle2 size={16} aria-label={t('Cumplido', 'Complete')} />
                    ) : now ? (
                      <CircleDot size={16} aria-label={t('En curso', 'In progress')} />
                    ) : (
                      <Circle size={16} aria-label={t('Pendiente', 'Pending')} />
                    )}
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
              <h3 className="brief-h">{t('Lo que llevas en esta', 'Progress this time')}</h3>
              <Steps objectives={m.objectives} />
            </>
          )}
        </div>
        <div>
          <h3 className="brief-h"><Package size={14} aria-hidden /> {t('Qué llevar', 'What to bring')}</h3>
          <ul className="brief-list">{b.gear.map((g) => <li key={g}>{g}</li>)}</ul>
          <h3 className="brief-h"><Lightbulb size={14} aria-hidden /> {t('Consejos', 'Tips')}</h3>
          <ul className="brief-list">{b.tips.map((g) => <li key={g}>{g}</li>)}</ul>
        </div>
      </div>
    </article>
  );
}
