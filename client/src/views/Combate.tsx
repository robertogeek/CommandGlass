import { Crosshair, Gavel, Rocket, Skull, Swords } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ago, day, hhmm, n } from '../format.ts';
import { getJson, useLive } from '../live.tsx';

/** Combate y ley: quién te derriba, qué derribas tú, de qué mueres y tus delitos. */

interface Ranked {
  key: string;
  n: number;
}

interface CombatSummary {
  shipsLost: number;
  vehiclesDestroyed: number;
  deaths: number;
  kills2025: number;
  lostBy: Ranked[];
  lostReasons: Ranked[];
  lostShips: Ranked[];
  destroyedShips: Ranked[];
  deathCauses: Ranked[];
  crimes: { ts: string; crime: string; against: string | null }[];
  crimeTypes: Ranked[];
  feed: { id: number; ts: string; type: string; summary: string; tone: 'bad' | 'good' | 'neutral' }[];
}

function Bars({ items, tone, empty }: { items: Ranked[]; tone: 'bad' | 'good' | 'neutral'; empty: string }) {
  if (!items.length) return <div className="empty">{empty}</div>;
  const max = Math.max(...items.map((i) => i.n));
  return (
    <>
      {items.map((i) => (
        <div key={i.key} className="kind-row static">
          <span className="kind-name">{i.key}</span>
          <span className="kind-bar" aria-hidden>
            <span className={tone === 'bad' ? 'bad' : tone === 'good' ? 'ok' : 'rest'} style={{ width: `${(100 * i.n) / max}%` }} />
          </span>
          <span className="kind-num">{n(i.n)}</span>
        </div>
      ))}
    </>
  );
}

export function Combate() {
  const { liveEvents } = useLive();
  const [d, setD] = useState<CombatSummary | null>(null);
  const lastCombat = liveEvents.find((e) => e.category === 'combat' || e.type === 'health.death')?.id ?? 0;
  useEffect(() => {
    getJson<CombatSummary>('/api/combat').then(setD).catch(() => setD(null));
  }, [lastCombat]);

  if (!d) return <div className="panel"><div className="empty">Cargando combate…</div></div>;

  return (
    <div className="stack">
      <section className="panel" aria-label="Resumen de combate">
        <div className="label"><Swords size={14} aria-hidden /> Desde que hay registro</div>
        <div className="grid g4">
          <div className="stat good"><div className="v">{n(d.vehiclesDestroyed)}</div><div className="k">naves destruidas</div></div>
          <div className="stat bad"><div className="v">{n(d.shipsLost)}</div><div className="k">naves perdidas</div></div>
          <div className="stat bad"><div className="v">{n(d.deaths)}</div><div className="k">muertes</div></div>
          <div className="stat"><div className="v">{n(d.kills2025)}</div><div className="k">bajas a pie (registro de 2025)</div></div>
        </div>
      </section>

      <div className="grid g2">
        <section className="panel" aria-label="Quién te derriba">
          <div className="label"><Skull size={14} aria-hidden /> Quién te ha destruido la nave</div>
          <Bars items={d.lostBy} tone="bad" empty="Nadie te ha destruido una nave todavía." />
          <h3 className="brief-h">Por qué</h3>
          <Bars items={d.lostReasons} tone="neutral" empty="—" />
        </section>
        <section className="panel" aria-label="Qué derribas">
          <div className="label"><Crosshair size={14} aria-hidden /> Lo que más has destruido</div>
          <Bars items={d.destroyedShips} tone="good" empty="Aún no has destruido ninguna nave." />
        </section>
      </div>

      <div className="grid g2">
        <section className="panel" aria-label="Naves perdidas">
          <div className="label"><Rocket size={14} aria-hidden /> Naves que has perdido</div>
          <Bars items={d.lostShips} tone="bad" empty="No has perdido ninguna nave." />
          {d.deathCauses.length > 0 && (
            <>
              <h3 className="brief-h">De qué has muerto (registro de 2025)</h3>
              <Bars items={d.deathCauses} tone="neutral" empty="—" />
            </>
          )}
        </section>
        <section className="panel" aria-label="Ley">
          <div className="label"><Gavel size={14} aria-hidden /> Ley y CrimeStat</div>
          {d.crimes.length === 0 ? (
            <div className="empty">Expediente limpio: ningún delito registrado.</div>
          ) : (
            <>
              <Bars items={d.crimeTypes} tone="bad" empty="—" />
              <h3 className="brief-h">Últimos delitos</h3>
              {d.crimes.slice(0, 10).map((c, i) => (
                <div key={i} className="kv">
                  <span>{c.crime}{c.against ? <span className="faint"> · contra {c.against}</span> : null}</span>
                  <span className="faint">{ago(c.ts)}</span>
                </div>
              ))}
            </>
          )}
        </section>
      </div>

      <section className="panel" aria-label="Historial de combate">
        <div className="label"><Swords size={14} aria-hidden /> Historial de combate</div>
        {d.feed.length === 0 && <div className="empty">Sin combates registrados.</div>}
        {d.feed.slice(0, 40).map((f, i) => {
          const prev = d.feed[i - 1];
          return (
            <div key={f.id}>
              {(!prev || day(prev.ts) !== day(f.ts)) && <div className="day-head in-panel">{day(f.ts)}</div>}
              <div className={`kv combat-row ${f.tone}`}>
                <span>{f.summary}</span>
                <span className="faint">{hhmm(f.ts)}</span>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
