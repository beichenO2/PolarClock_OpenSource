import { create } from 'zustand'
import { getToken } from './userStore'

export interface StatsRecord {
  id: string
  type: string
  duration_minutes: number
  completed_at: string
  started_at?: string
  task_id: string | null
  exercise_type: string | null
  is_partial?: boolean
}

interface TodayStats {
  date: string
  pomodoro_count: number
  meditation_count: number
  work_minutes: number
  exercise_minutes: number
  meditation_minutes: number
  break_minutes: number
  total_minutes: number
  records: StatsRecord[]
}

interface DayData {
  date: string
  weekday: string
  pomodoro_count: number
  work_minutes: number
  exercise_minutes: number
}

interface WeeklyStats {
  days: DayData[]
  weeks: Array<{
    week_start: string
    week_end: string
    pomodoro_count: number
    work_minutes: number
  }>
  total_days: number
}

interface MonthlyStats {
  trend: Array<{ date: string; count: number }>
  max_count: number
  total_pomodoros: number
  avg_per_day: number
}

export interface HeatmapSession {
  started_at: string
  duration_minutes: number
  type: 'pomodoro' | 'exercise' | 'meditation'
}

export interface HeatmapDay {
  date: string
  sessions?: HeatmapSession[]           // for 1m range
  pomodoro_count?: number               // for 3m/1y range
  exercise_count?: number
  meditation_count?: number
}

export interface HeatmapData {
  range: '1m' | '3m' | '1y'
  days: HeatmapDay[]
}

const getHeaders = () => {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['X-Token'] = token
  return headers
}

export interface TaskCompletionStat {
  task_id: string
  task_name: string
  status: string
  pomodoro_total: number
  pomodoro_completed: number
  completion_rate: number
  total_work_minutes: number
  session_count: number
  parent_id: string | null
  archived: boolean
}

export interface TaskCompletionData {
  overall_completion_rate: number
  tasks_completed: number
  tasks_total: number
  task_completion_rate: number
  tasks: TaskCompletionStat[]
}

export interface PeakHourSlot {
  day_of_week: number
  hour: number
  session_count: number
  total_minutes: number
  avg_duration: number
}

export interface PeakHoursData {
  weeks: number
  slots: PeakHourSlot[]
  peak_count: number
}

interface StatsStore {
  today: TodayStats | null
  weekly: WeeklyStats | null
  monthly: MonthlyStats | null
  heatmapData: HeatmapData | null
  taskCompletion: TaskCompletionData | null
  peakHours: PeakHoursData | null
  loading: boolean
  fetchToday: () => Promise<void>
  fetchWeekly: (weeks?: number) => Promise<void>
  fetchMonthly: (months?: number) => Promise<void>
  fetchHeatmap: (range?: '1m' | '3m' | '1y') => Promise<void>
  fetchTaskCompletion: () => Promise<void>
  fetchPeakHours: (weeks?: number) => Promise<void>
  fetchAll: () => Promise<void>
}

export const useStatsStore = create<StatsStore>((set, get) => ({
  today: null,
  weekly: null,
  monthly: null,
  heatmapData: null,
  taskCompletion: null,
  peakHours: null,
  loading: false,

  fetchToday: async () => {
    try {
      const res = await fetch('/api/stats/today', { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        set({ today: data })
      }
    } catch (e) {
      console.error('Failed to fetch today stats:', e)
    }
  },

  fetchWeekly: async (weeks = 4) => {
    try {
      const res = await fetch(`/api/stats/weekly?weeks=${weeks}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        set({ weekly: data })
      }
    } catch (e) {
      console.error('Failed to fetch weekly stats:', e)
    }
  },

  fetchMonthly: async (months = 3) => {
    try {
      const res = await fetch(`/api/stats/monthly?months=${months}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        set({ monthly: data })
      }
    } catch (e) {
      console.error('Failed to fetch monthly stats:', e)
    }
  },

  fetchHeatmap: async (range = '1m') => {
    try {
      const res = await fetch(`/api/stats/heatmap?range=${range}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        set({ heatmapData: data })
      }
    } catch (e) {
      console.error('Failed to fetch heatmap:', e)
    }
  },

  fetchTaskCompletion: async () => {
    try {
      const res = await fetch('/api/stats/task-completion', { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        set({ taskCompletion: data })
      }
    } catch (e) {
      console.error('Failed to fetch task completion:', e)
    }
  },

  fetchPeakHours: async (weeks = 4) => {
    try {
      const res = await fetch(`/api/stats/peak-hours?weeks=${weeks}`, { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        set({ peakHours: data })
      }
    } catch (e) {
      console.error('Failed to fetch peak hours:', e)
    }
  },

  fetchAll: async () => {
    set({ loading: true })
    await Promise.all([
      get().fetchToday(),
      get().fetchWeekly(),
      get().fetchMonthly(),
      get().fetchHeatmap('1m'),
      get().fetchTaskCompletion(),
      get().fetchPeakHours(),
    ])
    set({ loading: false })
  },
}))
