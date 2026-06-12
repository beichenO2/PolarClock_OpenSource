import { useRef, useState, useCallback } from 'react'
import html2canvas from 'html2canvas'
import { useStatsStore } from '../stores/statsStore'

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)}分钟`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}小时${m}分` : `${h}小时`
}

function getLongestStreak(days: Array<{ pomodoro_count: number }>): number {
  let max = 0, cur = 0
  for (const d of days) {
    if (d.pomodoro_count > 0) { cur++; max = Math.max(max, cur) }
    else cur = 0
  }
  return max
}

interface Props {
  visible: boolean
  onClose: () => void
}

export default function ShareCard({ visible, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [exporting, setExporting] = useState(false)
  const { today, weekly } = useStatsStore()

  const weekPomodoros = weekly?.days.reduce((s, d) => s + d.pomodoro_count, 0) ?? 0
  const weekWorkMin = weekly?.days.reduce((s, d) => s + d.work_minutes, 0) ?? 0
  const streak = getLongestStreak(weekly?.days ?? [])
  const todayDate = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })

  const handleExport = useCallback(async () => {
    if (!cardRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        backgroundColor: null,
        useCORS: true,
      })
      const link = document.createElement('a')
      link.download = `polarclock-${new Date().toISOString().slice(0, 10)}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } finally {
      setExporting(false)
    }
  }, [])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 600,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }} onClick={onClose}>
      <div style={{ maxWidth: 360, width: '100%' }} onClick={e => e.stopPropagation()}>

        {/* The card to capture */}
        <div ref={cardRef} style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)',
          borderRadius: 20, padding: '28px 24px', color: '#fff',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, #e94560, #c81d4e)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.1rem',
            }}>⏱</div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 700 }}>PolarClock</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.7 }}>{todayDate}</div>
            </div>
          </div>

          {/* Today highlight */}
          <div style={{
            background: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: '18px 16px',
            marginBottom: 16, backdropFilter: 'blur(10px)',
          }}>
            <div style={{ fontSize: '0.72rem', opacity: 0.6, marginBottom: 8 }}>今日专注</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: '2.4rem', fontWeight: 800, lineHeight: 1 }}>
                {today?.pomodoro_count ?? 0}
              </span>
              <span style={{ fontSize: '0.82rem', opacity: 0.7 }}>个番茄</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.88rem', fontWeight: 600, color: '#e94560' }}>
                {fmtDuration(today?.work_minutes ?? 0)}
              </span>
            </div>
          </div>

          {/* Week stats grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16,
          }}>
            <div style={{
              background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 12px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#e94560' }}>{weekPomodoros}</div>
              <div style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: 2 }}>本周番茄</div>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 12px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#4ade80' }}>{fmtDuration(weekWorkMin)}</div>
              <div style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: 2 }}>专注时长</div>
            </div>
            <div style={{
              background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '14px 12px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#facc15' }}>{streak}</div>
              <div style={{ fontSize: '0.65rem', opacity: 0.6, marginTop: 2 }}>连续天数</div>
            </div>
          </div>

          {/* Week bar mini chart */}
          {weekly && (
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 4, height: 40, marginBottom: 8,
              padding: '0 4px',
            }}>
              {weekly.days.slice(-7).map((d, i) => {
                const maxW = Math.max(...weekly.days.slice(-7).map(dd => dd.work_minutes), 1)
                const h = Math.max((d.work_minutes / maxW) * 36, 2)
                const isToday = i === weekly.days.slice(-7).length - 1
                return (
                  <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <div style={{
                      width: '100%', height: h, borderRadius: 4,
                      background: isToday
                        ? 'linear-gradient(180deg, #e94560, #c81d4e)'
                        : 'rgba(233,69,96,0.3)',
                    }} />
                    <span style={{ fontSize: '0.55rem', opacity: 0.5 }}>
                      {['日', '一', '二', '三', '四', '五', '六'][new Date(d.date).getDay()]}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: 'center', fontSize: '0.6rem', opacity: 0.3, marginTop: 12 }}>
            polarclock.app · 专注每一刻
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'center' }}>
          <button
            onClick={handleExport}
            disabled={exporting}
            style={{
              padding: '10px 24px', background: '#e94560', color: '#fff',
              border: 'none', borderRadius: 12, cursor: 'pointer',
              fontWeight: 700, fontSize: '0.88rem', opacity: exporting ? 0.6 : 1,
            }}
          >{exporting ? '导出中…' : '保存图片'}</button>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px', background: 'rgba(255,255,255,0.15)', color: '#fff',
              border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: '0.85rem',
            }}
          >关闭</button>
        </div>
      </div>
    </div>
  )
}
