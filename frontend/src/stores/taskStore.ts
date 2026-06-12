import { create } from 'zustand'
import { getToken, useUserStore } from './userStore'

export interface DateBlock {
  start: string
  end: string
}

export interface Question {
  id: string
  question: string
  answer: string
}

export interface Task {
  id: string
  name: string
  deadline: string | null
  importance_axis_position: number
  desire_axis_position: number
  parent_id: string | null
  children: string[]
  created_at: string
  updated_at: string
  status: 'pending' | 'in_progress' | 'completed'
  pomodor_completed: number
  pomodor_total: number
  // Legacy single-block (kept for backward compat)
  start_date?: string | null
  end_date?: string | null
  // New: multiple non-contiguous blocks
  date_blocks: DateBlock[]
  archived: boolean
  pinned?: boolean
  questions: Question[]
  dependencies: string[]   // IDs of root-level tasks this task depends on (root tasks only)
  story: string            // free-text narrative: what is this task about?
  tags?: string[]          // freeform tags for categorization
  recurrence?: { type: 'daily' | 'weekly' | 'monthly'; interval: number } | null
  recurring_from?: string | null
}

export interface ActualRecord {
  id: string
  type: string
  duration_minutes: number
  completed_at: string
  started_at?: string
}

export interface GanttData {
  tasks: Task[]
  actuals: Record<string, ActualRecord[]>
}

const getHeaders = () => {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['X-Token'] = token
  return headers
}

interface TaskStore {
  tasks: Task[]
  archivedTasks: Task[]
  ganttData: GanttData | null
  selectedTask: Task | null

  fetchTasks: () => Promise<void>
  fetchArchivedTasks: () => Promise<void>
  fetchGanttData: () => Promise<void>
  createTask: (name: string, deadline?: string, parent_id?: string, pomodor_total?: number) => Promise<Task>
  updateTask: (id: string, data: Partial<Task>) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  selectTask: (task: Task | null) => void
  reorderTask: (taskId: string, axis: 'importance' | 'desire', newPosition: number) => Promise<void>
  updatePositions: (updates: Array<{id: string, importance_axis_position?: number, desire_axis_position?: number}>) => Promise<void>
  archiveTask: (id: string) => Promise<void>
  restoreTask: (id: string) => Promise<void>
  updateBlocks: (taskId: string, blocks: DateBlock[]) => Promise<void>
  updateQuestions: (taskId: string, questions: Question[]) => Promise<void>
  updateDependencies: (taskId: string, deps: string[]) => Promise<void>
  updateStory: (taskId: string, story: string) => Promise<void>
  updateTags: (taskId: string, tags: string[]) => Promise<void>
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  archivedTasks: [],
  ganttData: null,
  selectedTask: null,

  fetchTasks: async () => {
    const res = await fetch('/api/tasks', { headers: getHeaders() })
    if (res.ok) {
      const tasks = await res.json()
      set({ tasks })
    } else if (res.status === 401) {
      useUserStore.getState().logout()
    }
  },

  fetchArchivedTasks: async () => {
    const res = await fetch('/api/tasks?include_archived=true', { headers: getHeaders() })
    if (res.ok) {
      const all = await res.json()
      set({ archivedTasks: all.filter((t: Task) => t.archived) })
    }
  },

  fetchGanttData: async () => {
    const res = await fetch('/api/tasks/gantt-data', { headers: getHeaders() })
    if (res.ok) {
      const data = await res.json()
      set({ ganttData: data, tasks: data.tasks })
    }
  },

  createTask: async (name, deadline, parent_id, pomodor_total) => {
    const body: Record<string, unknown> = { name }
    if (deadline) body.deadline = deadline
    if (parent_id) body.parent_id = parent_id
    if (pomodor_total) body.pomodor_total = pomodor_total

    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body)
    })
    if (res.status === 401) {
      useUserStore.getState().logout()
      throw new Error('未登录')
    }
    const task = await res.json()
    get().fetchTasks()
    return task
  },

  updateTask: async (id, data) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data)
    })
    if (res.status === 401) {
      useUserStore.getState().logout()
      return
    }
    get().fetchTasks()
  },

  deleteTask: async (id) => {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    })
    if (res.status === 401) {
      useUserStore.getState().logout()
      return
    }
    get().fetchTasks()
  },

  selectTask: (task) => set({ selectedTask: task }),

  reorderTask: async (taskId, axis, newPosition) => {
    await fetch('/api/tasks/reorder', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ task_id: taskId, axis, new_position: newPosition })
    })
    get().fetchTasks()
  },

  updatePositions: async (updates) => {
    await fetch('/api/tasks/bulk-update-positions', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(updates)
    })
    get().fetchTasks()
  },

  archiveTask: async (id) => {
    await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ archived: true })
    })
    get().fetchTasks()
  },

  restoreTask: async (id) => {
    await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ archived: false })
    })
    get().fetchTasks()
    get().fetchArchivedTasks()
  },

  updateBlocks: async (taskId, blocks) => {
    // ── Optimistic update: immediately reflect in UI ──
    const prevTasks = get().tasks
    const prevGantt = get().ganttData
    const patchTask = (list: Task[]) =>
      list.map(t => t.id === taskId ? { ...t, date_blocks: blocks } : t)
    set({
      tasks: patchTask(prevTasks),
      ganttData: prevGantt
        ? { ...prevGantt, tasks: patchTask(prevGantt.tasks) }
        : prevGantt,
    })

    // ── Persist to server ──
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ date_blocks: blocks })
      })
      // Refresh from server to sync aggregated parent blocks, etc.
      await get().fetchGanttData()
    } catch {
      // Rollback on failure
      set({ tasks: prevTasks, ganttData: prevGantt })
    }
  },

  updateQuestions: async (taskId, questions) => {
    // Optimistic update
    const prev = get().tasks
    set({ tasks: prev.map(t => t.id === taskId ? { ...t, questions } : t) })
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ questions })
      })
    } catch {
      set({ tasks: prev })  // rollback
    }
  },

  updateDependencies: async (taskId, deps) => {
    const prev = get().tasks
    set({ tasks: prev.map(t => t.id === taskId ? { ...t, dependencies: deps } : t) })
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ dependencies: deps })
      })
    } catch {
      set({ tasks: prev })
    }
  },

  updateStory: async (taskId, story) => {
    const prev = get().tasks
    set({ tasks: prev.map(t => t.id === taskId ? { ...t, story } : t) })
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ story })
      })
    } catch {
      set({ tasks: prev })
    }
  },

  updateTags: async (taskId, tags) => {
    const prev = get().tasks
    set({ tasks: prev.map(t => t.id === taskId ? { ...t, tags } : t) })
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ tags })
      })
    } catch {
      set({ tasks: prev })
    }
  },

}))
