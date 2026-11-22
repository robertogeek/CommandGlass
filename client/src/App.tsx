import { Activity, Archive, Coins, FileCheck, FileText, Gamepad2, MapIcon, MapPin, Radar, Rocket, ScrollText, Server, ShieldAlert, ShieldCheck, Swords, Timer, UserRound, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Emblem } from './components/Emblem.tsx';
import logo from './assets/space-cowboys.png';
import { duration, hhmm } from './format.ts';
import { LangSwitch, useLang } from './lang.tsx';
import { useLive } from './live.tsx';
import { Ahora } from './views/Ahora.tsx';
import { Archivo } from './views/Archivo.tsx';
import { Bitacora } from './views/Bitacora.tsx';
import { Combate } from './views/Combate.tsx';
import { Comercio } from './views/Comercio.tsx';
import { Contactos } from './views/Contactos.tsx';
import { Contratos } from './views/Contratos.tsx';
import { Mapa } from './views/Mapa.tsx';
import { Mandos } from './views/Mandos.tsx';
import { Telemetria } from './views/Telemetria.tsx';

type Bilingual = { es: string; en: string };

interface Section {
  id: string;
  label: Bilingual;
  title: Bilingual;
  icon: LucideIcon;
  view?: () => ReactNode;
  soon?: Bilingual;
}

const SECTIONS: Section[] = [
  { id: 'ahora', label: { es: 'Ahora', en: 'Now' }, title: { es: 'Ahora', en: 'Now' }, icon: Radar, view: () => <Ahora /> },
  // Mandos va a pantalla completa (ver App): su vista la pinta App, no la rejilla de secciones.
  { id: 'mandos', label: { es: 'Mandos', en: 'Controls' }, title: { es: 'Mandos', en: 'Controls' }, icon: Gamepad2 },
  { id: 'bitacora', label: { es: 'Bitácora', en: 'Logbook' }, title: { es: 'Bitácora', en: 'Logbook' }, icon: ScrollText, view: () => <Bitacora /> },
  { id: 'contactos', label: { es: 'Contactos', en: 'Contacts' }, title: { es: 'Contactos', en: 'Contacts' }, icon: Users, view: () => <Contactos /> },
  // Hangar se retira por ahora (su vista sigue en views/Hangar.tsx); #hangar lleva a Telemetría.
  { id: 'telemetria', label: { es: 'Telemetría', en: 'Telemetry' }, title: { es: 'Telemetría', en: 'Telemetry' }, icon: Activity, view: () => <Telemetria /> },
  { id: 'contratos', label: { es: 'Contratos', en: 'Contracts' }, title: { es: 'Contratos', en: 'Contracts' }, icon: FileCheck, view: () => <Contratos /> },
  { id: 'combate', label: { es: 'Combate', en: 'Combat' }, title: { es: 'Combate', en: 'Combat' }, icon: Swords, view: () => <Combate /> },
  { id: 'comercio', label: { es: 'Comercio', en: 'Trade' }, title: { es: 'Comercio', en: 'Trade' }, icon: Coins, view: () => <Comercio /> },
  { id: 'mapa', label: { es: 'Mapa', en: 'Map' }, title: { es: 'Mapa', en: 'Map' }, icon: MapIcon, view: () => <Mapa /> },
  { id: 'archivo', label: { es: 'Archivo', en: 'Archive' }, title: { es: 'Archivo', en: 'Archive' }, icon: Archive, view: () => <Archivo /> },
];

/** Secciones retiradas de la barra: sus enlaces llevan a la que ocupa su sitio. */
const RETIRED: Record<string, string> = { hangar: 'telemetria' };

