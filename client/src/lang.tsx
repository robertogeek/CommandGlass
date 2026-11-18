import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getJson, postJson } from './live.tsx';

/**
 * Idioma de los nombres del juego (acciones, controles, términos): el que usas en Star Citizen.
 * La interfaz de CommandGlass sigue en español; los nombres propios nunca se traducen.
 * Se guarda en el servidor, así que es el mismo en el tablet y en el PC.
 */

export type GameLang = 'en' | 'es';

interface LangCtx {
  lang: GameLang;
  setLang: (l: GameLang) => void;
  /** Elige el texto según el idioma: t({ en: 'Landing gear', es: 'Tren de aterrizaje' }). */
  t: (s: { en: string; es: string }) => string;
}

const Ctx = createContext<LangCtx>({ lang: 'en', setLang: () => {}, t: (s) => s.en });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<GameLang>('en');
  useEffect(() => {
    getJson<{ lang: GameLang }>('/api/settings').then((s) => setLangState(s.lang)).catch(() => {});
  }, []);
  const setLang = (l: GameLang) => {
    setLangState(l);
    postJson('/api/settings', { lang: l }).catch(() => {});
  };
  return <Ctx.Provider value={{ lang, setLang, t: (s) => s[lang] }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-switch" role="group" aria-label="Idioma de los nombres del juego" title="Idioma de los nombres del juego (el que usas en Star Citizen)">
      {(['en', 'es'] as const).map((l) => (
        <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)} aria-pressed={lang === l}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
