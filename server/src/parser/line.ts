import type { LogLine } from './types.ts';

const TS_RE = /^<(\d{4}-\d{2}-\d{2}T[\d:.]+Z)>\s?/;
const LEVEL_RE = /^\[(\w+)\]\s*/;

/**
 * Trocea una línea cruda. Las etiquetas pueden anidar <...>
 * (p. ej. "<Foo::<lambda_1>>"), así que se busca el cierre equilibrado.
 */
export function splitLine(raw: string): LogLine | null {
  const tsMatch = TS_RE.exec(raw);
  if (!tsMatch) return null;
  const ts = tsMatch[1]!;
  let rest = raw.slice(tsMatch[0].length);

  let level: string | null = null;
  const levelMatch = LEVEL_RE.exec(rest);
  if (levelMatch) {
    level = levelMatch[1]!;
    rest = rest.slice(levelMatch[0].length);
  }

  let tag: string | null = null;
  if (level && rest.startsWith('<')) {
    let depth = 0;
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i];
      if (ch === '<') depth++;
      else if (ch === '>') {
        depth--;
        if (depth === 0) {
          tag = rest.slice(1, i);
          rest = rest.slice(i + 1).replace(/^\s/, '');
          break;
        }
      }
    }
  }

  return { ts, level, tag, body: rest, raw };
}

/** Clave de sesión de la primera línea: coincide con el nombre del fichero en logbackups. */
export function backupKeyFromHeader(raw: string): string | null {
  const m = /BackupNameAttachment="\s*(Build\(\d+\)[^"]*)"/.exec(raw);
  return m ? `Game ${m[1]!.trim()}` : null;
}

/** "Game Build(13165946) 17 Nov 26 (22 20 36).log" -> "Game Build(13165946) 17 Nov 26 (22 20 36)" */
export function backupKeyFromFilename(name: string): string | null {
  const m = /^(Game Build\(\d+\)[^.]*)\.log$/i.exec(name);
  return m ? m[1]!.trim() : null;
}

export function buildFromKey(key: string): string | null {
  const m = /Build\((\d+)\)/.exec(key);
  return m ? m[1]! : null;
}
