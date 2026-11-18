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
  publish: null,
};
