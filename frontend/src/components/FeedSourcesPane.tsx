import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DigistSourceRow } from '../feed/workbenchTypes'
import { triggerCrawl } from '../feed/workbenchApi'
import type { AlgoWeights } from '../stores/feedStore'
import { useFeedStore } from '../stores/feedStore'

const FREQUENCY_OPTIONS = [
  { value: 30, labelKey: 'feed.sources.freq30m' },
  { value: 60, labelKey: 'feed.sources.freq1h' },
  { value: 180, labelKey: 'feed.sources.freq3h' },
  { value: 360, labelKey: 'feed.sources.freq6h' },
  { value: 720, labelKey: 'feed.sources.freq12h' },
  { value: 1440, labelKey: 'feed.sources.freq24h' },
] as const

const COUNT_OPTIONS = [5, 10, 20, 50] as const

function KeywordTagInput(props: {
  keywords: string[]
  onChange: (kws: string[]) => void
  placeholder: string
}) {
  const [input, setInput] = useState('')

  const addKeyword = useCallback(() => {
    const kw = input.trim()
    if (kw && !props.keywords.includes(kw)) {
      props.onChange([...props.keywords, kw])
    }
    setInput('')
  }, [input, props])

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {props.keywords.map(kw => (
          <span key={kw} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 6,
            background: 'var(--color-primary)', color: '#fff',
            fontSize: '0.72rem', fontWeight: 600,
          }}>
            {kw}
            <button type="button" onClick={() => props.onChange(props.keywords.filter(k => k !== kw))}
              style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
                fontSize: '0.8rem', padding: 0, lineHeight: 1 }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input type="text" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword() } }}
          placeholder={props.placeholder}
          style={{
            flex: 1, padding: '6px 10px', borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'var(--color-overlay)', color: 'var(--color-text)',
            fontSize: '0.8rem',
          }} />
        <button type="button" onClick={addKeyword} style={{
          padding: '6px 12px', borderRadius: 8, border: 'none',
          background: 'var(--color-primary)', color: '#fff',
          cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
        }}>+</button>
      </div>
    </div>
  )
}

function PermissionPanel() {
  const { t } = useTranslation()
  const [notifStatus, setNotifStatus] = useState<string>('default')
  const [pwaInstalled, setPwaInstalled] = useState(false)

  useEffect(() => {
    if ('Notification' in window) setNotifStatus(Notification.permission)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as unknown as { standalone?: boolean }).standalone
    setPwaInstalled(!!isStandalone)
  }, [])

  const requestNotification = useCallback(async () => {
    if (!('Notification' in window)) return
    const result = await Notification.requestPermission()
    setNotifStatus(result)
  }, [])

  const permissions: { key: string; status: string; action: (() => void) | null; scope: string }[] = [
    {
      key: t('feed.sources.permNotification'),
      status: notifStatus === 'granted' ? '✅ ' + t('feed.sources.permGranted')
        : notifStatus === 'denied' ? '❌ ' + t('feed.sources.permDenied')
        : '⚪ ' + t('feed.sources.permDefault'),
      action: notifStatus === 'default' ? requestNotification : null,
      scope: t('feed.sources.permNotifScope'),
    },
    {
      key: t('feed.sources.permPWA'),
      status: pwaInstalled ? '✅ ' + t('feed.sources.permInstalled') : '⚪ ' + t('feed.sources.permNotInstalled'),
      action: null,
      scope: t('feed.sources.permPWAScope'),
    },
  ]

  return (
    <div style={{
      padding: '14px', background: 'var(--color-card)', borderRadius: 12,
      border: '1px solid var(--color-border)', marginBottom: 16,
    }}>
      <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 10 }}>
        {t('feed.sources.permTitle')}
      </div>
      {permissions.map(p => (
        <div key={p.key} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 8, fontSize: '0.78rem', flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 600, minWidth: 80 }}>{p.key}</span>
          <span style={{ flex: 1 }}>{p.status}</span>
          {p.action && (
            <button type="button" onClick={p.action} style={{
              padding: '4px 10px', borderRadius: 6, border: '1px solid var(--color-border)',
              background: 'var(--color-overlay)', cursor: 'pointer',
              fontSize: '0.7rem', color: 'var(--color-text)',
            }}>{t('feed.sources.permRequest')}</button>
          )}
          <span style={{ fontSize: '0.65rem', color: 'var(--color-text-faint)', width: '100%' }}>
            {p.scope}
          </span>
        </div>
      ))}
    </div>
  )
}

