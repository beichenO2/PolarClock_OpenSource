/**
 * AxisSelector — Apple-style spring drag-to-reorder list.
 *
 * KEY PRINCIPLE: DOM order never changes during drag.
 * Only CSS `translateY` is applied for visual displacement.
 * Target-index calculation is based on ORIGINAL item midpoints captured
 * before the drag starts — completely immune to layout-feedback loops.
 */
import { useState, useRef } from 'react'
import { Task } from '../stores/taskStore'

interface AxisSelectorProps {
  tasks: Task[]
  axisType: 'importance' | 'desire'
  onReorder: (taskId: string, newPosition: number) => void
  compact?: boolean
}

export default function AxisSelector({ tasks, axisType, onReorder, compact }: AxisSelectorProps) {
  const field = axisType === 'importance' ? 'importance_axis_position' : 'desire_axis_position'

  const sortedTasks = [...tasks]
    .filter(t => t.status !== 'completed')
    .sort((a, b) => (a[field] as number) - (b[field] as number))

  // ── Drag state ──────────────────────────────────────────────────────────────
  const [draggingId, setDraggingId]   = useState<string | null>(null)
  const [dragOffset, setDragOffset]   = useState(0)             // translateY for dragged item
  const [targetIndex, setTargetIndex] = useState<number | null>(null)

  const containerRef     = useRef<HTMLDivElement>(null)
  const targetIndexRef   = useRef<number | null>(null)
  // Snapshot of each item's vertical midpoint captured BEFORE any transforms —
  // used throughout the drag so position math never sees transformed coordinates.
  const origMidsRef      = useRef<number[]>([])
  const dragItemHRef     = useRef<number>(44)
  // Snapshot of containerTop at drag-start (offsetTop-based = scroll-invariant).
  // Must stay consistent with origMidsRef which also uses offsetTop.
  const containerTopRef  = useRef<number>(0)

  const dragIndex = draggingId ? sortedTasks.findIndex(t => t.id === draggingId) : -1

  // ── Visual style per item ────────────────────────────────────────────────────
  const getItemStyle = (index: number): React.CSSProperties => {
    const itemH = dragItemHRef.current

    if (dragIndex === -1 || targetIndex === null) {
      // Not dragging — spring back to natural position
      return {
        transform: 'translateY(0px)',
        transition: 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        zIndex: 1,
        position: 'relative',
      }
    }

    if (index === dragIndex) {
      // ── Dragged item: lift up, scale, follow mouse instantly ──
      return {
        transform: `translateY(${dragOffset}px) scale(1.035)`,
        transition: 'box-shadow 150ms ease, transform 0ms',
        zIndex: 30,
        position: 'relative',
        boxShadow: '0 10px 32px rgba(37,99,235,0.18), 0 2px 8px rgba(0,0,0,0.10)',
        borderRadius: 10,
        background: 'var(--color-accent-tint)',
      }
    }

    // ── Other items: spring shift to make room ──
    // Moving down  (targetIndex > dragIndex): items in (dragIndex, targetIndex] shift ↑
    // Moving up    (targetIndex < dragIndex): items in [targetIndex, dragIndex) shift ↓
    let shift = 0
    if (targetIndex > dragIndex && index > dragIndex && index <= targetIndex) {
      shift = -itemH
    } else if (targetIndex < dragIndex && index >= targetIndex && index < dragIndex) {
      shift = itemH
    }

    return {
      transform: `translateY(${shift}px)`,
      // Apple spring curve: slight overshoot gives that "wave / rubbery" feeling
      transition: 'transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      zIndex: 1,
      position: 'relative',
    }
  }

  // ── Target-index calculation (uses captured original midpoints only) ─────────
  // IMPORTANT: uses container-relative Y so page scrolling never affects the result.
  // containerTopRef is captured at drag-start so it stays consistent with origMidsRef
  // (both use the same scroll-invariant offsetTop coordinate space).
  const calcTargetIndex = (clientY: number): number => {
    const mids = origMidsRef.current
    if (!containerRef.current) return 0
    // containerTopRef is stored as document-Y (bcrTop + scrollY at drag-start).
    // origMidsRef uses offsetTop = container-relative Y.
    // So: relY = (clientY + current scrollY) - containerTopRef  => container-relative Y.
    const relY = (clientY + window.scrollY) - containerTopRef.current
    for (let i = 0; i < mids.length; i++) {
      if (relY < mids[i]) return i
    }
    return mids.length - 1
  }

  // ── Mouse drag handler ───────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent, taskId: string) => {
    e.preventDefault()

    const startX = e.clientX
    const startY = e.clientY
    const idx    = sortedTasks.findIndex(t => t.id === taskId)
    let dragging = false
    let curTarget = idx

    const onMove = (me: MouseEvent) => {
      if (!dragging) {
        // 4 px threshold — pure clicks never trigger drag
        if (Math.abs(me.clientX - startX) < 4 && Math.abs(me.clientY - startY) < 4) return
        dragging = true

        // Snapshot original midpoints NOW (draggingId still null → no transforms yet).
        // Use offsetTop (container-relative, scroll-invariant) NOT getBoundingClientRect().top
        // which is viewport-relative and shifts as the page scrolls during a long drag.
        if (containerRef.current) {
          const kids = Array.from(containerRef.current.children) as HTMLElement[]
          // Store the container's viewport-top at this exact moment, converted to
          // the same offsetTop coordinate space: BCR.top + scrollY gives document-Y,
          // then we track what clientY maps to offsetTop=0 for this container.
          // Simpler: we store BCR.top at start so calcTargetIndex can do: clientY - containerTopRef
          // This matches offsetTop only when scroll hasn't changed. But since origMids uses
          // offsetTop and the page may scroll during drag, we need to account for scroll.
          // Solution: capture containerTopRef as BCR.top at drag-start, and in calcTargetIndex
          // add the scroll delta. Alternatively, convert everything to document coordinates.
          // Cleanest fix: use scrollY-adjusted container top so it stays consistent:
          const bcrTop = containerRef.current.getBoundingClientRect().top
          const scrollYAtStart = window.scrollY
          // containerTopRef stores the document-Y of the container top
          containerTopRef.current = bcrTop + scrollYAtStart
          origMidsRef.current  = kids.map(el => el.offsetTop + el.offsetHeight / 2)
          // Step height: use actual distance between consecutive item tops (includes any gap)
          if (kids.length > 1) {
            dragItemHRef.current = (kids[1] as HTMLElement).offsetTop - (kids[0] as HTMLElement).offsetTop
          } else {
            dragItemHRef.current = (kids[idx] as HTMLElement)?.offsetHeight ?? 44
          }
        }

        setDraggingId(taskId)
        setDragOffset(0)
        setTargetIndex(idx)
        targetIndexRef.current = idx
        return   // don't process move until next event so React can batch state
      }

      setDragOffset(me.clientY - startY)

      const newTarget = calcTargetIndex(me.clientY)
      if (newTarget !== curTarget) {
        curTarget              = newTarget
        targetIndexRef.current = newTarget
        setTargetIndex(newTarget)
      }
    }

    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)

      const finalIdx = targetIndexRef.current
      if (dragging && finalIdx !== null && finalIdx !== idx) {
        // Use the stored position value of the task at the target visual index,
        // NOT the visual index itself. The backend operates on ALL leaf tasks
        // (including completed/blocked), so visual index != stored position.
        const targetPos = sortedTasks[finalIdx][field] as number
        onReorder(taskId, targetPos)
      }

      setDraggingId(null)
      setDragOffset(0)
      setTargetIndex(null)
      targetIndexRef.current = null
      origMidsRef.current    = []
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }

  // ── Touch drag handler ───────────────────────────────────────────────────────
  const touchStartYRef  = useRef(0)
  const touchIdRef      = useRef<string | null>(null)
  const touchIdxRef     = useRef(0)
  const touchTargetRef  = useRef<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent, taskId: string) => {
    const touch = e.touches[0]
    const idx   = sortedTasks.findIndex(t => t.id === taskId)

    touchStartYRef.current = touch.clientY
    touchIdRef.current     = taskId
    touchIdxRef.current    = idx
    touchTargetRef.current = idx

    if (containerRef.current) {
      const kids = Array.from(containerRef.current.children) as HTMLElement[]
      const bcrTop = containerRef.current.getBoundingClientRect().top
      containerTopRef.current = bcrTop + window.scrollY
      origMidsRef.current  = kids.map(el => el.offsetTop + el.offsetHeight / 2)
      if (kids.length > 1) {
        dragItemHRef.current = (kids[1] as HTMLElement).offsetTop - (kids[0] as HTMLElement).offsetTop
      } else {
        dragItemHRef.current = (kids[idx] as HTMLElement)?.offsetHeight ?? 44
      }
    }

    setDraggingId(taskId)
    setDragOffset(0)
    setTargetIndex(idx)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!draggingId) return
    const touch = e.touches[0]
    setDragOffset(touch.clientY - touchStartYRef.current)

    const newTarget = calcTargetIndex(touch.clientY)
    if (newTarget !== touchTargetRef.current) {
      touchTargetRef.current = newTarget
      setTargetIndex(newTarget)
    }
  }

  const handleTouchEnd = () => {
    const taskId   = touchIdRef.current
    const idx      = touchIdxRef.current
    const finalIdx = touchTargetRef.current

    if (taskId && finalIdx !== null && finalIdx !== idx) {
      const targetPos = sortedTasks[finalIdx][field] as number
      onReorder(taskId, targetPos)
    }

    setDraggingId(null)
    setDragOffset(0)
    setTargetIndex(null)
    touchIdRef.current     = null
    touchTargetRef.current = null
    origMidsRef.current    = []
  }

  // ── Visual rank: reflects tentative order during drag ─────────────────────────
  const getVisualRank = (index: number): number => {
    if (dragIndex === -1 || targetIndex === null) return index + 1

    if (index === dragIndex) return targetIndex + 1

    if (targetIndex > dragIndex && index > dragIndex && index <= targetIndex)
      return index          // shifted up → rank decreases by 1
    if (targetIndex < dragIndex && index >= targetIndex && index < dragIndex)
      return index + 2      // shifted down → rank increases by 1

    return index + 1
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (sortedTasks.length === 0) {
    return <div className="py-4 text-center text-sm text-faint">暂无任务</div>
  }

  return (
    <div
      ref={containerRef}
      className="select-none"
      style={{ position: 'relative' }}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {sortedTasks.map((task, index) => {
        const isDragging = draggingId === task.id
        const rank       = getVisualRank(index)
        const itemStyle  = getItemStyle(index)

        return (
          <div
            key={task.id}
            className="task-row"
            style={{
              cursor:      isDragging ? 'grabbing' : 'grab',
              paddingLeft: compact ? 8 : 12,
              background:  isDragging ? itemStyle.background : undefined,
              borderLeft:  isDragging ? '2px solid var(--color-accent)' : '2px solid transparent',
              borderRadius: isDragging ? (itemStyle.borderRadius as number) : undefined,
              ...itemStyle,
              // Merge borderLeft correctly (itemStyle may not have it)
            }}
            onMouseDown={e => handleMouseDown(e, task.id)}
            onTouchStart={e => handleTouchStart(e, task.id)}
          >
            {/* Rank badge */}
            <span
              className="shrink-0 h-5 rounded-full flex items-center justify-center font-semibold"
              style={{
                minWidth:   '1.25rem',
                padding:    rank >= 10 ? '0 0.3rem' : '0',
                background: rank === 1 ? '#FDE68A' : rank === 2 ? '#E5E7EB' : rank === 3 ? '#FCD9A0' : 'var(--color-overlay)',
                color:      rank <= 3 ? 'var(--color-text)' : 'var(--color-text-muted)',
                fontSize:   '0.6875rem',
              }}
            >
              {rank}
            </span>

            {/* Task name */}
            <span className="flex-1 text-sm truncate">{task.name}</span>

            {/* Pomodoro progress */}
            {task.pomodor_total > 0 && (
              <span className="text-xs text-faint shrink-0">
                🍅{task.pomodor_completed}/{task.pomodor_total}
              </span>
            )}

            {/* Drag handle */}
            <span className="drag-handle shrink-0 text-sm" style={{ opacity: isDragging ? 1 : 0.5 }}>⠿</span>
          </div>
        )
      })}
    </div>
  )
}
