import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sizeNumber, stockLoadout } from '../src/game/catalog.ts';
import { LogParser } from '../src/parser/parser.ts';
import { applyEvent, emptyState } from '../src/state/reducer.ts';
import { foldShips, nameIndex } from '../src/store/hangar.ts';

const vehicles = [
  { className: 'ANVL_Lightning_F8C', name: 'F8C Lightning', gameName: 'Anvil F8C Lightning' },
  { className: 'KRIG_L21_Wolf', name: 'L-21 Wolf', gameName: 'Kruger L-21 Wolf' },
];

test('nombres de nave: visibles, en otro orden o con clave de traducción', () => {
  const r = nameIndex(vehicles);
  assert.equal(r('Anvil F8C Lightning')?.className, 'ANVL_Lightning_F8C');
  assert.equal(r('Anvil Lightning F8C')?.className, 'ANVL_Lightning_F8C');
  assert.equal(r('@vehicle_NameKRIG_L21_Wolf')?.className, 'KRIG_L21_Wolf');
  assert.equal(r('ANVL_Lightning_F8C')?.className, 'ANVL_Lightning_F8C');
  assert.equal(r('Nave inventada'), null);
});

test('hangar: subidas, saltos y pérdidas se juntan por clase', () => {
  const row = (type: string, data: Record<string, unknown>, s = 1) => ({ session_id: s, ts: `2026-11-1${s}T10:00:00.000Z`, type, data: JSON.stringify(data) });
  const ships = foldShips(
    [
      row('ship.boarded', { ship: 'Anvil F8C Lightning', own: true }),
      row('travel.qt_arrived', { ship: 'ANVL_Lightning_F8C', shipName: 'Anvil Lightning F8C' }, 2),
      row('combat.vehicle_destroyed', { cls: 'ANVL_Lightning_F8C', mine: true, destroyed: true }, 2),
      row('travel.qt_arrived', { ship: 'DRAK_Cutlass_PU_AI_CRIM' }),
    ],
    nameIndex(vehicles),
  );
  assert.equal(ships.length, 1);
  assert.deepEqual(
    { cls: ships[0]?.className, own: ships[0]?.own, b: ships[0]?.boarded, qt: ships[0]?.qtJumps, lost: ships[0]?.lost, sessions: ships[0]?.sessions },
    { cls: 'ANVL_Lightning_F8C', own: true, b: 1, qt: 1, lost: 1, sessions: 2 },
  );
});

test('equipo personal: casco y arma al aparecer, se guarda y desaparece', () => {
  const p = new LogParser({ playerName: 'Piloto', playerGeid: '100' });
  const lines = [
    '<2026-11-15T22:31:14.249Z> [Notice] <AttachmentReceived> Player[Piloto] Attachment[cds_armor_medium_helmet_01_01_20_200000000485, cds_armor_medium_helmet_01_01_20, 200000000485] Status[persistent] Port[Armor_Helmet] Elapsed[6.2] [Team_CoreGameplayFeatures][Inventory]',
    '<2026-11-15T22:31:15.000Z> [Notice] <AttachmentReceived> Player[Piloto] Attachment[behr_optics_tsco_x4_s2_1, behr_optics_tsco_x4_s2, 1] Status[persistent] Port[optics_attach] Elapsed[6.2] [Team_CoreGameplayFeatures][Inventory]',
    '<2026-11-15T22:31:16.000Z> [Notice] <EquipItem> Request[35] equip from Inventory[100:Location:3723364946] Class[hdgw_rifle_ballistic_01] Rank[x] Port[Body_ItemPort:Armor_Undersuit:Armor_Torso:wep_stocked_3] DependentRequest[34] PostAction[None] [Team_CoreGameplayFeatures][Inventory]',
    "<2026-11-15T23:01:35.230Z> [Notice] <StoreItem> Request[28] store 'hdgw_rifle_ballistic_01_935549249811' [935549249811] by 'Piloto' [100] To Inventory[INVALID] Class[hdgw_rifle_ballistic_01] Rank[x] ItemsCount[968] [Team_CoreGameplayFeatures][Inventory]",
    '<2026-11-17T21:25:21.125Z> [Notice] <VehicleListQuery> Fetching vehicle list for player 100 completed. Retrieved 25 entitlements out of 30 vehicules. [Team_GameServices][ASOP][Entitlement][Insurance]',
  ];
  const s = emptyState();
  const types: string[] = [];
  for (const l of lines) for (const e of p.feed(l)) (types.push(e.type), applyEvent(s, e));
  assert.deepEqual(types, ['gear.equipped', 'gear.equipped', 'gear.stored', 'ship.fleet']);
  assert.deepEqual(Object.keys(s.loadout), ['Armor_Helmet']);
  assert.deepEqual(s.fleet && { t: s.fleet.total, e: s.fleet.entitlements }, { t: 30, e: 25 });
});

test('componentes de serie desde los puertos de la wiki', () => {
  assert.equal(sizeNumber('M'), 2);
  assert.equal(sizeNumber(3), 3);
  const stock = stockLoadout([
    { name: 'hardpoint_shield', sizes: { max: 2 }, equipped_item: { name: 'Rampart', type: 'Shield', class_name: 'SHLD_X' } },
    { name: 'hardpoint_seat', equipped_item: { name: 'Seat', type: 'Seat' } },
  ]);
  assert.deepEqual(stock, [{ slot: 'hardpoint_shield', type: 'Shield', size: 2, name: 'Rampart', className: 'SHLD_X' }]);
});
