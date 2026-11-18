# CommandGlass

Tu mobiGlas inteligente para Star Citizen. Lee el `Game.log` del juego en tiempo real (solo lectura: no toca la memoria ni los ficheros del juego), guarda todo tu historial en una base de datos local y lo muestra en una web app pensada para el iPad.

```
Game.log ──► lector en vivo ──┐
logbackups/*.log ► importador ┴► parser (reglas) ► SQLite ► servidor local ► iPad (Safari, pantalla completa)
```

## Instalarlo (para el resto de la organización)

1. Descarga `commandglass_v.X.Y.Z_b.exe` y ábrelo. Si Windows muestra «Windows protegió su PC», pulsa **Más información → Ejecutar de todas formas** (pasa mientras el instalador no esté firmado).
2. Se instala en `C:\Program Files\CommandGlass`. Una página del instalador detecta dónde está Star Citizen: lo busca en el registro del lanzador de RSI y en las rutas habituales, y si no lo encuentra te pide la carpeta.
3. Al terminar, CommandGlass se abre solo (también está en el menú Inicio y en el escritorio) y muestra un **QR**.
4. Escanéalo con la cámara del tablet. La primera vez, la app te enseña cómo añadirla a la pantalla de inicio (en iPad: **Compartir → Añadir a pantalla de inicio**).

Cerrar la ventana no apaga CommandGlass: sigue en la bandeja del sistema, junto al reloj, mientras juegas. Para tenerlo en la barra de tareas: clic derecho en su icono → **Anclar a la barra de tareas** (Windows no deja que un instalador lo haga por ti).

El instalador añade una regla de firewall para que el tablet pueda conectarse, solo en **redes privadas**. Si tu wifi está marcada como pública en Windows, el tablet no conectará: cámbiala a privada en Configuración → Red e Internet.

Tus datos (historial, notas, emparejamiento) se guardan en `%APPDATA%\CommandGlass\data` y se conservan al desinstalar o actualizar.

## Construir el instalador

```powershell
npm run dist:win   # release\commandglass_v.<versión>.exe
```

- La versión sale de `version` en `package.json`: `0.1.0-beta` → `commandglass_v.0.1.0_b.exe`.
- En GitHub, el flujo **Instalador de Windows** (`.github/workflows/windows-installer.yml`) hace lo mismo en `windows-latest`. Se lanza a mano desde Actions o al subir una etiqueta `v*`. El `.exe` queda en los artefactos de la ejecución; con etiqueta, también en una Release.
- **Firma**: sale sin firmar mientras el repositorio no tenga secretos de firma. Se activa sola con un certificado `.pfx` (`WIN_CSC_LINK` en base64 + `WIN_CSC_KEY_PASSWORD`) o con Azure Artifact Signing (`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SIGNING_ENDPOINT`, `AZURE_SIGNING_ACCOUNT`, `AZURE_SIGNING_PROFILE`, `AZURE_SIGNING_PUBLISHER`). Smart App Control solo acepta certificados de autoridades de confianza o Artifact Signing, no autofirmados.
- La app de escritorio es Electron (`desktop/`): arranca el servidor como proceso hijo, muestra `/escritorio` (QR y estado) y vive en la bandeja.

## Desarrollo

Requisitos: Node.js 24 o superior.

```powershell
npm run setup     # instala dependencias y compila la interfaz
npm start         # arranca el servidor (o doble clic en "CommandGlass.cmd")
```

Al arrancar, importa los logs archivados de `logbackups/` y empieza a vigilar `Game.log`.

### Emparejar el iPad

1. En el PC abre `http://localhost:8777/pair` (o usa el QR que sale en la consola).
2. Escanéalo con la cámara del iPad y ábrelo en Safari. El iPad y el PC tienen que estar en la misma red.
3. En Safari: **Compartir → Añadir a pantalla de inicio**. Se abrirá a pantalla completa como una app.
4. La primera vez, Windows preguntará por el firewall: permite el acceso en **redes privadas**.

Para que el iPad no se apague mientras juegas: Ajustes → Pantalla y brillo → Bloqueo automático → Nunca (o usa Acceso Guiado).

## Secciones

