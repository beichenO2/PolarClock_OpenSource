import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const PAGES = ['timer', 'stats', 'tasks', 'schedule', 'feed', 'settings']
const PAGE_ROUTES: Record<string, string> = {
  timer: '/clock/timer',
  stats: '/clock/stats',
  tasks: '/clock/tasks',
  schedule: '/clock/schedule',
  feed: '/clock/feed',
  settings: '/clock/settings'
}

interface SwipeState {
  startX: number
  startY: number
  startTime: number
}

/**
 * Hook for touch swipe navigation between pages.
 * Swipe left → next page, swipe right → previous page.
 * Minimum 80px horizontal swipe with < 300ms duration.
 */
export function useSwipeNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const swipeRef = useRef<SwipeState | null>(null)

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      swipeRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now()
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!swipeRef.current) return

      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - swipeRef.current.startX
      const deltaY = touch.clientY - swipeRef.current.startY
      const elapsed = Date.now() - swipeRef.current.startTime

      // Must be primarily horizontal, fast enough, and long enough
      if (Math.abs(deltaX) > 80 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && elapsed < 400) {
        const currentPath = location.pathname
        const currentIndex = PAGES.findIndex(p => PAGE_ROUTES[p] === currentPath)
        if (currentIndex === -1) return

        if (deltaX < 0) {
          // Swipe left → next page
          const nextIndex = (currentIndex + 1) % PAGES.length
          navigate(PAGE_ROUTES[PAGES[nextIndex]])
        } else {
          // Swipe right → previous page
          const prevIndex = (currentIndex - 1 + PAGES.length) % PAGES.length
          navigate(PAGE_ROUTES[PAGES[prevIndex]])
        }
      }

      swipeRef.current = null
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [navigate, location.pathname])
}
