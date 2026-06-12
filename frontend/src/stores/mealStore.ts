import { create } from 'zustand'
import { getToken } from './userStore'

export interface MealSettings {
  breakfast_start: string
  breakfast_latest_start: string
  lunch_start: string
  lunch_latest_finish: string
  dinner_start: string
  dinner_latest_finish: string
  prep_time_minutes: number
  meal_duration_minutes: number
}

export interface MealReminder {
  type: 'breakfast' | 'lunch' | 'dinner' | 'order_food'
  due: boolean
  dueTime: string
  latestTime: string
}

interface MealStore {
  settings: MealSettings
  reminders: MealReminder[]
  fetchSettings: () => Promise<void>
  updateSettings: (settings: Partial<MealSettings>) => Promise<void>
  checkReminders: () => void
}

const defaultSettings: MealSettings = {
  breakfast_start: '08:00',
  breakfast_latest_start: '09:00',
  lunch_start: '13:00',
  lunch_latest_finish: '14:00',
  dinner_start: '19:00',
  dinner_latest_finish: '20:00',
  prep_time_minutes: 60,
  meal_duration_minutes: 60
}

const getHeaders = () => {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) {
    headers['X-Token'] = token
  }
  return headers
}

export const useMealStore = create<MealStore>((set, get) => ({
  settings: defaultSettings,
  reminders: [],

  fetchSettings: async () => {
    try {
      const res = await fetch('/api/schedule/meal-settings', { headers: getHeaders() })
      if (res.ok) {
        const data = await res.json()
        set({ settings: data })
      }
    } catch (error) {
      console.error('Failed to fetch meal settings:', error)
    }
  },

  updateSettings: async (newSettings) => {
    const current = get().settings
    const updated = {
      breakfast_start: newSettings.breakfast_start ?? current.breakfast_start,
      breakfast_latest_start: newSettings.breakfast_latest_start ?? current.breakfast_latest_start,
      lunch_start: newSettings.lunch_start ?? current.lunch_start,
      lunch_latest_finish: newSettings.lunch_latest_finish ?? current.lunch_latest_finish,
      dinner_start: newSettings.dinner_start ?? current.dinner_start,
      dinner_latest_finish: newSettings.dinner_latest_finish ?? current.dinner_latest_finish,
      prep_time_minutes: newSettings.prep_time_minutes ?? current.prep_time_minutes,
      meal_duration_minutes: newSettings.meal_duration_minutes ?? current.meal_duration_minutes
    }
    set({ settings: updated })

    await fetch('/api/schedule/meal-settings', {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(updated)
    })
  },

  checkReminders: () => {
    const { settings } = get()
    const now = new Date()
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
    const reminders: MealReminder[] = []

    // Check breakfast order reminder (1 hour before)
    const breakfastPrep = addMinutesToTime(settings.breakfast_start, -settings.prep_time_minutes)
    if (currentTime >= breakfastPrep && currentTime < settings.breakfast_start) {
      reminders.push({
        type: 'order_food',
        due: true,
        dueTime: breakfastPrep,
        latestTime: settings.breakfast_latest_start
      })
    }

    // Check lunch order reminder
    const lunchPrep = addMinutesToTime(settings.lunch_start, -settings.prep_time_minutes)
    if (currentTime >= lunchPrep && currentTime < settings.lunch_start) {
      reminders.push({
        type: 'order_food',
        due: true,
        dueTime: lunchPrep,
        latestTime: settings.lunch_latest_finish
      })
    }

    // Check dinner order reminder
    const dinnerPrep = addMinutesToTime(settings.dinner_start, -settings.prep_time_minutes)
    if (currentTime >= dinnerPrep && currentTime < settings.dinner_start) {
      reminders.push({
        type: 'order_food',
        due: true,
        dueTime: dinnerPrep,
        latestTime: settings.dinner_latest_finish
      })
    }

    set({ reminders })
  }
}))

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const totalMinutes = h * 60 + m + minutes
  const newH = ((Math.floor(totalMinutes / 60) % 24) + 24) % 24
  const newM = ((totalMinutes % 60) + 60) % 60
  return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`
}
