import { Coins, Pickaxe, Receipt, ShoppingBag, Store, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ago, hhmm, n, shortDay } from '../format.ts';
import { useLang } from '../lang.tsx';
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
  const { t, lang } = useLang();
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
    // Separador de miles: punto en español ("1.250.000"), coma en inglés ("1,250,000").
    const value = Number(lang === 'es' ? amount.replace(/[.\s]/g, '').replace(',', '.') : amount.replace(/[,\s]/g, ''));
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

  if (!data) return <div className="panel"><div className="empty">{t('Cargando comercio…', 'Loading trade…')}</div></div>;
  const w = data.wallet;
  const maxKind = Math.max(1, ...data.byKind.map((k) => k.spent));

  return (
    <div className="stack">
      <Mercado />
      <div className="grid g2">
        <section className="panel" aria-label={t('Cartera', 'Wallet')}>
          <div className="label"><Wallet size={14} aria-hidden /> {t('Cartera estimada', 'Estimated Wallet')}</div>
          {w.estimate !== null && w.base ? (
            <>
              <div className="big wallet-big">≈ {n(w.estimate)} <small>aUEC</small></div>
              <div className="sub">
                {t(
                  `Indicaste ${n(w.base.amount)} aUEC ${ago(w.base.at)} · desde entonces +${n(w.rewardsSince)} en recompensas y −${n(w.spentSince)} en compras.`,
                  `You entered ${n(w.base.amount)} aUEC ${ago(w.base.at)} · since then +${n(w.rewardsSince)} in rewards and −${n(w.spentSince)} in purchases.`,
                )}
              </div>
            </>
          ) : (
            <div className="sub">
              {t(
                'El juego ya no escribe tu saldo en el registro. Indícalo una vez (lo ves en el mobiGlas) y CommandGlass lo irá actualizando con tus recompensas y compras.',
                "The game no longer writes your balance to the log. Enter it once (you can see it in your mobiGlas) and CommandGlass will keep it updated with your rewards and purchases.",
              )}
            </div>
          )}
          <form
            className="wallet-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <label className="note-label" htmlFor="wallet-amount">{t('Tu saldo ahora', 'Your current balance')}</label>
            <div className="toolbar">
              <input
                id="wallet-amount"
                className="search"
                inputMode="numeric"
                placeholder={t('Por ejemplo: 1.250.000', 'For example: 1,250,000')}
                value={amount}
                onChange={(e) => (setAmount(e.target.value), setStatus('idle'))}
                aria-invalid={status === 'error'}
              />
              <button className="chip on" type="submit" disabled={!amount.trim() || status === 'saving'}>
                {status === 'saving' ? t('Guardando…', 'Saving…') : t('Guardar saldo', 'Save balance')}
              </button>
            </div>
            {status === 'error' && (
              <div className="pad-msg err" role="alert">
                {t('Escribe solo la cifra en aUEC, sin letras. Por ejemplo: 1250000.', 'Enter just the aUEC amount, no letters. For example: 1250000.')}
              </div>
            )}
          </form>
          <p className="faint kind-note">
            {t(
              'Es una estimación: las ventas de mercancía, los alquileres y las transferencias entre jugadores no aparecen en el registro. Actualiza el saldo de vez en cuando para que no se desvíe.',
              "It's an estimate: commodity sales, rentals and player-to-player transfers don't show up in the log. Update your balance now and then so it doesn't drift.",
            )}
          </p>
        </section>

        <section className="panel" aria-label={t('Totales', 'Totals')}>
          <div className="label"><Coins size={14} aria-hidden /> {t('Desde que hay registro', 'Since logging began')}</div>
          <div className="stat-grid">
            <div className="stat bad"><div className="v">{n(data.totals.spent)}</div><div className="k">{t('aUEC gastados', 'aUEC spent')}</div></div>
            <div className="stat good"><div className="v">{n(data.totals.rewards)}</div><div className="k">{t('aUEC en recompensas', 'aUEC in rewards')}</div></div>
            <div className="stat">
              <div className="v">{n(data.totals.purchases)}</div>
              <div className="k">{t('compras', data.totals.purchases === 1 ? 'purchase' : 'purchases')}</div>
            </div>
          </div>
          <h3 className="brief-h"><ShoppingBag size={14} aria-hidden /> {t('En qué gastas', 'What you spend on')}</h3>
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
        <section className="panel" aria-label={t('Últimas compras', 'Recent purchases')}>
          <div className="label"><Receipt size={14} aria-hidden /> {t('Últimas compras', 'Recent Purchases')}</div>
          {data.recent.length === 0 && <div className="empty">{t('Aún no hay compras registradas.', 'No purchases logged yet.')}</div>}
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
          <section className="panel" aria-label={t('Tiendas', 'Shops')}>
            <div className="label"><Store size={14} aria-hidden /> {t('Dónde más compras', 'Where you shop most')}</div>
            {data.byShop.map((s) => (
              <div key={s.key} className="kv">
                <span>{s.key}</span>
                <span className="faint">
                  {t(`${s.count} compras`, `${n(s.count)} ${s.count === 1 ? 'purchase' : 'purchases'}`)} · {n(s.spent)} aUEC
                </span>
              </div>
            ))}
          </section>
          <section className="panel" aria-label={t('Refinería', 'Refinery')}>
            <div className="label"><Pickaxe size={14} aria-hidden /> {t('Refinería', 'Refinery')}</div>
            {refinery.length === 0 ? (
              <div className="empty">
                {t(
                  'Ninguna orden de refinería terminada todavía. Te avisaré en el tablet cuando una esté lista.',
                  "No refinery jobs finished yet. I'll let you know on the tablet when one is ready.",
                )}
              </div>
            ) : (
              refinery.slice(0, 10).map((r, i) => (
                <div key={i} className="kv">
                  <span>{r.station}{r.orders > 1 ? ` · ${t(`${r.orders} órdenes`, `${r.orders} jobs`)}` : ''}</span>
                  <span className="faint">{shortDay(r.ts)} {hhmm(r.ts)}</span>
                </div>
              ))
            )}
            <p className="faint kind-note">
              {t(
                'El juego solo apunta cuándo termina una orden, no cuándo la empiezas: por eso no hay cuenta atrás.',
                "The game only logs when a job finishes, not when you start it, so there's no countdown.",
              )}
            </p>
          </section>
          <section className="panel" aria-label={t('Recompensas', 'Rewards')}>
            <div className="label"><Coins size={14} aria-hidden /> {t('Últimas recompensas', 'Recent Rewards')}</div>
            {data.rewards.length === 0 && <div className="empty">{t('Sin recompensas en aUEC registradas.', 'No aUEC rewards logged.')}</div>}
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
