// Notas de una versión para su release de GitHub, sacadas de CHANGELOG.md.
// Uso: node scripts/release-notes.mjs v0.1.3-beta > notas.md
// Versión de pruebas: la etiqueta lleva una coletilla tras la versión (v0.1.5-beta-telemetry). Usa la sección
// de esa versión (aunque esté «en desarrollo») y avisa arriba de que es para probar.
import { readFileSync } from 'node:fs';

const tag = (process.argv[2] ?? '').replace(/^v/, '');
if (!tag) {
  console.error('Falta la versión (por ejemplo, v0.1.3-beta).');
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
// «0.1.5-beta-telemetry» con package.json en 0.1.5-beta → versión 0.1.5-beta, pruebas «telemetry».
const test = tag.startsWith(`${pkg}-`) ? tag.slice(pkg.length + 1) : null;
const version = test ? pkg : tag;

const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split(/\r?\n/);
const start = lines.findIndex((l) => l.startsWith(`## ${version} `) || l === `## ${version}`);
if (start < 0) {
  console.error(`CHANGELOG.md no tiene la sección «## ${version}».`);
  process.exit(1);
}
const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
let body = lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
// Fecha de la versión según el changelog («## 0.1.2-beta — 2026-11-19»). Va en un comentario que GitHub no
// muestra: la página de descargas la usa en vez de la fecha en que se creó la release.
const date = /\b(\d{4}-\d{2}-\d{2})\b/.exec(lines[start])?.[1] ?? new Date().toISOString().slice(0, 10);

const unsigned = `**Instalador sin firmar.** La primera vez Windows avisa con «Windows protegió su PC»: pulsa *Más información* → *Ejecutar de todas formas*.`;
const unsignedEn = `**Unsigned installer.** The first time, Windows shows "Windows protected your PC": click *More info* → *Run anyway*.`;

let footer;
if (test) {
  // El aviso va al principio de cada idioma: la página de descargas separa las notas por «**English**».
  const es = `**Versión de pruebas (${test}).** Es la ${version} antes de salir, para probar lo nuevo: puede tener fallos. Si algo va mal, crea el informe de diagnóstico en la ventana del PC y mándanoslo. Se instala encima de la versión normal, sin perder tu historial.`;
  const en = `**Test build (${test}).** It's ${version} before release, to try out what's new: it may have bugs. If something goes wrong, create the diagnostic report in the PC window and send it to us. It installs over the regular version, keeping your history.`;
  const [bodyEs, bodyEn] = body.split(/^\*\*English\*\*\s*$/m);
  body = `${es}\n\n${bodyEs.trim()}${bodyEn !== undefined ? `\n\n**English**\n\n${en}\n\n${bodyEn.trim()}` : ''}`;
  footer = `${unsigned} Esta versión no está en la Microsoft Store.\n\n${unsignedEn} This build is not on the Microsoft Store.`;
} else {
  footer = `${unsigned} También está en la [Microsoft Store](https://apps.microsoft.com/detail/9MX5DG0F5P0T), firmada por Microsoft, cuando pasa la certificación.

${unsignedEn} It is also on the [Microsoft Store](https://apps.microsoft.com/detail/9MX5DG0F5P0T), signed by Microsoft, once it passes certification.`;
}

console.log(`<!-- fecha: ${date} -->
${body}

---

${footer}`);
