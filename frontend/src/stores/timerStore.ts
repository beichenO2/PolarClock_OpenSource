import { create } from 'zustand'
import { getToken } from './userStore'
import {
  enqueueRequest, cacheTimerState, loadCachedTimerState,
  isOnline, flushQueue, setupOnlineSync,
} from '../utils/offlineSync'

const getHeaders = (json = false): Record<string, string> => {
  const h: Record<string, string> = {}
  const token = getToken()
  if (token) h['X-Token'] = token
  if (json) h['Content-Type'] = 'application/json'
  return h
}

async function resilientFetch(
  url: string,
  init: RequestInit,
  queueable = false,
): Promise<Response | null> {
  try {
    const res = await fetch(url, init)
    return res
  } catch {
    if (queueable && init.method && init.method !== 'GET') {
      enqueueRequest(url, init.method, init.body as string | undefined)
    }
    return null
  }
}

export type TimerMode = 'pomodoro' | 'exercise' | 'meditation'
export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished'
export type BreakType = 'none' | 'short' | 'leisure' | 'long'
export type ExercisePhase = 'none' | 'exercise' | 'rest' | 'shower'

interface TimerState {
  mode: TimerMode
  status: TimerStatus
  remaining_seconds: number
  elapsed_overtime_seconds: number
  current_session: number
  total_sessions: number
  started_at: string | null
  work_duration_minutes: number
  meditation_duration_minutes: number
  short_break_minutes: number
  leisure_break_minutes: number
  long_break_minutes: number
  break_type: BreakType
  works_since_leisure: number
  works_since_exercise: number
  exercise_reminder_due: boolean
  bath_reminder_due: boolean
  exercise_type: 'boxing' | 'running'
  exercise_phase: ExercisePhase
  current_task_id: string | null

  // WebSocket
  _ws: WebSocket | null
  _wsReconnectTimer: ReturnType<typeof setTimeout> | null
  _localCountdownRAF: number | null
  _lastServerSync: number

  fetchState: () => Promise<void>
  updateSettings: (settings: { work_duration_minutes?: number; short_break_minutes?: number; leisure_break_minutes?: number; long_break_minutes?: number }) => Promise<void>
  start: (mode?: TimerMode, taskId?: string) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  stop: () => Promise<void>
  completeSession: () => Promise<void>
  startBreak: (breakType?: BreakType) => Promise<void>
  startExercise: (exerciseType?: 'boxing' | 'running') => Promise<void>
  skipExercise: () => Promise<void>
  skipBath: () => Promise<void>
  switchTask: (taskId: string | null) => Promise<void>
  connectWS: () => void
  disconnectWS: () => void
  startLocalCountdown: () => void
  stopLocalCountdown: () => void
}

