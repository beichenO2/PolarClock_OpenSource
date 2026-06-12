import { registerSW } from 'virtual:pwa-register'

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>

export interface ServiceWorkerState {
  needRefresh: boolean
  offlineReady: boolean
  updateServiceWorker?: UpdateServiceWorker
}

type ServiceWorkerListener = (state: ServiceWorkerState) => void

const listeners = new Set<ServiceWorkerListener>()

let registered = false
let serviceWorkerState: ServiceWorkerState = {
  needRefresh: false,
  offlineReady: false,
}

function emitServiceWorkerState() {
  listeners.forEach((listener) => listener(serviceWorkerState))
}

function updateServiceWorkerState(next: Partial<ServiceWorkerState>) {
  serviceWorkerState = {
    ...serviceWorkerState,
    ...next,
  }
  emitServiceWorkerState()
}

export function subscribeServiceWorkerState(listener: ServiceWorkerListener) {
  listeners.add(listener)
  listener(serviceWorkerState)

  return () => {
    listeners.delete(listener)
  }
}

export function dismissServiceWorkerNotice() {
  updateServiceWorkerState({
    needRefresh: false,
    offlineReady: false,
  })
}

export function registerServiceWorker() {
  if (registered || !import.meta.env.PROD || typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  registered = true

  let updateServiceWorker: UpdateServiceWorker | undefined

  updateServiceWorker = registerSW({
    immediate: true,
    onOfflineReady() {
      updateServiceWorkerState({
        offlineReady: true,
        updateServiceWorker,
      })
    },
    onNeedRefresh() {
      updateServiceWorkerState({
        needRefresh: true,
        updateServiceWorker,
      })
    },
    onRegisterError(error) {
      console.error('Service worker registration failed', error)
    },
  })

  updateServiceWorkerState({ updateServiceWorker })
}
