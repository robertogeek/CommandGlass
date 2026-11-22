# Telemetría local gRPC de Star Citizen (`GRPC_CLIENT_SERVER_ENABLED`)

Informe de investigación, 20–22 de noviembre de 2026. **No se ha implementado nada** y no se ha
tocado ningún fichero del juego ni user.cfg. Las pruebas reales las lanzó el usuario, con las
variables puestas solo para esa sesión del launcher; la sonda solo leyó datos.

## Resumen

- Desde la **4.10.2** (LIVE desde el 9 de octubre de 2026), `StarCitizen.exe` incluye un
  **servidor gRPC local de solo lectura**: `sc.game.telemetry.v1.GameTelemetryService`, en
  `127.0.0.1:2942`, sin TLS y sin autenticación. Viene apagado.
- Se activa con la **variable de entorno `GRPC_CLIENT_SERVER_ENABLED=true`**. El juego la hereda
  del RSI Launcher, así que hay que cerrar el launcher del todo (también el icono de la bandeja) y
  volver a abrirlo. Con user.cfg no se activa.
- Tiene un único método, `TelemetryStream`, que envía en *streaming* unos **17 fotogramas por
  segundo** con el estado de la nave (vuelo, energía, luces de aviso, tren, puertas, armas,
  contramedidas), del personaje (salud, oxígeno, hambre, sed, temperatura, pulso, entorno, puesto)
  y el **saldo de aUEC**. En menús y pantallas de carga no envía nada.
- **No trae** posición, nombres de lugares, escudos ni casco en cifras, munición, carga, contratos
  ni otros jugadores. El Game.log sigue siendo la base de CommandGlass; la telemetría lo completa.
