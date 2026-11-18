import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backupKeyFromFilename, backupKeyFromHeader, splitLine } from '../src/parser/line.ts';
import { locationInfo, setGameNames, shipName } from '../src/parser/names.ts';
import { LogParser } from '../src/parser/parser.ts';
import { applyEvent, emptyState } from '../src/state/reducer.ts';

// Líneas reales del Game.log (con nombres de otros jugadores sustituidos).
const ME = { playerName: 'Piloto', playerGeid: '100' };

function parseAll(lines: string[], ctx = ME) {
  const p = new LogParser(ctx);
  return lines.flatMap((l) => p.feed(l));
}

test('trocea la línea con etiquetas anidadas', () => {
  const l = splitLine('<2026-11-17T21:20:56.301Z> [Notice] <Foo::<lambda_1>> cuerpo [Team_X]');
  assert.equal(l?.tag, 'Foo::<lambda_1>');
  assert.equal(l?.body, 'cuerpo [Team_X]');
});

test('la clave de sesión de la cabecera coincide con el nombre del backup', () => {
  const header = '<2026-11-17T21:20:42.789Z> BackupNameAttachment=" Build(13165946) 17 Nov 26 (22 20 36)"  -- used by backup system';
  assert.equal(backupKeyFromHeader(header), backupKeyFromFilename('Game Build(13165946) 17 Nov 26 (22 20 36).log'));
});

test('login identifica al jugador', () => {
  const p = new LogParser();
  p.feed('<2026-11-17T21:20:56.301Z> [Notice] <AccountLoginCharacterStatus_Character> Character: createdAt 1 - updatedAt 2 - geid 100 - accountId 9 - name Piloto - state STATE_CURRENT [Team_GameServices][Login]');
  assert.equal(p.ctx.playerName, 'Piloto');
  assert.equal(p.ctx.playerGeid, '100');
});

test('Vehicle Destroyed (2026): nave ajena destruida por colisión', () => {
  const [e] = parseAll([
    "<2026-11-17T22:23:35.270Z> [Notice] <Vehicle Destroyed> Vehicle 'RSI_Constellation_Mk5_Centaurus_939541665579' [939541665579] class 'RSI_Constellation_Mk5_Centaurus' (owner player [200], driver [0]) destroyed: reason [Collision] level [0] -> [2] flags [4066] killer 'Otro' [200] authority [0] [Team_CGP4][Vehicle]",
  ]);
  assert.equal(e?.type, 'combat.vehicle_destroyed');
  assert.equal(e?.data.mine, false);
  assert.equal(e?.data.destroyed, true);
  assert.equal(e?.summary, 'RSI Constellation Mk5 Centaurus destruida por Otro · colisión');
});

test('Vehicle Destroyed (2026): destruyes una nave de IA', () => {
  const [e] = parseAll([
    "<2026-11-15T23:15:19.436Z> [Notice] <Vehicle Destroyed> Vehicle 'MISC_Reliant_PU_AI_CRIM_935549459531' [935549459531] class 'MISC_Reliant_PU_AI_CRIM' (owner player [0], driver [0]) destroyed: reason [Combat] level [0] -> [2] flags [4066] killer 'Piloto' [100] authority [0] [Team_CGP4][Vehicle]",
  ]);
  assert.equal(e?.data.byMe, true);
  assert.equal(e?.importance, 2);
  assert.equal(e?.summary, 'Has destruido MISC Reliant (IA criminal)');
});

test('Actor Death (2025): kill con arma de nave', () => {
  const [e] = parseAll([
    "<2025-11-10T19:31:27.694Z> [Notice] <Actor Death> CActor::Kill: 'PU_Pilots-Human-Criminal-Pilot_Light_7412253159344' [7412253159344] in zone 'DRAK_Herald_PU_AI_CRIM_7412253159247' killed by 'Piloto' [100] using 'KLWE_LaserRepeater_S3_7376205070526' [Class unknown] with damage type 'VehicleDestruction' from direction x: 0.000000, y: 0.000000, z: 0.000000 [Team_ActorTech][Actor]",
  ]);
  assert.equal(e?.type, 'combat.actor_death');
  assert.equal(e?.data.killerIsMe, true);
  assert.equal(e?.data.victimNpc, true);
});

test('notificación en varias líneas: unirse a un canal de nave', () => {
  const evs = parseAll([
    "<2026-11-17T22:21:47.088Z> [Notice] <SHUDEvent_OnNotification> Added notification \"You have joined channel 'Crusader Ares Star Fighter Inferno : Piloto'.",
    '<2026-11-17T22:21:47.088Z> : " [9] to queue. New queue size: 1, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]',
    "<2026-11-17T22:21:47.088Z>    \"You have joined channel 'Crusader Ares Star Fighter Inferno : Piloto'.",
    '<2026-11-17T22:21:47.088Z> : " [9]',
  ]);
  assert.equal(evs.length, 1);
  assert.equal(evs[0]?.type, 'ship.boarded');
  assert.equal(evs[0]?.data.own, true);
});

