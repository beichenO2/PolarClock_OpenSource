/** Clock Feed ↔ digist / KnowLever 契约对齐类型（服务端未返回时使用可选字段 + 推导）。 */

export type FeedDigestLifecycle =
  | 'collected'
  | 'digesting'
  | 'digested_pending'
  | 'ingested'
  | 'archived'
  | 'not_interested'
  | 'downloaded'

export type DigistFeedbackReason =
  | 'low_quality'
  | 'duplicate'
  | 'off_topic'
  | 'already_seen'
  | 'spam'
  | 'other'

/** digist `/api/sources` 行形状（与设计期 SourceConfig 对齐的最低 UI 子集）。 */
export interface DigistSourceRow {
  id: string
  name: string
  kind: string | null
  endpoint: string | null
  metadata: Record<string, unknown>
  enabled: boolean
  created_at: string | null
}

/** 规范化后的推荐项（扩展字段可为空）。 */
export interface FeedRecommendItem {
  id: string
  title: string
  platform: string
  url: string
  score: number
  signals: {
    relevance: number
    density: number
    freshness: number
    crossPlatform: number
    novelty: number
  }
  reason: string
  timestamp: string
  content_type?: string
  /** 关注博主 / 热点关键词 / 最新关键词 / 超大热点 等，以后端为准。 */
  source_type?: string
  digest_status?: string
  media_status?: string
  summary_preview?: string
  temp_doc_id?: string
  local_play_url?: string | null
  watch_url?: string | null
}

export type ReportCompileState = 'loading' | 'compiling' | 'ready' | 'failed' | 'degraded'

export interface DynamicReportPayload {
  state: ReportCompileState
  markdown: string
  topicUsed: string | null
  updatedAt: string | null
  banner?: string | null
  error?: string | null
}

export const DIGIST_FEEDBACK_REASONS: readonly DigistFeedbackReason[] = [
  'low_quality',
  'duplicate',
  'off_topic',
  'already_seen',
  'spam',
  'other',
] as const

export type IngestStatus = 'idle' | 'submitting' | 'ingested' | 'failed' | 'queryable'

export interface IngestResult {
  status: IngestStatus
  doc_id?: string
  location?: string
  error?: string
}

export const SOURCE_KIND_PRESETS = [
  { kind: 'bilibili_following', labelKey: 'feed.sourceKind.following' as const },
  { kind: 'keyword_hot', labelKey: 'feed.sourceKind.hot' as const },
  { kind: 'keyword_latest', labelKey: 'feed.sourceKind.latest' as const },
  { kind: 'mega_hot', labelKey: 'feed.sourceKind.megaHot' as const },
] as const
