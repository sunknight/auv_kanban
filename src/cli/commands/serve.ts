import { startServer } from '../../server/server.js';
import { readGlobalConfig } from '../../core/projects.js';

export const serveCommand = {
  command: 'serve',
  describe: '启动本地 Web 服务',
  builder: (yargs: any) => yargs.option('port', { type: 'number', default: undefined }),
  handler: async (argv: any) => {
    const cfg = readGlobalConfig();
    // 端口优先级：--port 参数 > PORT 环境变量 > config.defaultPort
    // 加 PORT 环境变量是为开发调试时方便指定端口（避免与正式版 38311 冲突），
    // 用法：PORT=38411 npm run dev:server
    const envPort = process.env.PORT ? Number(process.env.PORT) : undefined;
    const port = argv.port ?? envPort ?? cfg.defaultPort;
    await startServer({ port });
  },
};
