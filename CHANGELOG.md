# Cambios de CommandGlass

Cada versión sale por dos sitios:

- **GitHub Releases**: instalador de Windows (`commandglass_v.X.Y.Z_b.exe`, sin firmar: Windows avisa la primera vez).
- **Microsoft Store**: la misma versión firmada por Microsoft, cuando pasa la certificación.

Este archivo es la fuente de las notas de las dos. Cada versión lleva su parte en español y en inglés; el
flujo `Instalador de Windows` copia la sección de la etiqueta (`v0.1.3-beta` → `## 0.1.3-beta`) en la release.
Lo que se vaya haciendo se apunta en la versión «en desarrollo» de arriba.

## 0.1.5-beta (en desarrollo)

- 

**English**

- 

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
