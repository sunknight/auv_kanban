import { spawn } from 'child_process';

/**
 * 打开任务目录（macOS Finder / Windows 资源管理器 / Linux xdg-open）。
 * 浏览器无法直接唤起本地文件管理器，由 serve 进程代为执行系统命令。
 */

/** 各平台打开目录的命令规格。参数只收服务端定位出的目录绝对路径。 */
export interface OpenerSpec {
  cmd: string;
  buildArgs: (dir: string) => string[];
}

/** 平台 → 文件管理器命令映射（纯函数，便于单测）。未知平台返回 null。 */
export function openerFor(platform: NodeJS.Platform): OpenerSpec | null {
  switch (platform) {
    case 'darwin': return { cmd: 'open', buildArgs: dir => [dir] };
    case 'win32': return { cmd: 'explorer', buildArgs: dir => [dir] };
    case 'linux': return { cmd: 'xdg-open', buildArgs: dir => [dir] };
    default: return null;
  }
}

/** spawn 返回对象的最小结构：测试注入 fake 时只需实现 on() */
export interface ChildLike {
  on(event: 'error' | 'exit', listener: (...args: unknown[]) => void): unknown;
}
export type SpawnLike = (cmd: string, args: string[]) => ChildLike;

const defaultSpawn: SpawnLike = (cmd, args) =>
  // 无 shell：命令与参数均由服务端决定，不经任何 shell 解析
  spawn(cmd, args, { shell: false, detached: true, stdio: 'ignore' });

/**
 * 用系统文件管理器打开目录，返回是否成功发起。
 * 成败只看 spawn 的 error 事件——Windows explorer 即使成功打开也常以
 * 非 0 退出码退出，故 exit（无论码值）与超时均视为已发起成功。
 */
export function openDirInFileManager(
  dir: string,
  opts: { platform?: NodeJS.Platform; spawnFn?: SpawnLike; timeoutMs?: number } = {},
): Promise<boolean> {
  const { platform = process.platform, spawnFn = defaultSpawn, timeoutMs = 3000 } = opts;
  const spec = openerFor(platform);
  if (!spec) return Promise.resolve(false);
  return new Promise(resolve => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    let child: ChildLike;
    try {
      child = spawnFn(spec.cmd, spec.buildArgs(dir));
    } catch {
      resolve(false);
      return;
    }
    child.on('error', () => done(false));
    child.on('exit', () => done(true));
    // 兜底超时：进程迟迟不退出也视为已发起（不阻塞请求），定时器不占用事件循环
    const timer = setTimeout(() => done(true), timeoutMs);
    timer.unref?.();
  });
}
