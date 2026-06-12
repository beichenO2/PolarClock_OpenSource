import type { DigistSourceRow, DynamicReportPayload, FeedRecommendItem, ReportCompileState } from './workbenchTypes'

const DIGIST = '/digist-api'
const KL = '/gw/knowlever-rag'
const KL_USER = 'admin'
const PreferTopicDigist = 'Digist'

function fnv1a(url: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `h${(h >>> 0).toString(16)}`
}

/** 兼容旧版扁平数组与 `{ items: [] }`。 */
export function normalizeRecommendPayload(raw: unknown): FeedRecommendItem[] {
  const arr = Array.isArray(raw) ? raw : (raw as { items?: unknown[] })?.items
  if (!Array.isArray(arr)) return []
  return arr.map((row): FeedRecommendItem => {
    const o = row as Record<string, unknown>
    const url = String(o.url ?? '')
    const signals = (o.signals as FeedRecommendItem['signals']) ?? {
      relevance: 0, density: 0, freshness: 0, crossPlatform: 0, novelty: 0,
    }
    const id = String(o.id ?? o.temp_doc_id ?? fnv1a(url || String(o.title)))
    return {
      id,
      title: String(o.title ?? ''),
      platform: String(o.platform ?? 'general'),
      url,
      score: typeof o.score === 'number' ? o.score : Number(o.score) || 0,
      signals: {
        relevance: Number(signals.relevance) || 0,
        density: Number(signals.density) || 0,
        freshness: Number(signals.freshness) || 0,
        crossPlatform: Number(signals.crossPlatform) || 0,
        novelty: Number(signals.novelty) || 0,
      },
      reason: String(o.reason ?? ''),
      timestamp: String(o.timestamp ?? ''),
      content_type: o.content_type != null ? String(o.content_type) : undefined,
      source_type: o.source_type != null ? String(o.source_type) : undefined,
      digest_status: o.digest_status != null ? String(o.digest_status) : undefined,
      media_status: o.media_status != null ? String(o.media_status) : undefined,
      summary_preview: o.summary_preview != null ? String(o.summary_preview) : undefined,
      temp_doc_id: o.temp_doc_id != null ? String(o.temp_doc_id) : undefined,
      local_play_url: o.local_play_url != null ? String(o.local_play_url) : null,
      watch_url: o.watch_url != null ? String(o.watch_url) : null,
    }
  })
}

export async function fetchRecommend(
  opts: { n: number; platform?: string; weights?: Record<string, number>; userId?: string },
): Promise<FeedRecommendItem[]> {
  const params = new URLSearchParams({ n: String(opts.n) })
  if (opts.platform) params.set('platform', opts.platform)
  if (opts.userId) params.set('user_id', opts.userId)
  if (opts.weights) params.set('weights', JSON.stringify(opts.weights))
  const resp = await fetch(`${DIGIST}/api/recommend?${params}`)
  if (!resp.ok) throw new Error(`recommend ${resp.status}`)
  const raw = await resp.json()
  return normalizeRecommendPayload(raw)
}

export async function postVideoDigest(url: string, opts?: { forceAsr?: boolean; topic?: string; pushKnowLever?: boolean }) {
  const resp = await fetch(`${DIGIST}/api/video/digest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      topic: opts?.topic,
      force_asr: opts?.forceAsr ?? false,
      push_knowlever: opts?.pushKnowLever ?? false,
    }),
  })
  if (!resp.ok) throw new Error(`digest ${resp.status}`)
  return resp.json() as Promise<{
    summary_preview?: string
    transcript_preview?: string
    method?: string
    title?: string
  }>
}

export async function triggerCrawl(platform: string, query: string) {
  await fetch(`${DIGIST}/api/crawl/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, query }),
  })
}

