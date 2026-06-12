import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DigistFeedbackReason, FeedRecommendItem } from '../feed/workbenchTypes'
import { DIGIST_FEEDBACK_REASONS } from '../feed/workbenchTypes'
import { lifecycleFromItem, useFeedStore } from '../stores/feedStore'

const PLATFORM_COLORS: Record<string, string> = {
  arxiv: '#b31b1b',
  hackernews: '#ff6600',
  reddit: '#ff4500',
  twitter: '#1da1f2',
  github: '#333',
  bilibili: '#00a1d6',
  xiaohongshu: '#fe2c55',
  zhihu: '#0066ff',
  bloomberg: '#2800d7',
  youtube: '#ff0000',
}

const PLATFORM_LABELS: Record<string, string> = {
  arxiv: 'arXiv',
  hackernews: 'HN',
  reddit: 'Reddit',
  twitter: 'Twitter',
  github: 'GitHub',
  bilibili: 'B站',
  xiaohongshu: '小红书',
  zhihu: '知乎',
  bloomberg: 'Bloomberg',
  youtube: 'YouTube',
}

function badgeForLifecycle(code: string, t: (k: string) => string) {
  const map: Record<string, string> = {
    ingested: 'feed.state.ingested',
    archived: 'feed.state.archived',
    not_interested: 'feed.state.notInterested',
    digested_pending: 'feed.state.pending',
    digesting: 'feed.state.digesting',
    downloaded: 'feed.state.downloaded',
  }
  const key = map[code]
  return key ? t(key) : code
}

function EvidenceHoverMenu(props: {
  item: FeedRecommendItem
  lc: string
  onFeedback: (item: FeedRecommendItem) => void
}) {
  const { t } = useTranslation()
  const ingestItem = useFeedStore(s => s.ingestItem)
  const markLocal = useFeedStore(s => s.markLocal)
  const digestOverlay = useFeedStore(s => s.digestOverlay)
  const ingestResults = useFeedStore(s => s.ingestResults)

  const { item, lc, onFeedback } = props
  const overlay = digestOverlay[item.url]
  const summary = item.summary_preview || overlay?.summary
  const ingestResult = ingestResults[item.url]

  const handleIngest = useCallback(async () => {
    const text = `${item.title}\n\n${summary || item.reason}\n来源: ${item.url}`.slice(0, 8000)
    const ok = await ingestItem(item, text)
    if (ok) markLocal(item.url, 'ingested')
  }, [item, summary, ingestItem, markLocal])

  return (
    <div style={{
      position: 'absolute', top: '100%', right: 0, zIndex: 20,
      background: 'var(--color-card)', borderRadius: 10, padding: '4px',
      border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-md)',
      display: 'flex', flexDirection: 'column', gap: 2, minWidth: 180,
    }}>
      {ingestResult && ingestResult.status !== 'idle' && (
        <div style={{ fontSize: '0.65rem', padding: '4px 8px' }}>
          {ingestResult.status === 'submitting' && (
            <span style={{ color: 'var(--color-text-muted)' }}>⏳ {t('feed.evidence.ingestSubmitting')}</span>
          )}
          {ingestResult.status === 'ingested' && (
            <span style={{ color: '#16A34A' }}>
              ✅ {t('feed.evidence.ingestTracked')}
              {ingestResult.location && (
                <span style={{ display: 'block', marginTop: 2, color: 'var(--color-text-muted)' }}>
                  📍 {ingestResult.location}
                </span>
              )}
              {ingestResult.doc_id && (
                <span style={{ display: 'block', marginTop: 2, color: 'var(--color-text-faint)', fontSize: '0.6rem' }}>
                  ID: {ingestResult.doc_id}
                </span>
              )}
            </span>
          )}
          {ingestResult.status === 'failed' && (
            <span style={{ color: '#ef4444' }}>
              ❌ {t('feed.evidence.ingestFail')}
              {ingestResult.error && <span style={{ display: 'block', marginTop: 2 }}>{ingestResult.error}</span>}
            </span>
          )}
        </div>
      )}

      <button type="button" onClick={() =>
        window.open(item.watch_url || item.url || '', '_blank', 'noopener,noreferrer')
      } style={menuBtnStyle}>{t('feed.evidence.openExternal')}</button>

      <button type="button"
        disabled={ingestResult?.status === 'submitting'}
        onClick={handleIngest}
        style={{ ...menuBtnStyle, color: '#4F46E5', fontWeight: 600 }}>
        {ingestResult?.status === 'submitting'
          ? t('feed.evidence.ingestSubmitting')
          : ingestResult?.status === 'failed'
            ? t('feed.evidence.ingestRetry')
            : t('feed.evidence.ingest')
        }
      </button>

      <button type="button" onClick={() => onFeedback(item)} style={{
        ...menuBtnStyle, color: '#b91c1c',
      }}>{t('feed.evidence.notInterested')}</button>
    </div>
  )
}

