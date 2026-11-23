import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actorName, isEntityName } from '../src/parser/names.ts';
import { replayPresence } from '../src/store/contacts.ts';
import { setLang } from '../src/i18n.ts';

// Los textos esperados están en español, sea cual sea el idioma del PC que pasa las pruebas.
setLang('es');

test('los peligros del entorno no cuentan como jugadores', () => {
  for (const n of ['Hazard-001', 'Hazard_Toggleable-Howitzer', 'PlanetKillVolume', 'StreamingSOC_asd_shuttle_a']) {
    assert.equal(isEntityName(n), true, n);
  }
  for (const n of ['Dash-Hyphen', 'Lieutenant_Long_Lips', 'HazardPilot']) assert.equal(isEntityName(n), false, n);
  assert.equal(actorName('Hazard_Toggleable_Effects_Physical'), 'un peligro del entorno');
});

test('grupo: entra, se desconecta, vuelve y se va', () => {
  const p = replayPresence([
    { type: 'social.party_member_joined', name: 'Piloto', online: null },
    { type: 'social.party_member_joined', name: 'Artillero', online: null },
    { type: 'social.party_presence', name: 'Piloto', online: 0 },
    { type: 'social.party_member_left', name: 'Artillero', online: null },
  ]);
  assert.deepEqual(p.get('piloto'), { inParty: true, online: false, aboard: false });
  assert.equal(p.has('artillero'), false);
});

test('grupo disuelto: nadie queda en el grupo', () => {
  const p = replayPresence([
    { type: 'social.party_member_joined', name: 'Piloto', online: null },
    { type: 'social.party_disbanded', name: null, online: null },
  ]);
  assert.equal(p.size, 0);
});

test('tripulación: se borra al cambiar de nave', () => {
  const p = replayPresence([
    { type: 'social.crew_joined', name: 'Piloto', online: null },
    { type: 'social.crew_joined', name: 'Artillero', online: null },
    { type: 'social.crew_left', name: 'Artillero', online: null },
  ]);
  assert.deepEqual(p.get('piloto'), { inParty: false, online: false, aboard: true });
  assert.equal(p.has('artillero'), false);

  const after = replayPresence([
    { type: 'social.crew_joined', name: 'Piloto', online: null },
    { type: 'ship.left', name: null, online: null },
  ]);
  assert.equal(after.size, 0);
});
