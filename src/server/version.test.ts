import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readPackageVersion, buildStartupBanner } from './version.js';

describe('readPackageVersion（读包根 package.json）', () => {
  it('默认路径（本仓库包根）读出真实版本号（x.y.z 形态）', () => {
    const v = readPackageVersion();
    expect(v).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('指定目录含 package.json → 返回其 version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kb-ver-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', version: '9.9.9' }));
      expect(readPackageVersion(dir)).toBe('9.9.9');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('目录无 package.json → null（兜底，不抛错）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kb-ver-'));
    try {
      expect(readPackageVersion(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('package.json 无 version 字段 → null', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kb-ver-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
      expect(readPackageVersion(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('buildStartupBanner（启动横幅）', () => {
  it('有版本：首行为 auv-kanban v<版本>，含地址、用法、停止提示', () => {
    const banner = buildStartupBanner(38311, '0.6.0');
    const lines = banner.split('\n');
    expect(lines[0]).toBe('auv-kanban v0.6.0');
    expect(lines).toContain('看板服务已启动：http://localhost:38311（仅本机可达）');
    expect(banner).toContain('浏览器打开上述地址');
    expect(banner).toContain('停止服务');
    expect(lines.length).toBe(5);
  });

  it('无版本：省略版本行，地址成为首行，其余不变', () => {
    const banner = buildStartupBanner(38311, null);
    const lines = banner.split('\n');
    expect(lines[0]).toBe('看板服务已启动：http://localhost:38311（仅本机可达）');
    expect(lines.some(l => l.startsWith('auv-kanban v'))).toBe(false);
    expect(banner).toContain('停止服务');
  });

  it('端口写入地址', () => {
    expect(buildStartupBanner(38511, '1.0.0')).toContain('http://localhost:38511');
  });
});
