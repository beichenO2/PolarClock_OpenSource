import { useLocation, Link } from 'react-router-dom'
import { useSwipeNav } from '../hooks/useSwipeNav'
import { useEffect, useRef, useState, useCallback } from 'react'
import { useMealStore } from '../stores/mealStore'
import { useThemeStore } from '../stores/themeStore'
import { useTranslation } from 'react-i18next'
import InstallPrompt from './InstallPrompt'
import ServiceWorkerUpdatePrompt from './ServiceWorkerUpdatePrompt'
import CommandPalette from './CommandPalette'
import MiniTimer from './MiniTimer'

const PAGES = ['timer', 'stats', 'tasks', 'schedule', 'feed', 'settings']

const PAGE_ICONS: Record<string, string> = {
  timer: '⏱', stats: '📊', tasks: '✓',
  schedule: '📅', feed: '📰', settings: '⚙'
}

// ── Meal reminder helpers ─────────────────────────────────────────────────────

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function nowMinutes(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

function formatMealName(type: string): string {
  return type === 'breakfast' ? '早餐' : type === 'lunch' ? '午餐' : '晚餐'
}

function playBell() {
  try { new Audio('/bell.mp3').play() } catch {}
}

const SESSION_KEY_ORDER = 'meal_notified_order'
const SESSION_KEY_EAT   = 'meal_notified_eat'

function getNotified(key: string): string[] {
  try { return JSON.parse(sessionStorage.getItem(key) ?? '[]') } catch { return [] }
}
function setNotified(key: string, list: string[]) {
  sessionStorage.setItem(key, JSON.stringify(list))
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  useSwipeNav()
  const { theme, toggle: toggleTheme } = useThemeStore()
  const { t, i18n } = useTranslation()
  const PAGE_LABELS: Record<string, string> = {
    timer: t('nav.timer'), stats: t('nav.stats'), tasks: t('nav.tasks'),
    schedule: t('nav.schedule'), feed: t('nav.feed'), settings: t('nav.settings'),
  }
  const toggleLang = () => i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh')

  const { settings, fetchSettings } = useMealStore()
  // ── Meal reminder state ───────────────────────────────────────────────────
  const [orderToast, setOrderToast] = useState<{ meal: string; mealName: string } | null>(null)
  const [mealAlert, setMealAlert] = useState<{ meal: string; mealName: string } | null>(null)
  const [mealTimer, setMealTimer] = useState<{ secsLeft: number; running: boolean } | null>(null)
  const mealIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { fetchSettings() }, [fetchSettings])

  // ── Per-minute meal check ─────────────────────────────────────────────────
  const checkMeals = useCallback(() => {
    const now = nowMinutes()
    const meals = [
      { key: 'breakfast', start: timeToMinutes(settings.breakfast_start) },
      { key: 'lunch',     start: timeToMinutes(settings.lunch_start) },
      { key: 'dinner',    start: timeToMinutes(settings.dinner_start) },
    ]
    const notifiedOrder = getNotified(SESSION_KEY_ORDER)
    const notifiedEat   = getNotified(SESSION_KEY_EAT)

    for (const meal of meals) {
      const orderTime = meal.start - 30  // 30 min before
      // Order reminder: fire within the same minute window
      if (
        now >= orderTime && now < orderTime + 1 &&
        !notifiedOrder.includes(meal.key)
      ) {
        playBell()
        setNotified(SESSION_KEY_ORDER, [...notifiedOrder, meal.key])
        setOrderToast({ meal: meal.key, mealName: formatMealName(meal.key) })
        setTimeout(() => setOrderToast(null), 8000)
      }

      // Eat reminder: fire within the same minute window
      if (
        now >= meal.start && now < meal.start + 1 &&
        !notifiedEat.includes(meal.key)
      ) {
        playBell()
        setNotified(SESSION_KEY_EAT, [...notifiedEat, meal.key])
        setMealAlert({ meal: meal.key, mealName: formatMealName(meal.key) })
      }
    }
  }, [settings])

  useEffect(() => {
    checkMeals()
    checkIntervalRef.current = setInterval(checkMeals, 60_000)
    return () => { if (checkIntervalRef.current) clearInterval(checkIntervalRef.current) }
  }, [checkMeals])

  // ── 60-min meal countdown ─────────────────────────────────────────────────
  const startMealTimer = () => {
    setMealAlert(null)
    setMealTimer({ secsLeft: 60 * 60, running: true })
  }

  useEffect(() => {
    if (!mealTimer?.running) return
    mealIntervalRef.current = setInterval(() => {
      setMealTimer(prev => {
        if (!prev) return null
        if (prev.secsLeft <= 1) {
          playBell()
          return { secsLeft: 0, running: false }
        }
        return { ...prev, secsLeft: prev.secsLeft - 1 }
      })
    }, 1000)
    return () => { if (mealIntervalRef.current) clearInterval(mealIntervalRef.current) }
  }, [mealTimer?.running])

  const fmtTimer = (s: number) => {
    const m = Math.floor(s / 60), sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  const currentPage = PAGES.find(p =>
    location.pathname === `/clock/${p}` || location.pathname.startsWith(`/clock/${p}/`)
  ) || 'tasks'
  const currentIndex = PAGES.indexOf(currentPage)

  const isTimerPage = currentPage === 'timer'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)' }}>

      <div className="page-indicator">
        {currentIndex >= 0 ? currentIndex + 1 : '?'} / {PAGES.length}
      </div>

      {/* Theme + Language toggles */}
      <div style={{
        position: 'fixed', top: '0.5rem', right: '0.75rem', zIndex: 60,
        display: 'flex', gap: 6, paddingTop: 'env(safe-area-inset-top)',
      }}>
        <button
          onClick={toggleLang}
          aria-label="Switch language"
          style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--color-overlay)', border: '1px solid var(--color-border)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.65rem', fontWeight: 700, lineHeight: 1, color: 'var(--color-text-muted)',
            transition: 'background 0.2s, border-color 0.2s',
          }}
        >{i18n.language === 'zh' ? 'EN' : '中'}</button>
        <button
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--color-overlay)', border: '1px solid var(--color-border)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.9rem', lineHeight: 1,
            transition: 'background 0.2s, border-color 0.2s',
          }}
        >{theme === 'dark' ? '☀️' : '🌙'}</button>
      </div>

      {/* Page content */}
      <main style={isTimerPage ? {} : { paddingBottom: '5rem' }}>
        {children}
      </main>

      {/* Nav */}
      <nav className="nav-bar" style={isTimerPage ? { zIndex: 200 } : {}}>
        {PAGES.map(p => (
          <Link
            key={p}
            to={`/clock/${p}`}
            className={`nav-item ${currentPage === p ? 'active' : ''}`}
          >
            <span className="nav-icon">{PAGE_ICONS[p]}</span>
            <span className="nav-label">{PAGE_LABELS[p]}</span>
          </Link>
        ))}
      </nav>

      {/* ── Order Toast (top-right banner) ── */}
      {orderToast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 400,
          background: 'var(--color-warning-tint)', border: '1px solid var(--color-warning)',
          borderRadius: 12, padding: '12px 16px', maxWidth: 280,
          boxShadow: 'var(--shadow-md)',
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'slideInRight 0.3s ease',
        }}>
          <span style={{ fontSize: '1.2rem' }}>📦</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-warning)' }}>
              {orderToast.mealName}前30分钟
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-warning)', marginTop: 2, opacity: 0.8 }}>
              快去点外卖！
            </div>
          </div>
          <button
            onClick={() => setOrderToast(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-border-strong)', fontSize: 14 }}
          >✕</button>
        </div>
      )}

      {/* ── Meal Alert Modal ── */}
      {mealAlert && !mealTimer && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 450,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--color-card)', borderRadius: 20, padding: '32px 28px', maxWidth: 320, width: '90%',
            boxShadow: 'var(--shadow-lg)', textAlign: 'center',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>🍽️</div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8, color: 'var(--color-text)' }}>
              {mealAlert.mealName}时间到！
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 24 }}>
              开始 60 分钟吃饭计时？
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                onClick={startMealTimer}
                style={{
                  padding: '10px 24px', background: '#F59E0B', color: '#fff',
                  border: 'none', borderRadius: 12, cursor: 'pointer',
                  fontWeight: 700, fontSize: '0.9rem',
                }}
              >开始计时 (60min)</button>
              <button
                onClick={() => setMealAlert(null)}
                style={{
                  padding: '10px 18px', background: 'var(--color-overlay)', color: 'var(--color-text-muted)',
                  border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: '0.85rem',
                }}
              >跳过</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Meal Timer Overlay ── */}
      {mealTimer && (
        <div style={{
          position: 'fixed', bottom: 80, right: 16, zIndex: 400,
          background: mealTimer.secsLeft === 0 ? 'var(--color-warning-tint)' : 'var(--color-card)',
          border: '1.5px solid var(--color-warning)', borderRadius: 16, padding: '14px 18px',
          boxShadow: 'var(--shadow-md)', minWidth: 180,
          transition: 'background 0.5s',
        }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-faint)', marginBottom: 4 }}>
            🍽️ {mealTimer.secsLeft === 0 ? '吃饭时间结束！' : '吃饭倒计时'}
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#F59E0B', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            {fmtTimer(mealTimer.secsLeft)}
          </div>
          <button
            onClick={() => { setMealTimer(null); if (mealIntervalRef.current) clearInterval(mealIntervalRef.current) }}
            style={{
              marginTop: 8, width: '100%', padding: '6px', background: 'var(--color-overlay)',
              color: 'var(--color-text-muted)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.75rem',
            }}
          >{mealTimer.secsLeft === 0 ? '关闭' : '已吃完'}</button>
        </div>
      )}

      <ServiceWorkerUpdatePrompt />
      <InstallPrompt />
      <CommandPalette />
      <MiniTimer />

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(20px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}