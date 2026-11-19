import { MoreVertical, Share, SquarePlus, X } from 'lucide-react';
import { useState } from 'react';
import { useLang } from '../lang.tsx';

/**
 * Guía de "Añadir a pantalla de inicio" la primera vez que se abre CommandGlass en el navegador del tablet.
 * iPadOS y Android no dejan que una web se instale sola: el gesto lo tiene que hacer la persona,
 * así que aquí solo se le enseña dónde tocar. Si ya se abre como app (pantalla completa), no sale.
 */

const KEY = 'cg-install-guide-dismissed';

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

type Platform = 'ios' | 'android' | 'other';

function platform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function InstallGuide() {
  const { t } = useLang();
  const [open, setOpen] = useState(() => !isStandalone() && platform() !== 'other' && !dismissed());
  if (!open) return null;
  const p = platform();

  const close = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* sin almacenamiento: volverá a salir la próxima vez */
    }
    setOpen(false);
  };

  return (
    <div className="install-guide" role="dialog" aria-modal="true" aria-labelledby="install-title">
      <div className="panel install-card">
        <button className="install-close" onClick={close} aria-label={t('Cerrar la guía', 'Close the guide')}>
          <X size={18} aria-hidden />
        </button>
        <div className="label">{t('Primera vez en este tablet', 'First time on this tablet')}</div>
        <h2 id="install-title">{t('Instala CommandGlass como app', 'Install CommandGlass as an app')}</h2>
        <p className="sub">
          {t(
            'Así se abre a pantalla completa, sin barras del navegador, y lo tienes a un toque.',
            "It opens full screen, without browser bars, and it's always one tap away.",
          )}
        </p>
        {p === 'ios' ? (
          <ol className="install-steps">
            <li>
              {t('Toca', 'Tap')} <strong>{t('Compartir', 'Share')}</strong>{' '}
              <Share size={18} aria-label={t('(el cuadrado con la flecha)', '(the square with the arrow)')} />{' '}
              {t('arriba a la derecha, junto a la barra de direcciones.', 'at the top right, next to the address bar.')}
            </li>
            <li>
              {t('Elige', 'Choose')} <strong>{t('Añadir a pantalla de inicio', 'Add to Home Screen')}</strong> <SquarePlus size={18} aria-hidden />.{' '}
              {t('Si no lo ves, desliza la lista hacia abajo.', "If you don't see it, scroll down the list.")}
            </li>
            <li>
              {t('Toca', 'Tap')} <strong>{t('Añadir', 'Add')}</strong> {t('y abre CommandGlass desde su icono.', 'and open CommandGlass from its icon.')}
            </li>
          </ol>
        ) : (
          <ol className="install-steps">
            <li>
              {t('Toca el menú', 'Tap the menu')} <MoreVertical size={18} aria-label={t('(los tres puntos)', '(the three dots)')} />{' '}
              {t('arriba a la derecha.', 'at the top right.')}
            </li>
            <li>
              {t('Elige', 'Choose')} <strong>{t('Añadir a pantalla de inicio', 'Add to Home screen')}</strong> {t('o', 'or')}{' '}
              <strong>{t('Instalar app', 'Install app')}</strong>.
            </li>
            <li>{t('Confirma y abre CommandGlass desde su icono.', 'Confirm and open CommandGlass from its icon.')}</li>
          </ol>
        )}
        <div className="install-actions">
          <button className="chip on" onClick={close}>{t('Entendido', 'Got it')}</button>
        </div>
      </div>
      {p === 'ios' && <div className="install-arrow" aria-hidden>↑</div>}
    </div>
  );
}
