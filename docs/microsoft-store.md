# Publicar CommandGlass en la Microsoft Store

La Store firma el paquete al publicarlo. Así Windows no muestra el aviso de SmartScreen ni lo bloquea Smart App Control, y las actualizaciones llegan solas. Para cuentas individuales, el registro de desarrollador es gratuito.

## 1. Cuenta de desarrollador (una vez)

1. Entra en [storedeveloper.microsoft.com](https://storedeveloper.microsoft.com) con tu cuenta Microsoft y elige **Individual**.
2. Verifica tu identidad: documento oficial y una foto. Suele tardar entre unas horas y un par de días.
3. Rellena los datos de editor. El **nombre para mostrar del editor** sale en la ficha de la app (ahora es «Robertogeek»).

## 2. Reservar la app

Hecho: el nombre **CommandGlass** está reservado. La identidad del producto ya está en `electron-builder.config.cjs`:

| Campo | Valor |
|---|---|
| `Package/Identity/Name` | `Robertogeek.CommandGlass` |
| `Package/Identity/Publisher` | `CN=9EF8BF77-F65D-4B45-98CA-94F1BEB120C9` |
| `PublisherDisplayName` | `Robertogeek` |
| Package Family Name | `Robertogeek.CommandGlass_2j3dhx9tjwb8m` |
| Store ID | `9MX5DG0F5P0T` |
| Ficha | <https://apps.microsoft.com/detail/9MX5DG0F5P0T> |

## 3. Construir el paquete

**En GitHub (recomendado).** Lanza **Actions → Microsoft Store → Run workflow**. El `.appx` queda en los artefactos de la ejecución.

**En tu PC.** Necesitas el SDK de Windows (ya lo tienes: 10.0.26100):

```powershell
$env:ELECTRON_BUILDER_WINDOWS_KITS_PATH = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64'; npm run dist:store
```

El resultado es `release\commandglass_v.<versión>.appx`.

**Versión.** La Store usa cuatro números: `0.1.0-beta` se convierte en `0.1.0.0`. El último debe ser 0, y cada envío necesita una versión mayor que el anterior, así que sube `version` en `package.json` antes de cada envío.

## 4. Primer envío en Partner Center

1. **Precios y disponibilidad**
   - Precio: **Gratis**.
   - Visibilidad: **Audiencia privada**. Crea un grupo de clientes conocidos con los correos de cuenta Microsoft de los compis de la organización. Solo ellos la verán y podrán instalarla, con el enlace que te dará Partner Center. Más adelante puedes hacerla pública.
2. **Propiedades**
   - Categoría: **Utilidades y herramientas**.
   - Indica que usa Internet: descarga datos de UEX, la wiki y StarStrings.
3. **Clasificación por edades**: rellena el cuestionario IARC. No tiene contenido propio, solo muestra datos del juego.
4. **Paquetes**: arrastra el `.appx`. Partner Center valida la identidad y la versión.
5. **Opciones de envío → Funcionalidades restringidas**: el paquete declara `runFullTrust`, como cualquier app de escritorio empaquetada. Justificación sugerida:
   > CommandGlass es una aplicación de escritorio (Electron) empaquetada. Necesita ejecutarse con plena confianza para leer el registro del juego (Game.log) en la carpeta de instalación de Star Citizen, servir una página web en la red local para el tablet del propio usuario y enviar pulsaciones de teclado al juego cuando el usuario lo pide desde el tablet.
6. **Ficha de Store** (español y, si quieres, inglés):
   - Descripción, al menos una captura de 1366×768 o mayor, y el logo.
   - **Avisos de CIG**: usa los textos de su [Fankit and Fandom FAQ](https://support.robertsspaceindustries.com/hc/en-us/articles/360006895793-Star-Citizen-Fankit-and-Fandom-FAQ), tal cual y en inglés. Son los mismos que salen en la app y en la web:
     > This is an unofficial Star Citizen fan project, not affiliated with the Cloud Imperium group of companies. Star Citizen®, Roberts Space Industries® and Cloud Imperium® are registered trademarks of Cloud Imperium Rights LLC.

     El logo «Made by the Community» va en la ventana de Windows (arriba a la derecha) y en la web; el original está en esa misma FAQ.
   - En **Notas para la certificación**, indica que tienes un acuerdo con CIG para usar sus marcas y su estética. Ten a mano una copia o una carta de CIG: la Store puede pedir pruebas de que tienes derecho a usar propiedad intelectual de terceros.
   - **Directiva de privacidad**: la Store pide una URL si la app maneja datos personales; CommandGlass guarda nombres de jugadores del registro, solo en local. Puedes publicar el texto de abajo en una página pública, por ejemplo un gist o GitHub Pages; el repositorio es privado.
7. **Enviar a certificación**. Suele tardar entre unas horas y tres días laborables.

### Directiva de privacidad (texto para publicar)

> CommandGlass funciona en tu PC. Lee el registro de Star Citizen (Game.log) y los ficheros del juego, solo en lectura, y guarda tu historial en una base de datos local en tu equipo. No envía tus datos a nadie: no hay cuentas, analíticas ni publicidad. El tablet se conecta directamente a tu PC por tu red local. La app descarga información pública de la Star Citizen Wiki (api.star-citizen.wiki), de StarStrings (GitHub) y, si pones tu token, precios de UEX (uexcorp.space); esas peticiones no incluyen tu historial. Tu token de UEX se guarda solo en tu PC. Al desinstalar la app de la Store, Windows borra sus datos.

## 5. Probarlo antes de enviar (opcional)

Windows solo instala paquetes firmados. Para probar el `.appx` en tu PC antes de la Store:

1. Firma el paquete con un certificado de prueba. Su sujeto debe ser exactamente el `Publisher` del paquete.
2. Añade ese certificado a *Personas de confianza* del equipo. Hace falta ser administrador.

```powershell
$cert = New-SelfSignedCertificate -Type Custom -Subject 'CN=9EF8BF77-F65D-4B45-98CA-94F1BEB120C9' -KeyUsage DigitalSignature -CertStoreLocation Cert:\CurrentUser\My -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
```

```powershell
$pass = ConvertTo-SecureString 'prueba' -Force -AsPlainText; Export-PfxCertificate -Cert $cert -FilePath release\prueba.pfx -Password $pass
```

```powershell
& 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe' sign /fd SHA256 /f release\prueba.pfx /p prueba release\commandglass_v.0.1.0_b.appx
```

```powershell
Import-Certificate -FilePath (Export-Certificate -Cert $cert -FilePath release\prueba.cer).FullName -CertStoreLocation Cert:\LocalMachine\TrustedPeople
```

```powershell
Add-AppxPackage release\commandglass_v.0.1.0_b.appx
```

Cuando termines, desinstálala desde Inicio y borra el certificado de *Personas de confianza* (`certlm.msc`). Ese paquete no vale para la Store: allí se sube sin firmar.

## Diferencias con el instalador `.exe`

| | Instalador `.exe` (NSIS) | Microsoft Store |
|---|---|---|
| Aviso de Windows | SmartScreen mientras no esté firmado | Ninguno: la firma la Store |
| Carpeta de Star Citizen | La pregunta el instalador | Se detecta sola al abrir; si no, se elige en la ventana del PC |
| Token de UEX | Obligatorio en la configuración inicial de la ventana del PC | Igual |
| Firewall (redes privadas) | Regla que añade el instalador | Regla declarada en el paquete |
| Abrir al iniciar Windows | Interruptor en la app | Configuración → Aplicaciones → Inicio (la app lleva ahí) |
| Actualizaciones | Descargar el nuevo `.exe` | Automáticas desde la Store |
| Datos al desinstalar | Se conservan en `%APPDATA%\CommandGlass` | Windows los borra con la app |

Las dos versiones pueden convivir, pero no las abras a la vez: usan el mismo puerto (8777).
