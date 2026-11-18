# SC Master · sistema visual «mobiGlas»

Nota de diseño del cliente. Explica qué se replica del mobiGlas del juego y con qué piezas,
para que cualquier vista nueva (Contactos, Hangar, Comercio…) encaje sin inventar estilos.

## Referencias (noviembre de 2026)

Solo cuenta el mobiGlas actual. En vivo está la 4.10.3, del 12 de noviembre de 2026. La última
renovación completa del mobiGlas llegó en la 3.23. Desde entonces se ha ampliado sin cambiar de
lenguaje visual: el inventario nuevo y el crafting llegaron en la 4.7 y la pestaña de eventos en
la 4.10.2. Por orden de prioridad, las referencias han sido:

1. **Inventario de la 4.7** (capturas de guías de marzo de 2026). Paneles altos de azul marino
   casi opaco, títulos centrados en mayúsculas («PERSONAL / BACKPACK») y bandas rayadas en
   diagonal junto a los títulos de sección («EQUIPMENT»). También rejillas de casillas
   cuadradas con borde fino, la casilla elegida con contorno blanco y una barra de pequeños
   botones de icono.
2. **App Contratos** (capturas de diciembre de 2025). Pestañas en forma de cápsula, con la activa
   rellena de verde y las alertas en rojo. Lista por categorías, cada una con icono, nombre en
   mayúsculas, contador y flecha. Cada contrato es una celda oscura de esquinas pequeñas con una
   franja de color a la izquierda y un subtítulo en azul.
3. **Pantalla de inicio del mobiGlas** (guías para nuevos jugadores de noviembre de 2025 a 2026).
   Holograma azul cielo sobre azul marino y paneles con contorno fino y brillante. La app
   activa lleva un marcador amarillo. Abajo hay un dock de apps con icono y etiqueta.

Se descartaron capturas de 2017 y 2021 que los buscadores marcaban como recientes, y también
el mobiGlas de la 3.x (cian verdoso, botones facetados). Fuentes de contexto: notas de parche
de RSI de la 4.8 y la 4.10, y la página «Alpha 4.7.0» de starcitizen.tools.

## Qué se replica

- **Holograma azul sobre azul marino.** Cristal `#07101a`–`#0b1927` casi opaco, contorno de 1 px
  azul (`--edge`) y marcas de esquina en azul cielo. Las líneas de barrido y la viñeta del velo
  son muy tenues.
- **Cabeceras rayadas.** Título en mayúsculas con mucho espaciado y una banda de rayas a 135°
  hasta el borde del panel (`.label::after`).
- **Cápsulas.** Filtros, buscador, selector, «Cargar más» y estados de la barra superior.
- **Celdas con franja de categoría.** Cada evento de la bitácora es una celda con una franja
  izquierda del color de su categoría (`data-cat`), igual que los contratos del juego.
- **Dock inferior.** Logo a la izquierda y apps con icono sobre etiqueta. La app activa se
  rellena de blanco hielo y lleva una barra amarilla (`--mark`) debajo, como el marcador del
  inicio del juego.
- **Estados.** Ámbar para espacio sin ley y avisos, rojo para lo hostil, verde para lo correcto
  y violeta para lo social. El acento interactivo es azul cielo.
- **Arranque.** Las vistas entran con un fundido y los paneles con un pequeño parpadeo
  escalonado (`holo-in`). Todo se desactiva con `prefers-reduced-motion`.

## Tokens (`:root` en `src/styles.css`)

| Token | Valor | Uso |
| --- | --- | --- |
| `--bg` | `#02060b` | Fondo «del mundo» detrás del holograma |
| `--glass` / `--glass-2` | `rgba(7,16,26,.84)` / `rgba(11,25,39,.88)` | Relleno de panel (degradado) |
| `--glass-solid` | `#0a1724` | Fondo opaco de cabeceras fijas |
| `--cell` / `--cell-hi` | `rgba(110,170,230,.07)` / `.12` | Celdas, chips en reposo, filas |
| `--edge` / `--edge-hi` | `rgba(120,190,245,.22)` / `rgba(140,205,250,.5)` | Contornos |
| `--line` | `rgba(120,190,245,.13)` | Separadores finos |
| `--hatch` | `rgba(120,190,245,.2)` | Rayas de las cabeceras |
| `--text` / `--head` / `--bright` | `#e2edf6` / `#d3e3f0` / `#f5fafe` | Texto, títulos, cifras |
| `--muted` / `--faint` | `#8ea6bb` / `#5a7086` | Secundario / terciario |
| `--sub` | `#5aa6ee` | Subtítulos azules (como «HEADQUARTERS») |
| `--accent` | `#62d0f5` | Azul cielo holograma: activo, enlaces, foco |
| `--accent-dim` / `--accent-edge` / `--accent-glow` | `.14` / `.55` / `.35` del acento | Relleno / borde / resplandor activo |
| `--mark` | `#f2d14b` | Marcador amarillo de la app activa |
| `--ice` | `#eaf4fb` | Relleno del botón activo del dock |
| `--amber`, `--red`, `--green`, `--violet`, `--pink` | como antes | Estados y categorías |
| `--r-panel` / `--r-ctl` / `--r-tag` / `--r-pill` | 8 / 6 / 4 / 999 px | Radios |
| `--tap` | 44 px | Alto mínimo de cualquier control táctil |
| `--gutter`, `--view-top`, `--dock-btn` | 20 / 18 / 90 px | Medidas del marco (bajan en pantallas estrechas) |

