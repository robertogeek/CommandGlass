import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '@fontsource/saira-semi-condensed/400.css';
import '@fontsource/saira-semi-condensed/500.css';
import './styles.css';
import './desktop.css';
import { CheckCircle2, Copy, FolderOpen, FolderSearch, Pin, Power, Radio, Tablet, TriangleAlert, X } from 'lucide-react';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import logo from './assets/space-cowboys.png';

/**
 * Ventana de la app de escritorio: lo que ven tus compis al abrir CommandGlass en el PC.
 * QR para emparejar el tablet, estado del juego y de los dispositivos, y ajustes básicos.
 * Las acciones nativas (elegir carpeta, iniciar con Windows) llegan por window.commandglass (preload de Electron).
 */

interface DesktopInfo {
  version: string;
  pairUrl: string;
  lanUrl: string;
  qrSvg: string;
  gameDir: string;
  gameDirFound: boolean;
  dataDir: string;
  devices: { remote: boolean; since: string; agent: string }[];
  status: { found: boolean; active: boolean; lastWriteAt: string | null };
}

interface Bridge {
  chooseGameDir(): Promise<{ ok: boolean; canceled?: boolean; gameDir?: string; message?: string }>;
  /** null en la versión de la Microsoft Store: el inicio con Windows se activa en la configuración de Windows. */
  getOpenAtLogin(): Promise<boolean | null>;
  setOpenAtLogin(on: boolean): Promise<boolean | null>;
  openDataDir(): Promise<void>;
  getChannels(): Promise<{ current: string; available: string[] } | null>;
  setChannel(ch: string): Promise<boolean>;
}

declare global {
  interface Window {
    commandglass?: Bridge;
  }
}

const bridge = window.commandglass;
const PIN_TIP_KEY = 'cg-pin-tip-dismissed';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* sin almacenamiento: el aviso volverá a salir */
  }
}

function useDesktopInfo() {
  const [info, setInfo] = useState<DesktopInfo | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetch('/api/desktop', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: DesktopInfo) => alive && (setInfo(d), setError(false)))
        .catch(() => alive && setError(true));
    tick();
    const t = window.setInterval(tick, 3000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  return { info, error };
}

