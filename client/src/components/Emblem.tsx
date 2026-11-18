// Emblema hexagonal propio (SVG dibujado a mano, sin recursos del juego).
export function Emblem({ size = 32, spin = false }: { size?: number; spin?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" aria-hidden>
      <path d="M32 3 57 17.5v29L32 61 7 46.5v-29Z" strokeWidth="2" />
      <path d="M32 11 50 21.5v21L32 53 14 42.5v-21Z" strokeWidth="1" opacity="0.45" />
      <g className={spin ? 'spin' : undefined}>
        <circle cx="32" cy="32" r="13" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.8" />
      </g>
      <path d="M32 3v6M57 17.5l-5 3M57 46.5l-5-3M32 61v-6M7 46.5l5-3M7 17.5l5 3" strokeWidth="2" />
    </svg>
  );
}
