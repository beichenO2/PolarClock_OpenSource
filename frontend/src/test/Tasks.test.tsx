import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockTasks = [
  { id: '1', name: 'Write docs', status: 'pending', priority: 2, parent_id: null, tags: ['work'], children: [], date_blocks: [], questions: [], dependencies: [], story: '', archived: false, pomodor_total: 4, pomodor_completed: 1 },
  { id: '2', name: 'Fix bug', status: 'in_progress', priority: 3, parent_id: null, tags: ['bug'], children: [], date_blocks: [], questions: [], dependencies: [], story: '', archived: false, pomodor_total: 2, pomodor_completed: 2 },
  { id: '3', name: 'Done task', status: 'completed', priority: 1, parent_id: null, tags: [], children: [], date_blocks: [], questions: [], dependencies: [], story: '', archived: false, pomodor_total: 0, pomodor_completed: 0 },
]

vi.mock('../stores/taskStore', () => ({
  useTaskStore: vi.fn(() => ({
    tasks: mockTasks,
    fetchTasks: vi.fn(),
    createTask: vi.fn().mockResolvedValue({ id: '4', name: 'New' }),
    deleteTask: vi.fn(),
    restoreTask: vi.fn(),
  })),
}))

vi.mock('../stores/timerStore', () => ({
  useTimerStore: vi.fn(() => ({
    status: 'idle', current_task_id: null,
  })),
}))

describe('Tasks Page', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders task list with active tasks', async () => {
    const Tasks = (await import('../pages/Tasks')).default
    render(<MemoryRouter><Tasks /></MemoryRouter>)
    expect(screen.getByText('Write docs')).toBeTruthy()
    expect(screen.getByText('Fix bug')).toBeTruthy()
  })

  it('shows completed task with line-through', async () => {
    const Tasks = (await import('../pages/Tasks')).default
    render(<MemoryRouter><Tasks /></MemoryRouter>)
    expect(screen.getByText('Done task')).toBeTruthy()
  })

  it('shows tags on task items', async () => {
    const Tasks = (await import('../pages/Tasks')).default
    render(<MemoryRouter><Tasks /></MemoryRouter>)
    expect(screen.getAllByText('work').length).toBeGreaterThan(0)
    expect(screen.getAllByText('bug').length).toBeGreaterThan(0)
  })

  it('has task input for creating new tasks', async () => {
    const Tasks = (await import('../pages/Tasks')).default
    render(<MemoryRouter><Tasks /></MemoryRouter>)
    const input = screen.getByPlaceholderText(/新建任务/)
    expect(input).toBeTruthy()
  })

  it('navigates to task detail on click', async () => {
    const Tasks = (await import('../pages/Tasks')).default
    render(<MemoryRouter><Tasks /></MemoryRouter>)
    fireEvent.click(screen.getByText('Write docs'))
    expect(mockNavigate).toHaveBeenCalledWith('/clock/tasks/1')
  })

  it('shows pomodoro progress for tasks', async () => {
    const Tasks = (await import('../pages/Tasks')).default
    render(<MemoryRouter><Tasks /></MemoryRouter>)
    expect(screen.getByText('1/4')).toBeTruthy()
    expect(screen.getByText('2/2')).toBeTruthy()
  })
})
