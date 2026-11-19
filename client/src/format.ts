import { getLang, locale, tr } from './lang.tsx';

/** Fechas, horas y números en el idioma de la interfaz (los formateadores se crean una vez por idioma). */

const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();
function fmt<T extends Intl.DateTimeFormat | Intl.NumberFormat>(key: string, make: (loc: string) => T): T {
  const k = `${getLang()}:${key}`;
  let f = cache.get(k) as T | undefined;
  if (!f) {
    f = make(locale());
    cache.set(k, f);
  }
  return f;
}

const time = () => fmt('time', (l) => new Intl.DateTimeFormat(l, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
const dayFmt = () => fmt('day', (l) => new Intl.DateTimeFormat(l, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
const num = () => fmt('num', (l) => new Intl.NumberFormat(l));
const shortFmt = () => fmt('short', (l) => new Intl.DateTimeFormat(l, { day: 'numeric', month: 'short', year: 'numeric' }));

export const hhmm = (iso: string | Date) => time().format(typeof iso === 'string' ? new Date(iso) : iso);
export const day = (iso: string) => {
  const s = dayFmt().format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const n = (v: number) => num().format(Math.round(v));
/** Número con decimales, en el formato del idioma. */
export const dec = (v: number, digits = 1) => new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }).format(v);

/** Duración legible: "1 h 29 min", "12 min", "ahora" / "now". */
export function duration(fromIso: string, toIso?: string | null): string {
  const ms = (toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso);
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 1) return tr('ahora', 'now');
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

/** Fecha corta: "12 nov 2025" / "Nov 12, 2025". */
export const shortDay = (iso: string) => shortFmt().format(new Date(iso)).replace('.', '');

/** Cuándo, en relativo: "hoy", "ayer", "hace 5 días", o la fecha si hace más de un mes. */
export function ago(iso: string): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(new Date(iso))) / 86_400_000);
  if (days <= 0) return tr('hoy', 'today');
  if (days === 1) return tr('ayer', 'yesterday');
  if (days < 31) return tr(`hace ${days} días`, `${days} days ago`);
  return shortDay(iso);
}

export function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}
