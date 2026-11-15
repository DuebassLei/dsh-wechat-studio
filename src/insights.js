// 复盘：导入公众号后台导出 → 按标题对上稿面 → 聚合对比 → 提炼规则。
// 只算导出里真有的指标；单篇阅读是导出窗口内的合计，不是历史总阅读。
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HOOKS, HOOK_IDS } from './article.js'
import { BANNER_STYLES } from './banner.js'
import { STYLE_NAMES, THEME_NAMES } from './layout.js'
import { parseWorkbook } from './xls.js'

const BUNDLED = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')
const MIN_SAMPLE = 3
export const INSIGHTS_EMPTY = { v: 1, tendency: null, growth: null, matches: {}, hooks: {}, details: [], experiments: [] }
export const EXPERIMENT_RESULTS = { repeat: '值得再试', observe: '继续观察', stop: '到此为止' }

export const normTitle = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
const num = value => {
  if (value == null || String(value).trim() === '') return null
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
const isoDate = value => {
  const s = String(value ?? '').trim()
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('.')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}
const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const avg = list => (list.length ? Math.round(list.reduce((s, n) => s + n, 0) / list.length) : 0)

// ---------- 导入解析 ----------

/** 按表头把并排的几张表分开：空列是分隔，每张表靠自己的特征表头认。 */
function columnBlocks(rows, headerIndex) {
  const width = Math.max(...rows.map(r => r.length))
  const empty = []
  for (let col = 0; col < width; col++) {
    empty[col] = rows.every((row, i) => i <= headerIndex || row[col] == null || row[col] === '')
  }
  const blocks = []
  let current = []
  for (let col = 0; col < width; col++) {
    if (empty[col]) { if (current.length) blocks.push(current); current = [] }
    else current.push(col)
  }
  if (current.length) blocks.push(current)
  return blocks.map(cols => ({ cols, headers: cols.map(c => String(rows[headerIndex][c] ?? '').trim()) }))
}

function windowFromText(rows, pattern) {
  for (const row of rows) for (const cell of row) {
    const m = pattern.exec(String(cell ?? ''))
    if (m) return m
  }
  return null
}

export function parseTendency(buffer, fileName) {
  const { sheets } = parseWorkbook(buffer)
  const rows = sheets[0].rows
  const headerIndex = rows.findIndex(row => row.some(cell => String(cell ?? '').trim() === '内容标题'))
  if (headerIndex === -1) throw new Error('这份导出里没有找到「内容标题」表，请确认导的是「数据趋势」')
  const blocks = columnBlocks(rows, headerIndex)
  const find = (...names) => blocks.find(b => names.every(n => b.headers.includes(n)))
  const readsBlock = find('渠道', '阅读人数')
  const metricsBlock = find('分享人数', '发表篇数')
  const articleBlock = find('内容标题', '传播渠道')
  if (!articleBlock) throw new Error('导出缺少单篇阅读表')

  const col = (block, name) => block.cols[block.headers.indexOf(name)]
  const dailyMap = new Map()
  const day = date => {
    if (!dailyMap.has(date)) dailyMap.set(date, { date, reads: null, shares: null, readOriginal: null, favorites: null, published: null, channels: {} })
    return dailyMap.get(date)
  }
  if (readsBlock) {
    const [dc, cc, rc] = [col(readsBlock, '日期'), col(readsBlock, '渠道'), col(readsBlock, '阅读人数')]
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const date = isoDate(rows[i][dc])
      const channel = String(rows[i][cc] ?? '').trim()
      const reads = num(rows[i][rc])
      if (!date || !channel || reads == null) continue
      const entry = day(date)
      entry.channels[channel] = reads
      if (channel === '全部') entry.reads = reads
    }
  }
  if (metricsBlock) {
    const fields = { 分享人数: 'shares', 跳转阅读原文人数: 'readOriginal', 微信收藏人数: 'favorites', 发表篇数: 'published' }
    const dc = col(metricsBlock, '日期')
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const date = isoDate(rows[i][dc])
      if (!date) continue
      const entry = day(date)
      for (const [header, field] of Object.entries(fields)) {
        if (!metricsBlock.headers.includes(header)) continue
        const value = num(rows[i][col(metricsBlock, header)])
        if (value != null) entry[field] = value
      }
    }
  }
  const articleMap = new Map()
  const [pc, tc, cc, rc, sc] = ['发表日期', '内容标题', '传播渠道', '阅读人数', '阅读人数占比'].map(n => col(articleBlock, n))
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const publishedAt = isoDate(rows[i][pc])
    const title = String(rows[i][tc] ?? '').trim()
    const channel = String(rows[i][cc] ?? '').trim()
    const reads = num(rows[i][rc])
    if (!publishedAt || !title || reads == null) continue
    const key = `${publishedAt}|${title}`
    if (!articleMap.has(key)) articleMap.set(key, { key, title, publishedAt, reads: null, share: null, channels: {} })
    const entry = articleMap.get(key)
    if (channel === '全部') { entry.reads = reads; entry.share = num(rows[i][sc]); entry.hasTotal = true }
    else entry.channels[channel] = reads
  }
  const articles = [...articleMap.values()].map(a => ({ ...a, hasTotal: Boolean(a.hasTotal), reads: a.reads ?? Object.values(a.channels).reduce((s, n) => s + n, 0) }))
  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date))
  const m = windowFromText(rows, /数据趋势概况[（(](\d{4}[.\-]\d{1,2}[.\-]\d{1,2})\s*[-至]\s*(\d{4}[.\-]\d{1,2}[.\-]\d{1,2})[）)]/)
  const window = m ? { from: isoDate(m[1]), to: isoDate(m[2]) } : { from: daily[0]?.date, to: daily.at(-1)?.date }
  if (!window.from || !window.to) throw new Error('读不出导出的日期范围')
  return { kind: 'tendency', fileName, importedAt: new Date().toISOString(), window, daily, articles }
}

