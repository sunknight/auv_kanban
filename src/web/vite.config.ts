import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 端口变量（开发模式）：
// - PORT：vite 自己监听的端口（浏览器访问的端口），默认 38411
// - BACKEND_PORT：后端 serve 的端口（vite 的 /api、/socket.io proxy 转发目标），默认 38511
// 两者分离，让前端和后端各听各的端口，避免双进程抢同一端口。
// 开发约定：dev:server 默认听 38511，dev:web 默认听 38411 并 proxy 到 38511，两者自动配对。
const vitePort = process.env.PORT ?? '38411';
const backendPort = process.env.BACKEND_PORT ?? '38511';
const backend = `http://localhost:${backendPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(vitePort),
    strictPort: true, // 端口被占直接报错，不自动+1，避免与预期不符
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
