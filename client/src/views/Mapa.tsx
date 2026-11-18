import { MapPin, Navigation, Route } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ago, hhmm, n } from '../format.ts';
import { getJson, useLive } from '../live.tsx';

/**
 * Mapa: esquema orbital de cada sistema con los sitios donde has estado (por planeta y luna),
 * la ruta de tu última sesión y los saltos entre sistemas. Es un esquema por lugares: el registro
 * del juego no da tu posición exacta.
 */

interface Place {
  code: string;
  name: string;
  system: string | null;
  body: string | null;
  planet: string | null;
  visits: number;
  first: string;
  last: string;
}

interface MapResponse {
  places: Place[];
  route: { ts: string; code: string; name: string; system: string | null; planet: string | null }[];
  routeSessionId: number | null;
  current: { code: string; name: string; system: string | null; body: string | null; planet: string | null; since: string } | null;
  systems: Record<string, string[]>;
  moons: Record<string, string>;
  jumps: [string, string][];
}

const SIZE = 600;
const C = SIZE / 2;

export function Mapa() {
  const { snapshot } = useLive();
  const [data, setData] = useState<MapResponse | null>(null);
  const [system, setSystem] = useState<string | null>(null);
  const [planet, setPlanet] = useState<string | null>(null);

  const liveCode = snapshot?.state?.location?.code ?? null;
  useEffect(() => {
    getJson<MapResponse>('/api/map').then((d) => {
      setData(d);
      setSystem((s) => s ?? d.current?.system ?? mostVisitedSystem(d.places));
    });
  }, [liveCode]);

  const sysPlaces = useMemo(() => (data?.places ?? []).filter((p) => p.system === system), [data, system]);
  if (!data) return <div className="panel"><div className="empty">Cargando mapa…</div></div>;
  if (!data.places.length) return <div className="panel"><div className="empty">Aún no hay viajes registrados. En cuanto llegues a una estación o ciudad, aparecerá aquí.</div></div>;

  const planets = data.systems[system ?? ''] ?? [];
  const visitsBy = (pl: string) => sysPlaces.filter((p) => p.planet === pl).reduce((a, p) => a + p.visits, 0);
  const space = sysPlaces.filter((p) => !p.planet);
  const listed = planet ? sysPlaces.filter((p) => p.planet === planet) : sysPlaces;
  const cur = data.current;

  return (
    <div className="stack">
      <div className="toolbar">
        {Object.keys(data.systems).map((s) => {
          const v = data.places.filter((p) => p.system === s).reduce((a, p) => a + p.visits, 0);
          return (
            <button key={s} className={`chip ${system === s ? 'on' : ''}`} onClick={() => (setSystem(s), setPlanet(null))}>
              {s} <span className="chip-n">{n(v)}</span>
            </button>
          );
        })}
        {cur && <span className="pill"><MapPin size={14} aria-hidden /> Ahora: {cur.name}{cur.system ? ` · ${cur.system}` : ''}</span>}
      </div>

      <div className="map-layout">
        <section className="panel map-panel" aria-label={`Sistema ${system}`}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="orbit-map" role="img" aria-label={`Esquema del sistema ${system}`}>
            <defs>
              <radialGradient id="star" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#fff6d8" />
                <stop offset="60%" stopColor="#f5c26b" />
                <stop offset="100%" stopColor="#f5c26b" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx={C} cy={C} r={26} fill="url(#star)" />
            <text x={C} y={C + 44} className="orbit-label star-label" textAnchor="middle">{system}</text>
            {planets.map((pl, i) => {
              const r = 70 + ((i + 1) * (SIZE / 2 - 100)) / planets.length;
              const a = (i * 137.5 * Math.PI) / 180 - Math.PI / 2;
              const x = C + r * Math.cos(a);
              const y = C + r * Math.sin(a);
              const v = visitsBy(pl);
              const pr = 7 + Math.min(16, Math.sqrt(v) * 2.2);
              const moons = Object.entries(data.moons).filter(([, p]) => p === pl).map(([m]) => m);
              const here = cur?.system === system && cur?.planet === pl;
              return (
                <g key={pl}>
                  <circle cx={C} cy={C} r={r} className="orbit-ring" />
                  <g className={`planet ${v ? 'visited' : ''} ${planet === pl ? 'on' : ''}`} onClick={() => setPlanet(planet === pl ? null : pl)} role="button" tabIndex={0} aria-label={`${pl}: ${v} visitas`}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setPlanet(planet === pl ? null : pl)}>
                    <circle cx={x} cy={y} r={pr + 14} className="hit" />
                    <circle cx={x} cy={y} r={pr} className="body" />
                    {moons.map((m, k) => {
                      const ma = (k / Math.max(1, moons.length)) * Math.PI * 2;
                      const mv = sysPlaces.filter((p) => p.body === m).reduce((acc, p) => acc + p.visits, 0);
                      return <circle key={m} cx={x + (pr + 10) * Math.cos(ma)} cy={y + (pr + 10) * Math.sin(ma)} r={mv ? 3.5 : 2} className={`moon ${mv ? 'visited' : ''}`} />;
                    })}
                    {here && <circle cx={x} cy={y} r={pr + 6} className="here" />}
                    <text x={x} y={y + pr + 24} textAnchor="middle" className="orbit-label">{pl}</text>
                    {v > 0 && <text x={x} y={y + pr + 38} textAnchor="middle" className="orbit-count">{v} visitas</text>}
                  </g>
                </g>
              );
            })}
            {space.slice(0, 8).map((p, i) => {
              const a = ((i + 0.5) / Math.max(1, Math.min(8, space.length))) * Math.PI * 2 + Math.PI / 6;
              const r = SIZE / 2 - 22;
              const x = C + r * Math.cos(a);
              const y = C + r * Math.sin(a);
              const here = cur?.code === p.code;
              return (
                <g key={p.code} className="space-place">
                  <rect x={x - 5} y={y - 5} width={10} height={10} transform={`rotate(45 ${x} ${y})`} className={`diamond ${here ? 'here-fill' : ''}`} />
                  <title>{`${p.name}: ${p.visits} visitas`}</title>
                </g>
              );
            })}
          </svg>
          <p className="faint kind-note">Toca un planeta para ver sus sitios. El tamaño indica cuántas veces has estado. Los rombos del borde son estaciones de salto y sitios en el espacio.</p>
        </section>

        <div className="stack">
          <section className="panel" aria-label="Lugares">
            <div className="label"><MapPin size={14} aria-hidden /> {planet ? `${planet} y sus lunas` : `Sitios en ${system}`}</div>
            {listed.length === 0 && <div className="empty">Aún no has estado en ningún sitio de {planet ?? system}.</div>}
            {listed.slice(0, 40).map((p) => (
              <div key={p.code} className={`kv ${cur?.code === p.code ? 'here-row' : ''}`}>
                <span>
                  {p.name}
                  {p.body && p.body !== p.planet && <span className="faint"> · {p.body}</span>}
                  {!planet && p.planet && p.body === p.planet && <span className="faint"> · {p.planet}</span>}
                </span>
                <span className="faint">{p.visits}× · {ago(p.last)}</span>
              </div>
            ))}
          </section>

          <section className="panel" aria-label="Ruta">
            <div className="label"><Route size={14} aria-hidden /> Tu última ruta</div>
            {data.route.length === 0 ? (
              <div className="empty">Sin viajes en la última sesión.</div>
            ) : (
              <ol className="route">
                {compress(data.route).map((s, i) => (
                  <li key={i} className={s.system !== compress(data.route)[i - 1]?.system && i > 0 ? 'jump' : ''}>
                    <span className="route-time">{hhmm(s.ts)}</span>
                    <span>{s.name}</span>
                    <span className="faint">{s.planet ?? s.system ?? ''}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="panel" aria-label="Saltos entre sistemas">
            <div className="label"><Navigation size={14} aria-hidden /> Saltos entre sistemas</div>
            <JumpGraph data={data} />
          </section>
        </div>
      </div>
    </div>
  );
}

function mostVisitedSystem(places: Place[]): string {
  const by = new Map<string, number>();
  for (const p of places) if (p.system) by.set(p.system, (by.get(p.system) ?? 0) + p.visits);
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Stanton';
}

/** Quita repeticiones seguidas del mismo sitio. */
function compress<T extends { code: string }>(route: T[]): T[] {
  return route.filter((s, i) => s.code !== route[i - 1]?.code);
}

function JumpGraph({ data }: { data: MapResponse }) {
  const order = ['Magnus', 'Stanton', 'Pyro', 'Nyx', 'Castra'];
  const visited = new Set(data.places.map((p) => p.system));
  const jumpVisits = (a: string, b: string) =>
    data.places.filter((p) => new RegExp(`^RR_JP_(${a}${b}|${b}${a})`, 'i').test(p.code)).reduce((acc, p) => acc + p.visits, 0);
  const W = 520;
  const step = W / (order.length - 1);
  const x = (s: string) => 20 + order.indexOf(s) * ((W - 40) / (order.length - 1));
  return (
    <svg viewBox={`0 0 ${W} 90`} className="jump-graph" role="img" aria-label="Saltos entre sistemas">
      {data.jumps.map(([a, b]) => {
        const v = jumpVisits(a, b);
        return (
          <g key={`${a}-${b}`}>
            <line x1={x(a)} y1={36} x2={x(b)} y2={36} className={`jump-line ${v ? 'used' : ''}`} />
            {v > 0 && <text x={(x(a) + x(b)) / 2} y={26} textAnchor="middle" className="orbit-count">{v}×</text>}
          </g>
        );
      })}
      {order.map((s) => (
        <g key={s}>
          <circle cx={x(s)} cy={36} r={9} className={`sys-node ${visited.has(s) ? 'visited' : ''} ${data.current?.system === s ? 'here-fill' : ''}`} />
          <text x={x(s)} y={66} textAnchor="middle" className="orbit-label">{s}</text>
        </g>
      ))}
      <desc>{`Paso entre nodos: ${Math.round(step)}`}</desc>
    </svg>
  );
}
