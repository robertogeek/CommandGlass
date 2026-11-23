import { tx } from '../i18n.ts';
import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { scanKey } from './keys.ts';
import type { SendPlan } from './bindings.ts';

/**
 * Envía pulsaciones de teclado al juego con SendInput (scan codes), a través de un proceso
 * auxiliar de PowerShell que vive mientras el servidor esté arrancado.
 *
 * Seguridad: antes de cada pulsación se comprueba que la ventana en primer plano es Star Citizen;
 * si no lo es, no se envía nada (para no escribir nunca en otra aplicación).
 * Una pulsación = una acción: no hay secuencias automáticas ni repeticiones.
 */

const GAME_PROCESS = 'StarCitizen';
const MAX_HOLD_MS = 10_000;

const HELPER = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
public static class ScmKeys {
  [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] struct UNION { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public UNION u; }
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint n, INPUT[] inputs, int size);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public static string Foreground() {
    uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid);
    try { return Process.GetProcessById((int)pid).ProcessName; } catch { return ""; }
  }
  public static uint Key(ushort scan, bool extended, bool up) {
    INPUT i = new INPUT(); i.type = 1; i.u.ki.wScan = scan;
    i.u.ki.dwFlags = 0x0008u | (extended ? 0x0001u : 0u) | (up ? 0x0002u : 0u);
    return SendInput(1, new INPUT[] { i }, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
[Console]::Out.WriteLine('ready')
[Console]::Out.Flush()
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $parts = $line.Split(' ')
  $id = $parts[0]
  $fg = [ScmKeys]::Foreground()
  if ($parts[1] -eq 'fg') { [Console]::Out.WriteLine("$id ok $fg"); [Console]::Out.Flush(); continue }
  if ($parts[2] -eq '1' -and $fg -ne '${GAME_PROCESS}') { [Console]::Out.WriteLine("$id fg $fg"); [Console]::Out.Flush(); continue }
  $sent = 0
  for ($i = 3; $i -lt $parts.Length; $i++) {
    $t = $parts[$i].Split(':')
    if ($t[0] -eq 'w') { Start-Sleep -Milliseconds ([int]$t[1]); continue }
    $sent += [ScmKeys]::Key([Convert]::ToUInt16($t[1], 16), $t[2] -eq '1', $t[0] -eq 'u')
  }
  [Console]::Out.WriteLine("$id ok $fg $sent")
  [Console]::Out.Flush()
}
`;

export type SendResult =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'not-focused' | 'unbound' | 'error'; message: string; foreground?: string };

type Pending = (line: string) => void;

export class KeySender {
  private dir: string;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private seq = 0;
  private pending = new Map<string, Pending>();
  private holds = new Map<string, { keys: string[]; timer: NodeJS.Timeout }>();

  constructor(dataDir: string) {
    this.dir = join(dataDir, 'game');
  }

  get available(): boolean {
    return process.platform === 'win32';
  }

  /** Nombre del proceso en primer plano (o null si el ayudante no está disponible). */
  async foreground(): Promise<string | null> {
    if (!this.available) return null;
    try {
      const line = await this.request('fg');
      return line.split(' ')[2] ?? '';
    } catch {
      return null;
    }
  }

  /** Un toque completo según el plan de la acción (pulsar, mantener lo necesario, soltar). */
  async tap(keys: string[], plan: SendPlan): Promise<SendResult> {
    const tokens: string[] = [];
    for (let t = 0; t < plan.taps; t++) {
      if (t > 0) tokens.push('w:70');
      tokens.push(...downTokens(keys), `w:${plan.holdMs}`, ...upTokens(keys));
    }
    return this.run(tokens);
  }

  /** Mantener pulsado mientras el dedo esté sobre el botón. Se suelta solo a los 10 s por seguridad. */
  async down(holdId: string, keys: string[]): Promise<SendResult> {
    if (this.holds.has(holdId)) return { ok: true };
    const r = await this.run(downTokens(keys));
    if (r.ok) {
      const timer = setTimeout(() => void this.up(holdId), MAX_HOLD_MS);
      this.holds.set(holdId, { keys, timer });
    }
    return r;
  }

  async up(holdId: string): Promise<SendResult> {
    const h = this.holds.get(holdId);
    if (!h) return { ok: true };
    clearTimeout(h.timer);
    this.holds.delete(holdId);
    // Soltar no exige que el juego siga delante: nunca hay que dejar una tecla atascada.
    return this.run(upTokens(h.keys), false);
  }

  stop(): void {
    for (const id of [...this.holds.keys()]) void this.up(id);
    this.proc?.kill();
    this.proc = null;
    this.ready = null;
  }

  // ------------------------------------------------------------ internos

  private async run(tokens: string[], requireFocus = true): Promise<SendResult> {
    if (!this.available) return { ok: false, reason: 'unavailable', message: tx('El envío de teclas solo funciona con el servidor en Windows.', 'Sending keys only works when the server runs on Windows.') };
    try {
      const line = await this.request(`send ${requireFocus ? 1 : 0} ${tokens.join(' ')}`);
      const [, status, fg, sent] = line.split(' ');
      if (status === 'fg') {
        return {
          ok: false,
          reason: 'not-focused',
          message: tx('Star Citizen no está en primer plano en el PC: haz clic en la ventana del juego y vuelve a intentarlo.', 'Star Citizen is not in the foreground on the PC: click the game window and try again.'),
          foreground: fg,
        };
      }
      // Si el ayudante se cae a media petición contesta «error»: antes se daba la tecla por enviada.
      if (status !== 'ok') return { ok: false, reason: 'error', message: tx(`No se ha podido enviar la tecla (${line}).`, `Could not send the key (${line}).`) };
      // SendInput cuenta las pulsaciones que ha metido: 0 es que Windows las ha rechazado todas.
      if (sent === '0' && tokens.some((t) => !t.startsWith('w:'))) {
        return { ok: false, reason: 'error', message: tx('Windows no ha aceptado la pulsación (SendInput).', 'Windows did not accept the key press (SendInput).'), foreground: fg };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: 'error', message: tx(`No se ha podido enviar la tecla (${(err as Error).message}).`, `Could not send the key (${(err as Error).message}).`) };
    }
  }

  private async request(body: string): Promise<string> {
    await this.start();
    const id = String(++this.seq);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(tx('el ayudante de teclado no responde', 'the keyboard helper is not responding')));
      }, 5_000);
      this.pending.set(id, (line) => {
        clearTimeout(timer);
        resolve(line);
      });
      this.proc!.stdin.write(`${id} ${body}\n`);
    });
  }

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    mkdirSync(this.dir, { recursive: true });
    const script = join(this.dir, 'keysender.ps1');
    writeFileSync(script, HELPER.trimStart(), 'utf8');
    const proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
      windowsHide: true,
    });
    this.proc = proc;
    this.ready = new Promise((resolve, reject) => {
      const rl = createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        if (line === 'ready') return resolve();
        const id = line.split(' ')[0]!;
        this.pending.get(id)?.(line);
        this.pending.delete(id);
      });
      proc.stderr.on('data', (d: Buffer) => console.error('[teclado]', d.toString().trim()));
      proc.on('exit', (code) => {
        if (this.proc === proc) {
          this.proc = null;
          this.ready = null;
        }
        for (const [, cb] of this.pending) cb('0 error');
        this.pending.clear();
        reject(new Error(tx(`el ayudante de teclado se cerró (código ${code})`, `the keyboard helper exited (code ${code})`)));
      });
    });
    return this.ready;
  }
}

/**
 * Solo para el informe de diagnóstico: ¿tiene Windows marcado «Ejecutar como administrador» para el RSI Launcher
 * o el juego (Propiedades → Compatibilidad, en el usuario o para todos)? Así el juego va elevado y Windows no le
 * deja pasar teclas de una app normal. Se lee del registro, sin tocar el proceso del juego, como mucho una vez
 * por minuto. No cambia nada de cómo se envían las teclas.
 */
let adminMark = { at: 0, value: false };
export function runAsAdminMarked(): boolean {
  if (process.platform !== 'win32') return false;
  if (Date.now() - adminMark.at < 60_000) return adminMark.value;
  let value = false;
  for (const root of ['HKCU', 'HKLM']) {
    try {
      const out = execFileSync('reg.exe', ['query', `${root}\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers`], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 3_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (hasAdminMark(out)) value = true;
    } catch {
      /* sin la clave: nada marcado */
    }
  }
  adminMark = { at: Date.now(), value };
  return value;
}

/** Salida de «reg query …\Layers»: una línea por programa, con sus banderas (RUNASADMIN, WIN8RTM…). */
export function hasAdminMark(regOutput: string): boolean {
  return regOutput
    .split(/\r?\n/)
    .some((l) => /\\(RSI Launcher|StarCitizen)\.exe\s+REG_SZ\s+.*\bRUNASADMIN\b/i.test(l));
}

function downTokens(keys: string[]): string[] {
  const out: string[] = [];
  keys.forEach((k, i) => {
    const s = scanKey(k)!;
    if (i > 0) out.push('w:20');
    out.push(`d:${s.code.toString(16)}:${s.extended ? 1 : 0}`);
  });
  return out;
}

function upTokens(keys: string[]): string[] {
  return [...keys].reverse().map((k) => {
    const s = scanKey(k)!;
    return `u:${s.code.toString(16)}:${s.extended ? 1 : 0}`;
  });
}
