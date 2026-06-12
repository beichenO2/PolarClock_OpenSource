import { create } from 'zustand'
import type {
  DigistFeedbackReason,
  DigistSourceRow,
  DynamicReportPayload,
  FeedDigestLifecycle,
  FeedRecommendItem,
  IngestResult,
} from '../feed/workbenchTypes'
import * as api from '../feed/workbenchApi'

interface AlgoWeights {
  relevance: number
  density: number
  freshness: number
  crossPlatform: number
  novelty: number
}

function isVideoItem(it: FeedRecommendItem): boolean {
  if (it.content_type === 'video') return true
  const p = it.platform.toLowerCase()
  if (p === 'bilibili' || p === 'youtube') return true
  const u = it.url || ''
  return u.includes('bilibili.com/video') || u.includes('youtube.com/watch')
}

function lifecycleFromItem(
  it: FeedRecommendItem,
  localDigest?: { summary?: string },
): FeedDigestLifecycle {
  const ds = (it.digest_status || '').toLowerCase()
  const map: FeedDigestLifecycle[] = [
    'collected', 'digesting', 'digested_pending', 'ingested', 'archived', 'not_interested', 'downloaded',
  ]
  if (map.includes(ds as FeedDigestLifecycle)) return ds as FeedDigestLifecycle
  if (localDigest?.summary || (it.summary_preview && it.summary_preview.trim())) return 'digested_pending'
  if (ds.includes('ingest')) return 'ingested'
  if (ds.includes('digest') && ds.includes('pending')) return 'digested_pending'
  return 'collected'
}

interface FeedWorkbenchState {
  textItems: FeedRecommendItem[]
  videoItems: FeedRecommendItem[]
  loading: boolean
  error: string | null
  maxItems: number
  platforms: string[]
  weights: AlgoWeights
  report: DynamicReportPayload | null
  reportLoading: boolean
  sources: DigistSourceRow[]
  sourcesLoading: boolean
  sourcesError: string | null
  /** url → 本地摘要覆盖 */
  digestOverlay: Record<string, { summary: string; method?: string }>
  digestingUrls: Set<string>
  userDecisions: Record<string, FeedDigestLifecycle>

  autoDigestEnabled: boolean
  ingestResults: Record<string, IngestResult>

  loadRecommend: () => Promise<void>
  loadReport: () => Promise<void>
  refreshCollect: () => Promise<void>
  rebuildReport: () => Promise<void>
  applyWeights: () => void
  setTabMeta: (partial: Partial<{ maxItems: number; platforms: string[]; weights: AlgoWeights }>) => void
  runVideoDigest: (url: string, forceAsr?: boolean) => Promise<void>
  enqueueAutoDigest: (items: FeedRecommendItem[]) => void
  ingestItem: (item: FeedRecommendItem, text: string) => Promise<boolean>
  submitNotInterested: (
    item: FeedRecommendItem,
    reason: DigistFeedbackReason,
    note?: string,
  ) => Promise<{ ok: boolean; mock: boolean }>
  markLocal: (url: string, state: FeedDigestLifecycle) => void
  loadSources: () => Promise<void>
  createSource: (
    name: string,
    kind: string,
    metadata: Record<string, unknown>,
    endpoint?: string,
  ) => Promise<void>
  removeSource: (id: string) => Promise<void>
}

const defaultWeights: AlgoWeights = {
  relevance: 0.35, density: 0.20, freshness: 0.20, crossPlatform: 0.15, novelty: 0.10,
}

