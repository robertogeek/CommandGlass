import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Pb, readFrame } from '../src/game/telemetry.ts';

// Codificador protobuf mínimo para montar fotogramas como los que manda el juego.
type Field = [number, number | string | { f32: number } | Buffer | Field[]];

function varint(n: number): Buffer {
  const out: number[] = [];
  let v = BigInt.asUintN(64, BigInt(n));
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return Buffer.from(out);
}

function enc(fields: Field[]): Buffer {
  const parts: Buffer[] = [];
  for (const [n, v] of fields) {
    if (typeof v === 'number') parts.push(varint(n * 8), varint(v));
    else if (typeof v === 'string' || Buffer.isBuffer(v) || Array.isArray(v)) {
      const body = typeof v === 'string' ? Buffer.from(v) : Buffer.isBuffer(v) ? v : enc(v);
      parts.push(varint(n * 8 + 2), varint(body.length), body);
    } else {
      const b = Buffer.alloc(4);
      b.writeFloatLE(v.f32);
      parts.push(varint(n * 8 + 5), b);
    }
  }
  return Buffer.concat(parts);
}

const f = (x: number) => ({ f32: x });
const MAXF = 3.4028234663852886e38;

// Fotograma real de la Aurora Mk II a 1230 m/s (LIVE 4.10.201), reducido.
const shipFrame = enc([
  [3, [[2, [
    [1, 'RSI_Aurora_Mk2_949464407697'],
    [2, 'RSI_Aurora_Mk2'],
    [4, 1],
    [7, [[1, 1], [2, 4], [3, 1], [4, 2], [5, 2], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1]]],
    [8, [
      [1, [[2, 1], [3, 1]]],
      [2, [[1, [[1, 1], [2, 1]]], [4, [[1, 1]]], [5, Buffer.alloc(0)], [12, 1]]],
      [3, [[1, f(1229.9905)], [2, f(0.9944)], [4, [[1, f(5.4775)], [2, f(19.0813)]]], [5, [[3, f(0.8994)]]], [6, f(MAXF)], [7, f(MAXF)], [10, f(55.7444)]]],
    ]],
    [9, [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [7, 1]]],
  ]]]],
  [4, [
    [1, [[2, 1], [3, 1], [8, 1]]],
    [4, [[1, 'KLWE_LaserRepeater_S2_949464407782'], [2, 1], [3, 1], [4, 1]]],
    [4, [[1, 'KLWE_LaserRepeater_S2_949464407774'], [2, 1], [4, 1]]],
    [5, [[1, 1], [2, 48]]],
    [5, [[1, 2], [2, 5]]],
  ]],
  [6, [
    [1, [[1, [[1, f(100)], [2, f(100)]]], [2, [[1, f(1)], [2, f(1)]]], [3, [[1, f(76.1042)], [2, f(100)]]], [5, [[1, f(36.5)], [2, f(100)]]], [7, f(59.028)], [8, f(1.0003)], [9, f(1)]]],
    [2, [[1, 3], [2, 1], [3, 'RSI_Aurora_Mk2_SeatDashboard_Pilot_949464407740'], [4, 5976305]]],
    [3, [[1, f(21)], [3, 1]]],
  ]],
]);

test('telemetría: lee la nave, las armas y el personaje de un fotograma real', () => {
  const fr = readFrame(shipFrame);
  assert.ok(fr);
  assert.deepEqual(fr.blocks, [3, 4, 6]);

  const v = fr.vehicle!;
  assert.equal(v.className, 'RSI_Aurora_Mk2');
  assert.equal(v.name, 'RSI_Aurora_Mk2_949464407697');
  assert.equal(v.type, 1);
  assert.deepEqual(v.annunciators, [1, 4, 1, 2, 2, 1, 1, 1, 1, 1]);
  assert.equal(v.landed, false);
  assert.equal(v.gear, 1);
  assert.ok(Math.abs(v.speed - 1229.99) < 0.01);
  assert.ok(Math.abs(v.hydrogen - 0.9944) < 1e-4);
  assert.ok(Math.abs(v.gForceMax - 19.08) < 0.01);
  assert.equal(v.boost.engaged, false);
  assert.ok(Math.abs(v.boost.reserves - 0.8994) < 1e-4);
  // 3.4e38 es «sin dato» y la densidad ausente es «fuera de la atmósfera»; nunca un 0.
  assert.equal(v.altitude, null);
  assert.equal(v.radarAltitude, null);
  assert.equal(v.atmosphericDensity, null);
  assert.equal(v.verticalSpeed, 0);
  assert.deepEqual(v.power, [true, true, true, true, true, false, true, false, false]);
  assert.deepEqual(v.ifcs.slice(0, 5), [true, false, false, true, false]);
  assert.equal(v.ifcs[11], true);

  const w = fr.weapons!;
  assert.equal(w.weapons.length, 2);
  assert.deepEqual(w.weapons[1], { name: 'KLWE_LaserRepeater_S2_949464407774', powered: true, ready: false, inGroup: true });
  assert.deepEqual(w.countermeasures, [{ type: 1, amount: 48 }, { type: 2, amount: 5 }]);

  const a = fr.actor!;
  assert.deepEqual(a.health, { current: 100, max: 100 });
  assert.ok(Math.abs(a.hunger.current - 76.1) < 0.01);
  assert.deepEqual(a.thirst, { current: 0, max: 0 }); // ausente: protobuf omite los ceros
  assert.equal(a.intoxication, 0);
  assert.equal(a.bodyTemperature, 36.5);
  assert.equal(a.locomotion, 3);
  assert.equal(a.crewRole, 1);
  assert.equal(a.seatName, 'RSI_Aurora_Mk2_SeatDashboard_Pilot_949464407740');
  assert.equal(a.uecBalance, 5976305);
  assert.equal(a.externalTemperature, 21);
  assert.equal(a.breathable, true);
});

test('telemetría: a pie solo llega el personaje', () => {
  const fr = readFrame(enc([[6, [[2, [[1, 1], [4, 5976305]]], [3, [[1, f(21)]]]]]]));
  assert.ok(fr);
  assert.equal(fr.vehicle, null);
  assert.equal(fr.weapons, null);
  assert.equal(fr.actor!.locomotion, 1);
  assert.equal(fr.actor!.breathable, false);
  assert.equal(fr.actor!.seatName, '');
});

test('telemetría: un mensaje roto no se lee y no rompe nada', () => {
  assert.equal(readFrame(Buffer.from([0x0a, 0xff, 0x01, 0x02])), null);
  assert.equal(Pb.parse(Buffer.from([0x0b])), null); // tipo de cable 3 (grupos): no se admite
  assert.deepEqual(readFrame(Buffer.alloc(0)), { actor: null, vehicle: null, weapons: null, blocks: [] });
});

test('telemetría: el árbol de depuración enseña textos y números', () => {
  const tree = Pb.parse(enc([[1, 'RSI_Aurora_Mk2'], [2, 7], [3, f(0.5)], [4, [[1, 2]]]]))!.toJSON();
  assert.deepEqual(tree, { 1: 'RSI_Aurora_Mk2', 2: 7, 3: 0.5, 4: { 1: 2 } });
});
