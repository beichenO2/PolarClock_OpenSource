import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  dismissServiceWorkerNotice,
  subscribeServiceWorkerState,
  type ServiceWorkerState,
} from '../pwa'

const INITIAL_STATE: ServiceWorkerState = {
  needRefresh: false,
  offlineReady: false,
}

export default function ServiceWorkerUpdatePrompt() {
  const { t } = useTranslation()
  const [swState, setSwState] = useState(INITIAL_STATE)

  useEffect(() => subscribeServiceWorkerState(setSwState), [])

  const handleRefresh = useCallback(async () => {
    await swState.updateServiceWorker?.(true)
  }, [swState])

  const handleDismiss = useCallback(() => {
    dismissServiceWorkerNotice()
  }, [])

  if (!swState.needRefresh && !swState.offlineReady) {
    return null
  }

  const title = swState.needRefresh
    ? t('pwa.updateTitle')
    : t('pwa.offlineTitle')

  const body = swState.needRefresh
    ? t('pwa.updateBody')
    : t('pwa.offlineBody')

  return (
    <div style={{
      position: 'fixed',
      bottom: 164,
      left: 16,
      right: 16,
      zIndex: 520,
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 16,
      padding: '16px 20px',
      boxShadow: 'var(--shadow-lg)',
      animation: 'slideUp 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: '1.6rem', lineHeight: 1 }}>
          {swState.needRefresh ? '⬆️' : '📦'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text)' }}>
            {title}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
            {body}
          </div>
        </div>
        {swState.needRefresh && (
          <button
            onClick={() => { void handleRefresh() }}
            style={{
              padding: '8px 16px',
              background: '#4C6FFF',
              color: '#fff',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.82rem',
              whiteSpace: 'nowrap',
            }}
          >
            {t('pwa.refresh')}
          </button>
        )}
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-faint)',
            fontSize: swState.needRefresh ? '1rem' : '0.82rem',
            padding: 4,
            whiteSpace: 'nowrap',
          }}
        >
          {swState.needRefresh ? '✕' : t('common.close')}
        </button>
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
