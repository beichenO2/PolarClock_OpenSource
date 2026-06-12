import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useTaskStore, Task, DateBlock } from '../stores/taskStore'
import { useNavigate, useLocation } from 'react-router-dom'
import GanttChart from '../components/GanttChart'
import AxisSelector from '../components/AxisSelector'

type ViewMode = 'list' | 'gantt' | 'lastThing'

/* ── 2D Quadrant: full-width scatter ────────────────────────── */
function QuadrantChart({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (t: Task) => void }) {
  const active = tasks.filter(t => t.status !== 'completed')
  const N = active.length

  // ── Normalize ranks 1..N from raw position values ────────────────────────
  // Raw importance/desire_axis_position values may not be consecutive (subtasks
  // inherited their parents' old values), so we sort and use the sort index.
  const byImp = [...active].sort((a, b) => a.importance_axis_position - b.importance_axis_position)
  const byDes = [...active].sort((a, b) => a.desire_axis_position - b.desire_axis_position)
  const impRank = new Map(byImp.map((t, i) => [t.id, i + 1]))
  const desRank = new Map(byDes.map((t, i) => [t.id, i + 1]))

  const W = 700, PAD = 48, R = 20
  const minH = 420
  const neededH = 2 * PAD + Math.max(N - 1, 1) * (R * 2.6)
  const H = Math.max(minH, neededH)

  function getXY(t: Task) {
    const ir = impRank.get(t.id)!
    const dr = desRank.get(t.id)!
    const x = PAD + ((N - dr)  / Math.max(N - 1, 1)) * (W - 2 * PAD)
    const y = PAD + ((ir - 1)  / Math.max(N - 1, 1)) * (H - 2 * PAD)
    return { x, y, ir, dr }
  }

  // Render lower-priority tasks first so higher-priority (lower minRank) end up on top
  const renderOrder = [...active]
    .map(t => ({ task: t, minRank: Math.min(impRank.get(t.id)!, desRank.get(t.id)!) }))
    .sort((a, b) => b.minRank - a.minRank)

  return (
    <div>
      <div className="section-label mb-2">🎯 重要 × 想做 象限</div>
      <div className="card relative" style={{ width: '100%', padding: '12px 12px 8px' }}>
        {active.length === 0 ? (
          <div className="py-12 text-center text-sm text-faint">暂无可执行任务</div>
        ) : (
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            preserveAspectRatio="xMidYMid meet"
            overflow="visible"
          >
            {/* Quadrant dividers */}
            <line x1={W / 2} y1={PAD / 2} x2={W / 2} y2={H - PAD / 2}
              stroke="var(--color-overlay)" strokeWidth={1.5} strokeDasharray="6 4" />
            <line x1={PAD / 2} y1={H / 2} x2={W - PAD / 2} y2={H / 2}
              stroke="var(--color-overlay)" strokeWidth={1.5} strokeDasharray="6 4" />

            {/* Axes */}
            <line x1={PAD} y1={H - PAD} x2={W - PAD / 2} y2={H - PAD} stroke="var(--color-border-strong)" strokeWidth={1} />
            <line x1={PAD} y1={PAD / 2} x2={PAD}          y2={H - PAD} stroke="var(--color-border-strong)" strokeWidth={1} />

            {/* Quadrant corner labels */}
            <text x={W * 0.75} y={PAD - 8} fontSize={12} fill="#93C5FD" textAnchor="middle" fontWeight="500">重要 &amp; 想做 ✦</text>
            <text x={W * 0.25} y={PAD - 8} fontSize={12} fill="#FCA5A5" textAnchor="middle">重要 不想做</text>
            <text x={W * 0.75} y={H - PAD + 20} fontSize={12} fill="#86EFAC" textAnchor="middle">不重要 想做</text>
            <text x={W * 0.25} y={H - PAD + 20} fontSize={12} fill="var(--color-border-strong)" textAnchor="middle">不重要 不想做</text>

            {/* Axis labels */}
            <text x={W - PAD / 2} y={H - PAD - 6} fontSize={12} fill="var(--color-text-faint)" textAnchor="end">想做 →</text>
            <text x={PAD + 4}   y={PAD / 2 + 2}   fontSize={12} fill="var(--color-text-faint)" textAnchor="start">↑ 重要</text>

            {/* Task dots — sorted so best (lowest minRank) renders last = on top */}
            {renderOrder.map(({ task: t, minRank }) => {
              const { x, y, ir, dr } = getXY(t)
              const topHalf = ir <= Math.ceil(N / 2)
              const rightHalf = dr <= Math.ceil(N / 2)
              const isTop = topHalf && rightHalf
              const isWide = minRank >= 10
              return (
                <g key={t.id} style={{ cursor: 'pointer' }} onClick={() => onTaskClick(t)}>
                  <title>{t.name} (重要#{ir} 想做#{dr})</title>
                  {isWide ? (
                    <rect x={x - R - 4} y={y - R} width={(R + 4) * 2} height={R * 2}
                      rx={R} ry={R}
                      fill={isTop ? 'var(--color-accent-tint)' : 'var(--color-bg)'}
                      stroke={isTop ? 'var(--color-accent)' : 'var(--color-border-strong)'}
                      strokeWidth={isTop ? 2 : 1}
                    />
                  ) : (
                    <circle cx={x} cy={y} r={R}
                      fill={isTop ? 'var(--color-accent-tint)' : 'var(--color-bg)'}
                      stroke={isTop ? 'var(--color-accent)' : 'var(--color-border-strong)'}
                      strokeWidth={isTop ? 2 : 1}
                    />
                  )}
                  <text x={x} y={y + 5} fontSize={13} fontWeight={isTop ? '700' : '500'}
                    fill={isTop ? 'var(--color-accent)' : 'var(--color-text-muted)'} textAnchor="middle">
                    {minRank}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
      <p className="text-xs mt-1 mb-0" style={{ color: 'var(--color-text-faint)' }}>右上角 = 最重要最想做。圆圈数字 = min(重要序号, 想做序号)。悬停看名称，点击跳转。</p>
    </div>
  )
}

/* ── Main Tasks Page ────────────────────────────────────────── */
const TAG_COLORS: Record<string, string> = {
  work: '#3B82F6', study: '#8B5CF6', health: '#10B981', personal: '#F59E0B',
  urgent: '#EF4444', review: '#6366F1', idea: '#EC4899', default: '#6B7280',
}
function tagColor(tag: string): string {
  return TAG_COLORS[tag.toLowerCase()] || TAG_COLORS.default
}

export default function Tasks() {
  const { tasks, archivedTasks, ganttData, fetchTasks, fetchArchivedTasks, fetchGanttData,
          createTask, updateTask, deleteTask, reorderTask, updateBlocks, restoreTask } = useTaskStore()
  const [view, setView] = useState<ViewMode>('list')
  const [showArchive, setShowArchive] = useState(false)
  const [newTaskName, setNewTaskName] = useState('')
  const [axisPhase, setAxisPhase] = useState<'importance' | 'desire'>('importance')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()
  const location = useLocation()
  const inputRef = useRef<HTMLInputElement>(null)

  // Initialize sub-view from navigation state (from keyboard nav)
  useEffect(() => {
    const sub = (location.state as any)?.sub
    if (sub === 'list' || sub === 'gantt' || sub === 'lastThing') {
      setView(sub)
    }
  }, []) // Only on mount

  // Listen for tasks-sub-nav CustomEvent from App.tsx KeyboardNav
  useEffect(() => {
    const SUB_VIEWS: ViewMode[] = ['list', 'gantt', 'lastThing']
    const handler = (e: Event) => {
      const dir = (e as CustomEvent).detail?.dir as 'left' | 'right'
      setView(current => {
        const idx = SUB_VIEWS.indexOf(current)
        if (dir === 'right') {
          if (idx >= SUB_VIEWS.length - 1) {
            navigate('/clock/schedule')
            return current
          }
          return SUB_VIEWS[idx + 1]
        } else {
          if (idx <= 0) {
            // At list edge: go to stats
            navigate('/clock/stats')
            return current
          }
          return SUB_VIEWS[idx - 1]
        }
      })
    }
    window.addEventListener('tasks-sub-nav', handler)
    return () => window.removeEventListener('tasks-sub-nav', handler)
  }, [navigate])

  useEffect(() => { fetchTasks() }, [])
  useEffect(() => { if (view === 'gantt') fetchGanttData() }, [view])
  useEffect(() => { if (showArchive) fetchArchivedTasks() }, [showArchive])

  const allTags = useMemo(() => [...new Set(tasks.flatMap(t => t.tags ?? []))].sort(), [tasks])
  const filteredTasks = useMemo(() => {
    let result = tasks
    if (tagFilter) result = result.filter(t => (t.tags ?? []).includes(tagFilter))
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(t =>
        t.name.toLowerCase().includes(q) ||
        (t.story ?? '').toLowerCase().includes(q) ||
        (t.tags ?? []).some(tag => tag.toLowerCase().includes(q))
      )
    }
    return result
  }, [tasks, tagFilter, searchQuery])
  const rootTasks = useMemo(() => filteredTasks.filter(t => !t.parent_id), [filteredTasks])

  const handleCreateTask = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskName.trim()) return
    await createTask(newTaskName)
    setNewTaskName('')
  }, [newTaskName, createTask])

  const handleTaskMove = useCallback(async (taskId: string, newStart: Date, newEnd: Date) => {
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    // Add a block (for gantt click-to-add)
    const newBlock = { start: fmt(newStart), end: fmt(newEnd) }
    await updateBlocks(taskId, [...(task.date_blocks || []), newBlock])
    if (view === 'gantt') fetchGanttData()
  }, [tasks, updateBlocks, view, fetchGanttData])

  const handleUpdateBlocks = useCallback(async (taskId: string, blocks: DateBlock[]) => {
    await updateBlocks(taskId, blocks)
  }, [updateBlocks])

  /* ── Task list row ─────────────────────────────────────── */
  const renderTaskRow = (task: Task, depth = 0) => {
    const children = tasks.filter(t => t.parent_id === task.id)
    const isCompleted = task.status === 'completed'
    const isInProgress = task.status === 'in_progress'

    return (
      <div key={task.id}>
        <div
          className={`task-row ${isCompleted ? 'completed' : ''} ${isInProgress ? 'active' : ''}`}
          style={{ paddingLeft: 12 + depth * 28, gap: '0.5rem' }}
        >
          {/* Depth indicator */}
          {depth > 0 && (
            <div style={{ width: 1, height: 28, background: 'var(--color-border)', flexShrink: 0, marginLeft: -16 }} />
          )}

          {/* Status dot */}
          <span className={`status-dot ${isCompleted ? 'completed' : isInProgress ? 'in-progress' : 'pending'}`} />

          {/* Name */}
          <span
            className="flex-1 truncate text-sm"
            style={{
              color: isCompleted ? 'var(--color-text-faint)' : 'var(--color-text)',
              textDecoration: isCompleted ? 'line-through' : 'none',
              fontWeight: depth === 0 ? 500 : 400
            }}
            onClick={() => navigate(`/clock/tasks/${task.id}`)}
          >
            {task.name}
          </span>

          {/* Tags */}
          {(task.tags ?? []).length > 0 && (
            <div className="flex gap-1 shrink-0">
              {(task.tags ?? []).map(tag => (
                <span key={tag} onClick={e => { e.stopPropagation(); setTagFilter(tagFilter === tag ? null : tag) }}
                  style={{
                    fontSize: '0.6rem', padding: '1px 6px', borderRadius: 4,
                    background: `${tagColor(tag)}18`, color: tagColor(tag),
                    fontWeight: 600, cursor: 'pointer', lineHeight: 1.4,
                  }}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-2 shrink-0 text-xs text-faint">
            {task.deadline && (
              <span style={{ color: 'var(--color-warning)' }}>
                {new Date(task.deadline).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
              </span>
            )}
            {task.pomodor_total > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 60 }}>
                <div style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: 'var(--color-border)',
                  overflow: 'hidden', minWidth: 32,
                }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${Math.min(100, Math.round(task.pomodor_completed / task.pomodor_total * 100))}%`,
                    background: task.pomodor_completed >= task.pomodor_total ? '#10B981' : 'var(--color-accent)',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <span style={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}>
                  {task.pomodor_completed}/{task.pomodor_total}
                </span>
              </div>
            )}
            {depth === 0 && (
              <span className="opacity-60">🔥{task.importance_axis_position} 💚{task.desire_axis_position}</span>
            )}
          </div>

          {/* Delete */}
          <button
            onClick={e => { e.stopPropagation(); deleteTask(task.id) }}
            className="shrink-0 text-faint hover:text-danger transition-colors"
            style={{ fontSize: '0.75rem' }}
          >✕</button>
        </div>

        {children.map(child => renderTaskRow(child, depth + 1))}
      </div>
    )
  }

  /* ── Archive rows ──────────────────────────────────────── */
  const renderArchiveRow = (task: Task) => (
    <div key={task.id} className="task-row completed">
      <span className="status-dot completed" />
      <span className="flex-1 truncate text-sm" onClick={() => navigate(`/clock/tasks/${task.id}`)}>
        {task.name}
      </span>
      <span className="text-xs text-faint shrink-0">
        🍅{task.pomodor_completed}/{task.pomodor_total}
      </span>
      <button
        onClick={() => restoreTask(task.id)}
        className="shrink-0 text-xs btn btn-ghost py-0.5 px-2"
        style={{ minHeight: 24 }}
      >恢复</button>
    </div>
  )

  /* ── Last Thing sorting (memoized) ─────────────────────── */
  const { leafTasks, sortedByImp, sortedByDes, recommended } = useMemo(() => {
    const parentIds = new Set(tasks.filter(t => t.parent_id).map(t => t.parent_id!))
    const taskMap = new Map(tasks.map(t => [t.id, t]))

    function getRootAncestor(taskId: string) {
      let cur = taskMap.get(taskId)
      while (cur?.parent_id) cur = taskMap.get(cur.parent_id)
      return cur
    }
    function depsCleared(root: Task) {
      return (root.dependencies ?? []).every(depId => taskMap.get(depId)?.status === 'completed')
    }

    const leafTasks = tasks.filter(t => {
      if (parentIds.has(t.id)) return false
      if (t.status === 'completed') return false
      const root = getRootAncestor(t.id)
      return root ? depsCleared(root) : false
    })
    return {
      leafTasks,
      sortedByImp: [...leafTasks].sort((a, b) => a.importance_axis_position - b.importance_axis_position),
      sortedByDes: [...leafTasks].sort((a, b) => a.desire_axis_position - b.desire_axis_position),
      recommended: [...leafTasks].sort((a, b) =>
        (a.importance_axis_position + a.desire_axis_position) - (b.importance_axis_position + b.desire_axis_position)),
    }
  }, [tasks])

  /* ── View tabs ─────────────────────────────────────────── */
  const tabs: { id: ViewMode; label: string }[] = [
    { id: 'list', label: '列表' },
    { id: 'gantt', label: '甘特图' },
    { id: 'lastThing', label: 'Last Thing' },
  ]

  return (
    <div className="page">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <h1 style={{ fontSize: '1.25rem' }}>任务</h1>
        <div className="flex-1" />
        <button
          onClick={() => setShowArchive(s => !s)}
          className={`btn btn-ghost text-xs py-1 px-3 ${showArchive ? 'border-accent text-accent' : ''}`}
          style={{ minHeight: 30 }}
        >
          战绩可查
        </button>
        <button
          onClick={() => inputRef.current?.focus()}
          className="btn btn-primary text-xs py-1 px-3"
          style={{ minHeight: 30 }}
        >
          + 新建任务
        </button>
      </div>

      {/* Search bar */}
      {!showArchive && (
        <div className="mb-3 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索任务名称、故事、标签…"
            className="input w-full text-sm"
            style={{ paddingLeft: 32 }}
          />
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            fontSize: '0.85rem', color: 'var(--color-text-faint)', pointerEvents: 'none' }}>🔍</span>
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--color-text-faint)' }}>✕</button>
          )}
        </div>
      )}

      {/* Archive view */}
      {showArchive ? (
        <div className="card mb-4 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line flex items-center">
            <span className="font-medium text-sm">已完成 / 归档</span>
            <button onClick={() => setShowArchive(false)} className="ml-auto text-faint text-xs">关闭</button>
          </div>
          {archivedTasks.filter(t => !t.parent_id).length === 0 ? (
            <div className="py-8 text-center text-sm text-faint">暂无已归档任务</div>
          ) : (
            archivedTasks.filter(t => !t.parent_id).map(renderArchiveRow)
          )}
        </div>
      ) : (
        <>
          {/* View tabs */}
          <div className="flex gap-1 mb-4">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setView(t.id)}
                className={`btn text-xs py-1 px-3 ${view === t.id ? 'btn-primary' : 'btn-ghost'}`}
                style={{ minHeight: 30 }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tag filter bar */}
          {view === 'list' && allTags.length > 0 && (
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {allTags.map(tag => (
                <button key={tag}
                  onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  style={{
                    fontSize: '0.68rem', padding: '2px 10px', borderRadius: 6,
                    fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                    border: `1.5px solid ${tagColor(tag)}`,
                    background: tagFilter === tag ? tagColor(tag) : 'transparent',
                    color: tagFilter === tag ? '#fff' : tagColor(tag),
                  }}>
                  {tag}
                </button>
              ))}
              {tagFilter && (
                <button onClick={() => setTagFilter(null)}
                  style={{ fontSize: '0.68rem', padding: '2px 10px', borderRadius: 6, color: 'var(--color-text-faint)', cursor: 'pointer', border: '1px solid var(--color-border)' }}>
                  清除
                </button>
              )}
            </div>
          )}

          {/* LIST VIEW */}
          {view === 'list' && (
            <div className="card overflow-hidden">
              {rootTasks.length === 0 ? (
                <div className="py-10 text-center text-sm text-faint">暂无任务，点击右上角新建</div>
              ) : (
                rootTasks.map(t => renderTaskRow(t))
              )}
            </div>
          )}

          {/* GANTT VIEW */}
          {view === 'gantt' && (
            <GanttChart
              tasks={ganttData ? ganttData.tasks.filter(t => !t.archived) : tasks}
              actuals={ganttData?.actuals}
              onTaskClick={t => navigate(`/clock/tasks/${t.id}`)}
              onUpdateBlocks={handleUpdateBlocks}
            />
          )}

          {/* LAST THING VIEW */}
          {view === 'lastThing' && (
            <div>
              <p className="text-sm text-faint mb-4 italic text-center">
                "干不下去的时候，做相对最重要且最想做的"
              </p>

              <div className="last-thing-wide">
                {/* LEFT: Quadrant Chart */}
                <div className="lt-left mb-4">
                  <QuadrantChart tasks={leafTasks} onTaskClick={t => navigate(`/clock/tasks/${t.id}`)} />
                </div>

                {/* RIGHT: Recommendation + Sort Lists */}
                <div className="lt-right">
                  {/* Recommendation */}
                  {recommended.length > 0 && (
                    <div className="mb-4">
                      <div className="section-label mb-2">💡 推荐下一步</div>
                      <div
                        className="card p-4 cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => navigate(`/clock/tasks/${recommended[0].id}`)}
                      >
                        <div className="font-semibold mb-1">{recommended[0].name}</div>
                        <div className="text-xs text-faint mb-3">
                          🔥 重要 #{sortedByImp.findIndex(t => t.id === recommended[0].id) + 1} · 
                          💚 想做 #{sortedByDes.findIndex(t => t.id === recommended[0].id) + 1}
                          {recommended[0].pomodor_total > 0 && ` · 🍅 ${recommended[0].pomodor_completed}/${recommended[0].pomodor_total}`}
                        </div>
                        <button className="btn btn-primary text-xs py-1 px-3" style={{ minHeight: 28 }}>
                          🍅 开始番茄
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Ranking lists — stack vertically within right column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Importance axis */}
                    <div className="card p-0 overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-line">
                        <span className="font-medium text-sm">🔥 重要程度排序</span>
                        <span className="text-xs text-faint ml-2">拖动排序</span>
                      </div>
                      {leafTasks.length > 0 ? (
                        <AxisSelector
                          tasks={leafTasks}
                          axisType="importance"
                          onReorder={(id, pos) => reorderTask(id, 'importance', pos)}
                        />
                      ) : (
                        <div className="py-6 text-center text-sm text-faint">暂无可执行任务</div>
                      )}
                    </div>

                    {/* Desire axis */}
                    <div className="card p-0 overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-line">
                        <span className="font-medium text-sm">💚 想干程度排序</span>
                        <span className="text-xs text-faint ml-2">拖动排序</span>
                      </div>
                      {leafTasks.length > 0 ? (
                        <AxisSelector
                          tasks={leafTasks}
                          axisType="desire"
                          onReorder={(id, pos) => reorderTask(id, 'desire', pos)}
                        />
                      ) : (
                        <div className="py-6 text-center text-sm text-faint">暂无可执行任务</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Quick add input */}
      {!showArchive && (
        <form
          onSubmit={handleCreateTask}
          className="fixed left-1/2 w-full max-w-md xl:max-w-lg 2xl:max-w-xl px-4 z-30"
          style={{ bottom: '4.5rem', transform: 'translateX(-50%)' }}
        >
          <input
            ref={inputRef}
            type="text"
            value={newTaskName}
            onChange={e => setNewTaskName(e.target.value)}
            placeholder="新建任务，回车确认..."
            className="input shadow-md"
            style={{ background: 'var(--color-nav-bg)', backdropFilter: 'blur(8px)' }}
          />
        </form>
      )}
    </div>
  )
}
