import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foldPlaces, placeInfo } from '../src/store/places.ts';

test('lugares: se completan sistema y planeta cuando faltan', () => {
  assert.deepEqual(placeInfo('RR_JP_StantonPyro', null, null), { system: 'Stanton', body: null, planet: null });
  assert.deepEqual(placeInfo('Nyx_Levski', 'Nyx', null), { system: 'Nyx', body: 'Delamar', planet: 'Delamar' });
  assert.deepEqual(placeInfo('Stanton3a_Shubin_SAL2', 'Stanton', 'Lyria'), { system: 'Stanton', body: 'Lyria', planet: 'ArcCorp' });
  assert.deepEqual(placeInfo('GrimHEX', null, null), { system: 'Stanton', body: 'Yela', planet: 'Crusader' });
});

test('lugares: visitas agrupadas por sitio', () => {
  const r = (ts: string, code: string) => ({ session_id: 1, ts, data: JSON.stringify({ code, name: code, system: 'Stanton', body: 'ArcCorp' }) });
  const p = foldPlaces([r('2026-01-01T00:00:00Z', 'Stanton3_Area18'), r('2026-01-02T00:00:00Z', 'Stanton3_Area18'), r('2026-01-03T00:00:00Z', 'RR_ARC_LEO')]);
  assert.equal(p[0]?.code, 'Stanton3_Area18');
  assert.equal(p[0]?.visits, 2);
  assert.equal(p[0]?.last, '2026-01-02T00:00:00Z');
});