export const useTimerStore = create<TimerState>((set, get) => ({
  mode: 'pomodoro',
  status: 'idle',
  remaining_seconds: 2700,
  elapsed_overtime_seconds: 0,
  current_session: 1,
  total_sessions: 4,
  started_at: null,
  work_duration_minutes: 45,
  meditation_duration_minutes: 20,
  short_break_minutes: 10,
  leisure_break_minutes: 15,
  long_break_minutes: 15,
  break_type: 'none',
  works_since_leisure: 0,
  works_since_exercise: 0,
  exercise_reminder_due: false,
  bath_reminder_due: false,
  exercise_type: 'boxing',
  exercise_phase: 'none',
  current_task_id: null,

  _ws: null,
  _wsReconnectTimer: null,
  _localCountdownRAF: null,
  _lastServerSync: 0,

  connectWS: () => {
    setupOnlineSync(() => {
      get().fetchState()
      get().connectWS()
    })

    const state = get()
    if (state._ws && state._ws.readyState === WebSocket.OPEN) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const token = getToken() ?? ''
    const ws = new WebSocket(`${protocol}//${host}/api/timer/ws?token=${encodeURIComponent(token)}`)

    ws.onopen = () => {
      // Clear any reconnect timer
      const s = get()
      if (s._wsReconnectTimer) {
        clearTimeout(s._wsReconnectTimer)
        set({ _wsReconnectTimer: null })
      }
    }

    ws.onmessage = (event) => {
      try {
        if (event.data === 'pong') return
        const serverState = JSON.parse(event.data)

        const patch = {
          mode: serverState.mode,
          status: serverState.status,
          remaining_seconds: serverState.remaining_seconds,
          elapsed_overtime_seconds: serverState.elapsed_overtime_seconds,
          current_session: serverState.current_session,
          total_sessions: serverState.total_sessions,
          started_at: serverState.started_at,
          work_duration_minutes: serverState.work_duration_minutes,
          meditation_duration_minutes: serverState.meditation_duration_minutes ?? 20,
          short_break_minutes: serverState.short_break_minutes,
          leisure_break_minutes: serverState.leisure_break_minutes,
          long_break_minutes: serverState.long_break_minutes,
          break_type: serverState.break_type,
          works_since_leisure: serverState.works_since_leisure,
          works_since_exercise: serverState.works_since_exercise,
          exercise_reminder_due: serverState.exercise_reminder_due,
          bath_reminder_due: serverState.bath_reminder_due,
          exercise_type: serverState.exercise_type,
          exercise_phase: serverState.exercise_phase || 'none',
          current_task_id: serverState.current_task_id || null,
          _lastServerSync: Date.now(),
        }
        set(patch)
        cacheTimerState(patch)
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      set({ _ws: null })
      // Auto-reconnect after 2 seconds
      const timer = setTimeout(() => {
        get().connectWS()
      }, 2000)
      set({ _wsReconnectTimer: timer })
    }

    ws.onerror = () => {
      ws.close()
    }

    set({ _ws: ws })
  },

  disconnectWS: () => {
    const state = get()
    if (state._ws) {
      state._ws.close()
      set({ _ws: null })
    }
    if (state._wsReconnectTimer) {
      clearTimeout(state._wsReconnectTimer)
      set({ _wsReconnectTimer: null })
    }
    state.stopLocalCountdown()
  },

  startLocalCountdown: () => {
    // Local rAF-based countdown for smooth display between server syncs
    const tick = () => {
      const s = get()
      if (s.status !== 'running') return

      // Only interpolate locally if we have a server sync
      if (s._lastServerSync > 0) {
        const elapsed = (Date.now() - s._lastServerSync) / 1000
        // Don't locally decrement more than 2 seconds ahead of last sync
        // as server will push real state every second
        if (elapsed < 2 && elapsed > 0) {
          // Sub-second interpolation is handled by the component
        }
      }

      const raf = requestAnimationFrame(tick)
      set({ _localCountdownRAF: raf })
    }

    const raf = requestAnimationFrame(tick)
    set({ _localCountdownRAF: raf })
  },

  stopLocalCountdown: () => {
    const state = get()
    if (state._localCountdownRAF) {
      cancelAnimationFrame(state._localCountdownRAF)
      set({ _localCountdownRAF: null })
    }
  },

  fetchState: async () => {
    try {
      const res = await fetch('/api/timer/state', { headers: getHeaders() })
      if (res.ok) {
        const state = await res.json()
        set(state)
        cacheTimerState(state)
        flushQueue()
      }
    } catch {
      const cached = loadCachedTimerState()
      if (cached) {
        set(cached as Partial<TimerState>)
      }
    }
  },

  updateSettings: async (settings) => {
    const res = await fetch('/api/timer/settings', {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify(settings)
    })
    if (res.ok) {
      const state = await res.json()
      set(state)
    }
  },

  start: async (mode = 'pomodoro', taskId?: string) => {
    const body: Record<string, unknown> = { mode }
    if (taskId) body.task_id = taskId
    await resilientFetch('/api/timer/start', {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(body)
    }, true)
    if (!get()._ws) get().fetchState()
  },

  pause: async () => {
    await resilientFetch('/api/timer/pause', { method: 'POST', headers: getHeaders() }, true)
    if (!get()._ws) get().fetchState()
  },

  resume: async () => {
    await resilientFetch('/api/timer/resume', { method: 'POST', headers: getHeaders() }, true)
    if (!get()._ws) get().fetchState()
  },

  stop: async () => {
    await resilientFetch('/api/timer/stop', { method: 'POST', headers: getHeaders() }, true)
    if (!get()._ws) get().fetchState()
  },

  completeSession: async () => {
    await resilientFetch('/api/timer/sessions/complete', {
      method: 'POST', headers: getHeaders()
    }, true)
    if (!get()._ws) get().fetchState()
    if (isOnline()) {
      try {
        const { useStatsStore } = await import('./statsStore')
        useStatsStore.getState().fetchToday?.()
      } catch {}
      try {
        const { useTaskStore } = await import('./taskStore')
        useTaskStore.getState().fetchTasks()
      } catch {}
    }
  },

  startBreak: async (breakType = 'short') => {
    await resilientFetch('/api/timer/break/start', {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ break_type: breakType })
    }, true)
    if (!get()._ws) get().fetchState()
  },

  startExercise: async (exerciseType = 'boxing') => {
    await resilientFetch('/api/timer/exercise/start', {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ exercise_type: exerciseType })
    }, true)
    if (!get()._ws) get().fetchState()
  },

  skipExercise: async () => {
    await resilientFetch('/api/timer/exercise/skip', { method: 'POST', headers: getHeaders() }, true)
    if (!get()._ws) get().fetchState()
  },

  skipBath: async () => {
    await resilientFetch('/api/timer/bath/skip', { method: 'POST', headers: getHeaders() }, true)
    if (!get()._ws) get().fetchState()
  },

  switchTask: async (taskId: string | null) => {
    await resilientFetch('/api/timer/switch-task', {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ task_id: taskId })
    }, true)
    if (!get()._ws) get().fetchState()
  }
}))
