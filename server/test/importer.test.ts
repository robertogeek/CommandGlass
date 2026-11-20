import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, openSync, rmSync, writeSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { importBackups } from '../src/ingest/importer.ts';
import { Store } from '../src/store/db.ts';

const contract = (i: number) =>
  `<2026-11-20T10:00:00.000Z> [Notice] <SHUDEvent_OnNotification> Added notification "Contract Accepted:  Carga ${i}: " [${i}] to queue. New queue size: 1, MissionId: [6c1a2b3c-0000-4000-8000-${String(i).padStart(12, '0')}], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]\n`;

test('historial: un log archivado de varias decenas de MB se lee entero, a trozos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cg-import-'));
  const store = new Store(join(dir, 'test.db'));
  try {
    const backups = join(dir, 'logbackups');
    mkdirSync(backups);
    const fd = openSync(join(backups, 'Game Build(10000001) 20 Nov 26 (10 00 00).log'), 'w');
    // ~40 MB de líneas sin interés con contratos repartidos entre muchos trozos de lectura.
    const filler = `<2026-11-20T10:00:00.000Z> [Notice] <Ruido> ${'x'.repeat(200)}\n`;
    const block = filler.repeat(Math.floor((4 * 1024 * 1024) / filler.length));
    let n = 0;
    for (let i = 0; i < 10; i++) {
      writeSync(fd, block);
      writeSync(fd, contract(++n));
    }
    // Una «línea» de 17 MB sin saltos (fichero dañado) se descarta sin atascar la lectura.
    writeSync(fd, 'z'.repeat(17 * 1024 * 1024));
    writeSync(fd, '\n');
    writeSync(fd, contract(++n));
    writeSync(fd, 'línea a medio escribir');
    closeSync(fd);

    const r = importBackups(store, backups);
    assert.equal(r.files, 1);
    assert.equal(r.events, n);
    // La línea a medio escribir queda para la siguiente pasada: volver a importar no repite nada.
    assert.equal(importBackups(store, backups).events, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
