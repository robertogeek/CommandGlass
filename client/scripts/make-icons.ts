/**
 * Genera los iconos PNG de la app (pantalla de inicio del iPad) sin dependencias:
 * un radar holográfico sobre fondo oscuro.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(OUT, { recursive: true });

const BG = [7, 18, 22];
const FG = [111, 227, 240];

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function icon(size: number): Buffer {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const c = size / 2;
  const sweep = -Math.PI / 4;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5 - c) / c;
      const dy = (y + 0.5 - c) / c;
      const r = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      let a = 0;
      const ring = (radius: number, w: number) => Math.max(0, 1 - Math.abs(r - radius) / w);
      a = Math.max(a, ring(0.62, 0.035));
      a = Math.max(a, ring(0.42, 0.02) * 0.55);
      a = Math.max(a, ring(0.22, 0.02) * 0.4);
      if (r < 0.07) a = 1;
      // Barrido del radar
      let da = ang - sweep;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      if (r < 0.62 && da < 0 && da > -1.1) a = Math.max(a, 0.35 * (1 + da / 1.1));
      // Contactos
      for (const [px, py] of [[0.3, -0.35], [-0.38, 0.2], [0.12, 0.45]] as const) {
        if (Math.hypot(dx - px, dy - py) < 0.045) a = 1;
      }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(BG[k]! + (FG[k]! - BG[k]!) * Math.min(1, a));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]] as const) {
  writeFileSync(join(OUT, name), icon(size));
}
console.log('Iconos generados en client/public');