async function safeJson(resp: Response) {
  const t = await resp.text()
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

async function tryDigistDailyReport(): Promise<DynamicReportPayload | null> {
  try {
    const r = await fetch(`${DIGIST}/api/daily-report`)
    if (!r.ok) return null
    const j = await safeJson(r) as { date?: string; totalItems?: number; markdown?: string } | null
    if (!j?.markdown || !j.totalItems) return null
    return {
      state: 'ready',
      markdown: j.markdown,
      topicUsed: 'digist-daily',
      updatedAt: j.date || null,
      banner: `DiGist 每日摘要 · ${j.date || '今日'}`,
    }
  } catch {
    return null
  }
}

/** 优先从 DiGist 本地 daily-report 加载；降级到 KnowLever 链路。 */
export async function fetchDynamicReport(): Promise<DynamicReportPayload> {
  const digistDaily = await tryDigistDailyReport()
  if (digistDaily) return digistDaily

  let state: ReportCompileState = 'loading'
  let banner: string | null = null

  const tryContract = async (): Promise<DynamicReportPayload | null> => {
    try {
      const u = `${KL}/api/digist/report?user=${encodeURIComponent(KL_USER)}&topic=${encodeURIComponent(PreferTopicDigist)}`
      const r = await fetch(u)
      if (!r.ok) return null
      const j = await safeJson(r)
      if (!j || typeof j !== 'object') return null
      const md =
        typeof (j as { markdown?: unknown }).markdown === 'string'
          ? (j as { markdown: string }).markdown
          : typeof (j as { content?: unknown }).content === 'string'
            ? (j as { content: string }).content
            : ''
      if (!md) return null
      const compileStatus =
        typeof (j as { status?: unknown }).status === 'string' ? String((j as { status: string }).status) : ''
      let st: ReportCompileState = 'ready'
      if (/fail|error/i.test(compileStatus)) st = 'failed'
      else if (/compil|building|queued/i.test(compileStatus)) st = 'compiling'
      return {
        state: st,
        markdown: md,
        topicUsed: PreferTopicDigist,
        updatedAt: typeof j.updated_at === 'string' ? j.updated_at : null,
      }
    } catch {
      return null
    }
  }

  const pickDigistTopic = async (): Promise<{ name: string; pages: number } | null> => {
    try {
      const tr = await fetch(`${KL}/api/topics?user=${encodeURIComponent(KL_USER)}`)
      if (!tr.ok) return PreferTopicDigist ? { name: PreferTopicDigist, pages: 0 } : null
      const tj = await safeJson(tr) as { topics?: { name: string; wiki_pages?: number }[] } | null
      const topics = tj?.topics ?? []
      const digisted = topics.filter(t => /^digist-/i.test(t.name))
      const ranked = [...digisted].sort((a, b) => (b.wiki_pages || 0) - (a.wiki_pages || 0))
      if (ranked[0]?.name) return { name: ranked[0].name, pages: ranked[0].wiki_pages ?? 0 }
      const plain = topics.find(t => /^digist$/i.test(t.name))
      if (plain) return { name: plain.name, pages: plain.wiki_pages ?? 0 }
      return PreferTopicDigist ? { name: PreferTopicDigist, pages: 0 } : null
    } catch {
      return PreferTopicDigist ? { name: PreferTopicDigist, pages: 0 } : null
    }
  }

  const wikiPageMarkdown = async (topic: string): Promise<{ md: string; page: string } | null> => {
    try {
      const pr = await fetch(`${KL}/api/topics/${encodeURIComponent(topic)}/pages?user=${encodeURIComponent(KL_USER)}`)
      if (!pr.ok) return null
      const pj = await safeJson(pr) as { pages?: { filename?: string }[] } | null
      const pages = pj?.pages ?? []
      const names = pages.map(p => String(p.filename || '')).filter(Boolean)
      const prefer = ['clock-feed.md', 'dynamic-digest.md', 'digest.md', 'index.md'].find(p => names.includes(p))
      const fname = prefer || names[0]
      if (!fname) return null
      const gr = await fetch(`${KL}/api/topics/${encodeURIComponent(topic)}/pages/${encodeURIComponent(fname)}?user=${encodeURIComponent(KL_USER)}`)
      if (!gr.ok) return null
      const gj = await safeJson(gr) as { content?: string }
      const md = gj?.content
      if (typeof md !== 'string' || !md.trim()) return null
      return { md, page: fname }
    } catch {
      return null
    }
  }

  const fromDigestFeed = async (): Promise<string> => {
    try {
      const r = await fetch(`${KL}/api/digest-feed?user=${encodeURIComponent(KL_USER)}&limit=30`)
      if (!r.ok) return ''
      const j = await safeJson(r) as { items?: { title?: string; platform?: string; summary?: string; url?: string; routed_at?: string }[] }
      const items = j?.items ?? []
      if (!items.length) return ''
      const md = ['## 条目摘要（KnowLever wiki 暂未就绪 · 降级自 digest-feed）']
      for (const it of items) {
        md.push(
          `\n### ${it.title ?? '条目'}\n_${it.platform ?? ''}_ · ${it.routed_at?.slice(0, 10) ?? ''}\n\n${(it.summary ?? '').slice(0, 800)}`,
        )
      }
      return md.join('\n')
    } catch {
      return ''
    }
  }

  const contract = await tryContract()
  if (contract) return contract

  const topicPick = await pickDigistTopic()
  const topic = topicPick?.name ?? PreferTopicDigist
  const wiki = topic ? await wikiPageMarkdown(topic) : null

  if (wiki?.md) {
    banner = wiki.page !== 'clock-feed.md'
      ? `来自 KnowLever wiki：${topic}/${wiki.page}`
      : null
    return {
      state: 'ready',
      markdown: wiki.md,
      topicUsed: topic,
      updatedAt: null,
      banner,
    }
  }

  state = 'degraded'
  banner =
    topicPick && topicPick.pages === 0 && topicPick.name
      ? `主题 ${topicPick.name} 尚无 wiki 页，使用 digest-feed 降级展示`
      : 'KnowLever 契约接口未就绪，使用 digest-feed 降级展示'

  const degradedMd = await fromDigestFeed()
  if (!degradedMd) {
    return {
      state: 'failed',
      markdown: '_暂无报告内容与 digest 条目。请确认 KnowLever / digist 服务已启动。_',
      topicUsed: topic,
      updatedAt: null,
      banner,
      error: 'NO_CONTENT',
    }
  }

  return {
    state,
    markdown: degradedMd,
    topicUsed: topic,
    updatedAt: null,
    banner,
  }
}

export async function rebuildDynamicReport(topic: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const r = await fetch(`${KL}/api/digist/report/rebuild`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: KL_USER, topic }),
    })
    if (r.ok) return { ok: true }
  } catch { /* noop */ }

  try {
    const r2 = await fetch(`${KL}/api/compile/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, user: KL_USER, force: true, source: 'clock-feed' }),
    })
    const j = await safeJson(r2)
    if (r2.ok && j?.ok !== false) return { ok: true }
    return { ok: false, detail: typeof j?.detail === 'string' ? j.detail : `compile ${r2.status}` }
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) }
  }
}

export async function ingestToKnowLever(
  text: string,
  docId: string,
  extra: Record<string, string>,
): Promise<{ ok: boolean; doc_id?: string; location?: string; error?: string }> {
  try {
    const resp = await fetch(`${KL}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, doc_id: docId, user: KL_USER, extra_meta: extra }),
    })
    if (!resp.ok) {
      return { ok: false, error: `ingest ${resp.status}` }
    }
    const j = await safeJson(resp)
    return {
      ok: true,
      doc_id: j?.doc_id ?? j?.id ?? docId,
      location: j?.location ?? j?.path ?? undefined,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function queryIngestStatus(docId: string): Promise<{
  status: string; queryable: boolean; location?: string
} | null> {
  try {
    const resp = await fetch(`${KL}/api/ingest/${encodeURIComponent(docId)}/status?user=${encodeURIComponent(KL_USER)}`)
    if (!resp.ok) return null
    const j = await safeJson(resp)
    return {
      status: j?.status ?? 'unknown',
      queryable: j?.queryable === true || j?.status === 'indexed',
      location: j?.location ?? j?.path ?? undefined,
    }
  } catch {
    return null
  }
}

export async function listSources(userId?: string): Promise<DigistSourceRow[]> {
  const q = userId ? `?user_id=${encodeURIComponent(userId)}` : ''
  const r = await fetch(`${DIGIST}/api/sources${q}`)
  if (!r.ok) throw new Error(`sources ${r.status}`)
  const j = await safeJson(r) as { sources?: DigistSourceRow[] }
  return j?.sources ?? []
}

export async function upsertSource(body: { name: string; kind?: string; endpoint?: string; metadata?: Record<string, unknown> }) {
  const r = await fetch(`${DIGIST}/api/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`source upsert ${r.status}`)
}

export async function deleteSource(id: string) {
  const r = await fetch(`${DIGIST}/api/sources/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!r.ok && r.status !== 404) throw new Error(`source del ${r.status}`)
}

/** digist 反馈（契约占位；服务端 404 时由 UI 标明 mock）。 */
export async function submitDigistFeedback(payload: {
  item_id?: string
  url?: string
  reason: string
  note?: string
}): Promise<{ ok: boolean; mock: boolean }> {
  try {
    const r = await fetch(`${DIGIST}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (r.status === 404) return { ok: false, mock: true }
    return { ok: r.ok, mock: false }
  } catch {
    return { ok: false, mock: true }
  }
}
