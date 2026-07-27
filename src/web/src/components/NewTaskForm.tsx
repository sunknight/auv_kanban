import { useState } from 'react';
import { createTask } from '../api.js';

export function NewTaskForm(props: { project: string; onCreated?: () => void }) {
  const [name, setName] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createTask(props.project, name.trim());
    setName('');
    // 创建成功后主动刷新：不单纯依赖 socket 推送，
    // 规避 watcher 未覆盖（如 server 启动后才加的项目）或 socket 延迟/断开导致新任务不显示（0002）。
    props.onCreated?.();
  };
  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="新任务名称"
        style={{
          flex: 1,
          padding: '6px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          fontSize: 13,
          background: '#fff',
          outline: 'none',
        }}
        onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'}
        onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
      />
      <button
        type="submit"
        style={{
          padding: '6px 12px',
          borderRadius: 'var(--radius-sm)',
          border: 'none',
          background: 'var(--accent)',
          color: '#fff',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        +
      </button>
    </form>
  );
}
