import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Store } from '../src/store/db.ts';
import { getSetting, setSetting } from '../src/store/economy.ts';
import { readUexToken, saveUexToken } from '../src/store/uexToken.ts';

test('token de UEX: uno para toda la app (LIVE y PTU), aunque estuviera solo en un historial', () => {
  const shared = mkdtempSync(join(tmpdir(), 'cg-uex-'));
  const live = new Store(join(shared, 'live.db'));
  const ptu = new Store(join(shared, 'ptu.db'));
  try {
    // Antes de la 0.1.6 el token estaba solo en el historial de LIVE: PTU no lo tenía.
    setSetting(live, 'uexToken', 'TOKENLIVE1234567890abcdef');
    assert.equal(readUexToken(ptu, shared), null);
    // Al leerlo desde LIVE pasa a la carpeta común, y PTU ya lo ve.
    assert.equal(readUexToken(live, shared), 'TOKENLIVE1234567890abcdef');
    assert.equal(readUexToken(ptu, shared), 'TOKENLIVE1234567890abcdef');
    // Cambiarlo desde PTU lo cambia para todos.
    saveUexToken(ptu, shared, 'TOKENNUEVO1234567890abcdef');
    assert.equal(readUexToken(live, shared), 'TOKENNUEVO1234567890abcdef');
    assert.equal(getSetting(ptu, 'uexToken'), 'TOKENNUEVO1234567890abcdef');
  } finally {
    live.db.close();
    ptu.db.close();
    rmSync(shared, { recursive: true, force: true });
  }
});
