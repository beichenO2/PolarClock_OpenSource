import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, lazy, Suspense } from 'react'
import Login from './pages/Login'
import Timer from './pages/Timer'
import Layout from './components/Layout'
import { useUserStore } from './stores/userStore'

const Stats = lazy(() => import('./pages/Stats'))
const Tasks = lazy(() => import('./pages/Tasks'))
const TaskDetail = lazy(() => import('./pages/TaskDetail'))
const Schedule = lazy(() => import('./pages/Schedule'))
const Feed = lazy(() => import('./pages/Feed'))
const Settings = lazy(() => import('./pages/Settings'))

function PageFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <span style={{ color: 'var(--color-text-faint)', fontSize: '0.9rem' }}>加载中…</span>
    </div>
  )
}

const PAGES = ['timer', 'stats', 'tasks', 'schedule', 'feed', 'settings']
const PAGE_ROUTES: Record<string, string> = {
  timer: '/clock/timer',
  stats: '/clock/stats',
  tasks: '/clock/tasks',
  schedule: '/clock/schedule',
  feed: '/clock/feed',
  settings: '/clock/settings'
}

function KeyboardNav() {
  const navigate = useNavigate()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is inside an input/textarea
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return

      const currentPath = window.location.pathname
      const dir = e.key === 'ArrowRight' ? 'right' : 'left'

      // On tasks page: delegate to Tasks component via CustomEvent
      if (currentPath === '/clock/tasks') {
        window.dispatchEvent(new CustomEvent('tasks-sub-nav', { detail: { dir } }))
        return
      }

      const currentIndex = PAGES.findIndex(p => PAGE_ROUTES[p] === currentPath)
      if (currentIndex === -1) return

      const nextIndex = dir === 'right'
        ? (currentIndex + 1) % PAGES.length
        : (currentIndex - 1 + PAGES.length) % PAGES.length

      const nextPage = PAGES[nextIndex]

      // When navigating TO tasks, carry initial sub-view
      if (nextPage === 'tasks') {
        const sub = dir === 'right' ? 'list' : 'lastThing'
        navigate(PAGE_ROUTES['tasks'], { state: { sub } })
      } else {
        navigate(PAGE_ROUTES[nextPage])
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  return null
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useUserStore(s => s.user)

  if (!user) {
    return <Navigate to="/clock/login" replace />
  }

  return <Layout>{children}</Layout>
}

function App() {
  return (
    <BrowserRouter>
      <KeyboardNav />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/clock/login" element={<Login />} />
          <Route path="/clock/timer" element={<ProtectedRoute><Timer /></ProtectedRoute>} />
          <Route path="/clock/stats" element={<ProtectedRoute><Stats /></ProtectedRoute>} />
          <Route path="/clock/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
          <Route path="/clock/tasks/:id" element={<ProtectedRoute><TaskDetail /></ProtectedRoute>} />
          <Route path="/clock/schedule" element={<ProtectedRoute><Schedule /></ProtectedRoute>} />
          <Route path="/clock/feed" element={<ProtectedRoute><Feed /></ProtectedRoute>} />
          <Route path="/clock/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/clock/*" element={<Navigate to="/clock/tasks" replace />} />
          <Route path="*" element={<Navigate to="/clock/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
