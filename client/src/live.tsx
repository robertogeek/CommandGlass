import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { GameEvent, Snapshot } from './types.ts';

export interface Alert {
  id: string;
  ts: string;
  level: 'info' | 'warn' | 'danger' | 'good';
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
}

interface Live {
  snapshot: Snapshot | null;
  /** Eventos recibidos en directo desde que se abrió la app (más reciente primero). */
  liveEvents: GameEvent[];
  /** Alertas recibidas en directo (más reciente primero). */
  alerts: Alert[];
  connected: boolean;
}

const LiveContext = createContext<Live>({ snapshot: null, liveEvents: [], alerts: [], connected: false });

export function LiveProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [liveEvents, setLiveEvents] = useState<GameEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener('state', (e) => setSnapshot(JSON.parse((e as MessageEvent).data)));
    es.addEventListener('status', (e) => {
      const status = JSON.parse((e as MessageEvent).data);
      setSnapshot((s) => (s ? { ...s, status } : s));
    });
    es.addEventListener('events', (e) => {
      const incoming = (JSON.parse((e as MessageEvent).data) as GameEvent[]).reverse();
      setLiveEvents((prev) => [...incoming, ...prev].slice(0, 300));
    });
    es.addEventListener('alerts', (e) => {
      const incoming = (JSON.parse((e as MessageEvent).data) as Alert[]).reverse();
      setAlerts((prev) => [...incoming, ...prev].slice(0, 50));
    });
    return () => es.close();
  }, []);

  return <LiveContext.Provider value={{ snapshot, liveEvents, alerts, connected }}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // El servidor explica el problema en "error" (para mostrarlo tal cual).
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `${res.status} ${url}`);
  }
  return (await res.json()) as T;
}

/** Une eventos sin duplicados, del más reciente al más antiguo. */
export function mergeEvents(a: GameEvent[], b: GameEvent[]): GameEvent[] {
  const seen = new Set<number>();
  return [...a, ...b]
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((x, y) => y.id - x.id);
}
