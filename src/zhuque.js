// 朱雀 API：通过腾讯云 EdgeOne Makers 的内置模型 @makers/zhuque-text 检测文本。
// 文档：https://cloud.tencent.com/document/product/1552/137539
// 返回里每个片段带原文、标签和置信度，所以片段对回段落是按文字比对，不需要模型参与。
import { isCheckable, plainOf } from './article.js'

export const DEFAULT_ENDPOINT = 'https://ai-gateway.edgeone.link/v1/providers/zhuque-text/classify'
const TIMEOUT_MS = 90_000
// 片段标签：0 人工，1 AI 生成，2 疑似 AI
const LEVEL = { 1: 'ai', 2: 'suspect' }
const RANK = { suspect: 1, ai: 2 }

function fail(message, status = 502) {
  return Object.assign(new Error(message), { status })
}

export function checkEndpoint(value) {
  let url
  try {
    url = new URL(String(value))
  } catch {
    throw fail('接口地址不是有效的网址', 400)
  }
  // 密钥会随请求发到这个地址，所以只允许 https
  if (url.protocol !== 'https:') throw fail('接口地址必须以 https:// 开头', 400)
  return url.toString()
}

/**
 * 调一次朱雀文本检测。
 * @param {string} text - 待检测文本。
 * @param {{key: string, endpoint?: string, fetchImpl?: typeof fetch}} options - 密钥、接口地址，测试时可以换掉 fetch。
 * @returns {Promise<{overall: object|null, segments: Array<{text: string, label: number, conf: number}>, tokens: number|null}>} 结果。
 */
export async function detect(text, { key, endpoint = DEFAULT_ENDPOINT, fetchImpl = fetch }) {
  if (!key) throw fail('还没有设置朱雀 API Key', 400)
  if (!String(text).trim()) throw fail('没有可以检测的文字', 400)
  let res
  try {
    res = await fetchImpl(checkEndpoint(endpoint), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      // is_merge=false 才会逐段给结果；合并模式整篇只有一个结论，没法定位到段落
      body: JSON.stringify({ text, is_merge: false }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw fail(err.name === 'TimeoutError' ? '朱雀接口超时，稍后再试' : `连不上朱雀接口：${err.message}`)
  }
  const raw = await res.text()
  let data = null
  try {
    data = JSON.parse(raw)
  } catch {
    // 不是 JSON，下面按状态码报错
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw fail('朱雀 API Key 无效或没有权限，到设置里检查一下')
    const detail = data?.msg || data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || data?.message || raw.slice(0, 200)
    if (res.status === 429) throw fail(`朱雀接口限流或额度用完了${detail ? `：${detail}` : ''}`)
    throw fail(`朱雀接口报错（${res.status}）${detail ? `：${detail}` : ''}`)
  }
  if (!data) throw fail('朱雀接口返回的不是 JSON')
  if (data.status && data.status !== 'success') throw fail(data.msg || `朱雀接口状态异常：${data.status}`)
  const pct = value => (Number.isFinite(Number(value)) ? Math.round(Number(value) * 1000) / 10 : null)
  const ratio = data.labels_ratio && typeof data.labels_ratio === 'object' ? data.labels_ratio : null
  const segments = (Array.isArray(data.segment_labels) ? data.segment_labels : [])
    .filter(seg => seg && typeof seg.text === 'string')
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .slice(0, 2000)
    .map(seg => ({ text: seg.text, label: Number(seg.label), conf: Math.max(0, Math.min(1, Number(seg.conf) || 0)) }))
  const tokens = Number(data.makers_models_usage?.total_tokens ?? data.usage?.total_tokens)
  return {
    overall: ratio ? { human: pct(ratio['0']), ai: pct(ratio['1']), suspect: pct(ratio['2']) } : null,
    segments,
    tokens: Number.isFinite(tokens) ? tokens : null,
  }
}

const squash = text => String(text).replace(/\s+/g, '')

const PROBE = 10
function probes(flat) {
  if (flat.length < PROBE) return []
  const mid = Math.floor((flat.length - PROBE) / 2)
  return [0, mid, flat.length - PROBE].map(at => flat.slice(at, at + PROBE))
}

/**
 * 段落和片段是不是同一处文字。朱雀的切分和我们的段落不一定对齐，所以除了互相包含，
 * 还看一方的头、中、尾有没有一截出现在另一方里（一段被切成两个片段时靠这个对上）。
 */
function overlaps(block, segment) {
  if (!block || !segment) return false
  if (segment.includes(block)) return true
  if (segment.length >= 8 && block.includes(segment)) return true
  return probes(block).some(part => segment.includes(part)) || probes(segment).some(part => block.includes(part))
}

/**
 * 把朱雀的片段按文字对回文章段落。一段被多个片段盖住时取最重的结论。
 * @param {object} article - 文章。
 * @param {Array<{text: string, label: number, conf: number}>} segments - 朱雀返回的片段。
 * @returns {{segments: Array<{block: number, score: number, level: string}>, covered: Set<number>}} 标红的段（段号 1 起）和所有对上了的段（下标 0 起）。
 */
export function mapSegments(article, segments) {
  const squashed = segments.map(seg => ({ ...seg, flat: squash(seg.text) })).filter(seg => seg.flat)
  const rows = []
  const covered = new Set()
  article.blocks.forEach((block, index) => {
    if (!isCheckable(block.text)) return
    const flat = squash(plainOf(block.text))
    let worst = null
    for (const seg of squashed) {
      if (!overlaps(flat, seg.flat)) continue
      covered.add(index)
      const level = LEVEL[seg.label]
      if (!level) continue
      if (!worst || RANK[level] > RANK[worst.level] || (level === worst.level && seg.conf > worst.score)) worst = { level, score: seg.conf }
    }
    if (worst) rows.push({ block: index + 1, ...worst })
  })
  return { segments: rows, covered }
}
