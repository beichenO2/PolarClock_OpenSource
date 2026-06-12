import { FlipDigit } from './FlipDigit'

interface FlipClockProps {
  seconds: number
  cardW?: number   // CSS px per digit card
  cardH?: number
  gap?: number
  variant?: 'dark' | 'light'
}

export function FlipClock({ seconds, cardW = 72, cardH = 96, gap = 8, variant = 'dark' }: FlipClockProps) {
  const h  = Math.floor(seconds / 3600)
  const m  = Math.floor((seconds % 3600) / 60)
  const s  = seconds % 60

  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const mm  = pad(m)
  const ss  = pad(s)
  const hh  = h > 0 ? pad(h) : null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap }}>
      {hh && (
        <>
          <FlipDigit char={hh[0]} w={cardW} h={cardH} variant={variant} />
          <FlipDigit char={hh[1]} w={cardW} h={cardH} variant={variant} />
          <FlipDigit char=':'    w={cardW} h={cardH} variant={variant} />
        </>
      )}
      <FlipDigit char={mm[0]} w={cardW} h={cardH} variant={variant} />
      <FlipDigit char={mm[1]} w={cardW} h={cardH} variant={variant} />
      <FlipDigit char=':'    w={cardW} h={cardH} variant={variant} />
      <FlipDigit char={ss[0]} w={cardW} h={cardH} variant={variant} />
      <FlipDigit char={ss[1]} w={cardW} h={cardH} variant={variant} />
    </div>
  )
}
