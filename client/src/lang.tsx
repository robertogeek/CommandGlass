import { createContext, Fragment, useContext, useEffect, useState, type ReactNode } from 'react';
import { getJson, postJson } from './live.tsx';

/**
 * Idioma de CommandGlass: en inglés, todo en inglés; en español, todo en español salvo los nombres propios
 * (sitios, naves, objetos, facciones, acciones del juego…), que nunca se traducen.
 * Se guarda en el servidor, así que es el mismo en el tablet y en el PC.
 *
 * En los componentes: const { t } = useLang(); t('Ubicación', 'Location').
 * Fuera de React (format.ts y utilidades): tr('Ubicación', 'Location').
 */

export type Lang = 'en' | 'es';
/** Nombre antiguo: el idioma ya no es solo el de los términos del juego, es el de toda la interfaz. */
export type GameLang = Lang;

const STORE_KEY = 'cg-lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved === 'en' || saved === 'es') return saved;
  } catch {
    /* sin almacenamiento */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

let current: Lang = initialLang();

/** Idioma actual, para código fuera de React. */
export const getLang = (): Lang => current;
/** Locale para fechas y números. */
export const locale = (): string => (current === 'es' ? 'es-ES' : 'en-US');
/** Texto en el idioma actual, para código fuera de React. */
export const tr = (es: string, en: string): string => (current === 'es' ? es : en);

export interface Translate {
  (es: string, en: string): string;
  (s: { en: string; es: string }): string;
}

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** t('Tren de aterrizaje', 'Landing gear') o t({ en, es }) para los términos de terms.ts. */
  t: Translate;
}

const makeT = (lang: Lang): Translate =>
  ((a: string | { en: string; es: string }, b?: string) => (typeof a === 'string' ? (lang === 'es' ? a : (b ?? a)) : a[lang])) as Translate;

const Ctx = createContext<LangCtx>({ lang: current, setLang: () => {}, t: makeT(current) });

function apply(l: Lang) {
  current = l;
  document.documentElement.lang = l;
  try {
    localStorage.setItem(STORE_KEY, l);
  } catch {
    /* sin almacenamiento */
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  // Sube cuando el servidor ya ha cambiado de idioma: las vistas se vuelven a montar y piden sus datos otra vez,
  // porque algunos textos (bitácora, avisos, consejos de contratos) los escribe el servidor.
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    apply(lang);
  }, [lang]);

  useEffect(() => {
    getJson<{ lang: Lang }>('/api/settings')
      .then((s) => {
        if (s.lang === 'en' || s.lang === 'es') {
          apply(s.lang);
          setLangState(s.lang);
        }
      })
      .catch(() => {});
  }, []);

  const setLang = (l: Lang) => {
    apply(l);
    setLangState(l);
    postJson('/api/settings', { lang: l })
      .catch(() => {})
      .finally(() => setEpoch((n) => n + 1));
  };

  return (
    <Ctx.Provider value={{ lang, setLang, t: makeT(lang) }}>
      <Fragment key={epoch}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export const useLang = () => useContext(Ctx);

export function LangSwitch() {
  const { lang, setLang, t } = useLang();
  const label = t('Idioma', 'Language');
  return (
    <div className="lang-switch" role="group" aria-label={label} title={label}>
      {(['en', 'es'] as const).map((l) => (
        <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)} aria-pressed={lang === l} lang={l}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