const menuBtnStyle: React.CSSProperties = {
  padding: '6px 10px', fontSize: '0.72rem', borderRadius: 6,
  background: 'transparent', border: 'none', cursor: 'pointer',
  textAlign: 'left', color: 'var(--color-text)',
  transition: 'background 0.15s',
}

export function FeedRecommendEvidence(props: { items: FeedRecommendItem[] }) {
  const { t } = useTranslation()
  const digestOverlay = useFeedStore(s => s.digestOverlay)
  const userDecisions = useFeedStore(s => s.userDecisions)
  const submitNotInterested = useFeedStore(s => s.submitNotInterested)
  const markLocal = useFeedStore(s => s.markLocal)

  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [dialog, setDialog] = useState<FeedRecommendItem | null>(null)
  const [reason, setReason] = useState<DigistFeedbackReason>('low_quality')
  const [note, setNote] = useState('')
  const [fbMsg, setFbMsg] = useState<string | null>(null)

  const submitFeedback = async () => {
    if (!dialog) return
    const res = await submitNotInterested(dialog, reason, note || undefined)
    setFbMsg(res.mock ? t('feed.feedback.mock') : res.ok ? t('feed.feedback.sent') : t('feed.feedback.fail'))
    if (res.ok || res.mock) {
      markLocal(dialog.url, 'not_interested')
      setDialog(null)
    }
  }

  if (props.items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-faint)' }}>
        {t('feed.evidence.empty')}
      </div>
    )
  }

  return (
    <div>
      {fbMsg && (
        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>{fbMsg}</div>
      )}
      {props.items.map((item, i) => {
        const overlay = digestOverlay[item.url]
        const lc = userDecisions[item.url] ?? lifecycleFromItem(item, overlay)
        const summary = item.summary_preview || overlay?.summary

        return (
          <div
            key={`${item.id}-${i}`}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{
              position: 'relative',
              padding: '12px 14px', marginBottom: 6,
              background: hoverIdx === i ? 'var(--color-overlay)' : 'transparent',
              borderRadius: 10,
              borderLeft: '3px solid var(--color-primary)',
              transition: 'background 0.15s',
              cursor: 'default',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{
                fontSize: '0.62rem', padding: '1px 6px', borderRadius: 4,
                background: PLATFORM_COLORS[item.platform] || '#666', color: '#fff', fontWeight: 600,
              }}>{PLATFORM_LABELS[item.platform] || item.platform}</span>
              {item.source_type && (
                <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>{item.source_type}</span>
              )}
              <span style={{
                fontSize: '0.6rem', padding: '1px 5px', borderRadius: 4,
                background: 'var(--color-overlay)', color: 'var(--color-text-muted)',
              }}>
                {badgeForLifecycle(lc, t)}
              </span>
            </div>

            <div style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.4 }}>{item.title}</div>

            {item.reason && (
              <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: 3 }}>{item.reason}</div>
            )}

            {summary && summary.trim() && (
              <div style={{
                marginTop: 8, fontSize: '0.76rem', lineHeight: 1.5,
                color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {summary.slice(0, 600)}{summary.length > 600 ? '…' : ''}
              </div>
            )}

            {hoverIdx === i && (
              <EvidenceHoverMenu item={item} lc={lc} onFeedback={setDialog} />
            )}
          </div>
        )
      })}

      {dialog && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: 16,
        }}
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDialog(null) }}
        >
          <div style={{
            maxWidth: 400, width: '100%',
            background: 'var(--color-card)', borderRadius: 16, padding: '16px',
            border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-md)',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{t('feed.feedback.title')}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>
              {dialog.title}
            </div>
            <select
              value={reason}
              onChange={e => setReason(e.target.value as DigistFeedbackReason)}
              style={{
                width: '100%', padding: 8, borderRadius: 8,
                border: '1px solid var(--color-border)', marginBottom: 8,
                background: 'var(--color-overlay)', color: 'var(--color-text)',
              }}
            >
              {DIGIST_FEEDBACK_REASONS.map(r => (
                <option key={r} value={r}>{t(`feed.feedback.reason.${r}`)}</option>
              ))}
            </select>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t('feed.feedback.notePh')}
              rows={3}
              style={{
                width: '100%', padding: 8, borderRadius: 8,
                border: '1px solid var(--color-border)', resize: 'vertical',
                background: 'var(--color-overlay)', color: 'var(--color-text)',
                fontSize: '0.82rem', marginBottom: 10,
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setDialog(null)} style={{
                padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)',
                background: 'transparent', cursor: 'pointer',
              }}>{t('common.cancel')}</button>
              <button type="button" onClick={submitFeedback} style={{
                padding: '8px 12px', borderRadius: 8, border: 'none',
                background: 'var(--color-primary)', color: '#fff', cursor: 'pointer', fontWeight: 600,
              }}>{t('common.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
