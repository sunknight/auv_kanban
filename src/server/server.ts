import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Server as SocketIOServer } from 'socket.io';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { listProjects } from '../core/projects.js';
import { registerRoutes } from './routes/index.js';
import { WatchManager } from './watch-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ServerOptions {
  port: number;
}

export async function startServer(opts: ServerOptions): Promise<void> {
  const fastify = Fastify({ logger: true });

  // 静态托管前端构建产物（dist/web-dist，构建后存在；前端 task 完成前不存在，跳过）
  const webDist = join(__dirname, '..', 'web-dist');
  if (existsSync(webDist)) {
    await fastify.register(fastifyStatic, { root: webDist, prefix: '/' });
  }

  // socket.io（挂到同一 http server）
  const io = new SocketIOServer(fastify.server, { cors: { origin: '*' } });

  // watch manager：给每个已注册项目起 watcher，变化广播
  const watchManager = new WatchManager(io);
  watchManager.startAll(listProjects());

  // REST 路由
  await registerRoutes(fastify, { watchManager });

  io.on('connection', (socket) => {
    socket.on('subscribe', (projectPath: string) => socket.join(`proj:${projectPath}`));
  });

  // host 用 0.0.0.0 而非 localhost：后者会同时绑 IPv4+IPv6 双栈，
  // socket.io 只 attach 到其中一个 handle，导致走 127.0.0.1（IPv4）的
  // /socket.io/ 请求落到 fastify 路由层返回 404。
  await fastify.listen({ port: opts.port, host: '0.0.0.0' });
  console.log(`看板服务已启动：http://localhost:${opts.port}`);
}
