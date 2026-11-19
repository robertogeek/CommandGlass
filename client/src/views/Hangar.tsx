import { ArrowLeft, Backpack, Cpu, ExternalLink, Rocket, Shield, Sparkles, Swords, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ago, n } from '../format.ts';
import { getJson, useLive } from '../live.tsx';
import { useLang, type Translate } from '../lang.tsx';
import { COMPONENT, GEAR_GROUP, GEAR_PORT, type Term } from '../terms.ts';
import type { HangarResponse, ShipSpec, ShipUse, UpgradeSlot } from '../types.ts';

/**
 * Hangar: tu equipo personal, las naves que has usado y la ficha de cada una con sus componentes de serie
 * y las mejores alternativas por tamaño (datos de api.star-citizen.wiki, precios de UEX a través de la wiki).
 */

const GEAR_GROUPS: { key: keyof typeof GEAR_GROUP; icon: typeof Shield; match: RegExp }[] = [
  { key: 'armor', icon: Shield, match: /^Armor_(Helmet|Torso|Arms|Legs|Undersuit)$/i },
  { key: 'weapons', icon: Swords, match: /^wep_/i },
  { key: 'utility', icon: Backpack, match: /Backpack|medPen|grenade/i },
];

function portTerm(port: string): Term | null {
  if (GEAR_PORT[port]) return GEAR_PORT[port]!;
  if (/^wep_stocked/i.test(port)) return GEAR_PORT.back!;
  if (/^medPen/i.test(port)) return GEAR_PORT.medpen!;
  if (/^grenade/i.test(port)) return GEAR_PORT.grenade!;
  return null;
}

