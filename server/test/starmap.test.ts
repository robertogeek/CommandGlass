import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduceStarmap } from '../src/game/starmap.ts';
import { jumpGate, locationInfo } from '../src/parser/names.ts';
import { jumpVisits, placeLocator, type Place } from '../src/store/places.ts';

// Muestra mínima con la forma de scunpacked-data (starmap_positions.json + starmap.json), en metros.
const STAR = 'star-nyx';
const positions = {
  entities: [
    { uuid: STAR, name: 'Nyx', type: 'Star', system: 'nyx', parent_uuid: null, hidden: false, x: 0, y: 0 },
    { uuid: 'p1', name: 'Nyx I', type: 'Planet', system: 'nyx', parent_uuid: STAR, hidden: false, x: 7.5e9, y: 0 },
    { uuid: 'lev', name: 'Levski', type: 'Manmade', system: 'nyx', parent_uuid: STAR, hidden: false, x: 0, y: 15e9 },
    { uuid: 'gw', name: 'Stanton Gateway', type: 'Manmade', system: 'nyx', parent_uuid: STAR, hidden: false, x: -27e9, y: 0 },
    { uuid: 'clinic', name: 'Stanton Gateway Clinic', type: 'Outpost', system: 'nyx', parent_uuid: STAR, hidden: true, x: -27e9, y: 0 },
    { uuid: 'mor', name: 'Moraine Base', type: 'Asteroid_ValidQT', system: 'nyx', parent_uuid: STAR, hidden: true, x: 48e9, y: 0 },
    { uuid: 'k1', name: 'Keeger Belt Cluster', type: 'Asteroid', system: 'nyx', parent_uuid: STAR, hidden: true, x: 47.9e9, y: 0 },
    { uuid: 'k2', name: 'Keeger Belt Cluster', type: 'Asteroid', system: 'nyx', parent_uuid: STAR, hidden: true, x: 0, y: -48.1e9 },
    { uuid: 'turret', name: 'jumppointturrets', type: 'unknown', system: 'nyx', parent_uuid: STAR, hidden: false, x: -27e9, y: 0 },
  ],
};
const objects = [
  { UUID: STAR, Name: 'Nyx', ParentUUID: null, HideInStarmap: false, Size: 1, Type: { Name: 'Star' }, AsteroidRing: null },
  { UUID: 'p1', Name: 'Nyx I', ParentUUID: STAR, HideInStarmap: false, Size: 1_000_000, Type: { Name: 'Planet' }, AsteroidRing: null },
  { UUID: 'lev', Name: 'Levski', ParentUUID: STAR, HideInStarmap: false, Size: 400, NavIcon: 'LandingZone', Type: { Name: 'Manmade' }, AsteroidRing: null },
  { UUID: 'del', Name: 'Delamar', ParentUUID: STAR, HideInStarmap: false, Size: 75_000, Type: { Name: 'Moon' }, AsteroidRing: null },
  { UUID: 'kb', Name: 'Keeger Belt', ParentUUID: STAR, HideInStarmap: false, Size: 39_000, Type: { Name: 'Asteroid' }, AsteroidRing: null },
];

test('starmap: se reduce a lo que pinta el mapa, en km', () => {
  const m = reduceStarmap(positions, objects, '4.10.3-LIVE.13165946', 'sha', '2026-11-19T00:00:00Z');
  const nyx = m.systems[0]!;
  assert.equal(nyx.name, 'Nyx');
  const by = (n: string) => nyx.bodies.find((b) => b.name === n);
  assert.equal(by('Nyx I')?.x, 7_500_000);
  assert.equal(by('Nyx I')?.radius, 1000);
  // Levski es zona de aterrizaje y está en Delamar, que se coloca donde está Levski.
  assert.equal(by('Levski')?.kind, 'city');
  assert.equal(by('Delamar')?.kind, 'moon');
  assert.equal(by('Levski')?.parent, 'del');
  assert.equal(by('Delamar')?.y, 15_000_000);
  assert.equal(by('Stanton Gateway')?.kind, 'gateway');
  assert.equal(by('Stanton Gateway Clinic'), undefined);
  assert.equal(by('jumppointturrets'), undefined);
  assert.equal(by('Moraine Base')?.hidden, true);
  assert.deepEqual(m.jumps, [['Nyx', 'Stanton']]);
  const belt = nyx.belts.find((b) => b.name === 'Keeger Belt')!;
  assert.ok(belt.inner < 47_900_000 && belt.outer > 48_100_000);
});

test('starmap: los sitios del registro se colocan en su objeto, su planeta o su cinturón', () => {
  const m = reduceStarmap(positions, objects, 'b', 'sha', 'now');
  const locate = placeLocator(m);
  assert.deepEqual(locate({ code: 'Nyx_Levski', name: 'Levski', system: 'Nyx', body: 'Delamar' }), { at: 'lev', exact: true, belt: null });
  assert.deepEqual(locate({ code: 'Nyx_Kaboos', name: 'Kaboos', system: 'Nyx', body: null }), { at: null, exact: false, belt: null });
  assert.deepEqual(locate({ code: 'AsteroidClusterBase_Nyx_Social_Keeger_009', name: 'Something', system: 'Nyx', body: null }), { at: null, exact: false, belt: 'Keeger Belt' });
  assert.deepEqual(locate({ code: 'Nyx1_Thing', name: 'Unknown outpost', system: 'Nyx', body: 'Nyx I' }), { at: 'p1', exact: false, belt: null });
  assert.equal(placeLocator(null)({ code: 'x', name: 'Levski', system: 'Nyx', body: null }).at, null);
});

test('puertas de salto: los códigos antiguos del registro van a su destino real', () => {
  assert.deepEqual(jumpGate('RR_JP_StantonMagnus'), { from: 'Stanton', to: 'Nyx' });
  assert.deepEqual(jumpGate('RR_JP_NyxCastra'), { from: 'Nyx', to: 'Stanton' });
  assert.deepEqual(jumpGate('RR_JP_PyroNyx'), { from: 'Pyro', to: 'Nyx' });
  assert.equal(locationInfo('RR_JP_StantonMagnus').name, 'Nyx Gateway');
  assert.equal(locationInfo('RR_JP_NyxCastra').name, 'Stanton Gateway');
  const place = (code: string, visits: number): Place => ({ code, name: code, system: null, body: null, planet: null, visits, first: '', last: '' });
  const v = jumpVisits([place('RR_JP_StantonMagnus', 3), place('RR_JP_NyxCastra', 2), place('RR_JP_StantonPyro', 1)]);
  assert.equal(v.get('Nyx|Stanton'), 5);
  assert.equal(v.get('Pyro|Stanton'), 1);
});
