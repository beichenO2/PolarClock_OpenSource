import { useEffect, useState } from 'react'
import { useScheduleStore } from '../stores/scheduleStore'
import { useMealStore } from '../stores/mealStore'
import { useStatsStore } from '../stores/statsStore'
import WeekSchedule, { SessionBlock } from '../components/WeekSchedule'

function getMonday(d: Date): Date {
  const copy = new Date(d)
  const day  = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

export default function Schedule() {
  const { rules, fetchRules } = useScheduleStore()
  const { settings, fetchSettings, updateSettings } = useMealStore()
  const { today, fetchToday } = useStatsStore()

  // Week navigation — Monday of displayed week
  const [weekMonday, setWeekMonday] = useState<Date>(() => getMonday(new Date()))

  useEffect(() => { fetchRules(); fetchSettings(); fetchToday() }, [])

  const prevWeek = () => {
    setWeekMonday(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() - 7)
      return d
    })
  }

  const nextWeek = () => {
    setWeekMonday(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + 7)
      return d
    })
  }

  const goToday = () => setWeekMonday(getMonday(new Date()))

  const weekEnd = new Date(weekMonday)
  weekEnd.setDate(weekMonday.getDate() + 6)

  const isCurrentWeek = getMonday(new Date()).toDateString() === weekMonday.toDateString()

  return (
    <div className="page" style={{ paddingBottom: 80 }}>
      <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 20 }}>📅 日程管理</h1>

      {/* Meal settings */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 18px' }}>
        <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 14 }}>🍽️ 吃饭时间</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {[
            { label: '早餐', key: 'breakfast_start', value: settings.breakfast_start },
            { label: '午餐', key: 'lunch_start',     value: settings.lunch_start     },
            { label: '晚餐', key: 'dinner_start',    value: settings.dinner_start    },
          ].map(({ label, key, value }) => (
            <div key={key}>
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)', marginBottom: 5 }}>{label}</div>
              <input
                type="time"
                value={value}
                onChange={e => updateSettings({ [key]: e.target.value })}
                style={{ width: '100%', padding: '7px 10px', border: '1.5px solid var(--color-border)', borderRadius: 8, fontSize: '0.85rem', background: 'var(--color-card)', color: 'var(--color-text)' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Block schedule */}
      <div className="card" style={{ padding: '16px 18px', marginBottom: 20 }}>
        {/* Week navigation header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>📚 课程 / Block</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={prevWeek}
              style={{ padding: '5px 12px', background: 'var(--color-overlay)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}
            >←</button>
            <div style={{ textAlign: 'center', minWidth: 140 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)' }}>
                {weekMonday.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                {' — '}
                {weekEnd.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
              </div>
              {isCurrentWeek && (
                <div style={{ fontSize: '0.65rem', color: 'var(--color-accent)', fontWeight: 500 }}>本周</div>
              )}
            </div>
            <button
              onClick={nextWeek}
              style={{ padding: '5px 12px', background: 'var(--color-overlay)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}
            >→</button>
            {!isCurrentWeek && (
              <button
                onClick={goToday}
                style={{ padding: '5px 10px', background: 'var(--color-accent-tint)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.72rem', color: 'var(--color-accent)', fontWeight: 600 }}
              >回今周</button>
            )}
          </div>
        </div>

        <WeekSchedule
          weekMonday={weekMonday}
          sessions={(today?.records ?? [])
            .filter(r => r.type === 'pomodoro' || r.type === 'exercise' || r.type === 'meditation')
            .filter(r => !!r.started_at)
            .map(r => ({
              id: r.id,
              type: r.type as 'pomodoro' | 'exercise' | 'meditation',
              started_at: r.started_at!,
              completed_at: r.completed_at,
              duration_minutes: r.duration_minutes,
              exercise_type: r.exercise_type,
              task_id: r.task_id,
            } satisfies SessionBlock))
          }
        />
      </div>

      {/* Rule list */}
      <div className="card" style={{ padding: '16px 18px' }}>
        <h2 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 12 }}>所有周期规则 ({rules.length})</h2>
        {rules.length === 0 ? (
          <p style={{ color: 'var(--color-text-faint)', textAlign: 'center', padding: '16px 0', fontSize: '0.82rem' }}>
            暂无规则 · 在上方周视图拖动创建
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rules.map(r => {
              const dayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px',
                  borderRadius: 10, background: 'var(--color-record-bg)', border: '1px solid var(--color-record-border)',
                }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6366F1', width: 28, flexShrink: 0 }}>
                    {dayNames[r.day_of_week]}
                  </span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{r.name}</span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)', marginLeft: 8 }}>
                      {r.start_hhmm} – {r.end_hhmm}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.68rem', color: 'var(--color-text-faint)' }}>
                    从 {r.effective_from}
                    {r.effective_until ? ` 至 ${r.effective_until}` : ' 起永久'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
