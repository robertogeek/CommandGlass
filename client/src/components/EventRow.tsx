import { Coins, Crosshair, Cpu, FileText, HeartPulse, Navigation, Users, type LucideIcon } from 'lucide-react';
import { hhmm } from '../format.ts';
import { useLang } from '../lang.tsx';
import type { Term } from '../terms.ts';
import type { Category, GameEvent } from '../types.ts';

export const CATEGORY: Record<Category, { label: Term; icon: LucideIcon }> = {
  combat: { label: { es: 'Combate', en: 'Combat' }, icon: Crosshair },
  travel: { label: { es: 'Viajes', en: 'Travel' }, icon: Navigation },
  mission: { label: { es: 'Contratos', en: 'Contracts' }, icon: FileText },
  social: { label: { es: 'Social', en: 'Social' }, icon: Users },
  economy: { label: { es: 'Economía', en: 'Economy' }, icon: Coins },
  health: { label: { es: 'Salud', en: 'Health' }, icon: HeartPulse },
  system: { label: { es: 'Sistema', en: 'System' }, icon: Cpu },
};

export function EventRow({ e, fresh }: { e: GameEvent; fresh?: boolean }) {
  const { t } = useLang();
  const meta = CATEGORY[e.category] ?? CATEGORY.system;
  const Icon = meta.icon;
  return (
    <div className={`ev imp${e.importance}${fresh ? ' fresh' : ''}`} data-cat={e.category}>
      <span className="time">{hhmm(e.ts)}</span>
      <span className={`ico c-${e.category}`} title={t(meta.label)}>
        <Icon size={16} strokeWidth={2} aria-hidden />
      </span>
      <span className="txt">{e.summary}</span>
    </div>
  );
}
