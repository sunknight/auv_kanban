import { startServer } from '../../server/server.js';
import { readGlobalConfig } from '../../core/projects.js';

export const serveCommand = {
  command: 'serve',
  describe: '启动本地 Web 服务',
  builder: (yargs: any) => yargs.option('port', { type: 'number', default: undefined }),
  handler: async (argv: any) => {
    const cfg = readGlobalConfig();
    const port = argv.port ?? cfg.defaultPort;
    await startServer({ port });
  },
};
