import { useState, useRef, useEffect, memo } from 'react'
import { Task, DateBlock, ActualRecord } from '../stores/taskStore'

/* ── Palette ─────────────────────────────────────────────── */
const PALETTE = [
  { bar: '#3B82F6', tint: '#DBEAFE', text: '#1E3A8A' },
  { bar: '#10B981', tint: '#D1FAE5', text: '#064E3B' },
  { bar: '#F59E0B', tint: '#FEF3C7', text: '#78350F' },
  { bar: '#8B5CF6', tint: '#EDE9FE', text: '#4C1D95' },
  { bar: '#F43F5E', tint: '#FFE4E6', text: '#881337' },
  { bar: '#06B6D4', tint: '#CFFAFE', text: '#164E63' },
  { bar: '#F97316', tint: '#FFEDD5', text: '#7C2D12' },
  { bar: '#84CC16', tint: '#ECFCCB', text: '#1A2E05' },
]

type ViewMode = 'week' | 'month'

interface Props {
  tasks: Task[]
  actuals?: Record<string, ActualRecord[]>
  onTaskClick?: (task: Task) => void
  onUpdateBlocks?: (taskId: string, blocks: DateBlock[]) => void
  /** When provided, these IDs are treated as root rows (used in TaskDetail context). */
  rootIds?: string[]
}

/* ─────────────────────────────────────────────────────────
   Pure helpers — defined OUTSIDE the component so they are
   never re-created and have no stale-closure risk.
───────────────────────────────────────────────────────── */
function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseDate(s: string): Date {
  const [y, mo, d] = s.split('-').map(Number)
  return new Date(y, mo - 1, d)
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}
function getMondayOf(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const wd = r.getDay()
  r.setDate(r.getDate() - (wd === 0 ? 6 : wd - 1))
  return r
}
function getBlocks(task: Task): DateBlock[] {
  if (Array.isArray(task.date_blocks) && task.date_blocks.length > 0) return task.date_blocks
  const t = task as any
  if (t.start_date) return [{ start: t.start_date, end: t.end_date ?? t.start_date }]
  return []
}

/* ── Time helpers for pomodoro strips ────────────────────── */
function timeToFrac(iso: string): number {
  try {
    const d = new Date(iso)
    if (!isNaN(d.getTime()))
      return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400
  } catch {}
  return 0
}

function groupActualsByDay(records: ActualRecord[]): Record<string, ActualRecord[]> {
  const map: Record<string, ActualRecord[]> = {}
  for (const r of records) {
    const dt = new Date(r.completed_at)
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    if (!map[key]) map[key] = []
    map[key].push(r)
  }
  return map
}

/* ── Constants ───────────────────────────────────────────── */
const ROW_H   = 44
const LABEL_W = 168