/** "#hangar/ANVL_Paladin": la nave seleccionada va en el hash. */
function useSelectedShip(): [string | null, (cls: string | null) => void] {
  const read = () => {
    const [, rest] = window.location.hash.replace('#', '').split(/\/(.*)/);
    return rest ? decodeURIComponent(rest) : null;
  };
  const [cls, setCls] = useState(read);
  useEffect(() => {
    const on = () => setCls(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [cls, (next) => (window.location.hash = next ? `hangar/${encodeURIComponent(next)}` : 'hangar')];
}

export function Hangar() {
  const { t } = useLang();
  const { snapshot } = useLive();
  const [data, setData] = useState<HangarResponse | null>(null);
  const [error, setError] = useState(false);
  const [onlyOwn, setOnlyOwn] = useState(true);
  const [selected, select] = useSelectedShip();

  useEffect(() => {
    getJson<HangarResponse>('/api/hangar').then(setData).catch(() => setError(true));
    getJson<{ received: { name: string; ts: string }[] }>('/api/blueprints').then((b) => setBlueprints(b.received)).catch(() => {});
  }, []);
  const [blueprints, setBlueprints] = useState<{ name: string; ts: string }[]>([]);

  const currentShip = snapshot?.state?.ship?.name?.toLowerCase() ?? null;
  const ships = useMemo(() => (data?.ships ?? []).filter((s) => !onlyOwn || s.own), [data, onlyOwn]);

  if (selected) return <ShipDetail cls={selected} use={data?.ships.find((s) => s.className === selected) ?? null} onBack={() => select(null)} />;
  if (error) return <div className="panel"><div className="empty">{t('No se ha podido cargar el hangar. Comprueba la conexión con el PC.', "Couldn't load the hangar. Check the connection to the PC.")}</div></div>;
  if (!data) return <div className="panel"><div className="empty">{t('Cargando hangar…', 'Loading hangar…')}</div></div>;

  const ownCount = data.ships.filter((s) => s.own).length;

  return (
    <div className="stack">
      <div className="grid g2">
        <section className="panel" aria-label={t('Tu equipo', 'Your loadout')}>
          <div className="label"><Shield size={14} aria-hidden /> {t('Tu equipo', 'Your loadout')}{data.loadoutAt ? ` · ${t('visto', 'seen')} ${ago(data.loadoutAt)}` : ''}</div>
          {data.loadout.length === 0 ? (
            <div className="empty">{t('Aún no he visto tu equipo. Aparece en cuanto entras en el universo con el juego abierto.', "Your loadout hasn't been seen yet. It shows up as soon as you enter the 'verse with the game running.")}</div>
          ) : (
            GEAR_GROUPS.map((g) => {
              const items = data.loadout.filter((l) => g.match.test(l.port)).sort((a, b) => a.port.localeCompare(b.port));
              if (!items.length) return null;
              return (
                <div key={g.key} className="gear-group">
                  <h3 className="brief-h"><g.icon size={14} aria-hidden /> {t(GEAR_GROUP[g.key]!)}</h3>
                  {items.map((l) => (
                    <div key={l.port} className="kv">
                      <span className="faint">{(() => { const p = portTerm(l.port); return p ? t(p) : l.port; })()}</span>
                      <span className="gear-name">{l.name}</span>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </section>

        <div className="stack">
        <section className="panel" aria-label="Blueprints">
          <div className="label"><Sparkles size={14} aria-hidden /> {t('Tus blueprints', 'Your blueprints')} · {blueprints.length}</div>
          {blueprints.length === 0 ? (
            <div className="empty">{t('Aún no has conseguido ninguna. En Contratos, el briefing te dice qué blueprints puede darte cada contrato.', "You haven't earned any yet. In Contracts, the briefing tells you which blueprints each contract can reward.")}</div>
          ) : (
            <div className="intel-rep">
              {blueprints.map((b) => (
                <span key={b.name} className="badge violet" title={`${t('Conseguida', 'Earned')} ${ago(b.ts)}`}>{b.name}</span>
              ))}
            </div>
          )}
        </section>
        <section className="panel" aria-label={t('Flota', 'Fleet')}>
          <div className="label"><Rocket size={14} aria-hidden /> {t('Flota', 'Fleet')}</div>
          <div className="stat-grid">
            <div className="stat"><div className="v">{data.fleet ? n(data.fleet.total) : '—'}</div><div className="k">{t('vehículos en tu hangar', 'vehicles in your hangar')}</div></div>
            <div className="stat"><div className="v">{n(ownCount)}</div><div className="k">{t('tuyas vistas en el registro', 'yours seen in the log')}</div></div>
            <div className="stat"><div className="v">{n(data.ships.reduce((a, s) => a + s.lost, 0))}</div><div className="k">{t('naves perdidas', 'ships lost')}</div></div>
          </div>
          <p className="faint kind-note">
            {t(
              'El juego solo dice cuántos vehículos tienes, no cuáles. Aquí aparecen los que has usado: subido, saltado en cuántico o perdido.',
              "The game only says how many vehicles you have, not which ones. The ones listed here are those you've used: boarded, quantum jumped or lost.",
            )}
          </p>
        </section>
        </div>
      </div>

      <div className="toolbar">
        <button className={`chip ${onlyOwn ? 'on' : ''}`} onClick={() => setOnlyOwn(true)}>{t('Tuyas', 'Yours')} <span className="chip-n">{ownCount}</span></button>
        <button className={`chip ${!onlyOwn ? 'on' : ''}`} onClick={() => setOnlyOwn(false)}>{t('Todas', 'All')} <span className="chip-n">{data.ships.length}</span></button>
      </div>

      <div className="ship-grid">
        {ships.map((s) => (
          <ShipCard key={s.className ?? s.name} s={s} current={!!currentShip && s.name.toLowerCase() === currentShip} onOpen={() => s.className && select(s.className)} />
        ))}
      </div>
    </div>
  );
}

function ShipCard({ s, current, onOpen }: { s: ShipUse; current: boolean; onOpen: () => void }) {
  const { t } = useLang();
  return (
    <button className={`panel ship-card ${current ? 'current' : ''}`} onClick={onOpen} disabled={!s.className} title={s.className ? t('Ver ficha', 'View specs') : t('La wiki no tiene ficha de esta nave', 'The wiki has no entry for this ship')}>
      <div className="ship-name">{s.name}</div>
      <div className="contact-tags">
        {current && <span className="badge green">{t('Vas en ella', 'Current ship')}</span>}
        {s.own ? <span className="badge">{t('Tuya', 'Yours')}</span> : <span className="badge muted">{t('De otro jugador', "Another player's")}</span>}
        {s.lost > 0 && <span className="badge red">{t('Perdida', 'Lost')} ×{s.lost}</span>}
      </div>
      <div className="ship-stats faint">
        {s.boarded > 0 && <span>{s.boarded} {s.boarded === 1 ? t('subida', 'boarding') : t('subidas', 'boardings')}</span>}
        {s.qtJumps > 0 && <span>{s.qtJumps} {t('saltos', s.qtJumps === 1 ? 'QT jump' : 'QT jumps')}</span>}
        <span>{s.sessions} {s.sessions === 1 ? t('sesión', 'session') : t('sesiones', 'sessions')}</span>
        <span>{ago(s.lastUsed)}</span>
      </div>
    </button>
  );
}

function ShipDetail({ cls, use, onBack }: { cls: string; use: ShipUse | null; onBack: () => void }) {
  const { t } = useLang();
  const [d, setD] = useState<{ spec: ShipSpec; upgrades: UpgradeSlot[] } | null | 'missing'>(null);
  useEffect(() => {
    getJson<{ spec: ShipSpec; upgrades: UpgradeSlot[] }>(`/api/hangar/ship/${encodeURIComponent(cls)}`).then(setD).catch(() => setD('missing'));
  }, [cls]);

  const back = (
    <button className="back show" onClick={onBack}>
      <ArrowLeft size={18} aria-hidden /> Hangar
    </button>
  );
  if (d === 'missing') return <div className="panel">{back}<div className="empty">{t('La wiki no tiene ficha de esta nave todavía.', 'The wiki has no entry for this ship yet.')}</div></div>;
  if (!d) return <div className="panel">{back}<div className="empty">{t('Cargando ficha…', 'Loading specs…')}</div></div>;
  const { spec: s, upgrades } = d;

  const faces = (f: string) => (f === 'Quadrant' ? t('cuatro caras', 'Quadrant') : f === 'Bubble' ? t('burbuja', 'Bubble') : f);
  const rows: [string, string | null][] = [
    [t('Rol', 'Role'), s.role],
    [t('Fabricante', 'Manufacturer'), s.manufacturer],
    [t('Tripulación', 'Crew'), s.crew.max ? (s.crew.min && s.crew.min !== s.crew.max ? `${s.crew.min}–${s.crew.max}` : String(s.crew.max)) : null],
    [t('Carga', 'Cargo'), s.cargo ? `${n(s.cargo)} SCU` : null],
    [t('Velocidad SCM / máx.', 'SCM / Max Speed'), s.speed.scm ? `${n(s.speed.scm)} / ${n(s.speed.max ?? 0)} m/s` : null],
    [t('Cuántico', 'Quantum'), s.quantum.speed ? `${n(s.quantum.speed / 1e6)} Mm/s · ${s.quantum.fuel ?? '?'} ${t('SCU de combustible', 'SCU fuel')}` : null],
    [t('Casco', 'Hull'), s.hull ? `${n(s.hull)} ${t('PV', 'HP')}` : null],
    [t('Escudo', 'Shield'), s.shield.hp ? `${n(s.shield.hp)} ${t('PV', 'HP')}${s.shield.faces ? ` · ${faces(s.shield.faces)}` : ''}` : null],
    [t('Misiles', 'Missiles'), s.weapons.missiles ? `${s.weapons.missiles} · ${n(s.weapons.missileDamage ?? 0)} ${t('de daño total', 'total damage')}` : null],
    [t('DPS de torretas', 'Turret DPS'), s.weapons.turretDps ? n(s.weapons.turretDps) : null],
    [t('Cama médica', 'Med Bed'), s.medicalTier ? `${t('nivel', 'Tier')} ${s.medicalTier}` : null],
    [
      t('Seguro', 'Insurance'),
      s.insurance.claim
        ? t(
            `${s.insurance.claim} min · urgente ${s.insurance.expedite ?? '?'} min por ${n(s.insurance.expediteCost ?? 0)} aUEC`,
            `${s.insurance.claim} min · expedite ${s.insurance.expedite ?? '?'} min for ${n(s.insurance.expediteCost ?? 0)} aUEC`,
          )
        : null,
    ],
  ];

  const stockGroups = new Map<string, typeof s.stock>();
  for (const it of s.stock) stockGroups.set(it.type, [...(stockGroups.get(it.type) ?? []), it]);

  const plural = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`;

  return (
    <div className="stack">
      <section className="panel ship-hero" aria-label={s.name}>
        {back}
        <div className="ship-hero-body">
          <div>
            <div className="label"><Rocket size={14} aria-hidden /> {t('Ficha de la nave', 'Ship Specs')}</div>
            <div className="big">{s.name}</div>
            {use && (
              <div className="sub">
                {t(
                  `${use.own ? 'Tuya' : 'De otro jugador'} · ${use.boarded} subidas · ${use.qtJumps} saltos · ${use.lost} perdidas · última vez ${ago(use.lastUsed)}`,
                  `${use.own ? 'Yours' : "Another player's"} · ${plural(use.boarded, 'boarding', 'boardings')} · ${plural(use.qtJumps, 'QT jump', 'QT jumps')} · ${use.lost} lost · last used ${ago(use.lastUsed)}`,
                )}
              </div>
            )}
            {s.description && <p className="ship-desc">{s.description}</p>}
          </div>
          {s.image && <img className="ship-img" src={s.image} alt="" loading="lazy" />}
        </div>
        <div className="intel-grid ship-specs">
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div key={k}><span className="k">{k}</span><span className="v">{v}</span></div>
          ))}
        </div>
      </section>

      <div className="grid g2">
        <section className="panel" aria-label={t('Configuración de serie', 'Stock loadout')}>
          <div className="label"><Cpu size={14} aria-hidden /> {t('De serie', 'Stock')}</div>
          {[...stockGroups.entries()].map(([type, items]) => (
            <div key={type} className="kv">
              <span className="faint">{COMPONENT[type] ? t(COMPONENT[type]!) : type}</span>
              <span className="gear-name">{summarize(items.map((i) => `${i.name}${i.size ? ` (S${i.size})` : ''}`))}</span>
            </div>
          ))}
          <p className="faint kind-note">{t('Lo que trae la nave al comprarla. Si le has cambiado piezas, el juego no lo apunta en el registro.', "What the ship comes with when you buy it. If you've swapped components, the game doesn't record it in the log.")}</p>
        </section>

        <section className="panel" aria-label={t('Mejoras', 'Upgrades')}>
          <div className="label"><Wrench size={14} aria-hidden /> {t('Qué montar', 'What to fit')}</div>
          {upgrades.length === 0 && <div className="empty">{t('Sin componentes que comparar para esta nave.', 'No components to compare for this ship.')}</div>}
          {upgrades.map((u) => {
            const best = u.options[0];
            const isStock = best && u.stock.includes(best.name);
            return (
              <div key={`${u.type}-${u.size}`} className="upgrade">
                <div className="upgrade-head">
                  <strong>{COMPONENT[u.type] ? t(COMPONENT[u.type]!) : u.label} S{u.size}</strong>
                  <span className="faint">{t('de serie', 'stock')}: {summarize(u.stock)}</span>
                </div>
                <ol className="upgrade-list">
                  {u.options.slice(0, 5).map((o, i) => (
                    <li key={o.className} className={u.stock.includes(o.name) ? 'stock' : ''}>
                      <span className="upgrade-name">
                        {i === 0 && !isStock && <Sparkles size={14} className="accent" aria-label={t('Mejor opción', 'Best option')} />} {o.name}
                        {u.stock.includes(o.name) && <span className="badge muted">{t('De serie', 'Stock')}</span>}
                      </span>
                      <span className="faint">{[o.grade && `${t('grado', 'Grade')} ${o.grade}`, o.klass && klassLabel(o.klass, t)].filter(Boolean).join(' · ')}</span>
                      <span className="upgrade-stat">{o.stat === null ? '—' : n(o.stat)}</span>
                      <span className="faint upgrade-shop">{o.price ? `${n(o.price)} aUEC · ${o.shop}` : t('sin precio conocido', 'no known price')}</span>
                    </li>
                  ))}
                </ol>
                {best && <div className="faint kind-note">{t(`Ordenado por ${best.statLabel.toLowerCase()} (más es mejor).`, `Sorted by ${best.statLabel.toLowerCase()} (higher is better).`)}</div>}
              </div>
            );
          })}
        </section>
      </div>

      <p className="faint intel-credit">
        {t('Datos de', 'Data from')} <a href={s.webUrl ?? 'https://star-citizen.wiki'} target="_blank" rel="noreferrer">api.star-citizen.wiki <ExternalLink size={11} aria-hidden /></a>
        {s.version ? ` · ${t('parche', 'patch')} ${s.version.split('-')[0]}` : ''}. {t('Precios de UEX a través de la wiki.', 'UEX prices via the wiki.')}
      </p>
    </div>
  );
}

function summarize(names: string[]): string {
  const counts = new Map<string, number>();
  for (const x of names) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].map(([x, c]) => (c > 1 ? `${x} ×${c}` : x)).join(', ');
}

/** Clase del componente: en inglés, la del juego tal cual. */
function klassLabel(k: string, t: Translate): string {
  const es = ({ Military: 'militar', Civilian: 'civil', Stealth: 'sigilo', Industrial: 'industrial', Competition: 'competición' } as Record<string, string>)[k];
  return es ? t(es, k) : k;
}
