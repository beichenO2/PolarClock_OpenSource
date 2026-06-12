import { useState, useRef, useCallback, useEffect, memo } from 'react'
import { RecurringRule, useScheduleStore, getWeekMonday, isoDateDow, ruleAppliesOn } from '../stores/scheduleStore'

// ── Constants ─────────────────────────────────────────────────────────────────

const START_HOUR = 6
const END_HOUR   = 23
const HOURS      = END_HOUR - START_HOUR
const MINS       = HOURS * 60  // total visible minutes

const fmtHHMM = (minutes: number): string => {
  const h = Math.floor(minutes / 60) + START_HOUR
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const parseHHMM = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h - START_HOUR) * 60 + m
}

const toHHMM = (minutes: number): string => {
  const abs = Math.max(0, Math.min(MINS, minutes))
  const h   = Math.floor(abs / 60) + START_HOUR
  const m   = abs % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const snapToHalf = (m: number) => Math.round(m / 30) * 30

/** Get the Monday of the week containing `d`, as a Date. */
function getMonday(d: Date): Date {
  const copy = new Date(d)
  const day  = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

/** Return ISO date string for a day within week: monday + dayIndex(0-6) */
function dayISO(monday: Date, dayIndex: number): string {
  const d = new Date(monday)
  d.setDate(monday.getDate() + dayIndex)
  return d.toISOString().split('T')[0]
}

// ── Visual block type ─────────────────────────────────────────────────────────

interface BlockVisual {
  ruleId: string
  dayIndex: number
  startMin: number  // minutes from START_HOUR
  endMin: number
  name: string
  rule: RecurringRule
}

// ── Drag state ────────────────────────────────────────────────────────────────

interface DragState {
  type: 'create' | 'move' | 'resize-top' | 'resize-bottom'
  ruleId?: string
  dayIndex: number
  startY: number
  origStart?: number
  origEnd?: number
}

// ── Session block type (read-only, from stats) ────────────────────────────────

export interface SessionBlock {
  id: string
  type: 'pomodoro' | 'exercise' | 'meditation' | 'break'
  started_at: string   // ISO8601
  completed_at: string // ISO8601
  duration_minutes: number
  exercise_type?: string | null
  task_id?: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  /** Monday of the currently displayed week */
  weekMonday: Date
  /** Read-only session blocks from stats (番茄钟/运动记录) */
  sessions?: SessionBlock[]
}

export default memo(function WeekSchedule({ weekMonday, sessions = [] }: Props) {
  const { rules, fetchRules, createRule, updateRule, deleteRule, splitRule, endRule } = useScheduleStore()

  useEffect(() => { fetchRules() }, [])

  const [drag, setDrag]               = useState<DragState | null>(null)
  const [creating, setCreating]       = useState<{ dayIndex: number; startMin: number; endMin: number } | null>(null)
  const [editingBlock, setEditingBlock] = useState<{ ruleId: string; startMin: number; endMin: number } | null>(null)
  const [blockName, setBlockName]     = useState('')
  const [showNameInput, setShowNameInput] = useState(false)
  const gridRef = useRef<HTMLDivElement>(null)

  // ── Compute visuals ──────────────────────────────────────────────────────────

  const getBlocksForDay = useCallback((dayIndex: number): BlockVisual[] => {
    const iso = dayISO(weekMonday, dayIndex)
    // dayIndex 0=Mon…6=Sun matches day_of_week 0=Mon…6=Sun directly
    // Use dayIndex for day matching; use iso only to check effective_from/until dates
    return rules
      .filter(r => r.day_of_week === dayIndex && ruleAppliesOn(r, iso))
      .map(r => ({
        ruleId:   r.id,
        dayIndex,
        startMin: parseHHMM(r.start_hhmm),
        endMin:   parseHHMM(r.end_hhmm),
        name:     r.name,
        rule:     r,
      }))
  }, [rules, weekMonday])


  const allBlocks = useCallback((): BlockVisual[] => {
    return Array.from({ length: 7 }, (_, i) => getBlocksForDay(i)).flat()
  }, [getBlocksForDay])

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const getMinFromY = (y: number, height: number): number => {
    const ratio = Math.max(0, Math.min(1, y / height))
    return Math.round(ratio * MINS)
  }

  /**
   * Is the rule "same-week"? i.e. started on or after this week's Monday.
   * If yes → we can update in-place. If no → need to split (后复权).
   */
  const isSameWeek = (rule: RecurringRule): boolean => {
    const mondayISO = weekMonday.toISOString().split('T')[0]
    return rule.effective_from >= mondayISO
  }

  // ── Mouse handlers ────────────────────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent, dayIndex: number) => {
    if (!gridRef.current) return
    const rect   = gridRef.current.getBoundingClientRect()
    const y      = e.clientY - rect.top
    const height = rect.height

    // Find clicked block
    const clickPct = y / height
    const blocks   = getBlocksForDay(dayIndex)
    const clicked  = blocks.find(b => {
      const top    = b.startMin / MINS
      const bottom = b.endMin   / MINS
      return clickPct >= top && clickPct <= bottom
    })

    if (clicked) {
      const topPct    = clicked.startMin / MINS
      const bottomPct = clicked.endMin   / MINS
      const edgePx    = height * 0.04
      if (y - topPct * height < edgePx) {
        setDrag({ type: 'resize-top',    ruleId: clicked.ruleId, dayIndex, startY: e.clientY, origStart: clicked.startMin, origEnd: clicked.endMin })
      } else if (bottomPct * height - y < edgePx) {
        setDrag({ type: 'resize-bottom', ruleId: clicked.ruleId, dayIndex, startY: e.clientY, origStart: clicked.startMin, origEnd: clicked.endMin })
      } else {
        setDrag({ type: 'move',          ruleId: clicked.ruleId, dayIndex, startY: e.clientY, origStart: clicked.startMin, origEnd: clicked.endMin })
      }
      return
    }

    // Start creating
    const min = snapToHalf(getMinFromY(y, height))
    setCreating({ dayIndex, startMin: min, endMin: min + 60 })
    setDrag({ type: 'create', dayIndex, startY: e.clientY })
  }

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!gridRef.current || !drag) return
    const rect   = gridRef.current.getBoundingClientRect()
    const height = rect.height
    const dy     = e.clientY - drag.startY
    const dMin   = snapToHalf(getMinFromY(Math.abs(dy), height) * Math.sign(dy))

    if (drag.type === 'create' && creating) {
      const end = Math.max(creating.startMin + 30, snapToHalf(getMinFromY(e.clientY - rect.top, height)))
      setCreating(p => p ? { ...p, endMin: end } : p)
    } else if (drag.ruleId && drag.origStart !== undefined && drag.origEnd !== undefined) {
      const dur  = drag.origEnd - drag.origStart
      let s = drag.origStart, en = drag.origEnd
      if      (drag.type === 'move')          { s = Math.max(0, Math.min(MINS - dur, drag.origStart + dMin)); en = s + dur }
      else if (drag.type === 'resize-top')    { s  = Math.max(0, Math.min(drag.origEnd - 30, drag.origStart + dMin)) }
      else if (drag.type === 'resize-bottom') { en = Math.max(drag.origStart + 30, Math.min(MINS, drag.origEnd + dMin)) }
      setEditingBlock({ ruleId: drag.ruleId, startMin: s, endMin: en })
    }
  }, [drag, creating])

  const handleMouseUp = useCallback(async () => {
    // Create flow
    if (drag?.type === 'create' && creating) {
      if (creating.endMin - creating.startMin >= 60) {
        setShowNameInput(true)
      } else {
        setCreating(null)
      }
      setDrag(null)
      return
    }

    // Move/resize flow — persist with 后复权 logic
    if (drag?.ruleId && editingBlock) {
      const { ruleId, startMin, endMin } = editingBlock
      if (endMin - startMin < 60) {
        // Too short → delete (with 后复权 if old week)
        const rule = rules.find(r => r.id === ruleId)
        if (rule) {
          const mondayISO = weekMonday.toISOString().split('T')[0]
          if (isSameWeek(rule)) {
            await deleteRule(ruleId)
          } else {
            await endRule(ruleId, mondayISO)
          }
        }
      } else {
        const newStart = toHHMM(startMin)
        const newEnd   = toHHMM(endMin)
        const rule     = rules.find(r => r.id === ruleId)
        if (rule) {
          const mondayISO = weekMonday.toISOString().split('T')[0]
          if (isSameWeek(rule)) {
            // Same week → in-place update (no past weeks exist with this rule)
            await updateRule(ruleId, { start_hhmm: newStart, end_hhmm: newEnd })
          } else {
            // Cross-week → split (后复权)
            await splitRule(ruleId, mondayISO, newStart, newEnd)
          }
        }
      }
      setEditingBlock(null)
    }

    setDrag(null)
  }, [drag, creating, editingBlock, rules, weekMonday, deleteRule, endRule, updateRule, splitRule])

  const handleConfirmCreate = async () => {
    if (!creating || !blockName.trim()) return
    const iso = dayISO(weekMonday, creating.dayIndex)
    await createRule(
      blockName.trim(),
      creating.dayIndex,           // dayIndex 0=Mon…6=Sun = day_of_week
      toHHMM(creating.startMin),
      toHHMM(creating.endMin),
      iso,  // effective_from = this specific date
    )
    setCreating(null)
    setBlockName('')
    setShowNameInput(false)
  }


  const handleDeleteBlock = async (block: BlockVisual) => {
    const mondayISO = weekMonday.toISOString().split('T')[0]
    if (isSameWeek(block.rule)) {
      await deleteRule(block.ruleId)
    } else {
      // 后复权：stop the rule from applying this week onward
      await endRule(block.ruleId, mondayISO)
    }
  }

  // ── Week label helpers ────────────────────────────────────────────────────────

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekMonday)
    d.setDate(weekMonday.getDate() + i)
    return d
  })

  // ── Rendering ─────────────────────────────────────────────────────────────────

  const blockStyle = (startMin: number, endMin: number, dayIndex: number, extra?: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute',
    top:    `${(startMin / MINS) * 100}%`,
    height: `${((endMin - startMin) / MINS) * 100}%`,
    left:   `${(dayIndex / 7) * 100 + 0.5}%`,
    width:  `${100 / 7 - 1}%`,
    minHeight: 20,
    ...extra,
  })

  return (
    <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 16, overflow: 'hidden' }}>
      {/* Day headers */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', background: 'var(--color-record-bg)' }}>
        <div style={{ width: 40, padding: '8px 0', textAlign: 'center', fontSize: '0.65rem', color: 'var(--color-text-faint)', borderRight: '1px solid var(--color-border)', flexShrink: 0 }}>时间</div>
        <div style={{ flex: 1, display: 'flex' }}>
          {weekDays.map((day, i) => {
            const isToday = day.toDateString() === new Date().toDateString()
            return (
              <div key={i} style={{
                flex: 1, padding: '6px 0', textAlign: 'center',
                borderRight: i < 6 ? '1px solid var(--color-border)' : 'none',
              }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-faint)' }}>{day.toLocaleDateString('zh-CN', { weekday: 'short' })}</div>
                <div style={{
                  fontSize: '0.8rem', fontWeight: 600,
                  color: isToday ? '#fff' : 'var(--color-text)',
                  background: isToday ? 'var(--color-accent)' : 'transparent',
                  borderRadius: '50%', width: 24, height: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '2px auto 0',
                }}>{day.getDate()}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Time grid */}
      <div style={{ display: 'flex', position: 'relative', height: 520 }}>
        {/* Hour labels */}
        <div style={{ width: 40, flexShrink: 0, borderRight: '1px solid var(--color-border)', position: 'relative', background: 'var(--color-record-bg)' }}>
          {Array.from({ length: HOURS }, (_, i) => (
            <div key={i} style={{
              position: 'absolute', right: 4, fontSize: '0.6rem', color: 'var(--color-text-faint)',
              top: `${(i / HOURS) * 100}%`, transform: 'translateY(-50%)',
            }}>
              {String(START_HOUR + i).padStart(2, '0')}
            </div>
          ))}
        </div>

        {/* Drag grid */}
        <div
          ref={gridRef}
          style={{ flex: 1, position: 'relative', cursor: 'crosshair', userSelect: 'none' }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Hour lines */}
          {Array.from({ length: HOURS }, (_, i) => (
            <div key={i} style={{
              position: 'absolute', left: 0, right: 0,
              top: `${(i / HOURS) * 100}%`,
              borderTop: i === 0 ? 'none' : '1px solid var(--color-record-border)',
            }} />
          ))}

          {/* Half-hour lines */}
          {Array.from({ length: HOURS }, (_, i) => (
            <div key={`h${i}`} style={{
              position: 'absolute', left: 0, right: 0,
              top: `${((i + 0.5) / HOURS) * 100}%`,
              borderTop: '1px dashed var(--color-overlay)',
            }} />
          ))}

          {/* Day separator columns */}
          {weekDays.map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${(i / 7) * 100}%`, width: `${100 / 7}%`,
                borderRight: i < 6 ? '1px solid var(--color-record-border)' : 'none',
              }}
              onMouseDown={e => handleMouseDown(e, i)}
            />
          ))}

          {/* Session blocks (read-only: 番茄钟/运动记录) */}
          {sessions.map(session => {
            if (!session.started_at || !session.completed_at) return null
            const startDate = new Date(session.started_at)
            const endDate   = new Date(session.completed_at)
            // Find which day column this session belongs to
            const sessionISO = startDate.toISOString().split('T')[0]
            const dayIndex = weekDays.findIndex(d => d.toISOString().split('T')[0] === sessionISO)
            if (dayIndex === -1) return null

            const startMin = (startDate.getHours() - START_HOUR) * 60 + startDate.getMinutes()
            const endMin   = (endDate.getHours()   - START_HOUR) * 60 + endDate.getMinutes()
            if (startMin >= MINS || endMin <= 0) return null

            const clampedStart = Math.max(0, startMin)
            const clampedEnd   = Math.min(MINS, Math.max(clampedStart + 15, endMin))

            const bg = session.type === 'exercise'
              ? '#10B981'
              : session.type === 'meditation'
                ? '#8B5CF6'
                : '#F59E0B'

            const label = session.type === 'exercise'
              ? (session.exercise_type === 'running' ? '🏃 跑步' : '🥊 拳击')
              : session.type === 'meditation'
                ? '🧘 冥想'
                : '🍅 番茄钟'

            return (
              <div
                key={session.id}
                title={`${label} ${session.duration_minutes}min`}
                style={{
                  ...blockStyle(clampedStart, clampedEnd, dayIndex),
                  background: bg,
                  borderRadius: 6,
                  overflow: 'hidden',
                  zIndex: 15,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                  pointerEvents: 'none',
                  opacity: 0.85,
                }}
              >
                <div style={{ padding: '3px 5px', pointerEvents: 'none' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>{label}</div>
                  <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.85)' }}>
                    {fmtHHMM(clampedStart)} – {fmtHHMM(clampedEnd)}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Existing blocks */}
          {allBlocks().map(block => {
            const editing = editingBlock?.ruleId === block.ruleId
              ? editingBlock
              : { startMin: block.startMin, endMin: block.endMin }
            const isSame = isSameWeek(block.rule)

            return (
              <div
                key={`${block.ruleId}-${block.dayIndex}`}
                style={{
                  ...blockStyle(editing.startMin, editing.endMin, block.dayIndex),
                  background: isSame ? '#6366F1' : '#8B5CF6',
                  borderRadius: 6,
                  overflow: 'hidden',
                  zIndex: 20,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                  transition: editingBlock?.ruleId === block.ruleId ? 'none' : 'top 0.1s, height 0.1s',
                  cursor: 'move',
                }}
              >
                {/* Resize top */}
                <div
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, cursor: 'ns-resize' }}
                  onMouseDown={e => { e.stopPropagation(); setDrag({ type: 'resize-top', ruleId: block.ruleId, dayIndex: block.dayIndex, startY: e.clientY, origStart: block.startMin, origEnd: block.endMin }) }}
                />
                {/* Content */}
                <div style={{ padding: '3px 5px', pointerEvents: 'none' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>{block.name}</div>
                  <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.8)' }}>
                    {fmtHHMM(editing.startMin)} – {fmtHHMM(editing.endMin)}
                  </div>
                  {!isSame && (
                    <div style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>🔁 周期</div>
                  )}
                </div>
                {/* Delete */}
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteBlock(block) }}
                  style={{
                    position: 'absolute', top: 2, right: 2,
                    width: 14, height: 14, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.25)', border: 'none',
                    color: '#fff', fontSize: 8, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: 0, transition: 'opacity 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
                >✕</button>
                {/* Resize bottom */}
                <div
                  style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, cursor: 'ns-resize' }}
                  onMouseDown={e => { e.stopPropagation(); setDrag({ type: 'resize-bottom', ruleId: block.ruleId, dayIndex: block.dayIndex, startY: e.clientY, origStart: block.startMin, origEnd: block.endMin }) }}
                />
              </div>
            )
          })}

          {/* Creating preview */}
          {creating && (
            <div style={{
              ...blockStyle(creating.startMin, creating.endMin, creating.dayIndex),
              background: 'rgba(99,102,241,0.3)',
              border: '2px dashed #6366F1',
              borderRadius: 6, zIndex: 30, pointerEvents: 'none',
            }}>
              <div style={{ padding: '3px 5px', fontSize: '0.65rem', color: '#4338CA' }}>
                {fmtHHMM(creating.startMin)} – {fmtHHMM(creating.endMin)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Name input for new block */}
      {showNameInput && creating && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid #E8E5DF', background: '#F4F9FF', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: '#6B6860', flexShrink: 0 }}>
            {weekDays[creating.dayIndex].toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })}
            {' '}{fmtHHMM(creating.startMin)} – {fmtHHMM(creating.endMin)}
          </span>
          <input
            autoFocus
            value={blockName}
            onChange={e => setBlockName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleConfirmCreate(); if (e.key === 'Escape') { setCreating(null); setShowNameInput(false) } }}
            placeholder="Block 名称（每周此时段自动重复）"
            style={{ flex: 1, padding: '6px 12px', border: '1.5px solid #BFDBFE', borderRadius: 8, fontSize: '0.82rem', outline: 'none' }}
          />
          <button onClick={handleConfirmCreate} disabled={!blockName.trim()} style={{ padding: '6px 16px', background: '#6366F1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}>确认</button>
          <button onClick={() => { setCreating(null); setShowNameInput(false) }} style={{ padding: '6px 12px', background: '#F4F3F0', color: '#6B6860', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem' }}>取消</button>
        </div>
      )}

      {/* Help */}
      <div style={{ padding: '8px 12px', background: '#FAFAF9', borderTop: '1px solid #E8E5DF', fontSize: '0.68rem', color: '#9B9890' }}>
        💡 拖动创建 Block（每周自动重复）· 修改本周及以后不会影响已过去的周 · 拖边缘调整大小 · 悬停显示删除按钮
      </div>
    </div>
  )
})
