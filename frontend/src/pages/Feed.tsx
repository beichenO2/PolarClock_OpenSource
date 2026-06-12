import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FeedReportSection } from '../components/FeedReportSection'
import { FeedRecommendEvidence } from '../components/FeedRecommendEvidence'
import { FeedVideoPane } from '../components/FeedVideoPane'
import { FeedSourcesPane } from '../components/FeedSourcesPane'
import { useFeedStore } from '../stores/feedStore'

export default function Feed() {
  const { t } = useTranslation()

  const loading = useFeedStore(s => s.loading)
  const error = useFeedStore(s => s.error)
  const textItems = useFeedStore(s => s.textItems)
  const videoItems = useFeedStore(s => s.videoItems)
  const report = useFeedStore(s => s.report)
  const reportLoading = useFeedStore(s => s.reportLoading)
  const maxItems = useFeedStore(s => s.maxItems)
  const platforms = useFeedStore(s => s.platforms)
  const weights = useFeedStore(s => s.weights)

  const loadRecommend = useFeedStore(s => s.loadRecommend)
  const loadReport = useFeedStore(s => s.loadReport)
  const refreshCollect = useFeedStore(s => s.refreshCollect)
  const rebuildReport = useFeedStore(s => s.rebuildReport)
  const setTabMeta = useFeedStore(s => s.setTabMeta)
  const applyWeights = useFeedStore(s => s.applyWeights)

  const [tab, setTab] = useState<'text' | 'video' | 'algo'>('text')
  const [rebuildBusy, setRebuildBusy] = useState(false)
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const onRebuild = useCallback(async () => {
    setRebuildBusy(true)
    try {
      await rebuildReport()
    } finally {
      setRebuildBusy(false)
    }
  }, [rebuildReport])

  useEffect(() => {
    loadRecommend()
    loadReport()
    refreshTimerRef.current = setInterval(loadRecommend, 3_600_000)
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    }
  }, [loadRecommend, loadReport])

  const setWeights = useCallback(
    (partial: Partial<typeof weights>) => setTabMeta({ weights: { ...weights, ...partial } }),
    [weights, setTabMeta],
  )

  const togglePlatform = useCallback(
    (key: string) =>
      setTabMeta({
        platforms: platforms.includes(key)
          ? platforms.filter(p => p !== key)
          : [...platforms, key],
      }),
    [platforms, setTabMeta],
  )

  return (
    <div style={{ padding: '1rem 0', margin: '0 auto', maxWidth: 720 }}>

      <div style={{
        display: 'flex', gap: 4, marginBottom: '1rem', padding: '0 16px',
        background: 'var(--color-overlay)', borderRadius: 10,
      }}>
        {([
          ['text', 'feed.tabs.recommend'] as const,
          ['video', 'feed.tabs.video'] as const,
          ['algo', 'feed.tabs.sources'] as const,
        ]).map(([key, labelKey]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              flex: 1, padding: '8px 0', border: 'none', borderRadius: 8,
              cursor: 'pointer', fontSize: '0.82rem', fontWeight: tab === key ? 600 : 400,
              background: tab === key ? 'var(--color-card)' : 'transparent',
              color: tab === key ? 'var(--color-text)' : 'var(--color-text-muted)',
              transition: 'all 0.15s',
            }}
          >{t(labelKey)}</button>
        ))}
      </div>

      {error && (
        <div style={{
          padding: '12px', borderRadius: 10, marginBottom: '1rem',
          background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '0.82rem',
        }}>
          {t('feed.apiError')} {error}
          <button
            type="button"
            onClick={() => loadRecommend()}
            style={{
              marginLeft: 8, padding: '4px 10px', borderRadius: 6,
              border: '1px solid #ef4444', background: 'transparent',
              color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem',
            }}
          >{t('feed.retry')}</button>
        </div>
      )}

      {tab === 'text' && (
        <div>
          <FeedReportSection
            report={report}
            loading={reportLoading}
            rebuildBusy={rebuildBusy}
            onRebuild={onRebuild}
            onRefreshCollect={refreshCollect}
          />
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-faint)' }}>
              {t('common.loading')}
            </div>
          ) : (
            <>
              {textItems.length > 0 && (
                <div style={{
                  fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)',
                  margin: '20px 0 8px', borderTop: '1px solid var(--color-border)',
                  paddingTop: 16,
                }}>
                  {t('feed.evidence.sectionTitle')}
                </div>
              )}
              <FeedRecommendEvidence items={textItems} />
            </>
          )}
        </div>
      )}

      {tab === 'video' && (
        <FeedVideoPane
          items={videoItems}
          onRefresh={() => loadRecommend()}
        />
      )}

      {tab === 'algo' && (
        <FeedSourcesPane
          weights={weights}
          setWeights={partial => setWeights(partial)}
          onApplyWeights={applyWeights}
          platforms={platforms}
          togglePlatform={togglePlatform}
          maxItems={maxItems}
          setMaxItems={n => setTabMeta({ maxItems: n })}
        />
      )}
    </div>
  )
}
