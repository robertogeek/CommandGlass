import { Coins, Pickaxe, Receipt, ShoppingBag, Store, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ago, hhmm, n, shortDay } from '../format.ts';
import { getJson, postJson, useLive } from '../live.tsx';
import { Mercado } from '../components/Mercado.tsx';

/**
 * Comercio: cartera estimada (el juego ya no escribe el saldo en el registro), en qué gastas y tus últimas compras.
 */

interface EconomyResponse {
  wallet: { base: { amount: number; at: string } | null; rewardsSince: number; spentSince: number; estimate: number | null };
  totals: { spent: number; rewards: number; purchases: number };
  byKind: { key: string; spent: number; count: number }[];
  byShop: { key: string; spent: number; count: number }[];
  recent: { ts: string; item: string; name: string; quantity: number; price: number; shopName: string; kind: string }[];
  rewards: { ts: string; amount: number }[];
}

export function Comercio() {
  const { liveEvents } = useLive();
  const [data, setData] = useState<EconomyResponse | null>(null);
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  const [refinery, setRefinery] = useState<{ ts: string; station: string; orders: number }[]>([]);
  const load = () => {
    getJson<EconomyResponse>('/api/economy').then(setData).catch(() => setData(null));
    getJson<{ refinery: { ts: string; station: string; orders: number }[] }>('/api/combat').then((c) => setRefinery(c.refinery)).catch(() => {});
  };
  const lastEconomy = liveEvents.find((e) => e.category === 'economy')?.id ?? 0;
  useEffect(() => {
    load();
  }, [lastEconomy]);

  const save = async () => {
    const value = Number(amount.replace(/[.\s]/g, '').replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) {
      setStatus('error');
      return;
    }
    setStatus('saving');
    try {
      await postJson('/api/economy/wallet', { amount: value });
      setAmount('');
      setStatus('idle');
      load();
    } catch {
      setStatus('error');
    }
  };

  if (!data) return <div className="panel"><div className="empty">Cargando comercio…</div></div>;
  const w = data.wallet;
  const maxKind = Math.max(1, ...data.byKind.map((k) => k.spent));

  return (
    <div className="stack">
      <Mercado />
      <div className="grid g2">
        <section className="panel" aria-label="Cartera">
          <div className="label"><Wallet size={14} aria-hidden /> Cartera estimada</div>
          {w.estimate !== null && w.base ? (
            <>
              <div className="big wallet-big">≈ {n(w.estimate)} <small>aUEC</small></div>
              <div className="sub">
                Indicaste {n(w.base.amount)} aUEC {ago(w.base.at)} · desde entonces +{n(w.rewardsSince)} en recompensas y −{n(w.spentSince)} en compras.
              </div>
            </>
          ) : (
            <div className="sub">El juego ya no escribe tu saldo en el registro. Indícalo una vez (lo ves en el mobiGlas) y CommandGlass lo irá actualizando con tus recompensas y compras.</div>
          )}
          <form
            className="wallet-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="note-label" htmlFor="wallet-amount">Tu saldo ahora</label>
            <div className="toolbar">
              <input
                id="wallet-amount"
                className="search"
                inputMode="numeric"
                placeholder="Por ejemplo: 1.250.000"
                value={amount}
                onChange={(e) => (setAmount(e.target.value), setStatus('idle'))}
                aria-invalid={status === 'error'}
              />
              <button className="chip on" type="submit" disabled={!amount.trim() || status === 'saving'}>
                {status === 'saving' ? 'Guardando…' : 'Guardar saldo'}
              </button>
            </div>
            {status === 'error' && <div className="pad-msg err" role="alert">Escribe solo la cifra en aUEC, sin letras. Por ejemplo: 1250000.</div>}
          </form>
          <p className="faint kind-note">Es una estimación: las ventas de mercancía, los alquileres y las transferencias entre jugadores no aparecen en el registro. Actualiza el saldo de vez en cuando para que no se desvíe.</p>
        </section>

        <section className="panel" aria-label="Totales">
          <div className="label"><Coins size={14} aria-hidden /> Desde que hay registro</div>
          <div className="stat-grid">
            <div className="stat bad"><div className="v">{n(data.totals.spent)}</div><div className="k">aUEC gastados</div></div>
            <div className="stat good"><div className="v">{n(data.totals.rewards)}</div><div className="k">aUEC en recompensas</div></div>
            <div className="stat"><div className="v">{n(data.totals.purchases)}</div><div className="k">compras</div></div>
          </div>
          <h3 className="brief-h"><ShoppingBag size={14} aria-hidden /> En qué gastas</h3>
          {data.byKind.map((k) => (
            <div key={k.key} className="kind-row static">
              <span className="kind-name">{k.key}</span>
              <span className="kind-bar" aria-hidden><span className="bad" style={{ width: `${(100 * k.spent) / maxKind}%` }} /></span>
              <span className="kind-num">{n(k.spent)}</span>
            </div>
          ))}
        </section>
      </div>

      <div className="grid g2">
        <section className="panel" aria-label="Últimas compras">
          <div className="label"><Receipt size={14} aria-hidden /> Últimas compras</div>
          {data.recent.length === 0 && <div className="empty">Aún no hay compras registradas.</div>}
          {data.recent.slice(0, 30).map((p, i) => (
            <div key={i} className="kv">
              <span>
                {p.name}{p.quantity > 1 ? ` ×${p.quantity}` : ''}
                <span className="faint"> · {p.shopName}</span>
              </span>
              <span className="faint">{n(p.price)} aUEC · {shortDay(p.ts)} {hhmm(p.ts)}</span>
            </div>
          ))}
        </section>

        <div className="stack">
          <section className="panel" aria-label="Tiendas">
            <div className="label"><Store size={14} aria-hidden /> Dónde más compras</div>
            {data.byShop.map((s) => (
              <div key={s.key} className="kv">
                <span>{s.key}</span>
                <span className="faint">{s.count} compras · {n(s.spent)} aUEC</span>
              </div>
            ))}
          </section>
          <section className="panel" aria-label="Refinería">
            <div className="label"><Pickaxe size={14} aria-hidden /> Refinería</div>
            {refinery.length === 0 ? (
              <div className="empty">Ninguna orden de refinería terminada todavía. Te avisaré en el tablet cuando una esté lista.</div>
            ) : (
              refinery.slice(0, 10).map((r, i) => (
                <div key={i} className="kv">
                  <span>{r.station}{r.orders > 1 ? ` · ${r.orders} órdenes` : ''}</span>
                  <span className="faint">{shortDay(r.ts)} {hhmm(r.ts)}</span>
                </div>
              ))
            )}
            <p className="faint kind-note">El juego solo apunta cuándo termina una orden, no cuándo la empiezas: por eso no hay cuenta atrás.</p>
          </section>
          <section className="panel" aria-label="Recompensas">
            <div className="label"><Coins size={14} aria-hidden /> Últimas recompensas</div>
            {data.rewards.length === 0 && <div className="empty">Sin recompensas en aUEC registradas.</div>}
            {data.rewards.slice(0, 12).map((r, i) => (
              <div key={i} className="kv">
                <span className="desk-ok">+{n(r.amount)} aUEC</span>
                <span className="faint">{shortDay(r.ts)} {hhmm(r.ts)}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
