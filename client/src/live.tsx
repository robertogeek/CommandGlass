import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { GameEvent, Snapshot } from './types.ts';

interface Live {
  snapshot: Snapshot | null;
  /** Eventos recibidos en directo desde que se abrió la app (más reciente primero). */
  liveEvents: GameEvent[];
  connected: boolean;
}

const LiveContext = createContext<Live>({ snapshot: null, liveEvents: [], connected: false });

export function LiveProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [liveEvents, setLiveEvents] = useState<GameEvent[]>([]);
  const [connected, setConnected] = useState(false);

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
    return () => es.close();
  }, []);

  return <LiveContext.Provider value={{ snapshot, liveEvents, connected }}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

/** Une eventos sin duplicados, del más reciente al más antiguo. */
export function mergeEvents(a: GameEvent[], b: GameEvent[]): GameEvent[] {
  const seen = new Set<number>();
  return [...a, ...b]
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((x, y) => y.id - x.id);
}
