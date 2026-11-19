import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '@fontsource/saira-semi-condensed/400.css';
import '@fontsource/saira-semi-condensed/500.css';
import './styles.css';
import './desktop.css';
import { CheckCircle2, Coffee, Copy, ExternalLink, FolderOpen, FolderSearch, KeyRound, Pin, Power, Radio, Tablet, TriangleAlert, X } from 'lucide-react';
import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import logo from './assets/space-cowboys.png';
import madeByCommunity from './assets/made-by-the-community.png';
import { hhmm } from './format.ts';
import { LangProvider, LangSwitch, useLang } from './lang.tsx';

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
  const { t } = useLang();
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
    setDirMsg(t(`Cambiando a ${ch}…`, `Switching to ${ch}…`));
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
    setDirMsg(
      r.ok
        ? t('Carpeta guardada. Reiniciando CommandGlass…', 'Folder saved. Restarting CommandGlass…')
        : (r.message ?? t('No se ha podido usar esa carpeta.', "Couldn't use that folder.")),
    );
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
          <p className="faint">{t('Tu mobiGlas para Star Citizen', 'Your mobiGlas for Star Citizen')}{info ? ` · ${info.version}` : ''}</p>
        </div>
        <MadeByCommunity />
      </header>

      {error && !info && (
        <div className="panel warn desk-alert" role="alert">
          <TriangleAlert size={18} aria-hidden />{' '}
          {t(
            'No responde el servidor de CommandGlass. Cierra la app desde la bandeja del sistema y vuelve a abrirla.',
            "The CommandGlass server isn't responding. Quit the app from the system tray and open it again.",
          )}
        </div>
      )}

      <main className="desk-grid">
        <section className="panel desk-qr" aria-label={t('Emparejar el tablet', 'Pair the tablet')}>
          <div className="label"><Tablet size={14} aria-hidden /> {t('Empareja tu tablet', 'Pair your tablet')}</div>
          {info ? (
            <div
              className="qr-box"
              dangerouslySetInnerHTML={{ __html: info.qrSvg }}
              aria-label={t('Código QR para abrir CommandGlass en el tablet', 'QR code to open CommandGlass on the tablet')}
              role="img"
            />
          ) : (
            <div className="qr-box qr-loading">{t('Preparando código…', 'Preparing code…')}</div>
          )}
          <ol className="desk-steps">
            <li>
              {t('Abre la', 'Open the tablet')} <strong>{t('cámara', 'camera')}</strong> {t('del tablet y apunta al código.', 'and point it at the code.')}
            </li>
            <li>{t('Toca el aviso para abrir CommandGlass en el navegador.', 'Tap the notification to open CommandGlass in the browser.')}</li>
            <li>
              {t('En el iPad, toca', 'On iPad, tap')} <strong>{t('Compartir → Añadir a pantalla de inicio', 'Share → Add to Home Screen')}</strong>
              {t('. En Android,', '. On Android,')} <strong>{t('menú ⋮ → Añadir a pantalla de inicio', '⋮ menu → Add to Home screen')}</strong>
              {t('. La app te lo recuerda la primera vez.', '. The app reminds you the first time.')}
            </li>
          </ol>
          <p className="faint desk-net">{t('El tablet tiene que estar en la misma wifi que este PC.', 'The tablet must be on the same Wi-Fi as this PC.')}</p>
          {info && (
            <button className="chip" onClick={copy}>
              <Copy size={15} aria-hidden /> {copied ? t('Enlace copiado', 'Link copied') : t('Copiar enlace', 'Copy link')}
            </button>
          )}
        </section>

        <div className="stack">
          <section className={`panel ${info && !info.gameDirFound ? 'warn' : ''}`} aria-label="Star Citizen">
            <div className="label"><Radio size={14} aria-hidden /> Star Citizen</div>
            {info?.gameDirFound ? (
              <>
                <div className="desk-ok"><CheckCircle2 size={18} aria-hidden /> {t('Juego encontrado', 'Game found')}</div>
                <div className="desk-path">{info.gameDir}</div>
                <div className="sub">
                  {info.status.active
                    ? t('Partida en directo: leyendo el registro del juego.', 'Live session: reading the game log.')
                    : info.status.found
                      ? t('Esperando a que abras el juego.', 'Waiting for you to launch the game.')
                      : t('Aún no hay registro: abre el juego una vez.', 'No log yet: launch the game once.')}
                </div>
              </>
            ) : info ? (
              <>
                <div className="desk-bad"><TriangleAlert size={18} aria-hidden /> {t('No encuentro Star Citizen', "Can't find Star Citizen")}</div>
                <GameDirHint />
              </>
            ) : (
              <div className="sub">{t('Comprobando…', 'Checking…')}</div>
            )}
            {channels && channels.available.length > 1 && (
              <div className="kv desk-channel">
                <span>{t('Versión del juego', 'Game version')}</span>
                <div className="segmented" role="group" aria-label={t('Versión del juego', 'Game version')}>
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
                <FolderSearch size={15} aria-hidden /> {info?.gameDirFound ? t('Cambiar carpeta…', 'Change folder…') : t('Elegir carpeta…', 'Choose folder…')}
              </button>
            )}
            {dirMsg && <div className="sub" role="status">{dirMsg}</div>}
          </section>

          <section className="panel" aria-label={t('Dispositivos', 'Devices')}>
            <div className="label"><Tablet size={14} aria-hidden /> {t('Conectados ahora', 'Connected now')}</div>
            {devices.length === 0 ? (
              <div className="sub">{t('Ningún tablet conectado todavía. Escanea el código para empezar.', 'No tablet connected yet. Scan the code to get started.')}</div>
            ) : (
              devices.map((d, i) => (
                <div key={i} className="kv">
                  <span className="desk-ok"><CheckCircle2 size={16} aria-hidden /> {d.agent}</span>
                  <span className="faint">{t(`desde las ${hhmm(d.since)}`, `since ${hhmm(d.since)}`)}</span>
                </div>
              ))
            )}
          </section>

          {bridge && (
            <section className="panel" aria-label={t('Ajustes', 'Settings')}>
              <div className="label"><Power size={14} aria-hidden /> {t('Ajustes', 'Settings')}</div>
              <div className="kv">
                <span>{t('Idioma', 'Language')}</span>
                <LangSwitch />
              </div>
              <div className="kv">
                <span>{t('Abrir CommandGlass al iniciar Windows', 'Open CommandGlass when Windows starts')}</span>
                {storeLogin ? (
                  <button className="chip" onClick={() => void bridge.setOpenAtLogin(true)}>
                    <Power size={15} aria-hidden /> {t('Configurar en Windows', 'Set up in Windows')}
                  </button>
                ) : (
                  <button
                    className={`seg ${atLogin ? 'on' : ''}`}
                    role="switch"
                    aria-checked={atLogin ?? false}
                    onClick={toggleLogin}
                    disabled={atLogin === null}
                  >
                    {atLogin ? t('Activado', 'On') : t('Desactivado', 'Off')}
                  </button>
                )}
              </div>
              <div className="kv">
                <span>{t('Tu historial y ajustes', 'Your history and settings')}</span>
                <button className="chip" onClick={() => bridge.openDataDir()}>
                  <FolderOpen size={15} aria-hidden /> {t('Abrir carpeta', 'Open folder')}
                </button>
              </div>
            </section>
          )}

          {pinTip && (
            <section className="panel desk-tip" aria-label={t('Anclar a la barra de tareas', 'Pin to taskbar')}>
              <button className="desk-close" onClick={() => (setPinTip(false), writeFlag(PIN_TIP_KEY))} aria-label={t('Cerrar aviso', 'Dismiss tip')}>
                <X size={16} aria-hidden />
              </button>
              <div className="label"><Pin size={14} aria-hidden /> {t('Tenlo a mano', 'Keep it handy')}</div>
              <div className="sub">
                {t(
                  'Para anclarlo a la barra de tareas: clic derecho en el icono de CommandGlass en la barra →',
                  'To pin it to the taskbar: right-click the CommandGlass icon on the taskbar →',
                )}{' '}
                <strong>{t('Anclar a la barra de tareas', 'Pin to taskbar')}</strong>.
              </div>
            </section>
          )}

          {DONATE_URL && (
            <section className="panel" aria-label={t('Invitar a un café', 'Buy a coffee')}>
              <div className="label"><Coffee size={14} aria-hidden /> {t('¿Te está siendo útil?', 'Finding it useful?')}</div>
              <div className="sub">
                {t(
                  'CommandGlass es gratis. Si te ayuda en tus partidas, puedes invitar a robertogeek a un café, o a lo que quieras.',
                  'CommandGlass is free. If it helps your sessions, you can buy robertogeek a coffee, or whatever you like.',
                )}
              </div>
              <a className="chip desk-btn" href={DONATE_URL} target="_blank" rel="noreferrer">
                <Coffee size={15} aria-hidden /> {t('Invitar con PayPal', 'Tip with PayPal')} <ExternalLink size={13} aria-hidden />
              </a>
            </section>
          )}
        </div>
      </main>

      <CommunityFooter>
        {t(
          'Cerrar esta ventana no apaga CommandGlass: sigue funcionando en la bandeja del sistema, junto al reloj.',
          "Closing this window doesn't shut down CommandGlass: it keeps running in the system tray, next to the clock.",
        )}
      </CommunityFooter>
    </div>
  );
}

