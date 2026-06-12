import { useMemo, useEffect, useRef } from 'react'
import { marked } from 'marked'
import type { ReportCompileState } from '../feed/workbenchTypes'

marked.setOptions({ breaks: true, gfm: true })

export function FeedReportSection(props: {
  report: { state: ReportCompileState; markdown: string; banner?: string | null; error?: string | null; topicUsed?: string } | null
  loading: boolean
  onRebuild: () => void
  onRefreshCollect: () => void
  rebuildBusy: boolean
}) {
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      props.onRefreshCollect()
    }, 5 * 60 * 1000)
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current)
    }
  }, [props.onRefreshCollect])

  const htmlContent = useMemo(() => {
    const md = props.report?.markdown || ''
    if (!md) return ''
    return marked.parse(md) as string
  }, [props.report?.markdown])

  const st = props.report?.state ?? 'loading'
  const isEmpty = !props.report?.markdown?.trim() && st !== 'loading' && st !== 'compiling'

  return (
    <div className="feed-report">
      <style>{`
        .feed-report {
          max-width: 720px;
          margin: 0 auto;
          padding: 0 16px;
        }
        .feed-report__header {
          display: flex;
          align-items: baseline;
          gap: 12px;
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--color-border, #2a2a2a);
        }
        .feed-report__title {
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text-muted, #888);
          letter-spacing: 0.02em;
        }
        .feed-report__status {
          font-size: 11px;
          color: var(--color-text-faint, #555);
        }
        .feed-report__empty {
          padding: 48px 24px;
          text-align: center;
          color: var(--color-text-faint, #555);
          font-size: 14px;
        }
        .feed-report__body {
          font-size: 14px;
          line-height: 1.7;
          color: var(--color-text, #f0f0f0);
        }
        .feed-report__body h1 {
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.01em;
          margin: 0 0 4px;
          color: var(--color-text, #f0f0f0);
        }
        .feed-report__body h1 + p,
        .feed-report__body h1 + em {
          font-size: 12px;
          color: var(--color-text-muted, #888);
          margin-top: 0;
        }
        .feed-report__body h2 {
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.005em;
          margin: 24px 0 8px;
          padding-top: 16px;
          border-top: 1px solid var(--color-border, #2a2a2a);
          color: var(--color-text, #f0f0f0);
        }
        .feed-report__body h2:first-child {
          border-top: none;
          padding-top: 0;
          margin-top: 16px;
        }
        .feed-report__body p {
          margin: 8px 0;
        }
        .feed-report__body ul {
          list-style: none;
          padding: 0;
          margin: 8px 0;
        }
        .feed-report__body li {
          padding: 6px 0;
          border-bottom: 1px solid var(--color-border, #1a1a1a);
          font-size: 14px;
          line-height: 1.5;
        }
        .feed-report__body li:last-child {
          border-bottom: none;
        }
        .feed-report__body a {
          color: var(--color-text-muted, #aaa);
          text-decoration: none;
          font-size: 11px;
          letter-spacing: 0.02em;
          margin-left: 6px;
          opacity: 0.7;
          transition: opacity 0.15s;
        }
        .feed-report__body a:hover {
          opacity: 1;
          text-decoration: underline;
        }
        .feed-report__body table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          margin: 12px 0;
        }
        .feed-report__body th,
        .feed-report__body td {
          padding: 8px 12px;
          text-align: left;
          border-bottom: 1px solid var(--color-border, #2a2a2a);
        }
        .feed-report__body th {
          font-weight: 600;
          color: var(--color-text-muted, #888);
          font-size: 11px;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .feed-report__body em {
          font-style: normal;
          color: var(--color-text-faint, #666);
          font-size: 12px;
        }
        .feed-report__body code {
          font-size: 12px;
          color: var(--color-text-muted, #999);
          background: transparent;
        }
      `}</style>

      {props.loading && !htmlContent ? (
        <div className="feed-report__empty">
          <div className="feed-report__status">加载中...</div>
        </div>
      ) : isEmpty ? (
        <div className="feed-report__empty">暂无报告内容</div>
      ) : (
        <div
          className="feed-report__body"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      )}
    </div>
  )
}
