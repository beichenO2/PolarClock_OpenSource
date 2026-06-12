import React, { useEffect, useState, useRef, lazy, Suspense } from 'react'
import { useStatsStore, HeatmapDay, HeatmapSession, StatsRecord, TaskCompletionStat, PeakHourSlot } from '../stores/statsStore'

const ShareCard = lazy(() => import('../components/ShareCard'))
const Achievements = lazy(() => import('../components/Achievements'))

// ── Canvas Light Strip ─────────────────────────────────────────────────────────

const STRIP_H = 180  // taller strip = more visible gradient
const STRIP_W = 12

function timeToFrac(iso: string): number {
  try {
    const d = new Date(iso)
    if (!isNaN(d.getTime()))
      return (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400
  } catch {}
  return 0
}

function sessionColor(s: HeatmapSession): [number, number, number] {
  if (s.type === 'exercise') return [245, 158, 11]
  if (s.type === 'meditation') return [139, 92, 246]
  return [34, 197, 94]
}

function LightStrip({ day, isToday }: { day: HeatmapDay; isToday: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const W = STRIP_W, H = STRIP_H
    canvas.width = W; canvas.height = H

    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim() || '#F8F7F4'
    ctx.fillStyle = bgColor
    ctx.beginPath()
    ctx.roundRect(0, 0, W, H, 3)
    ctx.fill()

    const sessions = (day.sessions ?? []).slice().sort(
      (a, b) => timeToFrac(a.started_at) - timeToFrac(b.started_at)
    )
    if (sessions.length === 0) return

    // Fixed spread: max 15 minutes regardless of session length
    const MAX_SPREAD_MIN = 15
    const maxSpreadFrac  = MAX_SPREAD_MIN / (24 * 60)

    // ── Phase 1: draw halos + cores for each session ──
    for (const s of sessions) {
      const startFrac = timeToFrac(s.started_at)
      const durFrac   = s.duration_minutes / (24 * 60)
      const endFrac   = Math.min(1, startFrac + durFrac)
      const spread    = Math.min(maxSpreadFrac, 0.5 * Math.max(durFrac, 5 / (24 * 60)))

      const y0 = startFrac * H
      const y1 = endFrac   * H
      const [r, g, b] = sessionColor(s)

      const colSolid = `rgba(${r},${g},${b},0.9)`
      const colEdge  = `rgba(${r},${g},${b},0)`

      // Top halo — shorter, fade 0 → solid within spread
      const topY = Math.max(0, y0 - spread * H)
      if (topY < y0) {
        const g1 = ctx.createLinearGradient(0, topY, 0, y0)
        g1.addColorStop(0, colEdge)
        g1.addColorStop(1, colSolid)
        ctx.fillStyle = g1
        ctx.fillRect(0, topY, W, y0 - topY)
      }

      // Core
      ctx.fillStyle = colSolid
      ctx.fillRect(0, y0, W, Math.max(2, y1 - y0))

      // Bottom halo — shorter, fade solid → 0 within spread
      const botY = Math.min(H, y1 + spread * H)
      if (botY > y1) {
        const g2 = ctx.createLinearGradient(0, y1, 0, botY)
        g2.addColorStop(0, colSolid)
        g2.addColorStop(1, colEdge)
        ctx.fillStyle = g2
        ctx.fillRect(0, y1, W, botY - y1)
      }
    }

    // ── Phase 2: fill inter-session gaps < 30 min with dim color ──
    // This makes short breaks (5-15 min) appear as light continuation instead of hard white gap.
    const GAP_THRESHOLD_MIN = 30
    const gapThreshFrac = GAP_THRESHOLD_MIN / (24 * 60)

    for (let i = 0; i < sessions.length - 1; i++) {
      const a = sessions[i]
      const b = sessions[i + 1]

      const aEnd   = timeToFrac(a.started_at) + a.duration_minutes / (24 * 60)
      const bStart = timeToFrac(b.started_at)
      const gap    = bStart - aEnd

      if (gap > 0 && gap < gapThreshFrac) {
        // Use the earlier session's color at low opacity — like a dim bridge
        const [r, g2, bC] = sessionColor(a)
        const intensity = Math.max(0.06, 0.22 * (1 - gap / gapThreshFrac))  // fades as gap grows
        ctx.fillStyle = `rgba(${r},${g2},${bC},${intensity})`
        ctx.fillRect(0, aEnd * H, W, gap * H)
      }
    }
  }, [day])

  return (
    <canvas ref={canvasRef} width={STRIP_W} height={STRIP_H}
      title={`${day.date}  ${day.sessions?.length ?? 0} 条记录`}
      style={{ width:STRIP_W, height:STRIP_H, display:'block', flexShrink:0,
        borderRadius:3, cursor:'default',
        outline: isToday ? '2px solid #3B82F6' : 'none', outlineOffset:1 }} />
  )
}


