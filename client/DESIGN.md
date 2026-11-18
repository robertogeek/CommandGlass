# CommandGlass · sistema visual «mobiGlas»

Nota de diseño del cliente: qué se replica, con qué piezas y cómo se adapta a cada tablet, para
que cualquier vista nueva (Hangar, Comercio, Mapa…) encaje sin inventar estilos.

## Dirección

La guía principal son los **conceptos del usuario** (noviembre de 2026): cuatro pantallas de
un mobiGlas rediseñado (Comunicaciones, Inicio, Mapa estelar y Misiones), inspiradas en Star
Citizen y más modernas que el juego. Por debajo sigue valiendo lo que se tomó del mobiGlas
actual del juego (4.7–4.10): holograma azul sobre azul marino, mayúsculas espaciadas, listas de
celdas y la app activa resaltada.

Elementos que se toman de los conceptos:

- **Bisel exterior** con las cuatro esquinas achaflanadas y una **muesca superior** con una
  luz azul en el centro.
- **Cabecera**: emblema a la izquierda, sobre la barra lateral; título de la sección en
  tipografía fina, mayúsculas espaciadas y un subrayado corto azul; a la derecha, estado,
  jugador y hora («Hora local») separados por trazos verticales.
- **Barra lateral de apps** dentro de su propio panel, cada una con icono sobre etiqueta. La
  activa va en una caja con borde azul, relleno tenue y resplandor.
- **Franja de estado inferior (HUD)** con los extremos en punta y segmentos de etiqueta pequeña
  y valor. En el centro, el emblema dentro de un hexágono que sobresale.
- **Paneles** oscuros con borde fino, la esquina superior derecha achaflanada, cabecera en
  mayúsculas con una línea que cruza el panel y un pequeño destello azul en el borde superior.
- **Listas de celdas** con insignia hexagonal, la seleccionada con borde azul.
- **Cifras** con la etiqueta pequeña arriba y el valor debajo, separadas por trazos verticales.
- **Botones rectangulares** de esquina pequeña. Los activos llevan relleno azul tenue y subrayado.

## Identidad: Space Cowboys

Restricción: ni logotipos ni recursos de CIG o RSI. Donde los conceptos ponen el logo de Star
Citizen va el **logo de la organización del usuario, Space Cowboys**: una estrella dorada sobre
un anillo azul estrellado, entre laureles plateados. Lo aportó el propio usuario.

- `src/assets/space-cowboys.png`: recortado al contenido, 360 × 306 px y fondo transparente. Se
  usa en la cabecera (`.brand .org-logo`, 60 px, o 46 px con poca altura) y en el hexágono central
  del HUD (`.status-emblem .org-logo`, 64 px, o 54 px). Se muestra siempre a todo color, sin
  teñir ni recolorear.
- Iconos de la app (`public/icon-192.png`, `icon-512.png` y `apple-touch-icon.png`): el logo al
  86 % sobre el azul noche del marco (`#060a10`) con un halo azul suave. Son ficheros fijos: ya no
  se generan al compilar (se ha retirado `scripts/make-icons.ts`).
- El **emblema propio** (`components/Emblem.tsx`, hexágono de líneas dibujado a mano) queda para
  los estados decorativos de una sola tinta: «Próximamente» y los vacíos.
- Para regenerar los PNG desde el original se usó el decodificador WebP de Windows (WPF/WIC) con
  un script de PowerShell. Si cambia el logo, basta con sustituir esos cuatro ficheros.

## Tokens (`:root` en `src/styles.css`)

| Token | Valor | Uso |
| --- | --- | --- |
| `--void` | `#04070b` | Fondo detrás del bisel |
| `--hull` / `--hull-2` | `#0a1119` / `#0d1621` | Panel (degradado de arriba abajo) |
| `--hull-solid` | `#0b131c` | Fondos opacos (opciones de `select`) |
| `--seam` / `--seam-hi` | `#17232f` / `#2a3c4e` | Borde / borde resaltado y chaflanes |
| `--line` | `rgba(130,170,205,.12)` | Separadores |
| `--cell` / `--cell-hi` | `rgba(120,165,210,.045)` / `.09` | Celdas, filas, botones en reposo |
| `--frost` / `--text` | `#e3eaf0` / `#cdd7e0` | Títulos y valores / texto corrido |
| `--muted` / `--faint` | `#8194a5` / `#56687a` | Secundario / etiquetas |
| `--accent` | `#4db0ff` | Señal: activo, foco, iconos, subrayados |
| `--accent-dim` / `--accent-edge` / `--accent-glow` | `.12` / `.55` / `.3` del acento | Relleno, borde y resplandor activos |
| `--amber`, `--red`, `--green`, `--violet`, `--pink` | | Estados y categorías |
| `--r-panel` / `--r-ctl` / `--r-tag` | 6 / 4 / 3 px | Radios |
| `--cut` / `--cut-s` | 18 / 12 px | Chaflán del bisel / de los paneles |
| `--tap` | 44 px | Alto mínimo de cualquier control |
| `--rail-w`, `--pad`, `--gap` | 104 / 18 / 14 px | Medidas del marco (bajan en pantallas estrechas) |
| `--ease-out`, `--t-press`, `--t-state`, `--t-enter` | `cubic-bezier(.23,1,.32,1)`, 120 / 180 / 280 ms | Movimiento |