export function parseGrowth(buffer, fileName) {
  const { sheets } = parseWorkbook(buffer)
  const rows = sheets[0].rows
  const headerIndex = rows.findIndex(row => row.some(cell => String(cell ?? '').trim() === '新关注人数'))
  if (headerIndex === -1) throw new Error('这份导出里没有找到「新关注人数」表，请确认导的是「用户增长」')
  const headers = rows[headerIndex].map(c => String(c ?? '').trim())
  const col = name => headers.indexOf(name)
  const daily = []
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const date = isoDate(rows[i][col('时间')])
    if (!date) continue
    daily.push({
      date, newFollows: num(rows[i][col('新关注人数')]) ?? 0, unfollows: num(rows[i][col('取消关注人数')]) ?? 0,
      net: num(rows[i][col('净增关注人数')]) ?? 0, total: num(rows[i][col('累积关注人数')]) ?? 0,
    })
  }
  const m = windowFromText(rows, /用户增长[（(](\d{4}-\d{2}-\d{2})\s*至\s*(\d{4}-\d{2}-\d{2})[）)]/)
  const window = m ? { from: m[1], to: m[2] } : { from: daily[0]?.date, to: daily.at(-1)?.date }
  return { kind: 'growth', fileName, importedAt: new Date().toISOString(), window, daily }
}

/** 认文件：有「内容标题」是数据趋势，有「新关注人数」是用户增长。 */
export function parseArticleDetail(rows, fileName) {
  const firstCell = row => row?.find(cell => cell != null && String(cell).trim() !== '')
  const overview = rows.findIndex(row => firstCell(row) === '数据概况')
  const title = String(firstCell(rows[0]) ?? '').trim()
  if (overview < 1 || !title) throw new Error('找不到单篇明细的完整标题或数据概况')
  const sections = new Set(['数据概况', '阅读转化', '阅读数据趋势明细', '性别分布', '年龄分布', '地域分布'])
  const tables = {}
  let section
  for (const row of rows.slice(overview)) {
    const cells = row.filter(cell => cell != null && String(cell).trim() !== '')
    if (cells.length === 1 && sections.has(cells[0])) {
      section = cells[0]
      tables[section] = []
    } else if (section && cells.length >= 2) {
      const offset = row.indexOf(cells[0])
      const end = row.lastIndexOf(cells.at(-1)) + 1
      tables[section].push(row.slice(offset, end))
    }
  }
  const metrics = sectionName => (tables[sectionName] ?? []).flatMap(([label, raw]) => {
    const value = num(raw)
    return value == null ? [] : [{ label, value }]
  })
  const daily = (tables['阅读数据趋势明细'] ?? []).flatMap(([rawDate, channel, reads, shares]) => {
    const date = isoDate(rawDate)
    return date && channel ? [{ date, channel, reads: num(reads), shares: num(shares) }] : []
  }).sort((a, b) => a.date.localeCompare(b.date))
  const overviewMetrics = metrics('数据概况')
  if (!overviewMetrics.length) throw new Error('单篇明细没有可用的数据指标')
  const audience = ['性别分布', '年龄分布', '地域分布'].flatMap(name =>
    tables[name]?.length > 1 ? [{ name, headings: tables[name][0], rows: tables[name].slice(1) }] : [])
  return { kind: 'detail', key: JSON.stringify([normTitle(title), daily[0]?.date ?? null]), title,
    fileName, importedAt: new Date().toISOString(), metrics: overviewMetrics, conversion: metrics('阅读转化'),
    daily, audience, window: daily.length ? { from: daily[0].date, to: daily.at(-1).date } : null }
}

