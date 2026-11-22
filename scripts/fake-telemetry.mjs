// Juego de mentira para probar la pestaña Telemetría sin abrir Star Citizen: un servidor gRPC (http2)
// que emite fotogramas como los del juego a ~18 Hz, con valores de una captura real de una Aurora Mk II.
// Uso: node scripts/fake-telemetry.mjs [puerto=29420] y arrancar CommandGlass con CG_TELEMETRY_PORTS=29420.
// El modo se lee en cada fotograma de scripts/mode.txt: ship (por defecto) | alert | foot | silent.
import http2 from 'node:http2';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] ?? 29420);
const MODE_FILE = join(dirname(fileURLToPath(import.meta.url)), 'mode.txt');
const mode = () => { try { return readFileSync(MODE_FILE, 'utf8').trim(); } catch { return 'ship'; } };

function varint(n) {
  const out = [];
  let v = BigInt.asUintN(64, BigInt(Math.round(n)));
  do { let b = Number(v & 0x7fn); v >>= 7n; if (v) b |= 0x80; out.push(b); } while (v);
  return Buffer.from(out);
}
function enc(fields) {
  const parts = [];
  for (const [n, v] of fields) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'number') parts.push(varint(n * 8), varint(v));
    else if (typeof v === 'string' || Buffer.isBuffer(v) || Array.isArray(v)) {
      const body = typeof v === 'string' ? Buffer.from(v) : Buffer.isBuffer(v) ? v : enc(v);
      parts.push(varint(n * 8 + 2), varint(body.length), body);
    } else { const b = Buffer.alloc(4); b.writeFloatLE(v.f32); parts.push(varint(n * 8 + 5), b); }
  }
  return Buffer.concat(parts);
}
const f = (x) => ({ f32: x });
const MAXF = 3.4028234663852886e38;

function actor(t, seated, alert) {
  return [6, [
    [1, [[1, [[1, f(alert ? 38 : 100)], [2, f(100)]]], [2, [[1, f(1)], [2, f(1)]]], [3, [[1, f(76.1042)], [2, f(100)]]], [4, [[1, f(alert ? 92 : 100)], [2, f(100)]]],
      [5, [[1, f(alert ? 37.4 : 36.5)], [2, f(100)]]], [7, f((alert ? 118 : 59) + 3 * Math.sin(t / 900))], [8, f(1.0003)], [9, f(alert ? 0.92 : 1)]]],
    [2, seated ? [[1, 3], [2, 1], [3, 'RSI_Aurora_Mk2_SeatDashboard_Pilot_949464407740'], [4, 5976305]] : [[1, 1], [4, 5976305]]],
    [3, [[1, f(alert ? 18 : 21)], [3, 1]]],
  ]];
}

function frame(t) {
  const m = mode();
  if (m === 'foot') return enc([actor(t, false, false)]);
  const alert = m === 'alert';
  const speed = alert ? 214 + 20 * Math.sin(t / 1500) : 1229.99 + 0.5 * Math.sin(t / 700);
  const heading = alert ? (312 + t / 400) % 360 : 55.7444;
  const ann = alert ? [1, 1, 3, 5, 1, 2, 1, 4, 6, 5] : [1, 4, 1, 2, 2, 1, 1, 1, 1, 1];
  const ins = [
    [1, f(speed)], [2, f(alert ? 0.61 : 0.9944)], [4, [[1, f(alert ? 7.9 : 5.4775)], [2, f(19.0813)]]],
    [5, alert ? [[1, 1], [2, f(1)], [3, f(0.42)]] : [[3, f(0.8994)]]],
    [6, f(alert ? 1240 : MAXF)], [7, f(alert ? 386 : MAXF)], [8, alert ? f(-12.4) : undefined], [9, alert ? f(1.08) : undefined], [10, f(heading)],
  ];
  const settings = [[1, [[1, 1], [2, 1]]], [2, [[1, 1], [2, 1]]], [3, [[1, 1], [2, 1]]], [4, alert ? [[1, 1]] : [[1, 1], [2, 1]]], [5, Buffer.alloc(0)],
    [7, [[1, 1], [2, 1]]], [8, [[1, 1]]], [9, [[1, 1]]], [10, [[1, 1], [2, 1]]], [11, [[1, 1], [2, 1]]], [12, 1], [13, 1], [14, 1], [15, 1], [16, [[1, 1], [2, 1]]], [17, 1], [18, [[1, 1], [2, 1]]]];
  const power = alert ? [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [7, 1], [8, 1], [9, 1]] : [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [7, 1]];
  const weapon = (id, p, r, g) => [4, [[1, `KLWE_LaserRepeater_S2_${id}`], [2, p], [3, r], [4, g]]];
  return enc([
    [3, [[2, [[1, 'RSI_Aurora_Mk2_949464407697'], [2, 'RSI_Aurora_Mk2'], [4, 1], [7, ann.map((v, i) => [i + 1, v])],
      [8, [[1, [[2, 1], [3, 1]]], [2, settings], [3, ins]]], [9, power]]]]],
    [4, [[1, [[2, 1], [3, 1], [8, 1]]],
      weapon('949464407782', 1, 1, 1), weapon('949464407774', 1, 1, 1), weapon('949464407755', 1, alert ? 0 : 1, 1), weapon('949464407727', alert ? 0 : 1, alert ? 0 : 1, alert ? 0 : 1),
      [5, [[1, 1], [2, alert ? 31 : 48]]], [5, [[1, 2], [2, alert ? 3 : 5]]]]],
    actor(t, true, alert),
  ]);
}

const server = http2.createServer();
server.on('stream', (stream, headers) => {
  console.log('petición', headers[':path']);
  stream.respond({ ':status': 200, 'content-type': 'application/grpc' }, { waitForTrailers: true });
  const t0 = Date.now();
  const timer = setInterval(() => {
    if (stream.destroyed) return clearInterval(timer);
    if (mode() === 'silent') return;
    const body = frame(Date.now() - t0);
    const head = Buffer.alloc(5);
    head.writeUInt32BE(body.length, 1);
    stream.write(Buffer.concat([head, body]));
  }, 55);
  stream.on('close', () => { clearInterval(timer); console.log('cerrado'); });
});
server.listen(PORT, '127.0.0.1', () => console.log('juego de mentira en', PORT));
