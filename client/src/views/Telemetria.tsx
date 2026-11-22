import { CircleHelp, Copy, Crosshair, HeartPulse, Pause, Play, Power, Rocket, ShieldCheck, Terminal, Thermometer, TriangleAlert, UserRound, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { n } from '../format.ts';
import { locale, tr, useLang } from '../lang.tsx';
import { getJson } from '../live.tsx';

/**
 * Telemetría del juego (gRPC local de Star Citizen, solo lectura): personaje, nave y armas en directo.
 * Diseño: client/DESIGN.md › Telemetría. Los nombres del juego (class_name, armas, asientos) van tal cual.
 */

// ---------------------------------------------------------------- datos (espejo de server/src/game/telemetry.ts)

interface Vital {
  current: number;
  max: number;
}

interface Actor {
  health: Vital;
  oxygen: Vital;
  hunger: Vital;
  thirst: Vital;
  bodyTemperature: number;
  intoxication: number;
  heartRate: number;
  gravity: number;
  pressure: number;
  locomotion: number;
  crewRole: number;
  seatName: string;
  uecBalance: number | null;
  externalTemperature: number;
  radiation: number;
  breathable: boolean;
}

interface Vehicle {
  name: string;
  className: string;
  type: number;
  annunciators: number[];
  landed: boolean;
  gear: number;
  vtol: number;
  speed: number;
  hydrogen: number;
  quantum: number | null;
  gForce: number;
  gForceMax: number;
  boost: { engaged: boolean; output: number; reserves: number };
  altitude: number | null;
  radarAltitude: number | null;
  verticalSpeed: number;
  atmosphericDensity: number | null;
  heading: number;
  power: boolean[];
  ifcs: boolean[];
}

interface Weapons {
  weapons: { name: string; powered: boolean; ready: boolean; inGroup: boolean }[];
  countermeasures: { type: number; amount: number }[];
}

type Link = 'off' | 'waiting' | 'live' | 'stale';

interface Snapshot {
  link: Link;
  port: number | null;
  hz: number;
  frames: number;
  lastFrameAgoMs: number | null;
  waitingMs: number | null;
  blocks: Record<string, number | null>;
  actor: Actor | null;
  vehicle: Vehicle | null;
  weapons: Weapons | null;
  debug?: {
    raw: Record<string, unknown> | null;
    rawBytes: number;
    hzHistory: number[];
    intervalMs: { last: number | null; min: number | null; max: number | null };
  };
}

type T = ReturnType<typeof useLang>['t'];
type Bi = [string, string];

// ---------------------------------------------------------------- formato

const fx = (v: number, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const pct = (v: Vital) => (v.max > 0 ? (100 * v.current) / v.max : v.current);
const level = (p: number) => (p > 50 ? 'ok' : p > 25 ? 'warn' : 'bad');
const secs = (ms: number) => fx(ms / 1000, ms < 10_000 ? 1 : 0);

function waited(ms: number, t: T): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  return t(`${Math.floor(s / 60)} min ${s % 60} s`, `${Math.floor(s / 60)} min ${s % 60} s`);
}

/** `KLWE_LaserRepeater_S2_949464407782` → nombre e id de entidad, sin tocar el nombre. */
function splitId(name: string): [string, string] {
  const m = /^(.*?)_(\d{6,})$/.exec(name);
  return m ? [m[1]!, m[2]!] : [name, ''];
}

const ANN: { code: string; name: Bi }[] = [
  { code: 'PWR', name: ['Energía', 'Power'] },
  { code: 'WPN', name: ['Armas', 'Weapons'] },
  { code: 'THR', name: ['Propulsores', 'Thrusters'] },
  { code: 'SHLD', name: ['Escudos', 'Shields'] },
  { code: 'COOL', name: ['Refrigeración', 'Cooling'] },
  { code: 'QDRV', name: ['Cuántico', 'Quantum'] },
  { code: 'RADR', name: ['Radar', 'Radar'] },
  { code: 'PROX', name: ['Proximidad', 'Proximity'] },
  { code: 'HIT', name: ['Impacto', 'Hit'] },
  { code: 'MISL', name: ['Misil', 'Missile'] },
];
const ANN_STATE: Record<number, { label: Bi; tone: 'nom' | 'off' | 'minor' | 'major'; flash: boolean }> = {
  1: { label: ['Normal', 'Nominal'], tone: 'nom', flash: false },
  2: { label: ['Apagado', 'Off'], tone: 'off', flash: false },
  3: { label: ['Aviso', 'Caution'], tone: 'minor', flash: true },
  4: { label: ['Aviso', 'Caution'], tone: 'minor', flash: false },
  5: { label: ['Alerta', 'Warning'], tone: 'major', flash: true },
  6: { label: ['Alerta', 'Warning'], tone: 'major', flash: false },
};
const UNKNOWN_STATE = { label: ['Desconocido', 'Unknown'] as Bi, tone: 'off' as const, flash: false };

const POWER: Bi[] = [
  ['Planta de energía', 'Power plant'], ['Motores', 'Engines'], ['Armas', 'Weapons'], ['Refrigeradores', 'Coolers'],
  ['Soporte vital', 'Life support'], ['Gravedad', 'Gravity'], ['Sensores', 'Sensors'], ['Gen. de escudo', 'Shield gen.'], ['Emis. de escudo', 'Shield emit.'],
];
const VEHICLE_TYPE: Record<number, Bi> = { 1: ['Nave espacial', 'Spaceship'], 2: ['Vehículo de tierra', 'Ground vehicle'], 3: ['Gravlev', 'Gravlev'], 4: ['Barco', 'Boat'] };
const GEAR: Record<number, Bi> = { 1: ['Tren recogido', 'Gear up'], 2: ['Tren bajando', 'Gear lowering'], 3: ['Tren fuera', 'Gear down'], 4: ['Tren subiendo', 'Gear raising'] };
const VTOL: Record<number, Bi> = { 1: ['VTOL recogida', 'VTOL retracted'], 2: ['VTOL desplegándose', 'VTOL deploying'], 3: ['VTOL desplegada', 'VTOL deployed'], 4: ['VTOL recogiéndose', 'VTOL retracting'] };
const LOCOMOTION: Record<number, Bi> = { 1: ['A pie', 'On foot'], 2: ['EVA', 'EVA'], 3: ['Sentado', 'Seated'] };
const ROLE: Record<number, Bi> = { 1: ['Piloto', 'Pilot'], 2: ['Artillero', 'Gunner'], 3: ['Tripulante', 'Crew'] };
const CM: Record<number, string> = { 1: 'Decoy', 2: 'Noise' };

const COMMAND = [`$env:GRPC_CLIENT_SERVER_ENABLED = 'true'`, `& 'C:\\Program Files\\Roberts Space Industries\\RSI Launcher\\RSI Launcher.exe'`];

// ---------------------------------------------------------------- vista

export function Telemetria() {
  const { t } = useLang();
  const [view, setView] = useState<'panel' | 'debug'>('panel');
  const [help, setHelp] = useState(false);
  const [paused, setPaused] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [frozen, setFrozen] = useState<Snapshot['debug'] | null>(null);
  const debug = view === 'debug';

  // 4 veces por segundo (2 en depuración, que pesa más). Con la pestaña oculta no se pide nada.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!document.hidden) {
        try {
          const s = await getJson<Snapshot>(debug ? '/api/telemetry?debug=1' : '/api/telemetry');
          if (alive) {
            setSnap(s);
            setFailed(false);
          }
        } catch {
          if (alive) setFailed(true);
        }
      }
      if (alive) timer = setTimeout(poll, debug ? 500 : 250);
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [debug]);

  const link: Link = failed || !snap ? 'off' : snap.link;
  const showHelp = help || link === 'off';
  const dbg = paused ? frozen : snap?.debug;

  const togglePause = () => {
    if (!paused) setFrozen(snap?.debug ?? null);
    setPaused(!paused);
  };

  let body;
  if (showHelp) body = <HelpBody t={t} onBack={help && link !== 'off' ? () => setHelp(false) : undefined} />;
  else if (link === 'waiting') body = <WaitBody t={t} ms={snap?.waitingMs ?? 0} onHelp={() => setHelp(true)} />;
  else if (debug && snap) body = <DebugBody t={t} snap={snap} dbg={dbg ?? null} paused={paused} onPause={togglePause} />;
  else if (snap?.vehicle && snap.actor) body = <ShipBody t={t} actor={snap.actor} vehicle={snap.vehicle} weapons={snap.weapons} />;
  else if (snap?.actor) body = <FootBody t={t} actor={snap.actor} />;
  else body = <WaitBody t={t} ms={snap?.waitingMs ?? 0} onHelp={() => setHelp(true)} />;

  return (
    <div className={`tl ${link === 'stale' && !showHelp ? 'stale' : ''}`}>
      <Strip
        t={t}
        link={link}
        snap={snap}
        failed={failed}
        paused={paused && debug}
        view={view}
        help={showHelp}
        onView={(v) => {
          setView(v);
          setHelp(false);
          if (v === 'panel') setPaused(false);
        }}
        onHelp={() => setHelp(!help)}
      />
      <div className="tl-body">{body}</div>
    </div>
  );
}

