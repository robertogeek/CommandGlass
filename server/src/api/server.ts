import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import QRCode from 'qrcode';
import { CLIENT_DIST, type AppConfig } from '../config.ts';
import type { LiveTailer } from '../ingest/tailer.ts';
import { getContact, listContacts, setContactNote } from '../store/contacts.ts';
import type { Store, StoredEvent } from '../store/db.ts';
import type { LiveState } from '../state/reducer.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const COOKIE = 'scm_key';

export interface ServerDeps {
  config: AppConfig;
  store: Store;
  tailer: LiveTailer;
  lanUrl: string;
}

export function startServer({ config, store, tailer, lanUrl }: ServerDeps) {
  const clients = new Set<ServerResponse>();

  const broadcast = (event: string, data: unknown) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(payload);
  };

  tailer.on('events', (events: StoredEvent[], state: LiveState) => {
    broadcast('events', events);
    broadcast('state', snapshot(state));
  });
  tailer.on('session', (state: LiveState) => broadcast('state', snapshot(state)));

  // Mantiene viva la conexión y refresca el indicador "en directo".
  setInterval(() => broadcast('status', tailer.status()), 15_000);

  function snapshot(state: LiveState | null) {
    return { state, status: tailer.status() };
  }

  const pairUrl = `${lanUrl}/?k=${config.pairKey}`;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;

      if (!authorize(req, res, url, config.pairKey)) {
        if (path.startsWith('/api/')) return json(res, 401, { error: 'Empareja este dispositivo desde el PC' });
        return html(res, 401, unauthorizedPage());
      }

      if (path === '/pair') {
        if (!isLoopback(req)) return html(res, 403, '<p>Abre esta página en el PC.</p>');
        const svg = await QRCode.toString(pairUrl, { type: 'svg', margin: 1, width: 320 });
        return html(res, 200, pairPage(svg, pairUrl));
      }

      if (path === '/manifest.webmanifest') {
        // start_url lleva la clave: la app de pantalla de inicio de iOS no comparte cookies con Safari.
        return send(res, 200, MIME['.webmanifest']!, JSON.stringify(manifest(config.pairKey)));
      }

      if (path === '/api/state') return json(res, 200, snapshot(tailer.state));

      if (path === '/api/overview') return json(res, 200, store.overview());

      if (path === '/api/sessions') {
        return json(res, 200, store.listSessions(Number(url.searchParams.get('limit') ?? 50)));
      }

      if (path === '/api/events') {
        const p = url.searchParams;
        const session = p.get('session');
        const sessionId =
          session === 'current' ? (tailer.status().sessionId ?? undefined) : session ? Number(session) : undefined;
        return json(
          res,
          200,
          store.queryEvents({
            sessionId,
            beforeId: p.get('before') ? Number(p.get('before')) : undefined,
            limit: p.get('limit') ? Number(p.get('limit')) : 100,
            minImportance: p.get('min') ? Number(p.get('min')) : undefined,
            categories: p.get('cat')?.split(',').filter(Boolean),
            search: p.get('q') ?? undefined,
            mention: p.get('mention') ?? undefined,
          }),
        );
      }

      if (path === '/api/contacts') {
        return json(res, 200, listContacts(store, tailer.status().sessionId));
      }

      const contactRoute = /^\/api\/contacts\/([^/]+)(\/note)?$/.exec(path);
      if (contactRoute) {
        const name = decodeURIComponent(contactRoute[1]!);
        if (contactRoute[2]) {
          if (req.method !== 'POST') return json(res, 405, { error: 'Usa POST' });
          // Exigir JSON obliga al navegador a hacer preflight CORS: una web ajena no puede escribir aquí.
          if (!req.headers['content-type']?.startsWith('application/json')) {
            return json(res, 415, { error: 'Se esperaba JSON' });
          }
          const body = (await readJson(req)) as { mark?: unknown; note?: unknown } | null;
          if (!body) return json(res, 400, { error: 'JSON no válido' });
          return json(res, 200, setContactNote(store, name, body.mark, body.note));
        }
        const contact = getContact(store, name, tailer.status().sessionId);
        return contact ? json(res, 200, contact) : json(res, 404, { error: 'No hay registros de este jugador' });
      }

      if (path === '/api/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        res.write(`retry: 3000\nevent: state\ndata: ${JSON.stringify(snapshot(tailer.state))}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }

      if (path.startsWith('/api/')) return json(res, 404, { error: 'No existe' });

      return serveStatic(res, path);
    } catch (err) {
      console.error('[http]', err);
      if (!res.headersSent) json(res, 500, { error: 'Error interno' });
    }
  });

  server.listen(config.port, '0.0.0.0');
  return { server, pairUrl };
}

