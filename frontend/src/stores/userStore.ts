import { create } from 'zustand'

interface User {
  id: string
  username: string
}

const TOKEN_KEY = 'polarclock_token'
const USER_KEY = 'polarclock_user'

// Global token for API calls - always read from localStorage directly
export const getToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY)
}

// Read initial state directly from localStorage so first render is correct
const getInitialUserState = (): User | null => {
  try {
    const userStr = localStorage.getItem(USER_KEY)
    if (userStr) return JSON.parse(userStr)
  } catch { /* ignore */ }
  return null
}

const getInitialTokenState = (): string | null => {
  return localStorage.getItem(TOKEN_KEY)
}

interface UserStore {
  user: User | null
  token: string | null
  loading: boolean
  init: () => void
  login: (username: string) => Promise<void>
  logout: () => void
}

export const useUserStore = create<UserStore>((set) => ({
  // Initialize directly from localStorage - no race with first render
  user: getInitialUserState(),
  token: getInitialTokenState(),
  loading: false,

  init: () => {
    // Re-read from localStorage to handle case where localStorage changed externally
    const token = localStorage.getItem(TOKEN_KEY)
    const userStr = localStorage.getItem(USER_KEY)

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr)
        set({ user, token, loading: false })
      } catch {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        set({ user: null, token: null, loading: false })
      }
    } else {
      set({ user: null, token: null, loading: false })
    }
  },

  login: async (username) => {
    // Try login first
    let res = await fetch('/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    })

    // If user doesn't exist, create
    if (res.status === 404) {
      res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      })
      if (!res.ok) throw new Error('创建用户失败')
      // Login again
      res = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      })
    }

    if (!res.ok) throw new Error('登录失败')

    const data = await res.json()
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(USER_KEY, JSON.stringify(data.user))
    set({ user: data.user, token: data.token })
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    set({ user: null, token: null })
  }
}))
