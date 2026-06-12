import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTaskStore, Task, Question } from '../stores/taskStore'
import AxisSelector from '../components/AxisSelector'
import GanttChart from '../components/GanttChart'

/* ── QuestionCard: a self-contained question + answer card ────────── */
interface QCardProps {
  q: Question
  index: number
  answered: boolean
  onChange: (updated: Question) => void
  onDelete: () => void
}
function QuestionCard({ q, index, onChange, onDelete }: QCardProps) {
  const [qText, setQText] = useState(q.question)
  const [aText, setAText] = useState(q.answer)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow textarea
  const grow = useCallback(() => {
    if (!areaRef.current) return
    areaRef.current.style.height = 'auto'
    areaRef.current.style.height = areaRef.current.scrollHeight + 'px'
  }, [])
  useEffect(() => { grow() }, [aText, grow])

  const answered = aText.trim().length > 0

  return (
    <div className="card overflow-hidden" style={
      answered ? { borderLeft: '3px solid var(--color-positive)' } : { borderLeft: '3px solid var(--color-border)' }
    }>
      {/* Question row */}
      <div className="flex items-start gap-2 px-3 pt-3 pb-2">
        <span style={{
          fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-accent)',
          background: 'var(--color-accent-tint)', borderRadius: 4, padding: '2px 6px',
          marginTop: 2, flexShrink: 0, letterSpacing: '0.05em'
        }}>Q{index}</span>
        <input
          className="flex-1 text-sm bg-transparent outline-none"
          style={{ color: 'var(--color-text)', minWidth: 0 }}
          placeholder="提出一个问题…"
          value={qText}
          onChange={e => setQText(e.target.value)}
          onBlur={() => { if (qText !== q.question) onChange({ ...q, question: qText }) }}
        />
        <button
          onClick={onDelete}
          className="shrink-0 text-faint hover:text-danger transition-colors"
          style={{ fontSize: '0.75rem', marginTop: 2 }}
        >✕</button>
      </div>
      {/* Answer row */}
      <div className="flex items-start gap-2 px-3 pb-3">
        <span style={{
          fontSize: '0.65rem', fontWeight: 700,
          color: answered ? 'var(--color-positive)' : 'var(--color-text-faint)',
          marginTop: 3, flexShrink: 0, width: 28, textAlign: 'center'
        }}>{answered ? '✓✓' : 'A'}</span>
        <textarea
          ref={areaRef}
          className="flex-1 text-sm bg-transparent outline-none resize-none"
          style={{
            color: answered ? 'var(--color-text)' : 'var(--color-text-muted)',
            minHeight: 36, lineHeight: 1.6,
          }}
          placeholder="写下你的发现和答案…"
          value={aText}
          onChange={e => { setAText(e.target.value); grow() }}
          onBlur={() => { if (aText !== q.answer) onChange({ ...q, answer: aText }) }}
        />
      </div>
    </div>
  )
}

/** Return the task with taskId plus all its descendants (recursive). */
function buildSubtree(allTasks: Task[], rootId: string): Task[] {
  const result: Task[] = []
  const visit = (tid: string) => {
    const t = allTasks.find(x => x.id === tid)
    if (!t) return
    result.push(t)
    allTasks.filter(x => x.parent_id === tid).forEach(c => visit(c.id))
  }
  visit(rootId)
  return result
}

/* ── StorySection: one free-text "narrative" textarea ─────────── */
function StorySection({ task, onSave }: { task: Task; onSave: (s: string) => void }) {
  const [value, setValue] = useState(task.story ?? '')
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const hasContent = value.trim().length > 0

  const grow = useCallback(() => {
    if (!areaRef.current) return
    areaRef.current.style.height = 'auto'
    areaRef.current.style.height = areaRef.current.scrollHeight + 'px'
  }, [])
  useEffect(() => { grow() }, [value, grow])

  // Sync if task changes (e.g. navigation)
  useEffect(() => { setValue(task.story ?? '') }, [task.id])

  return (
    <section className="mb-6">
      <div className="flex items-center mb-3">
        <h2>📖 讲故事</h2>
        <span className="text-xs text-faint ml-2">让任务有意义</span>
      </div>
      <div className="card overflow-hidden" style={
        hasContent
          ? { borderLeft: '3px solid #F59E0B' }
          : { borderLeft: '3px solid var(--color-border)' }
      }>
        <textarea
          ref={areaRef}
          className="w-full bg-transparent outline-none resize-none text-sm"
          style={{
            padding: '14px 16px',
            minHeight: 72,
            lineHeight: 1.65,
            color: hasContent ? 'var(--color-text)' : 'var(--color-text-faint)',
          }}
          placeholder={"这个任务是一个什么故事——\n遇到了什么困难，要通过什么方式解决？"}
          value={value}
          onChange={e => { setValue(e.target.value); grow() }}
          onBlur={() => { if (value !== (task.story ?? '')) onSave(value) }}
        />
      </div>
    </section>
  )
}

