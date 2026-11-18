import { Archive, Coins, FileCheck, FileText, Gamepad2, MapIcon, MapPin, Radar, Rocket, ScrollText, Server, ShieldAlert, ShieldCheck, Timer, UserRound, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Emblem } from './components/Emblem.tsx';
import logo from './assets/space-cowboys.png';
import { duration } from './format.ts';
import { useLive } from './live.tsx';
import { Ahora } from './views/Ahora.tsx';
import { Archivo } from './views/Archivo.tsx';
import { Bitacora } from './views/Bitacora.tsx';
import { Contactos } from './views/Contactos.tsx';
import { Mandos } from './views/Mandos.tsx';

interface Section {
  id: string;
  label: string;
  title: string;
  icon: LucideIcon;
  view?: () => ReactNode;
  soon?: string;
}

const SECTIONS: Section[] = [
  { id: 'ahora', label: 'Ahora', title: 'Ahora', icon: Radar, view: () => <Ahora /> },
  { id: 'mandos', label: 'Mandos', title: 'Mandos', icon: Gamepad2, view: () => <Mandos /> },
  { id: 'bitacora', label: 'Bitácora', title: 'Bitácora', icon: ScrollText, view: () => <Bitacora /> },
  { id: 'contactos', label: 'Contactos', title: 'Contactos', icon: Users, view: () => <Contactos /> },
  { id: 'hangar', label: 'Hangar', title: 'Hangar', icon: Rocket, soon: 'Tu flota con fichas técnicas de star-citizen.wiki y tus estadísticas con cada nave.' },
  { id: 'contratos', label: 'Contratos', title: 'Contratos', icon: FileCheck, soon: 'Historial de contratos, tasa de éxito por tipo y cuánto tardas en cada uno.' },
  { id: 'comercio', label: 'Comercio', title: 'Comercio', icon: Coins, soon: 'Precios de compra y venta de donde estás (UEX) y las mejores rutas para tu nave.' },
  { id: 'mapa', label: 'Mapa', title: 'Mapa', icon: MapIcon, soon: 'Tus rutas entre Stanton, Pyro y Nyx dibujadas a partir de tus saltos.' },
  { id: 'archivo', label: 'Archivo', title: 'Archivo', icon: Archive, view: () => <Archivo /> },
];

function useHashSection(): [string, (id: string) => void] {
  // "#contactos/Nombre": la sección es el primer tramo; el resto lo lee la propia vista.
  const read = () => window.location.hash.replace('#', '').split('/')[0] || 'ahora';
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

  return (
    <div className="app">
      <span className="hud-notch" aria-hidden />
      <TopBar title={section.title} />
      <nav className="rail" aria-label="Secciones">
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
              {s.label}
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
                <h2>{section.title}</h2>
                <p>{section.soon}</p>
                <span className="soon-tag">Próximamente</span>
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
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  let dot = 'off';
  let text = 'Sin conexión con el PC';
  if (connected) {
    if (status?.active && !state?.endedAt) {
      dot = 'live';
      text = 'En directo';
    } else {
      dot = '';
      text = state?.endedAt ? 'Juego cerrado' : 'Sin actividad';
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
        <span className="pill"><span className={`dot ${dot}`} /> {text}</span>
        {state?.player.name && <span className="pill"><UserRound size={16} strokeWidth={1.6} aria-hidden /> {state.player.name}</span>}
        <span className="pill clock">
          <strong>{now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</strong>
          <small>Hora local</small>
        </span>
      </div>
    </header>
  );
}

/** Franja inferior tipo HUD: lo esencial del estado, visible desde cualquier sección. */
function StatusBar() {
  const { snapshot } = useLive();
  const s = snapshot?.state ?? null;
  const lawless = !!s?.jurisdiction?.lawless;
  const session = s?.startedAt ? duration(s.startedAt, s.endedAt) : null;

  return (
    <footer className="statusbar" aria-label="Estado">
      <Seg k="Ubicación" icon={MapPin} v={s ? (s.location?.name ?? 'En ruta') : '—'} />
      <Seg
        k="Jurisdicción"
        icon={lawless ? ShieldAlert : ShieldCheck}
        v={s?.jurisdiction ? (lawless ? 'Sin ley' : s.jurisdiction.name) : '—'}
        tone={lawless ? 'warn' : s?.armistice ? 'safe' : undefined}
      />
      <Seg k="Nave" icon={Rocket} v={s ? (s.ship?.name ?? 'A pie') : '—'} className="opt" />
      <div className="status-emblem" aria-hidden>
        <img className="org-logo" src={logo} alt="" width={64} height={54} />
      </div>
      <Seg k="Contratos" icon={FileText} v={s ? `${s.missions.length} activos` : '—'} className="opt" />
      <Seg k={s?.endedAt ? 'Última sesión' : 'Sesión'} icon={Timer} v={session ?? '—'} />
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
