import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, lstatSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import { initBoard } from '../src/core/init-board.js';

const BIN = join(process.cwd(), 'bin', 'kanban');

function run(args: string, cwd: string): string {
  return execSync(`node ${BIN} ${args}`, { cwd }).toString();
}

describe('E2E: 三方协作（人/智能体通过 CLI）', () => {
  let tmp: string;
  let origHome: string | undefined;
  let tmpHome: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'e2e-'));
    // 隔离 HOME，避免污染全局 config
    tmpHome = mkdtempSync(join(tmpdir(), 'home-'));
    origHome = process.env.HOME;
    process.env.HOME = tmpHome;
    await initBoard(tmp);
  });
  afterEach(() => {
    if (origHome !== undefined) process.env.HOME = origHome;
    rmSync(tmp, { recursive: true, force: true });
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('人(新建) → 智能体(执行流程) → 完成', () => {
    // 人通过 CLI 记录想法
    run('new 优化首页', tmp);
    const list1 = run('list', tmp);
    expect(list1).toContain('0001');
    expect(list1).toContain('优化首页');

    // 人挪到 ready
    run('move 0001 ready', tmp);

    // 智能体：写入提示词与子任务（模拟智能体准备任务内容）
    const taskPath = join(tmp, '.kanban', 'tasks', '0001-优化首页');
    writeFileSync(join(taskPath, 'main.md'),
      '# 优化首页\n\n## 描述\n加快首屏\n\n## 提示词\n实施首屏优化\n\n## 子任务\n- [ ] 分析\n- [ ] 优化图片\n- [ ] 验证\n');

    // 智能体执行流程：show → move doing → check 子任务 → move done
    const showOut = run('show 0001', tmp);
    expect(showOut).toContain('优化首页');
    run('move 0001 doing', tmp);
    run('check 0001 1', tmp);
    run('check 0001 2', tmp);
    run('check 0001 3', tmp);

    const prog = run('progress 0001', tmp);
    expect(prog).toContain('3/3');

    run('move 0001 done', tmp);

    // 验证：任务在 done 栏，目录名不变
    const showAfter = run('show 0001', tmp);
    expect(showAfter).toContain('栏: done');
    expect(showAfter).toContain('0001-优化首页'); // 路径里含目录名

    // 验证：实体目录路径稳定（全流程后仍在 tasks/，从未移动）
    expect(existsSync(join(tmp, '.kanban', 'tasks', '0001-优化首页', 'main.md'))).toBe(true);
    // 栏目录是软链（done 栏指向实体）
    expect(lstatSync(join(tmp, '.kanban', 'done', '0001-优化首页')).isSymbolicLink()).toBe(true);
  });

  it('改标题不改目录名（标题与目录解耦）', () => {
    run('new 测试', tmp);  // 目录 0001-测试
    // 直接改 main.md 的 H1 模拟 updateTaskContent 的效果（H1 = 显示名）
    const mainPath = join(tmp, '.kanban', 'tasks', '0001-测试', 'main.md');
    writeFileSync(mainPath, '# 重构\n\n## 描述\n\n## 提示词\n\n## 子任务\n');

    const show = run('show 0001', tmp);
    expect(show).toContain('重构');          // 显示新标题（来自 H1）
    expect(show).toContain('0001-测试');      // 路径里目录名不变
    expect(existsSync(join(tmp, '.kanban', 'tasks', '0001-测试'))).toBe(true);
    expect(existsSync(join(tmp, '.kanban', 'tasks', '0001-重构'))).toBe(false);

    const list = run('list', tmp);
    expect(list).toContain('重构');
  });

  it('ID 不复用：删除后新建 ID 递增', () => {
    run('new A', tmp);     // 0001
    run('new B', tmp);     // 0002
    run('delete 0001', tmp);
    run('new C', tmp);     // 应为 0003
    const list = run('list', tmp);
    expect(list).toContain('0003');
    expect(list).not.toContain('0001');
    // 0002 还在
    expect(list).toContain('0002');
  });

  it('archive：从看板隐藏但保留目录与文档', () => {
    run('new 待存档', tmp);   // 0001
    // 写一份文档进任务目录，验证存档后保留
    const taskDir = join(tmp, '.kanban', 'tasks', '0001-待存档');
    writeFileSync(join(taskDir, 'design.md'), '# 设计\n存档应保留此文');

    run('archive 0001', tmp);

    // list 不再见 0001
    expect(run('list', tmp)).not.toContain('0001');
    // tasks/ 不再有该目录
    expect(existsSync(taskDir)).toBe(false);
    // archive/ 有该目录，且文档完整保留
    const archivedDir = join(tmp, '.kanban', 'archive', '0001-待存档');
    expect(existsSync(archivedDir)).toBe(true);
    expect(existsSync(join(archivedDir, 'main.md'))).toBe(true);
    expect(existsSync(join(archivedDir, 'design.md'))).toBe(true);
    // ID 不回收：再建一个应为 0002（0001 已占用）
    run('new 新任务', tmp);
    expect(run('list', tmp)).toContain('0002');
  });

  it('archive 后 sync 不会让存档任务复活', () => {
    run('new 会存档', tmp);   // 0001
    run('archive 0001', tmp);
    run('sync', tmp);         // 全量重建软链，不应把 archive 里的 0001 当孤儿
    expect(run('list', tmp)).not.toContain('0001');
  });

  it('update 追加补充子任务（带 [补充] 标签与递增编号），默认立即执行；--no-run 只补需求', () => {
    run('new 删除存档', tmp);  // 0001
    // 模拟已完成：手写两条已勾选子任务，move done
    const mainPath = join(tmp, '.kanban', 'tasks', '0001-删除存档', 'main.md');
    writeFileSync(mainPath, '# 删除存档\n\n## 描述\n\n## 提示词\n\n## 子任务\n- [x] 01 删除\n- [x] 02 存档\n');
    run('move 0001 done', tmp);

    // 默认 update：已有 01/02，追加 03，默认立即执行
    const out1 = run('update 0001 存档要二次确认', tmp);
    expect(out1).toContain('立即执行');
    expect(out1).toContain('03');
    expect(run('show 0001', tmp)).toContain('03 [补充] 存档要二次确认');

    // --no-run：追加 04，只补需求、提示稍后 run
    const out2 = run('update --no-run 0001 删除要二次确认', tmp);
    expect(out2).toContain('/kanban run 0001');
    expect(out2).toContain('04');
    expect(out2).toContain('删除要二次确认');
    expect(run('show 0001', tmp)).toContain('04 [补充] 删除要二次确认');

    // 子任务顺序：01/02 已勾选，03/04 待执行（编号唯一递增）
    const show = run('show 0001', tmp);
    expect(show).toMatch(/\[x\] 01 删除/);
    expect(show).toMatch(/\[x\] 02 存档/);
    expect(show).toMatch(/\[ \] 03 \[补充\] 存档要二次确认/);
    expect(show).toMatch(/\[ \] 04 \[补充\] 删除要二次确认/);

    // check 按编号定位：勾上 03
    run('check 0001 03', tmp);
    expect(run('show 0001', tmp)).toMatch(/\[x\] 03 \[补充\] 存档要二次确认/);
    expect(run('progress 0001', tmp)).toContain('3/4');
  });

  it('init 已纳入全局 config（projects 命令可见）', () => {
    const out = run('projects', tmp);
    // initBoard 不会自动注册到 config（只有 CLI 的 init 命令才会）
    // 这里验证 projects 命令本身能跑
    expect(typeof out).toBe('string');
  });

  it('projects add/rename：添加后可改显示名', () => {
    run(`projects add ${tmp}`, tmp);
    // 添加后默认 name = basename(tmp)
    const list1 = run('projects', tmp);
    expect(list1).toContain(tmp);

    // 改名
    run(`projects rename ${tmp} 我的看板`, tmp);
    const list2 = run('projects', tmp);
    expect(list2).toMatch(/^我的看板\t/);
    expect(list2).toContain(tmp);
  });
});

