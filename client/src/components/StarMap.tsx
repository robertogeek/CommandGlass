import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLang } from '../lang.tsx';

/**
 * Starmap con las posiciones reales del juego, vistas desde arriba. Los ángulos son los del juego; las
 * distancias se comprimen (raíz en el sistema, logaritmo alrededor de un planeta) para que quepa todo.
 * Se puede mover y hacer zoom con el dedo, la rueda o los botones.
 */

export type Kind = 'star' | 'planet' | 'moon' | 'city' | 'station' | 'gateway' | 'outpost' | 'asteroid' | 'poi';

export interface Body {
  id: string;
  name: string;
  kind: Kind;
  parent: string | null;
  x: number;
  y: number;
  radius?: number;
  hidden?: boolean;
}

export interface Belt {
  name: string | null;
  inner: number;
  outer: number;
}

export interface Sys {
  name: string;
  bodies: Body[];
  belts: Belt[];
}

export type Selection = { type: 'body'; id: string } | { type: 'belt'; name: string | null } | null;

interface Props {
  sys: Sys;
  focus: Body | null;
  selection: Selection;
  /** Visitas de cada objeto contando lo que tiene dentro (lunas, puestos…). */
  visits: Map<string, number>;
  beltVisits: Map<string | null, number>;
  /** Objeto donde estás ahora (puede estar dentro de otro). */
  hereId: string | null;
  hereBelt: string | null;
  /** Paradas de la última ruta en este sistema, por objeto. */
  routeIds: string[];
  onSelect(sel: Selection): void;
  onFocus(id: string): void;
}

const S = 1000;
const C = S / 2;
const R = 420;
const DISC = 150;

