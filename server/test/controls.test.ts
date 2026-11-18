import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planFor, readUserOverrides } from '../src/game/bindings.ts';
import { keyLabel, parseCombo, scanKey } from '../src/game/keys.ts';

test('combinaciones: modificadores primero y teclas de ratón no enviables', () => {
  assert.deepEqual(parseCombo('f6+lalt'), { keys: ['lalt', 'f6'], sendable: true });
  assert.deepEqual(parseCombo('ralt+K'), { keys: ['ralt', 'k'], sendable: true });
  assert.deepEqual(parseCombo(']'), { keys: ['rbracket'], sendable: true });
  assert.equal(parseCombo('lalt+mouse1')?.sendable, false);
  assert.equal(parseCombo(' '), null);
  assert.equal(parseCombo(''), null);
});

test('scan codes: extendidas con E0', () => {
  assert.deepEqual(scanKey('n'), { code: 0x31, extended: false });
  assert.deepEqual(scanKey('ralt'), { code: 0x38, extended: true });
  assert.deepEqual(scanKey('up'), { code: 0x48, extended: true });
  assert.equal(scanKey('mouse1'), null);
  assert.equal(keyLabel('lalt'), 'Alt izq.');
  assert.equal(keyLabel('n'), 'N');
});

test('plan de pulsación según el modo del juego', () => {
  const tap = { pressThreshold: -1, releaseThreshold: 0.25, multiTap: 1, onHold: false, onRelease: true, retriggerable: false };
  const delayed = { pressThreshold: 0.5, releaseThreshold: -1, multiTap: 1, onHold: false, onRelease: false, retriggerable: false };
  const dbl = { pressThreshold: -1, releaseThreshold: -1, multiTap: 2, onHold: false, onRelease: false, retriggerable: false };
  const hold = { pressThreshold: -1, releaseThreshold: -1, multiTap: 1, onHold: false, onRelease: true, retriggerable: true };
  assert.deepEqual(planFor('tap', tap), { holdMs: 50, taps: 1, momentary: false });
  assert.deepEqual(planFor('delayed_press_medium', delayed), { holdMs: 650, taps: 1, momentary: false });
  assert.deepEqual(planFor('double_tap', dbl), { holdMs: 50, taps: 2, momentary: false });
  assert.equal(planFor('hold', hold).momentary, true);
  assert.equal(planFor('', undefined).momentary, true);
});

test('perfil del usuario: solo cuentan los cambios de teclado', () => {
  const xml = `<ActionMaps>
 <ActionProfiles version="1" profileName="default">
  <actionmap name="vehicle_mfd">
   <action name="v_mfd_movement_down_short"><rebind input="kb1_lalt+s"/></action>
  </actionmap>
  <actionmap name="seat_general">
   <action name="v_eject"><rebind input="js2_ "/></action>
   <action name="v_toggle_scan_mode"><rebind input="kb1_ " activationMode="press"/></action>
  </actionmap>
 </ActionProfiles>
</ActionMaps>`;
  const o = readUserOverrides(xml);
  assert.deepEqual(o.get('vehicle_mfd.v_mfd_movement_down_short'), { keyboard: 'lalt+s', mode: undefined, multiTap: undefined });
  assert.equal(o.has('seat_general.v_eject'), false);
  assert.equal(o.get('seat_general.v_toggle_scan_mode')?.keyboard, ' ');
});
