import { Bell, BellOff, HeartPulse, Pickaxe, ShieldAlert, Skull, Sparkles, Swords, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLang } from '../lang.tsx';
import { useLive, type Alert } from '../live.tsx';

/**
 * Avisos emergentes en el tablet (lo que el servidor considera importante: espacio sin ley, heridas,
 * naves perdidas, hostiles marcados, refinería, blueprints…). Con sonido opcional, por dispositivo.
 */

const KEY = 'cg-alert-sound';
const ICON: Record<string, LucideIcon> = {
  lawless: ShieldAlert,
  injury: HeartPulse,
  downed: HeartPulse,
  'ship-lost': Skull,
  kill: Swords,
  crime: ShieldAlert,
  refinery: Pickaxe,
  blueprint: Sparkles,
};

function soundOn(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let ctx: AudioContext | null = null;
/** Pitido sintetizado según la gravedad (sin ficheros de audio). */
function beep(level: Alert['level']) {
  try {
    ctx ??= new AudioContext();
    const tones: Record<Alert['level'], number[]> = { info: [660], good: [660, 880], warn: [520, 520], danger: [440, 330, 440] };
    tones[level].forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      const t = ctx!.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g).connect(ctx!.destination);
      o.start(t);
      o.stop(t + 0.15);
    });
  } catch {
    /* sin audio */
  }
}

export function AlertCenter() {
  const { alerts } = useLive();
  const { t } = useLang();
  const [shown, setShown] = useState<Alert[]>([]);
  const [sound, setSound] = useState(soundOn);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const fresh = alerts.filter((a) => !seen.current.has(a.id));
    if (!fresh.length) return;
    fresh.forEach((a) => seen.current.add(a.id));
    setShown((prev) => [...fresh, ...prev].slice(0, 4));
    if (sound) beep(fresh.some((a) => a.level === 'danger') ? 'danger' : fresh[0]!.level);
    const ids = fresh.map((a) => a.id);
    const timer = window.setTimeout(() => setShown((prev) => prev.filter((a) => !ids.includes(a.id))), 10_000);
    return () => window.clearTimeout(timer);
  }, [alerts, sound]);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      /* sin almacenamiento */
    }
    // iOS solo permite audio tras un gesto: este toque lo desbloquea.
    if (next) beep('info');
  };

  return (
    <>
      <button className="alert-sound" onClick={toggleSound} aria-pressed={sound}
        title={sound ? t('Sonido de avisos activado', 'Alert sound on') : t('Sonido de avisos desactivado', 'Alert sound off')}
        aria-label={sound ? t('Desactivar sonido de avisos', 'Turn off alert sound') : t('Activar sonido de avisos', 'Turn on alert sound')}>
        {sound ? <Bell size={16} aria-hidden /> : <BellOff size={16} aria-hidden />}
      </button>
      <div className="alerts" role="region" aria-label={t('Avisos', 'Alerts')} aria-live="assertive">
        {shown.map((a) => {
          const Icon = ICON[a.kind] ?? (a.kind.startsWith('hostile') ? ShieldAlert : Bell);
          return (
            <div key={a.id} className={`alert ${a.level}`}>
              <Icon size={20} aria-hidden />
              <a className="alert-text" href={a.href ?? undefined} onClick={() => setShown((p) => p.filter((x) => x.id !== a.id))}>
                <strong>{a.title}</strong>
                {a.body && <span>{a.body}</span>}
              </a>
              <button className="alert-close" onClick={() => setShown((p) => p.filter((x) => x.id !== a.id))} aria-label={t('Cerrar aviso', 'Dismiss alert')}>
                <X size={16} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
