import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('statsStore', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFetch.mockReset()
  })

  it('fetchToday updates today state', async () => {
    const todayData = {
      date: '2026-04-10',
      pomodoro_count: 3,
      meditation_count: 1,
      work_minutes: 90,
      exercise_minutes: 0,
      meditation_minutes: 20,
      break_minutes: 20,
      total_minutes: 130,
      records: [],
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(todayData) })

    const { useStatsStore } = await import('../stores/statsStore')
    await useStatsStore.getState().fetchToday()
    expect(useStatsStore.getState().today).toEqual(todayData)
  })

  it('fetchTaskCompletion updates taskCompletion state', async () => {
    const completionData = {
      overall_completion_rate: 75.0,
      tasks_completed: 3,
      tasks_total: 5,
      task_completion_rate: 60.0,
      tasks: [],
    }
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(completionData) })

    const { useStatsStore } = await import('../stores/statsStore')
    await useStatsStore.getState().fetchTaskCompletion()
    expect(useStatsStore.getState().taskCompletion).toEqual(completionData)
  })

  it('fetchToday handles failure gracefully', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const { useStatsStore } = await import('../stores/statsStore')
    await useStatsStore.getState().fetchToday()
    expect(useStatsStore.getState().today).toBeNull()
  })
})

describe('taskStore', () => {
  beforeEach(() => {
    vi.resetModules()
    mockFetch.mockReset()
  })

  it('fetchTasks populates tasks array', async () => {
    const tasks = [
      { id: '1', name: 'Test Task', status: 'pending', children: [], date_blocks: [], questions: [], dependencies: [], story: '', archived: false },
    ]
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(tasks) })

    const { useTaskStore } = await import('../stores/taskStore')
    await useTaskStore.getState().fetchTasks()
    expect(useTaskStore.getState().tasks).toEqual(tasks)
  })

  it('createTask sends POST and refreshes', async () => {
    const newTask = { id: '2', name: 'New Task', status: 'pending' }
    mockFetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(newTask) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([newTask]) })

    const { useTaskStore } = await import('../stores/taskStore')
    const result = await useTaskStore.getState().createTask('New Task')
    expect(result.name).toBe('New Task')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

describe('themeStore', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  it('toggle switches between light and dark', async () => {
    const { useThemeStore } = await import('../stores/themeStore')
    const initial = useThemeStore.getState().theme
    useThemeStore.getState().toggle()
    const toggled = useThemeStore.getState().theme
    expect(toggled).not.toBe(initial)

    useThemeStore.getState().toggle()
    expect(useThemeStore.getState().theme).toBe(initial)
  })

  it('persists theme to localStorage', async () => {
    const { useThemeStore } = await import('../stores/themeStore')
    useThemeStore.getState().toggle()
    const saved = localStorage.getItem('polarclock-theme')
    expect(saved).toBeTruthy()
  })
})
