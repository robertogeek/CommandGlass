import { Copy, Flag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { day, n } from '../format.ts';
import { useLang } from '../lang.tsx';
import { getJson } from '../live.tsx';

/** Resumen de una sesión (la última si no se indica), con texto listo para pegar en Discord. */

interface Summary {
  id: number;
  startedAt: string | null;
  endedAt: string | null;
  minutes: number;
  shard: string | null;
  completed: string[];
  failed: string[];
  reputation: number;
  rewards: number;
  spent: number;
  places: string[];
  ships: string[];
  companions: string[];
  shipsLost: number;
  vehiclesDestroyed: number;
  deaths: number;
  qtJumps: number;
  blueprints: string[];
  crimes: string[];
}

/** Copia texto; en el iPad por http (red local) no hay API de portapapeles y se usa el método antiguo. */
function copyText(text: string): boolean {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      void navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* se prueba el método antiguo */
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'absolute';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

export function SessionSummaryCard({ id = 'last' }: { id?: number | 'last' }) {
  const { t } = useLang();
  const [d, setD] = useState<{ summary: Summary; text: string } | null>(null);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'error'>('idle');
  useEffect(() => {
    getJson<{ summary: Summary; text: string }>(`/api/sessions/${id}/summary`).then(setD).catch(() => setD(null));
  }, [id]);
  if (!d) return null;
  const s = d.summary;
  const h = Math.floor(s.minutes / 60);
  const dur = h ? `${h} h ${s.minutes % 60} min` : `${s.minutes} min`;

  return (
    <section className="panel session-summary" aria-label={t('Resumen de la sesión', 'Session summary')}>
      <div className="toolbar">
        <div className="label wrap-title">
          <Flag size={14} aria-hidden /> {id === 'last' ? t('Tu última sesión', 'Your last session') : t('Resumen de la sesión', 'Session summary')}
          {s.startedAt ? ` · ${day(s.startedAt)}` : ''}
        </div>
        <button className="chip" onClick={() => setCopied(copyText(d.text) ? 'ok' : 'error')}>
          <Copy size={15} aria-hidden /> {copied === 'ok' ? t('Copiado', 'Copied') : t('Copiar para Discord', 'Copy for Discord')}
        </button>
      </div>
      {copied === 'error' && (
        <div className="pad-msg err" role="alert">
          {t(
            'No se ha podido copiar en este dispositivo. Mantén pulsado el texto de abajo para copiarlo.',
            "Couldn't copy on this device. Press and hold the text below to copy it.",
          )}
        </div>
      )}
      <div className="grid g4">
        <div className="stat"><div className="v">{dur}</div><div className="k">{t('jugadas', 'played')}{s.shard ? ` · ${s.shard}` : ''}</div></div>
        <div className="stat good">
          <div className="v">{n(s.completed.length)}</div>
          <div className="k">
            {t('contratos completados', s.completed.length === 1 ? 'contract completed' : 'contracts completed')}
            {s.reputation ? ` · +${n(s.reputation)} rep` : ''}
          </div>
        </div>
        <div className="stat"><div className="v">+{n(s.rewards)}</div><div className="k">{t(`aUEC ganados · −${n(s.spent)} gastados`, `aUEC earned · −${n(s.spent)} spent`)}</div></div>
        <div className={`stat ${s.shipsLost || s.deaths ? 'bad' : ''}`}>
          <div className="v">{n(s.vehiclesDestroyed)} / {n(s.shipsLost)}</div>
          <div className="k">
            {t(
              `naves destruidas / perdidas · ${n(s.deaths)} muertes`,
              `ships destroyed / lost · ${n(s.deaths)} ${s.deaths === 1 ? 'death' : 'deaths'}`,
            )}
          </div>
        </div>
      </div>
      <div className="grid g3 wrap-lists">
        <div>
          <h3 className="brief-h">{t('Contratos', 'Contracts')}</h3>
          {s.completed.length ? (
            <ul className="brief-list">{s.completed.slice(0, 8).map((title, i) => <li key={i}>{title}</li>)}</ul>
          ) : (
            <div className="empty">{t('Ninguno completado.', 'None completed.')}</div>
          )}
          {s.failed.length > 0 && <div className="faint kind-note">{t('Fallidos', 'Failed')}: {s.failed.join(', ')}</div>}
        </div>
        <div>
          <h3 className="brief-h">{t('Ruta', 'Route')}</h3>
          {s.places.length ? <div className="sub">{s.places.slice(0, 10).join(' → ')}</div> : <div className="empty">{t('Sin viajes.', 'No travel.')}</div>}
          {s.ships.length > 0 && <><h3 className="brief-h">{t('Naves', 'Ships')}</h3><div className="sub">{s.ships.join(', ')}</div></>}
        </div>
        <div>
          {s.companions.length > 0 && <><h3 className="brief-h">{t('Con', 'With')}</h3><div className="sub">{s.companions.join(', ')}</div></>}
          {s.blueprints.length > 0 && <><h3 className="brief-h">Blueprints</h3><div className="intel-rep">{s.blueprints.map((b) => <span key={b} className="badge violet">{b}</span>)}</div></>}
          {s.crimes.length > 0 && <><h3 className="brief-h">{t('Delitos', 'Crimes')}</h3><div className="sub">{s.crimes.join(', ')}</div></>}
        </div>
      </div>
      <pre className="summary-text">{d.text}</pre>
    </section>
  );
}
