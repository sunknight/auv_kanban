import { describe, it, expect } from 'vitest';
import { openerFor, openDirInFileManager, type SpawnLike, type ChildLike } from './open-dir.js';

describe('openerFor（平台 → 命令映射）', () => {
  it('darwin → open <dir>（macOS Finder，优先平台）', () => {
    const spec = openerFor('darwin')!;
    expect(spec.cmd).toBe('open');
    expect(spec.buildArgs('/tmp/任务 0001')).toEqual(['/tmp/任务 0001']);
  });

  it('win32 → explorer <dir>', () => {
    const spec = openerFor('win32')!;
    expect(spec.cmd).toBe('explorer');
    expect(spec.buildArgs('C:\\kb\\task')).toEqual(['C:\\kb\\task']);
  });

  it('linux → xdg-open <dir>', () => {
    const spec = openerFor('linux')!;
    expect(spec.cmd).toBe('xdg-open');
    expect(spec.buildArgs('/tmp/x')).toEqual(['/tmp/x']);
  });

  it('未知平台 → null', () => {
    expect(openerFor('freebsd')).toBeNull();
    expect(openerFor('sunos')).toBeNull();
  });
});

/** 造一个可编程的 fake spawn：记录调用，并在微任务里触发指定事件（模拟进程异步 exit/error） */
function makeFakeSpawn(outcome: 'exit' | 'error' | 'never' | 'throw') {
  const calls: { cmd: string; args: string[] }[] = [];
  const spawnFn: SpawnLike = (cmd, args) => {
    calls.push({ cmd, args });
    if (outcome === 'throw') throw new Error('spawn 不可用');
    const listeners: Record<string, (...a: unknown[]) => void> = {};
    const child: ChildLike = {
      on: (event, listener) => { listeners[event] = listener; },
    };
    if (outcome !== 'never') {
      queueMicrotask(() => listeners[outcome]?.());
    }
    return child;
  };
  return { spawnFn, calls };
}

describe('openDirInFileManager（行为）', () => {
  it('进程正常 exit → true，且按平台选对命令、目录作为唯一参数', async () => {
    const fake = makeFakeSpawn('exit');
    const ok = await openDirInFileManager('/tmp/dir', { platform: 'darwin', spawnFn: fake.spawnFn });
    expect(ok).toBe(true);
    expect(fake.calls).toEqual([{ cmd: 'open', args: ['/tmp/dir'] }]);
  });

  it('spawn error（如命令不存在）→ false', async () => {
    const fake = makeFakeSpawn('error');
    const ok = await openDirInFileManager('/tmp/dir', { platform: 'linux', spawnFn: fake.spawnFn });
    expect(ok).toBe(false);
    expect(fake.calls).toEqual([{ cmd: 'xdg-open', args: ['/tmp/dir'] }]);
  });

  it('explorer 以非 0 退出码 exit 仍算成功（Windows 已知行为，不按退出码判败）', async () => {
    const fake = makeFakeSpawn('exit');
    const ok = await openDirInFileManager('C:\\t', { platform: 'win32', spawnFn: fake.spawnFn });
    expect(ok).toBe(true);
    expect(fake.calls[0].cmd).toBe('explorer');
  });

  it('不支持的平台 → false 且不 spawn', async () => {
    const fake = makeFakeSpawn('exit');
    const ok = await openDirInFileManager('/tmp/dir', { platform: 'freebsd', spawnFn: fake.spawnFn });
    expect(ok).toBe(false);
    expect(fake.calls).toEqual([]);
  });

  it('spawn 同步抛异常 → false（不向上冒泡）', async () => {
    const fake = makeFakeSpawn('throw');
    const ok = await openDirInFileManager('/tmp/dir', { platform: 'darwin', spawnFn: fake.spawnFn });
    expect(ok).toBe(false);
  });

  it('进程一直不退出 → 超时兜底视为已发起成功', async () => {
    const fake = makeFakeSpawn('never');
    const ok = await openDirInFileManager('/tmp/dir', { platform: 'darwin', spawnFn: fake.spawnFn, timeoutMs: 10 });
    expect(ok).toBe(true);
  });
});
