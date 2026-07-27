import type { ParsedMainMd } from './types.js';

export function computeProgress(main: ParsedMainMd): [number, number] {
  const total = main.subtasks.length;
  const done = main.subtasks.filter(s => s.done).length;
  return [done, total];
}