export const useFeedStore = create<FeedWorkbenchState>((set, get) => ({
  textItems: [],
  videoItems: [],
  loading: true,
  error: null,
  maxItems: 24,
  platforms: [],
  weights: { ...defaultWeights },
  report: null,
  reportLoading: false,
  sources: [],
  sourcesLoading: false,
  sourcesError: null,
  digestOverlay: {},
  digestingUrls: new Set(),
  userDecisions: {},
  autoDigestEnabled: true,
  ingestResults: {},

  setTabMeta: partial => set(partial),

  loadRecommend: async () => {
    set({ loading: true, error: null })
    try {
      const { maxItems, platforms, weights } = get()
      const platform = platforms.length === 1 ? platforms[0] : undefined
      const raw = await api.fetchRecommend({
        n: maxItems,
        platform,
        weights,
      })
      const textItems = raw.filter(it => !isVideoItem(it))
      const videoItems = raw.filter(it => isVideoItem(it))
      set({ textItems, videoItems, loading: false })
      void get().enqueueAutoDigest(videoItems)
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  },

  loadReport: async () => {
    set({ reportLoading: true })
    try {
      const rep = await api.fetchDynamicReport()
      set({ report: rep, reportLoading: false })
    } catch (e) {
      set({
        report: {
          state: 'failed',
          markdown: '',
          topicUsed: null,
          updatedAt: null,
          error: e instanceof Error ? e.message : String(e),
        },
        reportLoading: false,
      })
    }
  },

  refreshCollect: async () => {
    await get().loadRecommend()
  },

  rebuildReport: async () => {
    const topic = get().report?.topicUsed ?? 'Digist'
    set(s => ({
      report: s.report ? { ...s.report, state: 'compiling' as const } : s.report,
    }))
    await api.rebuildDynamicReport(topic)
    await get().loadReport()
    await get().loadRecommend()
  },

  applyWeights: () => {
    const { textItems, videoItems, weights } = get()
    const merged = [...textItems, ...videoItems].map(item => {
      const s = item.signals
      const newScore =
        s.relevance * weights.relevance +
        s.density * weights.density +
        s.freshness * weights.freshness +
        s.crossPlatform * weights.crossPlatform +
        s.novelty * weights.novelty
      return { ...item, score: newScore }
    })
    merged.sort((a, b) => b.score - a.score)
    set({
      textItems: merged.filter(it => !isVideoItem(it)),
      videoItems: merged.filter(it => isVideoItem(it)),
    })
  },

  runVideoDigest: async (url, forceAsr = false) => {
    const { digestingUrls } = get()
    if (digestingUrls.has(url)) return
    set({
      digestingUrls: new Set(digestingUrls).add(url),
    })
    try {
      const data = await api.postVideoDigest(url, { forceAsr, pushKnowLever: false })
      const summary = data.summary_preview || data.transcript_preview || ''
      set(state => ({
        digestOverlay: {
          ...state.digestOverlay,
          [url]: { summary, method: data.method },
        },
        digestingUrls: (() => {
          const n = new Set(state.digestingUrls)
          n.delete(url)
          return n
        })(),
      }))
    } catch (err) {
      set(state => ({
        digestOverlay: {
          ...state.digestOverlay,
          [url]: {
            summary: err instanceof Error ? err.message : 'digest failed',
            method: 'error',
          },
        },
        digestingUrls: (() => {
          const n = new Set(state.digestingUrls)
          n.delete(url)
          return n
        })(),
      }))
    }
  },

  enqueueAutoDigest: items => {
    if (!get().autoDigestEnabled) return
    void (async () => {
      for (const it of items) {
        const overlay = get().digestOverlay[it.url]
        const hasBackendSummary = !!(it.summary_preview && it.summary_preview.trim())
        if (overlay?.summary || overlay?.method === 'error' || hasBackendSummary) continue
        const st = (it.digest_status || '').toLowerCase()
        if (st.includes('digesting')) continue
        if (get().digestingUrls.has(it.url)) continue
        await get().runVideoDigest(it.url)
      }
    })()
  },

  ingestItem: async (item, text) => {
    const doc = item.temp_doc_id || item.id.replace(/[^\w.-]+/g, '_').slice(0, 128)
    const docId = `feed-${doc}`

    set(s => ({
      ingestResults: {
        ...s.ingestResults,
        [item.url]: { status: 'submitting' },
      },
    }))

    const result = await api.ingestToKnowLever(text, docId, {
      source: item.url,
      platform: item.platform,
      mode: 'feed_ingest',
    })

    set(s => ({
      ingestResults: {
        ...s.ingestResults,
        [item.url]: result.ok
          ? { status: 'ingested', doc_id: result.doc_id, location: result.location }
          : { status: 'failed', error: result.error },
      },
    }))

    return result.ok
  },

  submitNotInterested: async (item, reason, note) => {
    const res = await api.submitDigistFeedback({
      item_id: item.id,
      url: item.url,
      reason,
      note,
    })
    if (res.ok || res.mock)
      set(s => ({
        userDecisions: { ...s.userDecisions, [item.url]: 'not_interested' },
      }))
    return res
  },

  markLocal: (url, state) =>
    set(s => ({
      userDecisions: { ...s.userDecisions, [url]: state },
    })),

  loadSources: async () => {
    set({ sourcesLoading: true, sourcesError: null })
    try {
      const rows = await api.listSources()
      set({ sources: rows, sourcesLoading: false })
    } catch (e) {
      set({
        sourcesLoading: false,
        sourcesError: e instanceof Error ? e.message : String(e),
      })
    }
  },

  createSource: async (name, kind, metadata, endpoint) => {
    await api.upsertSource({ name, kind, endpoint, metadata })
    await get().loadSources()
  },

  removeSource: async id => {
    await api.deleteSource(id)
    await get().loadSources()
  },
}))

export { isVideoItem, lifecycleFromItem }
export type { AlgoWeights }