function Desktop() {
  const { info, error } = useDesktopInfo();
  const [copied, setCopied] = useState(false);
  const [pinTip, setPinTip] = useState(() => !readFlag(PIN_TIP_KEY));
  const [atLogin, setAtLogin] = useState<boolean | null>(null);
  const [storeLogin, setStoreLogin] = useState(false);
  const [dirMsg, setDirMsg] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  const [channels, setChannels] = useState<{ current: string; available: string[] } | null>(null);
  useEffect(() => {
    bridge
      ?.getOpenAtLogin()
      .then((v) => (v === null ? setStoreLogin(true) : setAtLogin(v)))
      .catch(() => setAtLogin(null));
    bridge?.getChannels().then(setChannels).catch(() => setChannels(null));
  }, []);
  const switchChannel = async (ch: string) => {
    if (!bridge || ch === channels?.current) return;
    setDirMsg(`Cambiando a ${ch}…`);
    await bridge.setChannel(ch);
  };

  const copy = async () => {
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.pairUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sin portapapeles */
    }
  };

  const chooseDir = async () => {
    if (!bridge) return;
    setChoosing(true);
    setDirMsg(null);
    const r = await bridge.chooseGameDir();
    setChoosing(false);
    if (r.canceled) return;
    setDirMsg(r.ok ? 'Carpeta guardada. Reiniciando CommandGlass…' : (r.message ?? 'No se ha podido usar esa carpeta.'));
  };

  const toggleLogin = async () => {
    if (!bridge || atLogin === null) return;
    const v = await bridge.setOpenAtLogin(!atLogin);
    if (v !== null) setAtLogin(v);
  };

  const devices = info?.devices ?? [];

  return (
    <div className="desk">
      <header className="desk-head">
        <img className="org-logo" src={logo} alt="Space Cowboys" width={56} height={48} />
        <div>
          <h1>CommandGlass</h1>
          <p className="faint">Tu mobiGlas para Star Citizen{info ? ` · ${info.version}` : ''}</p>
        </div>
      </header>

      {error && !info && (
        <div className="panel warn desk-alert" role="alert">
          <TriangleAlert size={18} aria-hidden /> No responde el servidor de CommandGlass. Cierra la app desde la bandeja del sistema y vuelve a abrirla.
        </div>
      )}

      <main className="desk-grid">
        <section className="panel desk-qr" aria-label="Emparejar el tablet">
          <div className="label"><Tablet size={14} aria-hidden /> Empareja tu tablet</div>
          {info ? (
            <div className="qr-box" dangerouslySetInnerHTML={{ __html: info.qrSvg }} aria-label="Código QR para abrir CommandGlass en el tablet" role="img" />
          ) : (
            <div className="qr-box qr-loading">Preparando código…</div>
          )}
          <ol className="desk-steps">
            <li>Abre la <strong>cámara</strong> del tablet y apunta al código.</li>
            <li>Toca el aviso para abrir CommandGlass en el navegador.</li>
            <li>
              En el iPad, toca <strong>Compartir → Añadir a pantalla de inicio</strong>. En Android, <strong>menú ⋮ → Añadir a pantalla de inicio</strong>. La app te lo recuerda la primera vez.
            </li>
          </ol>
          <p className="faint desk-net">El tablet tiene que estar en la misma wifi que este PC.</p>
          {info && (
            <button className="chip" onClick={copy}>
              <Copy size={15} aria-hidden /> {copied ? 'Enlace copiado' : 'Copiar enlace'}
            </button>
          )}
        </section>

        <div className="stack">
          <section className={`panel ${info && !info.gameDirFound ? 'warn' : ''}`} aria-label="Star Citizen">
            <div className="label"><Radio size={14} aria-hidden /> Star Citizen</div>
            {info?.gameDirFound ? (
              <>
                <div className="desk-ok"><CheckCircle2 size={18} aria-hidden /> Juego encontrado</div>
                <div className="desk-path">{info.gameDir}</div>
                <div className="sub">
                  {info.status.active ? 'Partida en directo: leyendo el registro del juego.' : info.status.found ? 'Esperando a que abras el juego.' : 'Aún no hay registro: abre el juego una vez.'}
                </div>
              </>
            ) : info ? (
              <>
                <div className="desk-bad"><TriangleAlert size={18} aria-hidden /> No encuentro Star Citizen</div>
                <div className="sub">Indica la carpeta donde está instalado: la que contiene <code>LIVE</code> o la propia <code>LIVE</code>.</div>
              </>
            ) : (
              <div className="sub">Comprobando…</div>
            )}
            {channels && channels.available.length > 1 && (
              <div className="kv desk-channel">
                <span>Versión del juego</span>
                <div className="segmented" role="group" aria-label="Versión del juego">
                  {channels.available.map((ch) => (
                    <button key={ch} className={`seg ${ch === channels.current ? 'on' : ''}`} onClick={() => switchChannel(ch)} aria-pressed={ch === channels.current}>
                      {ch}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {bridge && (
              <button className="chip desk-btn" onClick={chooseDir} disabled={choosing}>
                <FolderSearch size={15} aria-hidden /> {info?.gameDirFound ? 'Cambiar carpeta…' : 'Elegir carpeta…'}
              </button>
            )}
            {dirMsg && <div className="sub" role="status">{dirMsg}</div>}
          </section>

          <section className="panel" aria-label="Dispositivos">
            <div className="label"><Tablet size={14} aria-hidden /> Conectados ahora</div>
            {devices.length === 0 ? (
              <div className="sub">Ningún tablet conectado todavía. Escanea el código para empezar.</div>
            ) : (
              devices.map((d, i) => (
                <div key={i} className="kv">
                  <span className="desk-ok"><CheckCircle2 size={16} aria-hidden /> {d.agent}</span>
                  <span className="faint">desde las {new Date(d.since).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))
            )}
          </section>

          {bridge && (
            <section className="panel" aria-label="Ajustes">
              <div className="label"><Power size={14} aria-hidden /> Ajustes</div>
              <div className="kv">
                <span>Abrir CommandGlass al iniciar Windows</span>
                {storeLogin ? (
                  <button className="chip" onClick={() => void bridge.setOpenAtLogin(true)}>
                    <Power size={15} aria-hidden /> Configurar en Windows
                  </button>
                ) : (
                  <button
                    className={`seg ${atLogin ? 'on' : ''}`}
                    role="switch"
                    aria-checked={atLogin ?? false}
                    onClick={toggleLogin}
                    disabled={atLogin === null}
                  >
                    {atLogin ? 'Activado' : 'Desactivado'}
                  </button>
                )}
              </div>
              <div className="kv">
                <span>Tu historial y ajustes</span>
                <button className="chip" onClick={() => bridge.openDataDir()}>
                  <FolderOpen size={15} aria-hidden /> Abrir carpeta
                </button>
              </div>
            </section>
          )}

          {pinTip && (
            <section className="panel desk-tip" aria-label="Anclar a la barra de tareas">
              <button className="desk-close" onClick={() => (setPinTip(false), writeFlag(PIN_TIP_KEY))} aria-label="Cerrar aviso">
                <X size={16} aria-hidden />
              </button>
              <div className="label"><Pin size={14} aria-hidden /> Tenlo a mano</div>
              <div className="sub">
                Para anclarlo a la barra de tareas: clic derecho en el icono de CommandGlass en la barra → <strong>Anclar a la barra de tareas</strong>.
              </div>
            </section>
          )}
        </div>
      </main>

      <footer className="desk-foot faint">
        Cerrar esta ventana no apaga CommandGlass: sigue funcionando en la bandeja del sistema, junto al reloj.
      </footer>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Desktop />
  </StrictMode>,
);