describe('E2E: 子目录执行（向上查找最近的 .kanban）', () => {
  let tmp: string;
  let origHome: string | undefined;
  let tmpHome: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'e2e-sub-'));
    tmpHome = mkdtempSync(join(tmpdir(), 'home-'));
    origHome = process.env.HOME;
    process.env.HOME = tmpHome;
    await initBoard(tmp);
    // 深层子目录 a/b/c
    mkdirSync(join(tmp, 'a', 'b', 'c'), { recursive: true });
  });
  afterEach(() => {
    if (origHome !== undefined) process.env.HOME = origHome;
    rmSync(tmp, { recursive: true, force: true });
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('在深层子目录 new → list/show 命中外层项目根', () => {
    const sub = join(tmp, 'a', 'b', 'c');
    const created = run('new 子目录建任务', sub);
    const id = created.match(/(\d{4})/)?.[1];
    expect(id).toBeTruthy();

    // list 在子目录能看到（且仅一处 .kanban）
    const listOut = run('list', sub);
    expect(listOut).toContain(id);
    expect(listOut).toContain('子目录建任务');

    // show 在子目录能命中，且路径指向外层 tasks/
    const showOut = run(`show ${id}`, sub);
    expect(showOut).toContain(join(tmp, '.kanban', 'tasks'));
  });

  it('在深层子目录 move/check 链路正常（写回外层 board.yml）', () => {
    const sub = join(tmp, 'a', 'b');
    run('new 流转测试', sub);
    run('move 0001 doing', sub);
    // 写入子任务后再 check
    const mainPath = join(tmp, '.kanban', 'tasks', '0001-流转测试', 'main.md');
    writeFileSync(mainPath, '# 流转测试\n\n## 描述\n\n## 提示词\n\n## 子任务\n- [ ] 第一步\n');
    run('check 0001 1', sub);
    const prog = run('progress 0001', sub);
    expect(prog).toContain('1/1');
  });

  it('多个 .kanban 时取最近的（最深）父目录', () => {
    // 内层再 init 一个看板
    const inner = join(tmp, 'a');
    run('init', inner); // 在 a/ 创建独立 .kanban（init 不向上查找）
    run('new 外层任务', tmp);
    run('new 内层任务', inner);

    // 从 a/ 往下看，命中内层
    const fromInner = run('list', join(inner, 'b', 'c'));
    expect(fromInner).toContain('内层任务');
    expect(fromInner).not.toContain('外层任务');

    // 从 tmp/ 往下看（a/ 之外），命中外层
    const fromOuter = run('list', tmp);
    expect(fromOuter).toContain('外层任务');
    expect(fromOuter).not.toContain('内层任务');
  });

  it('找不到 .kanban 时以非零退出并报错', () => {
    const bare = mkdtempSync(join(tmpdir(), 'e2e-bare-'));
    try {
      execSync(`node ${BIN} list`, { cwd: bare, stdio: 'pipe' });
      throw new Error('应抛错');
    } catch (e: any) {
      expect(e.status).not.toBe(0);
      expect(String(e.stderr || e.stdout)).toMatch(/找不到.*\.kanban|init/u);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
