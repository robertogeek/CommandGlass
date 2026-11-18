# CommandGlass

Tu mobiGlas inteligente para Star Citizen. Lee el `Game.log` del juego en tiempo real (solo lectura: no toca la memoria ni los ficheros del juego), guarda todo tu historial en una base de datos local y lo muestra en una web app pensada para el iPad.

```
Game.log ──► lector en vivo ──┐
logbackups/*.log ► importador ┴► parser (reglas) ► SQLite ► servidor local ► iPad (Safari, pantalla completa)
```

## Puesta en marcha

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
