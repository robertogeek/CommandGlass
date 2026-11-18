import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bestRoutes, terminalsAt, vehicleByName, type UexCommodity, type UexPrice, type UexTerminal, type UexVehicle } from '../src/game/uex.ts';

const term = (id: number, name: string, displayname: string, system: string, extra: Partial<UexTerminal> = {}): UexTerminal => ({
  id,
  name,
  displayname,
  nickname: displayname,
  star_system_name: system,
  planet_name: null,
  moon_name: null,
  space_station_name: null,
  city_name: null,
  outpost_name: null,
  is_available_live: 1,
  is_visible: 1,
  is_player_owned: 0,
  max_container_size: 32,
  ...extra,
});

const TERMINALS = [
  term(1, 'Admin - Baijini Point', 'Baijini Point', 'Stanton', { space_station_name: 'Baijini Point' }),
  term(2, 'TDD - Trade and Development Division - Area 18', 'Area18', 'Stanton', { city_name: 'Area 18' }),
  term(3, 'Admin - Seraphim', 'Seraphim', 'Stanton'),
  term(4, 'Admin - Pyro Gateway (Stanton)', 'Pyro Gateway', 'Stanton'),
  term(5, 'Admin - Pyro Gateway (Nyx)', 'Pyro Gateway', 'Nyx'),
  term(6, 'ArcCorp Mining Area 048', 'ArcCorp Mining Area 048', 'Stanton', { outpost_name: 'ArcCorp Mining Area 048' }),
  term(7, 'Levski', 'Levski', 'Nyx'),
  term(8, 'Cerrada', 'Cerrada', 'Stanton', { is_available_live: 0 }),
];

const COMMODITIES: UexCommodity[] = [
  { id: 10, name: 'Laranite', code: 'LARA', is_illegal: 0, is_raw: 0 },
  { id: 11, name: 'WiDoW', code: 'WIDO', is_illegal: 1, is_raw: 0 },
  { id: 12, name: 'Agricium', code: 'AGRI', is_illegal: 0, is_raw: 0 },
];

const price = (c: number, t: number, buy: number, sell: number, scuBuy = 0): UexPrice => ({
  id_commodity: c,
  id_terminal: t,
  price_buy: buy,
  price_sell: sell,
  scu_buy: scuBuy,
  scu_sell_stock: 0,
  scu_sell: 0,
  date_modified: 1_790_000_000,
  commodity_name: COMMODITIES.find((x) => x.id === c)!.name,
  terminal_name: TERMINALS.find((x) => x.id === t)!.name,
});

const PRICES = [
  price(10, 6, 2800, 0, 500), // Laranite: se compra en la mina…
  price(10, 2, 0, 3100), // …y se vende en Area18
  price(10, 1, 0, 3050),
  price(10, 7, 0, 9999), // en otro sistema: no cuenta
  price(11, 1, 4000, 0),
  price(11, 3, 0, 6000), // ilegal: solo si se pide
  price(12, 1, 2400, 0, 40),
  price(12, 2, 0, 2600),
  price(12, 8, 0, 9000), // terminal cerrada
];

test('UEX: terminales del sitio donde estás, con el sistema para las estaciones de salto', () => {
  assert.deepEqual(terminalsAt(TERMINALS, 'Baijini Point', 'Stanton').map((t) => t.id), [1]);
  assert.deepEqual(terminalsAt(TERMINALS, 'Area18', 'Stanton').map((t) => t.id), [2]);
  assert.deepEqual(terminalsAt(TERMINALS, 'Seraphim Station', 'Stanton').map((t) => t.id), [3]);
  assert.deepEqual(terminalsAt(TERMINALS, 'Pyro Gateway', 'Nyx').map((t) => t.id), [5]);
  assert.deepEqual(terminalsAt(TERMINALS, 'Arc Corp Mining Area 048', 'Stanton').map((t) => t.id), [6]);
  assert.deepEqual(terminalsAt(TERMINALS, 'Onyx Facility S3A9', 'Stanton'), []);
});

test('UEX: nave por el nombre del juego', () => {
  const vehicles: UexVehicle[] = [
    { id: 1, name: 'Cutlass Black', name_full: 'Drake Cutlass Black', scu: 46, company_name: 'Drake' },
    { id: 2, name: 'Cutlass', name_full: 'Drake Cutlass', scu: 0, company_name: 'Drake' },
    { id: 3, name: 'C2 Hercules', name_full: 'Crusader C2 Hercules', scu: 696, company_name: 'Crusader' },
  ];
  assert.equal(vehicleByName(vehicles, 'Drake Cutlass Black')?.scu, 46);
  assert.equal(vehicleByName(vehicles, 'Cutlass Black')?.scu, 46);
  assert.equal(vehicleByName(vehicles, 'Crusader C2 Hercules Starlifter')?.scu, 696);
  assert.equal(vehicleByName(vehicles, 'Aurora MR'), null);
});

test('UEX: rutas en el mismo sistema, limitadas por bodega, stock y cartera', () => {
  const routes = bestRoutes(PRICES, TERMINALS, COMMODITIES, { scu: 46, system: 'Stanton' });
  assert.equal(routes[0]!.commodity, 'Laranite');
  assert.equal(routes[0]!.to.id, 2);
  assert.equal(routes[0]!.scu, 46);
  assert.equal(routes[0]!.profit, 46 * 300);
  // Agricium: solo hay 40 SCU a la venta; la terminal cerrada no cuenta.
  const agri = routes.find((r) => r.commodity === 'Agricium')!;
  assert.equal(agri.scu, 40);
  assert.equal(agri.sell, 2600);
  assert.ok(!routes.some((r) => r.illegal));

  assert.ok(bestRoutes(PRICES, TERMINALS, COMMODITIES, { scu: 46, illegal: true }).some((r) => r.commodity === 'WiDoW'));
  // Con 28.000 aUEC solo te da para 10 SCU de Laranite.
  assert.equal(bestRoutes(PRICES, TERMINALS, COMMODITIES, { scu: 46, budget: 28_000 })[0]!.scu, 10);
  // Desde Baijini Point solo sale Agricium (o WiDoW si se piden ilegales).
  assert.deepEqual(bestRoutes(PRICES, TERMINALS, COMMODITIES, { scu: 46, from: [1] }).map((r) => r.commodity), ['Agricium']);
});
