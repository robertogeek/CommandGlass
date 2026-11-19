import { ChevronLeft, MapPin, Navigation, Route, ZoomIn } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { StarMap, type Belt, type Body, type Kind, type Selection, type Sys } from '../components/StarMap.tsx';
import { ago, dec, hhmm, n } from '../format.ts';
import { useLang, type Translate } from '../lang.tsx';
import { getJson, useLive } from '../live.tsx';

/**
 * Mapa: el starmap del juego (posiciones reales de cada parche, extraídas por la Star Citizen Wiki) con los
 * sitios donde has estado, dónde estás ahora, tu última ruta y los saltos entre sistemas.
 * El registro del juego no da tu posición exacta: se marca el sitio al que has llegado.
 */

interface Located {
  at: string | null;
  exact: boolean;
  belt: string | null;
}

interface Place extends Located {
  code: string;
  name: string;
  system: string | null;
  body: string | null;
  planet: string | null;
  visits: number;
  first: string;
  last: string;
}

interface Stop extends Located {
  ts: string;
  code: string;
  name: string;
  system: string | null;
  planet: string | null;
}

interface MapResponse {
  starmap: { source: string; build: string | null; fetchedAt: string | null; error: string | null };
  gameBuild: string | null;
  systems: Sys[];
  jumps: { a: string; b: string; visits: number }[];
  places: Place[];
  route: Stop[];
  routeSessionId: number | null;
  current: (Located & { code: string; name: string; system: string | null; body: string | null; planet: string | null; since: string }) | null;
}