export function importData(buffer, fileName) {
  const { sheets } = parseWorkbook(buffer)
  const detail = sheets.find(sheet => sheet.rows.some(row => row.includes('阅读数据趋势明细')) &&
    sheet.rows.some(row => row.includes('数据概况')))
  if (detail) return parseArticleDetail(detail.rows, fileName)
  const text = sheets.flatMap(s => s.rows.flat()).map(c => String(c ?? '')).join('\n')
  if (text.includes('内容标题')) return parseTendency(buffer, fileName)
  if (text.includes('新关注人数')) return parseGrowth(buffer, fileName)
  throw new Error('认不出这份导出，请选择「数据趋势」「用户增长」或文章的「数据明细」。')
}

// ---------- 匹配与聚合 ----------

function autoMatch(exportTitle, drafts) {
  const target = normTitle(exportTitle)
  const hits = drafts.filter(d => normTitle(d.title) === target)
  return hits.length === 1 ? hits[0].id : null // 同名多篇时不猜，留给手动
}

export function enrichRows(state, drafts) {
  if (!state.tendency) return []
  return state.tendency.articles.map(row => {
    const manual = state.matches[row.key]
    const articleId = manual !== undefined ? manual : autoMatch(row.title, drafts)
    const draft = articleId ? drafts.find(d => d.id === articleId) : null
    const manualHook = state.hooks[row.key]
    const hook = manualHook ?? draft?.hook ?? null
    const skin = draft?.layoutPreferences ?? null
    return {
      ...row, articleId: draft ? articleId : null, draftTitle: draft?.title ?? null,
      hook, hookSource: manualHook ? 'manual' : draft?.hook ? 'draft' : null,
      hookName: hook ? `${hook} • ${HOOKS[hook] ?? hook}` : null,
      banner: draft?.bannerStyle ?? null,
      bannerName: draft?.bannerStyle ? bannerName(draft.bannerStyle) : null,
      skin,
      skinName: skin ? `${STYLE_NAMES[skin.style] ?? skin.style} · ${THEME_NAMES[skin.theme] ?? skin.theme}` : null,
      coverId: draft?.cover?.id ?? null, coverFormat: draft?.cover?.format ?? 'png',
      matched: Boolean(draft),
    }
  }).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt) || b.reads - a.reads)
}

const bannerName = id => (id === 'none' ? '不要横幅' : BANNER_STYLES[id]?.name ?? id)

function compareDimension(rows, dimension, nameOf) {
  const groups = new Map()
  for (const row of rows) {
    const value = dimension === 'skin' ? (row.skin ? `${row.skin.style}/${row.skin.theme}` : null) : row[dimension]
    const id = value ?? '__none__'
    if (!groups.has(id)) groups.set(id, { id, name: value == null ? '未记录' : nameOf(value), count: 0, reads: [], articles: [] })
    const group = groups.get(id)
    group.count++
    group.reads.push(row.reads)
    group.articles.push({ key: row.key, title: row.title, reads: row.reads })
  }
  const list = [...groups.values()].map(g => ({
    id: g.id === '__none__' ? null : g.id, name: g.name, count: g.count,
    avgReads: avg(g.reads), totalReads: g.reads.reduce((s, n) => s + n, 0),
    articles: g.articles.sort((a, b) => b.reads - a.reads),
    recorded: g.id !== '__none__', enough: g.id !== '__none__' && g.count >= MIN_SAMPLE,
  }))
  return list.sort((a, b) => (b.recorded - a.recorded) || (b.enough - a.enough) || (b.avgReads - a.avgReads))
}

