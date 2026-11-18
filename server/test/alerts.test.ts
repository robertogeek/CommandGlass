import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alertsFor } from '../src/alerts.ts';
import type { GameEvent } from '../src/parser/types.ts';

const ev = (type: string, data: Record<string, unknown> = {}, extra: Partial<GameEvent> = {}): GameEvent & { id: number } => ({
  id: Math.floor(Math.random() * 1e6),
  ts: '2026-11-18T20:00:00.000Z',
  type,
  category: 'system',
  importance: 1,
  summary: type,
  data,
  ...extra,
});

test('alertas: espacio sin ley, nave perdida, blueprint y hostil marcado', () => {
  const a = alertsFor(
    [
      ev('zone.jurisdiction', { lawless: true }),
      ev('zone.jurisdiction', { lawless: false }),
      ev('combat.vehicle_destroyed', { mine: true, destroyed: true }),
      ev('blueprint.received', { name: 'Testudo Arms Nightveil' }),
      ev('social.nearby', {}, { mentions: [{ name: 'Malote', role: 'nearby' }] }),
      ev('social.nearby', {}, { mentions: [{ name: 'Amigo', role: 'nearby' }] }),
    ],
    { hostiles: new Set(['malote']) },
  );
  assert.deepEqual(a.map((x) => x.kind), ['lawless', 'ship-lost', 'blueprint', 'hostile-Malote']);
  assert.equal(a[3]?.level, 'danger');
  assert.equal(a[2]?.body, 'Testudo Arms Nightveil');
});
