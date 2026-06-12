import { getToken } from '../stores/userStore'

let currentAudio: HTMLAudioElement | null = null

const BASE = import.meta.env.BASE_URL || '/'

let lastMusic: { path: string; startSeconds: number } | null = null

function resolveAudioUrl(relativePath: string): string {
  const base = new URL(BASE, window.location.origin)
  return new URL(relativePath.replace(/^\//, ''), base).href
}

export function unlockAudioForSession(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    void ctx.resume()
    ctx.close()
  } catch {
    /* ignore */
  }
}

// ── Sound preference cache ──────────────────────────────────────────────────

interface SoundPrefs {
  work_end_sound: string
  rest_end_sound: string
  meditation_end_sound: string
  volume: number
}

const DEFAULT_PREFS: SoundPrefs = {
  work_end_sound: 'default',
  rest_end_sound: 'default',
  meditation_end_sound: 'default',
  volume: 100,
}

let _cachedPrefs: SoundPrefs | null = null
let _prefsFetchedAt = 0
const PREFS_CACHE_MS = 30_000

export async function fetchSoundPrefs(): Promise<SoundPrefs> {
  if (_cachedPrefs && Date.now() - _prefsFetchedAt < PREFS_CACHE_MS) {
    return _cachedPrefs
  }
  try {
    const token = getToken()
    const headers: Record<string, string> = {}
    if (token) headers['X-Token'] = token
    const res = await fetch('/api/timer/sound-preferences', { headers })
    if (res.ok) {
      _cachedPrefs = await res.json()
      _prefsFetchedAt = Date.now()
      return _cachedPrefs!
    }
  } catch {
    /* fall through */
  }
  return _cachedPrefs ?? DEFAULT_PREFS
}

export function invalidateSoundPrefsCache(): void {
  _cachedPrefs = null
  _prefsFetchedAt = 0
}

// ── Builtin sound file map ──────────────────────────────────────────────────

const BUILTIN_FILES: Record<string, Record<string, { path: string; startSeconds: number }>> = {
  work: {
    default: { path: 'sounds/work-end.mp3', startSeconds: 0 },
    bell:    { path: 'sounds/work-end.mp3', startSeconds: 0 },
    chime:   { path: 'sounds/work-end.mp3', startSeconds: 0 },
    gentle:  { path: 'sounds/work-end.mp3', startSeconds: 0 },
  },
  rest: {
    default: { path: 'sounds/rest-end.mp3', startSeconds: 0 },
    bell:    { path: 'sounds/rest-end.mp3', startSeconds: 0 },
    chime:   { path: 'sounds/rest-end.mp3', startSeconds: 0 },
    gentle:  { path: 'sounds/rest-end.mp3', startSeconds: 0 },
  },
  meditation: {
    default: { path: 'sounds/meditation-end.mp3', startSeconds: 47 },
    bell:    { path: 'sounds/meditation-end.mp3', startSeconds: 47 },
    chime:   { path: 'sounds/meditation-end.mp3', startSeconds: 47 },
    gentle:  { path: 'sounds/meditation-end.mp3', startSeconds: 47 },
  },
}

type SoundScene = 'work' | 'rest' | 'meditation'

function resolveSound(scene: SoundScene, soundId: string): { url: string; startSeconds: number } | null {
  if (soundId === 'none') return null

  if (soundId.startsWith('custom_')) {
    const filename = soundId.slice('custom_'.length)
    const token = getToken()
    const url = `/api/timer/sounds/custom/${encodeURIComponent(filename)}${token ? `?token=${token}` : ''}`
    return { url, startSeconds: 0 }
  }

  const entry = BUILTIN_FILES[scene]?.[soundId] ?? BUILTIN_FILES[scene]?.['default']
  if (!entry) return null
  return { url: resolveAudioUrl(entry.path), startSeconds: entry.startSeconds }
}

// ── Core playback ───────────────────────────────────────────────────────────

function playMusic(url: string, startSeconds: number, volume: number): Promise<boolean> {
  stopMusic()
  lastMusic = { path: url, startSeconds }

  const audio = new Audio()
  audio.preload = 'auto'
  audio.volume = Math.max(0, Math.min(1, volume / 100))
  audio.setAttribute('playsinline', 'true')
  audio.setAttribute('webkit-playsinline', 'true')
  currentAudio = audio
  audio.src = url

  audio.addEventListener('ended', () => {
    if (currentAudio === audio) {
      audio.currentTime = startSeconds
      void audio.play().catch(() => {})
    }
  })

  return new Promise((resolve) => {
    let settled = false
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer)
      resolve(ok)
    }

    let attemptDone = false
    const tryPlayAfterLoad = () => {
      if (attemptDone) return
      attemptDone = true
      let seek = startSeconds
      if (seek > 0 && audio.duration > 0 && seek >= audio.duration) {
        seek = 0
      }
      try {
        audio.currentTime = seek
      } catch {
        /* ignore */
      }
      void audio
        .play()
        .then(() => finish(true))
        .catch(() => finish(false))
    }

    audio.addEventListener(
      'error',
      () => {
        console.error('[sounds] audio load error', url, audio.error)
        finish(false)
      },
      { once: true },
    )

    audio.addEventListener('loadedmetadata', tryPlayAfterLoad, { once: true })
    audio.addEventListener('canplay', tryPlayAfterLoad, { once: true })
    fallbackTimer = window.setTimeout(() => {
      if (!settled) tryPlayAfterLoad()
    }, 2000)
    audio.load()
  })
}