function useHashSection(): [string, (id: string) => void] {
  // "#contactos/Nombre": la sección es el primer tramo; el resto lo lee la propia vista.
  const read = () => {
    const id = window.location.hash.replace('#', '').split('/')[0] || 'ahora';
    return RETIRED[id] ?? id;
  };
  const [id, setId] = useState(read);
  useEffect(() => {
    const on = () => setId(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [id, (next) => (window.location.hash = next)];
}

export function App() {
  const [sectionId, go] = useHashSection();
  const section = SECTIONS.find((s) => s.id === sectionId) ?? SECTIONS[0]!;
  const { t } = useLang();

  // Mandos ocupa toda la pantalla: sin barra lateral, cabecera ni franja de estado, para que quepan los controles.
  if (section.id === 'mandos') {
    return (
      <div className="app immersive">
        <span className="hud-notch" aria-hidden />
        <Mandos onExit={() => go('ahora')} />
      </div>
    );
  }

  return (
    <div className="app">
      <span className="hud-notch" aria-hidden />
      <TopBar title={t(section.title)} />
      <nav className="rail" aria-label={t('Secciones', 'Sections')}>
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              className={`rail-btn ${s.id === section.id ? 'on' : ''} ${s.soon ? 'soon' : ''}`}
              onClick={() => go(s.id)}
              aria-current={s.id === section.id ? 'page' : undefined}
            >
              <Icon size={24} strokeWidth={1.5} aria-hidden />
              {t(s.label)}
            </button>
          );
        })}
      </nav>
      <div className="main">
        <main className="view" key={section.id}>
          {section.view ? (
            section.view()
          ) : (
            <div className="soon-view">
              <div>
                <div className="soon-emblem">
                  <Emblem size={128} spin />
                  <section.icon size={40} strokeWidth={1.3} aria-hidden />
                </div>
                <h2>{t(section.title)}</h2>
                <p>{section.soon ? t(section.soon) : null}</p>
                <span className="soon-tag">{t('Próximamente', 'Coming soon')}</span>
              </div>
            </div>
          )}
        </main>
      </div>
      <StatusBar />
    </div>
  );
}

function TopBar({ title }: { title: string }) {
  const { snapshot, connected } = useLive();
  const state = snapshot?.state;
  const status = snapshot?.status;
  const { t } = useLang();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);

  let dot = 'off';
  let text = t('Sin conexión con el PC', 'No connection to the PC');
  if (connected) {
    if (status?.active && !state?.endedAt) {
      dot = 'live';
      text = t('En directo', 'Live');
    } else {
      dot = '';
      text = state?.endedAt ? t('Juego cerrado', 'Game closed') : t('Sin actividad', 'No activity');
    }
  }

  return (
    <header className="topbar">
      <div className="brand">
        <img className="org-logo" src={logo} alt="Space Cowboys" width={60} height={51} />
        <span>CommandGlass</span>
      </div>
      <h1 className="title">{title}</h1>
      <div className="topbar-status">
        <LangSwitch />
        {snapshot?.channel && snapshot.channel !== 'LIVE' && <span className="pill channel-pill">{snapshot.channel}</span>}
        <span className="pill"><span className={`dot ${dot}`} /> {text}</span>
        {state?.player.name && <span className="pill"><UserRound size={16} strokeWidth={1.6} aria-hidden /> {state.player.name}</span>}
        <span className="pill clock">
          <strong>{hhmm(now)}</strong>
          <small>{t('Hora local', 'Local time')}</small>
        </span>
      </div>
    </header>
  );
}

/** Franja inferior tipo HUD: lo esencial del estado, visible desde cualquier sección. */
function StatusBar() {
  const { snapshot } = useLive();
  const { t } = useLang();
  const s = snapshot?.state ?? null;
  const lawless = !!s?.jurisdiction?.lawless;
  const session = s?.startedAt ? duration(s.startedAt, s.endedAt) : null;

  return (
    <footer className="statusbar" aria-label={t('Estado', 'Status')}>
      <Seg k={t('Ubicación', 'Location')} icon={MapPin} v={s ? (s.location?.name ?? t('En ruta', 'In transit')) : '—'} />
      <Seg
        k={t('Jurisdicción', 'Jurisdiction')}
        icon={lawless ? ShieldAlert : ShieldCheck}
        v={s?.jurisdiction ? (lawless ? t('Sin ley', 'Lawless') : s.jurisdiction.name) : '—'}
        tone={lawless ? 'warn' : s?.armistice ? 'safe' : undefined}
      />
      <Seg k={t('Nave', 'Ship')} icon={Rocket} v={s ? (s.ship?.name ?? t('A pie', 'On foot')) : '—'} className="opt" />
      <div className="status-emblem" aria-hidden>
        <img className="org-logo" src={logo} alt="" width={64} height={54} />
      </div>
      <Seg k={t('Contratos', 'Contracts')} icon={FileText} v={s ? t(`${s.missions.length} activos`, `${s.missions.length} active`) : '—'} className="opt" />
      <Seg k={s?.endedAt ? t('Última sesión', 'Last session') : t('Sesión', 'Session')} icon={Timer} v={session ?? '—'} />
      <Seg k="Shard" icon={Server} v={s?.shard?.label ?? '—'} />
    </footer>
  );
}

function Seg({ k, v, icon: Icon, tone, className }: { k: string; v: string; icon: LucideIcon; tone?: 'warn' | 'safe'; className?: string }) {
  return (
    <div className={`seg-hud ${tone ?? ''} ${className ?? ''}`}>
      <Icon size={18} strokeWidth={1.5} aria-hidden />
      <div>
        <div className="k">{k}</div>
        <div className="v">{v}</div>
      </div>
    </div>
  );
}
