import { getToken } from '../stores/userStore'

const QUEUE_KEY = 'polarclock_sync_queue'
const STATE_CACHE_KEY = 'polarclock_timer_cache'

interface QueuedRequest {
  id: string
  url: string
  method: string
  body?: string
  timestamp: number
}

function loadQueue(): QueuedRequest[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function saveQueue(queue: QueuedRequest[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
}

export function enqueueRequest(url: string, method: string, body?: string) {
  const queue = loadQueue()
  queue.push({ id: crypto.randomUUID(), url, method, body, timestamp: Date.now() })
  saveQueue(queue)
}

export function cacheTimerState(state: Record<string, unknown>) {
  try {
    localStorage.setItem(STATE_CACHE_KEY, JSON.stringify({
      ...state,
      _cachedAt: Date.now(),
    }))
  } catch { /* quota exceeded, ignore */ }
}

export function loadCachedTimerState(): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(STATE_CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw)
    const age = Date.now() - (cached._cachedAt ?? 0)
    if (age > 24 * 60 * 60 * 1000) return null
    delete cached._cachedAt
    return cached
  } catch {
    return null
  }
}

export function isOnline(): boolean {
  return navigator.onLine
}

let flushInProgress = false

export async function flushQueue(): Promise<number> {
  if (flushInProgress || !isOnline()) return 0
  flushInProgress = true

  const queue = loadQueue()
  if (queue.length === 0) {
    flushInProgress = false
    return 0
  }

  let flushed = 0
  const remaining: QueuedRequest[] = []
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['X-Token'] = token

  for (const req of queue) {
    if (Date.now() - req.timestamp > 2 * 60 * 60 * 1000) {
      flushed++
      continue
    }
    try {
      const opts: RequestInit = { method: req.method, headers }
      if (req.body) opts.body = req.body
      const res = await fetch(req.url, opts)
      if (res.ok || res.status === 409 || res.status === 400) {
        flushed++
      } else {
        remaining.push(req)
      }
    } catch {
      remaining.push(req)
      break
    }
  }

  saveQueue(remaining)
  flushInProgress = false
  return flushed
}

let listenersBound = false

export function setupOnlineSync(onOnline?: () => void) {
  if (listenersBound) return
  listenersBound = true

  window.addEventListener('online', () => {
    flushQueue()
    onOnline?.()
  })
}