function Strip({
  t, link, snap, failed, paused, view, help, onView, onHelp,
}: {
  t: T;
  link: Link;
  snap: Snapshot | null;
  failed: boolean;
  paused: boolean;
  view: 'panel' | 'debug';
  help: boolean;
  onView: (v: 'panel' | 'debug') => void;
  onHelp: () => void;
}) {
  const hz = fx(snap?.hz ?? 0, 0);
  let title: string;
  let sub: string;
  if (failed) {
    title = t('Apagada', 'Off');
    sub = t('Sin conexión con CommandGlass en el PC', 'No connection to CommandGlass on the PC');
  } else if (link === 'off') {
    title = t('Apagada', 'Off');
    sub = t('El juego no tiene la telemetría activada, o está cerrado', "The game doesn't have telemetry turned on, or it's closed");
  } else if (link === 'waiting') {
    title = t('Esperando al juego', 'Waiting for the game');
    sub = t(`Conectado al puerto ${snap?.port ?? 2942}, sin datos todavía`, `Connected to port ${snap?.port ?? 2942}, no data yet`);
  } else if (link === 'stale') {
    const s = secs(snap?.lastFrameAgoMs ?? 0);
    title = t(`Sin datos desde hace ${s} s`, `No data for ${s} s`);
    sub = t('Normal en pantallas de carga', 'Normal during loading screens');
  } else {
    title = paused ? t(`En pausa · ${hz} Hz`, `Paused · ${hz} Hz`) : t(`Recibiendo · ${hz} Hz`, `Receiving · ${hz} Hz`);
    const s = secs(snap?.lastFrameAgoMs ?? 0);
    sub = t(`Último fotograma hace ${s} s`, `Last frame ${s} s ago`);
  }
  const receiving = link === 'live' || link === 'stale';
  const fresh = (k: string) => (snap?.blocks[k] ?? Infinity) <= 1500;
  const blocks: [string, boolean][] = [
    [t('Personaje', 'Character'), fresh('actor')],
    [t('Nave', 'Ship'), fresh('vehicle')],
    [t('Armas', 'Weapons'), fresh('weapons')],
  ];

  return (
    <div className={`tl-strip ${link}`}>
      <span className="tl-dot" aria-hidden />
      <div className="tl-strip-text">
        <strong>{title}</strong>
        <small>{sub}</small>
      </div>
      {receiving && (
        <div className="tl-blocks" aria-label={t('Bloques que llegan', 'Blocks arriving')}>
          {blocks.map(([label, on]) => (
            <span key={label} className={`tl-chip ${on ? 'on' : ''}`}>
              {label}
            </span>
          ))}
        </div>
      )}
      <span className="tl-spacer" />
      <span className="badge amber tl-exp">{t('Experimental', 'Experimental')}</span>
      {receiving && (
        <div className="tl-tabs" role="tablist" aria-label={t('Vista', 'View')}>
          <button type="button" role="tab" aria-selected={view === 'panel' && !help} className={view === 'panel' && !help ? 'on' : ''} onClick={() => onView('panel')}>
            {t('Panel', 'Panel')}
          </button>
          <button type="button" role="tab" aria-selected={view === 'debug' && !help} className={view === 'debug' && !help ? 'on' : ''} aria-label={t('Depuración', 'Debug')} onClick={() => onView('debug')}>
            <Terminal size={16} strokeWidth={1.8} aria-hidden />
            <span>{t('Depuración', 'Debug')}</span>
          </button>
        </div>
      )}
      <button
        type="button"
        className={`tl-help-btn ${help ? 'on' : ''}`}
        aria-label={t('Cómo se activa la telemetría', 'How to turn on telemetry')}
        aria-pressed={help}
        onClick={onHelp}
        disabled={link === 'off'}
      >
        <CircleHelp size={20} strokeWidth={1.7} aria-hidden />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- piezas

function Bar({ value, tone }: { value: number; tone: 'ok' | 'warn' | 'bad' | 'accent' }) {
  return (
    <span className="tl-track" aria-hidden>
      <span className={`tl-fill ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </span>
  );
}

function Unit({ children }: { children: string }) {
  return <small className="tl-unit">{children}</small>;
}

function PanelHead({ icon: Icon, title, extra }: { icon: typeof Zap; title: string; extra?: ReactNode }) {
  return (
    <div className="label">
      <Icon size={18} strokeWidth={1.6} aria-hidden />
      <span className="tl-grow">{title}</span>
      {extra}
    </div>
  );
}

function vitalsOf(a: Actor, t: T) {
  const rows: { k: string; v: string; u: string; bar: number | null; tone: 'ok' | 'warn' | 'bad'; warn: boolean }[] = [];
  const add = (k: string, vt: Vital, low: number) => {
    const p = pct(vt);
    rows.push({ k, v: fx(p, 0), u: '%', bar: p, tone: level(p), warn: p <= low });
  };
  add(t('Salud', 'Health'), a.health, 50);
  add(t('Oxígeno', 'Oxygen'), a.oxygen, 50);
  add(t('Hambre', 'Hunger'), a.hunger, 25);
  add(t('Sed', 'Thirst'), a.thirst, 25);
  rows.push({ k: t('Temp. corporal', 'Body temp.'), v: fx(a.bodyTemperature, 1), u: '°C', bar: null, tone: 'ok', warn: a.bodyTemperature >= 38 || a.bodyTemperature <= 35 });
  rows.push({ k: t('Pulso', 'Heart rate'), v: fx(a.heartRate, 0), u: t('lpm', 'bpm'), bar: null, tone: 'ok', warn: a.heartRate >= 110 });
  rows.push({ k: t('Drogas', 'Drugs'), v: fx(a.intoxication, 0), u: '%', bar: a.intoxication, tone: a.intoxication > 0 ? 'warn' : 'ok', warn: a.intoxication > 0 });
  return rows;
}

const hpa = (atm: number) => n(atm * 1013.25);
const bi = (t: T, b: Bi | undefined, fallback: string) => (b ? t(b[0], b[1]) : fallback);

// ---------------------------------------------------------------- sentado en la nave

function ShipBody({ t, actor, vehicle, weapons }: { t: T; actor: Actor; vehicle: Vehicle; weapons: Weapons | null }) {
  return (
    <div className="tl-ship">
      <CharacterPanel t={t} a={actor} />
      <ShipPanel t={t} v={vehicle} />
      <div className="tl-sys">
        <PowerPanel t={t} v={vehicle} />
        <WeaponsPanel t={t} w={weapons} />
      </div>
    </div>
  );
}

function CharacterPanel({ t, a }: { t: T; a: Actor }) {
  return (
    <section className="panel tl-pj" aria-label={t('Personaje', 'Character')}>
      <PanelHead icon={UserRound} title={t('Personaje', 'Character')} extra={<span className="badge">{bi(t, LOCOMOTION[a.locomotion], String(a.locomotion))}</span>} />
      <div className="tl-vitals">
        {vitalsOf(a, t).map((r) => (
          <div key={r.k} className="tl-vital">
            <span className="k">{r.k}</span>
            {r.bar == null ? <span aria-hidden /> : <Bar value={r.bar} tone={r.tone} />}
            <span className={`v ${r.warn ? 'warn' : ''}`}>
              {r.v}
              <Unit>{r.u}</Unit>
            </span>
          </div>
        ))}
      </div>
      <h3 className="tl-sub">{t('Entorno y puesto', 'Environment and seat')}</h3>
      <div className="tl-env">
        <Cell k={t('Exterior', 'Outside')} v={fx(a.externalTemperature, 0)} u="°C" />
        <Cell k={t('Radiación', 'Radiation')} v={fx(a.radiation, a.radiation > 0 && a.radiation < 10 ? 1 : 0)} u="R/s" tone={a.radiation > 0 ? 'warn' : undefined} />
        <Cell k={t('Atmósfera', 'Atmosphere')} v={a.breathable ? t('Respirable', 'Breathable') : t('No respirable', 'Not breathable')} tone={a.breathable ? 'ok' : 'bad'} />
        <Cell k={t('Gravedad', 'Gravity')} v={fx(a.gravity, 2)} u="G" />
        <Cell k={t('Presión', 'Pressure')} v={hpa(a.pressure)} u="hPa" />
        <Cell k={t('Puesto', 'Seat')} v={a.crewRole ? bi(t, ROLE[a.crewRole], String(a.crewRole)) : '—'} />
      </div>
      {a.seatName && <div className="tl-mono tl-seat">{a.seatName}</div>}
      <Balance t={t} uec={a.uecBalance} />
    </section>
  );
}

function Cell({ k, v, u, tone }: { k: string; v: string; u?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="tl-cell">
      <span className="k">{k}</span>
      <span className={`v ${tone ?? ''}`}>
        {v}
        {u && <Unit>{u}</Unit>}
      </span>
    </div>
  );
}

function Balance({ t, uec, big }: { t: T; uec: number | null; big?: boolean }) {
  return (
    <div className={`tl-balance ${big ? 'big' : ''}`}>
      <span className="k">{t('Saldo', 'Balance')}</span>
      <strong>
        {uec == null ? '—' : n(uec)}
        <Unit>aUEC</Unit>
      </strong>
    </div>
  );
}

function ShipPanel({ t, v }: { t: T; v: Vehicle }) {
  const chips = [v.landed ? t('Aterrizada', 'Landed') : t('En vuelo', 'Flying')];
  if (GEAR[v.gear]) chips.push(bi(t, GEAR[v.gear], ''));
  if (VTOL[v.vtol]) chips.push(bi(t, VTOL[v.vtol], ''));
  const noData = t('Sin dato en el espacio', 'No data in space');
  return (
    <section className="panel tl-nave" aria-label={t('Nave', 'Ship')}>
      <PanelHead icon={Rocket} title={t('Nave', 'Ship')} extra={<span className="badge green">{t('Encendida', 'Powered')}</span>} />
      <div className="tl-id">
        <div className="tl-id-name">
          <span className="tl-class">{v.className || v.name}</span>
          <span className="tl-type">{bi(t, VEHICLE_TYPE[v.type], t('Vehículo', 'Vehicle'))}</span>
        </div>
        <div className="tl-flight">
          {chips.map((c) => (
            <span key={c} className="tl-chip plain">
              {c}
            </span>
          ))}
        </div>
      </div>
      <div className="tl-ann-head">
        <h3 className="tl-sub flat">{t('Luces de aviso', 'Warning lights')}</h3>
        <div className="tl-legend" aria-hidden>
          <span><i className="nom" />{t('Normal', 'Nominal')}</span>
          <span><i className="minor" />{t('Aviso', 'Caution')}</span>
          <span><i className="major" />{t('Alerta', 'Warning')}</span>
          <span><i className="off" />{t('Apagado', 'Off')}</span>
        </div>
      </div>
      <div className="tl-ann">
        {ANN.map((a, i) => {
          const s = ANN_STATE[v.annunciators[i] ?? 0] ?? UNKNOWN_STATE;
          return (
            <div key={a.code} className={`tl-light ${s.tone} ${s.flash ? 'flash' : ''}`}>
              <span className="code">{a.code}</span>
              <span className="name">{t(a.name[0], a.name[1])}</span>
              <span className="state">{t(s.label[0], s.label[1])}</span>
            </div>
          );
        })}
      </div>
      <div className="tl-hero">
        <div>
          <div className="k">{t('Velocidad', 'Speed')}</div>
          <div className="tl-speed">
            {fx(v.speed, 0)}
            <Unit>m/s</Unit>
          </div>
        </div>
        <Heading t={t} deg={v.heading} />
        <div className="right">
          <div className="k">{t('Vertical', 'Vertical')}</div>
          <div className="tl-vs">
            {fx(v.verticalSpeed, 1)}
            <Unit>m/s</Unit>
          </div>
        </div>
      </div>
      <div className="tl-instr">
        <Instr k={t('Hidrógeno', 'Hydrogen')} v={fx(v.hydrogen * 100, 1)} u="%" bar={v.hydrogen * 100} tone={v.hydrogen < 0.25 ? 'warn' : 'accent'} />
        <Instr
          k={t('Boost', 'Boost')}
          chip={v.boost.engaged ? t('Activo', 'Active') : undefined}
          v={fx(v.boost.reserves * 100, 0)}
          u="%"
          bar={v.boost.reserves * 100}
          tone={v.boost.reserves < 0.3 ? 'warn' : 'accent'}
        />
        <Instr k={t('Fuerza G', 'G-force')} v={fx(v.gForce, 1)} u="G" note={t(`Máx. ${fx(v.gForceMax, 1)} G`, `Max ${fx(v.gForceMax, 1)} G`)} />
        <Instr k={t('Altitud', 'Altitude')} v={v.altitude == null ? '—' : n(v.altitude)} u={v.altitude == null ? '' : 'm'} note={v.altitude == null ? noData : undefined} />
        <Instr k={t('Alt. radar', 'Radar alt.')} v={v.radarAltitude == null ? '—' : n(v.radarAltitude)} u={v.radarAltitude == null ? '' : 'm'} note={v.radarAltitude == null ? noData : undefined} />
        <Instr
          k={t('Densidad', 'Density')}
          v={v.atmosphericDensity == null ? '—' : fx(v.atmosphericDensity, 2)}
          u={v.atmosphericDensity == null ? '' : 'kg/m³'}
          note={v.atmosphericDensity == null ? t('Fuera de la atmósfera', 'Outside the atmosphere') : undefined}
        />
      </div>
    </section>
  );
}

function Instr({ k, v, u, bar, tone, note, chip }: { k: string; v: string; u: string; bar?: number; tone?: 'warn' | 'accent'; note?: string; chip?: string }) {
  return (
    <div className="tl-ins">
      <span className="k">
        {k}
        {chip && <span className="tl-mini">{chip}</span>}
      </span>
      <span className={`v ${v === '—' ? 'none' : ''}`}>
        {v}
        {u && <Unit>{u}</Unit>}
      </span>
      {bar != null && <Bar value={bar} tone={tone ?? 'accent'} />}
      {note && <small className="tl-note">{note}</small>}
    </div>
  );
}

/** Cinta de rumbo: ±40° alrededor del actual, con marcas cada 5° y número cada 10°. */
function Heading({ t, deg }: { t: T; deg: number }) {
  const ticks = [];
  for (let d = Math.floor((deg - 40) / 5) * 5; d <= deg + 40; d += 5) {
    const left = 50 + (d - deg) * (50 / 40);
    const major = d % 10 === 0;
    const labelled = d % 20 === 0;
    ticks.push(
      <span key={d} className={`tick ${major ? 'major' : ''}`} style={{ left: `${left}%` }}>
        {labelled && <b>{String(((d % 360) + 360) % 360).padStart(3, '0')}</b>}
      </span>,
    );
  }
  return (
    <div className="tl-heading">
      <span className="k">
        {t('Rumbo', 'Heading')} <strong>{String(Math.round(deg) % 360).padStart(3, '0')}°</strong>
      </span>
      <div className="tl-tape" aria-hidden>
        {ticks}
        <span className="mark" />
      </div>
    </div>
  );
}

function PowerPanel({ t, v }: { t: T; v: Vehicle }) {
  const on = v.power.filter(Boolean).length;
  return (
    <section className="panel tl-power" aria-label={t('Energía', 'Power')}>
      <PanelHead icon={Zap} title={t('Energía', 'Power')} extra={<span className="tl-count">{t(`${on} de ${v.power.length}`, `${on} of ${v.power.length}`)}</span>} />
      <div className="tl-power-grid">
        {POWER.map((label, i) => (
          <div key={label[0]} className={`tl-sysbox ${v.power[i] ? 'on' : ''}`}>
            <span className="sdot" aria-hidden />
            <span className="txt">{t(label[0], label[1])}</span>
            {!v.power[i] && <span className="tl-sr">{t('apagado', 'off')}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function WeaponsPanel({ t, w }: { t: T; w: Weapons | null }) {
  const list = w?.weapons ?? [];
  const ready = list.filter((x) => x.ready).length;
  return (
    <section className="panel tl-weapons" aria-label={t('Armas', 'Weapons')}>
      <PanelHead
        icon={Crosshair}
        title={t('Armas', 'Weapons')}
        extra={list.length ? <span className="tl-count">{t(`${ready} de ${list.length} listas`, `${ready} of ${list.length} ready`)}</span> : undefined}
      />
      {list.length ? (
        <div className="tl-wlist">
          <div className="tl-wrow head" aria-hidden>
            <span />
            <span>{t('Energía', 'Power')}</span>
            <span>{t('Lista', 'Ready')}</span>
            <span>{t('Grupo', 'Group')}</span>
          </div>
          {list.map((x, i) => {
            const [name, id] = splitId(x.name);
            return (
              <div key={`${x.name}-${i}`} className="tl-wrow">
                <div className="tl-wname">
                  <div>{name}</div>
                  {id && <div className="tl-mono">{id}</div>}
                </div>
                <span className={`pip ${x.powered ? 'on' : ''}`} aria-label={x.powered ? t('Con energía', 'Powered') : t('Sin energía', 'Unpowered')} />
                <span className={`pip ${x.ready ? 'on' : ''}`} aria-label={x.ready ? t('Lista para disparar', 'Ready to fire') : t('No lista', 'Not ready')} />
                <span className={`pip ${x.inGroup ? 'on' : ''}`} aria-label={x.inGroup ? t('En el grupo activo', 'In the active group') : t('Fuera del grupo', 'Not in the group')} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty">{t('Sin armas en esta nave, o aún no han llegado.', 'No weapons on this ship, or they have not arrived yet.')}</div>
      )}
      {!!w?.countermeasures.length && (
        <div className="tl-cm">
          {w.countermeasures.map((c) => (
            <div key={c.type} className="tl-cmbox">
              <span className="k">{CM[c.type] ?? t(`Tipo ${c.type}`, `Type ${c.type}`)}</span>
              <strong className={c.amount <= 5 ? 'warn' : ''}>{n(c.amount)}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- a pie

function FootBody({ t, actor: a }: { t: T; actor: Actor }) {
  const tiles = vitalsOf(a, t);
  return (
    <div className="tl-foot">
      <section className="panel tl-phys" aria-label={t('Estado físico', 'Physical status')}>
        <PanelHead icon={HeartPulse} title={t('Estado físico', 'Physical status')} extra={<span className="badge">{bi(t, LOCOMOTION[a.locomotion], String(a.locomotion))}</span>} />
        <div className="tl-tiles">
          {tiles.map((r) => (
            <div key={r.k} className="tl-tile">
              <span className="k">{r.k}</span>
              <span className={`v ${r.warn ? 'warn' : ''}`}>
                {r.v}
                <Unit>{r.u}</Unit>
              </span>
              {r.bar == null ? <span className="tl-track hidden" aria-hidden /> : <Bar value={r.bar} tone={r.tone} />}
            </div>
          ))}
          <div className="tl-tile">
            <span className="k">{t('Gravedad', 'Gravity')}</span>
            <span className="v">
              {fx(a.gravity, 2)}
              <Unit>G</Unit>
            </span>
            <span className="tl-track hidden" aria-hidden />
          </div>
        </div>
      </section>
      <div className="tl-envcol">
        <section className="panel tl-suit" aria-label={t('Traje y entorno', 'Suit and environment')}>
          <PanelHead icon={Thermometer} title={t('Traje y entorno', 'Suit and environment')} />
          <Row k={t('Temperatura exterior', 'Outside temperature')} v={fx(a.externalTemperature, 0)} u="°C" />
          <Row k={t('Radiación', 'Radiation')} v={fx(a.radiation, a.radiation > 0 && a.radiation < 10 ? 1 : 0)} u="R/s" tone={a.radiation > 0 ? 'warn' : undefined} />
          <Row k={t('Atmósfera', 'Atmosphere')} v={a.breathable ? t('Respirable', 'Breathable') : t('No respirable', 'Not breathable')} tone={a.breathable ? 'ok' : 'bad'} />
          <Row k={t('Presión', 'Pressure')} v={hpa(a.pressure)} u="hPa" />
        </section>
        <section className="panel tl-balance-panel" aria-label={t('Saldo', 'Balance')}>
          <Balance t={t} uec={a.uecBalance} big />
        </section>
      </div>
      <div className="tl-noship">
        <Rocket size={22} strokeWidth={1.5} aria-hidden />
        <div>
          <strong>{t('Sin nave', 'No ship')}</strong>
          <div>{t('La nave y sus armas aparecen aquí cuando te sientas en una y la enciendes.', 'The ship and its weapons show up here when you sit in one and power it on.')}</div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, u, tone }: { k: string; v: string; u?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="tl-row">
      <span className="k">{k}</span>
      <span className={`v ${tone ?? ''}`}>
        {v}
        {u && <Unit>{u}</Unit>}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- sin datos

function HelpBody({ t, onBack }: { t: T; onBack?: () => void }) {
  return (
    <div className="tl-help">
      <section className="panel tl-steps" aria-label={t('Activar la telemetría', 'Turn on telemetry')}>
        <PanelHead
          icon={Power}
          title={t('Activar la telemetría del juego', "Turn on the game's telemetry")}
          extra={
            onBack && (
              <button type="button" className="tl-btn" onClick={onBack}>
                {t('Volver al panel', 'Back to panel')}
              </button>
            )
          }
        />
        <p>
          {t(
            'Star Citizen puede enviar a CommandGlass el estado de tu personaje y de tu nave unas 18 veces por segundo. Viene apagado: se enciende al abrir el RSI Launcher de una forma concreta, y solo para esa vez.',
            "Star Citizen can send CommandGlass the state of your character and ship about 18 times a second. It's off by default: it turns on when you open the RSI Launcher in a specific way, and only for that time.",
          )}
        </p>
        <ol>
          <li>
            <span className="num">1</span>
            <div>
              <strong>{t('Cierra el RSI Launcher del todo,', 'Close the RSI Launcher completely,')}</strong>{' '}
              {t(
                'también desde su icono junto al reloj de Windows. Si sigue abierto en segundo plano, no se activa.',
                "including from its icon next to the Windows clock. If it keeps running in the background, it won't turn on.",
              )}
            </div>
          </li>
          <li>
            <span className="num">2</span>
            <div>
              <strong>{t('En el PC, abre PowerShell y pega esto.', 'On the PC, open PowerShell and paste this.')}</strong>{' '}
              {t('Abre el launcher con la telemetría encendida.', 'It opens the launcher with telemetry on.')}
              <div className="tl-code">
                {COMMAND.map((l) => (
                  <div key={l}>{l}</div>
                ))}
              </div>
              <div className="sub">{t('Si instalaste el launcher en otra carpeta, cambia la ruta.', 'If you installed the launcher in another folder, change the path.')}</div>
            </div>
          </li>
          <li>
            <span className="num">3</span>
            <div>
              <strong>{t('Entra al universo.', 'Enter the universe.')}</strong>{' '}
              {t('Esta pestaña empieza a recibir datos sola, sin tocar nada más.', 'This tab starts receiving data by itself.')}
            </div>
          </li>
        </ol>
        <div className="tl-safe">
          <ShieldCheck size={18} strokeWidth={1.7} aria-hidden />
          <span>
            {t('No cambia nada en tu PC ni en el juego. Al cerrar el launcher, todo queda como estaba.', 'Nothing changes on your PC or in the game. When you close the launcher, everything goes back to how it was.')}
          </span>
        </div>
      </section>
      <div className="tl-helpcol">
        <section className="panel" aria-label={t('Qué llega y cuándo', 'What arrives and when')}>
          <div className="label">{t('Qué llega y cuándo', 'What arrives and when')}</div>
          <div className="tl-when">
            <span className="d ok" aria-hidden />
            <span>
              <strong>{t('Personaje', 'Character')}</strong>
              {t(', siempre que estás en el universo: constantes, entorno, puesto y saldo.', ", whenever you're in the universe: vitals, environment, seat and balance.")}
            </span>
            <span className="d accent" aria-hidden />
            <span>
              <strong>{t('Nave y armas', 'Ship and weapons')}</strong>
              {t(', cuando estás sentado y la nave está encendida.', ", when you're seated and the ship is powered on.")}
            </span>
            <span className="d" aria-hidden />
            <span>
              <strong>{t('Nada', 'Nothing')}</strong>
              {t(' en el menú, en las pantallas de carga ni al cambiar de personaje. No es un error.', " in the menu, on loading screens or while switching characters. It's not an error.")}
            </span>
          </div>
        </section>
        <section className="panel warn tl-exp-panel" aria-label={t('Función experimental', 'Experimental feature')}>
          <PanelHead icon={TriangleAlert} title={t('Función experimental', 'Experimental feature')} />
          <p>
            {t(
              'CIG no ha documentado esta telemetría. Puede cambiar o dejar de llegar con cualquier parche, y algunos datos se interpretan a partir de lo que se ha observado.',
              "CIG hasn't documented this telemetry. It may change or stop arriving with any patch, and some values are interpreted from what has been observed.",
            )}
          </p>
          <p>{t('CommandGlass solo la lee: nunca la usa para pulsar teclas ni para actuar en el juego.', 'CommandGlass only reads it: it never uses it to press keys or act in the game.')}</p>
        </section>
      </div>
    </div>
  );
}

function WaitBody({ t, ms, onHelp }: { t: T; ms: number; onHelp: () => void }) {
  return (
    <div className="tl-wait">
      <section className="panel" aria-label={t('Esperando al juego', 'Waiting for the game')}>
        <svg className="tl-wait-ring" width="96" height="96" viewBox="0 0 96 96" aria-hidden>
          <circle cx="48" cy="48" r="44" fill="none" stroke="var(--seam)" strokeWidth="2" />
          <g className="spin">
            <circle cx="48" cy="48" r="44" fill="none" stroke="var(--amber)" strokeWidth="2" strokeDasharray="46 230" strokeLinecap="round" />
          </g>
          <path d="M30 48h8l4-10 8 22 5-12h11" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2>{t('Conectado. El juego aún no envía datos', "Connected. The game isn't sending data yet")}</h2>
        <p>
          {t(
            'Es lo normal en el menú principal, en las pantallas de carga y al cambiar de personaje. Los datos aparecen solos en cuanto entras al universo.',
            "That's normal in the main menu, on loading screens and while switching characters. Data shows up by itself as soon as you enter the universe.",
          )}
        </p>
        <div className="tl-waitstat">
          <span className="k">{t('Esperando', 'Waiting')}</span>
          <strong>{waited(ms, t)}</strong>
        </div>
        <p className="sub">
          {t(
            'Si ya estás en el universo y sigue así, puede que el launcher no se abriera con el comando. En la PTU 5.0, por ahora, el juego acepta la conexión pero no envía nada.',
            "If you're already in the universe and it stays like this, the launcher may not have been opened with the command. On PTU 5.0, for now, the game accepts the connection but sends nothing.",
          )}
        </p>
        <button type="button" className="tl-btn" onClick={onHelp}>
          {t('Cómo se activa', 'How to turn it on')}
        </button>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- depuración

/** Nombres del esquema por ruta de campo (interpretación, ver docs/telemetria-grpc.md). */
const FIELD_NAMES: Record<string, string> = {
  '3.2.1': 'name', '3.2.2': 'class_name', '3.2.4': 'type',
  '3.2.7.1': 'ann.pwr', '3.2.7.2': 'ann.wpn', '3.2.7.3': 'ann.thr', '3.2.7.4': 'ann.shld', '3.2.7.5': 'ann.cool',
  '3.2.7.6': 'ann.qdrv', '3.2.7.7': 'ann.radr', '3.2.7.8': 'ann.prox', '3.2.7.9': 'ann.hit', '3.2.7.10': 'ann.misl',
  '3.2.8.1.1': 'is_landed', '3.2.8.1.2': 'gear', '3.2.8.1.3': 'vtol',
  '3.2.8.3.1': 'speed', '3.2.8.3.2': 'hydrogen_fuel', '3.2.8.3.3': 'quantum_fuel', '3.2.8.3.4.1': 'g_meter', '3.2.8.3.4.2': 'g_meter.max',
  '3.2.8.3.5.1': 'boost.engaged', '3.2.8.3.5.2': 'boost.output', '3.2.8.3.5.3': 'boost.reserves',
  '3.2.8.3.6': 'altitude', '3.2.8.3.7': 'radar_altitude', '3.2.8.3.8': 'vertical_speed', '3.2.8.3.9': 'atmospheric_density', '3.2.8.3.10': 'heading',
  '3.2.9.1': 'power.powerplants', '3.2.9.2': 'power.engines', '3.2.9.3': 'power.weapons', '3.2.9.4': 'power.coolers', '3.2.9.5': 'power.life_support',
  '3.2.9.6': 'power.gravity', '3.2.9.7': 'power.sensors', '3.2.9.8': 'power.shield_gen', '3.2.9.9': 'power.shield_emit',
  '4.4.1': 'weapon.name', '4.4.2': 'weapon.is_powered', '4.4.3': 'weapon.ready_to_fire', '4.4.4': 'weapon.in_preset',
  '4.5.1': 'cm.type', '4.5.2': 'cm.amount',
  '6.1.1.1': 'health', '6.1.1.2': 'health.max', '6.1.2.1': 'oxygen', '6.1.2.2': 'oxygen.max', '6.1.3.1': 'hunger', '6.1.3.2': 'hunger.max',
  '6.1.4.1': 'thirst', '6.1.4.2': 'thirst.max', '6.1.5.1': 'body_temperature', '6.1.5.2': 'body_temperature.max',
  '6.1.6': 'intoxication_level', '6.1.7': 'heart_rate', '6.1.8': 'gravity', '6.1.9': 'pressure',
  '6.2.1': 'locomotion', '6.2.2': 'crew_role', '6.2.3': 'seat_name', '6.2.4': 'uec_balance',
  '6.3.1': 'external_temperature', '6.3.2': 'ambient_radiation_rate', '6.3.3': 'breathable_atmosphere',
};

function flatten(node: unknown, path: string, out: { path: string; v: string }[]) {
  if (Array.isArray(node)) node.forEach((x, i) => flatten(x, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) flatten(v, path ? `${path}.${k}` : k, out);
  else {
    let v = String(node);
    if (typeof node === 'number' && Math.abs(node) >= 1e30) v = `${node.toExponential(4)} → ${tr('sin dato', 'no data')}`;
    out.push({ path, v });
  }
}

function DebugBody({ t, snap, dbg, paused, onPause }: { t: T; snap: Snapshot; dbg: Snapshot['debug'] | null; paused: boolean; onPause: () => void }) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);
  const rows: { path: string; v: string }[] = [];
  if (dbg?.raw) flatten(dbg.raw, '', rows);
  const hist = dbg?.hzHistory ?? [];
  const top = Math.max(20, ...hist);
  const iv = dbg?.intervalMs;
  const blockRows: [string, string[]][] = [['6', ['actor']], ['3', ['vehicle']], ['4', ['weapons']], ['5', ['events']], ['7·8', ['force_feedback', 'turret']]];

  const copy = () => {
    const text = JSON.stringify(dbg?.raw ?? {}, null, 1);
    void copyText(text).then((ok) => {
      if (!ok) return;
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="tl-debug">
      <div className="tl-debugcol">
        <section className="panel" aria-label={t('Flujo', 'Stream')}>
          <div className="label">{t('Flujo', 'Stream')}</div>
          <div className="tl-flow">
            <div><span className="k">{t('Frecuencia', 'Rate')}</span><strong>{fx(snap.hz, 1)}<Unit>Hz</Unit></strong></div>
            <div><span className="k">{t('Fotogramas', 'Frames')}</span><strong>{n(snap.frames)}</strong></div>
            <div><span className="k">{t('Intervalo', 'Interval')}</span><strong>{iv?.last ?? '—'}<Unit>ms</Unit></strong></div>
          </div>
          <div className="tl-hz" aria-hidden>
            {hist.map((h, i) => (
              <span key={i} className={h > 0 && h < 17 ? 'low' : ''} style={{ height: `${(100 * h) / top}%` }} />
            ))}
          </div>
          <small className="sub">
            {t(
              `Últimos 60 s · intervalo mín. ${iv?.min ?? '—'} ms, máx. ${iv?.max ?? '—'} ms`,
              `Last 60 s · interval min ${iv?.min ?? '—'} ms, max ${iv?.max ?? '—'} ms`,
            )}
          </small>
        </section>
        <section className="panel" aria-label={t('Bloques', 'Blocks')}>
          <div className="label">{t('Bloques', 'Blocks')}</div>
          {blockRows.map(([num, names]) => {
            const seen = names.map((k) => snap.blocks[k]).filter((x): x is number => x != null);
            const ago = seen.length ? Math.min(...seen) : null;
            const name = names.join(', ');
            return (
              <div key={name} className="tl-brow">
                <span className="tl-mono">{num}</span>
                <span className="tl-mono name">{name}</span>
                <span className={ago == null ? '' : 'ok'}>
                  {ago == null ? t('Nunca', 'Never') : t(`Llega · hace ${secs(ago)} s`, `Arriving · ${secs(ago)} s ago`)}
                </span>
              </div>
            );
          })}
        </section>
        <section className="panel tl-ifcs-panel" aria-label={t('IFCS sin interpretar', 'Uninterpreted IFCS')}>
          <div className="label">{t('IFCS sin interpretar', 'Uninterpreted IFCS')}</div>
          {snap.vehicle?.ifcs.length ? (
            <div className="tl-ifcs">
              {snap.vehicle.ifcs.map((on, i) => (
                <span key={i} className={on ? 'on' : ''} aria-label={`${i + 1}: ${on ? t('activo', 'on') : t('inactivo', 'off')}`}>
                  {i + 1}
                </span>
              ))}
            </div>
          ) : (
            <div className="empty">{t('Llega con la nave encendida.', 'Arrives with the ship powered on.')}</div>
          )}
          <small className="sub">{t('Campo 3.2.8.2. Encendido: relleno; apagado: solo borde.', 'Field 3.2.8.2. On: filled; off: outline only.')}</small>
        </section>
      </div>
      <section className="panel tl-frame" aria-label={t('Fotograma', 'Frame')}>
        <div className="label">
          <span>{t('Fotograma', 'Frame')}</span>
          <span className="tl-mono tl-grow tl-frameinfo">{dbg ? `${n(dbg.rawBytes)} B · ${rows.length} ${t('campos', 'fields')}` : ''}</span>
          <button type="button" className={`tl-btn small ${paused ? 'amber' : ''}`} aria-pressed={paused} onClick={onPause}>
            {paused ? <Play size={16} strokeWidth={1.8} aria-hidden /> : <Pause size={16} strokeWidth={1.8} aria-hidden />}
            <span>{paused ? t('Seguir', 'Resume') : t('Pausar', 'Pause')}</span>
          </button>
          <button type="button" className="tl-btn small" onClick={copy} disabled={!dbg?.raw}>
            <Copy size={16} strokeWidth={1.8} aria-hidden />
            <span>{copied ? t('Copiado', 'Copied') : t('Copiar', 'Copy')}</span>
          </button>
        </div>
        <div className="tl-rows" role="table" aria-label={t('Campos del fotograma', 'Frame fields')}>
          <div className="tl-frow head" role="row">
            <span role="columnheader">{t('Campo', 'Field')}</span>
            <span role="columnheader">{t('Nombre (esquema)', 'Name (schema)')}</span>
            <span role="columnheader">{t('Valor', 'Value')}</span>
          </div>
          {rows.map((r) => (
            <div key={r.path} className="tl-frow" role="row">
              <span role="cell">{r.path}</span>
              <span role="cell">{FIELD_NAMES[r.path.replace(/\[\d+\]/g, '')] ?? ''}</span>
              <span role="cell" className={r.v.includes('→') ? 'none' : ''}>{r.v}</span>
            </div>
          ))}
          {!rows.length && <div className="empty">{t('Aún no ha llegado ningún fotograma.', 'No frame has arrived yet.')}</div>}
        </div>
      </section>
    </div>
  );
}

/** En el tablet la página va por http en la red local: sin portapapeles moderno, se usa el método antiguo. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* se intenta el método antiguo */
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}
