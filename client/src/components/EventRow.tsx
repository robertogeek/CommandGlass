import { Coins, Crosshair, Cpu, FileText, HeartPulse, Navigation, Users, type LucideIcon } from 'lucide-react';
import { hhmm } from '../format.ts';
import type { Category, GameEvent } from '../types.ts';

export const CATEGORY: Record<Category, { label: string; icon: LucideIcon }> = {
  combat: { label: 'Combate', icon: Crosshair },
  travel: { label: 'Viajes', icon: Navigation },
  mission: { label: 'Contratos', icon: FileText },
  social: { label: 'Social', icon: Users },
  economy: { label: 'Economía', icon: Coins },
  health: { label: 'Salud', icon: HeartPulse },
  system: { label: 'Sistema', icon: Cpu },
};

export function EventRow({ e, fresh }: { e: GameEvent; fresh?: boolean }) {
  const meta = CATEGORY[e.category] ?? CATEGORY.system;
  const Icon = meta.icon;
  return (
    <div className={`ev imp${e.importance}${fresh ? ' fresh' : ''}`}>
      <span className="time">{hhmm(e.ts)}</span>
      <span className={`ico c-${e.category}`} title={meta.label}>
        <Icon size={16} strokeWidth={2} aria-hidden />
      </span>
      <span className="txt">{e.summary}</span>
    </div>
  );
}
