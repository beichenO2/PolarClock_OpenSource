import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTimerStore } from '../stores/timerStore'

export default function MiniTimer() {
  const { status, remaining_seconds, mode, break_type } = useTimerStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [pos, setPos] = useState({ x: 16, y: -1 })
  const [dragging, setDragging] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const dragRef = useRef({ startX: 0, startY: 0, origX: 0, origY: 0 })
  const elRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pos.y < 0) setPos(p => ({ ...p, y: window.innerHeight - 140 }))
  }, [pos.y])

  const isActive = status === 'running' || status === 'paused'
  const isOnTimer = location.pathname.includes('/clock/timer')

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    setDragging(true)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [pos])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 60, dragRef.current.origX + dx)),
      y: Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.origY + dy)),
    })
  }, [dragging])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const dx = Math.abs(e.clientX - dragRef.current.startX)
    const dy = Math.abs(e.clientY - dragRef.current.startY)
    setDragging(false)
    if (dx < 5 && dy < 5) {
      if (expanded) navigate('/clock/timer')
      setExpanded(x => !x)
    }
  }, [expanded, navigate])

  if (!isActive || isOnTimer) return null

  const total = mode === 'meditation' ? 1200
    : break_type !== 'none' ? (break_type === 'short' ? 600 : break_type === 'leisure' ? 900 : 1200)
    : 2700
  const progress = Math.max(0, 1 - remaining_seconds / total)
  const r = 18, c = 2 * Math.PI * r
  const mm = Math.floor(remaining_seconds / 60)
  const ss = remaining_seconds % 60
  const timeStr = `${mm}:${String(ss).padStart(2, '0')}`

  const color = break_type !== 'none' ? '#10B981'
    : mode === 'meditation' ? '#8B5CF6'
    : status === 'paused' ? '#F59E0B' : '#3B82F6'

  return (
    <div
      ref={elRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'fixed', left: pos.x, top: pos.y, zIndex: 9980,
        width: expanded ? 100 : 48, height: expanded ? 56 : 48,
        borderRadius: expanded ? 14 : 24,
        background: 'var(--color-card, rgba(30,30,30,0.95))',
        border: `2px solid ${color}40`,
        boxShadow: `0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px ${color}20`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        cursor: dragging ? 'grabbing' : 'grab',
        touchAction: 'none', userSelect: 'none',
        transition: dragging ? 'none' : 'width 0.2s, height 0.2s, border-radius 0.2s',
        backdropFilter: 'blur(12px)',
      }}
    >
      {!expanded ? (
        <svg width={44} height={44} viewBox="0 0 44 44">
          <circle cx={22} cy={22} r={r} fill="none" stroke={`${color}20`} strokeWidth={3} />
          <circle
            cx={22} cy={22} r={r} fill="none" stroke={color} strokeWidth={3}
            strokeDasharray={c} strokeDashoffset={c * (1 - progress)}
            strokeLinecap="round"
            transform="rotate(-90 22 22)"
            style={{ transition: 'stroke-dashoffset 0.5s' }}
          />
          <text x={22} y={23} textAnchor="middle" dominantBaseline="middle"
            fontSize={status === 'paused' ? 10 : 9} fill={color} fontWeight={700} fontFamily="monospace">
            {status === 'paused' ? '⏸' : `${mm}`}
          </text>
        </svg>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width={32} height={32} viewBox="0 0 44 44">
              <circle cx={22} cy={22} r={r} fill="none" stroke={`${color}20`} strokeWidth={3} />
              <circle
                cx={22} cy={22} r={r} fill="none" stroke={color} strokeWidth={3}
                strokeDasharray={c} strokeDashoffset={c * (1 - progress)}
                strokeLinecap="round" transform="rotate(-90 22 22)"
                style={{ transition: 'stroke-dashoffset 0.5s' }}
              />
            </svg>
            <div>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color, fontFamily: 'monospace' }}>{timeStr}</div>
              <div style={{ fontSize: '0.5rem', color: 'var(--color-text-faint)' }}>
                {status === 'paused' ? '已暂停' : mode === 'meditation' ? '冥想' : break_type !== 'none' ? '休息' : '专注'}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
