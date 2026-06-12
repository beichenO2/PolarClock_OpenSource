import { create } from 'zustand'
import { getToken } from './userStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RecurringRule {
  id: string
  name: string
  day_of_week: number     // 0=Mon … 6=Sun
  start_hhmm: string      // "09:00"
  end_hhmm: string        // "10:30"
  effective_from: string  // "2026-03-31" ISO date
  effective_until: string | null  // null = forever
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const getHeaders = () => {
  const token = getToken()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['X-Token'] = token
  return headers
}

/** Get ISO date string for Monday of the week containing `d`. */
export function getWeekMonday(d: Date): string {
  const dd = new Date(d)
  const day = dd.getDay()  // 0=Sun, 1=Mon …
  const diff = (day === 0 ? -6 : 1 - day)  // days to subtract to reach Monday
  dd.setDate(dd.getDate() + diff)
  dd.setHours(0, 0, 0, 0)
  return dd.toISOString().split('T')[0]
}

/** Return the ISO date string for the day before `isoDate`. */
export function prevDay(isoDate: string): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

/** Check if a rule applies to a specific date. */
export function ruleAppliesOn(rule: RecurringRule, isoDate: string): boolean {
  if (rule.effective_from > isoDate) return false
  if (rule.effective_until !== null && rule.effective_until < isoDate) return false
  return true
}

/** Get JS weekday integer for an ISO date string (0=Mon … 6=Sun). */
export function isoDateDow(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00')
  const jsDay = d.getDay()  // 0=Sun
  return jsDay === 0 ? 6 : jsDay - 1  // convert to 0=Mon
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface ScheduleStore {
  rules: RecurringRule[]
  fetchRules: () => Promise<void>
  createRule: (name: string, dayOfWeek: number, startHHMM: string, endHHMM: string, effectiveFrom: string) => Promise<RecurringRule>
  updateRule: (id: string, patch: Partial<Pick<RecurringRule, 'name' | 'start_hhmm' | 'end_hhmm' | 'effective_until'>>) => Promise<RecurringRule>
  deleteRule: (id: string) => Promise<void>
  splitRule: (id: string, weekMonday: string, newStartHHMM: string, newEndHHMM: string, newName?: string) => Promise<RecurringRule>
  endRule: (id: string, weekMonday: string) => Promise<void>  // set effective_until = day before weekMonday

  // Helper: resolve rules that apply on a given ISO date
  getRulesForDate: (isoDate: string) => RecurringRule[]
}

export const useScheduleStore = create<ScheduleStore>((set, get) => ({
  rules: [],

  fetchRules: async () => {
    try {
      const res = await fetch('/api/schedule/rules', { headers: getHeaders() })
      if (res.ok) {
        const rules: RecurringRule[] = await res.json()
        set({ rules })
      }
    } catch (e) {
      console.error('fetchRules:', e)
    }
  },

  createRule: async (name, dayOfWeek, startHHMM, endHHMM, effectiveFrom) => {
    const res = await fetch('/api/schedule/rules', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        name,
        day_of_week: dayOfWeek,
        start_hhmm: startHHMM,
        end_hhmm: endHHMM,
        effective_from: effectiveFrom,
      }),
    })
    const rule: RecurringRule = await res.json()
    await get().fetchRules()
    return rule
  },

  updateRule: async (id, patch) => {
    const res = await fetch(`/api/schedule/rules/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(patch),
    })
    const rule: RecurringRule = await res.json()
    await get().fetchRules()
    return rule
  },

  deleteRule: async (id) => {
    await fetch(`/api/schedule/rules/${id}`, { method: 'DELETE', headers: getHeaders() })
    await get().fetchRules()
  },

  splitRule: async (id, weekMonday, newStartHHMM, newEndHHMM, newName) => {
    const res = await fetch(`/api/schedule/rules/${id}/split`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        week_monday: weekMonday,
        new_start_hhmm: newStartHHMM,
        new_end_hhmm: newEndHHMM,
        new_name: newName ?? null,
      }),
    })
    const newRule: RecurringRule = await res.json()
    await get().fetchRules()
    return newRule
  },

  endRule: async (id, weekMonday) => {
    // Set effective_until to day before weekMonday (rule stops applying after last week)
    await get().updateRule(id, { effective_until: prevDay(weekMonday) })
  },

  getRulesForDate: (isoDate) => {
    const dow = isoDateDow(isoDate)
    return get().rules.filter(r => r.day_of_week === dow && ruleAppliesOn(r, isoDate))
  },
}))