Alias de versiones anteriores, para el CSS de otras ramas: `--bg`, `--panel`, `--panel-2`,
`--edge`, `--line-strong` y `--radius`.

## Tipografías

Las de la interfaz de CIG no son libres. Se usan alternativas libres vía `@fontsource`:

- **Rajdhani** 400/500/600/700 (`--display`): título de sección (400, 32 px, espaciado 0,16 em),
  cabeceras de panel, etiquetas, botones y cifras. Es la libre más cercana a la sans técnica
  y fina de los conceptos.
- **Saira Semi Condensed** 400/500/600 (`--body`): texto corrido y filas.

## Componentes

- **Marco (`.app`)**: rejilla de tres filas (`top`, `rail main` y `status`). El bisel son dos
  capas recortadas (`::before` para el borde, `::after` para el relleno) y la muesca es
  `.hud-notch`. Todo respeta `env(safe-area-inset-*)`.
- **Cabecera (`.topbar`)**: `.brand`, `h1.title` y `.topbar-status`, con `.pill`
  (`.pill.clock` para la hora).
- **Barra lateral (`.rail`, `.rail-btn`)**: los botones se reparten la altura (entre 58 y 92 px).
  `.on` es la caja azul; `.soon` sale atenuado.
- **HUD (`.statusbar`, `.seg-hud`, `.status-emblem`)**: ubicación, jurisdicción (ámbar si no hay
  ley) y nave, el emblema, y después contratos activos, sesión y shard. Los segmentos `.opt`
  (nave y contratos) se ocultan en vertical.
- **Panel (`.panel`)**: chaflán arriba a la derecha (`clip-path` y el trazo en `::after`) y
  destello en el borde superior (`::before`). Variantes `.warn`, `.safe`, `.hostile` y
  `.danger-zone`.
- **Cabecera de panel (`.label`)**: mayúsculas de 15 px y una línea que cruza el panel.
- **Cifras (`.stat`)**: etiqueta arriba (orden invertido con flex) y valor anclado abajo, para
  que queden alineadas aunque la etiqueta ocupe dos líneas.
- **Eventos (`.ev`)**: celda con insignia hexagonal (anillo del color de la categoría hecho con
  dos capas recortadas). `imp0` tenue, `imp2` resaltado, `.fresh` con un destello azul.
- **Controles**: `.chip` (activo con subrayado), `.search` (lupa dentro del campo), `.select`
  (flecha propia) y `.more` (botón principal).
- **Mandos**: `.pad` es una placa achaflanada con su tecla física (`kbd`, con forma de tecla). Al
  pulsarla se rellena de azul y se encoge al 97 %. Estados: `.ok` verde, `.error` ámbar,
  `.danger` rojo y `.armed` con un pulso rojo interior que pide confirmación. `.toolbar .pill`
  lleva recuadro propio y `.search-wrap` coloca el icono dentro del campo.
- **Vacío (`.empty`)**: emblema tenue y una frase centrada. **Próximamente (`.soon-view`)**:
  emblema grande girando despacio, título fino y la etiqueta «Próximamente».

## Movimiento

Las animaciones responden a lo que hace el usuario: pulsar encoge (120 ms) y el estado cambia de
color (180 ms), siempre con `ease-out` y sin rebotes. Al cambiar de sección la vista entra con un
solo fundido de 280 ms. No hay animaciones decorativas, salvo el pulso de «en directo», el aviso
de una tecla armada y el emblema de «Próximamente». Con `prefers-reduced-motion` todo queda
quieto.

## Layout y responsive

| Condición | Dispositivos | Cambios |
| --- | --- | --- |
| > 1150 px | iPad 11" y 13" en horizontal, Android de 1280 y 1340 | Barra lateral de 104 px, rejillas de 3 y 4 columnas, HUD de 6 segmentos |
| ≤ 1150 px | iPad mini en horizontal (1133) | Barra lateral de 92 px, márgenes de 14 px |
| alto ≤ 820 px en horizontal | iPad mini, iPad 11", Android de 800 | Cabecera y HUD más bajos, emblema más pequeño |
| ≤ 900 px | Cualquier tablet en vertical (744–1024) | Barra lateral de 80 px, rejillas a 2 columnas, Contactos de uno en uno, HUD de 4 segmentos |
| ≤ 700 px | Ventanas estrechas | Cifras a 2 columnas; Archivo sin la columna «Build»; emblema sin texto |

No hay scroll horizontal de página. El scroll ocurre solo dentro de `.view`; la cabecera, la barra
lateral y el HUD quedan fijos.

## Clases

No se ha renombrado ninguna de las existentes. Novedades: `.hud-notch`, `.brand`,
`.topbar-status`, `.pill.clock`, `.statusbar`, `.seg-hud` (no confundir con `.seg`, el selector
de Contactos y Mandos), `.status-emblem`, `.soon-emblem` y `.soon-tag`.

Cambios de estructura en `App.tsx`: la cabecera pasa a ser hija directa de `.app` y ocupa todo
el ancho; `.rail` vuelve a ser la barra lateral; aparece `<StatusBar />`. Los pseudoelementos
`::before` y `::after` de `.panel` están ocupados: si una vista necesita otro adorno, que use un
elemento propio.
