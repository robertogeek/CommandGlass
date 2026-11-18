import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo, Vite (5173) reenvía la API al servidor de CommandGlass (8777).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8777', changeOrigin: false },
      '/manifest.webmanifest': 'http://localhost:8777',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
