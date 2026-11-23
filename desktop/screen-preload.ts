/// <reference lib="dom" />
import { ipcRenderer } from 'electron';

/**
 * Preload de las pantallas de este PC (desktop/screens.ts). La ventana no se activa al tocarla, así que no recibe
 * el teclado: al tocar un campo de texto (o un desplegable) se le pide a la app que la active un momento, y al salir
 * del campo se devuelve el primer plano al juego. La página no necesita saber nada de esto.
 */

const EDITABLE = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=""], [contenteditable="true"]';

let typing = false;
const setTyping = (on: boolean) => {
  if (on === typing) return;
  typing = on;
  ipcRenderer.send('cg:screen-keyboard', on);
};

window.addEventListener(
  'pointerdown',
  (e) => {
    const el = (e.target as Element | null)?.closest?.(EDITABLE) as HTMLElement | null;
    if (!el) return;
    setTyping(true);
    // El foco del sistema llega un instante después: se vuelve a poner en el campo.
    setTimeout(() => el.focus(), 50);
  },
  true,
);

window.addEventListener(
  'focusout',
  () => {
    // Si el foco pasa a otro campo, se sigue escribiendo.
    setTimeout(() => {
      const active = document.activeElement;
      if (!active || !active.matches?.(EDITABLE)) setTyping(false);
    }, 120);
  },
  true,
);

window.addEventListener(
  'keydown',
  (e) => {
    if (!typing) return;
    const el = document.activeElement as HTMLElement | null;
    // Escape, o Intro en un campo de una línea: se acabó de escribir.
    if (e.key === 'Escape' || (e.key === 'Enter' && el?.tagName === 'INPUT')) setTimeout(() => el?.blur(), 0);
  },
  true,
);
