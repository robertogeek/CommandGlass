import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '@fontsource/saira-semi-condensed/400.css';
import '@fontsource/saira-semi-condensed/500.css';
import './styles.css';
import './desktop.css';
import { Activity, CheckCircle2, Coffee, Copy, Download, ExternalLink, FileDown, FolderOpen, FolderSearch, KeyRound, LifeBuoy, MessagesSquare, Power, Radio, RefreshCw, Tablet, TriangleAlert } from 'lucide-react';
import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import logo from './assets/space-cowboys.png';
import madeByCommunity from './assets/made-by-the-community.png';
import { hhmm } from './format.ts';
import { LangProvider, LangSwitch, useLang } from './lang.tsx';
import { startClientLog } from './clientLog.ts';

startClientLog('ventana del PC');

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
  /** false en la versión de la Microsoft Store (y en versiones antiguas de la app, que no lo tienen). */
  canLaunchTelemetry?(): Promise<boolean>;
  launchTelemetry?(closeFirst: boolean): Promise<LaunchResult>;
  /** Estado de la actualización; null si no aplica (Store o desarrollo). No existe en versiones antiguas de la app. */
  getUpdate?(): Promise<UpdateState | null>;
  installUpdate?(): Promise<void>;
  /** Mirar ahora si hay versión nueva (desde la 0.1.7). */
  checkUpdate?(): Promise<void>;
  onUpdate?(cb: (s: UpdateState) => void): () => void;
}

type UpdateState =
  | { state: 'idle' | 'checking' }
  | { state: 'none'; version: string }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready' | 'installing'; version: string }
  | { state: 'error'; message: string };

type LaunchResult = { ok: true; closed: boolean } | { ok: false; reason: 'not-found' | 'game-running' | 'launcher-running' | 'failed'; detail?: string };

declare global {
  interface Window {
    commandglass?: Bridge;
  }
}

const bridge = window.commandglass;
/** Enlace de PayPal de robertogeek para que quien quiera le invite a un café. Vacío = no se muestra. */
const DONATE_URL = 'https://paypal.me/robertogeek';
/** Donde UEX enseña el token de cada usuario («Bearer Token»): no hay que crear ninguna aplicación. */
const UEX_TOKEN_URL = 'https://uexcorp.space/api/apps';
/**
 * Comentarios en el Discord de la comunidad. Pasa por la web para poder cambiar la invitación sin sacar versión:
 * robertogeek.com/CommandGlass/discord redirige a la invitación que da el rol de CommandGlass.
 */
const DISCORD_URL = 'https://robertogeek.com/CommandGlass/discord';

/** "0.1.6-beta" → "0.1.6 beta". */
const prettyVersion = (v: string) => v.replace('-', ' ');

/**
 * Actualización de la versión de GitHub: se descarga sola al abrir la app y se instala si no estás jugando.
 * Mientras pasa algo se ve el progreso; si no, «Al día» con «Buscar ahora» para mirarlo a mano.
 * En la versión de la Microsoft Store no sale nada: la actualiza la Store.
 */