test('contrato aceptado y completado actualizan el estado', () => {
  const id = '35ed8bd5-7ea2-486f-99d6-d7ef4c9647f7';
  const evs = parseAll([
    `<2026-11-17T22:30:00.000Z> [Notice] <SHUDEvent_OnNotification> Added notification "Contract Accepted:  Retake Boarded Vessel: " [20] to queue. New queue size: 1, MissionId: [${id}], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]`,
    `<2026-11-17T22:31:00.000Z> [Notice] <SHUDEvent_OnNotification> Added notification "New Objective: Board Drake Caterpillar: " [21] to queue. New queue size: 1, MissionId: [${id}], ObjectiveId: [x] [Team_CoreGameplayFeatures][Missions][Comms]`,
  ]);
  const s = emptyState();
  for (const e of evs) applyEvent(s, e);
  assert.equal(s.missions.length, 1);
  assert.equal(s.missions[0]?.objective, 'Board Drake Caterpillar');

  const done = parseAll([
    `<2026-11-17T22:43:02.581Z> [Notice] <SHUDEvent_OnNotification> Added notification "Contract Complete: Retake Boarded Vessel: " [24] to queue. New queue size: 1, MissionId: [${id}], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]`,
  ]);
  for (const e of done) applyEvent(s, e);
  assert.equal(s.missions.length, 0);
  assert.equal(s.stats.missionsCompleted, 1);
});

test('jurisdicción sin ley y ubicación', () => {
  const evs = parseAll([
    '<2026-11-17T22:20:00.000Z> [Notice] <SHUDEvent_OnNotification> Added notification "Entered Ungoverned Jurisdiction: " [3] to queue. New queue size: 1, MissionId: [00000000-0000-0000-0000-000000000000], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]',
    '<2026-11-17T22:18:15.053Z> [Notice] <RequestLocationInventory> Player[Piloto] requested inventory for Location[Nyx_Levski] [Team_CoreGameplayFeatures][Inventory]',
    '<2026-11-17T22:18:16.053Z> [Notice] <RequestLocationInventory> Player[Piloto] requested inventory for Location[Nyx_Levski] [Team_CoreGameplayFeatures][Inventory]',
  ]);
  assert.deepEqual(evs.map((e) => e.type), ['zone.jurisdiction', 'travel.location']);
  assert.equal(evs[0]?.data.lawless, true);
  assert.equal(evs[1]?.summary, 'Llegas a Levski (Nyx)');
});

test('nombres legibles', () => {
  assert.equal(shipName('AEGS_Vanguard_Hoplite_PU_AI_CRIM_935549459576'), 'Aegis Vanguard Hoplite (IA criminal)');
  assert.equal(locationInfo('Stanton2_Orison').name, 'Orison');
  // Sin la traducción del juego cargada: respaldo sin traducir.
  assert.equal(locationInfo('RR_JP_NyxPyro').name, 'Pyro Gateway');
});

test('nombres oficiales del juego para los sitios (sin traducir)', () => {
  setGameNames(
    new Map([
      ['stanton3_transfer', 'Baijini Point'],
      ['stanton2_transfer_seraphim', 'Seraphim Station'],
      ['stanton1_l2', 'HUR L2'],
      ['nyx_pyro_jpstation', 'Pyro Gateway'],
      ['stanton3a_asd_delving_facility_009', 'Onyx Facility S3A9'],
      ['rr_p3', 'Orbituary'],
      ['pyro3', 'Bloom'],
    ]),
  );
  try {
    assert.equal(locationInfo('RR_ARC_LEO').name, 'Baijini Point');
    assert.equal(locationInfo('RR_CRU_LEO').name, 'Seraphim Station');
    assert.equal(locationInfo('RR_HUR_L2').name, 'HUR L2');
    assert.equal(locationInfo('RR_JP_NyxPyro').name, 'Pyro Gateway');
    assert.equal(locationInfo('Stanton3a_ASD_Delve_Facility_009').name, 'Onyx Facility S3A9');
    assert.equal(locationInfo('RR_ARC_LEO').body, 'ArcCorp');
    assert.deepEqual(locationInfo('RR_P3_LEO'), { name: 'Orbituary', system: 'Pyro', body: 'Bloom' });
    assert.equal(locationInfo('Stanton1b_HurdynMining_HDMSNorgaard').name, 'HDMS-Norgaard');
  } finally {
    setGameNames(null);
  }
});
