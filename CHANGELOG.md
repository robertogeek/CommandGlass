# Cambios de CommandGlass

Cada versión sale por dos sitios:

- **GitHub Releases**: instalador de Windows (`commandglass_v.X.Y.Z_b.exe`, sin firmar: Windows avisa la primera vez).
- **Microsoft Store**: la misma versión firmada por Microsoft, cuando pasa la certificación.

Este archivo es la fuente de las notas de las dos. Cada versión lleva su parte en español y en inglés; el
flujo `Instalador de Windows` copia la sección de la etiqueta (`v0.1.3-beta` → `## 0.1.3-beta`) en la release.
Lo que se vaya haciendo se apunta en la versión «en desarrollo» de arriba.

## 0.1.7-beta — 2026-11-23

- Con el juego en español (u otro idioma), CommandGlass no veía cuándo subías a una nave y te marcaba siempre **a pie**: el aviso «Te has unido al canal 'Nave : Dueño'» lleva un texto dentro de otro y solo se traducía el de fuera. Ahora se entiende (con los packs de zalaca y de 0zzyt0), igual que quién sube y baja de tu nave, y al abrir la app se repasa el historial para que también cuenten las naves de antes.
- **Abrir el Discord** abre la invitación en la app de Discord si la tienes instalada, en vez de en el navegador.
- Arriba en la ventana del PC se ve si estás **al día**, con un botón **Buscar ahora** para comprobar si hay versión nueva sin esperar.

**English**

- With the game in Spanish (or another language), CommandGlass didn't notice when you boarded a ship and always showed you **on foot**: the "You have joined channel 'Ship : Owner'" notification has one text inside another, and only the outer one was translated. It's understood now (with both the zalaca and 0zzyt0 packs), as is who boards and leaves your ship, and when you open the app your history is reprocessed so earlier ships count too.
- **Open Discord** opens the invite in the Discord app if you have it installed, instead of in the browser.
- The top of the PC window shows whether you're **up to date**, with a **Check now** button to look for a new version without waiting.

## 0.1.6-beta — 2026-11-23

- **El token de UEX se pide una sola vez**: ahora es uno para toda la app. Antes se guardaba con el historial de cada versión del juego, y al cambiar a PTU (o volver a LIVE) había que ponerlo otra vez.
- Instrucciones de UEX más claras, con enlace directo: el token es el **Bearer Token** de uexcorp.space/api/apps. No hace falta crear ninguna aplicación y no cambia.
- **Discord de la comunidad**: en la ventana del PC, **Abrir el Discord** te lleva al chat y al foro de CommandGlass para contarnos ideas, fallos y dudas. Cada versión nueva se anuncia allí.

**English**

- **The UEX token is asked only once**: it's now one for the whole app. It used to be stored with each game version's history, so switching to PTU (or back to LIVE) meant entering it again.
- Clearer UEX instructions with a direct link: the token is the **Bearer Token** at uexcorp.space/api/apps. You don't need to create an app, and it never changes.
- **Community Discord**: in the PC window, **Open Discord** takes you to the CommandGlass chat and forum to share ideas, bugs and questions. Every new version is announced there.

## 0.1.5-beta — 2026-11-23

- **Se actualiza sola** (versión de GitHub): al abrirla, CommandGlass mira si hay una versión nueva, la descarga y la instala, y vuelve a abrirse. Si estás jugando no te interrumpe: espera y se instala al salir de la app, o cuando pulses **Instalar y reiniciar** en la ventana del PC. Windows pide permiso para instalarla. La versión de la Microsoft Store la sigue actualizando la Store. Esta 0.1.5 hay que instalarla a mano una última vez.

