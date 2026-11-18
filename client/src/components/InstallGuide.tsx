import { MoreVertical, Share, SquarePlus, X } from 'lucide-react';
import { useState } from 'react';

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
        <button className="install-close" onClick={close} aria-label="Cerrar la guía">
          <X size={18} aria-hidden />
        </button>
        <div className="label">Primera vez en este tablet</div>
        <h2 id="install-title">Instala CommandGlass como app</h2>
        <p className="sub">Así se abre a pantalla completa, sin barras del navegador, y lo tienes a un toque.</p>
        {p === 'ios' ? (
          <ol className="install-steps">
            <li>
              Toca <strong>Compartir</strong> <Share size={18} aria-label="(el cuadrado con la flecha)" /> arriba a la derecha, junto a la barra de direcciones.
            </li>
            <li>
              Elige <strong>Añadir a pantalla de inicio</strong> <SquarePlus size={18} aria-hidden />. Si no lo ves, desliza la lista hacia abajo.
            </li>
            <li>Toca <strong>Añadir</strong> y abre CommandGlass desde su icono.</li>
          </ol>
        ) : (
          <ol className="install-steps">
            <li>
              Toca el menú <MoreVertical size={18} aria-label="(los tres puntos)" /> arriba a la derecha.
            </li>
            <li>Elige <strong>Añadir a pantalla de inicio</strong> o <strong>Instalar app</strong>.</li>
            <li>Confirma y abre CommandGlass desde su icono.</li>
          </ol>
        )}
        <div className="install-actions">
          <button className="chip on" onClick={close}>Entendido</button>
        </div>
      </div>
      {p === 'ios' && <div className="install-arrow" aria-hidden>↑</div>}
    </div>
  );
}
