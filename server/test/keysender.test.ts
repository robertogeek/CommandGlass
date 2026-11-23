import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAdminMark } from '../src/game/keysender.ts';

// Salida real de «reg query HKCU\Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers».
const reg = (lines: string[]) =>
  ['', 'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers', ...lines, ''].join('\r\n');

test('«Ejecutar como administrador» en el RSI Launcher o en el juego', () => {
  assert.equal(hasAdminMark(reg(['    C:\\Program Files\\Roberts Space Industries\\RSI Launcher\\RSI Launcher.exe    REG_SZ    ~ RUNASADMIN'])), true);
  assert.equal(hasAdminMark(reg(['    D:\\Juegos\\StarCitizen\\LIVE\\Bin64\\StarCitizen.exe    REG_SZ    ~ HIGHDPIAWARE RUNASADMIN'])), true);
});

test('otras banderas u otros programas no cuentan', () => {
  assert.equal(hasAdminMark(reg(['    C:\\Program Files\\Roberts Space Industries\\RSI Launcher\\RSI Launcher.exe    REG_SZ    ~ HIGHDPIAWARE'])), false);
  assert.equal(hasAdminMark(reg(['    C:\\Tools\\Otro.exe    REG_SZ    ~ RUNASADMIN'])), false);
  assert.equal(hasAdminMark(''), false);
});
