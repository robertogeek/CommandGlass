import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import QRCode from 'qrcode';
import { APP_VERSION, CLIENT_DIST, DATA_DIR, type AppConfig } from '../config.ts';
import type { LiveTailer } from '../ingest/tailer.ts';
import type { BindingsService } from '../game/bindings.ts';
import type { KeySender } from '../game/keysender.ts';
import { getContact, listContacts, setContactNote } from '../store/contacts.ts';
import { briefingFor, factionStats, kindStats, loadMissions } from '../store/missions.ts';
import type { WikiMissions } from '../game/wiki.ts';
import { COMPONENT_LABEL, type ComponentType, type WikiCatalog } from '../game/catalog.ts';
import { prettyItem } from '../parser/rules.ts';
import { loadShips, nameIndex } from '../store/hangar.ts';
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
  bindings: BindingsService;
  keys: KeySender;
  wiki: WikiMissions;
  catalog: WikiCatalog;
}

/** Acciones que no se envían sin una confirmación explícita desde la interfaz. */
const DANGEROUS = new Set(['v_self_destruct', 'v_eject', 'force_respawn', 'v_emergency_exit']);

export function startServer({ config, store, tailer, lanUrl, bindings, keys, wiki, catalog }: ServerDeps) {
  // Conexiones en directo abiertas; "remote" = desde otro dispositivo (el iPad), no desde este PC.
  const clients = new Map<ServerResponse, { remote: boolean; since: string; agent: string }>();

  const broadcast = (event: string, data: unknown) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients.keys()) res.write(payload);
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

      // Escrituras solo desde la propia app: una web de otro origen no puede pulsar teclas ni editar notas.
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin) {
        let sameHost = false;
        try {
          sameHost = new URL(req.headers.origin).host === req.headers.host;
        } catch {
          /* origen no válido */
        }
        if (!sameHost) return json(res, 403, { error: 'Origen no permitido' });
      }

      if (!authorize(req, res, url, config.pairKey)) {
        if (path.startsWith('/api/')) return json(res, 401, { error: 'Empareja este dispositivo desde el PC' });
        return html(res, 401, unauthorizedPage());
      }

      if (path === '/pair') {
        if (!isLoopback(req)) return html(res, 403, '<p>Abre esta página en el PC.</p>');
        const svg = await QRCode.toString(pairUrl, { type: 'svg', margin: 1, width: 320 });
        return html(res, 200, pairPage(svg, pairUrl));
      }

      // Ventana de la app de escritorio: QR, estado y carpeta del juego. Solo en este PC (muestra la clave).
      if (path === '/escritorio') {
        if (!isLoopback(req)) return html(res, 403, '<p>Abre esta página en el PC.</p>');
        const file = join(CLIENT_DIST, 'desktop.html');
        if (!existsSync(file)) return html(res, 503, '<p>Falta compilar la interfaz: ejecuta <code>npm run build</code>.</p>');
        return send(res, 200, MIME['.html']!, readFileSync(file), { 'Cache-Control': 'no-cache' });
      }

      if (path === '/api/desktop') {
        if (!isLoopback(req)) return json(res, 403, { error: 'Solo desde este PC' });
        const qrSvg = await QRCode.toString(pairUrl, { type: 'svg', margin: 1, width: 300, color: { dark: '#000000', light: '#ffffff' } });
        const devices = [...clients.values()].filter((c) => c.remote);
        return json(res, 200, {
          version: APP_VERSION,
          pairUrl,
          lanUrl,
          qrSvg,
          gameDir: config.gameDir,
          gameDirFound: config.gameDirFound,
          dataDir: DATA_DIR,
          devices,
          status: tailer.status(),
        });
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

      if (path === '/api/missions') {
        const missions = loadMissions(store).map((m) => ({ ...m, faction: wiki.lookup(m.contract, m.title)?.faction ?? null }));
        const done = missions.filter((m) => m.outcome !== 'open');
        return json(res, 200, {
          missions: missions.slice(0, Number(url.searchParams.get('limit') ?? 400)),
          kinds: kindStats(missions),
          factions: factionStats(missions, (m) => wiki.lookup(m.contract, m.title)),
          wiki: wiki.info,
          totals: {
            total: missions.length,
            completed: missions.filter((m) => m.outcome === 'completed').length,
            failed: missions.filter((m) => m.outcome === 'failed').length,
            abandoned: missions.filter((m) => m.outcome === 'abandoned').length,
            successRate: done.length ? Math.round((100 * done.filter((m) => m.outcome === 'completed').length) / done.length) : null,
          },
        });
      }

      const missionRoute = /^\/api\/missions\/([^/]+)$/.exec(path);
      if (missionRoute) {
        const all = loadMissions(store);
        const mission = all.find((m) => m.id === decodeURIComponent(missionRoute[1]!));
        if (!mission) return json(res, 404, { error: 'No encuentro ese contrato' });
        return json(res, 200, { mission, briefing: briefingFor(mission, all), intel: wiki.lookup(mission.contract, mission.title), wiki: wiki.info });
      }

      if (path === '/api/hangar') {
        const resolve = nameIndex(await catalog.vehicleNames());
        const ships = loadShips(store, resolve);
        // Lo más reciente que se sepa: la partida en curso o, si no, la última sesión que lo registró.
        const states = [tailer.state, ...store.recentStates(30)].filter(Boolean) as LiveState[];
        const fleet = states.find((s) => s.fleet)?.fleet ?? null;
        const withGear = states.find((s) => s.loadout && Object.keys(s.loadout).length > 0);
        const loadout = await Promise.all(
          Object.entries(withGear?.loadout ?? {}).map(async ([port, v]) => ({
            port,
            cls: v.cls,
            at: v.at,
            name: (await catalog.itemName(v.cls)) ?? prettyItem(v.cls),
          })),
        );
        return json(res, 200, { ships, fleet, loadout, loadoutAt: withGear?.lastEventAt ?? null });
      }

      const shipRoute = /^\/api\/hangar\/ship\/([^/]+)$/.exec(path);
      if (shipRoute) {
        const spec = await catalog.ship(decodeURIComponent(shipRoute[1]!));
        if (!spec) return json(res, 404, { error: 'La wiki no tiene ficha de esta nave' });
        // Alternativas para cada componente principal que lleva de serie, por tamaño.
        const slots = new Map<string, { type: ComponentType; size: number; stock: string[] }>();
        for (const s of spec.stock) {
          if (!(s.type in COMPONENT_LABEL) || s.size === null) continue;
          const key = `${s.type}-${s.size}`;
          const slot = slots.get(key) ?? { type: s.type as ComponentType, size: s.size, stock: [] };
          slot.stock.push(s.name);
          slots.set(key, slot);
        }
        const upgrades = await Promise.all(
          [...slots.values()].map(async (s) => ({
            type: s.type,
            label: COMPONENT_LABEL[s.type],
            size: s.size,
            stock: s.stock,
            options: (await catalog.upgrades(s.type, s.size)).slice(0, 8),
          })),
        );
        return json(res, 200, { spec, upgrades });
      }

      if (path === '/api/contacts') {
        return json(res, 200, listContacts(store, tailer.status().sessionId));
      }

      if (path === '/api/controls') {
        try {
          return json(res, 200, { available: keys.available, catalog: bindings.get() });
        } catch (err) {
          return json(res, 200, { available: false, error: (err as Error).message, catalog: null });
        }
      }

      if (path === '/api/controls/focus') {
        const fg = await keys.foreground();
        return json(res, 200, { foreground: fg, focused: fg === 'StarCitizen' });
      }

      if (path === '/api/controls/send') {
        if (req.method !== 'POST') return json(res, 405, { error: 'Usa POST' });
        if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Se esperaba JSON' });
        const body = (await readJson(req)) as { id?: unknown; phase?: unknown; confirm?: unknown } | null;
        const id = typeof body?.id === 'string' ? body.id : '';
        const phase = body?.phase === 'down' || body?.phase === 'up' ? body.phase : 'tap';
        // Soltar siempre se permite, aunque la acción haya desaparecido del catálogo.
        if (phase === 'up') return json(res, 200, await keys.up(id));
        const action = bindings.find(id);
        if (!action) return json(res, 404, { ok: false, reason: 'unbound', message: 'Esa acción no existe en tus controles.' });
        if (!action.keys || !action.sendable) {
          return json(res, 200, {
            ok: false,
            reason: 'unbound',
            message: action.keys
              ? 'Esta acción usa el ratón o un eje: la botonera solo puede enviar teclado.'
              : 'Esta acción no tiene tecla asignada. Asígnale una en Opciones → Controles del juego.',
          });
        }
        if (DANGEROUS.has(action.name) && body?.confirm !== true) {
          return json(res, 409, { ok: false, reason: 'confirm', message: 'Confirma la acción antes de enviarla.' });
        }
        const result = phase === 'down' ? await keys.down(id, action.keys) : await keys.tap(action.keys, action.plan);
        return json(res, 200, result);
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
        clients.set(res, { remote: !isLoopback(req), since: new Date().toISOString(), agent: deviceName(req.headers['user-agent']) });
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

/** Nombre corto del dispositivo a partir del user agent, para "iPad conectado". */
function deviceName(ua: string | undefined): string {
  const s = ua ?? '';
  if (/iPhone/.test(s)) return 'iPhone';
  if (/iPad/.test(s)) return 'iPad';
  if (/Android/.test(s)) return /Mobile/.test(s) ? 'Móvil Android' : 'Tablet Android';
  // Safari de iPadOS se presenta como un Mac: desde la red local, casi seguro que es el iPad.
  if (/Macintosh/.test(s) && /Safari/.test(s) && !/Chrome|Edg|Firefox/.test(s)) return 'iPad';
  return 'Navegador';
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
  send(res, status, MIME['.html']!, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CommandGlass</title>
<style>body{background:#071216;color:#cfe9ee;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center}a{color:#6fe3f0}code{color:#6fe3f0}</style>${body}`);
}

function serveStatic(res: ServerResponse, path: string) {
  if (!existsSync(join(CLIENT_DIST, 'index.html'))) {
    return html(res, 503, '<div><h1>CommandGlass</h1><p>Falta compilar la interfaz: ejecuta <code>npm run build</code>.</p></div>');
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
    name: 'CommandGlass',
    short_name: 'CommandGlass',
    description: 'Tu mobiGlas inteligente para Star Citizen',
    start_url: `/?k=${key}`,
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#060a10',
    theme_color: '#060a10',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}

function unauthorizedPage(): string {
  return `<div><h1>CommandGlass</h1><p>Este dispositivo aún no está emparejado.</p>
<p>En el PC abre <code>http://localhost:8777/pair</code> y escanea el código QR con el iPad.</p></div>`;
}

function pairPage(svg: string, url: string): string {
  return `<div><h1>Empareja tu iPad</h1>
<p>Escanea este código con la cámara del iPad y ábrelo en Safari.</p>
<div style="background:#fff;padding:16px;border-radius:12px;display:inline-block">${svg}</div>
<p style="font-size:13px;opacity:.7">${url}</p>
<p>Después, en Safari: <b>Compartir → Añadir a pantalla de inicio</b>.</p></div>`;
}
