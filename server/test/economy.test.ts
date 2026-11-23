import assert from 'node:assert/strict';
import { test } from 'node:test';
import { purchaseKind, shopName, walletEstimate } from '../src/store/economy.ts';
import { setLang } from '../src/i18n.ts';

// Los textos esperados están en español, sea cual sea el idioma del PC que pasa las pruebas.
setLang('es');

test('nombres de tienda y tipos de compra', () => {
  assert.equal(shopName('SCShop_ConscientiousObjects_Levski-001'), 'Conscientious Objects · Levski');
  assert.equal(shopName('SCShop_S_Levski_NyxNax'), 'Levski · Nyx Nax');
  assert.equal(purchaseKind('crlf_consumable_healing_01'), 'Medicina');
  assert.equal(purchaseKind('hdgw_rifle_ballistic_01_mag'), 'Munición');
  assert.equal(purchaseKind('Drink_mug_star_kitten_1_a'), 'Comida y bebida');
  assert.equal(purchaseKind('klwe_lmg_energy_01'), 'Armas');
  assert.equal(purchaseKind('COOL_JUST_S02_Snowpack_SCItem'), 'Componentes de nave');
});

test('cartera: saldo indicado + recompensas − compras posteriores', () => {
  const base = { amount: 100_000, at: '2026-11-10T00:00:00Z' };
  const p = (ts: string, price: number) => ({ ts, item: 'x', quantity: 1, price, shop: 's', shopName: 's', kind: 'Otros' });
  const w = walletEstimate(base, [p('2026-11-09T00:00:00Z', 999), p('2026-11-11T00:00:00Z', 5_000)], [{ ts: '2026-11-12T00:00:00Z', amount: 20_000 }]);
  assert.deepEqual({ e: w.estimate, r: w.rewardsSince, s: w.spentSince }, { e: 115_000, r: 20_000, s: 5_000 });
  assert.equal(walletEstimate(null, [], []).estimate, null);
});
