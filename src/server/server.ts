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
  // logger 仅记错误：避免对每个 HTTP 请求（含 socket.io 高频轮询）刷屏（任务 0008）。
  // 正常请求静默，仅在出错（4xx/5xx、未捕获异常）时输出，便于排查。
  const fastify = Fastify({ logger: { level: 'error' } });

  // 静态托管前端构建产物（dist/web-dist，构建后存在；前端 task 完成前不存在，跳过）
  const webDist = join(__dirname, '..', 'web-dist');
  if (existsSync(webDist)) {
    await fastify.register(fastifyStatic, { root: webDist, prefix: '/' });
  }

  // socket.io（挂到同一 http server）。前端与 API/WS 同源（静态托管在同一 fastify），
  // 故 CORS 用 origin:true 回显请求源——等价同源放行，避免开放跨域（修复 F5）。
  const io = new SocketIOServer(fastify.server, { cors: { origin: true } });

  // watch manager：给每个已注册项目起 watcher，变化广播
  const watchManager = new WatchManager(io);
  watchManager.startAll(listProjects());

  // REST 路由
  await registerRoutes(fastify, { watchManager });

  io.on('connection', (socket) => {
    socket.on('subscribe', (projectPath: string) => socket.join(`proj:${projectPath}`));
  });

  // host 绑 127.0.0.1：纯 IPv4 单栈，既规避双栈 localhost 下 socket.io 只 attach
  // 单个 handle 的 404 问题，又确保服务仅本机可达（修复 F5：避免同网段访问）。
  // 如需远程访问请自行加反向代理 + 鉴权，勿直接改为 0.0.0.0。
  await fastify.listen({ port: opts.port, host: '127.0.0.1' });
  console.log(`看板服务已启动：http://localhost:${opts.port}（仅本机可达）`);
}
