import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchIntel, slimMission } from '../src/game/wiki.ts';
import { briefingFor, foldMissions, kindStats, missionKind } from '../src/store/missions.ts';

test('datos de la wiki: por nombre de contrato y, si no, por título', () => {
  const list = [
    slimMission({ debug_name: 'InterSec_DefendShip_Nyx_Medium', title: 'Operative Extraction', faction: { name: 'InterSec Defense Solutions' }, reputation_gained: [{ faction: 'InterSec Defense Solutions', amount: 150, scope: 'FactionReputation' }], star_systems: ['Nyx'], min_standing_name: 'Jr. Contractor' }),
    slimMission({ debug_name: 'Foo_Haul_A', title: 'Repetido', faction: { name: 'Foo' } }),
    slimMission({ debug_name: 'Bar_Haul_B', title: 'Repetido', faction: { name: 'Bar' } }),
  ];
  assert.equal(matchIntel(list, 'intersec_defendship_nyx_medium', null)?.rankRequired, 'Jr. Contractor');
  assert.equal(matchIntel(list, 'Desconocido', 'Operative Extraction')?.faction, 'InterSec Defense Solutions');
  assert.equal(matchIntel(list, 'Bar_Otro_C', 'Repetido')?.faction, 'Bar');
  assert.equal(matchIntel(list, null, 'Nada'), null);
  assert.deepEqual(list[0]?.reputation, [{ faction: 'InterSec Defense Solutions', amount: 150, scope: 'FactionReputation' }]);
});

const row = (type: string, data: Record<string, unknown>, ts = '2026-11-14T16:30:00.000Z') => ({ session_id: 1, ts, type, data: JSON.stringify(data) });

test('tipo de contrato a partir de contrato, generador y título', () => {
  assert.equal(missionKind('InterSec_Bounty_Nyx_Easy', 'InterSec_KillShip', 'Wanted: X'), 'caza');
  assert.equal(missionKind('InterSec_DefendShip_Nyx_Medium', 'InterSec_DefendShip', 'Operative Extraction'), 'mercenario');
  assert.equal(missionKind('GoblinG_HaulCargo_L_Stanton1', 'GoblinG_Generator', null), 'transporte');
  assert.equal(missionKind('RedWind_Stanton_Easy_RecoverCargo_1', 'RedWind_RecoverCargo', null), 'recuperacion');
  assert.equal(missionKind(null, null, 'Algo raro'), 'otros');
});

test('un contrato se sigue por su missionId de principio a fin', () => {
  const id = 'abc';
  const [m] = foldMissions([
    row('mission.info', { missionId: id, generator: 'InterSec_DefendShip', contract: 'InterSec_DefendShip_Nyx_Medium' }),
    row('mission.accepted', { missionId: id, title: 'Operative Extraction' }),
    row('mission.objective', { missionId: id, objective: 'Go to Glaciem Ring Cluster' }, '2026-11-14T16:39:00.000Z'),
    row('mission.objective_done', { missionId: id, objective: 'Go to Glaciem Ring Cluster' }, '2026-11-14T16:42:00.000Z'),
    row('mission.objective', { missionId: id, objective: 'Protect the Ship' }, '2026-11-14T16:42:30.000Z'),
    row('mission.ended', { missionId: id, completion: 'Complete' }, '2026-11-14T16:44:56.000Z'),
    row('mission.completed', { missionId: id, title: 'Operative Extraction' }, '2026-11-14T16:44:56.000Z'),
    // Marcador de otra misión que nunca se aceptó: no cuenta.
    row('mission.info', { missionId: 'otra', generator: 'X', contract: 'Y' }),
  ]);
  assert.ok(m);
  assert.equal(m.kind, 'mercenario');
  assert.equal(m.outcome, 'completed');
  assert.deepEqual(m.objectives.map((o) => `${o.text}:${o.state}`), ['Go to Glaciem Ring Cluster:done', 'Protect the Ship:done']);

  const stats = kindStats([m]);
  assert.equal(stats[0]?.completed, 1);
  assert.equal(stats[0]?.medianMinutes, 15);
});

test('briefing: pasos de la última vez que hiciste el mismo contrato', () => {
  const done = foldMissions([
    row('mission.info', { missionId: 'a', contract: 'C1', generator: 'G' }),
    row('mission.accepted', { missionId: 'a', title: 'T' }),
    row('mission.objective', { missionId: 'a', objective: 'Paso 1' }),
    row('mission.objective', { missionId: 'a', objective: 'Paso 2' }),
    row('mission.completed', { missionId: 'a', title: 'T' }),
    row('mission.info', { missionId: 'b', contract: 'C1', generator: 'G' }),
    row('mission.accepted', { missionId: 'b', title: 'T' }, '2026-11-15T10:00:00.000Z'),
  ]);
  const current = done.find((m) => m.id === 'b')!;
  const b = briefingFor(current, done);
  assert.deepEqual(b.previous?.steps, ['Paso 1', 'Paso 2']);
  assert.equal(b.record.completed, 1);
  assert.equal(current.outcome, 'open');
});
