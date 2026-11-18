const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const num = new Intl.NumberFormat('es-ES');

export const hhmm = (iso: string) => time.format(new Date(iso));
export const day = (iso: string) => {
  const s = dayFmt.format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const n = (v: number) => num.format(Math.round(v));

/** Duración legible: "1 h 29 min", "12 min", "ahora". */
export function duration(fromIso: string, toIso?: string | null): string {
  const ms = (toIso ? Date.parse(toIso) : Date.now()) - Date.parse(fromIso);
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${min % 60} min`;
}

const shortFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

/** Fecha corta: "12 nov 2025". */
export const shortDay = (iso: string) => shortFmt.format(new Date(iso)).replace('.', '');

/** Cuándo, en relativo: "hoy", "ayer", "hace 5 días", o la fecha si hace más de un mes. */
export function ago(iso: string): string {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(new Date(iso))) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 31) return `hace ${days} días`;
  return shortDay(iso);
}

export function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}