/** Qué carpeta indicar cuando no se encuentra el juego. */
function GameDirHint() {
  const { lang } = useLang();
  return lang === 'es' ? (
    <div className="sub">Indica la carpeta donde está instalado: la que contiene <code>LIVE</code> o la propia <code>LIVE</code>.</div>
  ) : (
    <div className="sub">Choose the folder where it's installed: the one that contains <code>LIVE</code>, or <code>LIVE</code> itself.</div>
  );
}

/** Logo «Made by the Community» de CIG, en la esquina superior derecha para que siempre se vea. */
function MadeByCommunity() {
  return <img className="desk-mbtc" src={madeByCommunity} alt="Made by the Community" width={56} height={56} />;
}

/**
 * Pie con los avisos que pide CIG en su Fankit and Fandom FAQ
 * (support.robertsspaceindustries.com/hc/en-us/articles/360006895793). Los textos van tal cual los da CIG.
 */
function CommunityFooter({ children }: { children?: ReactNode }) {
  return (
    <footer className="desk-foot">
      <div className="desk-foot-text">
        {children && <p>{children}</p>}
        <p className="desk-legal">
          This is an unofficial Star Citizen fan project, not affiliated with the Cloud Imperium group of companies.
          Star Citizen®, Roberts Space Industries® and Cloud Imperium® are registered trademarks of Cloud Imperium Rights LLC.
        </p>
      </div>
    </footer>
  );
}

