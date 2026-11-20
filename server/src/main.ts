import { networkInterfaces } from 'node:os';
import QRCode from 'qrcode';
import { startServer } from './api/server.ts';
import { APP_VERSION, backupsDir, DATA_DIR, dbPath, gameLogPath, loadConfig } from './config.ts';
import { BindingsService } from './game/bindings.ts';
import { KeySender } from './game/keysender.ts';
import { WikiMissions } from './game/wiki.ts';
import { WikiCatalog } from './game/catalog.ts';
import { CommunityContracts } from './game/starstrings.ts';
import { GameStarmap } from './game/starmap.ts';
import { setupLog } from './log.ts';
import { loadGameNames } from './game/gamenames.ts';
import { setGameNames } from './parser/names.ts';
import { gameLanguageSignature, loadHudStrings } from './game/gamelang.ts';
import { HudTranslator, setHudTranslator } from './parser/hudlang.ts';
import { importBackups } from './ingest/importer.ts';
import { LiveTailer } from './ingest/tailer.ts';
import { Store } from './store/db.ts';
import { getSetting } from './store/economy.ts';
import { UexMarket } from './game/uex.ts';

// Registro en data/logs/commandglass.log (va en el informe de diagnóstico).
setupLog(DATA_DIR);
// Dentro de la app de escritorio el servidor corre como proceso hijo de Electron: se le avisa al arrancar o al fallar.
const parent = (process as unknown as { parentPort?: { postMessage(m: unknown): void } }).parentPort;
// Un fallo antes de estar listo no se puede arreglar desde dentro: se avisa del motivo y se sale (ya está en el registro).
let started = false;
process.on('uncaughtException', (err) => {
  if (started) return;
  parent?.postMessage({ type: 'error', code: 'STARTUP', detail: err.message });
  process.exit(1);
});
const config = loadConfig();
const store = new Store(dbPath());

console.log(`CommandGlass ${APP_VERSION} · mobiGlas para Star Citizen\n`);
console.log(`Carpeta del juego: ${config.gameDir}`);

// Nombres oficiales de los sitios (Baijini Point, Everus Harbor…) antes de procesar el historial.
try {
  const names = loadGameNames(config.gameDir, DATA_DIR);
  setGameNames(names.en);
} catch (err) {
  console.warn(`Nombres del juego: no disponibles (${(err as Error).message})`);
}

// Juego en otro idioma (traducción oficial o de la comunidad): sus avisos se reconocen igual.
let langSig = '';
function applyGameLanguage(): void {
  const sig = gameLanguageSignature(config.gameDir);
  if (sig === langSig) return;
  langSig = sig;
  try {
    const strings = loadHudStrings(config.gameDir, DATA_DIR);
    const t = strings ? new HudTranslator(strings) : null;
    setHudTranslator(t);
    console.log(t ? `Idioma del juego: ${t.lang} (${t.size} avisos traducibles)` : 'Idioma del juego: inglés');
  } catch (err) {
    setHudTranslator(null);
    console.warn(`Idioma del juego: no se pueden leer sus textos (${(err as Error).message})`);
  }
}
applyGameLanguage();

const imp = importBackups(store, backupsDir(config));
console.log(`Historial: ${imp.files} logs archivados (${imp.imported} nuevos, ${imp.events} eventos añadidos)`);

const tailer = new LiveTailer(store, gameLogPath(config));
// Cuando el juego se reinicia, el log anterior pasa a logbackups/: se completa lo que faltase.
tailer.on('session', () => {
  applyGameLanguage(); // por si ha cambiado el idioma o la traducción entre partidas
  setTimeout(() => importBackups(store, backupsDir(config)), 5_000);
});
tailer.start();

const bindings = new BindingsService(config.gameDir, DATA_DIR);
const keys = new KeySender(DATA_DIR);
try {
  const c = bindings.get();
  console.log(`Controles: ${c.maps.reduce((n, m) => n + m.actions.filter((a) => a.keys).length, 0)} acciones con tecla${c.userProfile ? ' (con tus cambios)' : ''}`);
} catch (err) {
  console.warn(`Controles: no disponibles (${(err as Error).message})`);
}

const lanIp = pickLanIp();
const lanUrl = `http://${lanIp}:${config.port}`;
// Datos de misiones de la Star Citizen Wiki (facción, reputación, recompensa): se descargan en segundo plano.
const wiki = new WikiMissions(DATA_DIR);
wiki.list();
const catalog = new WikiCatalog(DATA_DIR);
// Datos de contratos extraídos del juego por la comunidad (StarStrings): reputación, naves, blueprints.
const community = new CommunityContracts(DATA_DIR, config.gameDir);
void community.refresh();
// Precios de mercancías de UEX: solo si el usuario ha puesto su token (se guarda en sus ajustes locales).
const uex = new UexMarket(DATA_DIR, () => getSetting<string>(store, 'uexToken'));
// Starmap del juego (posiciones reales de cada parche), extraído por la Star Citizen Wiki.
const starmap = new GameStarmap(DATA_DIR);
void starmap.refresh();
const { server, pairUrl } = startServer({ config, store, tailer, lanUrl, bindings, keys, wiki, catalog, community, uex, starmap });

server.on('listening', () => {
  started = true;
  parent?.postMessage({ type: 'ready', port: config.port });
});
server.on('error', (err: NodeJS.ErrnoException) => {
  // El texto para el usuario lo pone la ventana, en su idioma; aquí va el motivo exacto.
  console.error(
    err.code === 'EADDRINUSE'
      ? `El puerto ${config.port} ya está en uso: puede que CommandGlass ya esté abierto en otra ventana.`
      : `No se ha podido arrancar el servidor (${err.message}).`,
  );
  parent?.postMessage({ type: 'error', code: err.code ?? 'LISTEN', detail: err.message, port: config.port });
  process.exit(1);
});

console.log(`\nEn este PC:   http://localhost:${config.port}`);
console.log(`Emparejar:    http://localhost:${config.port}/pair  (o escanea este QR con el iPad)\n`);
console.log(await QRCode.toString(pairUrl, { type: 'terminal', small: true }));
console.log('Si Windows pregunta por el firewall, permite el acceso en redes privadas.');

function pickLanIp(): string {
  const candidates: { name: string; address: string }[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) {
        candidates.push({ name, address: a.address });
      }
    }
  }
  const virtual = /vEthernet|WSL|VirtualBox|VMware|Hyper-V|Loopback|Tailscale/i;
  const best =
    candidates.find((c) => !virtual.test(c.name) && c.address.startsWith('192.168.')) ??
    candidates.find((c) => !virtual.test(c.name)) ??
    candidates[0];
  return process.env.SC_LAN_IP ?? best?.address ?? 'localhost';
}

const shutdown = () => {
  tailer.stop();
  keys.stop();
  store.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
