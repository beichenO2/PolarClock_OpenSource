import { create } from 'zustand'

type Theme = 'light' | 'dark'
const STORAGE_KEY = 'polarclock-theme'

function getSystemPreference(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null
    if (stored === 'light' || stored === 'dark') return stored
  } catch {}
  return getSystemPreference()
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

interface ThemeStore {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

export const useThemeStore = create<ThemeStore>((set, get) => {
  const initial = getInitialTheme()
  applyTheme(initial)

  return {
    theme: initial,

    toggle: () => {
      const next = get().theme === 'light' ? 'dark' : 'light'
      applyTheme(next)
      localStorage.setItem(STORAGE_KEY, next)
      set({ theme: next })
    },

    setTheme: (t: Theme) => {
      applyTheme(t)
      localStorage.setItem(STORAGE_KEY, t)
      set({ theme: t })
    },
  }
})