/* ─────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────── */
export default memo(function GanttChart({ tasks, actuals, onTaskClick, onUpdateBlocks, rootIds }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [viewStart, setViewStart] = useState<Date>(() => getMondayOf(new Date()))
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [pinned, setPinned] = useState<Set<string>>(new Set())

  // ── Live drag state (for visual preview)
  const [dragDelta, setDragDelta] = useState(0)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)

  // ── Measure actual container width so weekly columns fit exactly
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollW, setScrollW] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => setScrollW(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Refs that hold the latest values without causing effect re-runs
  const tasksRef        = useRef(tasks)
  const updateBlocksRef = useRef(onUpdateBlocks)
  const viewStartRef    = useRef(viewStart)
  tasksRef.current        = tasks
  updateBlocksRef.current = onUpdateBlocks
  viewStartRef.current    = viewStart

  // ── Drag refs — readable synchronously inside event handlers
  const dragRef  = useRef<{
    taskId: string; blockIdx: number; type: 'move' | 'resize'
    startX: number; origStart: string; origEnd: string
  } | null>(null)
  const deltaRef = useRef(0)   // last committed delta
  const cellRef  = useRef(80)  // current CELL width, updated each render

  // Compute layout metrics
  const DAY_COUNT = viewMode === 'week' ? 7 : 30
  const availableW = scrollW || (window.innerWidth - 20)
  const CELL = viewMode === 'week'
    ? Math.max(36, Math.floor((availableW - LABEL_W) / 7))
    : 36
  cellRef.current = CELL
  const TOTAL_W = LABEL_W + DAY_COUNT * CELL

  const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
  const days  = Array.from({ length: DAY_COUNT }, (_, i) => addDays(viewStart, i))
  const todayColIdx = days.findIndex(d => d.getTime() === today.getTime())

  // ── Color mapping
  // When rootIds is given (TaskDetail context), treat those tasks as roots for coloring.
  const rootTasks = rootIds
    ? tasks.filter(t => rootIds.includes(t.id))
    : tasks.filter(t => !t.parent_id)
  // If still empty (all subtasks), treat all passed-in tasks as roots
  const effectiveRoots = rootTasks.length > 0 ? rootTasks : tasks
  const colorMap  = new Map<string, typeof PALETTE[0]>()
  effectiveRoots.forEach((t, i) => colorMap.set(t.id, PALETTE[i % PALETTE.length]))
  const getColor  = (task: Task) => {
    // Try exact match first, then parent match
    return colorMap.get(task.id) ?? colorMap.get(task.parent_id ?? '') ?? PALETTE[0]
  }

  // ── Block → pixel position
  const blockGeo = (block: DateBlock, moveDays = 0, extendDays = 0) => {
    const s = addDays(parseDate(block.start), moveDays)
    const e = addDays(parseDate(block.end),   moveDays + extendDays)
    const cs = Math.floor((s.getTime() - viewStart.getTime()) / 86400000)
    const ce = Math.floor((e.getTime() - viewStart.getTime()) / 86400000)
    if (ce < 0 || cs >= DAY_COUNT) return null
    return {
      left:  Math.max(0, cs) * CELL,
      width: Math.max(CELL * 0.75, Math.min(DAY_COUNT - 1, ce + 1) * CELL - Math.max(0, cs) * CELL),
    }
  }

  /* ──────────────────────────────────────────────────────────
     Global event listeners — mounted ONCE.
     All mutable state accessed via refs, so no stale closures.
  ────────────────────────────────────────────────────────── */
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const delta = Math.round((e.clientX - dragRef.current.startX) / cellRef.current)
      deltaRef.current = delta
      setDragDelta(delta)
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!dragRef.current) return
      const delta = Math.round((e.touches[0].clientX - dragRef.current.startX) / cellRef.current)
      deltaRef.current = delta
      setDragDelta(delta)
    }
    const commit = () => {
      const d = dragRef.current
      if (!d) return
      const delta = deltaRef.current
      // Reset refs first
      dragRef.current  = null
      deltaRef.current = 0
      setDraggingKey(null)
      setDragDelta(0)
      if (delta === 0 || !updateBlocksRef.current) return
      const task = tasksRef.current.find(t => t.id === d.taskId)
      if (!task) return
      const blocks = [...getBlocks(task)]
      const bi = d.blockIdx
      if (d.type === 'move') {
        blocks[bi] = {
          start: toISO(addDays(parseDate(d.origStart), delta)),
          end:   toISO(addDays(parseDate(d.origEnd),   delta)),
        }
      } else {
        const newEnd = addDays(parseDate(d.origEnd), delta)
        if (newEnd >= parseDate(d.origStart)) {
          blocks[bi] = { start: d.origStart, end: toISO(newEnd) }
        }
      }
      updateBlocksRef.current(d.taskId, blocks)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   commit)
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend',  commit)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   commit)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend',  commit)
    }
  }, []) // ← empty: runs once; all data accessed via refs

  /* ── Start a drag ─────────────────────────────────────────── */
  const startDrag = (
    e: React.MouseEvent,
    task: Task, blockIdx: number,
    type: 'move' | 'resize',
    origStart: string, origEnd: string
  ) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current  = { taskId: task.id, blockIdx, type, startX: e.clientX, origStart, origEnd }
    deltaRef.current = 0
    setDragDelta(0)
    setDraggingKey(`${task.id}-${blockIdx}`)
  }

  /* ── Click empty cell → add new block ────────────────────── */
  const handleCellClick = (task: Task, dayIdx: number, e: React.MouseEvent) => {
    // If a drag just ended, ignore the resulting click
    if (dragRef.current) return
    e.stopPropagation()
    if (!onUpdateBlocks) return
    // Skip if this task has children IN THE PASSED-IN tasks list
    if (tasks.some(t => t.parent_id === task.id)) return
    const dateStr  = toISO(addDays(viewStart, dayIdx))
    const existing = getBlocks(task)
    if (existing.some(b => b.start <= dateStr && dateStr <= b.end)) return
    onUpdateBlocks(task.id, [...existing, { start: dateStr, end: dateStr }])
  }

  /* ── Remove block ─────────────────────────────────────────── */
  const removeBlock = (task: Task, bi: number, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onUpdateBlocks) return
    onUpdateBlocks(task.id, getBlocks(task).filter((_, i) => i !== bi))
  }

  /* ── Helpers ──────────────────────────────────────────────── */
  const toggleCollapse = (id: string) =>
    setCollapsed(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const togglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setPinned(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  /* ── Render one task row ──────────────────────────────────── */
  const renderRow = (task: Task, depth: number): React.ReactNode => {
    const children    = tasks.filter(t => t.parent_id === task.id)
    const hasChildren = children.length > 0
    const isCollapsed = collapsed.has(task.id)
    const color       = getColor(task)
    const blocks      = getBlocks(task)

    return (
      <div key={task.id}>
        <div className="flex" style={{ borderBottom: '1px solid #F0EEE9', minHeight: ROW_H, minWidth: TOTAL_W }}>

          {/* Sticky label */}
          <div
            className="flex items-center gap-1 select-none shrink-0"
            style={{
              width: LABEL_W, minWidth: LABEL_W,
              paddingLeft: 8 + depth * 18, paddingRight: 6,
              position: 'sticky', left: 0, zIndex: 10,
              background: '#fff', borderRight: '1px solid #E8E5DF',
              cursor: 'pointer', height: ROW_H,
            }}
            onClick={() => hasChildren ? toggleCollapse(task.id) : onTaskClick?.(task)}
          >
            {hasChildren
              ? <span style={{ fontSize: 9, color: '#9B9890', marginRight: 2, display: 'inline-block',
                  transition: 'transform 0.15s',
                  transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
              : <span style={{ width: 10 }} />
            }
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: color.bar, flexShrink: 0 }} />
            <span className="truncate flex-1" style={{
              fontSize: '0.75rem', fontWeight: depth === 0 ? 500 : 400,
              color: task.status === 'completed' ? '#9B9890' : '#1A1917',
              textDecoration: task.status === 'completed' ? 'line-through' : 'none',
            }}>{task.name}</span>
            {!task.parent_id && (
              <button onClick={e => togglePin(task.id, e)}
                style={{ fontSize: 9, opacity: pinned.has(task.id) ? 1 : 0.25, flexShrink: 0 }}>📌</button>
            )}
          </div>

          {/* Chart area */}
          <div className="relative shrink-0" style={{ width: DAY_COUNT * CELL, height: ROW_H }}>

            {/* Day-cell click zones (z:1, behind bars) */}
            {days.map((d, di) => (
              <div
                key={di}
                onClick={e => handleCellClick(task, di, e)}
                style={{
                  position: 'absolute', left: di * CELL, top: 0,
                  width: CELL, height: ROW_H,
                  background: d.getTime() === today.getTime() ? 'rgba(37,99,235,0.04)' : 'transparent',
                  borderRight: `1px solid ${d.getDay() === 1 && di > 0 ? '#E8E5DF' : '#F4F3F0'}`,
                  cursor: hasChildren ? 'default' : 'cell',
                  boxSizing: 'border-box', zIndex: 1,
                }}
              />
            ))}

            {/* Today marker */}
            {todayColIdx >= 0 && (
              <div style={{
                position: 'absolute', left: todayColIdx * CELL, top: 0,
                width: 1.5, height: ROW_H,
                background: 'rgba(37,99,235,0.5)',
                zIndex: 4, pointerEvents: 'none',
              }} />
            )}

            {/* Plan bars */}
            {blocks.map((block, bi) => {
              const key = `${task.id}-${bi}`
              const isMe = draggingKey === key
              const dd = isMe ? dragDelta : 0
              const moveDays = isMe && dragRef.current?.type === 'move'   ? dd : 0
              const extDays  = isMe && dragRef.current?.type === 'resize' ? dd : 0
              const geo = blockGeo(block, moveDays, extDays)
              if (!geo) return null

              return (
                <div
                  key={bi}
                  onMouseDown={e => !hasChildren && startDrag(e, task, bi, 'move', block.start, block.end)}
                  style={{
                    position: 'absolute',
                    left: geo.left + 1, width: geo.width - 2,
                    top: 8, height: ROW_H - 16,
                    background: color.tint,
                    border: `1.5px solid ${color.bar}`,
                    borderRadius: 5,
                    display: 'flex', alignItems: 'center', overflow: 'hidden',
                    cursor: hasChildren ? 'default' : (isMe ? 'grabbing' : 'grab'),
                    zIndex: 5, opacity: isMe ? 0.75 : 1,
                    userSelect: 'none', boxSizing: 'border-box',
                  }}
                >
                  {/* Progress fill */}
                  {task.pomodor_total > 0 && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      width: `${Math.min(100, (task.pomodor_completed / task.pomodor_total) * 100)}%`,
                      background: color.bar, opacity: 0.2, pointerEvents: 'none',
                    }} />
                  )}

                  {/* Label */}
                  <span style={{
                    fontSize: '0.6rem', color: color.text, padding: '0 4px',
                    flex: 1, zIndex: 1, pointerEvents: 'none',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {block.start.slice(5)}{block.start !== block.end ? `→${block.end.slice(5)}` : ''}
                  </span>

                  {/* Resize handle */}
                  {!hasChildren && (
                    <div
                      onMouseDown={e => startDrag(e, task, bi, 'resize', block.start, block.end)}
                      style={{
                        width: 8, height: '100%', cursor: 'ew-resize',
                        flexShrink: 0, background: color.bar, opacity: 0.45, zIndex: 6,
                      }}
                    />
                  )}

                  {/* Remove ✕ */}
                  {!hasChildren && (
                    <button
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => removeBlock(task, bi, e)}
                      style={{
                        position: 'absolute', top: -5, right: -5,
                        width: 14, height: 14, borderRadius: '50%',
                        background: color.bar, color: '#fff',
                        fontSize: 8, border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 8, lineHeight: 1,
                      }}
                    >✕</button>
                  )}
                </div>
              )
            })}

            {/* Pomodoro time-slot strips (green bands showing when work happened) */}
            {actuals?.[task.id] && (() => {
              const byDay = groupActualsByDay(actuals[task.id])
              return days.map((d, di) => {
                const dayStr = toISO(d)
                const recs = byDay[dayStr]
                if (!recs?.length) return null
                return recs.map((rec, ri) => {
                  const startedAt = rec.started_at
                    || new Date(new Date(rec.completed_at).getTime() - rec.duration_minutes * 60000).toISOString()
                  const startFrac = timeToFrac(startedAt)
                  const durFrac = rec.duration_minutes / (24 * 60)
                  const topPos = startFrac * ROW_H
                  const stripH = Math.max(3, durFrac * ROW_H)
                  return (
                    <div
                      key={`strip-${di}-${ri}`}
                      title={`🍅 ${new Date(startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}–${new Date(rec.completed_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} (${rec.duration_minutes}min)`}
                      style={{
                        position: 'absolute',
                        left: di * CELL + 1,
                        width: CELL - 2,
                        top: topPos,
                        height: stripH,
                        background: 'rgba(34, 197, 94, 0.35)',
                        borderRadius: 2,
                        pointerEvents: 'auto',
                        cursor: 'default',
                        zIndex: 2,
                      }}
                    />
                  )
                })
              })
            })()}
          </div>
        </div>

        {/* Children rows */}
        {hasChildren && !isCollapsed && children.map(c => renderRow(c, depth + 1))}
      </div>
    )
  }

  /* ── Determine root rows ─────────────────────────────────── */
  // rootIds provided (TaskDetail): those tasks are the root rows
  // Otherwise: standard top-level tasks, pinned first
  const rootRows = rootIds
    ? tasks.filter(t => rootIds.includes(t.id))
    : effectiveRoots
  const sorted = rootIds
    ? rootRows  // no pin sorting needed in detail view
    : [
        ...effectiveRoots.filter(t => pinned.has(t.id)),
        ...effectiveRoots.filter(t => !pinned.has(t.id)),
      ]

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div
      className="card overflow-hidden"
      style={{ cursor: draggingKey ? 'grabbing' : 'auto', userSelect: draggingKey ? 'none' : 'auto' }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-line flex-wrap">
        <button className="btn btn-ghost py-1 px-2 text-xs"
          onClick={() => setViewStart(p => addDays(p, -DAY_COUNT))}>←</button>
        <button className="btn btn-ghost py-1 px-2 text-xs"
          onClick={() => setViewStart(getMondayOf(new Date()))}>今天</button>
        <button className="btn btn-ghost py-1 px-2 text-xs"
          onClick={() => setViewStart(p => addDays(p, DAY_COUNT))}>→</button>
        <span className="text-xs text-muted">
          {toISO(viewStart)} — {toISO(addDays(viewStart, DAY_COUNT - 1))}
        </span>
        <div className="ml-auto flex gap-1">
          {(['week', 'month'] as ViewMode[]).map(m => (
            <button key={m}
              className={`btn py-1 px-3 text-xs ${viewMode === m ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setViewMode(m)}>
              {m === 'week' ? '周' : '月'}
            </button>
          ))}
        </div>
      </div>

      {/* Single scroll container */}
      <div ref={scrollRef} style={{ overflowX: 'auto' }}>

        {/* Header date row */}
        <div className="flex" style={{
          minWidth: TOTAL_W, borderBottom: '1px solid #E8E5DF',
          background: '#fff', position: 'sticky', top: 0, zIndex: 20,
        }}>
          <div style={{
            width: LABEL_W, minWidth: LABEL_W,
            position: 'sticky', left: 0, zIndex: 25, background: '#fff',
            borderRight: '1px solid #E8E5DF',
            padding: '7px 10px', fontSize: '0.6875rem', color: '#9B9890', fontWeight: 600,
          }}>任务</div>
          <div className="flex" style={{ width: DAY_COUNT * CELL }}>
            {days.map((d, i) => {
              const isToday = d.getTime() === today.getTime()
              return (
                <div key={i} style={{
                  width: CELL, minWidth: CELL, flexShrink: 0,
                  padding: '6px 2px', textAlign: 'center',
                  fontSize: viewMode === 'week' ? '0.6875rem' : '0.625rem',
                  color: isToday ? '#2563EB' : '#9B9890',
                  fontWeight: isToday ? 600 : 400,
                  background: isToday ? '#EFF4FF' : 'transparent',
                  borderRight: `1px solid ${d.getDay() === 1 && i > 0 ? '#E8E5DF' : '#F4F3F0'}`,
                  boxSizing: 'border-box',
                }}>
                  {viewMode === 'week'
                    ? d.toLocaleDateString('zh-CN', { weekday: 'short', day: 'numeric' })
                    : d.getDate()}
                </div>
              )
            })}
          </div>
        </div>

        {/* Task rows */}
        {sorted.length === 0 ? (
          <div style={{
            padding: '2.5rem', textAlign: 'center',
            color: '#9B9890', fontSize: '0.875rem', minWidth: TOTAL_W,
          }}>
            暂无任务 · 先在列表中创建任务，再点击格子添加计划时间
          </div>
        ) : sorted.map(t => renderRow(t, 0))}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '7px 16px',
        borderTop: '1px solid #E8E5DF', fontSize: '0.6875rem', color: '#9B9890', flexWrap: 'wrap',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 9, borderRadius: 2, background: '#DBEAFE',
            border: '1.5px solid #3B82F6', display: 'inline-block' }} />
          计划块（可拖拽）
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 9, borderRadius: 2, background: 'rgba(34,197,94,0.35)',
            display: 'inline-block' }} />
          实际番茄时段
        </span>
        <span style={{ marginLeft: 'auto' }}>
          💡 点空格添加 · 拖拽移动 · 右边把手调整长度 · ✕ 删除
        </span>
      </div>
    </div>
  )
})