export function StarMap({ sys, focus, selection, visits, beltVisits, hereId, hereBelt, routeIds, onSelect, onFocus }: Props) {
  const { t } = useLang();
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  // Unidades del dibujo por píxel de pantalla: los símbolos y textos miden lo mismo en el iPad que en el PC.
  const [u, setU] = useState(1.5);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const side = Math.min(r.width, r.height || r.width);
      if (side > 0) setU(S / side);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const moved = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  // Al cambiar de sistema o de planeta, vista entera.
  useEffect(() => setView({ k: 1, tx: 0, ty: 0 }), [sys.name, focus?.id]);

  const byId = useMemo(() => new Map(sys.bodies.map((b) => [b.id, b])), [sys]);
  const star = sys.bodies.find((b) => b.kind === 'star') ?? null;
  const center = focus ?? star;
  const children = useMemo(() => {
    const m = new Map<string, Body[]>();
    for (const b of sys.bodies) if (b.parent) m.set(b.parent, [...(m.get(b.parent) ?? []), b]);
    return m;
  }, [sys]);

  const shown = useMemo(() => (center ? (children.get(center.id) ?? []) : []), [center, children]);
  const shownIds = useMemo(() => new Set([center?.id, ...shown.map((b) => b.id)]), [center, shown]);

  // Proyección: posición real (km) → punto del dibujo, antes del zoom.
  const project = useMemo(() => {
    const ox = center?.x ?? 0;
    const oy = center?.y ?? 0;
    const dists = shown.map((b) => Math.hypot(b.x - ox, b.y - oy));
    if (!focus) {
      const max = Math.max(1, ...dists, ...sys.belts.map((b) => b.outer));
      const f = (d: number) => R * Math.sqrt(d / max);
      return { f, at: (x: number, y: number) => polar(x - ox, y - oy, f) };
    }
    // Lo que está en la superficie se pinta sobre el disco, tal como se ve desde arriba; lo que orbita, fuera.
    const ref = Math.max(20, focus.radius ?? 100);
    const surf = ref * 1.1;
    const max = Math.max(surf * 3, ...dists);
    const gap = 26;
    const f = (d: number) =>
      d <= surf ? DISC * Math.min(1, d / ref) : DISC + gap + ((R - DISC - gap) * Math.log1p((d - surf) / ref)) / Math.log1p((max - surf) / ref);
    return { f, at: (x: number, y: number) => polar(x - ox, y - oy, f) };
  }, [center, focus, shown, sys.belts]);

  const scr = (p: { x: number; y: number }) => ({ x: C + (p.x - C) * view.k + view.tx, y: C + (p.y - C) * view.k + view.ty });
  const posOf = (b: Body) => (b.id === center?.id ? { x: C, y: C } : project.at(b.x, b.y));

  /** El objeto visible que contiene a otro (una luna para un puesto en ella, en la vista del sistema el planeta…). */
  const shownAncestor = (id: string | null): string | null => {
    let cur = id ? byId.get(id) : undefined;
    while (cur && !shownIds.has(cur.id)) cur = cur.parent ? byId.get(cur.parent) : undefined;
    return cur?.id ?? null;
  };

  // --- Gestos: arrastrar, pellizcar, rueda.
  const toSvg = (cx: number, cy: number) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return { x: cx, y: cy };
    const p = new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const zoomAt = (factor: number, p: { x: number; y: number }) =>
    setView((v) => {
      const k = clamp(v.k * factor, 0.6, 14);
      const relX = (p.x - C - v.tx) / v.k;
      const relY = (p.y - C - v.ty) / v.k;
      return { k, tx: p.x - C - relX * k, ty: p.y - C - relY * k };
    });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * 0.0015), toSvg(e.clientX, e.clientY));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, toSvg(e.clientX, e.clientY));
    if (pointers.current.size === 1) {
      moved.current = false;
      start.current = { x: e.clientX, y: e.clientY };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const now = toSvg(e.clientX, e.clientY);
    if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 6) {
      if (!moved.current) (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      moved.current = true;
    }
    if (!moved.current) return;
    if (pointers.current.size === 1) {
      setView((v) => ({ ...v, tx: v.tx + now.x - prev.x, ty: v.ty + now.y - prev.y }));
    } else if (pointers.current.size === 2) {
      const other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(now.x - other.x, now.y - other.y);
        if (before > 0) zoomAt(after / before, { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 });
      }
    }
    pointers.current.set(e.pointerId, now);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (!pointers.current.size) start.current = null;
  };

  const tap = (b: Body) => {
    if (moved.current) return;
    const has = (children.get(b.id)?.length ?? 0) > 0;
    const already = selection?.type === 'body' && selection.id === b.id;
    if (already && has && b.id !== center?.id) onFocus(b.id);
    else onSelect({ type: 'body', id: b.id });
  };

  const hereShown = shownAncestor(hereId);
  const selectedId = selection?.type === 'body' ? selection.id : null;

  // Ruta: paradas seguidas, cada una en el objeto visible que la contiene.
  const routePts: { x: number; y: number }[] = [];
  for (const id of routeIds) {
    const a = shownAncestor(id);
    const b = a ? byId.get(a) : undefined;
    if (!b) continue;
    const p = scr(posOf(b));
    const last = routePts.at(-1);
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.5) routePts.push(p);
  }

  const ringsFor = focus ? shown.filter((b) => b.kind === 'moon') : shown.filter((b) => b.kind === 'planet' || b.kind === 'moon');
  const order: Record<Kind, number> = { outpost: 0, poi: 1, asteroid: 2, station: 3, gateway: 4, city: 5, moon: 6, planet: 7, star: 8 };
  const drawn = [...shown].sort((a, b) => order[a.kind] - order[b.kind]);

  // Etiquetas: primero las importantes; las que chocan con otra ya puesta se ocultan hasta que acercas el zoom.
  const prio = (b: Body) => {
    const v = visits.get(b.id) ?? 0;
    if (b.id === selectedId) return 100;
    if (b.id === hereShown) return 90;
    const base = { planet: 80, gateway: 70, city: 65, moon: 60, station: 30, asteroid: 20, outpost: 10, poi: 10, star: 0 }[b.kind];
    return base + (v > 0 ? (base >= 60 ? 5 : 25) + Math.min(v, 40) / 10 : 0);
  };
  // Debajo del símbolo y, si no cabe, encima.
  const labels = new Map<string, 'below' | 'above'>();
  {
    const placed: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const b of [...shown].sort((a, c) => prio(c) - prio(a))) {
      const v = visits.get(b.id) ?? 0;
      const minor = b.kind === 'outpost' || b.kind === 'poi' || b.kind === 'asteroid';
      if (minor && !v && b.id !== selectedId && view.k < 3) continue;
      if (b.kind === 'station' && !v && b.id !== selectedId && !focus && view.k < 2) continue;
      const p = scr(posOf(b));
      const big = b.kind === 'planet' || b.kind === 'moon';
      const fs = (big ? 14 : 12.5) * u;
      const w = b.name.length * fs * 0.46;
      const sz = size(b.kind) * u;
      const fits = (y: number) => {
        const r = { x1: p.x - w / 2, y1: y - fs, x2: p.x + w / 2, y2: y + 3 * u };
        const off = r.x1 < 0 || r.x2 > S || r.y1 < 0 || r.y2 > S;
        return off || placed.some((o) => r.x1 < o.x2 && r.x2 > o.x1 && r.y1 < o.y2 && r.y2 > o.y1) ? null : r;
      };
      const below = fits(p.y + sz + 15 * u);
      const above = below ? null : fits(p.y - sz - 7 * u);
      const r = below ?? above ?? (b.id === selectedId ? { x1: 0, y1: 0, x2: 0, y2: 0 } : null);
      if (!r) continue;
      placed.push(r);
      labels.set(b.id, below || !above ? 'below' : 'above');
    }
  }

  return (
    <div className="sm-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${S} ${S}`}
        className="sm"
        style={{ ['--u' as string]: u }}
        role="img"
        aria-label={focus ? t(`Mapa de ${focus.name}`, `Map of ${focus.name}`) : t(`Mapa del sistema ${sys.name}`, `${sys.name} system map`)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => {
          if (e.target === svgRef.current && !moved.current) onSelect(null);
        }}
      >
        <defs>
          <radialGradient id="sm-star" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff6d8" />
            <stop offset="55%" stopColor="#f5c26b" />
            <stop offset="100%" stopColor="#f5c26b" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sm-body" cx="35%" cy="35%" r="75%">
            <stop offset="0%" stopColor="#2a4a66" />
            <stop offset="100%" stopColor="#0b1520" />
          </radialGradient>
        </defs>

        {/* Órbitas */}
        {ringsFor.map((b) => {
          const r = project.f(Math.hypot(b.x - (center?.x ?? 0), b.y - (center?.y ?? 0))) * view.k;
          return <circle key={`o-${b.id}`} cx={C + view.tx} cy={C + view.ty} r={r} className="sm-orbit" />;
        })}

        {/* Cinturones de asteroides */}
        {!focus &&
          sys.belts.map((belt) => {
            const r1 = project.f(belt.inner) * view.k;
            const r2 = project.f(belt.outer) * view.k;
            const on = selection?.type === 'belt' && selection.name === belt.name;
            const v = beltVisits.get(belt.name) ?? 0;
            const label = belt.name ?? t('Cinturón de asteroides', 'Asteroid belt');
            return (
              <g key={`b-${belt.name}`} className={`sm-belt ${on ? 'on' : ''} ${v ? 'visited' : ''}`}>
                <circle
                  cx={C + view.tx}
                  cy={C + view.ty}
                  r={(r1 + r2) / 2}
                  strokeWidth={Math.max(6 * u, r2 - r1)}
                  className="sm-belt-band"
                  onClick={() => !moved.current && onSelect({ type: 'belt', name: belt.name })}
                >
                  <title>{label}</title>
                </circle>
                {(on || (hereBelt != null && hereBelt === belt.name) || (belt.name && view.k >= 1) || view.k >= 2) && (
                  <text x={C + view.tx} y={C + view.ty - (r1 + r2) / 2 - Math.max(6 * u, r2 - r1) / 2 - 6 * u} textAnchor="middle" className="sm-label belt">
                    {label}
                  </text>
                )}
              </g>
            );
          })}

        {/* Última ruta */}
        {routePts.length > 1 && <polyline points={routePts.map((p) => `${p.x},${p.y}`).join(' ')} className="sm-route" />}

        {/* Centro: la estrella o el planeta/luna enfocado */}
        {center && !focus && <circle cx={C + view.tx} cy={C + view.ty} r={24 * u * Math.min(view.k, 2)} fill="url(#sm-star)" />}
        {center && focus && (
          <g className={`sm-body center ${selectedId === center.id ? 'on' : ''}`} onClick={() => tap(center)}>
            <circle cx={C + view.tx} cy={C + view.ty} r={DISC * view.k} fill="url(#sm-body)" className="sm-disc" />
          </g>
        )}
        {center && (
          <text
            x={C + view.tx}
            y={focus ? C + view.ty - DISC * view.k - 10 * u : C + view.ty + 24 * u * Math.min(view.k, 2) + 20 * u}
            textAnchor="middle"
            className="sm-label center"
          >
            {center.name}
          </text>
        )}

        {/* Objetos */}
        {drawn.map((b) => {
          const p = scr(posOf(b));
          const v = visits.get(b.id) ?? 0;
          const on = selectedId === b.id;
          const sz = size(b.kind) * u;
          return (
            <g
              key={b.id}
              className={`sm-body k-${b.kind} ${v ? 'visited' : ''} ${on ? 'on' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${b.name}${v ? ` · ${v} ${t(v === 1 ? 'visita' : 'visitas', v === 1 ? 'visit' : 'visits')}` : ''}`}
              aria-pressed={on}
              onClick={() => tap(b)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  moved.current = false;
                  tap(b);
                }
              }}
            >
              <circle cx={p.x} cy={p.y} r={Math.max(sz + 8 * u, (b.kind === 'outpost' || b.kind === 'poi' ? 12 : 20) * u)} className="sm-hit" />
              <Glyph kind={b.kind} x={p.x} y={p.y} s={sz} />
              {on && <circle cx={p.x} cy={p.y} r={sz + 6 * u} className="sm-sel" />}
              {labels.has(b.id) && (
                <text
                  x={p.x}
                  y={labels.get(b.id) === 'above' ? p.y - sz - 7 * u : p.y + sz + 15 * u}
                  textAnchor="middle"
                  className={`sm-label ${b.kind === 'planet' || b.kind === 'moon' ? 'big' : ''}`}
                >
                  {b.name}
                </text>
              )}
              {v > 0 && (b.kind === 'planet' || b.kind === 'moon') && (
                <text x={p.x} y={p.y + sz + (labels.get(b.id) === 'below' ? 29 : 15) * u} textAnchor="middle" className="sm-count">
                  {v}×
                </text>
              )}
              <title>{b.name}</title>
            </g>
          );
        })}

        {/* Dónde estás */}
        {hereShown &&
          (() => {
            const b = byId.get(hereShown);
            if (!b) return null;
            const p = b.id === center?.id ? { x: C + view.tx, y: C + view.ty } : scr(posOf(b));
            const r = b.id === center?.id && focus ? DISC * view.k + 8 * u : (size(b.kind) + 9) * u;
            return <circle cx={p.x} cy={p.y} r={r} className="sm-here" />;
          })()}
      </svg>

      <div className="sm-zoom">
        <button className="icon-btn" aria-label={t('Acercar', 'Zoom in')} title={t('Acercar', 'Zoom in')} onClick={() => zoomAt(1.5, { x: C, y: C })}>
          <Plus size={18} aria-hidden />
        </button>
        <button className="icon-btn" aria-label={t('Alejar', 'Zoom out')} title={t('Alejar', 'Zoom out')} onClick={() => zoomAt(1 / 1.5, { x: C, y: C })}>
          <Minus size={18} aria-hidden />
        </button>
        <button className="icon-btn" aria-label={t('Vista completa', 'Reset view')} title={t('Vista completa', 'Reset view')} onClick={() => setView({ k: 1, tx: 0, ty: 0 })}>
          <RotateCcw size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function polar(dx: number, dy: number, f: (d: number) => number) {
  const d = Math.hypot(dx, dy);
  if (!d) return { x: C + f(0), y: C };
  const a = Math.atan2(dy, dx);
  const r = f(d);
  // En pantalla la y crece hacia abajo.
  return { x: C + r * Math.cos(a), y: C - r * Math.sin(a) };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

function size(kind: Kind): number {
  switch (kind) {
    // Radio en píxeles de pantalla.
    case 'planet':
      return 9;
    case 'moon':
      return 6;
    case 'city':
    case 'gateway':
      return 5.5;
    case 'station':
      return 4.5;
    case 'asteroid':
      return 4;
    default:
      return 3;
  }
}

function Glyph({ kind, x, y, s }: { kind: Kind; x: number; y: number; s: number }) {
  if (kind === 'planet' || kind === 'moon' || kind === 'star') return <circle cx={x} cy={y} r={s} fill="url(#sm-body)" className="sm-glyph" />;
  if (kind === 'station' || kind === 'gateway') return <rect x={x - s} y={y - s} width={s * 2} height={s * 2} transform={`rotate(45 ${x} ${y})`} className="sm-glyph" />;
  if (kind === 'city') {
    return (
      <g className="sm-glyph">
        <circle cx={x} cy={y} r={s} />
        <circle cx={x} cy={y} r={s * 0.4} className="sm-dot" />
      </g>
    );
  }
  if (kind === 'asteroid') return <polygon points={`${x},${y - s} ${x + s},${y + s * 0.8} ${x - s},${y + s * 0.8}`} className="sm-glyph" />;
  return <circle cx={x} cy={y} r={s} className="sm-glyph" />;
}
