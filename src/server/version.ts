import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 读包根 package.json 的 version。
 * 默认路径基于本文件位置向上两级（src/server 或 dist/server → 包根），
 * tsx dev、dist 产物、npm 全局安装三种形态都指向同一份 package.json。
 * 读取失败（缺文件/解析错/无 version 字段）返回 null——版本只是启动横幅的
 * 点缀，绝不让它把服务启动搞挂。
 */
export function readPackageVersion(pkgRoot: string = join(__dirname, '..', '..')): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' && pkg.version ? pkg.version : null;
  } catch {
    return null;
  }
}

/**
 * 拼启动横幅：版本（可为 null，此时省略首行）+ 服务地址 + 简要用法 + 停止方式。
 * 面向首次使用者的最小引导，细则不进终端——Web 页内帮助（help.ts）有完整说明。
 */
export function buildStartupBanner(port: number, version: string | null): string {
  const lines = [
    ...(version ? [`auv-kanban v${version}`] : []),
    `看板服务已启动：http://localhost:${port}（仅本机可达）`,
    '',
    '浏览器打开上述地址即可使用看板：拖动卡片移动栏，点卡片看详情（子任务、文档预览），文件变化自动刷新。',
    '停止服务：在本终端按 Ctrl+C',
  ];
  return lines.join('\n');
}
