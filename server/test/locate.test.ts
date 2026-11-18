import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gameDirsFromLauncherLog } from '../src/game/locate.ts';

test('log del lanzador: la ruta más reciente primero y LIVE antes que PTU', () => {
  const log = [
    '{ "t":"2026-11-01 20:00:00.000", "[main][info] ": "[Launcher::launch] Launching Star Citizen LIVE from (D:\\\\Juegos\\\\StarCitizen\\\\LIVE)"  },',
    '{ "t":"2026-11-10 20:00:00.000", "[main][info] ": "[Launcher::launch] Launching Star Citizen PTU from (E:\\\\RSI\\\\StarCitizen\\\\PTU)"  },',
    '{ "t":"2026-11-18 20:00:00.000", "[main][info] ": "[Launcher::launch] Launching Star Citizen LIVE from (C:\\\\Program Files\\\\Roberts Space Industries\\\\StarCitizen\\\\LIVE)"  },',
  ].join('\n');
  assert.deepEqual(gameDirsFromLauncherLog(log), [
    'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE',
    'D:\\Juegos\\StarCitizen\\LIVE',
    'E:\\RSI\\StarCitizen\\PTU',
  ]);
  assert.deepEqual(gameDirsFromLauncherLog('nada que ver'), []);
});