Los tokens antiguos (`--panel`, `--panel-2`, `--line-strong`, `--radius`, `--display`, `--body`,
`--accent-dim`, `--amber-bg`, `--red-bg`) siguen existiendo como alias, para que el CSS que
llegue de otras ramas funcione sin cambios.

## Tipografías

Las tipografías de la interfaz de CIG no son libres. Se usan alternativas libres vía `@fontsource`:

- **Rajdhani** 500/600/700 (`--display`): cabeceras, etiquetas del dock, chips y cifras. Es la
  más parecida a la sans técnica cuadrada en mayúsculas del mobiGlas.
- **Saira Semi Condensed** 400/500/600 (`--body`): texto corrido. Es estrecha y técnica como la
  del juego y se lee bien a 15 px.

## Componentes

- **Marco (`.app`)**: el fondo es un degradado radial azul con una rejilla de puntos en SVG
  propio. Encima van el velo de barrido y la viñeta (`.app::after`), y todo respeta
  `env(safe-area-inset-*)`.
- **Barra superior (`.topbar`)**: título con marcador amarillo y resplandor. Los estados van en
  cápsulas (`.pill`) a la derecha.
- **Dock (`.rail`, `.rail-btn`)**: antes era una barra lateral y ahora es el dock inferior
  flotante. Cada botón mide al menos 50 px de alto. `.on` lleva relleno blanco hielo y barra
  amarilla, y `.soon` sale atenuado. Si no cabe, el dock se desplaza dentro de sí mismo, nunca
  la página.
- **Panel (`.panel`)**: cristal marino, contorno de 1 px y marcas de esquina (`::before` y
  `::after`). Variantes: `.warn` (ámbar), `.safe` (verde) y `.hostile` (rojo).
- **Cabecera (`.label`)**: mayúsculas, línea inferior que cruza el panel y banda rayada.
- **Cifras (`.stat`)**: cada una en su celda, con el valor en Rajdhani 700 y la clave en
  mayúsculas pequeñas. `.good` y `.bad` cambian el color.
- **Chips y controles (`.chip`, `.search`, `.select`, `.more`)**: cápsulas de 44 px. Activo =
  relleno azul tenue con borde y texto azul cielo. `.select` lleva una flecha propia en SVG.
- **Insignias (`.badge`)**: etiquetas pequeñas con radio de 4 px y borde del color del estado.
- **Eventos (`.ev`)**: celda con franja de categoría, hora en cifras técnicas e icono en un
  recuadro tintado. `imp0` es más tenue, `imp2` va resaltado y `.fresh` entra con un destello
  azul.
- **Cabecera de día (`.day-head`)**: marcador azul, texto en mayúsculas y línea hasta el borde.
- **Estados vacíos (`.empty`, `.soon-view`)**: el vacío va en un recuadro discontinuo con un
  rayado tenue. Las secciones futuras llevan un emblema hexagonal en SVG propio
  (`components/Emblem.tsx`) y la etiqueta «Próximamente».

## Layout y responsive

| Ancho | Dispositivos | Cambios |
| --- | --- | --- |
| > 1150 px | iPad 11" y 13" en horizontal, Android de 1280 y 1340 | Rejillas de 3 y 4 columnas, dock de 90 px |
| ≤ 1150 px | iPad mini en horizontal (1133) | Margen de 16 px, dock de 84 px |
| ≤ 900 px | Cualquier tablet en vertical (744–1024) | `.g3` y `.g4` a 2 columnas, `.g2` a 1, Contactos de uno en uno, dock de 74 px sin texto en el logo |
| ≤ 820 px | iPad mini y Android de 800 en vertical | Barra superior compacta para que quepa en una línea |
| ≤ 700 px | Ventanas estrechas | Cifras a 2 columnas; Archivo oculta la columna «Build» |
| alto ≤ 820 px en horizontal | iPad mini, Android de 800 | Barra superior y dock más bajos |

- No hay scroll horizontal de página (`min-width: 0` en las rejillas y `overflow-wrap` en las
  cifras). El scroll ocurre solo dentro de `.view`; la barra superior y el dock quedan fijos.
- Las animaciones duran 150–420 ms y solo tocan `opacity`, `transform` y colores de fondo.

## Clases renombradas

Ninguna. Se mantienen todas las existentes (`.panel`, `.chip`, `.toolbar`, `.ev`, `.label`, `.big`,
`.stat`, `.badge`, `.search`, `.select`, `.more`, `.empty`, `.day-head`, `.rail`, `.rail-btn`,
`.pill` y las de Contactos). Novedades:

- `.soon-emblem` y `.soon-tag` para la vista «Próximamente».
- El atributo `data-cat` en `.ev`, que pinta la franja de categoría.
- `.rail` cambia de posición: deja de ser la barra lateral y pasa a ser el dock inferior.
- `.label::after` está ocupado por la banda rayada. Si una vista necesita otro adorno en la
  cabecera, que use un elemento propio.