const DIMENSIONS = {
  hook: { label: '标题套路', nameOf: id => `${id} • ${HOOKS[id] ?? id}`, target: 'headline' },
  banner: { label: '开头横幅', nameOf: bannerName, target: 'banner' },
  skin: { label: '正文皮肤', nameOf: id => { const [s, t] = String(id).split('/'); return `${STYLE_NAMES[s] ?? s} · ${THEME_NAMES[t] ?? t}` }, target: null },
}

export function buildRules(rows) {
  const rules = []
  for (const [dimension, meta] of Object.entries(DIMENSIONS)) {
    const groups = compareDimension(rows, dimension, meta.nameOf).filter(g => g.enough)
    if (groups.length < 2) continue
    const [top, bottom] = [groups[0], groups.at(-1)]
    const diff = top.avgReads - bottom.avgReads
    const diffPct = bottom.avgReads > 0 ? Math.round((diff / bottom.avgReads) * 100) : null
    rules.push({
      id: `${dimension}:${top.id}`, dimension, dimensionLabel: meta.label, target: meta.target,
      top: { id: top.id, name: top.name, avgReads: top.avgReads, count: top.count, articles: top.articles },
      bottom: { id: bottom.id, name: bottom.name, avgReads: bottom.avgReads, count: bottom.count, articles: bottom.articles },
      diff, diffPct,
      text: `「${top.name}」平均阅读 ${top.avgReads.toLocaleString('zh-CN')}（${top.count} 篇），比「${bottom.name}」高 ${diff.toLocaleString('zh-CN')}${diffPct != null ? `（${diffPct}%）` : ''}（${bottom.avgReads.toLocaleString('zh-CN')}，${bottom.count} 篇）。`,
    })
  }
  return rules
}

