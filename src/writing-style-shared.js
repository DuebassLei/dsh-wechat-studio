// 浏览器与服务端共用的纯函数：样本清洗、预算采样、风格档案规范化、可导入稿件过滤。
// 严禁在此文件引入任何 node:* 模块，否则前端 browser 打包会失败。

export const STYLE_PROFILE_VERSION = 1
export const MAX_SAMPLE_CHARS = 20000
const MIN_SAMPLE_CHARS = 30
const TRUNCATION_MARK = '\n……\n'
const ITEM_SEPARATOR = '\n\n---\n\n'

export const STYLE_LIMITS = {
  name: 40,
  summary: 80,
  voice: [5, 120],
  rhythm: [5, 120],
  phrases: [12, 30],
  taboos: [12, 30],
  excerpts: [5, 220],
  userNote: 200,
  headlineLengthRange: 30,
  headlineHooks: [4, 80],
  headlinePunctuation: 80,
  headlineSummaryStyle: 100,
}

const cleanStr = (value, max) => (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim().slice(0, max) : '')

function cleanList(value, [maxItems, maxLen]) {
  const seen = new Set()
  const out = []
  for (const item of Array.isArray(value) ? value : []) {
    const text = cleanStr(item, maxLen)
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
    if (out.length >= maxItems) break
  }
  return out
}

/**
 * 清洗单篇文章样本：去掉 YAML frontmatter、代码块、图片语法、裸链接、HTML 标签和固定收尾句，保留纯文字表达。
 */
export function cleanArticleSample(text, { fixedLines = [] } = {}) {
  let out = String(text ?? '').replace(/\r\n?/g, '\n')
  out = out.replace(/^---\n[\s\S]*?\n---\n?/, '')
  out = out.replace(/```[\s\S]*?```/g, '\n').replace(/~~~[\s\S]*?~~~/g, '\n')
  out = out.replace(/!\[(?:\\.|[^\]\\])*\]\([^)]*\)/g, '')
  out = out.replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
  out = out.replace(/https?:\/\/[^\s<>)\]]+/g, '')
  out = out.replace(/<\/?[a-zA-Z][^>]*>/g, '')

  const fixedSet = new Set(
    (Array.isArray(fixedLines) ? fixedLines : [])
      .map(line => String(line ?? '').trim())
      .filter(Boolean),
  )

  const lines = out
    .split('\n')
    .map(line => line.trimEnd())
    .filter(line => !fixedSet.has(line.trim()))

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function truncateTextToBudget(text, budget) {
  if (budget <= 0) return ''
  if (text.length <= budget) return text
  if (budget <= TRUNCATION_MARK.length + 2) return text.slice(0, budget)
  const contentBudget = budget - TRUNCATION_MARK.length
  const head = Math.max(1, Math.floor(contentBudget * 0.6))
  const tail = Math.max(1, contentBudget - head)
  return `${text.slice(0, head)}${TRUNCATION_MARK}${text.slice(text.length - tail)}`
}

/**
 * 把多篇参考文章清洗并按严格字数上限均匀采样。
 * 保证 bundle.combined.length <= maxChars 且 bundle.totalChars <= maxChars。
 */
export function buildSampleBundle(samples, { maxChars = MAX_SAMPLE_CHARS, fixedLines = [] } = {}) {
  const cleaned = []
  for (let i = 0; i < (Array.isArray(samples) ? samples.length : 0); i++) {
    const entry = samples[i]
    const rawText = typeof entry === 'string' ? entry : entry?.text
    const text = cleanArticleSample(rawText, { fixedLines })
    if (text.length < MIN_SAMPLE_CHARS) continue
    const title = cleanStr(typeof entry === 'string' ? '' : entry?.title, 60) || `参考文章 ${cleaned.length + 1}`
    cleaned.push({ title, text, originalChars: text.length })
  }

  if (!cleaned.length) {
    throw Object.assign(new Error('至少提供一篇包含正文的参考文章（清洗后需不少于 30 字）。'), { status: 400 })
  }

  const headerOf = (item, idx) => `【参考文章 ${idx + 1}：${item.title}】\n`
  const overhead =
    (cleaned.length - 1) * ITEM_SEPARATOR.length +
    cleaned.reduce((sum, item, idx) => sum + headerOf(item, idx).length, 0)
  const bodyBudget = Math.max(cleaned.length * 10, maxChars - overhead)

  const totalBody = cleaned.reduce((sum, item) => sum + item.text.length, 0)
  let truncated = false
  let items

  if (totalBody <= bodyBudget) {
    items = cleaned
  } else {
    truncated = true
    const perItem = Math.floor(bodyBudget / cleaned.length)
    items = cleaned.map(item => {
      const next = truncateTextToBudget(item.text, perItem)
      return { ...item, text: next }
    })
  }

  let combined = items.map((item, idx) => `${headerOf(item, idx)}${item.text}`).join(ITEM_SEPARATOR)
  if (combined.length > maxChars) {
    truncated = true
    combined = combined.slice(0, maxChars)
  }

  return {
    items,
    combined,
    totalChars: combined.length,
    truncated,
  }
}

