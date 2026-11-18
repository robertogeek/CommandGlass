import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanTitle, parseContractsIni } from '../src/game/starstrings.ts';
import { classifyNotification, type RuleApi } from '../src/parser/rules.ts';

const INI = [
  'Intersec_DefendShip_Title_Medium_001=Operative Extraction <EM4>[150 Rep] [BP]*</EM4>',
  'Intersec_DefendShip_Desc_Medium_001=MISSION SPECS\\n\\nBriefing: ...\\n\\n<EM4>Reputation Awarded:</EM4> 150\\n\\n<EM4>Cooldown:</EM4> 5mins\\n\\n<EM4>Ships to Expect</EM4>\\nHostiles 1: 2x Medium Criminal Combat Ship, 1x Anvil Arrow\\nHostiles 2: 2x Very Easy Criminal Combat Ship\\n\\n\\n<EM4>Potential Blueprints</EM4>\\n<EM4>Awarded from Jr. Contractor level variants</EM4>\\n- Pulse "Rouge" Pistol\\n- Testudo Arms Combustion\\n\\n\\n<EM4>Debug Name(s):</EM4> InterSec_DefendShip_Nyx_Medium, InterSec_DefendShip_Nyx_Medium_B',
  'Otro_Title=Sin descripción',
].join('\n');

test('StarStrings: reputación, cooldown, oleadas, blueprints y debug names', () => {
  const [c] = parseContractsIni(INI);
  assert.ok(c);
  assert.deepEqual(c.debugNames, ['InterSec_DefendShip_Nyx_Medium', 'InterSec_DefendShip_Nyx_Medium_B']);
  assert.equal(c.title, 'Operative Extraction');
  assert.equal(c.reputationValue, 150);
  assert.equal(c.cooldown, '5mins');
  assert.equal(c.hostiles.length, 2);
  assert.deepEqual(c.blueprints, [{ rank: 'Jr. Contractor level variants', items: ['Pulse "Rouge" Pistol', 'Testudo Arms Combustion'] }]);
  assert.equal(c.hasBlueprints, true);
  assert.equal(cleanTitle('Operative Extraction <EM4>[150 Rep] [BP]*</EM4>'), 'Operative Extraction');
});

test('títulos de contrato limpios aunque haya un pack de la comunidad instalado', () => {
  const api: RuleApi = { ctx: { playerName: 'Piloto', playerGeid: '100' }, isMe: () => false, once: () => true, changed: () => true };
  const e = classifyNotification('Contract Accepted: Operative Extraction <EM4>[150 Rep] [BP]*</EM4>: ', 'abc-123', api);
  assert.equal(e.type, 'mission.accepted');
  assert.equal(e.data.title, 'Operative Extraction');
});
