import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateRawSync } from 'node:zlib';
import { redact } from '../src/log.ts';
import { crc32, makeZip } from '../src/zip.ts';

test('zip: cabeceras, CRC y contenido recuperable', () => {
  assert.equal(crc32(Buffer.from('hello')), 0x3610a686);
  const zip = makeZip([{ name: 'informe.txt', data: 'hola ñandú' }, { name: 'b.log', data: Buffer.from('x'.repeat(5000)) }]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  // Fin del directorio central: 2 ficheros.
  const end = zip.length - 22;
  assert.equal(zip.readUInt32LE(end), 0x06054b50);
  assert.equal(zip.readUInt16LE(end + 10), 2);
  // El primer fichero se descomprime igual que entró.
  const nameLen = zip.readUInt16LE(26);
  const compLen = zip.readUInt32LE(18);
  assert.equal(zip.subarray(30, 30 + nameLen).toString(), 'informe.txt');
  assert.equal(inflateRawSync(zip.subarray(30 + nameLen, 30 + nameLen + compLen)).toString(), 'hola ñandú');
});

test('registro: ni la clave de emparejamiento ni tokens', () => {
  assert.equal(redact('GET /?k=abc123&x=1'), 'GET /?k=***&x=1');
  assert.equal(redact('Authorization: Bearer eyJhbGciOi.xyz'), 'Authorization: Bearer ***');
  assert.equal(redact('Llegas a Levski'), 'Llegas a Levski');
});