// ---------------------------------------------------------------- auth

function isLoopback(req: IncomingMessage): boolean {
  const a = req.socket.remoteAddress ?? '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

function authorize(req: IncomingMessage, res: ServerResponse, url: URL, key: string): boolean {
  if (isLoopback(req)) return true;
  const fromQuery = url.searchParams.get('k');
  if (fromQuery === key) {
    res.setHeader('Set-Cookie', `${COOKIE}=${key}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
    return true;
  }
  const cookie = req.headers.cookie ?? '';
  const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(cookie);
  if (m?.[1] === key) return true;
  return req.headers['x-scm-key'] === key;
}

// ---------------------------------------------------------------- respuestas

function send(res: ServerResponse, status: number, type: string, body: string | Buffer, extra: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': type, ...extra });
  res.end(body);
}

function json(res: ServerResponse, status: number, data: unknown) {
  send(res, status, MIME['.json']!, JSON.stringify(data), { 'Cache-Control': 'no-store' });
}

function readJson(req: IncomingMessage, limit = 16_384): Promise<unknown> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        resolve(null);
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function html(res: ServerResponse, status: number, body: string) {
  send(res, status, MIME['.html']!, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SC Master</title>
<style>body{background:#071216;color:#cfe9ee;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center}a{color:#6fe3f0}code{color:#6fe3f0}</style>${body}`);
}

function serveStatic(res: ServerResponse, path: string) {
  if (!existsSync(join(CLIENT_DIST, 'index.html'))) {
    return html(res, 503, '<div><h1>SC Master</h1><p>Falta compilar la interfaz: ejecuta <code>npm run build</code>.</p></div>');
  }
  const safe = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, '');
  let file = join(CLIENT_DIST, safe);
  if (!file.startsWith(CLIENT_DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(CLIENT_DIST, 'index.html'); // SPA
  }
  const immutable = file.includes(`${join(CLIENT_DIST, 'assets')}`);
  send(res, 200, MIME[extname(file)] ?? 'application/octet-stream', readFileSync(file), {
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
}

function manifest(key: string) {
  return {
    name: 'SC Master',
    short_name: 'SC Master',
    description: 'Tu mobiGlas inteligente para Star Citizen',
    start_url: `/?k=${key}`,
    scope: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#071216',
    theme_color: '#071216',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}

function unauthorizedPage(): string {
  return `<div><h1>SC Master</h1><p>Este dispositivo aún no está emparejado.</p>
<p>En el PC abre <code>http://localhost:8777/pair</code> y escanea el código QR con el iPad.</p></div>`;
}

function pairPage(svg: string, url: string): string {
  return `<div><h1>Empareja tu iPad</h1>
<p>Escanea este código con la cámara del iPad y ábrelo en Safari.</p>
<div style="background:#fff;padding:16px;border-radius:12px;display:inline-block">${svg}</div>
<p style="font-size:13px;opacity:.7">${url}</p>
<p>Después, en Safari: <b>Compartir → Añadir a pantalla de inicio</b>.</p></div>`;
}
