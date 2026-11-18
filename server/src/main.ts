import { networkInterfaces } from 'node:os';
import QRCode from 'qrcode';
import { startServer } from './api/server.ts';
import { backupsDir, dbPath, gameLogPath, loadConfig } from './config.ts';
import { importBackups } from './ingest/importer.ts';
import { LiveTailer } from './ingest/tailer.ts';
import { Store } from './store/db.ts';

const config = loadConfig();
const store = new Store(dbPath());

console.log('SC Master · mobiGlas para Star Citizen\n');
console.log(`Carpeta del juego: ${config.gameDir}`);

const imp = importBackups(store, backupsDir(config));
console.log(`Historial: ${imp.files} logs archivados (${imp.imported} nuevos, ${imp.events} eventos añadidos)`);

const tailer = new LiveTailer(store, gameLogPath(config));
// Cuando el juego se reinicia, el log anterior pasa a logbackups/: se completa lo que faltase.
tailer.on('session', () => setTimeout(() => importBackups(store, backupsDir(config)), 5_000));
tailer.start();

const lanIp = pickLanIp();
const lanUrl = `http://${lanIp}:${config.port}`;
const { pairUrl } = startServer({ config, store, tailer, lanUrl });

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
  store.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
