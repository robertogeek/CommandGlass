// Notas de una versión para su release de GitHub, sacadas de CHANGELOG.md.
// Uso: node scripts/release-notes.mjs v0.1.3-beta > notas.md
import { readFileSync } from 'node:fs';

const version = (process.argv[2] ?? '').replace(/^v/, '');
if (!version) {
  console.error('Falta la versión (por ejemplo, v0.1.3-beta).');
  process.exit(1);
}
const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split(/\r?\n/);
const start = lines.findIndex((l) => l.startsWith(`## ${version} `) || l === `## ${version}`);
if (start < 0) {
  console.error(`CHANGELOG.md no tiene la sección «## ${version}».`);
  process.exit(1);
}
const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
const body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();

console.log(`${body}

---

**Instalador sin firmar.** La primera vez Windows avisa con «Windows protegió su PC»: pulsa *Más información* → *Ejecutar de todas formas*. También está en la [Microsoft Store](https://apps.microsoft.com/detail/9MX5DG0F5P0T), firmada por Microsoft, cuando pasa la certificación.

**Unsigned installer.** The first time, Windows shows "Windows protected your PC": click *More info* → *Run anyway*. It is also on the [Microsoft Store](https://apps.microsoft.com/detail/9MX5DG0F5P0T), signed by Microsoft, once it passes certification.`);
