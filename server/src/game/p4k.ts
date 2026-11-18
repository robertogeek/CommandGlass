import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { inflateRawSync, zstdDecompressSync } from 'node:zlib';

/**
 * Lectura de ficheros sueltos dentro de Data.p4k (un ZIP64 de más de 100 GB).
 * Solo lectura: abre el archivo en modo 'r' y nunca escribe en la carpeta del juego.
 * El índice (central directory) se recorre por bloques para no cargar cientos de MB en memoria.
 */

interface Entry {
  method: number;
  csize: number;
  usize: number;
  offset: number;
}

const CHUNK = 16 * 1024 * 1024;

/** Extrae los ficheros pedidos (rutas con / o \, sin distinguir mayúsculas). Devuelve los que encuentre. */
export function extractFromP4k(p4kPath: string, wanted: string[]): Map<string, Buffer> {
  const norm = (s: string) => s.replace(/\\/g, '/').toLowerCase();
  const want = new Map(wanted.map((w) => [norm(w), w]));
  const fd = openSync(p4kPath, 'r');
  try {
    const size = fstatSync(fd).size;
    const read = (pos: number, len: number) => {
      const b = Buffer.alloc(len);
      const n = readSync(fd, b, 0, len, pos);
      return n === len ? b : b.subarray(0, n);
    };

    const tailLen = Math.min(size, 1 << 20);
    const tail = read(size - tailLen, tailLen);
    const loc = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
    if (loc < 0) throw new Error('Data.p4k: no se encuentra el índice ZIP64');
    const eocd = read(Number(tail.readBigUInt64LE(loc + 8)), 56);
    if (eocd.readUInt32LE(0) !== 0x06064b50) throw new Error('Data.p4k: índice ZIP64 no válido');
    const total = Number(eocd.readBigUInt64LE(32));
    const cdSize = Number(eocd.readBigUInt64LE(40));
    const cdOff = Number(eocd.readBigUInt64LE(48));

    const found = new Map<string, Entry>();
    let pos = cdOff;
    let buf = Buffer.alloc(0);
    let p = 0;
    for (let i = 0; i < total && found.size < want.size; i++) {
      // Asegura que la cabecera completa está en el búfer.
      if (buf.length - p < 46 || buf.length - p < 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)) {
        const remaining = cdOff + cdSize - pos;
        if (remaining <= 0 && buf.length - p < 46) break;
        const next = read(pos, Math.min(CHUNK, remaining));
        pos += next.length;
        buf = Buffer.concat([buf.subarray(p), next]);
        p = 0;
        if (buf.length < 46) break;
      }
      if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Data.p4k: entrada del índice no válida');
      const method = buf.readUInt16LE(p + 10);
      let csize = buf.readUInt32LE(p + 20);
      let usize = buf.readUInt32LE(p + 24);
      const fnLen = buf.readUInt16LE(p + 28);
      const exLen = buf.readUInt16LE(p + 30);
      const cmLen = buf.readUInt16LE(p + 32);
      let offset = buf.readUInt32LE(p + 42);
      const name = norm(buf.toString('utf8', p + 46, p + 46 + fnLen));
      if (want.has(name)) {
        const extra = buf.subarray(p + 46 + fnLen, p + 46 + fnLen + exLen);
        for (let q = 0; q + 4 <= extra.length; ) {
          const id = extra.readUInt16LE(q);
          const sz = extra.readUInt16LE(q + 2);
          if (id === 0x0001) {
            let r = q + 4;
            if (usize === 0xffffffff) (usize = Number(extra.readBigUInt64LE(r))), (r += 8);
            if (csize === 0xffffffff) (csize = Number(extra.readBigUInt64LE(r))), (r += 8);
            if (offset === 0xffffffff) offset = Number(extra.readBigUInt64LE(r));
          }
          q += 4 + sz;
        }
        found.set(name, { method, csize, usize, offset });
      }
      p += 46 + fnLen + exLen + cmLen;
    }

    const out = new Map<string, Buffer>();
    for (const [name, e] of found) {
      const lh = read(e.offset, 30);
      if (lh.readUInt32LE(0) !== 0x04034b50) continue;
      const raw = read(e.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28), e.csize);
      let data: Buffer;
      if (e.method === 0) data = raw;
      else if (e.method === 100) data = zstdDecompressSync(raw);
      else if (e.method === 8) data = inflateRawSync(raw);
      else continue; // método desconocido (o cifrado): se ignora
      out.set(want.get(name)!, data);
    }
    return out;
  } finally {
    closeSync(fd);
  }
}
