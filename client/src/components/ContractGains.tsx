import { FileCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { n } from '../format.ts';
import { useLang } from '../lang.tsx';
import { useLive } from '../live.tsx';
import type { ActiveMission } from '../types.ts';

/** Lo que da un contrato: reputación por facción, recompensa y si es ilegal (datos de la wiki). */
export function ContractGains({ intel }: { intel: ActiveMission['intel'] }) {
  const { t } = useLang();
  if (!intel) return null;
  const reward = intel.rewardMin ? `${n(intel.rewardMin)}${intel.rewardMax && intel.rewardMax > intel.rewardMin ? `–${n(intel.rewardMax)}` : ''} aUEC` : null;
  if (!intel.reputation.length && !reward && !intel.illegal && !intel.blueprints && !intel.cooldown) return null;
  return (
    <div className="gains">
      {intel.reputation.map((r) => (
        <span key={`${r.faction}-${r.scope}`} className="badge green">+{n(r.amount)} rep · {r.faction}</span>
      ))}
      {reward && <span className="badge">{reward}</span>}
      {intel.blueprints && <span className="badge violet">{t('Puede dar blueprints', 'May award blueprints')}</span>}
      {intel.waves ? (
        <span className="badge amber">
          {intel.waves} {intel.waves === 1 ? t('oleada', 'wave') : t('oleadas', 'waves')}
        </span>
      ) : null}
      {intel.cooldown && <span className="badge muted">Cooldown {intel.cooldown}</span>}
      {intel.illegal && <span className="badge red">{t('Ilegal', 'Illegal')}</span>}
    </div>
  );
}

/**
 * Aviso emergente al aceptar un contrato en directo: qué es y cuánta reputación da.
 * Se basa en los contratos activos del estado, así que también salta si el contrato llega antes que su ficha.
 */
export function ContractToast() {
  const { snapshot } = useLive();
  const { t } = useLang();
  const missions = snapshot?.state?.missions ?? [];
  const known = useRef<Set<string> | null>(null);
  const [toast, setToast] = useState<ActiveMission | null>(null);

  useEffect(() => {
    const ids = new Set(missions.map((m) => m.id));
    // La primera vez solo se apunta lo que ya había: no se avisa de contratos antiguos al abrir la app.
    if (known.current === null) {
      if (snapshot) known.current = ids;
      return;
    }
    const fresh = missions.find((m) => !known.current!.has(m.id));
    known.current = ids;
    if (fresh) setToast(fresh);
  }, [missions, snapshot]);

  // Si la ficha de la wiki llega después, se actualiza el aviso abierto.
  const current = toast ? (missions.find((m) => m.id === toast.id) ?? toast) : null;

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 14_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!current) return null;
  return (
    <div className="toast" role="status" aria-live="polite">
      <div className="toast-head">
        <FileCheck size={16} aria-hidden /> {t('Contrato aceptado', 'Contract accepted')}
        <button className="toast-close" onClick={() => setToast(null)} aria-label={t('Cerrar aviso', 'Dismiss alert')}><X size={16} aria-hidden /></button>
      </div>
      <div className="toast-title">{current.title}</div>
      {current.intel ? (
        <>
          {(current.intel.giver || current.intel.rankRequired) && (
            <div className="faint toast-sub">
              {[current.intel.giver, current.intel.rankRequired && t(`rango ${current.intel.rankRequired}`, `rank ${current.intel.rankRequired}`)]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
          <ContractGains intel={current.intel} />
        </>
      ) : (
        <div className="faint toast-sub">
          {t(
            'Sin datos de reputación para este contrato (puede ser de un evento).',
            'No reputation data for this contract (it may be from an event).',
          )}
        </div>
      )}
      <a className="chip toast-link" href="#contratos" onClick={() => setToast(null)}>{t('Ver briefing', 'View briefing')}</a>
    </div>
  );
}
