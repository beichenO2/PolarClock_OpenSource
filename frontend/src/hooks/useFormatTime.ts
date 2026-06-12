/**
 * Shared time formatting utility
 */
export function formatTimeDisplay(seconds: number): { h: string | null; m: string; s: string } {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return {
      h: h.toString().padStart(2, '0'),
      m: m.toString().padStart(2, '0'),
      s: s.toString().padStart(2, '0')
    }
  }
  return {
    h: null,
    m: m.toString().padStart(2, '0'),
    s: s.toString().padStart(2, '0')
  }
}

export function formatTimeString(seconds: number): string {
  const { h, m, s } = formatTimeDisplay(seconds)
  if (h) return `${h}:${m}:${s}`
  return `${m}:${s}`
}
