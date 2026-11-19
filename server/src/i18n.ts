/**
 * Idioma de los textos que escribe el servidor (bitácora, avisos, consejos de contratos, errores).
 * Es el mismo ajuste que el idioma de la interfaz ('lang' en settings): un PC, un jugador, un idioma.
 * Los nombres propios (sitios, naves, objetos, facciones) nunca se traducen.
 */

export type Lang = 'en' | 'es';
export interface Bi {
  es: string;
  en: string;
}

/** Idioma por defecto: el de Windows (la app de escritorio lo pasa en CG_LOCALE) o el del sistema. */
export function defaultLang(): Lang {
  const loc = process.env.CG_LOCALE || Intl.DateTimeFormat().resolvedOptions().locale || '';
  return loc.toLowerCase().startsWith('es') ? 'es' : 'en';
}

let current: Lang = defaultLang();

export const getLang = (): Lang => current;
export const setLang = (l: Lang): void => {
  current = l;
};

/** Texto en el idioma actual. */
export const tx = (es: string, en: string): string => (current === 'es' ? es : en);
/** Texto bilingüe en el idioma actual. */
export const pick = (b: Bi): string => b[current];
/** Locale para números y fechas. */
export const numLocale = (): string => (current === 'es' ? 'es-ES' : 'en-US');
/** Número con separador de miles en el idioma actual. */
export const fmtN = (v: number): string => v.toLocaleString(numLocale());
