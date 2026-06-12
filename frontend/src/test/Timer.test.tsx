import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../stores/timerStore', () => ({
  useTimerStore: vi.fn(() => ({
    status: 'idle', remaining_seconds: 1500, elapsed_overtime_seconds: 0,
    current_session: 0, mode: 'pomodoro', current_task_id: null,
    break_type: 'none', exercise_phase: 'none',
    exercise_reminder_due: false, bath_reminder_due: false,
    fetchState: vi.fn(), start: vi.fn(), pause: vi.fn(), resume: vi.fn(),
    stop: vi.fn(), completeSession: vi.fn(), startBreak: vi.fn(),
    startExercise: vi.fn(), skipExercise: vi.fn(), skipBath: vi.fn(),
    switchTask: vi.fn(), connectWS: vi.fn(), disconnectWS: vi.fn(),
  })),
}))

vi.mock('../stores/taskStore', () => ({
  useTaskStore: vi.fn(() => ({
    tasks: [], fetchTasks: vi.fn(),
  })),
}))

vi.mock('../utils/sounds', () => ({
  playTransitionChime: vi.fn(), stopMusic: vi.fn(),
  playWorkEndMusic: vi.fn(), playMeditationEndMusic: vi.fn(),
  playRestEndMusic: vi.fn(), retryLastEndMusic: vi.fn(),
  isMusicPlaying: vi.fn(() => false), unlockAudioForSession: vi.fn(),
}))

vi.mock('../utils/ambientSound', () => ({
  stopAmbient: vi.fn(), getSavedPreset: vi.fn(() => null),
  playAmbient: vi.fn(), setAmbientVolume: vi.fn(), getAmbientVolume: vi.fn(() => 0.3),
}))

vi.mock('../components/AmbientSoundControl', () => ({
  default: () => <div data-testid="ambient-control">AmbientControl</div>,
}))

vi.mock('../components/FlipClock', () => ({
  FlipClock: ({ value }: { value: string }) => <div data-testid="flip-clock">{value}</div>,
}))

vi.mock('../hooks/useFormatTime', () => ({
  formatTimeDisplay: (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  },
  formatTimeString: (s: number) => `${Math.floor(s / 60)}m`,
}))

describe('Timer Page', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders pomodoro start button', async () => {
    const Timer = (await import('../pages/Timer')).default
    render(<Timer />)
    expect(screen.getByText(/番茄钟/)).toBeTruthy()
  })

  it('renders meditation start button', async () => {
    const Timer = (await import('../pages/Timer')).default
    render(<Timer />)
    expect(screen.getByText(/冥想/)).toBeTruthy()
  })

  it('shows flip clock component', async () => {
    const Timer = (await import('../pages/Timer')).default
    render(<Timer />)
    expect(screen.getByTestId('flip-clock')).toBeTruthy()
  })

  it('shows ambient sound control', async () => {
    const Timer = (await import('../pages/Timer')).default
    render(<Timer />)
    expect(screen.getByTestId('ambient-control')).toBeTruthy()
  })

  it('renders rest mode indicator when in short break', async () => {
    const { useTimerStore } = await import('../stores/timerStore')
    vi.mocked(useTimerStore).mockReturnValue({
      status: 'running', remaining_seconds: 300, elapsed_overtime_seconds: 0,
      current_session: 1, mode: 'pomodoro', current_task_id: null,
      break_type: 'short', exercise_phase: 'none',
      exercise_reminder_due: false, bath_reminder_due: false,
      fetchState: vi.fn(), start: vi.fn(), pause: vi.fn(), resume: vi.fn(),
      stop: vi.fn(), completeSession: vi.fn(), startBreak: vi.fn(),
      startExercise: vi.fn(), skipExercise: vi.fn(), skipBath: vi.fn(),
      switchTask: vi.fn(), connectWS: vi.fn(), disconnectWS: vi.fn(),
    } as any)

    const Timer = (await import('../pages/Timer')).default
    render(<Timer />)
    expect(screen.getByText(/休息时间/)).toBeTruthy()
  })

  it('renders meditation mode indicator', async () => {
    const { useTimerStore } = await import('../stores/timerStore')
    vi.mocked(useTimerStore).mockReturnValue({
      status: 'running', remaining_seconds: 1200, elapsed_overtime_seconds: 0,
      current_session: 0, mode: 'meditation', current_task_id: null,
      break_type: 'none', exercise_phase: 'none',
      exercise_reminder_due: false, bath_reminder_due: false,
      fetchState: vi.fn(), start: vi.fn(), pause: vi.fn(), resume: vi.fn(),
      stop: vi.fn(), completeSession: vi.fn(), startBreak: vi.fn(),
      startExercise: vi.fn(), skipExercise: vi.fn(), skipBath: vi.fn(),
      switchTask: vi.fn(), connectWS: vi.fn(), disconnectWS: vi.fn(),
    } as any)

    const Timer = (await import('../pages/Timer')).default
    render(<Timer />)
    expect(screen.getByText(/冥想 20 分钟/)).toBeTruthy()
  })
})