- Mandos renovado: ocupa toda la pantalla del tablet y tiene seis modos (Nave, Combate, A pie, Minería, Chatarreo y Social), cada uno con un control central (anillo del salto cuántico, panal de objetivos, rueda de armas, láser de minería, cabezales de chatarreo e invitaciones), una fila de conmutadores rápidos y los grupos de botones a los lados. Los botones dicen qué hacen, sin la tecla.
- Abajo, siempre a mano: aceptar y rechazar, mobiGlas, mapa, chat y la emergencia tras una tapa (se mantiene 1,5 s para confirmar).
- Cambia solo entre Nave y A pie según lo que haces en el juego (botón **Auto**), y cada tablet recuerda su modo: puedes tener uno con Combate y otro con Nave.
- Avisa de las funciones que no tienen tecla de teclado en tu perfil del juego (por ejemplo, el láser de minería va con el ratón) y las lista en **Buscar › Sin tecla en Mandos** para que las asignes.
- Nueva pestaña **Telemetría** (experimental), en el sitio de Hangar: si abres el RSI Launcher con la telemetría del juego activada, ves en directo tu salud, oxígeno, hambre, sed, pulso, entorno y saldo, y en la nave las luces de aviso, velocidad, rumbo, hidrógeno, boost, energía de cada sistema, armas y contramedidas. Solo lee datos: no actúa en el juego. Para activarla, la ventana del PC tiene el botón **Abrir Star Citizen con telemetría**, que abre el RSI Launcher con ella encendida (en la versión de la Microsoft Store se hace a mano; la pestaña explica cómo).
- Ventana del PC rediseñada para 1080p o más: se abre a 1920×1080 (maximizada en una pantalla de 1080p) y se ve entera sin scroll. A la izquierda el tablet (QR grande, pasos y tablets conectados); en el centro el juego y la telemetría; a la derecha ajustes, informe de diagnóstico y café.
- Con la app en inglés ya no queda nada en español: las naves de la IA salían como «(IA criminal)» en Combate y en la bitácora, y el instalador solo estaba en español. Ahora el instalador sale en el idioma de Windows (inglés o español).

**English**

- **It updates itself** (GitHub version): when you open it, CommandGlass checks for a new version, downloads and installs it, and opens again. If you're playing it won't interrupt you: it waits and installs when you quit the app, or when you click **Install and restart** in the PC window. Windows asks for permission to install it. The Microsoft Store version is still updated by the Store. This 0.1.5 has to be installed by hand one last time.
- Controls redesigned: it fills the whole tablet screen and has six modes (Ship, Combat, On foot, Mining, Salvage and Social), each with a central control (quantum jump ring, target honeycomb, weapon wheel, mining laser, salvage heads and invitations), a row of quick toggles and button groups on both sides. Buttons say what they do, without the key.
- Always at hand at the bottom: accept and decline, mobiGlas, map, chat and the emergency actions behind a cover (hold 1.5 s to confirm).
- It switches between Ship and On foot by itself depending on what you're doing in the game (**Auto** button), and each tablet remembers its mode: you can have one on Combat and another on Ship.
- It flags the functions that have no keyboard key in your game profile (for example, the mining laser is on the mouse) and lists them under **Search › Unbound in Controls** so you can bind them.
- New **Telemetry** tab (experimental), where Hangar used to be: if you open the RSI Launcher with the game's telemetry turned on, you see your health, oxygen, hunger, thirst, heart rate, environment and balance live, and in a ship the warning lights, speed, heading, hydrogen, boost, power to each system, weapons and countermeasures. It only reads data: it never acts in the game. To turn it on, the PC window has an **Open Star Citizen with telemetry** button that opens the RSI Launcher with it on (in the Microsoft Store version it's done by hand; the tab explains how).
- PC window redesigned for 1080p and up: it opens at 1920×1080 (maximized on a 1080p screen) and shows everything without scrolling. The tablet on the left (big QR code, steps and connected tablets); the game and telemetry in the middle; settings, diagnostic report and coffee on the right.
- With the app in English, nothing is left in Spanish: AI ships showed up as "(IA criminal)" in Combat and the logbook, and the installer was only in Spanish. The installer now follows your Windows language (English or Spanish).

