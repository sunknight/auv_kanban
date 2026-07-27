import { platform } from 'os';

/**
 * 是否运行在 Windows。
 * 看板的栏视图（backlog/ready/doing/done）在 Linux/macOS 用目录软链实现，
 * 但 Windows 上普通用户创建 symlink 需要开发者模式或管理员权限，
 * 因此 Windows 下所有软链操作一律跳过——主功能（数据真相源 = tasks/ + board.yml）
 * 不依赖软链，跳过对功能零影响。
 */
export const isWindows: boolean = platform() === 'win32';
