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
import { LiveProvider } from './live.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LiveProvider>
      <App />
      <InstallGuide />
    </LiveProvider>
  </StrictMode>,
);