function UpdateNotice() {
  const { t } = useLang();
  const [u, setU] = useState<UpdateState | null>(null);
  useEffect(() => {
    if (!bridge?.getUpdate) return;
    bridge.getUpdate().then(setU).catch(() => setU(null));
    return bridge.onUpdate?.(setU);
  }, []);
  if (!u) return null;
  if (u.state === 'downloading') {
    return (
      <div className="desk-update" role="status">
        <Download size={16} aria-hidden /> {t(`Descargando la ${prettyVersion(u.version)}… ${u.percent} %`, `Downloading ${prettyVersion(u.version)}… ${u.percent}%`)}
      </div>
    );
  }
  if (u.state === 'ready') {
    return (
      <button className="chip on desk-update-go" onClick={() => void bridge?.installUpdate?.()} title={t('Se instalará al salir de la app si no lo haces ahora.', "It will install when you quit the app if you don't do it now.")}>
        <Download size={16} aria-hidden /> {t(`Instalar la ${prettyVersion(u.version)} y reiniciar`, `Install ${prettyVersion(u.version)} and restart`)}
      </button>
    );
  }
  if (u.state === 'installing') {
    return (
      <div className="desk-update" role="status">
        <Download size={16} aria-hidden /> {t(`Instalando la ${prettyVersion(u.version)}…`, `Installing ${prettyVersion(u.version)}…`)}
      </div>
    );
  }
  if (u.state === 'checking') {
    return (
      <div className="desk-update" role="status">
        <RefreshCw size={16} aria-hidden className="spin" /> {t('Buscando versión nueva…', 'Checking for updates…')}
      </div>
    );
  }
  // Al día, sin mirar todavía o sin poder mirar (sin red): se puede buscar a mano.
  const label =
    u.state === 'none' ? t('Al día', 'Up to date') : u.state === 'error' ? t('No se ha podido comprobar', "Couldn't check") : null;
  if (!bridge?.checkUpdate) return null;
  return (
    <div className="desk-update" role="status">
      {u.state === 'none' && <CheckCircle2 size={16} aria-hidden className="ok" />}
      {u.state === 'error' && <TriangleAlert size={16} aria-hidden />}
      {label}
      <button className="desk-update-check" onClick={() => void bridge?.checkUpdate?.()}>
        <RefreshCw size={14} aria-hidden /> {t('Buscar ahora', 'Check now')}
      </button>
    </div>
  );
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
        <img className="org-logo" src={logo} alt="Space Cowboys" width={64} height={54} />
        <div>
          <h1>CommandGlass</h1>
          <p className="faint">{t('Tu mobiGlas para Star Citizen', 'Your mobiGlas for Star Citizen')}{info ? ` · ${info.version}` : ''}</p>
        </div>
        <div className="desk-head-tools">
          <UpdateNotice />
          <LangSwitch />
          <MadeByCommunity />
        </div>
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

      <main className="desk-main">
        <section className="panel desk-tablet" aria-label={t('Emparejar el tablet', 'Pair the tablet')}>
          <div className="label"><Tablet size={16} aria-hidden /> {t('Empareja tu tablet', 'Pair your tablet')}</div>
          <div className="desk-qr-wrap">
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
          </div>
          <ol className="desk-howto">
            <li>
              <span className="desk-num" aria-hidden>1</span>
              <span>
                {t('Abre la', 'Open the tablet')} <strong>{t('cámara', 'camera')}</strong> {t('del tablet y apunta al código.', 'and point it at the code.')}
              </span>
            </li>
            <li>
              <span className="desk-num" aria-hidden>2</span>
              <span>{t('Toca el aviso para abrir CommandGlass en el navegador.', 'Tap the notification to open CommandGlass in the browser.')}</span>
            </li>
            <li>
              <span className="desk-num" aria-hidden>3</span>
              <span>
                {t('Añádelo a la pantalla de inicio: en el iPad,', 'Add it to the Home Screen: on iPad,')} <strong>{t('Compartir', 'Share')}</strong>
                {t('; en Android, el', '; on Android, the')} <strong>{t('menú ⋮', '⋮ menu')}</strong>.
              </span>
            </li>
          </ol>
          <div className="desk-pair-foot">
            <span className="faint">{t('El tablet tiene que estar en la misma wifi que este PC.', 'The tablet must be on the same Wi-Fi as this PC.')}</span>
            {info && (
              <button className="chip" onClick={copy}>
                <Copy size={15} aria-hidden /> {copied ? t('Enlace copiado', 'Link copied') : t('Copiar enlace', 'Copy link')}
              </button>
            )}
          </div>
          <div className="desk-conn" aria-label={t('Conectados ahora', 'Connected now')}>
            <div className="desk-sublabel">{t('Conectados ahora', 'Connected now')}</div>
            {devices.length === 0 ? (
              <div className="sub">{t('Ningún tablet todavía. Escanea el código para empezar.', 'No tablet yet. Scan the code to get started.')}</div>
            ) : (
              devices.map((d, i) => (
                <div key={i} className="desk-device">
                  <span className="desk-ok"><CheckCircle2 size={16} aria-hidden /> {d.agent}</span>
                  <span className="faint">{t(`desde las ${hhmm(d.since)}`, `since ${hhmm(d.since)}`)}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className={`panel desk-game ${info && !info.gameDirFound ? 'warn' : ''}`} aria-label="Star Citizen">
          <div className="label"><Radio size={16} aria-hidden /> Star Citizen</div>
          {info?.gameDirFound ? (
            <div className="desk-state">
              <span className={`desk-dot ${info.status.active ? 'live' : ''}`} aria-hidden />
              <div>
                <div className="desk-state-title">{t('Juego encontrado', 'Game found')}</div>
                <div className="sub">
                  {info.status.active
                    ? t('Partida en directo: leyendo el registro del juego.', 'Live session: reading the game log.')
                    : info.status.found
                      ? t('Esperando a que abras el juego.', 'Waiting for you to launch the game.')
                      : t('Aún no hay registro: abre el juego una vez.', 'No log yet: launch the game once.')}
                </div>
              </div>
            </div>
          ) : info ? (
            <div>
              <div className="desk-bad"><TriangleAlert size={18} aria-hidden /> {t('No encuentro Star Citizen', "Can't find Star Citizen")}</div>
              <GameDirHint />
            </div>
          ) : (
            <div className="sub">{t('Comprobando…', 'Checking…')}</div>
          )}
          <div className="desk-field">
            <div className="desk-sublabel">{t('Carpeta del juego', 'Game folder')}</div>
            <div className="desk-folder">
              <div className="desk-path" title={info?.gameDir}>{info?.gameDirFound ? info.gameDir : '—'}</div>
              {bridge && (
                <button className="chip" onClick={chooseDir} disabled={choosing}>
                  <FolderSearch size={15} aria-hidden /> {info?.gameDirFound ? t('Cambiar…', 'Change…') : t('Elegir carpeta…', 'Choose folder…')}
                </button>
              )}
            </div>
          </div>
          {channels && channels.available.length > 1 && (
            <div className="desk-field">
              <div className="desk-sublabel">{t('Versión del juego', 'Game version')}</div>
              <div className="segmented" role="group" aria-label={t('Versión del juego', 'Game version')}>
                {channels.available.map((ch) => (
                  <button key={ch} className={`seg ${ch === channels.current ? 'on' : ''}`} onClick={() => switchChannel(ch)} aria-pressed={ch === channels.current}>
                    {ch}
                  </button>
                ))}
              </div>
            </div>
          )}
          {dirMsg && <div className="sub" role="status">{dirMsg}</div>}
        </section>

        {info?.gameDirFound && <TelemetryLaunch />}

        <div className="desk-side">
          {bridge && (
            <section className="panel" aria-label={t('Ajustes', 'Settings')}>
              <div className="label"><Power size={16} aria-hidden /> {t('Ajustes', 'Settings')}</div>
              <div className="kv">
                <span>{t('Abrir al iniciar Windows', 'Open when Windows starts')}</span>
                {storeLogin ? (
                  <button className="chip" onClick={() => void bridge.setOpenAtLogin(true)}>
                    <Power size={15} aria-hidden /> {t('Configurar', 'Set up')}
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

          <Diagnostics />

          <section className="panel desk-coffee" aria-label={t('Comunidad', 'Community')}>
            <div className="label"><MessagesSquare size={16} aria-hidden /> {t('Cuéntanos qué te parece', 'Tell us what you think')}</div>
            <div className="sub">
              {t(
                'Ideas, fallos y dudas, en el Discord de la comunidad: con este enlace ves el chat y el foro de CommandGlass. Y si te ayuda en tus partidas, puedes invitar a robertogeek a un café.',
                'Ideas, bugs and questions go on the community Discord: this link gives you the CommandGlass chat and forum. And if it helps your sessions, you can buy robertogeek a coffee.',
              )}
            </div>
            <div className="desk-coffee-actions">
              <a className="chip" href={DISCORD_URL} target="_blank" rel="noreferrer">
                <MessagesSquare size={15} aria-hidden /> {t('Abrir el Discord', 'Open Discord')} <ExternalLink size={13} aria-hidden />
              </a>
              {DONATE_URL && (
                <a className="chip" href={DONATE_URL} target="_blank" rel="noreferrer">
                  <Coffee size={15} aria-hidden /> {t('Invitar con PayPal', 'Tip with PayPal')} <ExternalLink size={13} aria-hidden />
                </a>
              )}
            </div>
          </section>
        </div>
      </main>

      <CommunityFooter>
        {t(
          'Cerrar esta ventana no apaga CommandGlass: sigue en la bandeja del sistema, junto al reloj. Para tenerlo a mano, clic derecho en su icono de la barra de tareas → Anclar a la barra de tareas.',
          "Closing this window doesn't shut down CommandGlass: it keeps running in the system tray, next to the clock. To keep it handy, right-click its taskbar icon → Pin to taskbar.",
        )}
      </CommunityFooter>
    </div>
  );
}

/** Abrir el RSI Launcher con la telemetría encendida, para la pestaña Telemetría del tablet. */
function TelemetryLaunch() {
  const { t } = useLang();
  // null = aún no se sabe; false = versión de la Store (o una app antigua): se explica cómo hacerlo a mano.
  const [can, setCan] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LaunchResult | null>(null);
  useEffect(() => {
    if (!bridge?.canLaunchTelemetry) return setCan(false);
    bridge.canLaunchTelemetry().then(setCan).catch(() => setCan(false));
  }, []);

  const launch = async (closeFirst: boolean) => {
    if (!bridge?.launchTelemetry) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await bridge.launchTelemetry(closeFirst));
    } catch {
      setResult({ ok: false, reason: 'failed' });
    }
    setBusy(false);
  };

  const message = (r: LaunchResult): string => {
    if (r.ok) return t('Launcher abierto con la telemetría. Entra al universo y mira la pestaña Telemetría del tablet.', 'Launcher opened with telemetry. Enter the universe and check the Telemetry tab on the tablet.');
    switch (r.reason) {
      case 'launcher-running':
        return t(
          'El RSI Launcher ya está abierto y así no se activa: hay que cerrarlo y reabrirlo. Si está descargando una actualización, espera a que termine.',
          "The RSI Launcher is already open, so it won't turn on: it has to be closed and reopened. If it's downloading an update, wait for it to finish.",
        );
      case 'game-running':
        return t('Star Citizen está abierto. Sal del juego y vuelve a pulsar: la telemetría se enciende al abrir el launcher.', 'Star Citizen is running. Quit the game and press again: telemetry turns on when the launcher opens.');
      case 'not-found':
        return t('No encuentro el RSI Launcher. Ábrelo a mano con el comando de la pestaña Telemetría.', "Can't find the RSI Launcher. Open it by hand with the command in the Telemetry tab.");
      default:
        return t('No se ha podido abrir el RSI Launcher.', "Couldn't open the RSI Launcher.");
    }
  };

  const mustClose = result && !result.ok && result.reason === 'launcher-running';
  return (
    <section className={`panel desk-tele ${result ? 'has-result' : ''}`} aria-label={t('Telemetría', 'Telemetry')}>
      <div className="label">
        <Activity size={16} aria-hidden /> {t('Telemetría', 'Telemetry')} <span className="desk-badge">{t('Experimental', 'Experimental')}</span>
      </div>
      <p className="sub">
        {t(
          'Star Citizen puede enviar al tablet lo que pasa en directo, unas 18 veces por segundo. Viene apagada: se enciende al abrir el RSI Launcher de una forma concreta, solo para esa vez.',
          "Star Citizen can send the tablet what's happening live, about 18 times a second. It's off by default: it turns on when the RSI Launcher is opened in a specific way, just for that time.",
        )}
      </p>
      <div className="desk-tele-what">
        <div>
          <div className="desk-sublabel">{t('Tu personaje', 'Your character')}</div>
          <span>{t('Salud, oxígeno, hambre, sed, pulso, entorno y saldo', 'Health, oxygen, hunger, thirst, heart rate, environment and balance')}</span>
        </div>
        <div>
          <div className="desk-sublabel">{t('Tu nave', 'Your ship')}</div>
          <span>{t('Luces de aviso, velocidad, rumbo, hidrógeno, boost, energía, armas y contramedidas', 'Warning lights, speed, heading, hydrogen, boost, power, weapons and countermeasures')}</span>
        </div>
      </div>
      {can !== false && (
        <ol className="desk-howto">
          <li>
            <span className="desk-num" aria-hidden>1</span>
            <span>{t('Pulsa el botón de abajo: se abre el RSI Launcher.', 'Press the button below: the RSI Launcher opens.')}</span>
          </li>
          <li>
            <span className="desk-num" aria-hidden>2</span>
            <span>{t('Entra al universo como siempre.', 'Enter the universe as usual.')}</span>
          </li>
          <li>
            <span className="desk-num" aria-hidden>3</span>
            <span>{t('En el tablet, abre la pestaña Telemetría.', 'On the tablet, open the Telemetry tab.')}</span>
          </li>
        </ol>
      )}
      <div className="desk-tele-go">
        {can === false ? (
          <div className="sub">
            {t(
              'En la versión de la Microsoft Store se activa a mano: la pestaña Telemetría del tablet explica cómo.',
              'In the Microsoft Store version it is turned on by hand: the Telemetry tab on the tablet explains how.',
            )}
          </div>
        ) : (
          <>
            {result && (
              <div className={`sub ${result.ok ? 'desk-ok' : 'desk-warn'}`} role="status">
                {message(result)}
              </div>
            )}
            <div className="desk-actions">
              {mustClose ? (
                <>
                  <button className="chip on desk-big" onClick={() => void launch(true)} disabled={busy}>
                    <Power size={16} aria-hidden /> {busy ? t('Reabriendo…', 'Reopening…') : t('Cerrar el launcher y reabrirlo', 'Close and reopen the launcher')}
                  </button>
                  <button className="chip" onClick={() => setResult(null)} disabled={busy}>
                    {t('Cancelar', 'Cancel')}
                  </button>
                </>
              ) : (
                <button className="chip on desk-big" onClick={() => void launch(false)} disabled={busy || can === null}>
                  <Activity size={16} aria-hidden /> {busy ? t('Abriendo…', 'Opening…') : t('Abrir Star Citizen con telemetría', 'Open Star Citizen with telemetry')}
                </button>
              )}
            </div>
            {!result && (
              <div className="faint desk-small">{t('No cambia nada en tu PC ni en el juego, y solo lee datos.', 'Nothing changes on your PC or in the game, and it only reads data.')}</div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** Qué carpeta indicar cuando no se encuentra el juego. */
const SUPPORT_MAIL = 'mail+commandglass@robertoromero.es';

/** Informe de diagnóstico: se guarda como .zip y el usuario lo manda por correo. No se envía solo. */
function Diagnostics() {
  const { t } = useLang();
  const [withGameLog, setWithGameLog] = useState(true);
  const [created, setCreated] = useState(false);
  const mail =
    `mailto:${SUPPORT_MAIL}?subject=${encodeURIComponent(t('CommandGlass: algo no funciona', "CommandGlass: something isn't working"))}` +
    `&body=${encodeURIComponent(t('Qué falla y cuándo:\n\n\nAdjunto el informe de diagnóstico.', "What's wrong and when:\n\n\nThe diagnostic report is attached."))}`;
  return (
    <section className="panel" aria-label={t('Informe de diagnóstico', 'Diagnostic report')}>
      <div className="label"><LifeBuoy size={16} aria-hidden /> {t('¿Algo no funciona?', "Something isn't working?")}</div>
      <div className="sub">
        {t(
          'Crea un informe y mándalo por correo contando qué falla. No se envía solo y nunca lleva tu token de UEX. Si falla el tablet, tenlo abierto al crearlo.',
          "Create a report and email it, telling us what's wrong. Nothing is sent automatically and it never includes your UEX token. If the tablet is failing, keep it open while you create it.",
        )}
      </div>
      <div className="desk-report">
        <label className="desk-check">
          <input type="checkbox" checked={withGameLog} onChange={(e) => setWithGameLog(e.target.checked)} />
          <span>
            {t(
              'Incluir el Game.log de la última partida (lleva tu nombre de jugador y el de otros con los que te has cruzado)',
              "Include the Game.log from your last session (it has your player name and those of others you've come across)",
            )}
          </span>
        </label>
        <a className="chip" href={`/api/diagnostics?gamelog=${withGameLog ? 1 : 0}`} download onClick={() => setCreated(true)}>
          <FileDown size={15} aria-hidden /> {t('Crear informe…', 'Create report…')}
        </a>
      </div>
      {created && (
        <div className="sub" role="status">
          {t('Guarda el .zip y envíalo a ', 'Save the .zip and send it to ')}
          <a href={mail}>{SUPPORT_MAIL}</a>
          {t(' con el archivo adjunto.', ' with the file attached.')}
        </div>
      )}
    </section>
  );
}

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
                {t('Abre', 'Open')}{' '}
                <a href={UEX_TOKEN_URL} target="_blank" rel="noreferrer">uexcorp.space/api/apps <ExternalLink size={13} aria-hidden /></a>
                {t(': ahí está tu ', ': your ')}
                <strong>Bearer Token</strong>
                {t('. No hace falta crear ninguna aplicación.', " is there. You don't need to create an app.")}
              </li>
              <li>{t('Pulsa el ojo para verlo, cópialo y pégalo aquí. Es siempre el mismo.', 'Click the eye to show it, copy it and paste it here. It never changes.')}</li>
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
