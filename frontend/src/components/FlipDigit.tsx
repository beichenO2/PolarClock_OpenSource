/**
 * FlipDigit — Canvas-based single flip-clock card.
 * Uses ctx.scale(1, v) to simulate physical plate rotation (same technique as flipflow.neverup.cn)
 */
import { useEffect, useRef } from 'react'

const THEMES = {
  dark: {
    bgTop: '#1f1e23', bgBottom: '#0e0d11',
    text: '#D0D0D0', textRgb: '208,208,208',
    divider: '#000', colonDot: 'rgba(210,210,210,0.35)',
    shadowMul: 1,
  },
  light: {
    bgTop: '#C8DED9', bgBottom: '#B5D1CB',
    text: '#1B5E50', textRgb: '27,94,80',
    divider: '#A8C4BD', colonDot: 'rgba(27,94,80,0.3)',
    shadowMul: 0.35,
  },
} as const

interface FlipDigitProps {
  char: string   // '0'-'9' or ':'
  w: number      // CSS px width
  h: number      // CSS px height
  variant?: 'dark' | 'light'
}

export function FlipDigit({ char, w, h, variant = 'dark' }: FlipDigitProps) {
  const theme = THEMES[variant]
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const prevRef   = useRef(char)
  const rafRef    = useRef(0)

  // Canvas drawing effect — runs only for digit characters (not ':')
  useEffect(() => {
    if (char === ':') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio ?? 1, 2)
    const cw  = w * dpr
    const ch  = h * dpr
    canvas.width  = cw
    canvas.height = ch

    const prev = prevRef.current
    const curr = char
    const DURATION = 540

    // ── BUG FIX: Update prevRef BEFORE starting animation, not at end.
    // If a new char arrives before this animation completes, the effect cleanup
    // cancels the RAF. With the old code, prevRef would never be updated for
    // the cancelled animation, causing the next animation to start from a stale
    // prev value — making some digits appear to flip in the wrong direction.
    prevRef.current = curr

    function drawFrame(progress: number) {
      const cx = cw / 2
      const cy = ch / 2
      const radius = cw * 0.09

      ctx.clearRect(0, 0, cw, ch)

      // ── Background (rounded card) ──
      ctx.save()
      ctx.beginPath()
      ctx.roundRect(0, 0, cw, ch, radius)
      ctx.clip()

      const bg = ctx.createLinearGradient(0, 0, 0, ch)
      bg.addColorStop(0, theme.bgTop)
      bg.addColorStop(1, theme.bgBottom)
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, cw, ch)

      const fs = ch * 0.695
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `800 ${fs}px "SF Pro Display","Helvetica Neue",Arial,sans-serif`

      // ── Bottom half — shows prev during phase 1, switches to curr at midpoint ──
      // FIX: removed "progress > 0 &&" — at progress=0 the bottom should also show prev,
      // not curr (which caused a 1-frame flash of the new digit at animation start).
      const bottomChar = progress < 0.5 ? prev : curr
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, cy, cw, cy)
      ctx.clip()
      ctx.fillStyle = theme.text
      ctx.fillText(bottomChar, cx, cy)  // text at card center; clip reveals only bottom half
      ctx.restore()

      // ── Top half — animated ──
      let scaleY: number
      let topChar: string

      if (progress <= 0) {
        // FIX: was `topChar = curr` — flashed new digit for 1 frame before animation
        scaleY = 1; topChar = prev
      } else if (progress < 0.5) {
        scaleY  = 1 - progress * 2   // 1 → 0  (fold away)
        topChar = prev
      } else {
        scaleY  = (progress - 0.5) * 2  // 0 → 1  (unfold in)
        topChar = curr
      }

      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, cw, cy)
      ctx.clip()
      // Pivot scaleY around center line (cy)
      ctx.translate(0, cy)
      ctx.scale(1, scaleY)
      ctx.translate(0, -cy)
      ctx.fillStyle = `rgba(${theme.textRgb},${Math.max(0.03, Math.abs(scaleY))})`
      ctx.fillText(topChar, cx, cy)  // text at card center; scaleY + clip reveals only top half
      ctx.restore()

      // Directional shadow — forward fold: hinge (center line) dark, top edge stays bright
      if (progress > 0.01) {
        const phase1 = progress < 0.5 ? progress * 2 : 0
        const phase2 = progress >= 0.5 ? (progress - 0.5) * 2 : 0

        ctx.save()
        ctx.beginPath()
        ctx.rect(0, 0, cw, cy)
        ctx.clip()

        const sg = ctx.createLinearGradient(0, 0, 0, cy)
        const sm = theme.shadowMul
        if (phase1 > 0) {
          sg.addColorStop(0, `rgba(0,0,0,${phase1 * 0.12 * sm})`)
          sg.addColorStop(1, `rgba(0,0,0,${phase1 * 0.72 * sm})`)
        } else {
          sg.addColorStop(0, `rgba(0,0,0,${(1 - phase2) * 0.10 * sm})`)
          sg.addColorStop(1, `rgba(0,0,0,${(1 - phase2) * 0.55 * sm})`)
        }
        ctx.fillStyle = sg
        ctx.fillRect(0, 0, cw, cy)
        ctx.restore()
      }

      // ── Divider ──
      ctx.fillStyle = theme.divider
      ctx.fillRect(0, cy - 1, cw, 2)

      ctx.restore() // end rounded clip
    }

    if (prev === curr) {
      drawFrame(0)
      return
    }

    cancelAnimationFrame(rafRef.current)
    const startMs = performance.now()

    const animate = (now: number) => {
      const raw = Math.min((now - startMs) / DURATION, 1)
      const t = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2
      drawFrame(t)
      if (raw < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
      // prevRef.current is already updated before animation start — no update needed here
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [char, w, h, variant, theme])

  // Separator — two dots (no canvas, pure div)
  if (char === ':') {
    const dot = w * 0.14
    return (
      <div style={{
        width: w * 0.42, height: h,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'space-around',
        paddingBlock: '22%', flexShrink: 0,
      }}>
        <div style={{ width: dot, height: dot, borderRadius: '50%', background: theme.colonDot }} />
        <div style={{ width: dot, height: dot, borderRadius: '50%', background: theme.colonDot }} />
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      width={w * 2}
      height={h * 2}
      style={{ width: w, height: h, display: 'block', flexShrink: 0 }}
    />
  )
}
