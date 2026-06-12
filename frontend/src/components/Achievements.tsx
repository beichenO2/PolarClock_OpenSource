import { useState, useEffect, useCallback } from 'react'
import { getToken } from '../stores/userStore'

interface Achievement {
  id: string; name: string; desc: string; icon: string
  category: string; target: number; current: number
  unlocked: boolean; unlocked_at: string | null
}

const CATEGORY_LABELS: Record<string, string> = {
  pomodoro: '🍅 番茄', focus: '⏱️ 专注', streak: '🔗 连续',
  task: '📋 任务', health: '💪 健康', special: '⭐ 特殊',
}

function CelebrationOverlay({ achievement, onClose }: { achievement: Achievement; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      animation: 'fadeIn 0.3s ease',
    }}>
      <div style={{
        textAlign: 'center', padding: '40px 50px', borderRadius: 24,
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
        border: '2px solid rgba(167,139,250,0.4)',
        boxShadow: '0 0 60px rgba(139,92,246,0.3), 0 0 120px rgba(139,92,246,0.1)',
        animation: 'celebPop 0.5s cubic-bezier(0.175,0.885,0.32,1.275)',
      }}>
        <div style={{ fontSize: '4rem', marginBottom: 12, animation: 'celebSpin 0.8s ease' }}>
          {achievement.icon}
        </div>
        <div style={{ fontSize: '0.7rem', color: '#A78BFA', fontWeight: 600, letterSpacing: '0.2em', marginBottom: 8 }}>
          🎉 成就解锁
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#F5F3FF', marginBottom: 6 }}>
          {achievement.name}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#C4B5FD' }}>
          {achievement.desc}
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes celebPop { from { transform: scale(0.3); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes celebSpin { 0% { transform: scale(0) rotate(-180deg) } 100% { transform: scale(1) rotate(0deg) } }
      `}</style>
    </div>
  )
}

export default function Achievements() {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [celebrating, setCelebrating] = useState<Achievement | null>(null)
  const [filter, setFilter] = useState<string | null>(null)

  const fetchAchievements = useCallback(async () => {
    try {
      const res = await fetch('/api/achievements', { headers: { 'X-Token': getToken() || '' } })
      if (res.ok) setAchievements(await res.json())
    } catch {}
  }, [])

  const checkNew = useCallback(async () => {
    try {
      const res = await fetch('/api/achievements/check', {
        method: 'POST', headers: { 'X-Token': getToken() || '' },
      })
      if (res.ok) {
        const data = await res.json()
        if (data.newly_unlocked?.length > 0) {
          await fetchAchievements()
          const first = achievements.find(a => a.id === data.newly_unlocked[0])
          if (first) setCelebrating(first)
        }
      }
    } catch {}
  }, [achievements, fetchAchievements])

  useEffect(() => { fetchAchievements() }, [fetchAchievements])

  const categories = [...new Set(achievements.map(a => a.category))]
  const filtered = filter ? achievements.filter(a => a.category === filter) : achievements
  const unlocked = achievements.filter(a => a.unlocked).length

  return (
    <div>
      {celebrating && <CelebrationOverlay achievement={celebrating} onClose={() => setCelebrating(null)} />}

      <div className="card" style={{ padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>🏆 成就</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {unlocked}/{achievements.length} 已解锁
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          <button
            onClick={() => setFilter(null)}
            style={{
              padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: '0.68rem', fontWeight: !filter ? 600 : 400,
              background: !filter ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)',
              color: !filter ? '#60A5FA' : 'var(--color-text-muted)',
            }}
          >全部</button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              style={{
                padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: '0.68rem', fontWeight: filter === cat ? 600 : 400,
                background: filter === cat ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)',
                color: filter === cat ? '#60A5FA' : 'var(--color-text-muted)',
              }}
            >{CATEGORY_LABELS[cat] || cat}</button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {filtered.map(a => (
            <div key={a.id} style={{
              padding: '12px 10px', borderRadius: 12, textAlign: 'center',
              background: a.unlocked ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.02)',
              border: a.unlocked ? '1px solid rgba(139,92,246,0.25)' : '1px solid var(--color-border)',
              opacity: a.unlocked ? 1 : 0.5,
              transition: 'all 0.2s',
            }}>
              <div style={{ fontSize: '1.8rem', marginBottom: 4, filter: a.unlocked ? 'none' : 'grayscale(1)' }}>
                {a.icon}
              </div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: a.unlocked ? 'var(--color-text)' : 'var(--color-text-faint)', marginBottom: 2 }}>
                {a.name}
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--color-text-faint)', marginBottom: 4 }}>
                {a.desc}
              </div>
              {!a.unlocked && a.target > 1 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{
                    height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${Math.min(100, (a.current / a.target) * 100)}%`,
                      background: 'var(--color-accent, #3B82F6)',
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <div style={{ fontSize: '0.55rem', color: 'var(--color-text-faint)', marginTop: 2 }}>
                    {a.current}/{a.target}
                  </div>
                </div>
              )}
              {a.unlocked && (
                <div style={{ fontSize: '0.55rem', color: '#A78BFA', marginTop: 2 }}>✓ 已解锁</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