function extractFallbackExcerpts(fallbackSamples) {
  const out = []
  const seen = new Set()
  for (const sample of Array.isArray(fallbackSamples) ? fallbackSamples : []) {
    const text = String(typeof sample === 'string' ? sample : sample?.text ?? '')
    for (const para of text.split(/\n{2,}/)) {
      const clean = para.replace(/^#{1,6}\s+/, '').replace(/\s+/g, ' ').trim()
      if (clean.length < 35 || seen.has(clean)) continue
      const clipped = clean.slice(0, STYLE_LIMITS.excerpts[1])
      seen.add(clipped)
      out.push(clipped)
      if (out.length >= 3) return out
    }
  }
  return out
}

function compactSpace(text) {
  return String(text ?? '').replace(/\s+/g, '')
}

function filterVerifiedExcerpts(excerpts, fallbackSamples) {
  const sampleCorpus = (Array.isArray(fallbackSamples) ? fallbackSamples : [])
    .map(sample => compactSpace(typeof sample === 'string' ? sample : sample?.text ?? ''))
    .filter(Boolean)
  if (!sampleCorpus.length) return excerpts
  return excerpts.filter(excerpt => {
    const needle = compactSpace(excerpt)
    return needle.length >= 10 && sampleCorpus.some(haystack => haystack.includes(needle))
  })
}

/**
 * 规范化 StyleProfile：补全缺省值、去重、并对全部字段应用长度与数量上限。
 * 传入 fallbackSamples 时，会校验 excerpts 确实出自原文样本，丢弃臆造摘录并从原文兜底补齐。
 */
export function normalizeStyleProfile(raw = {}, fallbackSamples = []) {
  const src = raw && typeof raw === 'object' ? raw : {}
  const hl = src.headline && typeof src.headline === 'object' ? src.headline : {}
  let excerpts = cleanList(src.excerpts, STYLE_LIMITS.excerpts)
  if (fallbackSamples?.length) {
    excerpts = filterVerifiedExcerpts(excerpts, fallbackSamples)
    if (!excerpts.length) {
      excerpts = extractFallbackExcerpts(fallbackSamples)
    }
  }

  return {
    version: STYLE_PROFILE_VERSION,
    name: cleanStr(src.name, STYLE_LIMITS.name) || '我的写作风格',
    summary: cleanStr(src.summary, STYLE_LIMITS.summary) || '平实克制、贴近日常交流的公众号写作风格',
    voice: cleanList(src.voice, STYLE_LIMITS.voice),
    rhythm: cleanList(src.rhythm, STYLE_LIMITS.rhythm),
    phrases: cleanList(src.phrases, STYLE_LIMITS.phrases),
    taboos: cleanList(src.taboos, STYLE_LIMITS.taboos),
    headline: {
      lengthRange: cleanStr(hl.lengthRange, STYLE_LIMITS.headlineLengthRange) || '14–24 字',
      hooks: cleanList(hl.hooks, STYLE_LIMITS.headlineHooks),
      punctuation: cleanStr(hl.punctuation, STYLE_LIMITS.headlinePunctuation) || '少用感叹号，以自然陈述或疑问为主',
      summaryStyle: cleanStr(hl.summaryStyle, STYLE_LIMITS.headlineSummaryStyle) || '一句交代核心看点，不剧透结尾',
    },
    excerpts,
    userNote: cleanStr(src.userNote, STYLE_LIMITS.userNote),
  }
}

/**
 * 筛选可作为写作风格参考样本的馆藏稿件（未归档且有正文字数）。
 */
export function pickableStyleArticles(articles) {
  return (Array.isArray(articles) ? articles : []).filter(a => a && !a.archivedAt && Number(a.chars) > 0)
}
