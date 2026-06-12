import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore, getToken } from '../stores/userStore'
import { useTimerStore } from '../stores/timerStore'
import { previewSoundById, stopMusic, invalidateSoundPrefsCache } from '../utils/sounds'

interface SoundOption {
  id: string
  name: string
  type: 'builtin' | 'custom'
  filename?: string
}

interface SoundPrefs {
  work_end_sound: string
  rest_end_sound: string
  meditation_end_sound: string
  volume: number
}

const getHeaders = (): Record<string, string> => {
  const h: Record<string, string> = {}
  const token = getToken()
  if (token) h['X-Token'] = token
  return h
}

export default function Settings() {
  const navigate = useNavigate()
  const user = useUserStore(s => s.user)
  const logout = useUserStore(s => s.logout)
  const { work_duration_minutes, short_break_minutes, long_break_minutes, leisure_break_minutes, fetchState, updateSettings } = useTimerStore()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    work_duration_minutes: 45,
    short_break_minutes: 10,
    leisure_break_minutes: 15,
    long_break_minutes: 15
  })
  const [saving, setSaving] = useState(false)

  // Backup state
  const [backups, setBackups] = useState<Array<{id: string; created_at: string; description: string; files: string[]}>>([])
  const [backupLoading, setBackupLoading] = useState(false)
  const [diffData, setDiffData] = useState<{backup_id: string; diffs: Array<{file: string; status: string; current_records: number; backup_records: number}>} | null>(null)

  const headers = { 'X-Token': getToken() || '', 'Content-Type': 'application/json' }

  const fetchBackups = async () => {
    try {
      const res = await fetch('/api/backup', { headers })
      if (res.ok) setBackups(await res.json())
    } catch {}
  }

  const createBackup = async () => {
    setBackupLoading(true)
    try {
      await fetch('/api/backup', { method: 'POST', headers })
      await fetchBackups()
    } finally { setBackupLoading(false) }
  }

  const showDiff = async (id: string) => {
    try {
      const res = await fetch('/api/backup/' + id + '/diff', { headers })
      if (res.ok) setDiffData(await res.json())
    } catch {}
  }

  const restoreBackup = async (id: string) => {
    if (!confirm('确认恢复此备份？当前数据将自动备份。')) return
    setBackupLoading(true)
    try {
      await fetch('/api/backup/' + id + '/restore', { method: 'POST', headers })
      await fetchBackups()
      setDiffData(null)
      alert('恢复成功！请刷新页面。')
    } finally { setBackupLoading(false) }
  }

  const [sounds, setSounds] = useState<SoundOption[]>([])
  const [soundPrefs, setSoundPrefs] = useState<SoundPrefs>({ work_end_sound: 'default', rest_end_sound: 'default', meditation_end_sound: 'default', volume: 100 })
  const [soundSaving, setSoundSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchState()
    fetchSounds()
    fetchSoundPrefs()
  }, [])

  const fetchSounds = async () => {
    try {
      const res = await fetch('/api/timer/sounds', { headers: getHeaders() })
      if (res.ok) setSounds(await res.json())
    } catch {}
  }

  const fetchSoundPrefs = async () => {
    try {
      const res = await fetch('/api/timer/sound-preferences', { headers: getHeaders() })
      if (res.ok) setSoundPrefs(await res.json())
    } catch {}
  }

  const saveSoundPrefs = async (updated: Partial<SoundPrefs>) => {
    setSoundSaving(true)
    const newPrefs = { ...soundPrefs, ...updated }
    setSoundPrefs(newPrefs)
    try {
      await fetch('/api/timer/sound-preferences', {
        method: 'PUT',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(newPrefs),
      })
      invalidateSoundPrefsCache()
    } finally {
      setSoundSaving(false)
    }
  }

  const previewSound = (soundId: string, scene: 'work' | 'rest' | 'meditation' = 'work') => {
    stopMusic()
    if (soundId === 'none') return
    void previewSoundById(soundId, scene, soundPrefs.volume)
  }

  const deleteCustomSound = async (filename: string) => {
    const token = getToken()
    try {
      const res = await fetch(`/api/timer/sounds/custom/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: token ? { 'X-Token': token } : {},
      })
      if (res.ok) {
        const data = await res.json()
        await fetchSounds()
        if (data.preferences_reset) {
          await fetchSoundPrefs()
          invalidateSoundPrefsCache()
        }
      }
    } catch {}
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1024 * 1024) {
      alert('文件大小不能超过 1MB')
      return
    }
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const token = getToken()
      const res = await fetch('/api/timer/sounds/upload', {
        method: 'POST',
        headers: token ? { 'X-Token': token } : {},
        body: formData,
      })
      if (res.ok) {
        await fetchSounds()
        invalidateSoundPrefsCache()
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  useEffect(() => {
    setForm({
      work_duration_minutes,
      short_break_minutes,
      leisure_break_minutes,
      long_break_minutes
    })
  }, [work_duration_minutes, short_break_minutes, leisure_break_minutes, long_break_minutes])

  const handleLogout = () => {
    logout()
    navigate('/clock/login')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateSettings(form)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setForm({
      work_duration_minutes,
      short_break_minutes,
      leisure_break_minutes,
      long_break_minutes
    })
    setEditing(false)
  }

  return (
    <div className="page" style={{ minHeight: '100vh' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '2rem' }}>设置</h1>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-text-muted)' }}>👤 用户信息</h2>
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', background: 'var(--color-accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.5rem', color: '#fff', fontWeight: 700, flexShrink: 0,
            }}>
              {user?.username?.charAt(0).toUpperCase() || '?'}
            </div>
            <div>
              <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>{user?.username}</div>
              <div style={{ color: 'var(--color-text-faint)', fontSize: '0.8125rem' }}>用户ID: {user?.id?.slice(0, 8)}...</div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>⏱️ 番茄钟设置</h2>
          {!editing && (
            <button onClick={() => setEditing(true)} className="btn btn-primary" style={{ fontSize: '0.8125rem' }}>
              编辑
            </button>
          )}
        </div>
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {([
            { label: '工作时长', key: 'work_duration_minutes' as const, value: work_duration_minutes, min: 1, max: 120 },
            { label: '短休息时长', key: 'short_break_minutes' as const, value: short_break_minutes, min: 1, max: 30 },
            { label: '长休息时长（4个番茄后）', key: 'long_break_minutes' as const, value: long_break_minutes, min: 1, max: 60 },
            { label: '休闲时间（每2个番茄后）', key: 'leisure_break_minutes' as const, value: leisure_break_minutes, min: 1, max: 30 },
          ]).map(({ label, key, value, min, max }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{label}</span>
              {editing ? (
                <input
                  type="number" className="input"
                  style={{ width: 96, textAlign: 'right' }}
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))}
                  min={min} max={max}
                />
              ) : (
                <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{value} 分钟</span>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>健康提醒：每2个番茄后休息</span>
            <span style={{ color: 'var(--color-positive)' }}>✓ 已开启</span>
          </div>

          {editing && (
            <div style={{ display: 'flex', gap: 8, paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{ opacity: saving ? 0.5 : 1 }}>
                {saving ? '保存中...' : '保存'}
              </button>
              <button onClick={handleCancel} className="btn btn-ghost">
                取消
              </button>
            </div>
          )}
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-text-muted)' }}>🏃 运动提醒</h2>
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>连续工作番茄后提醒运动</span>
            <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>4 个</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>运动后洗澡提醒</span>
            <span style={{ color: 'var(--color-positive)' }}>✓ 已开启</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>洗澡提醒延迟</span>
            <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>30 分钟</span>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--color-text-muted)' }}>🔔 通知声音</h2>
        <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {([
            { key: 'work_end_sound' as const, label: '工作结束', scene: 'work' as const },
            { key: 'rest_end_sound' as const, label: '休息结束', scene: 'rest' as const },
            { key: 'meditation_end_sound' as const, label: '冥想结束', scene: 'meditation' as const },
          ]).map(({ key, label, scene }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ flexShrink: 0 }}>{label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select
                  value={soundPrefs[key]}
                  onChange={e => saveSoundPrefs({ [key]: e.target.value })}
                  className="input"
                  style={{ width: 'auto', minWidth: 120, fontSize: '0.8125rem' }}
                  disabled={soundSaving}
                >
                  {sounds.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => previewSound(soundPrefs[key], scene)}
                  className="btn btn-ghost"
                  style={{ padding: '0.375rem 0.625rem', fontSize: '0.8125rem' }}
                  title="预览"
                >
                  ▶
                </button>
              </div>
            </div>
          ))}

          {/* Volume slider */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
            <span>音量</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="range" min="0" max="100"
                value={soundPrefs.volume}
                onChange={e => saveSoundPrefs({ volume: Number(e.target.value) })}
                style={{ width: 128 }}
              />
              <span style={{ fontSize: '0.8125rem', color: 'var(--color-accent)', fontWeight: 600, width: 40, textAlign: 'right' }}>{soundPrefs.volume}%</span>
            </div>
          </div>

          {/* Custom sounds list with delete */}
          {sounds.filter(s => s.type === 'custom').length > 0 && (
            <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: 8, fontWeight: 600 }}>自定义铃声</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sounds.filter(s => s.type === 'custom').map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--color-overlay)', borderRadius: 8 }}>
                    <span style={{ flex: 1, fontSize: '0.8125rem' }}>{s.name}</span>
                    <button
                      onClick={() => previewSound(s.id)}
                      className="btn btn-ghost"
                      style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                      title="试听"
                    >▶</button>
                    <button
                      onClick={() => { if (confirm(`确定删除铃声"${s.name}"？`)) deleteCustomSound(s.filename!) }}
                      className="btn btn-ghost"
                      style={{ padding: '2px 8px', fontSize: '0.75rem', color: 'var(--color-danger, #EF4444)' }}
                      title="删除"
                    >✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload custom sound */}
          <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-faint)' }}>上传自定义铃声 (mp3/wav/ogg, ≤1MB)</span>
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-faint)', marginTop: 2, opacity: 0.7 }}>
                  限制 1MB 以保证快速加载，同名文件会被覆盖
                </div>
              </div>
              <label className="btn btn-primary" style={{ cursor: 'pointer', fontSize: '0.8125rem', opacity: uploading ? 0.6 : 1 }}>
                {uploading ? '上传中...' : '上传'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/ogg"
                  onChange={handleUpload}
                  style={{ display: 'none' }}
                  disabled={uploading}
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <button
          onClick={handleLogout}
          className="btn btn-danger"
          style={{ width: '100%', padding: '0.875rem', fontSize: '1rem', borderRadius: 12, background: 'var(--color-danger-tint)' }}
        >
          退出登录
        </button>
      </section>

      {/* Backup & Recovery */}
      <section className="card" style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>💾 数据备份与恢复</h2>
          <button
            onClick={createBackup}
            disabled={backupLoading}
            style={{
              padding: '6px 14px', background: 'var(--color-accent, #3B82F6)', color: '#fff',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600,
              opacity: backupLoading ? 0.6 : 1,
            }}
          >{backupLoading ? '处理中…' : '创建备份'}</button>
        </div>
        {backups.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-faint)' }}>暂无备份</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {backups.slice(0, 5).map(b => (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                background: 'var(--color-overlay)', borderRadius: 10,
                border: diffData?.backup_id === b.id ? '1px solid var(--color-accent, #3B82F6)' : '1px solid var(--color-border)',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{b.description || b.id}</div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-text-faint)', marginTop: 2 }}>
                    {new Date(b.created_at).toLocaleString('zh-CN')} · {b.files.length} 文件
                  </div>
                </div>
                <button onClick={() => showDiff(b.id)} style={{
                  padding: '4px 10px', background: 'none', border: '1px solid var(--color-border)',
                  borderRadius: 6, cursor: 'pointer', fontSize: '0.72rem', color: 'var(--color-text-muted)',
                }}>对比</button>
                <button onClick={() => restoreBackup(b.id)} style={{
                  padding: '4px 10px', background: 'var(--color-warning-tint, #FEF3C7)',
                  border: '1px solid var(--color-warning, #F59E0B)', borderRadius: 6,
                  cursor: 'pointer', fontSize: '0.72rem', color: 'var(--color-warning, #F59E0B)', fontWeight: 600,
                }}>恢复</button>
              </div>
            ))}
          </div>
        )}
        {diffData && (
          <div style={{ marginTop: 12, padding: '12px', background: 'var(--color-overlay)', borderRadius: 10 }}>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 8 }}>差异对比</h3>
            {diffData.diffs.map(d => (
              <div key={d.file} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: '0.75rem' }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: d.status === 'unchanged' ? '#10B981' : d.status === 'modified' ? '#F59E0B' : d.status === 'new' ? '#3B82F6' : '#EF4444',
                }} />
                <span style={{ flex: 1, fontFamily: 'monospace' }}>{d.file}</span>
                <span style={{ color: 'var(--color-text-faint)' }}>
                  {d.status === 'unchanged' ? '相同' : d.status === 'modified' ? `${d.backup_records}→${d.current_records}` : d.status}
                </span>
              </div>
            ))}
            <button onClick={() => setDiffData(null)} style={{
              marginTop: 8, padding: '4px 12px', background: 'none', border: '1px solid var(--color-border)',
              borderRadius: 6, cursor: 'pointer', fontSize: '0.7rem', color: 'var(--color-text-muted)',
            }}>关闭对比</button>
          </div>
        )}
      </section>
    </div>
  )
}
