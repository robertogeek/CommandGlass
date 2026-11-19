import '@fontsource/rajdhani/400.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';
import '@fontsource/saira-semi-condensed/400.css';
import '@fontsource/saira-semi-condensed/500.css';
import '@fontsource/saira-semi-condensed/600.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { InstallGuide } from './components/InstallGuide.tsx';
import { ContractToast } from './components/ContractGains.tsx';
import { AlertCenter } from './components/AlertCenter.tsx';
import { LangProvider } from './lang.tsx';
import { LiveProvider } from './live.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* El idioma va por fuera: al cambiarlo se reabre la conexión en directo y llegan los textos del servidor ya traducidos. */}
    <LangProvider>
      <LiveProvider>
        <App />
        <ContractToast />
        <AlertCenter />
        <InstallGuide />
      </LiveProvider>
    </LangProvider>
  </StrictMode>,
);
