import { Crosshair, Gavel, Rocket, Skull, Swords } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ago, day, hhmm, n } from '../format.ts';
import { useLang } from '../lang.tsx';
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
  const { t } = useLang();
  const { liveEvents } = useLive();
  const [d, setD] = useState<CombatSummary | null>(null);
  const lastCombat = liveEvents.find((e) => e.category === 'combat' || e.type === 'health.death')?.id ?? 0;
  useEffect(() => {
    getJson<CombatSummary>('/api/combat').then(setD).catch(() => setD(null));
  }, [lastCombat]);

  if (!d) return <div className="panel"><div className="empty">{t('Cargando combate…', 'Loading combat…')}</div></div>;

  return (
    <div className="stack">
      <section className="panel" aria-label={t('Resumen de combate', 'Combat summary')}>
        <div className="label"><Swords size={14} aria-hidden /> {t('Desde que hay registro', 'Since logging began')}</div>
        <div className="grid g4">
          <div className="stat good"><div className="v">{n(d.vehiclesDestroyed)}</div><div className="k">{t('naves destruidas', d.vehiclesDestroyed === 1 ? 'ship destroyed' : 'ships destroyed')}</div></div>
          <div className="stat bad"><div className="v">{n(d.shipsLost)}</div><div className="k">{t('naves perdidas', d.shipsLost === 1 ? 'ship lost' : 'ships lost')}</div></div>
          <div className="stat bad"><div className="v">{n(d.deaths)}</div><div className="k">{t('muertes', d.deaths === 1 ? 'death' : 'deaths')}</div></div>
          <div className="stat"><div className="v">{n(d.kills2025)}</div><div className="k">{t('bajas a pie (registro de 2025)', `on-foot ${d.kills2025 === 1 ? 'kill' : 'kills'} (2025 log)`)}</div></div>
        </div>
      </section>

      <div className="grid g2">
        <section className="panel" aria-label={t('Quién te derriba', 'Who shoots you down')}>
          <div className="label"><Skull size={14} aria-hidden /> {t('Quién te ha destruido la nave', 'Who has destroyed your ship')}</div>
          <Bars items={d.lostBy} tone="bad" empty={t('Nadie te ha destruido una nave todavía.', 'Nobody has destroyed one of your ships yet.')} />
          <h3 className="brief-h">{t('Por qué', 'Why')}</h3>
          <Bars items={d.lostReasons} tone="neutral" empty="—" />
        </section>
        <section className="panel" aria-label={t('Qué derribas', 'What you shoot down')}>
          <div className="label"><Crosshair size={14} aria-hidden /> {t('Lo que más has destruido', "What you've destroyed most")}</div>
          <Bars items={d.destroyedShips} tone="good" empty={t('Aún no has destruido ninguna nave.', "You haven't destroyed any ships yet.")} />
        </section>
      </div>

      <div className="grid g2">
        <section className="panel" aria-label={t('Naves perdidas', 'Ships lost')}>
          <div className="label"><Rocket size={14} aria-hidden /> {t('Naves que has perdido', "Ships you've lost")}</div>
          <Bars items={d.lostShips} tone="bad" empty={t('No has perdido ninguna nave.', "You haven't lost any ships.")} />
          {d.deathCauses.length > 0 && (
            <>
              <h3 className="brief-h">{t('De qué has muerto (registro de 2025)', 'What killed you (2025 log)')}</h3>
              <Bars items={d.deathCauses} tone="neutral" empty="—" />
            </>
          )}
        </section>
        <section className="panel" aria-label={t('Ley', 'Law')}>
          <div className="label"><Gavel size={14} aria-hidden /> {t('Ley y CrimeStat', 'Law & CrimeStat')}</div>
          {d.crimes.length === 0 ? (
            <div className="empty">{t('Expediente limpio: ningún delito registrado.', 'Clean record: no crimes logged.')}</div>
          ) : (
            <>
              <Bars items={d.crimeTypes} tone="bad" empty="—" />
              <h3 className="brief-h">{t('Últimos delitos', 'Recent crimes')}</h3>
              {d.crimes.slice(0, 10).map((c, i) => (
                <div key={i} className="kv">
                  <span>{c.crime}{c.against ? <span className="faint"> · {t('contra', 'against')} {c.against}</span> : null}</span>
                  <span className="faint">{ago(c.ts)}</span>
                </div>
              ))}
            </>
          )}
        </section>
      </div>

      <section className="panel" aria-label={t('Historial de combate', 'Combat history')}>
        <div className="label"><Swords size={14} aria-hidden /> {t('Historial de combate', 'Combat history')}</div>
        {d.feed.length === 0 && <div className="empty">{t('Sin combates registrados.', 'No combat recorded.')}</div>}
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
