import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 后端端口：读 PORT 环境变量（默认 38311），与 serve.ts 一致。
// 开发调试时前后端用同一 PORT：PORT=38411 npm run dev:web
const backendPort = process.env.PORT ?? '38311';
const backend = `http://localhost:${backendPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': backend,
      '/socket.io': { target: backend, ws: true },
    },
  },
  build: {
    outDir: '../../dist/web-dist',
    emptyOutDir: true,
  },
});