export function Mapa() {
  const { t } = useLang();
  const { snapshot } = useLive();
  const [data, setData] = useState<MapResponse | null>(null);
  const [system, setSystem] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [retry, setRetry] = useState(0);

  const liveCode = snapshot?.state?.location?.code ?? null;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    getJson<MapResponse>('/api/map').then((d) => {
      setData(d);
      setSystem((s) => s ?? d.current?.system ?? mostVisitedSystem(d.places) ?? d.systems[0]?.name ?? null);
      // El primer arranque descarga el starmap en segundo plano: se vuelve a pedir en un momento.
      if (!d.starmap.build && !d.starmap.error) timer = setTimeout(() => setRetry((r) => r + 1), 5000);
    });
    return () => clearTimeout(timer);
  }, [liveCode, retry]);

  const sys = data?.systems.find((s) => s.name === system) ?? null;
  const byId = useMemo(() => new Map((sys?.bodies ?? []).map((b) => [b.id, b])), [sys]);
  const star = sys?.bodies.find((b) => b.kind === 'star') ?? null;
  const sysPlaces = useMemo(() => (data?.places ?? []).filter((p) => p.system === system), [data, system]);

  // Visitas por objeto, sumando lo que tiene dentro (un puesto cuenta para su luna y su planeta).
  const visits = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of sysPlaces) {
      let cur = p.at ? byId.get(p.at) : undefined;
      while (cur) {
        m.set(cur.id, (m.get(cur.id) ?? 0) + p.visits);
        cur = cur.parent ? byId.get(cur.parent) : undefined;
      }
    }
    return m;
  }, [sysPlaces, byId]);
  const beltVisits = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const p of sysPlaces) if (p.belt) m.set(p.belt, (m.get(p.belt) ?? 0) + p.visits);
    return m;
  }, [sysPlaces]);

  if (!data) return <div className="panel"><div className="empty">{t('Cargando mapa…', 'Loading map…')}</div></div>;

  const cur = data.current;
  const focus = focusId ? (byId.get(focusId) ?? null) : null;
  const here = cur && cur.system === system ? cur : null;
  const routeIds = data.route.filter((s) => s.system === system && s.at).map((s) => s.at!);

  const chooseSystem = (s: string) => {
    setSystem(s);
    setFocusId(null);
    setSel(null);
  };
  const goHere = () => {
    if (!cur?.system) return;
    setSystem(cur.system);
    const b = cur.at ? data.systems.find((s) => s.name === cur.system)?.bodies.find((x) => x.id === cur.at) : undefined;
    const parent = b?.parent ? data.systems.find((s) => s.name === cur.system)?.bodies.find((x) => x.id === b.parent) : undefined;
    setFocusId(parent && parent.kind !== 'star' ? parent.id : null);
    setSel(cur.at ? { type: 'body', id: cur.at } : cur.belt ? { type: 'belt', name: cur.belt } : null);
  };

  // Migas: sistema › planeta › luna.
  const crumbs: Body[] = [];
  for (let b = focus; b && b.kind !== 'star'; b = b.parent ? (byId.get(b.parent) ?? null) : null) crumbs.unshift(b);

  return (
    <div className="stack">
      <div className="toolbar">
        {data.systems.map((s) => {
          const v = data.places.filter((p) => p.system === s.name).reduce((a, p) => a + p.visits, 0);
          return (
            <button key={s.name} className={`chip ${system === s.name ? 'on' : ''}`} onClick={() => chooseSystem(s.name)}>
              {s.name} <span className="chip-n">{n(v)}</span>
            </button>
          );
        })}
        {cur && (
          <button className="chip here-chip" onClick={goHere}>
            <MapPin size={15} aria-hidden /> {t('Estás en', "You're at")} {cur.name}
            {cur.system ? ` · ${cur.system}` : ''}
          </button>
        )}
      </div>

      <div className="map-layout">
        <section className="panel map-panel" aria-label={t('Starmap', 'Starmap')}>
          <div className="sm-head">
            {focus ? (
              <button className="chip sm-back" onClick={() => (setFocusId(crumbs.length > 1 ? crumbs.at(-2)!.id : null), setSel({ type: 'body', id: focus.id }))}>
                <ChevronLeft size={16} aria-hidden /> {crumbs.length > 1 ? crumbs.at(-2)!.name : system}
              </button>
            ) : null}
            <nav className="sm-crumbs" aria-label={t('Dónde estás mirando', "Where you're looking")}>
              <button className={`sm-crumb ${!focus ? 'on' : ''}`} onClick={() => (setFocusId(null), setSel(null))}>{system}</button>
              {crumbs.map((b) => (
                <button key={b.id} className={`sm-crumb ${focus?.id === b.id ? 'on' : ''}`} onClick={() => (setFocusId(b.id), setSel(null))}>
                  {b.name}
                </button>
              ))}
            </nav>
          </div>
          {sys && sys.bodies.length ? (
            <StarMap
              sys={sys}
              focus={focus}
              selection={sel}
              visits={visits}
              beltVisits={beltVisits}
              hereId={here?.at ?? null}
              hereBelt={here?.belt ?? null}
              routeIds={routeIds}
              onSelect={setSel}
              onFocus={(id) => (setFocusId(id), setSel(null))}
            />
          ) : (
            <div className="empty">
              {data.starmap.error
                ? t('No se ha podido descargar el starmap del juego. Lo vuelvo a intentar en un rato; mientras, tienes tus sitios a la derecha.', "Couldn't download the game's starmap. I'll try again shortly; meanwhile, your places are on the right.")
                : data.starmap.build
                  ? t(`No hay datos del starmap para ${system}.`, `No starmap data for ${system}.`)
                  : t('Descargando el starmap del juego…', "Downloading the game's starmap…")}
            </div>
          )}
          <Legend />
          <p className="faint kind-note">
            {t(
              'Posiciones reales del juego, vistas desde arriba; las distancias están comprimidas para que quepa todo. Toca algo para ver sus datos; tócalo otra vez para acercarte. Pellizca o usa la rueda para hacer zoom.',
              'Real in-game positions, seen from above; distances are compressed so everything fits. Tap something to see its details; tap it again to zoom in. Pinch or scroll to zoom.',
            )}
          </p>
          <SourceNote data={data} />
        </section>

        <div className="stack">
          <Details
            data={data}
            sys={sys}
            byId={byId}
            star={star}
            focus={focus}
            sel={sel}
            visits={visits}
            sysPlaces={sysPlaces}
            hereAt={here?.at ?? null}
            onSelect={setSel}
            onFocus={(id) => (setFocusId(id), setSel(null))}
          />

          <section className="panel" aria-label={t('Ruta', 'Route')}>
            <div className="label"><Route size={14} aria-hidden /> {t('Tu última ruta', 'Your last route')}</div>
            {data.route.length === 0 ? (
              <div className="empty">{t('Sin viajes en la última sesión.', 'No travel in your last session.')}</div>
            ) : (
              <ol className="route">
                {compress(data.route).map((s, i, all) => (
                  <li key={i} className={i > 0 && s.system !== all[i - 1]?.system ? 'jump' : ''}>
                    <span className="route-time">{hhmm(s.ts)}</span>
                    <span>{s.name}</span>
                    <span className="faint">{s.planet ?? s.system ?? ''}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="panel" aria-label={t('Saltos entre sistemas', 'Jumps between systems')}>
            <div className="label"><Navigation size={14} aria-hidden /> {t('Saltos entre sistemas', 'Jumps between systems')}</div>
            <JumpGraph data={data} system={system} onPick={chooseSystem} />
          </section>
        </div>
      </div>
    </div>
  );
}

/** [singular es, singular en, plural es, plural en] */
const KIND_LABEL: Record<Kind | 'belt', [string, string, string, string]> = {
  star: ['Estrella', 'Star', 'estrellas', 'stars'],
  planet: ['Planeta', 'Planet', 'planetas', 'planets'],
  moon: ['Luna', 'Moon', 'lunas', 'moons'],
  city: ['Zona de aterrizaje', 'Landing zone', 'zonas de aterrizaje', 'landing zones'],
  station: ['Estación', 'Station', 'estaciones', 'stations'],
  gateway: ['Estación de salto', 'Jump point station', 'estaciones de salto', 'jump point stations'],
  outpost: ['Puesto avanzado', 'Outpost', 'puestos avanzados', 'outposts'],
  asteroid: ['Asteroide', 'Asteroid', 'asteroides', 'asteroids'],
  poi: ['Punto de interés', 'Point of interest', 'puntos de interés', 'points of interest'],
  belt: ['Cinturón de asteroides', 'Asteroid belt', 'cinturones de asteroides', 'asteroid belts'],
};

function kindLabel(t: Translate, k: Kind | 'belt') {
  const [es, en] = KIND_LABEL[k];
  return t(es, en);
}

/** "63 puestos avanzados", "1 luna". */
function kindCount(t: Translate, k: Kind | 'belt', c: number) {
  const [es, en, esPl, enPl] = KIND_LABEL[k];
  return `${c} ${c === 1 ? t(es.toLowerCase(), en.toLowerCase()) : t(esPl, enPl)}`;
}

/** km → "15 Gm", "1.290 Mm", "980 km". */
function dist(km: number) {
  if (km >= 1e6) return `${dec(km / 1e6, 1)} Gm`;
  if (km >= 1e4) return `${dec(km / 1e3, 0)} Mm`;
  return `${n(km)} km`;
}

interface DetailsProps {
  data: MapResponse;
  sys: Sys | null;
  byId: Map<string, Body>;
  star: Body | null;
  focus: Body | null;
  sel: Selection;
  visits: Map<string, number>;
  sysPlaces: Place[];
  hereAt: string | null;
  onSelect(s: Selection): void;
  onFocus(id: string): void;
}

function Details({ data, sys, byId, star, focus, sel, visits, sysPlaces, hereAt, onSelect, onFocus }: DetailsProps) {
  const { t } = useLang();
  const inside = (id: string, rootId: string) => {
    for (let b = byId.get(id); b; b = b.parent ? byId.get(b.parent) : undefined) if (b.id === rootId) return true;
    return false;
  };
  const kids = (id: string) => (sys?.bodies ?? []).filter((b) => b.parent === id);

  const PlaceList = ({ list, empty }: { list: Place[]; empty: string }) =>
    list.length === 0 ? (
      <div className="faint sm-none">{empty}</div>
    ) : (
      <>
        {list.slice(0, 40).map((p) => (
          <div key={p.code} className={`kv ${data.current?.code === p.code ? 'here-row' : ''}`}>
            <span>
              {p.at && byId.has(p.at) && p.exact ? (
                <button className="link-btn" onClick={() => onSelect({ type: 'body', id: p.at! })}>{p.name}</button>
              ) : (
                p.name
              )}
              {!p.exact && p.at && byId.get(p.at) && <span className="faint"> · {byId.get(p.at)!.name}</span>}
            </span>
            <span className="faint">{p.visits}× · {ago(p.last)}</span>
          </div>
        ))}
      </>
    );

  // Cinturón seleccionado.
  if (sel?.type === 'belt' && sys) {
    const belt = sys.belts.find((b) => b.name === sel.name) as Belt | undefined;
    if (belt) {
      const list = sysPlaces.filter((p) => p.belt === belt.name || (p.at && isInBelt(byId.get(p.at), belt)));
      return (
        <section className="panel" aria-label={belt.name ?? kindLabel(t, 'belt')}>
          <div className="label"><MapPin size={14} aria-hidden /> {kindLabel(t, 'belt')}</div>
          <h3 className="sm-title">{belt.name ?? kindLabel(t, 'belt')}</h3>
          <p className="faint sm-meta">{t(`De ${dist(belt.inner)} a ${dist(belt.outer)} de ${star?.name ?? sys.name}`, `${dist(belt.inner)} to ${dist(belt.outer)} from ${star?.name ?? sys.name}`)}</p>
          <PlaceList list={list} empty={t('Aún no has estado en este cinturón.', "You haven't been to this belt yet.")} />
        </section>
      );
    }
  }

  // Objeto seleccionado (o, si no hay, el planeta enfocado).
  const b = sel?.type === 'body' ? byId.get(sel.id) : (focus ?? undefined);
  if (b && sys) {
    const parent = b.parent ? byId.get(b.parent) : undefined;
    const fromStar = Math.hypot(b.x, b.y);
    const fromParent = parent && parent.kind !== 'star' ? Math.hypot(b.x - parent.x, b.y - parent.y) : null;
    const list = sysPlaces.filter((p) => p.at && inside(p.at, b.id));
    const ch = kids(b.id);
    const counts = new Map<Kind, number>();
    for (const c of ch) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
    const v = visits.get(b.id) ?? 0;
    return (
      <section className="panel" aria-label={b.name}>
        <div className="label"><MapPin size={14} aria-hidden /> {kindLabel(t, b.kind)}{parent && parent.kind !== 'star' ? ` · ${parent.name}` : ''}</div>
        <h3 className="sm-title">
          {b.name} {hereAt && inside(hereAt, b.id) && <span className="badge green">{hereAt === b.id ? t('Estás aquí', "You're here") : t('Estás dentro', "You're in here")}</span>}
        </h3>
        <p className="faint sm-meta">
          {b.kind !== 'star' && (fromParent != null && fromParent > 0 ? t(`A ${dist(fromParent)} de ${parent!.name}`, `${dist(fromParent)} from ${parent!.name}`) : t(`A ${dist(fromStar)} de ${star?.name ?? ''}`, `${dist(fromStar)} from ${star?.name ?? ''}`))}
          {b.radius ? ` · ${t('radio', 'radius')} ${n(b.radius)} km` : ''}
          {ch.length > 0 && ` · ${[...counts.entries()].sort((a, c) => c[1] - a[1]).map(([k, c]) => kindCount(t, k, c)).join(', ')}`}
        </p>
        {v > 0 && <p className="sm-visits">{t(`Has llegado aquí ${v} ${v === 1 ? 'vez' : 'veces'}.`, `You've arrived here ${v} ${v === 1 ? 'time' : 'times'}.`)}</p>}
        {ch.length > 0 && focus?.id !== b.id && (
          <button className="chip sm-zoom-in" onClick={() => onFocus(b.id)}>
            <ZoomIn size={16} aria-hidden /> {t(`Ver ${b.name} de cerca`, `Zoom into ${b.name}`)}
          </button>
        )}
        <PlaceList list={list} empty={t('Aún no has estado aquí.', "You haven't been here yet.")} />
      </section>
    );
  }

  // Resumen del sistema.
  const unplaced = sysPlaces.filter((p) => !p.at && !p.belt);
  const planets = (sys?.bodies ?? []).filter((x) => x.kind === 'planet').length;
  return (
    <section className="panel" aria-label={t('Lugares', 'Places')}>
      <div className="label"><MapPin size={14} aria-hidden /> {t(`Sistema ${sys?.name ?? ''}`, `${sys?.name ?? ''} system`)}</div>
      {sys && sys.bodies.length > 0 && (
        <p className="faint sm-meta">
          {kindCount(t, 'planet', planets)}
          {sys.belts.length ? ` · ${kindCount(t, 'belt', sys.belts.length)}` : ''}
          {` · ${t(`has estado en ${sysPlaces.length} sitios`, `you've been to ${sysPlaces.length} places`)}`}
        </p>
      )}
      <PlaceList list={sysPlaces} empty={t('Aún no has estado en ningún sitio de este sistema.', "You haven't been anywhere in this system yet.")} />
      {unplaced.length > 0 && sys && sys.bodies.length > 0 && (
        <p className="faint kind-note">
          {t(`Sin posición en el starmap del juego: ${unplaced.map((p) => p.name).join(', ')}.`, `No position in the game's starmap: ${unplaced.map((p) => p.name).join(', ')}.`)}
        </p>
      )}
    </section>
  );
}

function isInBelt(b: Body | undefined, belt: Belt) {
  if (!b) return false;
  const r = Math.hypot(b.x, b.y);
  return r >= belt.inner && r <= belt.outer && (b.kind === 'asteroid' || b.kind === 'station' || b.kind === 'city' || b.kind === 'moon');
}

function Legend() {
  const { t } = useLang();
  const items: [string, string, string][] = [
    ['planet', 'Planeta o luna', 'Planet or moon'],
    ['city', 'Zona de aterrizaje', 'Landing zone'],
    ['station', 'Estación', 'Station'],
    ['outpost', 'Puesto avanzado', 'Outpost'],
    ['here', 'Estás aquí', "You're here"],
    ['route', 'Última ruta', 'Last route'],
  ];
  return (
    <ul className="sm-legend" aria-label={t('Leyenda', 'Legend')}>
      {items.map(([k, es, en]) => (
        <li key={k}>
          <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden className={`sm-key k-${k}`}>
            {k === 'planet' && <circle cx="10" cy="10" r="6" />}
            {k === 'city' && (<><circle cx="10" cy="10" r="6" /><circle cx="10" cy="10" r="2.4" className="sm-dot" /></>)}
            {k === 'station' && <rect x="5" y="5" width="10" height="10" transform="rotate(45 10 10)" />}
            {k === 'outpost' && <circle cx="10" cy="10" r="3.5" />}
            {k === 'here' && <circle cx="10" cy="10" r="7" />}
            {k === 'route' && <line x1="1" y1="10" x2="19" y2="10" />}
          </svg>
          {t(es, en)}
        </li>
      ))}
    </ul>
  );
}

function SourceNote({ data }: { data: MapResponse }) {
  const { t } = useLang();
  const build = data.starmap.build;
  if (!build) return null;
  const behind = data.gameBuild && !build.includes(data.gameBuild);
  return (
    <p className="faint kind-note">
      {t(`Datos del starmap: Star Citizen Wiki (scunpacked-data), parche ${build}.`, `Starmap data: Star Citizen Wiki (scunpacked-data), patch ${build}.`)}
      {behind &&
        ` ${t(
          `Tu juego va por el build ${data.gameBuild}: el mapa se actualizará cuando se publiquen los datos de ese parche.`,
          `Your game is on build ${data.gameBuild}: the map will update when that patch's data is published.`,
        )}`}
    </p>
  );
}

function mostVisitedSystem(places: Place[]): string | null {
  const by = new Map<string, number>();
  for (const p of places) if (p.system) by.set(p.system, (by.get(p.system) ?? 0) + p.visits);
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Quita repeticiones seguidas del mismo sitio. */
function compress<T extends { code: string }>(route: T[]): T[] {
  return route.filter((s, i) => s.code !== route[i - 1]?.code);
}

/** Posiciones fijas de los sistemas conocidos en el gráfico de saltos; los demás, en círculo. */
const NODE_POS: Record<string, [number, number]> = { Stanton: [140, 70], Pyro: [270, 24], Nyx: [270, 116], Terra: [36, 70] };

function JumpGraph({ data, system, onPick }: { data: MapResponse; system: string | null; onPick(s: string): void }) {
  const { t } = useLang();
  const names = [...new Set(data.jumps.flatMap((j) => [j.a, j.b]))];
  if (!names.length) return <div className="faint sm-none">{t('Sin datos de saltos todavía.', 'No jump data yet.')}</div>;
  const available = new Set(data.systems.filter((s) => s.bodies.length).map((s) => s.name));
  const visited = new Set(data.places.map((p) => p.system));
  const extra = names.filter((s) => !NODE_POS[s]);
  const pos = (s: string): [number, number] => {
    const fixed = NODE_POS[s];
    if (fixed) return fixed;
    const i = extra.indexOf(s);
    const a = (i / Math.max(1, extra.length)) * Math.PI * 2;
    return [330 + 24 * Math.cos(a), 70 + 34 * Math.sin(a)];
  };
  return (
    <svg viewBox="0 0 360 170" className="jump-graph" role="img" aria-label={t('Saltos entre sistemas', 'Jumps between systems')}>
      {data.jumps.map((j) => {
        const [x1, y1] = pos(j.a);
        const [x2, y2] = pos(j.b);
        const open = available.has(j.a) && available.has(j.b);
        return (
          <g key={`${j.a}-${j.b}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} className={`jump-line ${j.visits ? 'used' : ''} ${open ? '' : 'closed'}`} />
            {j.visits > 0 && (
              <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle" className="orbit-count">
                {j.visits}×
              </text>
            )}
          </g>
        );
      })}
      {names.map((s) => {
        const [x, y] = pos(s);
        const open = available.has(s);
        return (
          <g
            key={s}
            className={`sys-node-g ${open ? 'open' : 'closed'}`}
            role={open ? 'button' : undefined}
            tabIndex={open ? 0 : undefined}
            onClick={() => open && onPick(s)}
            onKeyDown={(e) => open && (e.key === 'Enter' || e.key === ' ') && onPick(s)}
          >
            <circle cx={x} cy={y} r={11} className={`sys-node ${visited.has(s) ? 'visited' : ''} ${data.current?.system === s ? 'here-fill' : ''} ${system === s ? 'on' : ''}`} />
            <text x={x + (x > 200 ? 18 : 0)} y={x > 200 ? y + 5 : y + 30} textAnchor={x > 200 ? 'start' : 'middle'} className="orbit-label">{s}</text>
            {!open && <text x={x} y={y + 46} textAnchor="middle" className="orbit-sub">{t('sin datos', 'no data')}</text>}
          </g>
        );
      })}
    </svg>
  );
}