function LightStripHeatmap({ days }: { days: HeatmapDay[] }) {
  const today = new Date().toISOString().split('T')[0]
  return (
    <div>
      <div style={{ display:'flex', gap:3, marginBottom:5, paddingLeft:28 }}>
        {days.map((day, i) => (
          <div key={day.date} style={{ width:STRIP_W, flexShrink:0, textAlign:'center' }}>
            {(i===0 || i%5===0 || day.date===today) && (
              <div style={{ fontSize:'0.44rem', color:'var(--color-text-faint)', whiteSpace:'nowrap', transform:'translateX(-50%)', marginLeft:STRIP_W/2 }}>
                {day.date.slice(5)}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:3, alignItems:'flex-start' }}>
        <div style={{ display:'flex', flexDirection:'column', justifyContent:'space-between', height:STRIP_H, marginRight:3, flexShrink:0 }}>
          {['0时','6时','12时','18时','24时'].map(t => (
            <span key={t} style={{ fontSize:'0.42rem', color:'var(--color-border-strong)', lineHeight:1 }}>{t}</span>
          ))}
        </div>
        {days.map(day => <LightStrip key={day.date} day={day} isToday={day.date===today} />)}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:10, fontSize:'0.62rem', color:'var(--color-text-faint)' }}>
        {([['#22C55E','工作'],['#F59E0B','锻炼'],['#8B5CF6','冥想'],['#ECEAE6','无记录']] as [string,string][]).map(([c,l])=>(
          <div key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:8, height:8, borderRadius:2, background:c, border:'1px solid rgba(0,0,0,0.08)' }} />
            <span>{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}



// ── GitHub-style Grid Heatmap ─────────────────────────────────────────────────

function GithubHeatmap({ days, compact = false }: { days: HeatmapDay[]; compact?: boolean }) {
  const sz = compact ? 7 : 11
  const gap = compact ? 2 : 3
  const today = new Date().toISOString().split('T')[0]

  const getColor = (day: HeatmapDay) => {
    const p = day.pomodoro_count ?? 0
    const e = day.exercise_count ?? 0
    const m = day.meditation_count ?? 0
    const total = p + e + m
    if (total === 0) return '#EBEDF0'

    if (m > 0 && m > p && m > e) {
      const t = Math.min(m / 3, 1)
      return t < 0.4 ? '#EDE9FE' : t < 0.7 ? '#C4B5FD' : '#8B5CF6'
    }
    if (e > 0 && e > p) {
      const t = Math.min(e / 4, 1)
      return t < 0.4 ? '#FEF9C3' : t < 0.7 ? '#FDE047' : '#EAB308'
    }
    const t = Math.min(total / 6, 1)
    if (t < 0.2) return '#9BE9A8'
    if (t < 0.4) return '#40C463'
    if (t < 0.7) return '#30A14E'
    return '#216E39'
  }

  // Group days into weeks (columns)
  const weeks: HeatmapDay[][] = []
  let week: HeatmapDay[] = []
  // Pad start to Monday
  if (days.length > 0) {
    const firstDate = new Date(days[0].date + 'T00:00:00')
    const dow = firstDate.getDay() === 0 ? 6 : firstDate.getDay() - 1
    for (let i = 0; i < dow; i++) week.push({ date: '' })
  }
  for (const d of days) {
    week.push(d)
    if (week.length === 7) { weeks.push(week); week = [] }
  }
  if (week.length > 0) weeks.push(week)

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'flex', gap, alignItems: 'flex-start', minWidth: 'max-content' }}>
        {weeks.map((wk, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap }}>
            {wk.map((day, di) => (
              <div
                key={`${wi}-${di}`}
                title={day.date ? `${day.date}: ${day.pomodoro_count ?? 0} 个番茄，${day.exercise_count ?? 0} 次锻炼，${day.meditation_count ?? 0} 次冥想` : ''}
                style={{
                  width: sz,
                  height: sz,
                  borderRadius: 2,
                  background: day.date ? getColor(day) : 'transparent',
                  outline: day.date === today ? `1.5px solid #3B82F6` : 'none',
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: '0.62rem', color: 'var(--color-text-faint)' }}>
        <span>少</span>
        {['#EBEDF0', '#9BE9A8', '#40C463', '#30A14E', '#216E39'].map(c => (
          <div key={c} style={{ width: sz, height: sz, borderRadius: 2, background: c }} />
        ))}
        <span>多</span>
        <span style={{ color: '#F59E0B' }}>🟡锻炼</span>
        <span style={{ color: '#8B5CF6' }}>🟣冥想</span>
      </div>
    </div>
  )
}

// ── Main Stats Page ───────────────────────────────────────────────────────────


const PEAK_DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']
const PEAK_HOURS = Array.from({ length: 18 }, (_, i) => i + 6)

function PeakHoursChart({ slots, peakCount }: { slots: PeakHourSlot[]; peakCount: number }) {
  const slotMap = new Map<string, PeakHourSlot>()
  for (const s of slots) slotMap.set(`${s.day_of_week}-${s.hour}`, s)

  const cellColor = (count: number) => {
    if (count === 0) return 'var(--color-overlay)'
    const alpha = 0.15 + Math.min(count / peakCount, 1) * 0.85
    return `rgba(233, 69, 96, ${alpha})`
  }

  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 14 }}>🔥 高效时段</h2>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `32px repeat(${PEAK_HOURS.length}, 1fr)`, gap: 2, minWidth: 400 }}>
          <div />
          {PEAK_HOURS.map(h => (
            <div key={h} style={{ fontSize: '0.55rem', textAlign: 'center', color: 'var(--color-text-faint)' }}>{h}</div>
          ))}
          {PEAK_DAY_LABELS.map((label, dow) => (
            <React.Fragment key={dow}>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{label}</div>
              {PEAK_HOURS.map(h => {
                const slot = slotMap.get(`${dow}-${h}`)
                const count = slot?.session_count ?? 0
                return (
                  <div
                    key={`${dow}-${h}`}
                    title={count > 0 ? `${PEAK_DAY_LABELS[dow]} ${h}:00 · ${count}次 · ${slot?.total_minutes ?? 0}分钟` : ''}
                    style={{
                      aspectRatio: '1', borderRadius: 3,
                      background: cellColor(count),
                      transition: 'background 0.2s',
                    }}
                  />
                )
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '0.6rem', color: 'var(--color-text-faint)' }}>少</span>
        {[0.15, 0.35, 0.6, 0.85, 1].map((a, i) => (
          <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: `rgba(233,69,96,${a})` }} />
        ))}
        <span style={{ fontSize: '0.6rem', color: 'var(--color-text-faint)' }}>多</span>
      </div>
    </div>
  )
}

type HeatmapRange = '1m' | '3m' | '1y'

export default function Stats() {
  const { today, weekly, monthly, heatmapData, taskCompletion, peakHours, loading, fetchAll, fetchHeatmap } = useStatsStore()
  const [heatmapRange, setHeatmapRange] = useState<HeatmapRange>('1m')
  const [showShare, setShowShare] = useState(false)

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleRangeChange = (range: HeatmapRange) => {
    setHeatmapRange(range)
    fetchHeatmap(range)
  }

  // SVG trend line
  const renderTrend = () => {
    if (!monthly || monthly.trend.length === 0) return null
    const data = monthly.trend
    const W = 760, H = 160
    const pad = { t: 16, r: 12, b: 28, l: 36 }
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b
    const maxV = Math.max(monthly.max_count, 1)
    const pts = data.map((d, i) => ({
      x: pad.l + (i / Math.max(data.length - 1, 1)) * pw,
      y: pad.t + ph - (d.count / maxV) * ph,
      ...d,
    }))
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')
    const area = `${line} L${pts[pts.length - 1].x},${pad.t + ph} L${pts[0].x},${pad.t + ph}Z`
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        <defs>
          <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, Math.ceil(maxV / 2), maxV].map((v, i) => {
          const y = pad.t + ph - (v / maxV) * ph
          return (
            <g key={i}>
              <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} stroke="var(--color-border)" strokeDasharray="4,3" />
              <text x={pad.l - 6} y={y + 4} textAnchor="end" fontSize="11" fill="var(--color-text-faint)">{v}</text>
            </g>
          )
        })}
        <path d={area} fill="url(#tg)" />
        <path d={line} fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.filter(p => p.count > 0).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#3B82F6" />
        ))}
      </svg>
    )
  }

    if (loading && !today) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
        <span style={{ color: 'var(--color-text-faint)', fontSize: '0.9rem' }}>加载统计数据…</span>
      </div>
    )
  }

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>📊 数据统计</h1>
        <button
          onClick={() => setShowShare(true)}
          style={{
            padding: '6px 14px', background: 'var(--color-overlay)',
            border: '1px solid var(--color-border)', borderRadius: 10,
            color: 'var(--color-text-muted)', fontSize: '0.78rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >📤 分享</button>
      </div>

      <Suspense fallback={null}>
        <ShareCard visible={showShare} onClose={() => setShowShare(false)} />
      </Suspense>

      {/* Today summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: '今日番茄', value: today?.pomodoro_count ?? 0, color: '#10B981', unit: '个' },
          { label: '工作时长', value: today ? `${Math.floor(today.work_minutes / 60)}h${today.work_minutes % 60}m` : '0h', color: '#3B82F6', unit: '' },
          { label: '运动时长', value: today ? `${today.exercise_minutes}m` : '0m', color: '#F59E0B', unit: '' },
          { label: '冥想', value: today?.meditation_count ?? 0, color: '#8B5CF6', unit: '次' },
          { label: '总计时长', value: today ? `${Math.floor(today.total_minutes / 60)}h${today.total_minutes % 60}m` : '0h', color: '#6366F1', unit: '' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card" style={{ textAlign: 'center', padding: '18px 12px' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color, lineHeight: 1.1, marginBottom: 4 }}>
              {value}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Heatmap — new design */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 18px' }}>
        {/* Header with range selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>📅 活动热力图</h2>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['1m', '3m', '1y'] as HeatmapRange[]).map(r => (
              <button
                key={r}
                onClick={() => handleRangeChange(r)}
                style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 600,
                  border: heatmapRange === r ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border)',
                  background: heatmapRange === r ? 'var(--color-accent-tint)' : 'var(--color-card)',
                  color: heatmapRange === r ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                }}
              >
                {r === '1m' ? '1月' : r === '3m' ? '3月' : '1年'}
              </button>
            ))}
          </div>
        </div>

        {heatmapData ? (
          heatmapRange === '1m' ? (
            <LightStripHeatmap days={heatmapData.days} />
          ) : (
            <GithubHeatmap days={heatmapData.days} compact={heatmapRange === '1y'} />
          )
        ) : (
          <p style={{ textAlign: 'center', color: 'var(--color-text-faint)', padding: '24px 0', fontSize: '0.85rem' }}>暂无数据</p>
        )}
      </div>

      {/* Weekly bar chart */}
      {weekly && weekly.days.length > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: '16px 18px' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 14 }}>📊 本周工作分布</h2>
          {(() => {
            const today = new Date().toISOString().split('T')[0]
            const last7 = weekly.days.slice(-7)
            const maxMin = Math.max(...last7.map(d => d.work_minutes + d.exercise_minutes), 1)
            const barH = 120
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: barH, marginBottom: 6 }}>
                  {last7.map(d => {
                    const workH = (d.work_minutes / maxMin) * barH
                    const exH = (d.exercise_minutes / maxMin) * barH
                    const isToday = d.date === today
                    return (
                      <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                        {(workH > 0 || exH > 0) && (
                          <span style={{ fontSize: '0.55rem', color: 'var(--color-text-faint)', marginBottom: 2 }}>
                            {d.work_minutes + d.exercise_minutes}m
                          </span>
                        )}
                        <div style={{ width: '100%', maxWidth: 36, display: 'flex', flexDirection: 'column' }}>
                          {exH > 0 && (
                            <div style={{
                              height: Math.max(2, exH), borderRadius: '4px 4px 0 0',
                              background: '#F59E0B', opacity: isToday ? 1 : 0.7,
                            }} />
                          )}
                          <div style={{
                            height: Math.max(2, workH),
                            borderRadius: exH > 0 ? '0 0 4px 4px' : 4,
                            background: isToday ? '#3B82F6' : 'var(--color-accent)',
                            opacity: isToday ? 1 : 0.6,
                          }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {last7.map(d => (
                    <div key={d.date} style={{ flex: 1, textAlign: 'center', fontSize: '0.55rem', color: 'var(--color-text-faint)' }}>
                      {d.weekday}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: '0.62rem', color: 'var(--color-text-faint)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--color-accent)' }} />
                    <span>工作</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: '#F59E0B' }} />
                    <span>锻炼</span>
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Monthly trend */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 18px' }}>
        <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>📈 月度趋势</h2>
        {monthly && monthly.trend.length > 0 ? (
          <>
            {renderTrend()}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: '0.72rem', color: 'var(--color-text-faint)' }}>
              <span>日均 <b style={{ color: 'var(--color-text)' }}>{monthly.avg_per_day}</b> 个番茄</span>
              <span>总计 <b style={{ color: 'var(--color-text)' }}>{monthly.total_pomodoros}</b> 个</span>
            </div>
          </>
        ) : <p style={{ textAlign: 'center', color: 'var(--color-text-faint)', padding: '24px 0', fontSize: '0.85rem' }}>暂无数据</p>}
      </div>

      {/* Task Completion Rate (REQ-203) */}
      {taskCompletion && (
        <div className="card" style={{ marginBottom: 20, padding: '16px 18px' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 14 }}>🎯 任务完成率</h2>

          {/* Overview row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 10, background: 'var(--color-record-bg)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3B82F6', lineHeight: 1.1 }}>
                {taskCompletion.overall_completion_rate}%
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-faint)', marginTop: 2 }}>番茄完成率</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 10, background: 'var(--color-record-bg)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10B981', lineHeight: 1.1 }}>
                {taskCompletion.tasks_completed}/{taskCompletion.tasks_total}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-faint)', marginTop: 2 }}>任务完成</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px 8px', borderRadius: 10, background: 'var(--color-record-bg)' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F59E0B', lineHeight: 1.1 }}>
                {taskCompletion.task_completion_rate}%
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-text-faint)', marginTop: 2 }}>任务达标率</div>
            </div>
          </div>

          {/* Per-task breakdown */}
          {taskCompletion.tasks.filter((t: TaskCompletionStat) => !t.archived && t.pomodoro_total > 0).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {taskCompletion.tasks
                .filter((t: TaskCompletionStat) => !t.archived && t.pomodoro_total > 0)
                .map((t: TaskCompletionStat) => (
                  <div key={t.task_id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 8,
                    background: 'var(--color-record-bg)',
                  }}>
                    <span style={{
                      fontSize: '0.78rem', fontWeight: 500, flex: 1,
                      color: 'var(--color-text)', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {t.task_name}
                    </span>
                    <div style={{ width: 60, height: 5, borderRadius: 3, background: 'var(--color-border)', overflow: 'hidden', flexShrink: 0 }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        width: `${Math.min(100, t.completion_rate)}%`,
                        background: t.completion_rate >= 100 ? '#10B981' : t.completion_rate >= 50 ? '#3B82F6' : '#F59E0B',
                        transition: 'width 0.3s ease',
                      }} />
                    </div>
                    <span style={{ fontSize: '0.68rem', color: 'var(--color-text-faint)', whiteSpace: 'nowrap', minWidth: 42, textAlign: 'right' }}>
                      {t.pomodoro_completed}/{t.pomodoro_total}
                    </span>
                    <span style={{
                      fontSize: '0.65rem', fontWeight: 600, minWidth: 36, textAlign: 'right',
                      color: t.completion_rate >= 100 ? '#10B981' : t.completion_rate >= 50 ? '#3B82F6' : '#F59E0B',
                    }}>
                      {t.completion_rate}%
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Peak hours heatmap */}
      {peakHours && peakHours.peak_count > 0 && <PeakHoursChart slots={peakHours.slots} peakCount={peakHours.peak_count} />}

      {/* Today records */}
      {today && today.records.length > 0 && (
        <div className="card" style={{ padding: '16px 18px' }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>🕐 今日记录</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {today.records.map((rec: StatsRecord) => (
              <div key={rec.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 10,
                background: 'var(--color-record-bg)', border: '1px solid var(--color-record-border)',
              }}>
                <span style={{ fontSize: '1.1rem' }}>
                  {rec.type === 'pomodoro' ? '🍅' : rec.type === 'exercise' ? '🏃' : rec.type === 'meditation' ? '🧘' : '☕'}
                </span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--color-text)' }}>
                    {rec.type === 'pomodoro'
                      ? (rec.is_partial ? '不完整番茄' : '番茄钟')
                      : rec.type === 'exercise'
                        ? (rec.exercise_type === 'boxing' ? '拳击' : '跑步')
                        : rec.type === 'meditation'
                          ? (rec.is_partial ? '不完整冥想' : '冥想')
                          : '休息'}
                  </span>
                  {rec.is_partial && (
                    <span style={{
                      fontSize: '0.62rem', marginLeft: 6, padding: '1px 6px',
                      borderRadius: 4, background: '#FEF3C7', color: '#92400E', fontWeight: 500,
                    }}>中断</span>
                  )}
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)', marginLeft: 6 }}>
                    {rec.duration_minutes} 分钟
                  </span>
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-faint)' }}>
                  {new Date(rec.completed_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Achievements */}
      <Suspense fallback={null}>
        <Achievements />
      </Suspense>
    </div>
  )
}