## 0.1.4-beta — 2026-11-22

- UEX vuelve a funcionar cuando tu operadora bloquea parte de Cloudflare (pasa en España durante el fútbol): si su dirección principal no responde, CommandGlass usa la otra.

**English**

- UEX works again when your internet provider blocks part of Cloudflare (it happens in Spain during football matches): if its main address doesn't respond, CommandGlass uses the other one.

## 0.1.3-beta — 2026-11-21

- Los avisos del juego se entienden en cualquier idioma, también con traducciones de la comunidad (como la de Ozzyto): contratos, zonas, heridas, delitos, recompensas…
- Ya arranca con logs enormes: había jugadores con un Game.log archivado de 600 MB y la app se quedaba sin abrir. Ahora se leen por partes y con poca memoria.
- Si algo impide arrancar, la ventana dice el motivo real (puerto ocupado, puerto reservado por Windows, error al leer el historial) y tiene **Reintentar** y **Abrir carpeta del registro**.

**English**

- Game notifications are understood in any language, including community translations: contracts, zones, injuries, crimes, rewards…
- It now starts with huge logs: some players had a 600 MB archived Game.log and the app never opened. Logs are now read in parts, using little memory.
- If something stops it from starting, the window shows the real reason (port in use, port reserved by Windows, error reading the history) with **Retry** and **Open log folder**.

## 0.1.2-beta — 2026-11-19

- Toda la interfaz en español y en inglés, con selector de idioma.
- El mapa usa el starmap del propio juego en cada parche (Stanton, Pyro y Nyx, con sus estaciones, puestos y saltos).
- Informe de diagnóstico para mandarnos si algo falla, y registro de la app.

**English**

- The whole interface in English and Spanish, with a language switch.
- The map uses the game's own starmap for each patch (Stanton, Pyro and Nyx, with their stations, outposts and jumps).
- A diagnostic report you can send us if something goes wrong, and an app log.

## 0.1.1-beta — 2026-11-19

- Ventana de Windows: logo «Made by the Community» y avisos de CIG.
- Botón para invitarnos a un café por PayPal (solo en la ventana del PC).

**English**

- Windows window: "Made by the Community" logo and CIG notices.
- A button to buy us a coffee through PayPal (PC window only).

## 0.1.0-beta — 2026-11-19

Primera versión: un mobiGlas en la tablet que lee el Game.log del juego (sin tocar nada del juego).

- **Ahora**: nave, zona, contratos en curso y salud de un vistazo.
- **Bitácora** y **Archivo**: todo lo que pasa en cada partida, con tu historial desde los logs antiguos y resumen anual.
- **Contratos**: historial, estadísticas por tipo y briefing con reputación, cooldown, oleadas y blueprints.
- **Hangar**: naves usadas, equipo personal, flota y fichas con mejoras de componentes.
- **Mapa**, **Contactos**, **Combate**, **Comercio** (cartera estimada y mercado de UEX), refinería y blueprints.
- **Mandos**: botonera táctil y chuleta con tus controles.
- Nombres oficiales del juego, LIVE y PTU, y emparejar la tablet con un QR.

**English**

First release: a mobiGlas on your tablet that reads the game's Game.log (without touching the game).

- **Now**: ship, zone, active contracts and health at a glance.
- **Logbook** and **Archive**: everything that happens in each session, with your history from old logs and a yearly summary.
- **Contracts**: history, stats by type and briefing with reputation, cooldown, waves and blueprints.
- **Hangar**: ships used, personal gear, fleet and spec sheets with component upgrades.
- **Map**, **Contacts**, **Combat**, **Trade** (estimated wallet and UEX market), refinery and blueprints.
- **Controls**: touch button pad and a cheat sheet with your bindings.
- Official game names, LIVE and PTU, and tablet pairing with a QR code.
