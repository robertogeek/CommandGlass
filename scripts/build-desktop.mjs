// Empaqueta el servidor y la app de escritorio con esbuild (sin TypeScript en tiempo de ejecución).
//   desktop/dist/server.mjs   servidor completo (con qrcode dentro)
//   desktop/dist/main.mjs     proceso principal de Electron
//   desktop/dist/preload.cjs  puente seguro con la ventana
import { build } from 'esbuild';
import { rmSync } from 'node:fs';

rmSync('desktop/dist', { recursive: true, force: true });

const common = { bundle: true, platform: 'node', target: 'node24', logLevel: 'info', legalComments: 'none' };

await build({
  ...common,
  entryPoints: ['server/src/main.ts'],
  outfile: 'desktop/dist/server.mjs',
  format: 'esm',
  // qrcode es CommonJS: dentro de un bundle ESM necesita un require de verdad.
  banner: { js: "import { createRequire as __cgRequire } from 'node:module'; const require = __cgRequire(import.meta.url);" },
});

await build({
  ...common,
  entryPoints: ['desktop/main.ts'],
  outfile: 'desktop/dist/main.mjs',
  format: 'esm',
  external: ['electron'],
  // electron-updater (va dentro del bundle) es CommonJS: necesita un require de verdad.
  banner: { js: "import { createRequire as __cgRequire } from 'node:module'; const require = __cgRequire(import.meta.url);" },
});

await build({
  ...common,
  entryPoints: ['desktop/preload.ts'],
  outfile: 'desktop/dist/preload.cjs',
  format: 'cjs',
  external: ['electron'],
});

// Pantallas de este PC (desktop/screens.ts): activa la ventana solo mientras se escribe.
await build({
  ...common,
  entryPoints: ['desktop/screen-preload.ts'],
  outfile: 'desktop/dist/screen-preload.cjs',
  format: 'cjs',
  external: ['electron'],
});