- **En la 5.0 (PTU) el servicio crece** (ver [Novedades de la 5.0](#novedades-de-la-50-ptu-comprobado-el-20-de-noviembre-de-2026)): añade escudos y modo maestro, permite ejecutar acciones de una lista blanca (`TriggerGameAction`) y puede abrirse a otros equipos de la red.
- **CIG no lo ha documentado ni lo ha anunciado.** No se ha encontrado ninguna declaración de CIG
  que lo permita o lo prohíba. ⚠️ Antes de nada conviene **preguntarlo a CIG por el acuerdo que ya
  tiene el usuario** (términos de uso y EasyAntiCheat; ver [Riesgos](#4-riesgos)).

## Novedades de la 5.0 (PTU, comprobado el 20 de noviembre de 2026)

He comparado la PTU (`FileVersion: 5.0.202.205`, rama `sc-alpha-5.0.0`, build 13238477) con la
LIVE 4.10.2. Solo he leído las cadenas del ejecutable, sin activar nada. El servicio crece mucho:

- **Puede actuar en el juego.** Hay dos métodos nuevos:
  - `ListTriggerableActions` devuelve una lista de acciones con `action_name` y `category`.
  - `TriggerGameAction` recibe un `action_name` y devuelve un `status` y un `message`.

  Solo acepta las acciones de una **lista blanca interna**. Los tests internos del juego muestran
  qué entra y qué no:
  - **No entran** los ejes ni los controles analógicos («allowlist contains an axis/analog
    action»), ni disparar armas (`v_fire_weapon_group_1`).
  - **Entran** el tren de aterrizaje (sin mantener pulsado) y el *ping* (con mantener pulsado).

  También hay un comando de consola `gt_trigger <action_id> [hold_ms]`. Es, en la práctica, una
  **vía oficial para lo que hoy hace Mandos con SendInput**.
- **Escudos:** aparece `VehicleShields` dentro del estado de la nave. En la 4.10.2 no había ningún
  dato de escudos.
- **Modo maestro:** aparece `VehicleMasterModeState.mode`, con los modos SCM y NAV.
- **Red y puerto:** aparecen dos ajustes nuevos.
  - `GRPC_CLIENT_SERVER_PORT`: el puerto ya se puede cambiar («Port the client-hosted gRPC server
    binds to, 1024 to 65535»). Este ajuste sustituye a `GRPC_CLIENT_SERVER_ADDRESS`, y el texto
    `127.0.0.1:2942` ya no está en el ejecutable, así que **el puerto por defecto puede haber
    cambiado**. En el chat de la comunidad se habla de **33740**. Sin confirmar: el valor por
    defecto es un número dentro del código, no un texto, y no se puede leer en las cadenas.
  - `GRPC_CLIENT_SERVER_EXTERNAL`: según su descripción, «Bind to 0.0.0.0 to accept connections
    from other computers». Con esto, otros equipos de la red (por ejemplo, el tablet) podrían
    conectarse directamente al juego.
- **Ahora hay dos interruptores.** `GRPC_CLIENT_SERVER_ENABLED` solo levanta el servidor gRPC
  local. Para que el juego **envíe la telemetría** hay que activar además
  `SERVER_GAME_TELEMETRY_ENABLED` («Serve game telemetry on the local services server…»).
  El grupo `SGameTelemetryConfig` trae otras opciones:
  - `SERVER_GAME_TELEMETRY_STREAM_INTERVAL_MS`: cada cuánto se envía a cada cliente (50 ms ≈ 20 Hz).
  - `SERVER_GAME_TELEMETRY_GENERATE_WITHOUT_CLIENTS`: generar fotogramas aunque no haya nadie conectado.
  - `SERVER_GAME_TELEMETRY_TEST_DATA`: «Force telemetry to use synthetic test data instead of
    real game state». Datos sintéticos, útiles para desarrollar sin jugar.
  - `SERVER_GAME_TELEMETRY_TRIGGER_ACTIONS_ENABLED`: permite lanzar las acciones de la lista blanca.
    Viene aparte, así que leer no implica poder actuar.
  - `SERVER_GAME_TELEMETRY_TRIGGER_DEBOUNCE_MS`: tiempo mínimo entre dos repeticiones de la misma acción.

  Todas tienen también forma de argumento (`--server-game-telemetry-…`) y de clave
  (`server.game.telemetry.…`).

### Prueba real en la PTU 5.0 (20 de noviembre de 2026)

Con solo `GRPC_CLIENT_SERVER_ENABLED=true`, puesta en el launcher para esa sesión:

- El Game.log muestra `[Env Var] GRPC_CLIENT_SERVER_ENABLED=true`, `Service
  'sc.game.telemetry.v1.GameTelemetryService' registered` y `127.0.0.1:2942 [Insecure]`. **El puerto
  sigue siendo el 2942** (no el 33740 que se mencionaba en el chat).
- Cada conexión de la sonda queda registrada como `<GameTelemetry> Client connected (id=… total=…)`.
  Después de cargar el personaje aparece `Initializing game telemetry component of local player`.
- **Cero fotogramas**: a pie en Levski y sentado en una nave, en capturas de 45 s, 60 s, 90 s y
  5 min. El juego no llega a enviar ni la cabecera de respuesta. El contador `total` sube con
  cada conexión y no baja.
- Explicación más probable, **pendiente de comprobar**: falta `SERVER_GAME_TELEMETRY_ENABLED=true`.
  En la 4.10.2 bastaba con la primera variable.
- Se repitió el 22 de noviembre con la PTU 5.0.202.10025 (build 13248297): 0 fotogramas en 2 min.
  El Game.log solo muestra `[Env Var] GRPC_CLIENT_SERVER_ENABLED=true`, aunque el launcher se
  abrió con las dos variables: la terminal lo confirma. Así que el juego no escribe todas las
  variables que lee, y por el log no se puede saber si recibió `SERVER_GAME_TELEMETRY_ENABLED`.
- Con las dos variables puestas, también **0 fotogramas** (80 s, ya en el universo). Un diagnóstico
  HTTP/2 detallado muestra que el juego acepta la conexión y envía sus ajustes (los típicos de
  gRPC C++). El stream se queda abierto esperando respuesta y **el juego nunca escribe nada**: ni
  cabeceras, ni datos, ni error. La petición está bien formada; el juego no está generando
  fotogramas.
- Hipótesis, sin confirmar:
  1. La 5.0 necesita otro ajuste más.
  2. El juego descarga parte de su configuración de CIG al arrancar (`--services-config-enabled=true`
     y `ConfigService` en el log), y CIG podría tener la telemetría apagada en la PTU desde ahí.
  3. Depende de alguna opción del menú del juego (el componente se registra en el log con la
     etiqueta `[Haptic]`).
- Siguiente prueba: la LIVE (4.10.201), con el mismo comando. Si allí llegan fotogramas, la sonda
  funciona y el cambio es propio de la 5.0. **Hecha: ver la sección siguiente.**

### Prueba real en la LIVE 4.10.201 (22 de noviembre de 2026)

Con el mismo comando (las dos variables, puestas en el launcher solo para esa sesión) y la misma
sonda de solo lectura, ya en el universo, a pie en un hab (`RR_JP_StantonMagnus`):

- El Game.log de `FileVersion: 4.10.201.48085` (rama `sc-alpha-4.10.0`) muestra las mismas líneas
  que la PTU: `[Env Var] GRPC_CLIENT_SERVER_ENABLED=true`, el servicio registrado en
  `127.0.0.1:2942 [Insecure]` e `Initializing game telemetry component of local player`.
- **1076 fotogramas en 60 s (≈ 18 Hz).** El intervalo típico es de 55 ms (mínimo 50, máximo 226),
  que encaja con un envío cada 50 ms más el tiempo de cada fotograma del juego.
- **La sonda funciona.** El silencio de la PTU es cosa de la 5.0, no de la petición.
- A pie solo llega el bloque del personaje (`actor`). No llegan nave, armas ni eventos, como era de
  esperar. Lectura de los campos por su número, comparando con el orden del esquema de Wingman (es
  una interpretación, no viene etiquetado):
  - `vitals`: salud 100/100, oxígeno 1/1, hambre 76,1/100, sed 100/100, temperatura corporal 36,5,
    pulso unas 60 pulsaciones (es **el único valor que cambia** en los 60 s), gravedad 1,0003 y
    presión 1. El campo 6 no aparece: protobuf omite los valores a cero, y probablemente sea la
    intoxicación.
  - `state`: `locomotion` = 1 (a pie) y `uec_balance` = **5 976 305**: el saldo de aUEC del
    usuario, comprobado en el mobiGlas.
  - `environment`: temperatura exterior 21 y atmósfera respirable = sí. La radiación (a cero) no
    aparece.
- **Comprobado con el mobiGlas.** El usuario sacó una captura del estado físico en el mismo momento,
  y coincide con la interpretación:
  - Salud 100 %, 60 bpm, 36 °C de temperatura corporal, sed 100 %, hambre 76 % y 0 % de drogas
    activas. El campo 6 que falta es, por tanto, la intoxicación, que estaba a cero.
  - Oxígeno 100 %, radiación 0 R/s, atmósfera «SAFE» y 1,00 G.
  - Saldo de **5 976 305 aUEC**, igual que el `uec_balance`.
  - Unidades: la presión llega en atmósferas (1 en la telemetría, 1013 hPa en el mobiGlas), la
    gravedad en G y las temperaturas en °C. El mobiGlas redondea: 36,5 → 36 °C. La temperatura
    exterior llega como 21 y el mobiGlas muestra 20 °C; puede ser redondeo o un cambio entre un
    momento y otro.
- La captura está fuera del repo, en el scratchpad de la sesión
  (`probe\capture-2026-11-22T18-25-30-688Z.json`). Sirve de *fixture* para los tests del lector.

#### Segunda captura: del hangar al espacio en una Aurora Mk II (7 min)

7472 fotogramas en 420 s (≈ 18 Hz), en `capture-2026-11-22T18-29-47-109Z.json`. El usuario sacó
armas en el hangar, se sentó, encendió la nave, despegó y salió al espacio. Los tiempos son
segundos desde el inicio de la captura. La lectura de cada campo se deduce del orden del esquema y
de cuándo cambia; los enums se cuentan con 0 = sin especificar.

- **Personaje**
  - Sacar las armas de mano **no se refleja en nada**: no hay campo para el arma que lleva el
    personaje.
  - A los 272 s, `locomotion` pasa de 1 (a pie) a 3 (sentado). Aparecen `crew_role` = 1 (piloto) y
    `seat_name` = `RSI_Aurora_Mk2_SeatDashboard_Pilot_…`.
  - El pulso sube de 59 a 121 durante el vuelo.
- **Eventos: no llegó ninguno.** El bloque `events` no aparece ni al sentarse. El asiento se sabe
  por el cambio de `locomotion`, no por un evento.
- **Nave (`vehicle`)**: aparece a los 278 s, al encenderla, y no antes, estando ya sentado.
  - `name` = `RSI_Aurora_Mk2_949464407697` (nombre de entidad con su id), `class_name` =
    `RSI_Aurora_Mk2` y `type` = 1 (SPACESHIP). Sin fabricante y sin el nombre que el jugador le
    pone a la nave.
  - **Luces de aviso.** Encajan con el orden `pwr, wpn, thr, shld, cool, qdrv, radr, prox, hit,
    misl` y con el enum NOMINAL=1, OFF=2, MINOR_FLASHING=3, MINOR_ON=4, MAJOR_FLASHING=5,
    MAJOR_ON=6:
    - Al encender, casi todas pasan de OFF a NOMINAL. Los propulsores y los escudos se ponen en
      MAJOR_ON unos instantes mientras arrancan.
    - `prox` se pone en MAJOR_ON dos veces al salir del hangar (aviso de proximidad).
    - `wpn` pasa a MINOR_ON a los 316 s, cuando aparecen las armas.
    - A los 330 s, `shld` se apaga y `qdrv` pasa a NOMINAL. A la vez se apagan los generadores y
      emisores de escudo del bloque de energía. Encaja con **pasar a modo NAV**: en la 4.10 el modo
      maestro no viene como campo, pero se deduce de esto.
  - **Estado de vuelo**
    - `is_landed` deja de ser verdadero a los 287,6 s (despegue).
    - `gear`: DEPLOYED (3) → RETRACTING (4) a los 310,7 s → RETRACTED (1) a los 316,4 s.
    - La VTOL se recoge al encender.
  - **Instrumentos**
    - `speed`: de 0 a 1230 m/s.
    - `hydrogen_fuel`: fracción de 1 a 0,992.
    - `g_meter`: actual y máximo; pico de 19, unidad por confirmar.
    - `boost`: `engaged` se activa y desactiva varias veces, `output` va de 0 a 1 y `reserves` baja
      hasta 0,67 y se recupera.
    - `altitude`: `3.4e38` (el máximo de un float, es decir «sin dato») porque está en el espacio.
    - `vertical_speed`: de 0 a 13,8.
    - `atmospheric_density`: 1,2 dentro del hangar (densidad del aire) y desaparece al salir.
    - `heading`: de 0 a 360, también en el espacio.
    - `quantum_fuel` **no llegó nunca**: o es cero o la 4.10 no lo rellena. Sigue sin confirmar.
  - **Ajustes de vuelo**: casi todos verdaderos y fijos. Hay uno que se desactiva cada vez que se
    pulsa el boost; falta saber cuál es.
  - **Energía**: motores, refrigeradores, soporte vital, sensores y escudos se encienden por
    separado al arrancar.
- **Armas (`weapons`)**
  - **Contramedidas** desde que se enciende la nave: DECOY = 48 y NOISE = 5.
  - **Lista de armas** a partir de los 316 s: cuatro `KLWE_LaserRepeater_S2_…`, todas
    encendidas, listas para disparar y dentro del grupo activo.
  - El grupo de armas (`preset`) no cambió durante la captura.
- **No llegan**: escudos en cifras, casco, munición, posición, ni el sistema o lugar.
- Lo que falta por ver: aterrizaje, cambio de grupo de armas, daño (`hit`, `misl`) y otros tipos de
  nave o vehículo de tierra.

Lo que esto cambia en el resto del informe:

- **Mandos:** con `TriggerGameAction`, los botones podrían usar la vía de CIG en lugar de simular
  teclas con SendInput. Sería más fiable: no depende de la ventana en primer plano ni de la
  distribución de teclado, y respeta la lista blanca de CIG. La regla de **no hacer macros** sigue
  igual: una acción por cada toque del usuario, sin cadenas y sin reaccionar sola a la telemetría.
- **Combate:** con `VehicleShields` y el modo maestro, el panel de combate pasa a valor alto.
- **Desarrollo:** `SERVER_GAME_TELEMETRY_TEST_DATA` permite probar el lector de CommandGlass con
  datos sintéticos, sin tener que jugar.
- ⚠️ **Términos de uso y EasyAntiCheat:** que exista una API para actuar en el juego, con lista
  blanca, sugiere que **CIG está preparando un uso oficial por parte de terceros**. Pero sigue sin
  estar documentada, y **actuar en el juego es más delicado que leer datos**. Hay que incluirlo en
  la consulta a CIG.
- ⚠️ **Seguridad:** con `EXTERNAL` activado, cualquier equipo de la red podría leer los datos
  (incluido el saldo) y **lanzar acciones en el juego**, sin contraseña. CommandGlass no debe
  pedirlo nunca. El tablet debe seguir pasando por el servidor de CommandGlass, que ya controla
  quién se conecta.

## 1. Qué es y cómo se activa

### Confirmado

| Dato | Valor | Fuente |
|---|---|---|
| Versión | 4.10.2 o posterior. El juego del usuario es `FileVersion: 4.10.200.58746`, rama `sc-alpha-4.10.0`, build 13165946 | PR de Wingman AI, docs de sc-copilot-mcp y Game.log local |
| Cómo se activa | Variable de entorno `GRPC_CLIENT_SERVER_ENABLED=true` en el entorno de `StarCitizen.exe` | PR de Wingman AI y sc-copilot-mcp; las cadenas están en el ejecutable local |
| Otras formas de activarlo | El ejecutable registra el mismo ajuste de tres maneras: argumento `--grpc-client-server-enabled`, variable `GRPC_CLIENT_SERVER_ENABLED` y clave `grpc.client.server.enabled`. Descripción: «Boolean telling whether grpc services are hosted». Lo mismo ocurre con `GRPC_CLIENT_SERVER_ADDRESS` (por defecto `127.0.0.1:2942`) y `GRPC_CLIENT_SERVER_CHANNEL_ARGS`. | Cadenas de `Bin64\StarCitizen.exe` (solo lectura) |
| Dónde se escucha | `127.0.0.1:2942`, gRPC sobre HTTP/2, sin TLS y sin token | Ejecutable y las dos herramientas de GitHub |
| Servicio y método | `sc.game.telemetry.v1.GameTelemetryService` / `rpc TelemetryStream(TelemetryStreamRequest) returns (stream TelemetryStreamResponse)`. La petición va vacía | PR de Wingman AI. Los nombres de los mensajes están en el ejecutable |
| Señal en el Game.log | `Service 'sc.game.telemetry.v1.GameTelemetryService' registered` | Wingman AI y sc-copilot-mcp |
| Coste sin clientes | El ejecutable contiene «Running, %u client(s) … NOT submitting (0 clients & not generateWithoutClients)»: sin nadie conectado, no genera fotogramas | Cadenas del ejecutable |
| Frecuencia | Unos 17 Hz con el personaje en el universo; nada en menús ni cargas | Wingman AI y sc-copilot-mcp (pruebas en la 4.10.2 LIVE) |
| Clientes | Admite varios a la vez (Wingman y CommandGlass podrían convivir) | sc-copilot-mcp |
| Esquema (.proto) | El juego no lo publica y **no expone reflexión gRPC**: en el ejecutable no aparece `grpc.reflection…`, solo `grpc.health.v1.Health`. El .proto que circula lo reconstruyó un tercero (Diftic/Mallachi) a partir de los `FileDescriptorProto` incrustados en `StarCitizen.exe`. Está en Wingman AI con licencia **GPLv3** | Cabecera del .proto en el PR #521 y THIRD_PARTY.md de sc-copilot-mcp |

Origen: el mismo panel interno de depuración (`g_telemetry.*`, `##grpc_sta…`) sirve también para
la háptica **D-BOX** del juego («Heart rate», «Hydrogen fuel», «G-meter», «Boost engaged»…).
Parece la evolución de la salida háptica, ahora abierta por gRPC a cualquier programa local.

### No confirmado

- **El hilo de Reddit** (`r/starcitizen/comments/1y10wzx`): Reddit bloquea la descarga automática
  y no se ha podido leer. Todo lo de este informe sale de GitHub y del propio ejecutable.
- **Si el argumento `--grpc-client-server-enabled=true` funciona igual** que la variable. Las
  cadenas apuntan a que sí, pero los argumentos los pone el RSI Launcher y no hay forma oficial
  de añadir uno. Habría que probarlo.
- **La clave `grpc.client.server.enabled` en user.cfg**: no parece una CVar normal (no sigue el
  formato `g_…`/`r_…`) y nadie la ha probado. No hay que contar con ello.
- **`quantum_fuel`**: está en el esquema de Wingman, pero la documentación de sc-copilot-mcp dice
  que no llega en el stream. Hay que comprobarlo con una captura.
- **Eventos de muerte y reaparición** (`ACTOR_DEAD`, `ACTOR_RESPAWN`, `ACTOR_DOWNED`…): están en el
  esquema, pero en cuatro días de pruebas solo llegaron `ACTOR_ENTER_SEAT` y `ACTOR_LEAVE_SEAT`. La
  muerte se deduce de `health` a 0, que no distingue entre incapacitado y muerto.
- **Vehículos de tierra**: según sc-copilot-mcp, no envían datos de vehículo.

## 2. Comprobación en el PC del usuario (hecha sin cambiar nada)

Solo se ha leído, sin escribir en la carpeta del juego:

- `C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\Game.log`: 4.10.2, build
  13165946. La línea `GameTelemetryService registered` **no aparece**, así que el servidor está
  apagado.
- La variable `GRPC_CLIENT_SERVER_ENABLED` **no está** ni en el usuario ni en el sistema.
- No hay `user.cfg` en `LIVE`.
- En `Bin64\StarCitizen.exe` están todos los mensajes `sc.game.telemetry.v1.*`, el ajuste
  `grpc-client-server-enabled` y la dirección `127.0.0.1:2942`.

### Prueba real (hecha el 20 y el 22 de noviembre, lanzada por el usuario)

El usuario abrió el launcher con las variables, solo para esa sesión, y la sonda leyó el stream
sin cambiar nada en el juego. Resultados en [Prueba real en la PTU 5.0](#prueba-real-en-la-ptu-50-20-de-noviembre-de-2026)
y [Prueba real en la LIVE 4.10.201](#prueba-real-en-la-live-410201-22-de-noviembre-de-2026).
El procedimiento que se siguió:

1. Poner la variable **solo para una sesión**, sin dejarla permanente. Con el launcher cerrado
   del todo, abrirlo desde una consola con la variable puesta:
   ```powershell
   $env:GRPC_CLIENT_SERVER_ENABLED = 'true'; & 'C:\Program Files\Roberts Space Industries\RSI Launcher\RSI Launcher.exe'
   ```
   (Si la ruta del launcher es otra, se ajusta. Al cerrar el launcher, la variable desaparece.)
2. Entrar al universo y confirmar en el Game.log la línea `Service 'sc.game.telemetry.v1.GameTelemetryService' registered`.
3. Con permiso, ejecutar un script desechable en el scratchpad (fuera del repo y del juego) que
   se conecte a `127.0.0.1:2942`, guarde unos minutos de fotogramas en crudo y se desconecte.
   Esa captura sirve de *fixture* para los tests y aclara los puntos sin confirmar: unidades,
   `quantum_fuel`, eventos, cuántico y vehículo de tierra.
4. Cerrar el launcher. No queda nada cambiado.

## 3. Datos disponibles frente a lo que ya saca el Game.log

### Qué trae cada fotograma (`TelemetryStreamResponse`)

Nombres de campo tal como aparecen en el esquema:

- **`vehicle.state`** (nave en la que vas sentado)
  - Identidad: `name`, `class_name`, `manufacturer`, `type` (SPACESHIP, GROUND, GRAVLEV, BOAT), `lights_enabled`.
  - `doors`: `open_state` (OPENED/CLOSED) y `lock_state` (UNLOCKED/LOCKED).
  - `annunciators` (luces de aviso): `pwr`, `wpn`, `thr`, `shld`, `cool`, `qdrv`, `radr`, `prox`, `hit`, `misl`. Cada una puede estar NOMINAL, OFF, MINOR_FLASHING, MINOR_ON, MAJOR_FLASHING o MAJOR_ON.
  - `flight.state`: `is_landed`, `gear`, `vtol` y `transformation` (RETRACTED, DEPLOYING, DEPLOYED, RETRACTING).
  - `flight.instruments`: `speed`, `hydrogen_fuel`, `quantum_fuel` (por confirmar), `g_meter`, `boost` (`engaged`, `output`, `reserves`, `critical`), `altitude`, `radar_altitude`, `vertical_speed_indicator`, `atmospheric_density` y `heading` (solo dentro del marco de un planeta).
  - `flight.settings`: `ifcs_coupled`, `ifcs_esp`, `ifcs_g_safe`, `ifcs_cruise_mode`, `ifcs_speed_limiter`, `ifcs_gravity_compensation`, `ifcs_proximity_assist`, `ifcs_proximity_assist_landing`, `ifcs_stability`, `ifcs_core`, `ifcs_wind_compensation`, `course_prediction`, `flight_light_amplification`…
  - `power`: `powerplants`, `engines`, `weapons`, `coolers`, `life_support`, `gravity_generators`, `sensors`, `shield_generators` y `shield_emitters`. Todos son encendido/apagado, sin reparto de energía.
- **`weapons`**: `preset_index` y `preset_name`; lista `weapons` (`name`, `is_powered`, `ready_to_fire`, `contained_in_preset`); `countermeasures` (`type` DECOY/NOISE y `amount`); ajustes como `gimbals_locked` y `staggered_fire`.
- **`actor`** (tu personaje)
  - `vitals`: `health`, `oxygen`, `hunger`, `thirst` y `body_temperature` (cada uno con `current` y `max`); además `heart_rate`, `gravity`, `pressure` e `intoxication_level`.
  - `state`: `locomotion` (ON_FOOT, EVA, SEATED), `crew_role` (PILOT, GUNNER, CREW), `seat_name` y **`uec_balance`**.
  - `environment`: `external_temperature`, `ambient_radiation_rate` y `breathable_atmosphere`.
- **`events`**: `ACTOR_ENTER_SEAT` y `ACTOR_LEAVE_SEAT` (de los demás tipos, ver «No confirmado»).
- **`force_feedback`** y **`turret`**: datos para hápticos. A CommandGlass no le sirven.

**No vienen**: posición ni coordenadas, sistema, planeta o estación, nivel de escudos, casco,
calor, munición, reparto de energía, carga, contratos, jugadores cercanos ni datos de minería
(láser, masa de la roca). El estado «en salto cuántico» no viene como campo: Wingman lo deduce de
`|g_meter| < 0,05`.

### Qué tiene ya CommandGlass (Game.log)

[`server/src/parser/rules.ts`](../server/src/parser/rules.ts) y
[`parser.ts`](../server/src/parser/parser.ts) sacan del log: inicio de sesión, *shard*, ubicación
(`RequestLocationInventory`), destino y llegada del salto cuántico, subir y bajar de la nave,
destrucción de vehículos, muertes, cuerpo y cama médica, contratos (aceptado, objetivos, fin),
compras en tiendas, equipo puesto o guardado, lista de vehículos y todas las notificaciones del HUD
(jurisdicción, armisticio, zonas, recompensas, grupo, tripulación, heridas, delitos, refinería,
*blueprints*, hangar). El saldo se pide a mano en Comercio, porque el log ya no lo escribe.

### Qué aporta en cada sección

| Sección | Qué gana con la telemetría | Valor |
|---|---|---|
| **Ahora** | Ficha de cabina en directo: nave (`name`/`class_name` tal cual), velocidad, altitud, G, hidrógeno, *boost*, tren, aterrizado y luces de aviso. Constantes del personaje (salud, O₂, hambre, sed, temperatura, radiación, atmósfera respirable). La vista se adapta a cómo vas: a pie, EVA o sentado como piloto o artillero | Alto |
| **Mandos** | Botones que muestran el **estado real**: tren fuera, luces, puertas bloqueadas, desacoplado, crucero, limitador, G-safe, ESP, energía de cada sistema y preset de armas. Hoy cada botón envía una tecla «a ciegas». Solo para mostrar el estado: ver regla en [Riesgos](#4-riesgos) | Alto |
| **Comercio** | **Saldo real** (`uec_balance`): se acaba el saldo a mano, y cada compra, venta o recompensa se puede cuadrar con la diferencia de saldo | Alto |
| **Combate** | Avisos `hit` (impacto), `misl` (misil), `shld` y `prox`; contramedidas que quedan; armas con energía y listas; salud del piloto; incapacitación (`health` a 0) cuando el log no la registra | Alto |
| **Hangar** | Uso real por nave: tiempo de vuelo, distancia (integrando `speed`), consumo de hidrógeno, aterrizajes. Identifica la nave con `class_name` y `manufacturer` del juego, sin traducirlos | Medio |
| **Bitácora** | Eventos nuevos deducidos y con límite de frecuencia: despegue y aterrizaje, inicio y fin del salto, combustible bajo, oxígeno bajo, atmósfera no respirable, intoxicación, incapacitado, «misil fijado» | Medio |
| **Archivo** | Totales por sesión: horas de vuelo, a pie y en EVA, velocidad y G máximas, hidrógeno gastado, aterrizajes, impactos recibidos | Medio |
| **Contratos** | Poco: salud y tiempo de vuelo durante cada contrato y el puesto que ocupabas (piloto o artillero) | Bajo |
| **Contactos** | Poco: tu `crew_role` y `seat_name` en naves de otros, que completa la tripulación que ya sale del log | Bajo |
| **Mapa** | Casi nada: sin posición. Solo el estado «en salto», la altitud y el rumbo cerca de un planeta | Bajo |

La **franja de estado (HUD)** inferior también mejora: puede llevar salud, hidrógeno y luces de
aviso visibles desde cualquier sección.

## 4. Riesgos

### ⚠️ Términos de uso y EasyAntiCheat

- **Sin documentación de CIG.** No aparece en las notas del parche 4.10.2 ni en Spectrum, ni hay
  ninguna declaración de CIG. Las herramientas que ya lo usan lo describen como «undocumented»;
  sc-copilot-mcp dice que CIG «has neither allowed nor forbidden it, as far as we know».
- **EasyAntiCheat:** activarlo no inyecta código, no lee memoria y no modifica ficheros del juego.
  Solo se cambia una variable de entorno que el propio ejecutable admite, y el juego abre el puerto
  por su cuenta. Aun así, **nadie lo ha confirmado con CIG ni con EAC**. El juego sabe que el
  ajuste está activo y que hay un cliente conectado, y no se sabe si lo comunica a sus servidores.
  No se conocen sanciones, pero eso no es garantía.
- **El esquema.** Para leer el stream hace falta el .proto, y el que existe se sacó de los
  descriptores incrustados en `StarCitizen.exe`. Extraerlos nosotros sería leer el ejecutable,
  igual que ya se lee Data.p4k sin modificarlo, pero se acerca a lo que los términos llaman
  ingeniería inversa. Copiar el .proto de Wingman obliga a cumplir la **GPLv3**, y eso choca con
  una app cerrada en la Microsoft Store.
- **Recomendación:** como el usuario tiene acuerdo con CIG, **preguntarles por escrito** antes de
  integrarlo: (1) si una app de la Store puede pedir al usuario que active
  `GRPC_CLIENT_SERVER_ENABLED` y leer el stream; (2) si afecta a EAC; (3) si nos pueden dar el
  .proto o permitir sacarlo del ejecutable. Mientras tanto: apagado por defecto, aviso claro y
  activación siempre en manos del usuario.

### Técnicos

- **Puerto sin autenticación.** Mientras está activo, cualquier programa del PC puede leer el
  stream, que incluye el saldo de aUEC. Y cualquier programa podría hacerse pasar por el juego en el
  2942: hay que tratar los datos como no fiables (límites de tamaño y validación).
- **Inestable entre parches.** Un parche puede cambiar campos y enums sin aviso. Hay que tolerar
  enums desconocidos y detectar un esquema incompatible. Si falla, se vuelve solo al Game.log.
- **Activarlo es incómodo.** La variable de usuario solo se aplica tras reiniciar del todo el RSI
  Launcher. CommandGlass es un paquete `.appx` con `runFullTrust`: no se ha comprobado si una app
  empaquetada puede escribir la variable de usuario sin que Windows la virtualice. Al principio
  mejor dar instrucciones y detectar el estado, en lugar de cambiar el entorno por el usuario.
- **Volumen.** 17 Hz es poco para la red, pero no hay que guardar los fotogramas en SQLite. Solo
  el estado actual en memoria, los eventos deducidos y los totales por sesión. Al tablet, a 4–5 Hz
  como mucho.

### De las reglas del proyecto

- **Nada de macros.** La telemetría nunca debe disparar teclas: nada de «si aterriza, saca el
  tren» ni de «si hay misil, lanza contramedidas». En Mandos solo **muestra** el estado. El envío
  sigue siendo una pulsación por cada toque del usuario, como hoy en
  [`keysender.ts`](../server/src/game/keysender.ts).
- **Nombres propios.** `name`, `class_name`, `manufacturer`, `seat_name` y `preset_name` se
  muestran tal cual llegan, sin traducir.
- **Ficheros del juego:** solo lectura, como siempre.

## 5. Reorganización de la navegación del tablet

### Cómo está ahora

[`client/src/App.tsx`](../client/src/App.tsx) tiene una **barra lateral (`.rail`) con 10
secciones planas**: Ahora, Mandos, Bitácora, Contactos, Hangar, Contratos, Combate, Comercio, Mapa
y Archivo. Además hay cabecera con el estado y una franja HUD inferior (`StatusBar`). La
navegación va por hash (`#seccion/detalle`). Con la telemetría habría más datos que pantallas, y
10 botones en la barra ya son muchos en vertical en un iPad.

### Propuesta: actividad primero, como GameGlass

Tres capas:

1. **Paneles de actividad.** Pantallas de mando táctiles con mosaicos grandes, que combinan
   piezas de varias secciones:

   | Panel | Qué reúne | Fuente principal |
   |---|---|---|
   | **Vuelo** | Velocidad, altitud, G, hidrógeno, *boost*, tren, modos IFCS, energía, destino del salto, botones de Mandos de vuelo con su estado | Telemetría + Game.log + Mandos |
   | **Combate** | Avisos (`hit`, `misl`, `shld`, `prox`), contramedidas, armas y preset, salud, últimas bajas y muertes, jurisdicción y delitos | Telemetría + Game.log |
   | **Comercio** | Saldo real, ganancias de la sesión, mercado (UEX), últimas compras, contrato de carga activo | Telemetría + UEX + Game.log |
   | **Industria** (minería y salvamento) | Refinería, energía y avisos de la nave, botones de modo minería o salvamento de Mandos. La telemetría no trae datos del láser: hay que decírselo al usuario | Game.log + Mandos |
   | **Exploración** | Destino y llegada del salto, mapa, ubicaciones nuevas, oxígeno, radiación y atmósfera al bajar | Game.log + telemetría + starmap |
   | **A pie** | Constantes vitales, heridas y cama médica, equipo puesto, oxígeno en EVA | Telemetría + Game.log |

   La app puede **sugerir** el panel según la actividad (sentado como piloto → Vuelo; `hit` o
   `misl` → Combate; a pie o en EVA → A pie). Solo cambia de panel sola si el usuario activa
   «Seguir la actividad», y con margen para que la pantalla no salte.

2. **Secciones agrupadas** en la barra lateral, de 10 a 6:
   - **Ahora**: el panel de actividad, con un selector de paneles arriba.
   - **Mandos**
   - **Misiones**: Contratos.
   - **Economía**: pestañas Comercio | Hangar.
   - **Gente**: Contactos.
   - **Registro**: pestañas Bitácora | Combate | Archivo | Mapa. O bien Mapa se queda como sección
     propia y Combate pasa al panel.

   Cada sección agrupada usa pestañas internas (`#economia/hangar`). Las rutas antiguas
   (`#bitacora`, `#hangar`…) redirigen a las nuevas para no romper accesos guardados.

3. **Accesos rápidos** siempre visibles:
   - Una **tira de botones fijados** (los que el usuario elija de Mandos, de 4 a 6, con su estado
     en directo) encima del HUD inferior, en cualquier panel.
   - **HUD inferior** pulsable: cada segmento lleva a su detalle (salud → A pie, nave → Vuelo,
     contratos → Misiones).
   - **Banda de alerta** arriba cuando una luz de aviso pasa a MAJOR, con un toque al panel Combate
     o Vuelo.

Más adelante, un **modo edición** para colocar los mosaicos de cada panel, como en GameGlass, con
la distribución guardada en el servidor.

Los estilos deben salir del sistema mobiGlas de [`client/DESIGN.md`](../client/DESIGN.md)
(paneles, celdas, `.seg-hud`). El rediseño de la sesión mobiglas-design ya cambió la estructura de
`App.tsx` (`TopBar`, `.rail`, `StatusBar`): la reorganización debe partir de esa versión.

## 6. Plan por fases

**Fase 0. Decisión (sin código)**
- Preguntar a CIG por el acuerdo: uso permitido, EAC y acceso al .proto (ver Riesgos).
- Decidir de dónde sale el esquema: el .proto de CIG (lo ideal), un decodificador propio por
  números de campo o el .proto GPLv3 (descartado para la Store).

**Fase 1. Prueba en el PC del usuario (con su permiso)**
- Activación solo para una sesión (sección 2), captura de unos minutos en vuelo, a pie, en
  combate y en salto cuántico, y vuelta atrás.
- Aclarar: unidades, `quantum_fuel`, eventos, vehículos de tierra y cuántico.
- Guardar las capturas como *fixtures* anonimizados (sin el saldo real) para los tests.

**Fase 2. Servidor: lector opcional**
- `server/src/telemetry/`: cliente HTTP/2 con `node:http2` (sin dependencias con *postinstall*),
  decodificador protobuf mínimo con límites de tamaño, reconexión con espera creciente y tolerancia
  a enums desconocidos.
- Ajuste **apagado por defecto**. Estado detectado por el Game.log (línea `registered`) y por una
  prueba TCP: no disponible / disponible / conectado / sin fotogramas / incompatible.
- `TelemetryState` normalizado en el *snapshot* del WebSocket a 4–5 Hz. Eventos deducidos con
  textos en español e inglés y el mismo formato que los demás. **No se guardan los fotogramas.**
- El informe de diagnóstico incluye el estado de la telemetría, sin el saldo.
- Tests con los *fixtures* de la fase 1.

**Fase 3. Interfaz: mejoras rápidas**
- Ahora: ficha de cabina y constantes.
- Comercio: saldo real, y el saldo a mano solo como respaldo.
- Mandos: estado en los botones (solo mostrar).
- Combate: avisos y contramedidas.
- HUD inferior: salud, hidrógeno y avisos.
- App de Windows: interruptor «Telemetría del juego», con explicación, riesgos e instrucciones
  para activar la variable, en español y en inglés.

**Fase 4. Reorganización de la navegación**
- Paneles de actividad, secciones agrupadas con pestañas, redirección de rutas antiguas, tira de
  accesos rápidos y banda de alerta.
- Todo funciona también **sin telemetría**: los paneles muestran lo que da el Game.log y avisan
  de que hay más datos si se activa.

**Fase 5. Historial y personalización**
- Totales por sesión y por nave en Archivo y Hangar.
- Modo edición de los paneles.
- Revisión en cada parche: detección de cambios de esquema y aviso en el diagnóstico.

## Fuentes

- Wingman AI, PR #521 «Star Citizen Telemetry» (Diftic, fusionado el 1 de noviembre de 2026):
  <https://github.com/ShipBit/wingman-ai/pull/521>. .proto en
  `services/sc_telemetry/sc_telemetry.proto` del PR.
- sc-copilot-mcp, PR #14 (lector opcional) y PR #19 (activar y desactivar), y `docs/TELEMETRY.md`:
  <https://github.com/ms-spown/sc-copilot-mcp/pull/14>,
  <https://github.com/ms-spown/sc-copilot-mcp/pull/19>,
  <https://github.com/ms-spown/sc-copilot-mcp/blob/main/docs/TELEMETRY.md>.
- m1ndgames/sc-api: otro camino, **descartado**. Se hace pasar por el protocolo D-BOX, exige la DLL
  de D-BOX y cambiar su configuración: <https://github.com/m1ndgames/sc-api>.
- Notas del parche 4.10.2 (no mencionan la telemetría):
  <https://robertsspaceindustries.com/en/comm-link/Patch-Notes/21351-Star-Citizen-Alpha-4102>,
  <https://starcitizen.tools/Update:Star_Citizen_Alpha_4.10.2>.
- Hilo de Reddit indicado (**no se ha podido leer**: Reddit bloquea la descarga automática):
  <https://www.reddit.com/r/starcitizen/comments/1y10wzx/new_telemetry_feature_is_insane/>.
- Comprobación local, solo lectura: `LIVE\Game.log`, `LIVE\build_manifest.id` y las cadenas de
  `LIVE\Bin64\StarCitizen.exe`.
