import { ArrowRight, KeyRound, MapPin, Route as RouteIcon, Search, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { n } from '../format.ts';
import { getJson, postJson, useLive } from '../live.tsx';

/**
 * Mercado: precios de mercancías de UEX (uexcorp.space), que reportan los propios jugadores.
 * Lo que se compra y vende donde estás, las mejores rutas para tu nave y dónde comprar o vender cada mercancía.
 */

interface Route {
  commodity: string;
  commodityId: number;
  illegal: boolean;
  from: { id: number; name: string; system: string | null };
  to: { id: number; name: string; system: string | null };
  buy: number;
  sell: number;
  scu: number;
  investment: number;
  profit: number;
  updated: string;
}

interface TradeResponse {
  configured: boolean;
  channel: string;
  error?: string | null;
  fetchedAt?: string | null;
  place?: { name: string; system: string | null; since: string; live: boolean } | null;
  terminals?: { id: number; name: string }[];
  here?: { commodity: string; commodityId: number; illegal: boolean; terminal: string; buy: number; sell: number; scuBuy: number; updated: string }[];
  ship?: { name: string; uex: string | null; scu: number | null } | null;
  scu?: number;
  wallet?: number | null;
  routesHere?: Route[];
  routesSystem?: Route[];
  commodities?: { id: number; name: string }[];
}

interface CommodityResponse {
  name: string | null;
  buy: { terminal: string; system: string | null; body: string | null; buy: number; scuBuy: number; updated: string }[];
  sell: { terminal: string; system: string | null; body: string | null; sell: number; updated: string }[];
}

/** "hace 3 h", "hace 2 días": los precios los reportan jugadores y envejecen. */
function age(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}

const Credit = () => (
  <p className="faint kind-note">
    Precios de <a href="https://uexcorp.space" target="_blank" rel="noreferrer">UEX</a>, que reportan los propios jugadores: pueden no estar al día.
    Se renuevan cada 20 minutos.
  </p>
);

function TokenForm({ onSaved }: { onSaved: () => void }) {
  const [token, setToken] = useState('');
  const [state, setState] = useState<{ k: 'idle' | 'saving' | 'error'; msg?: string }>({ k: 'idle' });
  const save = async (value: string) => {
    setState({ k: 'saving' });
    try {
      await postJson('/api/trade/token', { token: value });
      setToken('');
      setState({ k: 'idle' });
      onSaved();
    } catch (err) {
      setState({ k: 'error', msg: (err as Error).message });
    }
  };
  return (
    <form
      className="wallet-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save(token);
      }}
    >
      <label className="note-label" htmlFor="uex-token">Token de UEX</label>
      <div className="toolbar">
        <input
          id="uex-token"
          className="search plain"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="Pega aquí tu token"
          value={token}
          onChange={(e) => (setToken(e.target.value), setState({ k: 'idle' }))}
          aria-invalid={state.k === 'error'}
        />
        <button className="chip on" type="submit" disabled={!token.trim() || state.k === 'saving'}>
          {state.k === 'saving' ? 'Comprobando…' : 'Guardar token'}
        </button>
      </div>
      {state.k === 'error' && <div className="pad-msg err" role="alert">{state.msg}</div>}
    </form>
  );
}

function RouteRow({ r, showFrom }: { r: Route; showFrom: boolean }) {
  return (
    <div className="route-row">
      <div className="route-main">
        <strong>{r.commodity}</strong>
        {r.illegal && <span className="badge red">Ilegal</span>}
        <div className="route-path faint">
          {showFrom && <>{r.from.name} <ArrowRight size={12} aria-label="a" /> </>}
          {r.to.name}
        </div>
        <div className="faint route-meta">
          {n(r.scu)} SCU · compra {n(r.buy)} · venta {n(r.sell)} · inviertes {n(r.investment)} · {age(r.updated)}
        </div>
      </div>
      <div className="route-profit desk-ok">+{n(r.profit)}<small> aUEC</small></div>
    </div>
  );
}