/* ── TagsSection: freeform tag management ────────────────────── */
function TagsSection({ task, onSave }: { task: Task; onSave: (tags: string[]) => void }) {
  const [input, setInput] = useState('')
  const tags = task.tags ?? []

  const addTag = () => {
    const raw = input.trim().toLowerCase()
    if (!raw || tags.includes(raw)) { setInput(''); return }
    onSave([...tags, raw])
    setInput('')
  }

  const removeTag = (tag: string) => {
    onSave(tags.filter(t => t !== tag))
  }

  const palette = [
    { bg: '#DBEAFE', border: '#93C5FD', text: '#1E40AF' },
    { bg: '#D1FAE5', border: '#6EE7B7', text: '#065F46' },
    { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E' },
    { bg: '#FCE7F3', border: '#F9A8D4', text: '#9D174D' },
    { bg: '#EDE9FE', border: '#C4B5FD', text: '#5B21B6' },
    { bg: '#FFEDD5', border: '#FDBA74', text: '#9A3412' },
    { bg: '#E0F2FE', border: '#7DD3FC', text: '#0C4A6E' },
  ]

  return (
    <section className="mb-6">
      <div className="flex items-center mb-3">
        <h2>🏷️ 标签</h2>
        <span className="text-xs text-faint ml-2">分类和快速筛选</span>
      </div>
      <div className="card" style={{ padding: '12px 14px' }}>
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {tags.map((tag, i) => {
              const c = palette[i % palette.length]
              return (
                <span key={tag} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 500,
                  background: c.bg, border: `1px solid ${c.border}`, color: c.text,
                }}>
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                      padding: 0, marginLeft: 2, color: c.text, opacity: 0.6, fontSize: '0.7rem' }}
                  >×</button>
                </span>
              )
            })}
          </div>
        )}
        <form
          onSubmit={e => { e.preventDefault(); addTag() }}
          style={{ display: 'flex', gap: 8 }}
        >
          <input
            type="text"
            className="input flex-1"
            placeholder="添加标签（回车确认）"
            value={input}
            onChange={e => setInput(e.target.value)}
            style={{ fontSize: '0.85rem' }}
          />
          <button
            type="submit"
            className="btn btn-ghost text-xs"
            style={{ minHeight: 28, padding: '4px 12px' }}
            disabled={!input.trim()}
          >添加</button>
        </form>
      </div>
    </section>
  )
}

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { tasks, fetchTasks, fetchGanttData, ganttData, updateTask, createTask, deleteTask,
          reorderTask, updateBlocks, updateQuestions, updateDependencies, updateStory, updateTags } = useTaskStore()
  const [newSubtaskName, setNewSubtaskName] = useState('')
  const [showImpSort, setShowImpSort] = useState(false)
  const [showDesSort, setShowDesSort] = useState(false)
  const [showDepPicker, setShowDepPicker] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')

  const task = tasks.find(t => t.id === id)
  const subtasks = tasks.filter(t => t.parent_id === id)

  useEffect(() => { fetchTasks(); fetchGanttData() }, [])

  useEffect(() => {
    if (task) setNameValue(task.name)
  }, [task?.name])

  if (tasks.length === 0) {
    return (
      <div className="page flex items-center justify-center">
        <div className="text-muted text-sm">加载中...</div>
      </div>
    )
  }
  if (!task) {
    return (
      <div className="page flex items-center justify-center">
        <div className="text-muted text-sm">任务不存在</div>
      </div>
    )
  }

  const hasChildren = subtasks.length > 0
  const isLeaf = !hasChildren

  // Progress: aggregated from children or own data
  const totalPom = hasChildren ? subtasks.reduce((s, t) => s + t.pomodor_total, 0) : task.pomodor_total
  const donePom  = hasChildren ? subtasks.reduce((s, t) => s + t.pomodor_completed, 0) : task.pomodor_completed
  const pct = totalPom > 0 ? Math.round((donePom / totalPom) * 100) : 0

  const handleComplete = async () => {
    if (task.status !== 'completed') {
      await updateTask(task.id, { status: 'completed' })  // cascades + auto-archives
      navigate('/clock/tasks')
    } else {
      // Restore
      await updateTask(task.id, { status: 'pending' })
    }
  }

  const handleCreateSubtask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSubtaskName.trim() || !id) return
    await createTask(newSubtaskName, undefined, id)
    setNewSubtaskName('')
  }

  const handleStartPomodoro = () => {
    if (!id) return
    updateTask(id, { status: 'in_progress' })
    navigate('/clock/timer')
  }

  // Gantt: show only this task and its descendants.
  // We build the subtree from `tasks` (always fresh from fetchTasks/fetchGanttData),
  // so the hasChildren check inside GanttChart is scoped to this project's tree only.
  // actuals come from ganttData when available.
  const ganttTasks = id ? buildSubtree(tasks, id) : [task, ...subtasks]
  const ganttRootIds = [task.id]

  // ── Leaf-task helpers (used for AxisSelector and non-leaf average display) ──
  const allParentIds = new Set(tasks.filter(t => t.parent_id).map(t => t.parent_id!))
  const allLeafTasks = tasks.filter(t => !allParentIds.has(t.id))   // only leaves, system-wide

  // For non-leaf tasks: average importance/desire of their leaf descendants (display only)
  const leafDescendants = ganttTasks.filter(t => t.id !== task.id && !allParentIds.has(t.id))
  const avgImp = leafDescendants.length > 0
    ? (leafDescendants.reduce((s, t) => s + t.importance_axis_position, 0) / leafDescendants.length).toFixed(1)
    : null
  const avgDes = leafDescendants.length > 0
    ? (leafDescendants.reduce((s, t) => s + t.desire_axis_position, 0) / leafDescendants.length).toFixed(1)
    : null

  /* ── Status color ──────────────────────────────────────── */
  const statusColors: Record<string, { bg: string; text: string }> = {
    pending:     { bg: 'var(--color-bg)', text: 'var(--color-text-muted)' },
    in_progress: { bg: 'var(--color-accent-tint)', text: 'var(--color-accent)' },
    completed:   { bg: 'var(--color-positive-tint)', text: 'var(--color-positive)' },
  }
  const sc = statusColors[task.status] || statusColors.pending

  return (
    <div className="page max-w-2xl">
      {/* Back */}
      <button
        onClick={() => navigate('/clock/tasks')}
        className="flex items-center gap-1 text-sm text-muted mb-5 hover:text-ink transition-colors"
      >
        ← 返回任务列表
      </button>

      {/* Title */}
      <div className="mb-5">
        {editingName ? (
          <input
            autoFocus
            className="input text-xl font-semibold mb-1"
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            onBlur={() => { updateTask(task.id, { name: nameValue }); setEditingName(false) }}
            onKeyDown={e => { if (e.key === 'Enter') { updateTask(task.id, { name: nameValue }); setEditingName(false) } }}
          />
        ) : (
          <h1
            className="mb-1 cursor-pointer hover:opacity-70 transition-opacity"
            onClick={() => setEditingName(true)}
            title="点击编辑名称"
          >{task.name}</h1>
        )}
        {task.deadline && (
          <p className="text-sm" style={{ color: '#D97706' }}>
            📅 截止 {new Date(task.deadline).toLocaleDateString('zh-CN')}
          </p>
        )}
      </div>

      {/* Status + Metrics */}
      {isLeaf ? (
        /* Leaf task: status + clickable importance & desire */
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="card p-3">
            <div className="section-label mb-1">状态</div>
            <div className="text-sm font-medium" style={{ color: sc.text }}>
              {{ pending: '待开始', in_progress: '进行中', completed: '已完成' }[task.status]}
            </div>
          </div>

          {/* Importance — clickable */}
          <div
            className="card p-3 cursor-pointer hover:shadow transition-shadow"
            onClick={() => { setShowImpSort(s => !s); setShowDesSort(false) }}
            title="点击调整重要程度排名"
          >
            <div className="section-label mb-1">🔥 重要</div>
            <div className="text-lg font-semibold" style={{ color: 'var(--color-accent)' }}>
              #{task.importance_axis_position}
            </div>
          </div>

          {/* Desire — clickable */}
          <div
            className="card p-3 cursor-pointer hover:shadow transition-shadow"
            onClick={() => { setShowDesSort(s => !s); setShowImpSort(false) }}
            title="点击调整想干程度排名"
          >
            <div className="section-label mb-1">💚 想做</div>
            <div className="text-lg font-semibold" style={{ color: 'var(--color-positive)' }}>
              #{task.desire_axis_position}
            </div>
          </div>
        </div>
      ) : (
        /* Non-leaf task: status + read-only averages of leaf descendants */
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="card p-3">
            <div className="section-label mb-1">状态</div>
            <div className="text-sm font-medium" style={{ color: sc.text }}>
              {{ pending: '待开始', in_progress: '进行中', completed: '已完成' }[task.status]}
            </div>
          </div>

          {/* Importance — read-only average */}
          <div className="card p-3" style={{ opacity: 0.65 }} title="叶子任务重要度均値（只读）">
            <div className="section-label mb-1">🔥 重要均</div>
            <div className="text-lg font-semibold" style={{ color: '#93C5FD' }}>
              {avgImp !== null ? `#${avgImp}` : '—'}
            </div>
          </div>

          {/* Desire — read-only average */}
          <div className="card p-3" style={{ opacity: 0.65 }} title="叶子任务想做度均値（只读）">
            <div className="section-label mb-1">💚 想做均</div>
            <div className="text-lg font-semibold" style={{ color: '#86EFAC' }}>
              {avgDes !== null ? `#${avgDes}` : '—'}
            </div>
          </div>
        </div>
      )}



      {/* Inline importance sort — leaf only, list shows only leaf tasks */}
      {isLeaf && showImpSort && (
        <div className="card overflow-hidden mb-4 fade-in">
          <div className="px-4 py-2.5 border-b border-line flex items-center">
            <span className="font-medium text-sm">🔥 调整重要程度排序</span>
            <button onClick={() => setShowImpSort(false)} className="ml-auto text-faint text-xs">收起</button>
          </div>
          <AxisSelector
            tasks={allLeafTasks}
            axisType="importance"
            onReorder={(tid, pos) => reorderTask(tid, 'importance', pos)}
          />
        </div>
      )}

      {/* Inline desire sort — leaf only, list shows only leaf tasks */}
      {isLeaf && showDesSort && (
        <div className="card overflow-hidden mb-4 fade-in">
          <div className="px-4 py-2.5 border-b border-line flex items-center">
            <span className="font-medium text-sm">💚 调整想干程度排序</span>
            <button onClick={() => setShowDesSort(false)} className="ml-auto text-faint text-xs">收起</button>
          </div>
          <AxisSelector
            tasks={allLeafTasks}
            axisType="desire"
            onReorder={(tid, pos) => reorderTask(tid, 'desire', pos)}
          />
        </div>
      )}

      {/* Progress */}
      {totalPom > 0 && (
        <div className="mb-5">
          <div className="flex justify-between text-xs text-muted mb-1.5">
            <span>进度{hasChildren ? '（子任务聚合）' : ''}</span>
            <span>🍅 {donePom}/{totalPom} · {pct}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-overlay)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: pct === 100 ? 'var(--color-positive)' : 'var(--color-accent)'
              }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {isLeaf && task.status !== 'completed' && (
          <button onClick={handleStartPomodoro} className="btn btn-primary">
            🍅 开始番茄钟
          </button>
        )}
        <button
          onClick={handleComplete}
          className="btn"
          style={{
            background: task.status === 'completed' ? 'var(--color-positive-tint)' : 'var(--color-card)',
            borderColor: task.status === 'completed' ? 'var(--color-positive)' : 'var(--color-border)',
            color: task.status === 'completed' ? 'var(--color-positive)' : 'var(--color-text-muted)'
          }}
        >
          {task.status === 'completed' ? '✓ 已完成（点击恢复）' : '标记完成'}
        </button>
        <button
          onClick={() => deleteTask(task.id).then(() => navigate('/clock/tasks'))}
          className="btn btn-danger"
        >
          删除
        </button>
      </div>

      {/* ── 讲故事 ──────────────────────────────────────────────── */}
      <StorySection task={task} onSave={s => updateStory(task.id, s)} />

      {/* ── 标签 ───────────────────────────────────────────────── */}
      <TagsSection task={task} onSave={tags => updateTags(task.id, tags)} />

      {/* ── 以终为始：问题导向 ──────────────────────────────────────── */}
      <section className="mb-6">
        <div className="flex items-center mb-3">
          <h2>🗻 以终为始</h2>
          <span className="text-xs text-faint ml-2">问题导向，让探索驱动行动</span>
          <button
            onClick={() => {
              const newQ = { id: crypto.randomUUID(), question: '', answer: '' }
              updateQuestions(task.id, [...(task.questions ?? []), newQ])
            }}
            className="ml-auto btn btn-ghost text-xs py-1 px-2"
            style={{ minHeight: 28 }}
          >+ 添加问题</button>
        </div>

        {(task.questions ?? []).length === 0 ? (
          <div className="card p-5 text-center">
            <p className="text-sm text-faint mb-1">🔍 还没有探索问题</p>
            <p className="text-xs text-faint mb-3">
              把目标转化成问题，让工作变成寻找答案的探索之旅
            </p>
            <button
              onClick={() => {
                const newQ = { id: crypto.randomUUID(), question: '', answer: '' }
                updateQuestions(task.id, [newQ])
              }}
              className="btn btn-ghost text-xs py-1 px-3"
            >+ 添加第一个问题</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(task.questions ?? []).map((q, idx) => (
              <QuestionCard
                key={q.id}
                q={q}
                index={idx + 1}
                answered={q.answer.trim().length > 0}
                onChange={updated => {
                  const next = (task.questions ?? []).map(x => x.id === q.id ? updated : x)
                  updateQuestions(task.id, next)
                }}
                onDelete={() => {
                  const next = (task.questions ?? []).filter(x => x.id !== q.id)
                  updateQuestions(task.id, next)
                }}
              />
            ))}
            <button
              onClick={() => {
                const newQ = { id: crypto.randomUUID(), question: '', answer: '' }
                updateQuestions(task.id, [...(task.questions ?? []), newQ])
              }}
              className="btn btn-ghost text-xs py-2"
              style={{ width: '100%' }}
            >+ 添加问题</button>
          </div>
        )}
      </section>

      {/* Gantt chart (synced with main gantt — same taskStore.updateBlocks → same backend file) */}
      <section className="mb-6">
        <h2 className="mb-3">甘特图</h2>
        <GanttChart
          tasks={ganttTasks}
          actuals={ganttData?.actuals}
          rootIds={ganttRootIds}
          onTaskClick={t => t.id !== task.id && navigate(`/clock/tasks/${t.id}`)}
          onUpdateBlocks={(tid, blocks) => updateBlocks(tid, blocks)}
        />
      </section>

      {/* Subtasks */}
      <section>
        <div className="flex items-center mb-3">
          <h2>子任务</h2>
          {hasChildren && (
            <span className="text-xs text-faint ml-2">
              {subtasks.filter(t => t.status === 'completed').length}/{subtasks.length} 完成
            </span>
          )}
        </div>

        <div className="card overflow-hidden mb-3">
          {subtasks.length === 0 ? (
            <div className="py-6 text-center text-sm text-faint">
              暂无子任务 · 像函数拆分子函数一样分解任务
            </div>
          ) : (
            subtasks.map(sub => (
              <div
                key={sub.id}
                className={`task-row ${sub.status === 'completed' ? 'completed' : ''}`}
                onClick={() => navigate(`/clock/tasks/${sub.id}`)}
              >
                <span className={`status-dot ${sub.status === 'completed' ? 'completed' : sub.status === 'in_progress' ? 'in-progress' : 'pending'}`} />
                <span className={`flex-1 text-sm truncate ${sub.status === 'completed' ? 'line-through opacity-50' : ''}`}>
                  {sub.name}
                </span>
                {sub.pomodor_total > 0 && (
                  <span className="text-xs text-faint shrink-0">
                    🍅{sub.pomodor_completed}/{sub.pomodor_total}
                  </span>
                )}
                <button
                  onClick={e => { e.stopPropagation(); deleteTask(sub.id) }}
                  className="text-faint hover:text-danger shrink-0 text-xs"
                >✕</button>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleCreateSubtask} className="flex gap-2">
          <input
            type="text"
            value={newSubtaskName}
            onChange={e => setNewSubtaskName(e.target.value)}
            placeholder="添加子任务..."
            className="input flex-1"
          />
          <button type="submit" className="btn btn-primary shrink-0">添加</button>
        </form>
      </section>

      {/* ── 依赖项（只有根任务有）───────────────────────────────── */}
      {!task.parent_id && (() => {
        const deps = task.dependencies ?? []
        const rootTasks = tasks.filter(t => !t.parent_id && t.id !== task.id && !t.archived)
        const available = rootTasks.filter(t => !deps.includes(t.id))

        const addDep = (depId: string) => {
          updateDependencies(task.id, [...deps, depId])
          setShowDepPicker(false)
        }
        const removeDep = (depId: string) => {
          updateDependencies(task.id, deps.filter(d => d !== depId))
        }

        return (
          <section className="mt-4">
            <div
              className="flex items-center gap-2 mb-3 cursor-pointer select-none"
              onClick={() => setShowDepPicker(v => !v)}
              style={{ opacity: 0.7 }}
            >
              <h2 style={{ fontSize: '0.95rem' }}>🔗 前置依赖项</h2>
              <span className="text-xs text-faint">前置全部完成后，子任务才会出现在 Last Thing</span>
              <span className="text-xs text-faint ml-auto">{showDepPicker ? '∧' : '∨'}</span>
            </div>

            {(showDepPicker || deps.length > 0) && (
              <div>
                {/* Selected deps */}
                {deps.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {deps.map(depId => {
                      const dep = tasks.find(t => t.id === depId)
                      if (!dep) return null
                      const done = dep.status === 'completed'
                      return (
                        <div key={depId} style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '3px 8px', borderRadius: 999, fontSize: '0.75rem',
                          background: done ? '#F0FDF4' : '#FFF7ED',
                          border: `1px solid ${done ? '#86EFAC' : '#FED7AA'}`,
                          color: done ? '#16A34A' : '#EA580C',
                        }}>
                          <span>{done ? '✓' : '○'}</span>
                          <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {dep.name}
                          </span>
                          <button
                            onClick={e => { e.stopPropagation(); removeDep(depId) }}
                            style={{ marginLeft: 2, opacity: 0.6, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
                          >×</button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Picker */}
                {showDepPicker && (
                  <div className="card p-0 overflow-hidden mb-2">
                    {available.length === 0 ? (
                      <div className="py-4 text-center text-xs text-faint">
                        {rootTasks.length === 0 ? '暂无其他根任务' : '所有根任务已添加为依赖'}
                      </div>
                    ) : (
                      available.map(t => (
                        <div
                          key={t.id}
                          className="task-row"
                          style={{ cursor: 'pointer' }}
                          onClick={() => addDep(t.id)}
                        >
                          <span style={{
                            fontSize: '0.65rem', fontWeight: 600,
                            color: t.status === 'completed' ? '#16A34A' : '#9B9890'
                          }}>{t.status === 'completed' ? '✓' : '○'}</span>
                          <span className="text-sm flex-1">{t.name}</span>
                          <span className="text-xs text-faint">+ 添加为前置</span>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {showDepPicker && deps.length === 0 && available.length > 0 && (
                  <p className="text-xs text-faint">点击上方任务即可添加为前置依赖</p>
                )}
              </div>
            )}
          </section>
        )
      })()}
    </div>
  )
}
