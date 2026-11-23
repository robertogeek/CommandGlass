import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { HudTranslator, setHudTranslator } from '../src/parser/hudlang.ts';
import { LogParser } from '../src/parser/parser.ts';

// Trocitos reales de global.ini (inglés del juego y una traducción de la comunidad al español).
const en = {
  'mobiglas_ui_missionevent_activated': 'Contract Accepted:  %s',
  'hud_law_crimecommitted': 'Crime Committed: %ls',
  'hud_law_crimecommitted_victimname': 'Crime Committed: %ls\\nagainst %ls',
  'hud_law_enteredjurisdiction': 'Entered %ls Jurisdiction',
  'jurisdictions_name_009': 'Ungoverned',
  'hud_actorstatus_injurywarning_severity_deadlyinjury': 'Severe Injury Detected',
  'hud_actorstatus_injurywarning_hospitallevel_3': 'Tier 1 Treatment Required',
  'notification_member_joined_title': 'New Member Joined',
  'mobiglas_ui_notification_party_member_joined': '%S has joined the party.',
  'text_uec_reward_text': 'Awarded %i aUEC',
  'hud_generic_solo': '%s',
  'comms_local_player_joined_auto': 'You have joined %s.',
  'comms_local_player_left': 'You have left the %s.',
  'comms_suffix_ship_channel': "channel '%S'",
  'comms_invite_accepted': '%S has joined the %s.',
  'comms_member_left': '%S has left the %s.',
  'notification_member_left_title': 'Member Left',
};
const loc = {
  'mobiglas_ui_missionevent_activated': 'Contrato aceptado: %s',
  'hud_law_crimecommitted': 'Delito cometido: %ls',
  'hud_law_crimecommitted_victimname': 'Delito cometido: %ls\\ncontra %ls',
  'hud_law_enteredjurisdiction': 'Entras en la jurisdicción de %ls',
  'jurisdictions_name_009': 'Sin gobierno',
  'hud_actorstatus_injurywarning_severity_deadlyinjury': 'Lesiones graves detectadas',
  'hud_actorstatus_injurywarning_hospitallevel_3': 'Tratamiento de nivel 1 requerido',
  'notification_member_joined_title': 'Nuevo miembro',
  'mobiglas_ui_notification_party_member_joined': '%S se ha unido al escuadrón.',
  'text_uec_reward_text': 'Recompensa de %i aUEC',
  'hud_generic_solo': 'Aviso %s',
  'comms_local_player_joined_auto': 'Te has unido al %s.',
  'comms_local_player_left': 'Has abandonado el %s.',
  'comms_suffix_ship_channel': "canal '%S'",
  'comms_invite_accepted': '%S se ha unido a %s.',
  'comms_member_left': '%S ha dejado el %s.',
  'notification_member_left_title': 'Miembro ha salido',
};

const TS = '<2026-11-20T10:00:00.000Z>';
function notify(text: string, mission = '00000000-0000-0000-0000-000000000000') {
  const p = new LogParser({ playerName: 'Yo' });
  const raw = `${TS} [Notice] <SHUDEvent_OnNotification> Added notification "${text}" [1] to queue. New queue size: 1, MissionId: [${mission}], ObjectiveId: [] [Team_CoreGameplayFeatures][Missions][Comms]`;
  // En el Game.log cada salto de línea del aviso es una línea nueva con su hora.
  return raw.split('\n').flatMap((l, i) => p.feed(i ? `${TS} ${l}` : l));
}

afterEach(() => setHudTranslator(null));

test('idioma del juego: contrato aceptado en español', () => {
  setHudTranslator(new HudTranslator({ lang: 'spanish_(spain)', en, loc }));
  const [ev] = notify('Contrato aceptado: Entrega de carga <EM4>[150 Rep]</EM4>', '6c1a2b3c-0000-4000-8000-000000000001');
  assert.equal(ev?.type, 'mission.accepted');
  assert.equal(ev?.data.title, 'Entrega de carga');
  assert.equal(ev?.data.missionId, '6c1a2b3c-0000-4000-8000-000000000001');
});

test('idioma del juego: avisos de varias líneas, compuestos y con nombres traducidos', () => {
  setHudTranslator(new HudTranslator({ lang: 'spanish_(spain)', en, loc }));
  const [crime] = notify('Delito cometido: Agresión\ncontra Fulano');
  assert.equal(crime?.type, 'law.crime');
  assert.equal(crime?.data.crime, 'Agresión');
  assert.equal(crime?.data.against, 'Fulano');

  const [zone] = notify('Entras en la jurisdicción de Sin gobierno');
  assert.equal(zone?.type, 'zone.jurisdiction');
  assert.equal(zone?.data.lawless, true);

  const [hurt] = notify('Lesiones graves detectadas - Torso - Tratamiento de nivel 1 requerido');
  assert.equal(hurt?.type, 'health.injury');
  assert.equal(hurt?.data.tier, 1);
  assert.equal(hurt?.data.part, 'Torso');

  const [joined] = notify('Nuevo miembro\nAmiga se ha unido al escuadrón.');
  assert.equal(joined?.type, 'social.party_member_joined');
  assert.equal(joined?.data.name, 'Amiga');

  const [money] = notify('Recompensa de 12,500 aUEC');
  assert.equal(money?.type, 'economy.reward');
  assert.equal(money?.data.amount, 12500);
});

test('idioma del juego: subir y bajar de la nave (el canal va dentro de otro texto)', () => {
  setHudTranslator(new HudTranslator({ lang: 'spanish_(spain)', en, loc }));
  // Tal cual sale en el Game.log de un tester con el juego en español (antes se quedaba «a pie»).
  const [board] = notify("Te has unido al canal 'Crusader Ares Star Fighter Inferno : Yo'.\n: ");
  assert.equal(board?.type, 'ship.boarded');
  assert.equal(board?.data.ship, 'Crusader Ares Star Fighter Inferno');
  assert.equal(board?.data.own, true);

  const [left] = notify("Has abandonado el canal 'Crusader Ares Star Fighter Inferno : Yo'.");
  assert.equal(left?.type, 'ship.left');
  assert.equal(left?.data.ship, 'Crusader Ares Star Fighter Inferno');

  // Otros jugadores que suben y bajan de tu nave (packs de zalaca y 0zzyt0).
  const [crew] = notify("Nuevo miembro\nAmiga se ha unido a canal 'Crusader Ares Star Fighter Inferno : Yo'.");
  assert.equal(crew?.type, 'social.crew_joined');
  assert.equal(crew?.data.name, 'Amiga');
  assert.equal(crew?.data.ship, 'Crusader Ares Star Fighter Inferno');

  const [gone] = notify("Miembro ha salido\nAmiga ha dejado el canal 'Crusader Ares Star Fighter Inferno : Yo'.");
  assert.equal(gone?.type, 'social.crew_left');
  assert.equal(gone?.data.name, 'Amiga');
});

test('idioma del juego: lo que no tiene regla se guarda tal cual se vio, y el inglés sigue igual', () => {
  setHudTranslator(new HudTranslator({ lang: 'spanish_(spain)', en, loc }));
  const [other] = notify('Aviso de prueba');
  assert.equal(other?.type, 'notification');
  assert.equal(other?.summary, 'Aviso de prueba');

  const [english] = notify('Contract Accepted: Cargo Run');
  assert.equal(english?.type, 'mission.accepted');
  assert.equal(english?.data.title, 'Cargo Run');
});

test('sin traductor (juego en inglés) no cambia nada', () => {
  const [ev] = notify('Contrato aceptado: Entrega de carga');
  assert.equal(ev?.type, 'notification');
});
