import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUserStore } from '../stores/userStore'

export default function Login() {
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const login = useUserStore(s => s.login)
  const user = useUserStore(s => s.user)
  const navigate = useNavigate()

  useEffect(() => {
    // Redirect to tasks if user is logged in
    if (user !== null && user) {
      navigate('/clock/tasks', { replace: true })
    }
  }, [user, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) return
    setLoading(true)
    setError('')
    try {
      await login(username)
      navigate('/clock/tasks')
    } catch {
      setError('登录失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <h1 className="text-4xl font-bold text-center mb-12 text-dark-accent">
          PolarClock
        </h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="请输入用户名"
              className="w-full px-6 py-4 bg-dark-card border border-dark-border rounded-xl text-lg text-center focus:outline-none focus:border-dark-accent"
              autoFocus
            />
          </div>
          {error && <p className="text-dark-accent text-center text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-dark-accent text-white rounded-xl text-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? '进入中...' : '进入时钟'}
          </button>
        </form>
        <p className="text-center text-gray-500 mt-8 text-sm">
          无需密码，输入用户名即可登录
        </p>
      </div>
    </div>
  )
}
