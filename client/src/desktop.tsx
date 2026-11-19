import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '@fontsource/saira-semi-condensed/400.css';
import '@fontsource/saira-semi-condensed/500.css';
import './styles.css';
import './desktop.css';
import { CheckCircle2, Coffee, Copy, ExternalLink, FolderOpen, FolderSearch, KeyRound, Pin, Power, Radio, Tablet, TriangleAlert, X } from 'lucide-react';
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
  /** Sin token de UEX la ventana muestra la configuración inicial y no deja emparejar el tablet. */
  uexConfigured: boolean;
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
/** Enlace de PayPal de robertogeek para que quien quiera le invite a un café. Vacío = no se muestra. */
const DONATE_URL = 'https://paypal.me/robertogeek';

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

  if (info && !info.uexConfigured) {
    return <Setup info={info} chooseDir={chooseDir} choosing={choosing} dirMsg={dirMsg} />;
  }

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

          {DONATE_URL && (
            <section className="panel" aria-label="Invitar a un café">
              <div className="label"><Coffee size={14} aria-hidden /> ¿Te está siendo útil?</div>
              <div className="sub">CommandGlass es gratis. Si te ayuda en tus partidas, puedes invitar a robertogeek a un café, o a lo que quieras.</div>
              <a className="chip desk-btn" href={DONATE_URL} target="_blank" rel="noreferrer">
                <Coffee size={15} aria-hidden /> Invitar con PayPal <ExternalLink size={13} aria-hidden />
              </a>
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

/**
 * Configuración inicial (obligatoria): carpeta de Star Citizen y token de UEX.
 * Hasta que el token no esté guardado no aparece el código para emparejar el tablet.
 */
function Setup({ info, chooseDir, choosing, dirMsg }: { info: DesktopInfo; chooseDir: () => void; choosing: boolean; dirMsg: string | null }) {
  const [token, setToken] = useState('');
  const [state, setState] = useState<{ k: 'idle' | 'saving' | 'saved' | 'error'; msg?: string }>({ k: 'idle' });

  const save = async () => {
    setState({ k: 'saving' });
    try {
      const res = await fetch('/api/trade/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? 'No se ha podido guardar el token.');
      // La ventana se refresca sola en unos segundos y pasa al código QR.
      setState({ k: 'saved' });
      setToken('');
    } catch (err) {
      setState({ k: 'error', msg: (err as Error).message });
    }
  };

  return (
    <div className="desk">
      <header className="desk-head setup">
        <img className="org-logo" src={logo} alt="Space Cowboys" width={56} height={48} />
        <div>
          <h1>CommandGlass</h1>
          <p className="faint">Configuración inicial · {info.version}</p>
        </div>
      </header>

      <main className="setup">
        <section className={`panel setup-step ${info.gameDirFound ? 'done' : 'warn'}`} aria-label="Paso 1: Star Citizen">
          <div className="setup-num" aria-hidden>{info.gameDirFound ? <CheckCircle2 size={18} /> : '1'}</div>
          <div className="setup-body">
            <div className="label"><Radio size={14} aria-hidden /> Star Citizen</div>
            {info.gameDirFound ? (
              <>
                <div className="desk-ok">Juego encontrado</div>
                <div className="desk-path">{info.gameDir}</div>
              </>
            ) : (
              <>
                <div className="desk-bad"><TriangleAlert size={18} aria-hidden /> No encuentro Star Citizen</div>
                <div className="sub">Indica la carpeta donde está instalado: la que contiene <code>LIVE</code> o la propia <code>LIVE</code>.</div>
              </>
            )}
            {bridge && (
              <button className="chip desk-btn" onClick={chooseDir} disabled={choosing}>
                <FolderSearch size={15} aria-hidden /> {info.gameDirFound ? 'Cambiar carpeta…' : 'Elegir carpeta…'}
              </button>
            )}
            {dirMsg && <div className="sub" role="status">{dirMsg}</div>}
          </div>
        </section>

        <section className="panel setup-step current" aria-label="Paso 2: token de UEX">
          <div className="setup-num" aria-hidden>2</div>
          <div className="setup-body">
            <div className="label"><KeyRound size={14} aria-hidden /> Tu token de UEX</div>
            <div className="sub">
              CommandGlass usa <strong>UEX</strong> para los precios de mercancías y las rutas de comercio. Cada piloto usa su propio token:
              es gratis y se guarda solo en este PC.
            </div>
            <ol className="desk-steps setup-how">
              <li>
                Entra en{' '}
                <a href="https://uexcorp.space" target="_blank" rel="noreferrer">uexcorp.space <ExternalLink size={13} aria-hidden /></a>{' '}
                con tu cuenta (o créala).
              </li>
              <li>Abre <strong>My Apps</strong>, crea una aplicación (el nombre da igual: «CommandGlass») y copia su token.</li>
              <li>Pégalo aquí.</li>
            </ol>
            <form
              className="setup-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label className="note-label" htmlFor="setup-token">Token de UEX</label>
              <div className="toolbar">
                <input
                  id="setup-token"
                  className="search plain"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Pega aquí tu token"
                  value={token}
                  onChange={(e) => (setToken(e.target.value), setState({ k: 'idle' }))}
                  aria-invalid={state.k === 'error'}
                  aria-describedby={state.k === 'error' ? 'setup-token-err' : undefined}
                  autoFocus
                />
                <button className="chip on" type="submit" disabled={!token.trim() || state.k === 'saving' || state.k === 'saved'}>
                  {state.k === 'saving' ? 'Comprobando con UEX…' : 'Comprobar y guardar'}
                </button>
              </div>
              {state.k === 'error' && <div id="setup-token-err" className="pad-msg err" role="alert">{state.msg}</div>}
              {state.k === 'saved' && <div className="desk-ok" role="status"><CheckCircle2 size={16} aria-hidden /> Token guardado. Abriendo el código del tablet…</div>}
            </form>
          </div>
        </section>

        <section className="panel setup-step locked" aria-label="Paso 3: tablet">
          <div className="setup-num" aria-hidden>3</div>
          <div className="setup-body">
            <div className="label"><Tablet size={14} aria-hidden /> Tu tablet</div>
            <div className="sub">En cuanto guardes el token verás el código para emparejar el tablet.</div>
          </div>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Desktop />
  </StrictMode>,
);
