/**
 * El tablet le cuenta al PC con qué navegador y pantalla se conecta, y los errores de la interfaz.
 * Queda en el registro de CommandGlass del PC y en el informe de diagnóstico; no sale de tu red.
 */

let sent = 0;
const seen = new Set<string>();

function post(kind: 'hello' | 'error', message: string, detail?: string) {
  if (sent >= 20) return;
  const key = `${kind}:${message}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent++;
  void fetch('/api/client-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, message, detail }),
    keepalive: true,
  }).catch(() => {
    /* sin conexión con el PC: nada que hacer */
  });
}

export function reportClientError(message: string, detail?: string) {
  post('error', message, detail);
}

export function startClientLog(app: string) {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  const hello = [
    app,
    navigator.userAgent,
    `pantalla ${screen.width}×${screen.height} @${window.devicePixelRatio}x`,
    `ventana ${window.innerWidth}×${window.innerHeight}`,
    standalone ? 'pantalla de inicio' : 'navegador',
    `idioma ${navigator.language}`,
  ].join(' · ');
  post('hello', hello);
  window.addEventListener('error', (e) => {
    const where = e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno}:${e.colno})` : '';
    reportClientError(`${e.message || 'Error'}${where}`, e.error instanceof Error ? e.error.stack : undefined);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as unknown;
    reportClientError(`Promesa rechazada: ${r instanceof Error ? r.message : String(r)}`, r instanceof Error ? r.stack : undefined);
  });
}
