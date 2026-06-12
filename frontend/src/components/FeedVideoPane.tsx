import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FeedRecommendItem } from '../feed/workbenchTypes'
import { lifecycleFromItem, useFeedStore } from '../stores/feedStore'

function SingleVideoCard(props: {
  item: FeedRecommendItem
  onNext: () => void
  onPlayInline: (url: string) => void
}) {
  const { t } = useTranslation()
  const digestOverlay = useFeedStore(s => s.digestOverlay)
  const digestingUrls = useFeedStore(s => s.digestingUrls)
  const runVideoDigest = useFeedStore(s => s.runVideoDigest)
  const ingestItem = useFeedStore(s => s.ingestItem)
  const markLocal = useFeedStore(s => s.markLocal)
  const submitNotInterested = useFeedStore(s => s.submitNotInterested)
  const userDecisions = useFeedStore(s => s.userDecisions)

  const { item } = props
  const overlay = digestOverlay[item.url]
  const isBusy = digestingUrls.has(item.url)
  const lc = userDecisions[item.url] ?? lifecycleFromItem(item, overlay)
  const summary = overlay?.summary ?? item.summary_preview
  const watch = item.local_play_url?.trim() ? item.local_play_url : null
  const ext = item.watch_url || item.url

  const handleIngest = useCallback(async () => {
    const text = `${item.title}\n\n${summary || ''}\n来源: ${item.url}`.slice(0, 8000)
    const ok = await ingestItem(item, text)
    if (ok) markLocal(item.url, 'ingested')
    props.onNext()
  }, [item, summary, ingestItem, markLocal, props])

  const handleNotInterested = useCallback(async () => {
    await submitNotInterested(item, 'off_topic')
    props.onNext()
  }, [item, submitNotInterested, props])

  return (
    <div style={{
      padding: '20px', background: 'var(--color-card)', borderRadius: 16,
      border: '1px solid var(--color-border)',
    }}>
      {watch ? (
        <div style={{
          marginBottom: 16, borderRadius: 12, overflow: 'hidden',
          background: '#000', cursor: 'pointer',
        }} onClick={() => props.onPlayInline(watch)}>
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            color: '#fff', fontSize: '0.85rem',
          }}>
            ▶ {t('feed.video.watchInline')}
          </div>
        </div>
      ) : (
        <div style={{
          marginBottom: 16, padding: '24px', borderRadius: 12,
          background: 'var(--color-overlay)', textAlign: 'center',
          fontSize: '0.75rem', color: 'var(--color-text-faint)',
        }}>
          {t('feed.video.noLocalPlay')}
        </div>
      )}

      <div style={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1.4, marginBottom: 8 }}>
        {item.title}
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: 12 }}>
        {item.platform} · {item.source_type || t('feed.video.sourceVideo')} · {lc}
      </div>

      {(summary || overlay?.method === 'error') && (
        <div style={{
          padding: '12px', borderRadius: 10, marginBottom: 16,
          background: overlay?.method === 'error' ? 'rgba(239,68,68,0.08)' : 'var(--color-overlay)',
          fontSize: '0.8rem', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          borderLeft: `3px solid ${overlay?.method === 'error' ? '#ef4444' : '#10B981'}`,
        }}>
          {(String(summary ?? '')).slice(0, 1200)}
        </div>
      )}

      {isBusy && !summary && (
        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 12 }}>
          {t('feed.video.autoDigest')}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={() => window.open(ext, '_blank', 'noopener,noreferrer')}
          style={actionBtn('var(--color-overlay)', 'var(--color-text-muted)', 'var(--color-border)')}>
          {t('feed.evidence.openExternal')}
        </button>
        <button type="button" onClick={handleNotInterested}
          style={actionBtn('rgba(239,68,68,0.08)', '#b91c1c', 'rgba(239,68,68,0.35)')}>
          {t('feed.evidence.notInterested')}
        </button>
        <button type="button" onClick={handleIngest}
          style={actionBtn('#EEF2FF', '#4F46E5', '#C7D2FE')}>
          {t('feed.evidence.ingest')}
        </button>
        <button type="button" disabled={isBusy}
          onClick={e => runVideoDigest(item.url, e.shiftKey)}
          style={actionBtn('#EEF2FF', '#4F46E5', '#C7D2FE')}
          title={t('feed.video.redigestHint')}>
          {isBusy ? t('feed.video.digesting') : t('feed.video.redigest')}
        </button>
        <button type="button" onClick={props.onNext}
          style={{
            ...actionBtn('var(--color-primary)', '#fff', 'var(--color-primary)'),
            flex: '1 0 100%', fontWeight: 700, fontSize: '0.85rem', padding: '10px',
          }}>
          {t('feed.video.next')} →
        </button>
      </div>
    </div>
  )
}

function actionBtn(bg: string, color: string, border: string): React.CSSProperties {
  return {
    padding: '6px 12px', fontSize: '0.72rem', borderRadius: 8,
    background: bg, border: `1px solid ${border}`, cursor: 'pointer', color,
  }
}

