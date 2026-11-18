import { Archive, Coins, FileCheck, MapIcon, Radar, Rocket, ScrollText, Users, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { duration } from './format.ts';
import { useLive } from './live.tsx';
import { Ahora } from './views/Ahora.tsx';
import { Archivo } from './views/Archivo.tsx';
import { Bitacora } from './views/Bitacora.tsx';
import { Contactos } from './views/Contactos.tsx';

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
      <nav className="rail" aria-label="Secciones">
        <div className="rail-logo">SC<br />MASTER</div>
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              className={`rail-btn ${s.id === section.id ? 'on' : ''} ${s.soon ? 'soon' : ''}`}
              onClick={() => go(s.id)}
              aria-current={s.id === section.id ? 'page' : undefined}
            >
              <Icon size={24} strokeWidth={1.8} aria-hidden />
              {s.label}
            </button>
          );
        })}
      </nav>
      <div className="main">
        <TopBar title={section.title} />
        <main className="view" key={section.id}>
          {section.view ? (
            section.view()
          ) : (
            <div className="soon-view">
              <div>
                <section.icon size={48} strokeWidth={1.4} className="accent" aria-hidden />
                <h2>{section.title}</h2>
                <p>{section.soon}</p>
                <p className="faint" style={{ marginTop: 12 }}>Próximamente</p>
              </div>
            </div>
          )}
        </main>
      </div>
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
      <span className="title">{title}</span>
      <span className="pill"><span className={`dot ${dot}`} /> {text}</span>
      {state?.shard && <span className="pill">Shard {state.shard.label}</span>}
      {state?.startedAt && !state.endedAt && <span className="pill">Sesión {duration(state.startedAt)}</span>}
      {state?.player.name && <span className="pill">{state.player.name}</span>}
      <span className="pill">{now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
    </header>
  );
}
