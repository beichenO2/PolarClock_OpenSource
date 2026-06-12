import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTaskStore } from '../stores/taskStore'
import { useTimerStore } from '../stores/timerStore'
import { useThemeStore } from '../stores/themeStore'

interface Command {
  id: string; label: string; icon: string; category: string
  action: () => void; keywords?: string
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { tasks } = useTaskStore()
  const { start } = useTimerStore()
  const { toggle: toggleTheme } = useThemeStore()

  const go = useCallback((path: string) => { navigate(path); setOpen(false) }, [navigate])

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = [
      { id: 'nav-timer', label: '计时器', icon: '🍅', category: '导航', action: () => go('/clock/timer'), keywords: 'timer pomodoro' },
      { id: 'nav-tasks', label: '任务列表', icon: '📋', category: '导航', action: () => go('/clock/tasks'), keywords: 'tasks todo' },
      { id: 'nav-stats', label: '统计', icon: '📊', category: '导航', action: () => go('/clock/stats'), keywords: 'stats statistics' },
      { id: 'nav-schedule', label: '日程', icon: '📅', category: '导航', action: () => go('/clock/schedule'), keywords: 'schedule calendar' },
      { id: 'nav-settings', label: '设置', icon: '⚙️', category: '导航', action: () => go('/clock/settings'), keywords: 'settings preferences' },
    ]
    const actions: Command[] = [
      { id: 'act-pomodoro', label: '开始番茄钟', icon: '▶️', category: '操作', action: () => { start('pomodoro'); go('/clock/timer') }, keywords: 'start pomodoro focus' },
      { id: 'act-theme', label: '切换主题', icon: '🌓', category: '操作', action: () => { toggleTheme(); setOpen(false) }, keywords: 'theme dark light toggle' },
    ]
    const taskCmds: Command[] = tasks
      .filter(t => t.status !== 'completed')
      .slice(0, 20)
      .map(t => ({
        id: `task-${t.id}`, label: t.name, icon: '📌', category: '任务',
        action: () => go(`/clock/tasks/${t.id}`), keywords: t.name,
      }))
    return [...nav, ...actions, ...taskCmds]
  }, [tasks, go, start, toggleTheme])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      (c.keywords && c.keywords.toLowerCase().includes(q))
    )
  }, [commands, query])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => { setSelected(0) }, [query])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter' && filtered[selected]) { filtered[selected].action() }
  }

  if (!open) return null

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 9990,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        animation: 'cmdFadeIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, borderRadius: 16,
          background: 'var(--color-card, #1e1e1e)',
          border: '1px solid var(--color-border)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          overflow: 'hidden',
          animation: 'cmdSlideIn 0.2s ease',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border)' }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="搜索页面、任务或操作..."
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 10,
              background: 'var(--color-overlay, rgba(255,255,255,0.05))',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)', fontSize: '0.85rem',
              outline: 'none',
            }}
          />
        </div>
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '6px 0' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--color-text-faint)', fontSize: '0.8rem' }}>
              无匹配结果
            </div>
          )}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              onClick={() => cmd.action()}
              onMouseEnter={() => setSelected(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 16px', cursor: 'pointer',
                background: i === selected ? 'rgba(59,130,246,0.12)' : 'transparent',
                transition: 'background 0.1s',
              }}
            >
              <span style={{ fontSize: '1rem', width: 24, textAlign: 'center' }}>{cmd.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text)', fontWeight: i === selected ? 600 : 400 }}>
                  {cmd.label}
                </div>
              </div>
              <span style={{ fontSize: '0.6rem', color: 'var(--color-text-faint)', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4 }}>
                {cmd.category}
              </span>
            </div>
          ))}
        </div>
        <div style={{
          padding: '8px 16px', borderTop: '1px solid var(--color-border)',
          display: 'flex', gap: 12, justifyContent: 'center',
          fontSize: '0.6rem', color: 'var(--color-text-faint)',
        }}>
          <span>↑↓ 导航</span>
          <span>↵ 选择</span>
          <span>esc 关闭</span>
        </div>
      </div>
      <style>{`
        @keyframes cmdFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes cmdSlideIn { from { transform: translateY(-20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>
  )
}
