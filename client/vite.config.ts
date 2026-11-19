import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// En desarrollo, Vite (5173) reenvía la API al servidor de CommandGlass (8777, o CG_API_PORT si la app instalada ya usa ese puerto).
const api = `http://localhost:${process.env.CG_API_PORT ?? 8777}`;
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: api, changeOrigin: false },
      '/manifest.webmanifest': api,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Dos páginas: la app del iPad (index) y la ventana de escritorio con el QR (desktop).
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('index.html', import.meta.url)),
        desktop: fileURLToPath(new URL('desktop.html', import.meta.url)),
      },
    },
  },
});
