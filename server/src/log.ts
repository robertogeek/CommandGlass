import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'node:util';

/**
 * Registro de CommandGlass en data/logs/commandglass.log: todo lo que el servidor escribe por consola, con fecha.
 * Va al informe de diagnóstico que el usuario puede mandar si algo falla. Al pasar de 1 MB se guarda como
 * commandglass.1.log y se empieza otro, así que nunca ocupa más de 2 MB.
 */

const MAX_BYTES = 1_000_000;
let file: string | null = null;
let written = 0;

export function logFiles(): string[] {
  if (!file) return [];
  return [file.replace(/\.log$/, '.1.log'), file].filter((f) => existsSync(f));
}

export function setupLog(dataDir: string): void {
  const dir = join(dataDir, 'logs');
  mkdirSync(dir, { recursive: true });
  file = join(dir, 'commandglass.log');
  written = existsSync(file) ? statSync(file).size : 0;
  for (const level of ['log', 'info', 'warn', 'error'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      write(level, format(...args));
    };
  }
  process.on('uncaughtException', (err) => write('error', `Excepción no controlada: ${err.stack ?? err.message}`));
  process.on('unhandledRejection', (err) => write('error', `Promesa rechazada sin controlar: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`));
}

/** Escribe una línea en el registro (sin pasar por la consola). */
export function write(level: string, message: string): void {
  if (!file) return;
  // El QR del terminal no aporta nada en el registro.
  if (/[█▀▄]/.test(message)) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${redact(message)}\n`;
  try {
    if (written + line.length > MAX_BYTES) {
      renameSync(file, file.replace(/\.log$/, '.1.log'));
      written = 0;
    }
    appendFileSync(file, line);
    written += Buffer.byteLength(line);
  } catch {
    /* sin registro: no se puede hacer nada más */
  }
}

/** Nada de claves ni tokens en el registro: la clave de emparejamiento va en los enlaces (?k=…). */
export function redact(s: string): string {
  return s.replace(/([?&]k=)[^&\s"']+/g, '$1***').replace(/(Bearer\s+)[\w.-]+/gi, '$1***');
}