/**
 * Configuración inicial (obligatoria): carpeta de Star Citizen y token de UEX.
 * Hasta que el token no esté guardado no aparece el código para emparejar el tablet.
 */
function Setup({ info, chooseDir, choosing, dirMsg }: { info: DesktopInfo; chooseDir: () => void; choosing: boolean; dirMsg: string | null }) {
  const { t } = useLang();
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
      if (!res.ok) throw new Error(body?.error ?? t('No se ha podido guardar el token.', "Couldn't save the token."));
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
          <p className="faint">{t('Configuración inicial', 'Initial setup')} · {info.version}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <LangSwitch />
          <MadeByCommunity />
        </div>
      </header>

      <main className="setup">
        <section className={`panel setup-step ${info.gameDirFound ? 'done' : 'warn'}`} aria-label={t('Paso 1: Star Citizen', 'Step 1: Star Citizen')}>
          <div className="setup-num" aria-hidden>{info.gameDirFound ? <CheckCircle2 size={18} /> : '1'}</div>
          <div className="setup-body">
            <div className="label"><Radio size={14} aria-hidden /> Star Citizen</div>
            {info.gameDirFound ? (
              <>
                <div className="desk-ok">{t('Juego encontrado', 'Game found')}</div>
                <div className="desk-path">{info.gameDir}</div>
              </>
            ) : (
              <>
                <div className="desk-bad"><TriangleAlert size={18} aria-hidden /> {t('No encuentro Star Citizen', "Can't find Star Citizen")}</div>
                <GameDirHint />
              </>
            )}
            {bridge && (
              <button className="chip desk-btn" onClick={chooseDir} disabled={choosing}>
                <FolderSearch size={15} aria-hidden /> {info.gameDirFound ? t('Cambiar carpeta…', 'Change folder…') : t('Elegir carpeta…', 'Choose folder…')}
              </button>
            )}
            {dirMsg && <div className="sub" role="status">{dirMsg}</div>}
          </div>
        </section>

        <section className="panel setup-step current" aria-label={t('Paso 2: token de UEX', 'Step 2: UEX token')}>
          <div className="setup-num" aria-hidden>2</div>
          <div className="setup-body">
            <div className="label"><KeyRound size={14} aria-hidden /> {t('Tu token de UEX', 'Your UEX token')}</div>
            <div className="sub">
              {t('CommandGlass usa', 'CommandGlass uses')} <strong>UEX</strong>{' '}
              {t(
                'para los precios de mercancías y las rutas de comercio. Cada piloto usa su propio token: es gratis y se guarda solo en este PC.',
                "for commodity prices and trade routes. Each pilot uses their own token: it's free and stored only on this PC.",
              )}
            </div>
            <ol className="desk-steps setup-how">
              <li>
                {t('Entra en', 'Sign in to')}{' '}
                <a href="https://uexcorp.space" target="_blank" rel="noreferrer">uexcorp.space <ExternalLink size={13} aria-hidden /></a>{' '}
                {t('con tu cuenta (o créala).', 'with your account (or create one).')}
              </li>
              <li>
                {t('Abre', 'Open')} <strong>My Apps</strong>
                {t(
                  ', crea una aplicación (el nombre da igual: «CommandGlass») y copia su token.',
                  ', create an app (any name works, e.g. "CommandGlass") and copy its token.',
                )}
              </li>
              <li>{t('Pégalo aquí.', 'Paste it here.')}</li>
            </ol>
            <form
              className="setup-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <label className="note-label" htmlFor="setup-token">{t('Token de UEX', 'UEX token')}</label>
              <div className="toolbar">
                <input
                  id="setup-token"
                  className="search plain"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t('Pega aquí tu token', 'Paste your token here')}
                  value={token}
                  onChange={(e) => (setToken(e.target.value), setState({ k: 'idle' }))}
                  aria-invalid={state.k === 'error'}
                  aria-describedby={state.k === 'error' ? 'setup-token-err' : undefined}
                  autoFocus
                />
                <button className="chip on" type="submit" disabled={!token.trim() || state.k === 'saving' || state.k === 'saved'}>
                  {state.k === 'saving' ? t('Comprobando con UEX…', 'Checking with UEX…') : t('Comprobar y guardar', 'Check and save')}
                </button>
              </div>
              {state.k === 'error' && <div id="setup-token-err" className="pad-msg err" role="alert">{state.msg}</div>}
              {state.k === 'saved' && (
                <div className="desk-ok" role="status">
                  <CheckCircle2 size={16} aria-hidden /> {t('Token guardado. Abriendo el código del tablet…', 'Token saved. Opening the tablet code…')}
                </div>
              )}
            </form>
          </div>
        </section>

        <section className="panel setup-step locked" aria-label={t('Paso 3: tablet', 'Step 3: tablet')}>
          <div className="setup-num" aria-hidden>3</div>
          <div className="setup-body">
            <div className="label"><Tablet size={14} aria-hidden /> {t('Tu tablet', 'Your tablet')}</div>
            <div className="sub">{t('En cuanto guardes el token verás el código para emparejar el tablet.', "As soon as you save the token, you'll see the code to pair your tablet.")}</div>
          </div>
        </section>
      </main>

      <CommunityFooter />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <Desktop />
    </LangProvider>
  </StrictMode>,
);
