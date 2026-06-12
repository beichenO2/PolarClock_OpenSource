import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa_install_dismissed'
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000 // 7 days

export default function InstallPrompt() {
  const { t } = useTranslation()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY)
    if (dismissed && Date.now() - Number(dismissed) < DISMISS_DURATION) return

    const ua = navigator.userAgent
    const iosDevice = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone

    if (isStandalone) return

    if (iosDevice) {
      setIsIOS(true)
      setVisible(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setVisible(false)
    }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }, [])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: 16, right: 16, zIndex: 500,
      background: 'var(--color-card)', border: '1px solid var(--color-border)',
      borderRadius: 16, padding: '16px 20px',
      boxShadow: 'var(--shadow-lg)',
      animation: 'slideUp 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: '1.8rem', lineHeight: 1 }}>⏱</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text)' }}>
            {t('share.install')}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
            {isIOS ? t('share.iosHint') : t('share.installHint')}
          </div>
        </div>
        {!isIOS && (
          <button
            onClick={handleInstall}
            style={{
              padding: '8px 16px', background: '#e94560', color: '#fff',
              border: 'none', borderRadius: 10, cursor: 'pointer',
              fontWeight: 700, fontSize: '0.82rem', whiteSpace: 'nowrap',
            }}
          >{t('share.installBtn')}</button>
        )}
        <button
          onClick={handleDismiss}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--color-text-faint)', fontSize: '1rem', padding: 4,
          }}
        >✕</button>
      </div>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}
