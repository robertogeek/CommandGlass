import { networkInterfaces } from 'node:os';
import QRCode from 'qrcode';
import { startServer } from './api/server.ts';
import { backupsDir, DATA_DIR, dbPath, gameLogPath, loadConfig } from './config.ts';
import { BindingsService } from './game/bindings.ts';
import { KeySender } from './game/keysender.ts';
import { importBackups } from './ingest/importer.ts';
import { LiveTailer } from './ingest/tailer.ts';
import { Store } from './store/db.ts';

const config = loadConfig();
const store = new Store(dbPath());

console.log('CommandGlass · mobiGlas para Star Citizen\n');
console.log(`Carpeta del juego: ${config.gameDir}`);

const imp = importBackups(store, backupsDir(config));
console.log(`Historial: ${imp.files} logs archivados (${imp.imported} nuevos, ${imp.events} eventos añadidos)`);

const tailer = new LiveTailer(store, gameLogPath(config));
// Cuando el juego se reinicia, el log anterior pasa a logbackups/: se completa lo que faltase.
tailer.on('session', () => setTimeout(() => importBackups(store, backupsDir(config)), 5_000));
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
const { server, pairUrl } = startServer({ config, store, tailer, lanUrl, bindings, keys });

// Dentro de la app de escritorio el servidor corre como proceso hijo de Electron: se le avisa al arrancar o al fallar.
const parent = (process as unknown as { parentPort?: { postMessage(m: unknown): void } }).parentPort;
server.on('listening', () => parent?.postMessage({ type: 'ready', port: config.port }));
server.on('error', (err: NodeJS.ErrnoException) => {
  const message =
    err.code === 'EADDRINUSE'
      ? `El puerto ${config.port} ya está en uso: puede que CommandGlass ya esté abierto en otra ventana.`
      : `No se ha podido arrancar el servidor (${err.message}).`;
  console.error(message);
  parent?.postMessage({ type: 'error', code: err.code ?? null, message });
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
