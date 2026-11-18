// Emblema propio de CommandGlass: hexágono con anillo y núcleo romboidal (SVG hecho a mano,
// sin logotipos ni recursos del juego).
export function Emblem({ size = 32, spin = false }: { size?: number; spin?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" aria-hidden>
      <path d="M32 3 57 17.5v29L32 61 7 46.5v-29Z" strokeWidth="2" />
      <path d="M32 10 51 21v22L32 54 13 43V21Z" strokeWidth="1" opacity="0.4" />
      <g className={spin ? 'spin' : undefined}>
        <circle cx="32" cy="32" r="14" strokeWidth="1.5" strokeDasharray="5 3" opacity="0.75" />
      </g>
      <path d="M32 22 38 32 32 42 26 32Z" fill="currentColor" fillOpacity="0.25" strokeWidth="1.5" />
      <path d="M32 3v5M57 17.5l-4.3 2.5M57 46.5l-4.3-2.5M32 61v-5M7 46.5l4.3-2.5M7 17.5l4.3 2.5" strokeWidth="2" />
    </svg>
  );
}