/**
 * Unified entry: resolve user preference for the scene, then play.
 * Falls back to hardcoded defaults if preference fetch fails.
 */
export async function playSceneEndSound(scene: SoundScene): Promise<boolean> {
  const prefs = await fetchSoundPrefs()
  const prefKey = scene === 'work' ? 'work_end_sound'
    : scene === 'rest' ? 'rest_end_sound'
    : 'meditation_end_sound'
  const soundId = prefs[prefKey] || 'default'
  const volume = prefs.volume ?? 100

  const resolved = resolveSound(scene, soundId)
  if (!resolved) return true

  return playMusic(resolved.url, resolved.startSeconds, volume)
}

export function playWorkEndMusic(): Promise<boolean> {
  return playSceneEndSound('work')
}

export function playMeditationEndMusic(): Promise<boolean> {
  return playSceneEndSound('meditation')
}

export function playRestEndMusic(): Promise<boolean> {
  return playSceneEndSound('rest')
}

export function retryLastEndMusic(): Promise<boolean> {
  if (!lastMusic) return Promise.resolve(false)
  const prefs = _cachedPrefs ?? DEFAULT_PREFS
  return playMusic(lastMusic.path, lastMusic.startSeconds, prefs.volume ?? 100)
}

export function stopMusic(): void {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.src = ''
    currentAudio.load()
    currentAudio = null
  }
}

export function isMusicPlaying(): boolean {
  return currentAudio !== null && !currentAudio.paused
}

/**
 * Preview a specific sound by ID for a given scene.
 * Used by Settings page for try-listen.
 */
export function previewSoundById(soundId: string, scene: SoundScene = 'work', volume = 100): Promise<boolean> {
  const resolved = resolveSound(scene, soundId)
  if (!resolved) return Promise.resolve(true)
  return playMusic(resolved.url, resolved.startSeconds, volume)
}

// ── Transition chimes (Web Audio API) ───────────────────────────────────────

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume()
  }
  return audioCtx
}

function createBellTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  volume = 0.25,
) {
  const partials = [
    { ratio: 1, gain: 1.0 },
    { ratio: 2, gain: 0.4 },
    { ratio: 3, gain: 0.15 },
    { ratio: 4.5, gain: 0.08 },
  ]

  for (const { ratio, gain: pGain } of partials) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq * ratio, startTime)

    const peak = volume * pGain
    g.gain.setValueAtTime(0, startTime)
    g.gain.linearRampToValueAtTime(peak, startTime + 0.01)
    g.gain.exponentialRampToValueAtTime(peak * 0.3, startTime + duration * 0.3)
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

    osc.connect(g)
    g.connect(ctx.destination)
    osc.start(startTime)
    osc.stop(startTime + duration)
  }
}

export function playTransitionChime(type: 'work-end' | 'rest-end' | 'exercise-phase' | 'shower-start' | 'shower-end' = 'work-end') {
  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime

    if (type === 'work-end') {
      createBellTone(ctx, 659.25, now, 0.5, 0.25)
      createBellTone(ctx, 523.25, now + 0.25, 0.5, 0.25)
      createBellTone(ctx, 659.25, now + 0.7, 0.5, 0.25)
      createBellTone(ctx, 523.25, now + 0.95, 0.7, 0.25)
    } else if (type === 'rest-end') {
      createBellTone(ctx, 523.25, now, 0.5, 0.2)
      createBellTone(ctx, 659.25, now + 0.3, 0.7, 0.2)
    } else if (type === 'exercise-phase') {
      createBellTone(ctx, 392.0, now, 0.4, 0.2)
      createBellTone(ctx, 493.88, now + 0.25, 0.4, 0.2)
      createBellTone(ctx, 587.33, now + 0.5, 0.6, 0.2)
    } else if (type === 'shower-start') {
      createBellTone(ctx, 659.25, now, 0.4, 0.15)
      createBellTone(ctx, 523.25, now + 0.3, 0.4, 0.15)
      createBellTone(ctx, 440.0, now + 0.6, 0.5, 0.15)
    } else if (type === 'shower-end') {
      createBellTone(ctx, 523.25, now, 0.4, 0.2)
      createBellTone(ctx, 659.25, now + 0.25, 0.4, 0.2)
      createBellTone(ctx, 783.99, now + 0.5, 0.6, 0.25)
    }
  } catch {
    try {
      new Audio(resolveAudioUrl('bell.mp3')).play().catch(() => {})
    } catch {
      /* no audio support */
    }
  }
}