export function Mercado() {
  const { snapshot } = useLive();
  const [data, setData] = useState<TradeResponse | null>(null);
  const [scu, setScu] = useState('');
  const [useWallet, setUseWallet] = useState(false);
  const [illegal, setIllegal] = useState(false);
  const [editToken, setEditToken] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [commodity, setCommodity] = useState<CommodityResponse | null>(null);

  const locCode = snapshot?.state?.location?.code ?? '';
  const shipName = snapshot?.state?.ship?.name ?? '';
  const load = () => {
    const qs = new URLSearchParams();
    if (Number(scu) > 0) qs.set('scu', String(Number(scu)));
    if (useWallet) qs.set('budget', 'wallet');
    if (illegal) qs.set('illegal', '1');
    getJson<TradeResponse>(`/api/trade?${qs}`).then(setData).catch(() => setData(null));
  };
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [scu, useWallet, illegal, locCode, shipName]);

  useEffect(() => {
    if (picked === null) return setCommodity(null);
    getJson<CommodityResponse>(`/api/trade/commodity/${picked}`).then(setCommodity).catch(() => setCommodity(null));
  }, [picked]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !data?.commodities) return [];
    return data.commodities.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 12);
  }, [query, data?.commodities]);

  if (!data) return <section className="panel"><div className="empty">Cargando mercado…</div></section>;

  if (!data.configured) {
    return (
      <section className="panel" aria-label="Mercado">
        <div className="label"><TrendingUp size={14} aria-hidden /> Mercado</div>
        <div className="sub">
          Falta tu token de UEX, que se pide al configurar CommandGlass en el PC. Con él verás qué se compra y vende donde estás, las
          mejores rutas para la nave que llevas y dónde comprar o vender cada mercancía.
        </div>
        <ol className="steps">
          <li>Entra en <a href="https://uexcorp.space" target="_blank" rel="noreferrer">uexcorp.space</a> con tu cuenta (o créala).</li>
          <li>Ve a <strong>My Apps</strong>, crea una aplicación y copia su token.</li>
          <li>Pégalo aquí. Se guarda solo en tu PC.</li>
        </ol>
        <TokenForm onSaved={load} />
      </section>
    );
  }

  const allBuys = data.here?.filter((p) => p.buy > 0) ?? [];
  const allSells = data.here?.filter((p) => p.sell > 0) ?? [];
  const LIST = 8;
  const buys = showAll ? allBuys : allBuys.slice(0, LIST);
  const sells = showAll ? allSells : allSells.slice(0, LIST);
  const hidden = allBuys.length + allSells.length - buys.length - sells.length;
  const shipScu = data.ship?.scu ?? null;
  // En "En el sistema" no se repiten las que ya salen en "Desde aquí".
  const hereIds = new Set(data.terminals?.map((t) => t.id));
  const systemRoutes = (data.routesSystem ?? []).filter((r) => !hereIds.has(r.from.id));

  return (
    <div className="stack">
      {data.channel !== 'LIVE' && (
        <div className="pad-msg">Estás en {data.channel}: los precios de UEX son los de LIVE.</div>
      )}
      {data.error && <div className="pad-msg err" role="alert">{data.error}</div>}

      <div className="grid g2">
        <section className="panel" aria-label="Mercado aquí">
          <div className="label"><MapPin size={14} aria-hidden /> {data.place ? `Mercado en ${data.place.name}` : 'Mercado aquí'}</div>
          {!data.place && <div className="empty">Aún no sé dónde estás. En cuanto el juego lo registre, verás aquí los precios del sitio.</div>}
          {data.place && !data.terminals?.length && (
            <div className="empty">UEX no tiene una terminal de mercancías en {data.place.name}.</div>
          )}
          {data.place && !data.place.live && data.terminals?.length ? (
            <div className="faint kind-note">Último sitio registrado (el juego no está abierto).</div>
          ) : null}
          {buys.length > 0 && (
            <>
              <h3 className="brief-h">Puedes comprar</h3>
              {buys.map((p, i) => (
                <div key={`b${i}`} className="kv">
                  <span>
                    <button className="link-btn" onClick={() => (setPicked(p.commodityId), setQuery(p.commodity))}>{p.commodity}</button>
                    {p.illegal && <span className="badge red sheet-badge">Ilegal</span>}
                    {(data.terminals?.length ?? 0) > 1 && <span className="faint"> · {p.terminal}</span>}
                  </span>
                  <span className="faint">{n(p.buy)} /SCU{p.scuBuy ? ` · ${n(p.scuBuy)} SCU` : ''} · {age(p.updated)}</span>
                </div>
              ))}
            </>
          )}
          {sells.length > 0 && (
            <>
              <h3 className="brief-h">Puedes vender</h3>
              {sells.map((p, i) => (
                <div key={`s${i}`} className="kv">
                  <span>
                    <button className="link-btn" onClick={() => (setPicked(p.commodityId), setQuery(p.commodity))}>{p.commodity}</button>
                    {p.illegal && <span className="badge red sheet-badge">Ilegal</span>}
                    {(data.terminals?.length ?? 0) > 1 && <span className="faint"> · {p.terminal}</span>}
                  </span>
                  <span className="faint">{n(p.sell)} /SCU · {age(p.updated)}</span>
                </div>
              ))}
            </>
          )}
          {(hidden > 0 || showAll) && (
            <div className="toolbar list-more">
              <button className="chip" type="button" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
                {showAll ? 'Ver menos' : `Ver las ${allBuys.length + allSells.length} mercancías`}
              </button>
            </div>
          )}
        </section>

        <section className="panel" aria-label="Rutas de comercio">
          <div className="label"><RouteIcon size={14} aria-hidden /> Mejores rutas</div>
          <div className="sub">
            {data.ship
              ? shipScu
                ? <>Con la <strong>{data.ship.name}</strong>: {n(shipScu)} SCU de carga.</>
                : <>No sé cuánta carga lleva la {data.ship.name}: indícalo abajo.</>
              : 'Indica cuánta carga llevas para calcular las rutas.'}
          </div>
          <div className="toolbar route-opts">
            <label className="note-label" htmlFor="route-scu">SCU</label>
            <input
              id="route-scu"
              className="search plain scu-input"
              inputMode="numeric"
              placeholder={shipScu ? String(shipScu) : 'Por ejemplo: 46'}
              value={scu}
              onChange={(e) => setScu(e.target.value.replace(/\D/g, ''))}
            />
            <button type="button" className={`chip ${useWallet ? 'on' : ''}`} aria-pressed={useWallet} onClick={() => setUseWallet(!useWallet)} disabled={data.wallet == null}>
              {data.wallet != null ? `Con mi cartera (${n(data.wallet)})` : 'Con mi cartera'}
            </button>
            <button type="button" className={`chip ${illegal ? 'on' : ''}`} aria-pressed={illegal} onClick={() => setIllegal(!illegal)}>
              Incluir ilegales
            </button>
          </div>
          {!data.scu && <div className="empty">Indica los SCU de tu nave para ver rutas.</div>}
          {!!data.scu && (data.routesHere?.length ?? 0) > 0 && (
            <>
              <h3 className="brief-h">Desde aquí</h3>
              {data.routesHere!.slice(0, 5).map((r, i) => <RouteRow key={`h${i}`} r={r} showFrom={(data.terminals?.length ?? 0) > 1} />)}
            </>
          )}
          {!!data.scu && systemRoutes.length > 0 && (
            <>
              <h3 className="brief-h">{data.routesHere?.length ? 'Desde otros sitios de' : 'En'} {data.place?.system ?? 'el sistema'}</h3>
              {systemRoutes.slice(0, 5).map((r, i) => <RouteRow key={`s${i}`} r={r} showFrom />)}
            </>
          )}
          {!!data.scu && !data.routesHere?.length && !data.routesSystem?.length && (
            <div className="empty">No hay rutas con beneficio con estos datos.</div>
          )}
          <p className="faint kind-note">Sin contar el viaje: mira la distancia antes de cargar. Rutas dentro del mismo sistema.</p>
        </section>
      </div>

      <section className="panel" aria-label="Buscar mercancía">
        <div className="label"><Search size={14} aria-hidden /> Dónde comprar o vender</div>
        <div className="toolbar">
          <div className="search-wrap">
            <Search size={16} aria-hidden />
            <input
              className="search"
              placeholder="Busca una mercancía: Laranite, Quantanium, Agricium…"
              value={query}
              onChange={(e) => (setQuery(e.target.value), setPicked(null))}
              aria-label="Mercancía"
            />
          </div>
        </div>
        {picked === null && matches.length > 0 && (
          <div className="toolbar">
            {matches.map((c) => (
              <button key={c.id} className="chip" type="button" onClick={() => (setPicked(c.id), setQuery(c.name))}>{c.name}</button>
            ))}
          </div>
        )}
        {picked === null && query.trim() && matches.length === 0 && <div className="empty">UEX no tiene precios de «{query.trim()}».</div>}
        {commodity && (
          <div className="grid g2">
            <div>
              <h3 className="brief-h">Más barato para comprar</h3>
              {commodity.buy.length === 0 && <div className="empty">Nadie la vende.</div>}
              {commodity.buy.map((r, i) => (
                <div key={i} className="kv">
                  <span>{r.terminal}<span className="faint"> · {r.system}</span></span>
                  <span className="faint">{n(r.buy)} /SCU · {age(r.updated)}</span>
                </div>
              ))}
            </div>
            <div>
              <h3 className="brief-h">Mejor para vender</h3>
              {commodity.sell.length === 0 && <div className="empty">Nadie la compra.</div>}
              {commodity.sell.map((r, i) => (
                <div key={i} className="kv">
                  <span>{r.terminal}<span className="faint"> · {r.system}</span></span>
                  <span className="faint">{n(r.sell)} /SCU · {age(r.updated)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <Credit />
        <div className="toolbar">
          <button className="chip" type="button" onClick={() => setEditToken(!editToken)} aria-expanded={editToken}>
            <KeyRound size={14} aria-hidden /> {editToken ? 'Cerrar' : 'Cambiar token de UEX'}
          </button>
        </div>
        {editToken && <TokenForm onSaved={() => (setEditToken(false), load())} />}
      </section>
    </div>
  );
}
