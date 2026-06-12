import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../stores/statsStore', () => ({
  useStatsStore: vi.fn(() => ({
    today: {
      date: '2026-04-10', pomodoro_count: 5, meditation_count: 1,
      work_minutes: 125, exercise_minutes: 30, meditation_minutes: 20,
      break_minutes: 25, total_minutes: 200,
      records: [
        { id: 'r1', type: 'pomodoro', duration_minutes: 25, completed_at: '2026-04-10T09:25:00', started_at: '2026-04-10T09:00:00', task_id: null, exercise_type: null },
      ],
    },
    weekly: {
      days: [
        { date: '2026-04-07', weekday: 'Mon', pomodoro_count: 3, work_minutes: 75, exercise_minutes: 0 },
        { date: '2026-04-08', weekday: 'Tue', pomodoro_count: 4, work_minutes: 100, exercise_minutes: 0 },
        { date: '2026-04-09', weekday: 'Wed', pomodoro_count: 5, work_minutes: 125, exercise_minutes: 0 },
        { date: '2026-04-10', weekday: 'Thu', pomodoro_count: 5, work_minutes: 125, exercise_minutes: 0 },
      ],
      weeks: [{ week_start: '2026-04-07', week_end: '2026-04-13', pomodoro_count: 17, work_minutes: 425 }],
      total_days: 4,
    },
    monthly: { trend: [{ date: '2026-04-01', count: 5 }], max_count: 10, total_pomodoros: 60, avg_per_day: 6 },
    heatmap: null,
    taskCompletion: {
      overall_completion_rate: 80, tasks_completed: 8, tasks_total: 10,
      task_completion_rate: 80, tasks: [],
    },
    peakHours: {
      weeks: 4,
      slots: [{ day: 3, hour: 9, count: 5, total_minutes: 125, avg_duration: 25 }],
      peak_count: 5,
    },
    fetchAll: vi.fn(),
    fetchToday: vi.fn(), fetchWeekly: vi.fn(), fetchMonthly: vi.fn(),
    fetchHeatmap: vi.fn(), fetchTaskCompletion: vi.fn(), fetchPeakHours: vi.fn(),
  })),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'zh' } }),
}))

describe('Stats Page', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders today pomodoro count', async () => {
    const Stats = (await import('../pages/Stats')).default
    render(<MemoryRouter><Stats /></MemoryRouter>)
    expect(screen.getAllByText('5').length).toBeGreaterThan(0)
  })

  it('renders work minutes', async () => {
    const Stats = (await import('../pages/Stats')).default
    render(<MemoryRouter><Stats /></MemoryRouter>)
    expect(screen.getAllByText(/125/).length).toBeGreaterThan(0)
  })

  it('renders task completion rate', async () => {
    const Stats = (await import('../pages/Stats')).default
    render(<MemoryRouter><Stats /></MemoryRouter>)
    expect(screen.getAllByText('80%').length).toBeGreaterThan(0)
  })

  it('renders peak hours section', async () => {
    const Stats = (await import('../pages/Stats')).default
    render(<MemoryRouter><Stats /></MemoryRouter>)
    expect(screen.getByText(/高效时段/)).toBeTruthy()
  })

  it('renders share button', async () => {
    const Stats = (await import('../pages/Stats')).default
    render(<MemoryRouter><Stats /></MemoryRouter>)
    expect(screen.getByText(/分享/)).toBeTruthy()
  })

  it('renders today records section', async () => {
    const Stats = (await import('../pages/Stats')).default
    render(<MemoryRouter><Stats /></MemoryRouter>)
    expect(screen.getByText(/今日记录/)).toBeTruthy()
  })
})
