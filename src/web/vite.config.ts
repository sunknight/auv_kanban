import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:38311',
      '/socket.io': { target: 'http://localhost:38311', ws: true },
    },
  },
  build: {
    outDir: '../../dist/web-dist',
    emptyOutDir: true,
  },
});
