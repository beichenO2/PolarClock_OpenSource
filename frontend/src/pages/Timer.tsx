import { useEffect, useRef, useState, useMemo, useCallback, lazy, Suspense } from 'react'
import { useTimerStore } from '../stores/timerStore'
import { useTaskStore } from '../stores/taskStore'
import { getToken } from '../stores/userStore'
import { formatTimeDisplay, formatTimeString } from '../hooks/useFormatTime'
import { FlipClock } from '../components/FlipClock'
import {
  playTransitionChime,
  stopMusic,
  playWorkEndMusic,
  playMeditationEndMusic,
  playRestEndMusic,
  retryLastEndMusic,
  isMusicPlaying,
  unlockAudioForSession,
} from '../utils/sounds'
import AmbientSoundControl from '../components/AmbientSoundControl'
const ChessPuzzle = lazy(() => import('../components/ChessPuzzle'))
import { stopAmbient, getSavedPreset, playAmbient, setAmbientVolume, getAmbientVolume } from '../utils/ambientSound'

export default function Timer() {
  const {
    status, remaining_seconds, elapsed_overtime_seconds,
    current_session, mode, current_task_id,
    break_type, exercise_phase,
    exercise_reminder_due, bath_reminder_due,
    fetchState, start, pause, resume, stop, completeSession,
    startBreak, startExercise, skipExercise, skipBath,
    switchTask, connectWS, disconnectWS,
  } = useTimerStore()
  const { tasks, fetchTasks } = useTaskStore()
  const [showTaskPicker, setShowTaskPicker] = useState(false)
  const [showMusicDismiss, setShowMusicDismiss] = useState(false)
  const [showTapRingHint, setShowTapRingHint] = useState(false)
  const [todayStats, setTodayStats] = useState<{ pomodoros: number; work_minutes: number } | null>(null)
  const handledZeroRef = useRef(false)

  const fetchTodayStats = async () => {
    try {
      const token = getToken()
      if (!token) return
      const res = await fetch('/api/stats/today', { headers: { 'X-Token': token } })
      if (res.ok) {
        const d = await res.json()
        setTodayStats({ pomodoros: d.pomodoros ?? 0, work_minutes: d.work_minutes ?? 0 })
      }
    } catch {}
  }

  useEffect(() => {
    connectWS(); fetchState(); fetchTasks(); fetchTodayStats()
    const saved = getSavedPreset()
    if (saved) { playAmbient(saved); setAmbientVolume(getAmbientVolume()) }
    return () => { disconnectWS(); stopAmbient() }
  }, [])

  useEffect(() => { fetchTodayStats() }, [current_session])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (e.key === ' ') {
        e.preventDefault()
        if (status === 'idle') { unlockAudioForSession(); start('pomodoro', current_task_id ?? undefined) }
        else if (status === 'running') pause()
        else if (status === 'paused') resume()
      } else if (e.key === 'Escape') {
        if (status === 'running' || status === 'paused') { stopMusic(); stop() }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [status, current_task_id, start, pause, resume, stop])

  const isMeditationMode = mode === 'meditation'
  const isExerciseWorkflow = mode === 'exercise' && exercise_phase !== 'none'
  const isShowerPhase = exercise_phase === 'shower'

  useEffect(() => {
    const time = formatTimeString(remaining_seconds)
    let icon = '🍅'
    if (status === 'paused') icon = '⏸'
    else if (isMeditationMode) icon = '🧘'
    else if (break_type !== 'none') icon = '☕'
    else if (exercise_phase === 'exercise') icon = '🏃'
    else if (exercise_phase === 'rest') icon = '😌'
    else if (exercise_phase === 'shower') icon = '🚿'
    else if (mode === 'exercise') icon = '🏃'
    document.title = (status === 'running' || status === 'paused') ? `${icon} ${time}` : 'PolarClock'
    return () => { document.title = 'PolarClock' }
  }, [status, remaining_seconds, mode, break_type, exercise_phase, isMeditationMode])

  useEffect(() => {
    if (status === 'running' && remaining_seconds > 0) {
      handledZeroRef.current = false
    }
  }, [status, remaining_seconds])

  useEffect(() => {
    if (remaining_seconds !== 0 || status !== 'running' || handledZeroRef.current) return
    handledZeroRef.current = true

    if (isMeditationMode) {
      setShowMusicDismiss(true)
      setShowTapRingHint(false)
      void playMeditationEndMusic().then((ok) => {
        if (!ok) setShowTapRingHint(true)
      })
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('PolarClock', { body: '冥想结束！🧘 回到当下' })
      }
      return
    }

    if (isExerciseWorkflow) {
      if (exercise_phase === 'exercise') {
        return
      }
      if (exercise_phase === 'rest') {
        playTransitionChime('shower-start')
        completeSession()
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('PolarClock', { body: '运动+休息完成！洗澡时间 🚿 (不计入番茄)' })
        }
        return
      }
      if (exercise_phase === 'shower') {
        playTransitionChime('shower-end')
        completeSession()
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('PolarClock', { body: '洗澡结束！运动番茄已记录 (60分钟) 🎉' })
        }
        return
      }
    }

    if (break_type === 'none' && mode === 'pomodoro') {
      setShowMusicDismiss(true)
      setShowTapRingHint(false)
      void playWorkEndMusic().then((ok) => {
        if (!ok) setShowTapRingHint(true)
      })
      completeSession().then(() => {
        const st = useTimerStore.getState()
        if (st.break_type !== 'none') {
          startBreak(st.break_type === 'leisure' ? 'leisure' : 'short')
        }
      })
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('PolarClock', { body: '番茄钟完成！休息时间开始 ☕' })
      }
    } else if (break_type !== 'none') {
      setShowMusicDismiss(true)
      setShowTapRingHint(false)
      void playRestEndMusic().then((ok) => {
        if (!ok) setShowTapRingHint(true)
      })
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('PolarClock', { body: '休息结束！准备开始下一个番茄 🍅' })
      }
    } else {
      setShowMusicDismiss(true)
      setShowTapRingHint(false)
      void playWorkEndMusic().then((ok) => {
        if (!ok) setShowTapRingHint(true)
      })
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('PolarClock', { body: '计时结束' })
      }
    }
  }, [remaining_seconds, status, break_type, mode, exercise_phase, isMeditationMode, completeSession, startBreak, stop])

  useEffect(() => {
    if (!showMusicDismiss) {
      setShowTapRingHint(false)
      return
    }
    const t = window.setTimeout(() => {
      if (!isMusicPlaying()) setShowTapRingHint(true)
    }, 600)
    return () => window.clearTimeout(t)
  }, [showMusicDismiss])

  const handleDismissMusic = () => {
    stopMusic()
    setShowMusicDismiss(false)
    setShowTapRingHint(false)
    if (isMeditationMode) {
      completeSession()
    } else if (break_type !== 'none' && remaining_seconds === 0) {
      stop()
    }
  }

  const activeTasks = tasks.filter(t => t.status !== 'completed' && !t.parent_id && !t.archived)
  const currentTask = tasks.find(t => t.id === current_task_id)
  const time = formatTimeDisplay(remaining_seconds)
  const overtime = elapsed_overtime_seconds > 0
  const isRunning = status === 'running'
  const isPaused  = status === 'paused'
  const isIdle    = status === 'idle'
  const isRestMode = break_type !== 'none'

  const [winW, setWinW] = useState(() => window.innerWidth)
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const hasHours = Math.floor(remaining_seconds / 3600) > 0
  const cardW = Math.max(48, Math.min(Math.floor(winW * (hasHours ? 0.12 : winW < 400 ? 0.16 : 0.178)), 200))
  const cardH = Math.round(cardW * 1.32)

  const handleStartWithTask = async (taskId?: string) => {
    unlockAudioForSession()
    await start('pomodoro', taskId)
    setShowTaskPicker(false)
  }

  const handleAction = () => {
    if (isIdle) {
      unlockAudioForSession()
      if (isRestMode) {
        startBreak(break_type === 'leisure' ? 'leisure' : 'short')
        return
      }
      if (activeTasks.length > 0 && !current_task_id) { setShowTaskPicker(true); return }
      start('pomodoro', current_task_id ?? undefined)
    } else if (isRunning) pause()
    else if (isPaused) resume()
  }

  const handleExerciseComplete = () => {
    playTransitionChime('exercise-phase')
    completeSession()
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('PolarClock', { body: '运动完成！放松休息开始 😌' })
    }
  }

  const handleStartMeditation = () => {
    unlockAudioForSession()
    start('meditation')
  }

  const getBackground = () => {
    if (isMeditationMode) return 'linear-gradient(160deg, #EDE9FE 0%, #DDD6FE 50%, #C4B5FD 100%)'
    if (isRestMode) return 'linear-gradient(160deg, #E0F2F1 0%, #E8F5E9 100%)'
    if (isShowerPhase) return 'linear-gradient(160deg, #E0E7FF 0%, #DBEAFE 100%)'
    if (exercise_phase === 'rest') return 'linear-gradient(160deg, #FEF3C7 0%, #FDE68A 100%)'
    if (exercise_phase === 'exercise') return 'linear-gradient(160deg, #FFF7ED 0%, #FFEDD5 100%)'
    return '#0E0D11'
  }

  const isLightBg = isRestMode || isExerciseWorkflow || isMeditationMode

  const exercisePhaseSteps = [
    { key: 'exercise', label: '运动', icon: '🏃', duration: '30min', active: exercise_phase === 'exercise', done: exercise_phase === 'rest' || exercise_phase === 'shower' },
    { key: 'rest', label: '休息', icon: '😌', duration: '30min', active: exercise_phase === 'rest', done: exercise_phase === 'shower' },
    { key: 'shower', label: '洗澡', icon: '🚿', duration: '20min', active: exercise_phase === 'shower', done: false, notPomodoro: true },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: getBackground(),
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      userSelect: 'none',
      transition: 'background 0.6s ease',
    }}>

      {/* ── Music Dismiss Overlay ── */}
      {showMusicDismiss && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: isMeditationMode
              ? 'radial-gradient(ellipse at center, rgba(124,58,237,0.15) 0%, rgba(124,58,237,0.05) 100%)'
              : 'radial-gradient(ellipse at center, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.02) 100%)',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div style={{
            fontSize: '3rem', marginBottom: 16,
            animation: 'pulse-dot 1.5s ease-in-out infinite',
          }}>
            {isMeditationMode ? '🧘' : break_type !== 'none' ? '🍅' : '☕'}
          </div>
          <div style={{
            fontSize: '1.2rem', fontWeight: 600, marginBottom: 8,
            color: isMeditationMode ? '#6D28D9' : '#1A1917',
          }}>
            {isMeditationMode ? '冥想结束' : break_type !== 'none' ? '休息结束' : '番茄完成！'}
          </div>
          <div style={{
            fontSize: '0.9rem', color: isMeditationMode ? '#7C3AED' : '#6B6860',
            marginBottom: 12,
            textAlign: 'center',
            maxWidth: 320,
            lineHeight: 1.45,
          }}>
            {isMeditationMode
              ? '轻轻睁开眼睛，回到当下'
              : (showTapRingHint ? '浏览器可能阻止自动播放铃声，请点击下方「播放铃声」。' : '铃声播放中… 若未听到请看下方按钮。')}
          </div>
          {showTapRingHint && (
            <button
              type="button"
              onClick={() => {
                void retryLastEndMusic().then((ok) => {
                  if (ok) setShowTapRingHint(false)
                })
              }}
              style={{
                padding: '12px 28px',
                fontSize: '1rem',
                fontWeight: 600,
                border: '2px solid #F59E0B',
                borderRadius: 14,
                cursor: 'pointer',
                background: '#FFFBEB',
                color: '#B45309',
                marginBottom: 16,
              }}
            >
              🔊 播放铃声
            </button>
          )}
          <button
            type="button"
            onClick={() => { handleDismissMusic() }}
            style={{
              padding: '14px 48px',
              fontSize: '1.1rem',
              fontWeight: 700,
              border: 'none',
              borderRadius: 16,
              cursor: 'pointer',
              background: isMeditationMode ? '#7C3AED' : '#3B82F6',
              color: '#fff',
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              transition: 'transform 0.1s',
            }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.95)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {isMeditationMode ? '结束冥想' : '知道了'}
          </button>
        </div>
      )}

      {/* ── Task Picker Modal ── */}
      {showTaskPicker && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.15)', backdropFilter: 'blur(6px)' }}
          onClick={() => setShowTaskPicker(false)}
        >
          <div onClick={e => e.stopPropagation()}
            className="card" style={{ width: '100%', maxWidth: 360, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8E5DF' }}>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>选择任务</div>
              <div style={{ fontSize: '0.75rem', color: '#9B9890', marginTop: 2 }}>选择要在这个番茄中记录的任务</div>
            </div>
            <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              <div className="task-row" style={{ cursor: 'pointer', color: '#9B9890' }}
                onClick={() => handleStartWithTask()}>
                <span style={{ fontSize: '0.8125rem' }}>⏱</span>
                <span style={{ fontSize: '0.875rem' }}>不选任务直接开始</span>
              </div>
              {activeTasks.map(t => (
                <div key={t.id} className={`task-row ${t.id === current_task_id ? 'active' : ''}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => isIdle ? handleStartWithTask(t.id) : switchTask(t.id).then(() => setShowTaskPicker(false))}>
                  <span className={`status-dot ${t.status === 'in_progress' ? 'in-progress' : 'pending'}`} />
                  <span style={{ flex: 1, fontSize: '0.875rem' }} className="truncate">{t.name}</span>
                  {t.pomodor_total > 0 && <span style={{ fontSize: '0.75rem', color: '#9B9890' }}>🍅{t.pomodor_completed}/{t.pomodor_total}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Exercise Reminder ── */}
      {exercise_reminder_due && !showTaskPicker && !isExerciseWorkflow && (
        <div style={{ position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#FFFBEB', border: '1px solid #D97706', borderRadius: 10, padding: '12px 20px',
          textAlign: 'center', zIndex: 50, minWidth: 260 }}>
          <div style={{ color: '#D97706', marginBottom: 10, fontWeight: 500 }}>🏃 运动时间！</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost text-xs" onClick={() => startExercise('boxing')}>拳击 (30+30+20)</button>
            <button className="btn btn-ghost text-xs" onClick={skipExercise}>跳过</button>
          </div>
        </div>
      )}

      {bath_reminder_due && !showTaskPicker && !isExerciseWorkflow && (
        <div style={{ position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#EFF4FF', border: '1px solid #2563EB', borderRadius: 10, padding: '12px 20px',
          textAlign: 'center', zIndex: 50 }}>
          <div style={{ color: '#2563EB', marginBottom: 10 }}>🚿 记得洗澡</div>
          <button className="btn btn-primary text-xs" onClick={skipBath}>知道了</button>
        </div>
      )}

      {/* ── Exercise Phase Progress ── */}
      {isExerciseWorkflow && (isRunning || isPaused) && (
        <div style={{
          position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: winW < 400 ? 4 : 6,
          maxWidth: '90vw',
        }}>
          {exercisePhaseSteps.map((step, i) => (
            <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                opacity: step.active ? 1 : step.done ? 0.5 : 0.35,
                transition: 'opacity 0.3s',
              }}>
                <span style={{ fontSize: '1.1rem' }}>{step.icon}</span>
                <span style={{
                  fontSize: '0.6rem', fontWeight: step.active ? 700 : 400,
                  color: step.active ? '#1A1917' : '#9B9890',
                }}>
                  {step.label} {step.duration}
                </span>
                {step.notPomodoro && (
                  <span style={{ fontSize: '0.48rem', color: '#9B9890' }}>不计番茄</span>
                )}
              </div>
              {i < exercisePhaseSteps.length - 1 && (
                <span style={{ color: step.done ? '#22C55E' : '#D1D5DB', fontSize: '0.7rem', marginBottom: 10 }}>→</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Top info strip (non-exercise, non-meditation) ── */}
      {!isExerciseWorkflow && !isMeditationMode && (
        <div style={{
          position: 'absolute', top: 20, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 12, paddingLeft: 20, paddingRight: 20, flexWrap: 'wrap',
        }}>
          {mode === 'pomodoro' && break_type === 'none' && (
            <span style={{ fontSize: '0.75rem', color: '#C8C4BC', letterSpacing: '0.08em' }}>
              {Array.from({ length: 4 }, (_, i) => (
                <span key={i} style={{ marginRight: 4, color: i < current_session ? '#2563EB' : '#E8E5DF' }}>●</span>
              ))}
            </span>
          )}
          {isRestMode && (
            <span style={{ fontSize: '0.875rem', color: '#2E7D32', fontWeight: 500 }}>
              {break_type === 'short' ? '☕ 休息时间' : break_type === 'leisure' ? '🎬 休闲时间' : '😴 长休息'}
            </span>
          )}
        </div>
      )}

      {/* ── Meditation top info ── */}
      {isMeditationMode && (isRunning || isPaused) && (
        <div style={{
          position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: '1.2rem' }}>🧘</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#6D28D9' }}>冥想模式</span>
        </div>
      )}

      {/* ── Today's stats mini widget ── */}
      {todayStats && !showMusicDismiss && (
        <div style={{
          position: 'absolute', top: 16, left: 16,
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '6px 12px', borderRadius: 10,
          background: isLightBg ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
          fontSize: '0.75rem', color: isLightBg ? '#4A4540' : '#9B9890',
          pointerEvents: 'none',
        }}>
          <span>🍅 {todayStats.pomodoros}</span>
          {todayStats.work_minutes > 0 && <span>· {todayStats.work_minutes}min</span>}
        </div>
      )}

      {/* ── Current task pill ── */}
      {currentTask && !isExerciseWorkflow && !isMeditationMode && (
        <div
          onClick={() => setShowTaskPicker(true)}
          style={{
            position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer',
            background: '#EFF4FF', border: '1px solid #BFDBFE',
            borderRadius: 999, padding: '4px 14px',
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563EB',
            animation: isRunning ? 'pulse-dot 1.5s ease-in-out infinite' : 'none' }} />
          <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#2563EB' }}>{currentTask.name}</span>
          {currentTask.pomodor_total > 0 &&
            <span style={{ fontSize: '0.75rem', color: '#6B6860' }}>🍅{currentTask.pomodor_completed}/{currentTask.pomodor_total}</span>}
          <span style={{ fontSize: '0.7rem', color: '#9B9890' }}>切换</span>
        </div>
      )}
      {!currentTask && !isExerciseWorkflow && !isMeditationMode && (isRunning || isPaused) && activeTasks.length > 0 && (
        <div onClick={() => setShowTaskPicker(true)}
          style={{ position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)',
            fontSize: '0.8125rem', color: '#9B9890', cursor: 'pointer',
            background: '#F8F7F4', border: '1px solid #E8E5DF', borderRadius: 999, padding: '4px 14px' }}>
          未绑定任务 · 点击选择
        </div>
      )}

      {/* ── FlipClock ── */}
      <div style={{
        opacity: isRunning ? 1 : (isPaused ? 0.8 : 0.5),
        transition: 'opacity 0.6s ease, transform 0.6s ease',
        filter: overtime ? 'hue-rotate(20deg) saturate(1.4)' : 'none',
        animation: isIdle && !isRestMode ? 'breathe 4s ease-in-out infinite' : 'none',
        transform: isRunning ? 'scale(1)' : isPaused ? 'scale(0.98)' : 'scale(0.95)',
      }}>
        <FlipClock seconds={remaining_seconds} cardW={cardW} cardH={cardH} gap={Math.min(6, winW * 0.015)} variant={isLightBg ? 'light' : 'dark'} />
      </div>

      {/* Overtime */}
      {overtime && (
        <div style={{ marginTop: '1.5em', fontSize: 'min(4vw, 2rem)', color: '#D97706', fontWeight: 300 }}>
          + {formatTimeString(elapsed_overtime_seconds)}
        </div>
      )}

      {/* Status text */}
      <div style={{
        marginTop: '2em', fontSize: '1rem', textAlign: 'center', letterSpacing: '0.04em',
        color: isLightBg ? '#4A4540' : '#9B9890',
      }}>
        {isMeditationMode && isRunning && '🧘 冥想中 · 专注呼吸'}
        {isMeditationMode && isPaused && '🧘 冥想暂停'}
        {isExerciseWorkflow && exercise_phase === 'exercise' && isRunning && '🏃 运动中'}
        {isExerciseWorkflow && exercise_phase === 'exercise' && isPaused && '🏃 运动暂停'}
        {isExerciseWorkflow && exercise_phase === 'exercise' && overtime && ' · 已超时，随时可完成'}
        {isExerciseWorkflow && exercise_phase === 'rest' && isRunning && '😌 放松休息中 · 计入番茄'}
        {isExerciseWorkflow && exercise_phase === 'rest' && isPaused && '😌 休息暂停'}
        {isExerciseWorkflow && exercise_phase === 'shower' && isRunning && '🚿 洗澡时间 · 不计入番茄'}
        {isExerciseWorkflow && exercise_phase === 'shower' && isPaused && '🚿 洗澡暂停'}
        {!isExerciseWorkflow && !isMeditationMode && isIdle && !isRestMode && '等待开始'}
        {!isExerciseWorkflow && !isMeditationMode && isIdle && break_type === 'short'   && '短休息 · 准备开始'}
        {!isExerciseWorkflow && !isMeditationMode && isIdle && break_type === 'leisure' && '休闲时间 · 准备开始'}
        {!isExerciseWorkflow && !isMeditationMode && isIdle && break_type === 'long'    && '长休息 · 准备开始'}
        {!isExerciseWorkflow && !isMeditationMode && isRunning && !isRestMode && '进行中'}
        {!isExerciseWorkflow && !isMeditationMode && isRunning && isRestMode  && '休息中 · 放松一下'}
        {!isExerciseWorkflow && !isMeditationMode && isPaused && !isRestMode  && '已暂停'}
        {!isExerciseWorkflow && !isMeditationMode && isPaused && isRestMode   && '休息暂停'}
      </div>

      {/* Shower "not counted" badge */}
      {isShowerPhase && (isRunning || isPaused) && (
        <div style={{
          marginTop: 10, padding: '4px 14px', borderRadius: 999,
          background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
          fontSize: '0.72rem', color: '#6366F1', fontWeight: 500,
        }}>
          🚿 洗澡时间 · 不计入番茄统计
        </div>
      )}

      {/* ── Chess puzzle during break ── */}
      {isRestMode && (isRunning || isPaused) && (
        <div style={{ marginTop: 16, width: '100%', maxWidth: 340, margin: '16px auto 0' }}>
          <Suspense fallback={<div style={{ textAlign: 'center', color: '#888', fontSize: '0.85rem' }}>加载棋盘...</div>}>
            <ChessPuzzle />
          </Suspense>
        </div>
      )}

      {/* ── Controls ── */}
      <div style={{ marginTop: '2.5em', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Meditation controls */}
        {isMeditationMode && (isRunning || isPaused) && (
          <>
            <button className="btn btn-ghost" onClick={() => { stopMusic(); stop() }}
              style={{ minHeight: 38, color: '#6D28D9', borderColor: '#8B5CF6' }}>
              结束冥想
            </button>
            {isRunning && (
              <button className="btn btn-primary" onClick={pause}
                style={{ minHeight: 38, background: '#7C3AED', borderColor: '#7C3AED', padding: '0.5rem 2.5rem', fontSize: '1rem' }}>
                暂停
              </button>
            )}
            {isPaused && (
              <button className="btn btn-primary" onClick={resume}
                style={{ minHeight: 38, background: '#7C3AED', borderColor: '#7C3AED', padding: '0.5rem 2.5rem', fontSize: '1rem' }}>
                继续
              </button>
            )}
          </>
        )}

        {/* Exercise workflow controls */}
        {isExerciseWorkflow && (isRunning || isPaused) && (
          <>
            <button className="btn btn-ghost" onClick={stop}
              style={{ minHeight: 38, color: '#92400E', borderColor: '#D97706' }}>
              结束运动
            </button>
            {exercise_phase === 'exercise' && overtime && (
              <button className="btn btn-primary" onClick={handleExerciseComplete}
                style={{ minHeight: 38, background: '#F59E0B', borderColor: '#F59E0B', padding: '0.5rem 2rem', fontSize: '1rem' }}>
                完成运动 →
              </button>
            )}
            {exercise_phase === 'exercise' && !overtime && isRunning && (
              <button className="btn btn-primary" onClick={pause}
                style={{ minHeight: 38, background: '#F59E0B', borderColor: '#F59E0B', padding: '0.5rem 2.5rem', fontSize: '1rem' }}>
                暂停
              </button>
            )}
            {exercise_phase === 'exercise' && isPaused && (
              <button className="btn btn-primary" onClick={resume}
                style={{ minHeight: 38, background: '#F59E0B', borderColor: '#F59E0B', padding: '0.5rem 2.5rem', fontSize: '1rem' }}>
                继续
              </button>
            )}
            {exercise_phase === 'rest' && isRunning && (
              <button className="btn btn-primary" onClick={pause}
                style={{ minHeight: 38, background: '#EAB308', borderColor: '#EAB308', padding: '0.5rem 2.5rem', fontSize: '1rem' }}>
                暂停
              </button>
            )}
            {exercise_phase === 'rest' && isPaused && (
              <button className="btn btn-primary" onClick={resume}
                style={{ minHeight: 38, background: '#EAB308', borderColor: '#EAB308', padding: '0.5rem 2.5rem', fontSize: '1rem' }}>
                继续
              </button>
            )}
            {exercise_phase === 'shower' && isRunning && (
              <button className="btn btn-primary" onClick={pause}
                style={{ minHeight: 38, background: '#6366F1', borderColor: '#6366F1', padding: '0.5rem 2.5rem', fontSize: '1rem' }}>
                暂停
              </button>
            )}
            {exercise_phase === 'shower' && isPaused && (
              <button className="btn btn-primary" onClick={resume}
                style={{ minHeight: 38, background: '#6366F1', borderColor: '#6366F1', padding: '0.5rem 2.5rem', fontSize: '1rem' }}>
                继续
              </button>
            )}
          </>
        )}

        {/* Normal (non-exercise, non-meditation) controls */}
        {!isExerciseWorkflow && !isMeditationMode && (
          <>
            {!isIdle && (
              <button className="btn btn-ghost" onClick={() => { stopMusic(); stop() }}
                style={{ minHeight: 38, ...(isRestMode ? { color: '#5a7d6a', borderColor: '#5a7d6a' } : {}) }}>
                {isRestMode ? '跳过休息' : '停止'}
              </button>
            )}
            {isIdle && isRestMode && (
              <button className="btn btn-ghost" onClick={() => start('pomodoro', current_task_id ?? undefined)}
                style={{ color: '#2E7D32', borderColor: '#2E7D32', minHeight: 38 }}>跳过休息</button>
            )}
            <button
              className="btn btn-primary"
              onClick={handleAction}
              style={{
                padding: '0.5rem 2.5rem', fontSize: '1rem', minHeight: 38,
                ...(isRestMode ? { background: '#2E7D32', borderColor: '#2E7D32' } : {}),
              }}
            >
              {isIdle && isRestMode && '开始休息'}
              {isIdle && !isRestMode && '开始'}
              {isRunning && !isRestMode && '暂停'}
              {isRunning && isRestMode && '暂停'}
              {isPaused  && '继续'}
            </button>
          </>
        )}
      </div>

      {/* ── Break options ── */}
      {!isExerciseWorkflow && !isMeditationMode && isIdle && isRestMode && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-ghost text-xs" style={{ color: '#2E7D32', borderColor: '#A5D6A7' }}
            onClick={() => startBreak('short')}>☕ 短休 (10min)</button>
          <button className="btn btn-ghost text-xs" style={{ color: '#2E7D32', borderColor: '#A5D6A7' }}
            onClick={() => startBreak('leisure')}>🎬 休闲 (15min)</button>
        </div>
      )}

      {/* ── Mode selector (idle only, not during rest) ── */}
      {!isExerciseWorkflow && !isMeditationMode && isIdle && !isRestMode && (
        <div style={{ marginTop: 18, display: 'flex', gap: winW < 400 ? 6 : 8, flexWrap: 'wrap', justifyContent: 'center', padding: '0 16px' }}>
          <button
            className={`btn text-xs ${mode === 'pomodoro' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => activeTasks.length > 0 ? setShowTaskPicker(true) : start('pomodoro')}
          >🍅 番茄钟</button>
          <button
            className="btn text-xs btn-ghost"
            onClick={() => startExercise('boxing')}
          >🏃 运动 (80min)</button>
          <button
            className="btn text-xs btn-ghost"
            onClick={handleStartMeditation}
            style={{ color: '#7C3AED', borderColor: '#C4B5FD' }}
          >🧘 冥想 (20min)</button>
        </div>
      )}

      {/* ── Ambient sound control ── */}
      <div style={{ position: 'absolute', bottom: 120, right: 16, zIndex: 10 }}>
        <AmbientSoundControl />
      </div>

      {/* ── Footer hint ── */}
      {!isExerciseWorkflow && !isMeditationMode && isIdle && !isRestMode && (
        <div style={{ position: 'absolute', bottom: 90, left: 0, right: 0, textAlign: 'center',
          fontSize: '0.75rem', color: '#C8C4BC', pointerEvents: 'none' }}>
          每2个番茄后休息 · 连续4个后建议运动 · 空格开始/暂停
        </div>
      )}
      {!isExerciseWorkflow && !isMeditationMode && isRestMode && (isRunning || isPaused) && (
        <div style={{ position: 'absolute', bottom: 90, left: 0, right: 0, textAlign: 'center',
          fontSize: '0.75rem', color: '#66BB6A', pointerEvents: 'none' }}>
          休息结束后自动回到待机状态
        </div>
      )}
      {isMeditationMode && (isRunning || isPaused) && (
        <div style={{ position: 'absolute', bottom: 90, left: 0, right: 0, textAlign: 'center',
          fontSize: '0.75rem', color: '#8B5CF6', pointerEvents: 'none' }}>
          🧘 冥想 20 分钟 · 结束时会播放提示音乐
        </div>
      )}
      {isExerciseWorkflow && (isRunning || isPaused) && (
        <div style={{ position: 'absolute', bottom: 90, left: 0, right: 0, textAlign: 'center',
          fontSize: '0.75rem', color: isShowerPhase ? '#818CF8' : '#D97706', pointerEvents: 'none' }}>
          {exercise_phase === 'exercise' && '运动30min → 休息30min → 洗澡20min · 共80分钟'}
          {exercise_phase === 'rest' && '运动✓ → 休息中 → 洗澡20min · 运动+休息=60min番茄'}
          {exercise_phase === 'shower' && '运动✓ → 休息✓ → 洗澡中 · 已记录60min番茄'}
        </div>
      )}

      <style>{`
        @keyframes breathe {
          0%, 100% { opacity: 0.5; transform: scale(0.95); }
          50% { opacity: 0.65; transform: scale(0.97); }
        }
      `}</style>
    </div>
  )
}