| Sección | Qué muestra | De dónde sale |
|---|---|---|
| **Ahora** | Ubicación, jurisdicción, nave, contratos, heridas y nivel de cama médica que necesitas, sesión | Registro del juego |
| **Mandos** | Botonera que pulsa las teclas del juego y chuleta de controles | `Data.p4k` + tu `actionmaps.xml` |
| **Bitácora** | Todo lo que ha pasado, por días, con filtros | Registro del juego |
| **Contactos** | Con quién juegas, quién te elimina, notas y marcas | Registro del juego |
| **Hangar** | Tu equipo personal, tus naves, ficha de cada nave y qué componentes montar | Registro + [api.star-citizen.wiki](https://api.star-citizen.wiki) (precios de UEX a través de la wiki) |
| **Contratos** | Briefing de lo que tienes en curso, estadísticas por tipo y facción, historial | Registro + api.star-citizen.wiki |
| **Comercio** | Cartera estimada, en qué gastas, últimas compras y recompensas | Registro (el saldo lo indicas tú una vez) |
| **Mapa** | Esquema orbital por sistema con tus sitios, tu última ruta y los saltos entre sistemas | Registro del juego |
| **Archivo** | Resumen de tu año y todas tus sesiones | Registro del juego |

Lo que el registro **no** incluye y por eso es estimado o falta: el saldo de aUEC, la reputación con cada facción (se estima con lo que da cada contrato según la wiki), tu posición exacta en el mapa y los componentes que hayas cambiado en tus naves.

Los datos de la wiki se descargan en segundo plano y se guardan en `data/game/` (misiones: renovación semanal; fichas de naves y componentes: 7 días). La wiki pide que se la cite: la interfaz lo hace junto a esos datos.

**Datos de contratos de la comunidad:** la reputación, el cooldown, las naves que esperar y las blueprints posibles de cada contrato salen de [StarStrings](https://github.com/MrKraken/StarStrings) (MrKraken), que los extrae de los ficheros del juego en cada build y publica `src/For_Tool_Creators/contracts.ini` para otras herramientas (rama `master` para LIVE y `sc-ptu` para PTU). Se casa con el registro por el *debug name* del contrato. Se descarga una vez al día a `data/game/community/`.

**Nombres:** los sitios, naves, objetos y acciones usan su nombre oficial, sacado de la traducción del propio juego (`global.ini` de `Data.p4k`). Los nombres propios nunca se traducen. El selector EN/ES de la barra superior elige el idioma de los términos del juego (EN por defecto).

## Mandos (botonera)

La sección **Mandos** convierte el iPad en una botonera: cada botón pulsa en el PC la tecla de una acción del juego (tren de aterrizaje, pedir aterrizaje, faros, señuelos, linterna, casco…). También incluye una **chuleta** con todos tus controles, con buscador.

- Las teclas por defecto se leen de `Data.p4k` (`Libs/Config/defaultProfile.xml`) junto con los textos oficiales en español. Tus cambios se leen de `user/client/0/Profiles/default/actionmaps.xml`. Los ficheros del juego **solo se leen**. Lo extraído se copia en `data/game/` y se vuelve a extraer cuando un parche cambia `Data.p4k`.
- Las teclas se envían por código físico (`SendInput`), así que da igual la distribución del teclado.
- Solo se envía si **Star Citizen está en primer plano** en el PC; si no, la botonera avisa y no pulsa nada.
- Un toque es una acción: no hay macros ni secuencias automáticas. Autodestrucción, eyectar, salida de emergencia y reaparecer piden un segundo toque para confirmar.
- Si ejecutas Star Citizen como administrador, Windows bloquea las pulsaciones que llegan de otro programa: arranca CommandGlass también como administrador, o el juego sin esos permisos.

## Configuración

`data/config.json` se crea solo la primera vez:

- `gameDir`: carpeta `LIVE` (o `PTU`) de Star Citizen. También se puede pasar con la variable `SC_GAME_DIR`.
- `port`: puerto del servidor (8777 por defecto).
- `pairKey`: clave de emparejamiento. Bórrala y reinicia para generar otra y desemparejar todos los dispositivos.

`SC_LAN_IP` fuerza la IP que se pone en el QR si la detección automática elige mal la tarjeta de red.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm start` | Servidor + lector en vivo |
| `npm run import` | Importa o completa el historial de `logbackups/` |
| `npm run stats` | Resumen de la base de datos (para comprobar el parser) |
| `npm test` | Pruebas del parser con líneas reales del log |
| `npm run typecheck` | Comprobación de tipos de servidor y cliente |
| `npm run dev:client` | Interfaz en modo desarrollo (Vite en el puerto 5173, con el servidor arrancado) |

## Cómo está hecho

- `server/src/parser/`: trocea cada línea del log y la convierte en eventos con reglas por etiqueta (`rules.ts`). Cuando CIG cambie un formato, se añade una variante nueva para que el historial antiguo siga leyéndose. Si cambian las reglas, sube `PARSER_VERSION` en `config.ts` y el historial se vuelve a procesar entero.
- `server/src/state/reducer.ts`: estado en vivo (ubicación, jurisdicción, nave, contratos, estadísticas de sesión).
- `server/src/ingest/`: importador de backups y lector en vivo. Ambos retoman por offset en bytes, porque el `Game.log` y su copia en `logbackups/` comparten la misma clave de sesión.
- `server/src/api/server.ts`: HTTP + Server-Sent Events, sin frameworks. Desde la red local exige la clave de emparejamiento (cookie); desde el propio PC no.
- `client/`: React + Vite. Secciones en `client/src/views/`.

## Qué registra hoy el log (builds de 2026)

Sí: shard, ubicación, jurisdicciones y zonas, saltos cuánticos, nave en la que vas (canal de comunicaciones), naves destruidas con autor y motivo, contratos y objetivos, recompensas, compras, heridas y cama médica, delitos, grupo y tripulación, muertes propias.

No: kills a pie y saldo de aUEC (CIG los quitó del log a finales de 2025). Los `<Actor Death>` de 2025 se siguen importando del historial.