function TopicVideoReport(props: { items: FeedRecommendItem[] }) {
  const { t } = useTranslation()
  const digestOverlay = useFeedStore(s => s.digestOverlay)

  const grouped = useMemo(() => {
    const map = new Map<string, FeedRecommendItem[]>()
    for (const item of props.items) {
      const topic = item.source_type || 'general'
      if (!map.has(topic)) map.set(topic, [])
      map.get(topic)!.push(item)
    }
    return Array.from(map.entries())
  }, [props.items])

  if (grouped.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-faint)' }}>
        {t('feed.video.empty')}
      </div>
    )
  }

  return (
    <div>
      {grouped.map(([topic, items]) => (
        <div key={topic} style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: '0.85rem', fontWeight: 700, marginBottom: 8,
            borderLeft: '3px solid var(--color-primary)', paddingLeft: 10,
          }}>
            {topic} ({items.length})
          </div>
          {items.map((item, i) => {
            const overlay = digestOverlay[item.url]
            const summary = overlay?.summary ?? item.summary_preview
            return (
              <div key={`${item.id}-${i}`} style={{
                padding: '10px 12px', marginBottom: 6, borderRadius: 10,
                background: 'var(--color-overlay)', fontSize: '0.8rem',
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                  {item.platform}
                </div>
                {summary && (
                  <div style={{
                    marginTop: 6, fontSize: '0.75rem', color: 'var(--color-text-muted)',
                    lineHeight: 1.5,
                  }}>
                    {summary.slice(0, 400)}{summary.length > 400 ? '…' : ''}
                  </div>
                )}
                <button type="button"
                  onClick={() => window.open(item.watch_url || item.url, '_blank', 'noopener,noreferrer')}
                  style={{
                    marginTop: 6, padding: '3px 8px', fontSize: '0.68rem', borderRadius: 6,
                    background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    cursor: 'pointer', color: 'var(--color-text-muted)',
                  }}>{t('feed.evidence.openExternal')}</button>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export function FeedVideoPane(props: {
  items: FeedRecommendItem[]
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const enqueueAutoDigest = useFeedStore(s => s.enqueueAutoDigest)

  const [videoMode, setVideoMode] = useState<'following' | 'topic'>('following')
  const [cursor, setCursor] = useState(0)
  const [viewedUrls, setViewedUrls] = useState<Set<string>>(new Set())
  const [playUrl, setPlayUrl] = useState<string | null>(null)

  const followingItems = useMemo(
    () => props.items.filter(it => {
      const st = (it.source_type || '').toLowerCase()
      return st.includes('following') || st.includes('博主') || st === ''
    }),
    [props.items],
  )

  const topicItems = useMemo(
    () => props.items.filter(it => {
      const st = (it.source_type || '').toLowerCase()
      return st.includes('keyword') || st.includes('hot') || st.includes('topic') || st.includes('关键词')
    }),
    [props.items],
  )

  useEffect(() => {
    void enqueueAutoDigest(props.items)
  }, [props.items, enqueueAutoDigest])

  const currentVideo = followingItems[cursor] ?? null

  const handleNext = useCallback(() => {
    if (currentVideo) {
      setViewedUrls(prev => new Set(prev).add(currentVideo.url))
    }
    setCursor(c => Math.min(c + 1, followingItems.length - 1))
  }, [currentVideo, followingItems.length])

  if (props.items.length === 0) {
    return (
      <div>
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-faint)' }}>
          {t('feed.video.empty')}
        </div>
        <button type="button" onClick={props.onRefresh} style={{
          width: '100%', padding: '10px', marginTop: 8, border: '1px solid var(--color-border)',
          borderRadius: 10, background: 'var(--color-overlay)', cursor: 'pointer',
          color: 'var(--color-text-muted)', fontSize: '0.82rem',
        }}>{t('feed.video.refresh')}</button>
      </div>
    )
  }

  return (
    <div>
      {playUrl && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setPlayUrl(null) }}>
          <div style={{
            width: 'min(100%, 720px)', background: '#000',
            borderRadius: 12, overflow: 'hidden', border: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 8, background: '#111' }}>
              <span style={{ fontSize: '0.72rem', color: '#eee' }}>{t('feed.video.inlineTitle')}</span>
              <button type="button" onClick={() => setPlayUrl(null)}
                style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer' }}>×</button>
            </div>
            <video src={playUrl} controls playsInline
              style={{ width: '100%', maxHeight: '52vh', background: '#000' }} />
          </div>
        </div>
      )}

      {/* Sub-tab toggle */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 16,
        background: 'var(--color-overlay)', borderRadius: 10, padding: 3,
      }}>
        {(['following', 'topic'] as const).map(m => (
          <button key={m} type="button" onClick={() => setVideoMode(m)} style={{
            flex: 1, padding: '8px 0', border: 'none', borderRadius: 8,
            cursor: 'pointer', fontSize: '0.82rem',
            fontWeight: videoMode === m ? 700 : 400,
            background: videoMode === m ? 'var(--color-card)' : 'transparent',
            color: videoMode === m ? 'var(--color-text)' : 'var(--color-text-muted)',
            boxShadow: videoMode === m ? 'var(--shadow-sm)' : 'none',
          }}>
            {t(m === 'following' ? 'feed.video.followingTab' : 'feed.video.topicTab')}
          </button>
        ))}
      </div>

      {videoMode === 'following' ? (
        currentVideo ? (
          <div>
            <div style={{
              fontSize: '0.7rem', color: 'var(--color-text-faint)',
              marginBottom: 8, textAlign: 'center',
            }}>
              {cursor + 1} / {followingItems.length}
              {viewedUrls.size > 0 && ` · ${t('feed.video.viewed')}: ${viewedUrls.size}`}
            </div>
            <SingleVideoCard
              item={currentVideo}
              onNext={handleNext}
              onPlayInline={setPlayUrl}
            />
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-faint)' }}>
            {t('feed.video.allViewed')}
          </div>
        )
      ) : (
        <TopicVideoReport items={topicItems.length > 0 ? topicItems : props.items} />
      )}

      <button type="button" onClick={props.onRefresh} style={{
        width: '100%', padding: '10px', marginTop: 16, border: '1px solid var(--color-border)',
        borderRadius: 10, background: 'var(--color-overlay)', cursor: 'pointer',
        color: 'var(--color-text-muted)', fontSize: '0.82rem',
      }}>{t('feed.video.refresh')}</button>
    </div>
  )
}
