import { useState, useCallback, useEffect } from 'react'
import {
  type AmbientPreset,
  AMBIENT_PRESETS,
  playAmbient,
  stopAmbient,
  setAmbientVolume,
  getAmbientVolume,
  getActivePreset,
} from '../utils/ambientSound'

export default function AmbientSoundControl() {
  const [current, setCurrent] = useState<AmbientPreset | null>(getActivePreset)
  const [volume, setVolume] = useState(getAmbientVolume)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setAmbientVolume(volume)
  }, [volume])

  const toggle = useCallback((p: AmbientPreset) => {
    if (current === p) {
      stopAmbient()
      setCurrent(null)
    } else {
      playAmbient(p)
      setCurrent(p)
    }
  }, [current])

  const presets = Object.entries(AMBIENT_PRESETS) as [AmbientPreset, { label: string; emoji: string }][]

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        title="环境音"
        style={{
          background: current ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)',
          border: current ? '1px solid rgba(59,130,246,0.4)' : '1px solid var(--color-border, rgba(255,255,255,0.1))',
          borderRadius: 10, padding: '6px 10px', cursor: 'pointer',
          fontSize: '0.78rem', color: current ? '#60A5FA' : 'var(--color-text-muted)',
          display: 'flex', alignItems: 'center', gap: 4,
          transition: 'all 0.2s',
        }}
      >
        {current ? AMBIENT_PRESETS[current].emoji : '🎵'}{' '}
        {current ? AMBIENT_PRESETS[current].label : '环境音'}
      </button>
    )
  }

  return (
    <div style={{
      background: 'var(--color-card, rgba(30,30,30,0.85))',
      border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
      borderRadius: 14, padding: '12px 14px',
      backdropFilter: 'blur(12px)',
      minWidth: 200,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text)' }}>🎵 环境音</span>
        <button
          onClick={() => setExpanded(false)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.7rem', color: 'var(--color-text-muted)', padding: '2px 6px',
          }}
        >✕</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {presets.map(([key, { label, emoji }]) => (
          <button
            key={key}
            onClick={() => toggle(key)}
            style={{
              padding: '5px 10px', borderRadius: 8, cursor: 'pointer',
              fontSize: '0.72rem', border: 'none',
              background: current === key ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
              color: current === key ? '#60A5FA' : 'var(--color-text-muted)',
              fontWeight: current === key ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            {emoji} {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-faint)', minWidth: 14 }}>🔈</span>
        <input
          type="range" min={0} max={1} step={0.05}
          value={volume}
          onChange={e => setVolume(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: '#3B82F6', height: 3 }}
        />
        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-faint)', minWidth: 24, textAlign: 'right' }}>
          {Math.round(volume * 100)}%
        </span>
      </div>

      {current && (
        <button
          onClick={() => { stopAmbient(); setCurrent(null) }}
          style={{
            marginTop: 8, width: '100%', padding: '5px 0',
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, cursor: 'pointer',
            fontSize: '0.7rem', color: '#F87171',
          }}
        >停止</button>
      )}
    </div>
  )
}