export function buildInsights(state, drafts, range = 'all') {
  const allRows = enrichRows(state, drafts)
  const tendency = state.tendency
  const window = tendency?.window ?? null
  const rangeStart = !window ? null : range === '7' ? addDays(window.to, -6) : range === '30' ? addDays(window.to, -29) : window.from
  const inRange = date => date && date >= rangeStart && date <= window.to
  // 日期筛选按发表日期作用于文章；「全部」保留导出里的所有文章（含长尾旧文）。单篇阅读仍是导出窗口合计，不重切
  const rows = range === 'all' ? allRows : allRows.filter(r => inRange(r.publishedAt))
  const daily = tendency?.daily ?? []
  const sum = field => daily.some(d => d[field] != null) ? daily.reduce((s, d) => s + (d[field] ?? 0), 0) : null
  const growthDaily = [...(state.growth?.daily ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const details = (state.details ?? []).map(detail => {
    const candidates = allRows.filter(row => normTitle(row.title) === normTitle(detail.title))
    const manual = detail.articleKey !== undefined
    const articleKey = manual ? allRows.find(row => row.key === detail.articleKey)?.key ?? null
      : candidates.length === 1 ? candidates[0].key : null
    const matched = allRows.find(row => row.key === articleKey)
    const draft = matched?.articleId ? drafts.find(item => item.id === matched.articleId) : null
    return { ...detail, articleKey, manual, publishedAt: matched?.publishedAt ?? null, draftId: draft?.id ?? null,
      draftContext: matched ? { hook: matched.hookName, banner: matched.bannerName, skin: matched.skinName,
        opening: draft?.blocks?.filter(block => block.text?.trim()).slice(0, 2).map(block => block.text.slice(0, 260)).join('\n\n') } : null }
  })
  const readsList = rows.map(r => r.reads)
  const compare = {
    hook: compareDimension(rows, 'hook', DIMENSIONS.hook.nameOf),
    banner: compareDimension(rows, 'banner', DIMENSIONS.banner.nameOf),
    skin: compareDimension(rows, 'skin', DIMENSIONS.skin.nameOf),
  }
  const byDate = new Map()
  for (const row of rows) {
    if (!byDate.has(row.publishedAt)) byDate.set(row.publishedAt, [])
    byDate.get(row.publishedAt).push(row)
  }
  const calendar = {
    from: rangeStart, to: window?.to ?? null,
    days: [...byDate.entries()].filter(([date]) => inRange(date)).map(([date, list]) => ({ date, count: list.length, avgReads: avg(list.map(r => r.reads)), titles: list.map(r => r.title) })),
  }
  const rules = buildRules(rows)
  return {
    hasData: Boolean(tendency || state.growth || details.length),
    details,
    experiments: state.experiments ?? [],
    detailTargets: allRows.map(({ key, title, publishedAt }) => ({ key, title, publishedAt })),
    articleRange: window ? { from: rangeStart, to: window.to } : null,
    tendency: tendency ? { fileName: tendency.fileName, importedAt: tendency.importedAt, window } : null,
    growth: state.growth ? { fileName: state.growth.fileName, importedAt: state.growth.importedAt, window: state.growth.window } : null,
    range, rangeStart,
    cards: {
      published: sum('published'), reads: sum('reads'), shares: sum('shares'), favorites: sum('favorites'),
      withReads: rows.length, avgReads: avg(readsList), maxReads: readsList.length ? Math.max(...readsList) : 0,
      netFollows: growthDaily.reduce((s, d) => s + d.net, 0), totalFollows: growthDaily.at(-1)?.total ?? null,
      hasGrowth: Boolean(state.growth),
    },
    daily, growthDaily,
    articles: rows,
    compare, calendar, rules,
    rulesInsufficient: rules.length === 0,
    unmatched: allRows.filter(r => !r.matched),
    drafts: drafts.map(d => ({ id: d.id, title: d.title || '未命名文章', hook: d.hook ?? null })),
    minSample: MIN_SAMPLE,
  }
}

// ---------- 写进写作 skill：先预览，确认后才写 ----------

const SECTION_HEAD = '## 数据复盘规则'

function ruleSection(rule, window) {
  const evidence = group => group.articles.map(a => `《${a.title}》${a.reads.toLocaleString('zh-CN')}`).join('；')
  const lines = [
    SECTION_HEAD,
    '',
    `> 来自公众号后台导出（${window.from} 至 ${window.to}），${new Date().toISOString().slice(0, 10)} 生成。样本量小，仅供参考，别当硬规则。`,
    '',
    `- ${rule.dimensionLabel}：${rule.text}`,
    `  - 高的那组：${evidence(rule.top)}`,
    `  - 低的那组：${evidence(rule.bottom)}`,
  ]
  return lines.join('\n')
}

function replaceSection(base, section) {
  const lines = base.split('\n')
  const start = lines.findIndex(line => /^## 数据复盘规则\s*$/.test(line))
  if (start === -1) return `${base.replace(/\s+$/, '')}\n\n${section}\n`
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) { end = i; break }
  }
  lines.splice(start, end - start, ...section.split('\n'))
  return lines.join('\n')
}

async function readSkillRaw(skillsDir, name) {
  for (const dir of [skillsDir, BUNDLED]) {
    try { return { text: await readFile(join(dir, `${name}.md`), 'utf8'), fromUser: dir === skillsDir } } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }
  throw new Error(`找不到 skill：${name}.md`)
}

/** 生成要写入的预览。不写文件。 */
export async function previewRule(state, drafts, ruleId, skillsDir, range = 'all') {
  const scope = buildInsights(state, drafts, range)
  const rule = scope.rules.find(r => r.id === ruleId)
  if (!rule) throw Object.assign(new Error('这条规则已经不成立了，数据可能变了'), { status: 409 })
  if (!rule.target) throw Object.assign(new Error('皮肤对比只作参考，不写进 skill'), { status: 400 })
  const { text, fromUser } = await readSkillRaw(skillsDir, rule.target)
  const section = ruleSection(rule, state.tendency.window) +
    (range !== 'all' ? `\n- 文章发表范围：${scope.articleRange.from} 至 ${scope.articleRange.to}。` : '')
  return {
    ruleId, skill: rule.target, path: join(skillsDir, `${rule.target}.md`),
    isCopy: !fromUser, section, newContent: replaceSection(text, section),
    replaces: /^## 数据复盘规则/m.test(text),
  }
}

/** 确认后写入。服务端重新算一遍，不信客户端传来的内容。 */
export async function applyRule(state, drafts, ruleId, skillsDir, range = 'all') {
  const preview = await previewRule(state, drafts, ruleId, skillsDir, range)
  await mkdir(skillsDir, { recursive: true })
  const tmp = `${preview.path}.${process.pid}.tmp`
  await writeFile(tmp, preview.newContent, { mode: 0o600 })
  await rename(tmp, preview.path)
  return { skill: preview.skill, path: preview.path }
}

export { HOOKS, HOOK_IDS, STYLE_NAMES, THEME_NAMES, bannerName }
