// Configuración del instalador de Windows (electron-builder + NSIS).
// La firma es opcional: se activa sola si el CI (o tu PC) tiene las credenciales en variables de entorno.
//   - Certificado .pfx (OV/EV en fichero):  CSC_LINK + CSC_KEY_PASSWORD
//   - Azure Artifact Signing:               AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET,
//                                           CG_AZURE_ENDPOINT, CG_AZURE_ACCOUNT, CG_AZURE_PROFILE, CG_AZURE_PUBLISHER
// Sin nada de eso, el instalador sale sin firmar (Windows mostrará el aviso de SmartScreen).

const { version } = require('./package.json');

/** "0.1.0-beta" → "commandglass_v.0.1.0_b" (la etiqueta de versión que se reparte). */
function releaseName(v) {
  const [base, pre] = v.split('-');
  return `commandglass_v.${base}${pre ? `_${pre[0]}` : ''}`;
}

const azure = process.env.CG_AZURE_ENDPOINT
  ? {
      azureSignOptions: {
        publisherName: process.env.CG_AZURE_PUBLISHER,
        endpoint: process.env.CG_AZURE_ENDPOINT,
        codeSigningAccountName: process.env.CG_AZURE_ACCOUNT,
        certificateProfileName: process.env.CG_AZURE_PROFILE,
      },
    }
  : {};

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.spacecowboys.commandglass',
  productName: 'CommandGlass',
  copyright: 'Space Cowboys · Proyecto de fans de Star Citizen, sin relación con Cloud Imperium Games',
  directories: { output: 'release', buildResources: 'desktop/build' },
  files: ['desktop/dist/main.mjs', 'desktop/dist/preload.cjs', 'package.json', '!node_modules/**/*'],
  extraResources: [
    { from: 'desktop/dist/server.mjs', to: 'server/server.mjs' },
    { from: 'client/dist', to: 'client' },
    { from: 'client/public/icon-192.png', to: 'assets/icon.png' },
  ],
  asar: true,
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'client/public/icon-512.png',
    executableName: 'CommandGlass',
    ...azure,
  },
  nsis: {
    oneClick: false,
    perMachine: true,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'CommandGlass',
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
    installerLanguages: ['es_ES'],
    language: '3082',
    multiLanguageInstaller: false,
    artifactName: `${releaseName(version)}.\${ext}`,
    uninstallDisplayName: 'CommandGlass',
    include: 'desktop/build/installer.nsh',
  },
  // Paquete para la Microsoft Store (`npm run dist:store`). La Store lo firma al publicarlo: aquí no se firma.
  // Identidad reservada en Partner Center (Administración de productos → Identidad del producto); no es secreta.
  // Store ID 9MX5DG0F5P0T · Package Family Name Robertogeek.CommandGlass_2j3dhx9tjwb8m.
  // CG_APPX_IDENTITY, CG_APPX_PUBLISHER y CG_APPX_PUBLISHER_NAME la sustituyen si hiciera falta.
  appx: {
    identityName: process.env.CG_APPX_IDENTITY || 'Robertogeek.CommandGlass',
    publisher: process.env.CG_APPX_PUBLISHER || 'CN=9EF8BF77-F65D-4B45-98CA-94F1BEB120C9',
    publisherDisplayName: process.env.CG_APPX_PUBLISHER_NAME || 'Robertogeek',
    displayName: 'CommandGlass',
    applicationId: 'CommandGlass',
    backgroundColor: '#04070b',
    languages: ['es-ES', 'en-US'],
    customManifestPath: 'appxmanifest.xml',
    minVersion: '10.0.17763.0',
    maxVersionTested: '10.0.26100.0',
    artifactName: `${releaseName(version)}.\${ext}`,
  },
  publish: null,
};
