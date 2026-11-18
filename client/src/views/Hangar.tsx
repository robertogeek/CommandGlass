import { ArrowLeft, Backpack, Cpu, ExternalLink, Rocket, Shield, Sparkles, Swords, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ago, n } from '../format.ts';
import { getJson, useLive } from '../live.tsx';
import { useLang } from '../lang.tsx';
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
  }, []);

  const currentShip = snapshot?.state?.ship?.name?.toLowerCase() ?? null;
  const ships = useMemo(() => (data?.ships ?? []).filter((s) => !onlyOwn || s.own), [data, onlyOwn]);

  if (selected) return <ShipDetail cls={selected} use={data?.ships.find((s) => s.className === selected) ?? null} onBack={() => select(null)} />;
  if (error) return <div className="panel"><div className="empty">No se ha podido cargar el hangar. Comprueba la conexión con el PC.</div></div>;
  if (!data) return <div className="panel"><div className="empty">Cargando hangar…</div></div>;

  const ownCount = data.ships.filter((s) => s.own).length;

  return (
    <div className="stack">
      <div className="grid g2">
        <section className="panel" aria-label="Tu equipo">
          <div className="label"><Shield size={14} aria-hidden /> Tu equipo{data.loadoutAt ? ` · visto ${ago(data.loadoutAt)}` : ''}</div>
          {data.loadout.length === 0 ? (
            <div className="empty">Aún no he visto tu equipo. Aparece en cuanto entras en el universo con el juego abierto.</div>
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

        <section className="panel" aria-label="Flota">
          <div className="label"><Rocket size={14} aria-hidden /> Flota</div>
          <div className="stat-grid">
            <div className="stat"><div className="v">{data.fleet ? n(data.fleet.total) : '—'}</div><div className="k">vehículos en tu hangar</div></div>
            <div className="stat"><div className="v">{n(ownCount)}</div><div className="k">tuyas vistas en el registro</div></div>
            <div className="stat"><div className="v">{n(data.ships.reduce((a, s) => a + s.lost, 0))}</div><div className="k">naves perdidas</div></div>
          </div>
          <p className="faint kind-note">
            El juego solo dice cuántos vehículos tienes, no cuáles. Aquí aparecen los que has usado: subido, saltado en cuántico o perdido.
          </p>
        </section>
      </div>

      <div className="toolbar">
        <button className={`chip ${onlyOwn ? 'on' : ''}`} onClick={() => setOnlyOwn(true)}>Tuyas <span className="chip-n">{ownCount}</span></button>
        <button className={`chip ${!onlyOwn ? 'on' : ''}`} onClick={() => setOnlyOwn(false)}>Todas <span className="chip-n">{data.ships.length}</span></button>
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
  return (
    <button className={`panel ship-card ${current ? 'current' : ''}`} onClick={onOpen} disabled={!s.className} title={s.className ? 'Ver ficha' : 'La wiki no tiene ficha de esta nave'}>
      <div className="ship-name">{s.name}</div>
      <div className="contact-tags">
        {current && <span className="badge green">Vas en ella</span>}
        {s.own ? <span className="badge">Tuya</span> : <span className="badge muted">De otro jugador</span>}
        {s.lost > 0 && <span className="badge red">Perdida ×{s.lost}</span>}
      </div>
      <div className="ship-stats faint">
        {s.boarded > 0 && <span>{s.boarded} {s.boarded === 1 ? 'subida' : 'subidas'}</span>}
        {s.qtJumps > 0 && <span>{s.qtJumps} saltos</span>}
        <span>{s.sessions} {s.sessions === 1 ? 'sesión' : 'sesiones'}</span>
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
  if (d === 'missing') return <div className="panel">{back}<div className="empty">La wiki no tiene ficha de esta nave todavía.</div></div>;
  if (!d) return <div className="panel">{back}<div className="empty">Cargando ficha…</div></div>;
  const { spec: s, upgrades } = d;

  const rows: [string, string | null][] = [
    ['Rol', s.role],
    ['Fabricante', s.manufacturer],
    ['Tripulación', s.crew.max ? (s.crew.min && s.crew.min !== s.crew.max ? `${s.crew.min}–${s.crew.max}` : String(s.crew.max)) : null],
    ['Carga', s.cargo ? `${n(s.cargo)} SCU` : null],
    ['Velocidad SCM / máx.', s.speed.scm ? `${n(s.speed.scm)} / ${n(s.speed.max ?? 0)} m/s` : null],
    ['Cuántico', s.quantum.speed ? `${n(s.quantum.speed / 1e6)} Mm/s · ${s.quantum.fuel ?? '?'} SCU de combustible` : null],
    ['Casco', s.hull ? `${n(s.hull)} PV` : null],
    ['Escudo', s.shield.hp ? `${n(s.shield.hp)} PV${s.shield.faces ? ` · ${s.shield.faces === 'Quadrant' ? 'cuatro caras' : s.shield.faces === 'Bubble' ? 'burbuja' : s.shield.faces}` : ''}` : null],
    ['Misiles', s.weapons.missiles ? `${s.weapons.missiles} · ${n(s.weapons.missileDamage ?? 0)} de daño total` : null],
    ['DPS de torretas', s.weapons.turretDps ? n(s.weapons.turretDps) : null],
    ['Cama médica', s.medicalTier ? `nivel ${s.medicalTier}` : null],
    ['Seguro', s.insurance.claim ? `${s.insurance.claim} min · urgente ${s.insurance.expedite ?? '?'} min por ${n(s.insurance.expediteCost ?? 0)} aUEC` : null],
  ];

  const stockGroups = new Map<string, typeof s.stock>();
  for (const it of s.stock) stockGroups.set(it.type, [...(stockGroups.get(it.type) ?? []), it]);

  return (
    <div className="stack">
      <section className="panel ship-hero" aria-label={s.name}>
        {back}
        <div className="ship-hero-body">
          <div>
            <div className="label"><Rocket size={14} aria-hidden /> Ficha de la nave</div>
            <div className="big">{s.name}</div>
            {use && (
              <div className="sub">
                {use.own ? 'Tuya' : 'De otro jugador'} · {use.boarded} subidas · {use.qtJumps} saltos · {use.lost} perdidas · última vez {ago(use.lastUsed)}
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
        <section className="panel" aria-label="Configuración de serie">
          <div className="label"><Cpu size={14} aria-hidden /> De serie</div>
          {[...stockGroups.entries()].map(([type, items]) => (
            <div key={type} className="kv">
              <span className="faint">{COMPONENT[type] ? t(COMPONENT[type]!) : type}</span>
              <span className="gear-name">{summarize(items.map((i) => `${i.name}${i.size ? ` (S${i.size})` : ''}`))}</span>
            </div>
          ))}
          <p className="faint kind-note">Lo que trae la nave al comprarla. Si le has cambiado piezas, el juego no lo apunta en el registro.</p>
        </section>

        <section className="panel" aria-label="Mejoras">
          <div className="label"><Wrench size={14} aria-hidden /> Qué montar</div>
          {upgrades.length === 0 && <div className="empty">Sin componentes que comparar para esta nave.</div>}
          {upgrades.map((u) => {
            const best = u.options[0];
            const isStock = best && u.stock.includes(best.name);
            return (
              <div key={`${u.type}-${u.size}`} className="upgrade">
                <div className="upgrade-head">
                  <strong>{COMPONENT[u.type] ? t(COMPONENT[u.type]!) : u.label} S{u.size}</strong>
                  <span className="faint">de serie: {summarize(u.stock)}</span>
                </div>
                <ol className="upgrade-list">
                  {u.options.slice(0, 5).map((o, i) => (
                    <li key={o.className} className={u.stock.includes(o.name) ? 'stock' : ''}>
                      <span className="upgrade-name">
                        {i === 0 && !isStock && <Sparkles size={14} className="accent" aria-label="Mejor opción" />} {o.name}
                        {u.stock.includes(o.name) && <span className="badge muted">De serie</span>}
                      </span>
                      <span className="faint">{[o.grade && `grado ${o.grade}`, o.klass && klassEs(o.klass)].filter(Boolean).join(' · ')}</span>
                      <span className="upgrade-stat">{o.stat === null ? '—' : n(o.stat)}</span>
                      <span className="faint upgrade-shop">{o.price ? `${n(o.price)} aUEC · ${o.shop}` : 'sin precio conocido'}</span>
                    </li>
                  ))}
                </ol>
                {best && <div className="faint kind-note">Ordenado por {best.statLabel.toLowerCase()} (más es mejor).</div>}
              </div>
            );
          })}
        </section>
      </div>

      <p className="faint intel-credit">
        Datos de <a href={s.webUrl ?? 'https://star-citizen.wiki'} target="_blank" rel="noreferrer">api.star-citizen.wiki <ExternalLink size={11} aria-hidden /></a>
        {s.version ? ` · parche ${s.version.split('-')[0]}` : ''}. Precios de UEX a través de la wiki.
      </p>
    </div>
  );
}

function summarize(names: string[]): string {
  const counts = new Map<string, number>();
  for (const x of names) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].map(([x, c]) => (c > 1 ? `${x} ×${c}` : x)).join(', ');
}

function klassEs(k: string): string {
  return ({ Military: 'militar', Civilian: 'civil', Stealth: 'sigilo', Industrial: 'industrial', Competition: 'competición' } as Record<string, string>)[k] ?? k;
}
