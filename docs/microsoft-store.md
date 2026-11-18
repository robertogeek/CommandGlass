# Publicar CommandGlass en la Microsoft Store

La Store firma el paquete al publicarlo. Así Windows no muestra el aviso de SmartScreen ni lo bloquea Smart App Control, y las actualizaciones llegan solas. Para cuentas individuales, el registro de desarrollador es gratuito.

## 1. Cuenta de desarrollador (una vez)

1. Entra en [storedeveloper.microsoft.com](https://storedeveloper.microsoft.com) con tu cuenta Microsoft y elige **Individual**.
2. Verifica tu identidad: documento oficial y una foto. Suele tardar entre unas horas y un par de días.
3. Rellena los datos de editor. El **nombre para mostrar del editor** sale en la ficha de la app; puede ser «Space Cowboys».

## 2. Reservar la app

1. En [Partner Center](https://partner.microsoft.com/dashboard/apps-and-games/overview): **Aplicaciones y juegos → Nueva aplicación → Aplicación MSIX o PWA**.
2. Reserva el nombre **CommandGlass**. Si está cogido, elige otro y cámbialo también en `productName` (`package.json`) y en `displayName` (`electron-builder.config.cjs`).
3. Abre **Administración de productos → Identidad del producto**. Apunta tres valores:
   - `Package/Identity/Name`, por ejemplo `12345SpaceCowboys.CommandGlass`.
   - `Package/Identity/Publisher`, del tipo `CN=XXXXXXXX-XXXX-…`.
   - `Package/Properties/PublisherDisplayName`.

## 3. Construir el paquete

**En GitHub (recomendado).** Ve a **Settings → Secrets and variables → Actions → Variables** y crea estas variables. No son secretas: forman parte de la ficha pública.

| Variable | Valor |
|---|---|
| `APPX_IDENTITY` | `Package/Identity/Name` |
| `APPX_PUBLISHER` | `Package/Identity/Publisher` |
| `APPX_PUBLISHER_NAME` | `PublisherDisplayName` |

Después lanza **Actions → Microsoft Store → Run workflow**. El `.appx` queda en los artefactos de la ejecución.

**En tu PC.** Necesitas el SDK de Windows (ya lo tienes: 10.0.26100):

```powershell
$env:CG_APPX_IDENTITY = '12345SpaceCowboys.CommandGlass'
$env:CG_APPX_PUBLISHER = 'CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX'
$env:CG_APPX_PUBLISHER_NAME = 'Space Cowboys'
$env:ELECTRON_BUILDER_WINDOWS_KITS_PATH = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64'
npm run dist:store
```

El resultado es `release\commandglass_v.<versión>.appx`. Sin las variables `CG_APPX_*` sale con una identidad de prueba que Partner Center no acepta.

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
   - Descripción, al menos una captura de 1366×768 o mayor, y el logo. Para capturas sin la marca de CIG, usa la ventana del PC (QR) y secciones como Comercio o Contratos.
   - **Aviso de fans** al final de la descripción:
     > Herramienta de fans no oficial, sin relación con Cloud Imperium Games. Star Citizen®, Roberts Space Industries® y Cloud Imperium® son marcas registradas de Cloud Imperium Rights LLC.
   - **Directiva de privacidad**: la Store pide una URL si la app maneja datos personales; CommandGlass guarda nombres de jugadores del registro, solo en local. Puedes publicar el texto de abajo en una página pública, por ejemplo un gist o GitHub Pages; el repositorio es privado.
7. **Enviar a certificación**. Suele tardar entre unas horas y tres días laborables.

### Directiva de privacidad (texto para publicar)

> CommandGlass funciona en tu PC. Lee el registro de Star Citizen (Game.log) y los ficheros del juego, solo en lectura, y guarda tu historial en una base de datos local en tu equipo. No envía tus datos a nadie: no hay cuentas, analíticas ni publicidad. El tablet se conecta directamente a tu PC por tu red local. La app descarga información pública de la Star Citizen Wiki (api.star-citizen.wiki), de StarStrings (GitHub) y, si pones tu token, precios de UEX (uexcorp.space); esas peticiones no incluyen tu historial. Tu token de UEX se guarda solo en tu PC. Al desinstalar la app de la Store, Windows borra sus datos.

## 5. Probarlo antes de enviar (opcional)

Windows solo instala paquetes firmados. Para probar el `.appx` en tu PC antes de la Store:

1. Firma el paquete con un certificado de prueba. Su sujeto debe ser exactamente el `Publisher` del paquete (`CN=CommandGlass Dev` si lo construiste sin variables).
2. Añade ese certificado a *Personas de confianza* del equipo. Hace falta ser administrador.

```powershell
$cert = New-SelfSignedCertificate -Type Custom -Subject 'CN=CommandGlass Dev' -KeyUsage DigitalSignature -CertStoreLocation Cert:\CurrentUser\My -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
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
| Firewall (redes privadas) | Regla que añade el instalador | Regla declarada en el paquete |
| Abrir al iniciar Windows | Interruptor en la app | Configuración → Aplicaciones → Inicio (la app lleva ahí) |
| Actualizaciones | Descargar el nuevo `.exe` | Automáticas desde la Store |
| Datos al desinstalar | Se conservan en `%APPDATA%\CommandGlass` | Windows los borra con la app |

Las dos versiones pueden convivir, pero no las abras a la vez: usan el mismo puerto (8777).