export function FeedSourcesPane(props: {
  weights: AlgoWeights
  setWeights: (w: Partial<AlgoWeights>) => void
  onApplyWeights: () => void
  platforms: string[]
  togglePlatform: (key: string) => void
  maxItems: number
  setMaxItems: (n: number) => void
}) {
  const { t } = useTranslation()
  const sources = useFeedStore(s => s.sources)
  const loadSources = useFeedStore(s => s.loadSources)
  const sourcesLoading = useFeedStore(s => s.sourcesLoading)
  const sourcesError = useFeedStore(s => s.sourcesError)
  const createSource = useFeedStore(s => s.createSource)
  const removeSource = useFeedStore(s => s.removeSource)

  const [name, setName] = useState('')
  const [mode, setMode] = useState<'following' | 'keyword'>('following')
  const [creatorId, setCreatorId] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [frequency, setFrequency] = useState(60)
  const [fetchCount, setFetchCount] = useState(20)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [metaJson, setMetaJson] = useState('{}')

  const [kwPlatform, setKwPlatform] = useState('bilibili')
  const [kwQuery, setKwQuery] = useState('')
  const [crawlKey, setCrawlKey] = useState<string | null>(null)

  useEffect(() => {
    void loadSources()
  }, [loadSources])

  async function submitSource() {
    const metadata: Record<string, unknown> = {}
    if (mode === 'following') {
      metadata.bilibili_mid = creatorId.trim()
      metadata.mode = 'following'
    } else {
      metadata.keywords = keywords
      metadata.mode = 'keyword'
    }
    metadata.frequency_minutes = frequency
    metadata.fetch_count = fetchCount

    if (showAdvanced) {
      try {
        const extra = JSON.parse(metaJson || '{}')
        Object.assign(metadata, extra)
      } catch { /* ignore malformed JSON */ }
    }

    const kind = mode === 'following' ? 'bilibili_following' : 'keyword'
    await createSource(name.trim() || t('feed.sources.unnamed'), kind, metadata, undefined)
    setName('')
    setCreatorId('')
    setKeywords([])
  }

  return (
    <div>
      {sourcesError && (
        <div style={{
          padding: '10px', borderRadius: 10, marginBottom: 12,
          background: 'rgba(239,68,68,0.09)', color: '#ef4444', fontSize: '0.78rem',
        }}>
          {sourcesError}
        </div>
      )}

      {/* Existing sources list */}
      <div style={{
        marginBottom: 16, padding: '14px', background: 'var(--color-card)',
        borderRadius: 12, border: '1px solid var(--color-border)',
      }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 10 }}>
          {t('feed.sources.title')}
        </div>
        {sourcesLoading && (
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>
            {t('common.loading')}
          </div>
        )}
        {(sources ?? []).map((src: DigistSourceRow) => (
          <div key={src.id} style={{
            display: 'flex', gap: 8, alignItems: 'center',
            marginBottom: 8, fontSize: '0.78rem', flexWrap: 'wrap',
          }}>
            <span style={{
              padding: '2px 6px', borderRadius: 6,
              background: 'var(--color-overlay)', border: '1px solid var(--color-border)',
            }}>{src.kind ?? '—'}</span>
            <span style={{ flex: 1, minWidth: 120 }}>{src.name}</span>
            {!src.enabled && (
              <span style={{ color: 'var(--color-text-faint)' }}>{t('feed.sources.disabled')}</span>
            )}
            <button type="button" onClick={() => removeSource(src.id)} style={{
              padding: '3px 8px', borderRadius: 6, border: '1px solid #FCA5A5',
              background: 'transparent', cursor: 'pointer', color: '#EF4444', fontSize: '0.65rem',
            }}>{t('common.delete')}</button>
          </div>
        ))}
      </div>

      {/* Structured source form */}
      <div style={{
        marginBottom: 16, padding: '14px', background: 'var(--color-card)',
        borderRadius: 12, border: '1px solid var(--color-border)',
      }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 12 }}>
          {t('feed.sources.addSource')}
        </div>

        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder={t('feed.sources.namePh')}
          style={{
            width: '100%', padding: '8px 10px', borderRadius: 8, marginBottom: 10,
            border: '1px solid var(--color-border)',
            background: 'var(--color-overlay)', color: 'var(--color-text)', fontSize: '0.82rem',
          }} />

        {/* Mode toggle */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 12,
          background: 'var(--color-overlay)', borderRadius: 8, padding: 3,
        }}>
          {(['following', 'keyword'] as const).map(m => (
            <button key={m} type="button" onClick={() => setMode(m)} style={{
              flex: 1, padding: '6px 0', border: 'none', borderRadius: 6,
              cursor: 'pointer', fontSize: '0.78rem',
              fontWeight: mode === m ? 700 : 400,
              background: mode === m ? 'var(--color-card)' : 'transparent',
              color: mode === m ? 'var(--color-text)' : 'var(--color-text-muted)',
              boxShadow: mode === m ? 'var(--shadow-sm)' : 'none',
            }}>
              {t(m === 'following' ? 'feed.sourceKind.following' : 'feed.sources.keywordMode')}
            </button>
          ))}
        </div>

        {mode === 'following' ? (
          <input type="text" value={creatorId} onChange={e => setCreatorId(e.target.value)}
            placeholder={t('feed.sources.creatorPh')}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 8, marginBottom: 10,
              border: '1px solid var(--color-border)',
              background: 'var(--color-overlay)', color: 'var(--color-text)', fontSize: '0.82rem',
            }} />
        ) : (
          <div style={{ marginBottom: 10 }}>
            <KeywordTagInput
              keywords={keywords}
              onChange={setKeywords}
              placeholder={t('feed.sources.keywordPh')}
            />
          </div>
        )}

        {/* Frequency + Count */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, marginBottom: 4, color: 'var(--color-text-muted)' }}>
              {t('feed.sources.pullFreq')}
            </div>
            <select value={frequency} onChange={e => setFrequency(Number(e.target.value))}
              style={{
                width: '100%', padding: '6px', borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-overlay)', color: 'var(--color-text)', fontSize: '0.78rem',
              }}>
              {FREQUENCY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 600, marginBottom: 4, color: 'var(--color-text-muted)' }}>
              {t('feed.sources.pullCount')}
            </div>
            <select value={fetchCount} onChange={e => setFetchCount(Number(e.target.value))}
              style={{
                width: '100%', padding: '6px', borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-overlay)', color: 'var(--color-text)', fontSize: '0.78rem',
              }}>
              {COUNT_OPTIONS.map(n => (
                <option key={n} value={n}>{n} {t('feed.sources.items')}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Advanced JSON (collapsed) */}
        <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.7rem', color: 'var(--color-text-faint)', marginBottom: showAdvanced ? 8 : 0,
            padding: 0,
          }}>
          {showAdvanced ? '▼' : '▶'} {t('feed.sources.advanced')}
        </button>
        {showAdvanced && (
          <textarea value={metaJson} onChange={e => setMetaJson(e.target.value)}
            rows={3} placeholder={t('feed.sources.metaPh')}
            style={{
              width: '100%', padding: '8px', borderRadius: 8,
              border: '1px solid var(--color-border)', resize: 'vertical',
              background: 'var(--color-overlay)', color: 'var(--color-text)',
              fontSize: '0.78rem', fontFamily: 'ui-monospace, monospace',
            }} />
        )}

        <button type="button" onClick={submitSource} style={{
          width: '100%', padding: '10px', borderRadius: 10, border: 'none',
          background: 'var(--color-primary)', color: '#fff',
          cursor: 'pointer', fontWeight: 700, marginTop: 10,
        }}>{t('feed.sources.save')}</button>
      </div>

      {/* Permission panel */}
      <PermissionPanel />

      {/* Crawl trigger */}
      <div style={{
        marginBottom: 16, padding: '14px', background: 'var(--color-card)',
        borderRadius: 12, border: '1px solid var(--color-border)',
      }}>
        <div style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: 10 }}>
          {t('feed.sources.crawlTitle')}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={kwPlatform} onChange={e => setKwPlatform(e.target.value)}
            style={{
              padding: '6px', borderRadius: 8, border: '1px solid var(--color-border)',
              background: 'var(--color-overlay)', color: 'var(--color-text)', fontSize: '0.74rem',
            }}>
            <option value="bilibili">Bilibili</option>
            <option value="youtube">YouTube</option>
            <option value="arxiv">arXiv</option>
            <option value="hackernews">HN</option>
          </select>
          <input value={kwQuery} onChange={e => setKwQuery(e.target.value)}
            placeholder={t('feed.sources.queryPh')}
            style={{
              flex: 1, minWidth: 140, padding: '6px 10px', borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-overlay)', color: 'var(--color-text)', fontSize: '0.8rem',
            }} />
          <button type="button" disabled={!kwQuery.trim()}
            onClick={async () => {
              const key = `${kwPlatform}:${kwQuery}`
              setCrawlKey(key)
              try { await triggerCrawl(kwPlatform, kwQuery.trim()) }
              finally { setCrawlKey(null) }
            }}
            style={{
              padding: '6px 12px', borderRadius: 8, border: 'none',
              background: crawlKey ? '#FEF3C7' : 'var(--color-primary)',
              color: crawlKey ? '#b45309' : '#fff',
              cursor: kwQuery.trim() ? 'pointer' : 'not-allowed',
              fontSize: '0.75rem', fontWeight: 600,
            }}>{crawlKey ? '…' : t('feed.sources.crawlRun')}</button>
        </div>
      </div>

      {/* Weights + filters */}
      <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
        {t('feed.sources.weightsHint')}
      </p>
      {(Object.entries(props.weights) as [keyof AlgoWeights, number][]).map(([key, val]) => {
        const labels: Record<string, string> = {
          relevance: 'feed.algo.relevance', density: 'feed.algo.density',
          freshness: 'feed.algo.freshness', crossPlatform: 'feed.algo.cross',
          novelty: 'feed.algo.novelty',
        }
        return (
          <div key={key} style={{ marginBottom: 16, padding: '12px', background: 'var(--color-card)', borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t(labels[key])}</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                {(val * 100).toFixed(0)}%
              </span>
            </div>
            <input type="range" min="0" max="100" step="5" value={val * 100}
              onChange={e => props.setWeights({ [key]: parseInt(e.target.value, 10) / 100 })}
              style={{ width: '100%', accentColor: 'var(--color-primary)' }} />
          </div>
        )
      })}

      <div style={{ padding: '12px', background: 'var(--color-card)', borderRadius: 12, marginBottom: 16 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>{t('feed.sources.platformFilter')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['arxiv', 'hackernews', 'reddit', 'twitter', 'github', 'bilibili', 'youtube'] as const).map(key => {
            const LABELS: Record<string, string> = {
              arxiv: 'arXiv', hackernews: 'HN', reddit: 'Reddit', twitter: 'X',
              github: 'GitHub', bilibili: 'B站', youtube: 'YT',
            }
            const COLORS: Record<string, string> = {
              bilibili: '#00a1d6', youtube: '#ff0000', arxiv: '#b31b1b', hackernews: '#ff6600',
              reddit: '#ff4500', twitter: '#1da1f2', github: '#333',
            }
            const on = props.platforms.includes(key)
            return (
              <button key={key} type="button" onClick={() => props.togglePlatform(key)}
                style={{
                  padding: '4px 10px', borderRadius: 8, fontSize: '0.72rem',
                  border: `1px solid ${on ? COLORS[key] : 'var(--color-border)'}`,
                  background: on ? COLORS[key] : 'transparent',
                  color: on ? '#fff' : 'var(--color-text-muted)',
                  cursor: 'pointer', fontWeight: on ? 600 : 400,
                }}>{LABELS[key]}</button>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '12px', background: 'var(--color-card)', borderRadius: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t('feed.sources.maxItems')}</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{props.maxItems}</span>
        </div>
        <input type="range" min="5" max="50" step="5" value={props.maxItems}
          onChange={e => props.setMaxItems(parseInt(e.target.value, 10))}
          style={{ width: '100%', marginTop: 8, accentColor: 'var(--color-primary)' }} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => props.onApplyWeights()} style={{
          flex: 1, padding: '12px', borderRadius: 10,
          background: 'var(--color-primary)', color: '#fff',
          border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
        }}>{t('feed.sources.apply')}</button>
        <button type="button" style={{
          flex: 1, padding: '12px', borderRadius: 10,
          border: '1px solid var(--color-border)', background: 'var(--color-overlay)', cursor: 'pointer',
        }} onClick={() => useFeedStore.getState().loadRecommend()}>
          {t('feed.sources.refetch')}
        </button>
      </div>
    </div>
  )
}
