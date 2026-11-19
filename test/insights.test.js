import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createArticle, HOOK_IDS } from '../src/article.js'
import { buildInsights, enrichRows, importData, INSIGHTS_EMPTY, normTitle, parseGrowth, parseTendency, previewRule, applyRule } from '../src/insights.js'
import { Pipeline } from '../src/pipeline.js'
import { JsonStore, Store } from '../src/store.js'
import { parseHtmlTables, parseWorkbook } from '../src/xls.js'

// ---------- 最小 BIFF8 生成器：合成 fixture，不提交真实后台数据 ----------

const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b }
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b }
const f64 = n => { const b = Buffer.alloc(8); b.writeDoubleLE(n); return b }
const rec = (type, data) => Buffer.concat([u16(type), u16(data.length), data])
const isWide = s => [...s].some(c => c.charCodeAt(0) > 255)
const longString = s => Buffer.concat([u16(s.length), Buffer.from([isWide(s) ? 1 : 0]), isWide(s) ? Buffer.from(s, 'utf16le') : Buffer.from(s, 'latin1')])
const shortString = s => Buffer.concat([Buffer.from([s.length, isWide(s) ? 1 : 0]), isWide(s) ? Buffer.from(s, 'utf16le') : Buffer.from(s, 'latin1')])

function oleWrap(stream) {
  const SS = 512
  let body = stream
  if (body.length < 4096) body = Buffer.concat([body, rec(0x00ff, Buffer.alloc(4096 - body.length))])
  const dataSectors = Math.ceil(body.length / SS)
  const fat = Buffer.alloc(SS, 0xff)
  fat.writeUInt32LE(0xfffffffd, 0)
  fat.writeUInt32LE(0xfffffffe, 4)
  for (let i = 0; i < dataSectors; i++) fat.writeUInt32LE(i === dataSectors - 1 ? 0xfffffffe : 3 + i, (2 + i) * 4)
  const dir = Buffer.alloc(SS)
  const entry = (off, name, type, start, size) => {
    const nb = Buffer.from(name + '\0', 'utf16le')
    nb.copy(dir, off)
    dir.writeUInt16LE(nb.length, off + 0x40)
    dir[off + 0x42] = type; dir[off + 0x43] = 1
    dir.writeUInt32LE(0xffffffff, off + 0x44); dir.writeUInt32LE(0xffffffff, off + 0x48); dir.writeUInt32LE(0xffffffff, off + 0x4c)
    dir.writeUInt32LE(start >>> 0, off + 0x74); dir.writeUInt32LE(size >>> 0, off + 0x78)
  }
  entry(0, 'Root Entry', 5, 0xfffffffe, 0)
  entry(128, 'Workbook', 2, 2, body.length)
  const header = Buffer.alloc(SS)
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0)
  header.writeUInt16LE(0x003e, 0x18); header.writeUInt16LE(0x0003, 0x1a); header.writeUInt16LE(0xfffe, 0x1c)
  header.writeUInt16LE(9, 0x1e); header.writeUInt16LE(6, 0x20)
  header.writeUInt32LE(0, 0x28); header.writeUInt32LE(1, 0x2c); header.writeUInt32LE(1, 0x30)
  header.writeUInt32LE(4096, 0x38); header.writeUInt32LE(0xfffffffe, 0x3c); header.writeUInt32LE(0, 0x40)
  header.writeUInt32LE(0xfffffffe, 0x44); header.writeUInt32LE(0, 0x48)
  for (let i = 0; i < 109; i++) header.writeUInt32LE(i === 0 ? 0 : 0xffffffff, 0x4c + i * 4)
  const out = Buffer.alloc(SS * (3 + dataSectors))
  header.copy(out, 0); fat.copy(out, SS); dir.copy(out, SS * 2); body.copy(out, SS * 3)
  return out
}

/** sheets: [{name, rows}]。单元格：string→LABELSST，整数→RK，小数→NUMBER；{label}/{mulrk}/{bool}/{formula} 走对应记录。 */
function makeXls(sheets) {
  const sst = []; const index = new Map()
  const intern = s => { if (!index.has(s)) { index.set(s, sst.length); sst.push(s) } return index.get(s) }
  const sheetBuffers = sheets.map(sheet => {
    const recs = [rec(0x0809, Buffer.concat([u16(0x0600), u16(0x0010), Buffer.alloc(12)]))]
    sheet.rows.forEach((row, r) => row.forEach((value, c) => {
      if (value == null || value === '') return
      if (typeof value === 'object' && value.mulrk) {
        const v = value.mulrk
        recs.push(rec(0xbd, Buffer.concat([u16(r), u16(c), ...v.flatMap(n => [u16(0), u32((n * 4 + 2) >>> 0)]), u16(c + v.length - 1)])))
      } else if (typeof value === 'object' && value.label !== undefined) {
        recs.push(rec(0x204, Buffer.concat([u16(r), u16(c), u16(0), longString(value.label)])))
      } else if (typeof value === 'object' && value.bool !== undefined) {
        recs.push(rec(0x205, Buffer.concat([u16(r), u16(c), u16(0), Buffer.from([value.bool ? 1 : 0, 0])])))
      } else if (typeof value === 'object' && value.formula !== undefined) {
        recs.push(rec(0x06, Buffer.concat([u16(r), u16(c), u16(0), f64(value.formula), u16(0), u16(0), u16(0)])))
      } else if (typeof value === 'string') {
        recs.push(rec(0xfd, Buffer.concat([u16(r), u16(c), u16(0), u32(intern(value))])))
      } else if (Number.isInteger(value)) {
        recs.push(rec(0x27e, Buffer.concat([u16(r), u16(c), u16(0), u32((value * 4 + 2) >>> 0)])))
      } else {
        recs.push(rec(0x203, Buffer.concat([u16(r), u16(c), u16(0), f64(value)])))
      }
    }))
    recs.push(rec(0x0a, Buffer.alloc(0)))
    return Buffer.concat(recs)
  })
  const sstBuf = rec(0xfc, Buffer.concat([u32(sst.length), u32(sst.length), ...sst.map(longString)]))
  const bof = rec(0x0809, Buffer.concat([u16(0x0600), u16(0x0005), Buffer.alloc(12)]))
  const eof = rec(0x0a, Buffer.alloc(0))
  const boundLens = sheets.map(s => 4 + 2 + shortString(s.name).length + 4)
  const prefix = bof.length + sstBuf.length + boundLens.reduce((a, b) => a + b, 0) + eof.length
  let offset = prefix
  const bounds = sheets.map((s, i) => {
    const start = offset; offset += sheetBuffers[i].length
    return rec(0x85, Buffer.concat([u32(start), u16(0), shortString(s.name)]))
  })
  return oleWrap(Buffer.concat([bof, sstBuf, ...bounds, eof, ...sheetBuffers]))
}

// ---------- 合成的「数据趋势」导出（三张并排表） ----------

const ARTICLES = [
  { title: '朋友问我怎么排版，我写了这套流程', date: '2026-10-02', total: 5000, hook: 'C', banner: 'poster', skin: { style: 'neo', theme: 'petrol' } },
  { title: '被读者催更后，我把改稿做成了对话', date: '2026-10-03', total: 5200, hook: 'C', banner: 'poster', skin: { style: 'neo', theme: 'petrol' } },
  { title: '有人求助标题怎么写，我整理了五种', date: '2026-10-04', total: 5600, hook: 'C', banner: 'poster', skin: { style: 'neo', theme: 'petrol' } },
  { title: '我以为排版很难，结果交给脚本就行', date: '2026-10-05', total: 4800, hook: 'A', banner: 'card', skin: { style: 'mag', theme: 'blue' } },
  { title: '原本不想写复盘，数据逼我写了', date: '2026-10-06', total: 5000, hook: 'A', banner: 'card', skin: { style: 'mag', theme: 'blue' } },
  { title: '我错了，标题不该这么起', date: '2026-10-07', total: 5100, hook: 'A', banner: 'card', skin: { style: 'mag', theme: 'blue' } },
  { title: '一年前的旧文还在被搜到', date: '2026-09-01', total: null, channels: { 搜索: 80, 主页: 20 } },
]
const DAILY = [
  ['2026-10-01', 1200, 30, 5, 1], ['2026-10-02', 1500, 40, 8, 1], ['2026-10-03', 900, 20, 3, 0],
  ['2026-10-04', 2000, 50, 10, 1], ['2026-10-05', 1700, 45, 9, 1], ['2026-10-06', 1400, 35, 7, 1], ['2026-10-07', 1600, 40, 8, 1],
]

function tendencyRows() {
  const head = ['日期', '渠道', '阅读人数', '', '日期', '分享人数', '跳转阅读原文人数', '微信收藏人数', '发表篇数', '', '发表日期', '内容标题', '传播渠道', '阅读人数', '阅读人数占比']
  const articleRows = []
  for (const a of ARTICLES) {
    if (a.total != null) {
      articleRows.push([a.date, a.title, '全部', a.total, 0.5])
      if (a === ARTICLES[0]) articleRows.push([a.date, a.title, '公众号会话', 3000, 0.3])
    } else for (const [ch, n] of Object.entries(a.channels)) articleRows.push([a.date, a.title, ch, n, 0.5])
  }
  const rows = [['数据趋势概况（2026.10.01-2026.10.07）'], head]
  const depth = Math.max(DAILY.length, articleRows.length)
  for (let i = 0; i < depth; i++) {
    const row = Array(15).fill('')
    if (DAILY[i]) { const [d, reads, shares, fav, pub] = DAILY[i]; row[0] = d; row[1] = '全部'; row[2] = reads; row[4] = d; row[5] = shares; row[6] = 2; row[7] = fav; row[8] = pub }
    if (articleRows[i]) { const [d, t, ch, n, pct] = articleRows[i]; row[10] = d; row[11] = t; row[12] = ch; row[13] = n; row[14] = pct }
    rows.push(row)
  }
  return rows
}

const toHtml = rows => '<html><body><table>' + rows.map(r => '<tr>' + r.map(c => `<td>${c === '' ? '' : String(c).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>`).join('') + '</tr>').join('') + '</table></body></html>'
const tendencyXls = () => makeXls([{ name: '数据趋势', rows: tendencyRows() }])
const stripVolatile = p => ({ window: p.window, daily: p.daily, articles: p.articles })

function draftFor(a) {
  const d = createArticle({ markdown: `# ${a.title}\n\n这是一段足够长的正文内容，用来让稿件有实际字数。` })
  d.hook = a.hook ?? null
  if (a.banner) d.bannerStyle = a.banner
  if (a.skin) d.layoutPreferences = a.skin
  d.cover = { id: `cov-${a.date}`, format: 'png' }
  return d
}
const matchedDrafts = () => ARTICLES.filter(a => a.total != null).map(draftFor)

// ---------- xls 解析 ----------

test('xls：BIFF8 与 HTML 两条路解析同一份数据趋势，结果一致', () => {
  const rows = tendencyRows()
  const fromXls = parseWorkbook(tendencyXls())
  const fromHtml = parseWorkbook(Buffer.from(toHtml(rows)))
  assert.equal(fromXls.sheets[0].name, '数据趋势')
  assert.deepEqual(stripVolatile(parseTendency(tendencyXls(), 't.xls')), stripVolatile(parseTendency(Buffer.from(toHtml(rows)), 't.xls')))
  assert.equal(fromHtml.sheets.length, 1)
})

test('xls：LABEL / MULRK / BOOLERR / FORMULA / 中文表名 / 小数', () => {
  const buf = makeXls([{ name: '表一', rows: [
    [{ label: '内联字符串' }, { bool: true }, { formula: 42 }, 3.5],
    [{ mulrk: [10, 20, 30] }],
  ] }])
  const { sheets } = parseWorkbook(buf)
  assert.equal(sheets[0].name, '表一')
  assert.deepEqual(sheets[0].rows[0], ['内联字符串', true, 42, 3.5])
  assert.deepEqual(sheets[0].rows[1], [10, 20, 30, null])
})

test('xls：认不出的文件报错，不猜', () => {
  assert.throws(() => parseWorkbook(Buffer.from('这不是表格')), /认不出/)
  assert.throws(() => parseHtmlTables('<html><body>没有表</body></html>'), /没有找到数据表格/)
})

// ---------- 导入解析 ----------

test('数据趋势：窗口、每日、单篇（全部行与渠道回退）', () => {
  const p = parseTendency(tendencyXls(), 'tendency.xls')
  assert.equal(p.kind, 'tendency')
  assert.deepEqual(p.window, { from: '2026-10-01', to: '2026-10-07' })
  assert.equal(p.daily.length, 7)
  assert.equal(p.daily[0].reads, 1200)
  assert.equal(p.daily[3].shares, 50)
  assert.equal(p.articles.length, 7)
  const first = p.articles.find(a => a.title === ARTICLES[0].title)
  assert.equal(first.reads, 5000)
  assert.equal(first.hasTotal, true)
  assert.equal(first.channels['公众号会话'], 3000)
  const old = p.articles.find(a => a.title === ARTICLES[6].title)
  assert.equal(old.reads, 100, '没有全部行时按渠道求和')
  assert.equal(old.hasTotal, false)
})

test('用户增长：HTML 导出按日解析', () => {
  const html = '<table><tr><td>用户增长（2026-10-01 至 2026-10-03）</td></tr><tr><td>时间</td><td>新关注人数</td><td>取消关注人数</td><td>净增关注人数</td><td>累积关注人数</td></tr>'
    + '<tr><td>2026-10-01</td><td>10</td><td>2</td><td>8</td><td>100</td></tr>'
    + '<tr><td>2026-10-02</td><td>12</td><td>3</td><td>9</td><td>109</td></tr></table>'
  const g = parseGrowth(Buffer.from(html), 'growth.xls')
  assert.deepEqual(g.window, { from: '2026-10-01', to: '2026-10-03' })
  assert.equal(g.daily.length, 2)
  assert.equal(g.daily[1].net, 9)
  assert.equal(g.daily[1].total, 109)
})

test('importData：认文件类型，认不出就报错', () => {
  assert.equal(importData(tendencyXls(), 't.xls').kind, 'tendency')
  const growth = '<table><tr><td>时间</td><td>新关注人数</td></tr><tr><td>2026-10-01</td><td>5</td></tr></table>'
  assert.equal(importData(Buffer.from(growth), 'g.xls').kind, 'growth')
  assert.throws(() => importData(Buffer.from('<table><tr><td>别的</td></tr></table>'), 'x.xls'), /认不出/)
})

// ---------- 匹配与聚合 ----------

test('匹配：同名唯一自动对上，同名多篇不猜，手动指定优先', () => {
  const tendency = parseTendency(tendencyXls(), 't.xls')
  const drafts = matchedDrafts()
  const state = { ...INSIGHTS_EMPTY, tendency }
  const rows = enrichRows(state, drafts)
  assert.equal(rows.filter(r => r.matched).length, 6)
  assert.equal(rows.find(r => r.title === ARTICLES[6].title).matched, false, '旧文没有稿件')
  const first = rows.find(r => r.title === ARTICLES[0].title)
  assert.equal(first.hook, 'C')
  assert.equal(first.hookSource, 'draft')
  assert.equal(first.bannerName, '大字海报')
  assert.equal(first.skinName, '质感 · 孔雀青')
  assert.equal(first.coverId, 'cov-2026-10-02')
  // 同名多篇 → 不自动配
  const dup = [...drafts, draftFor(ARTICLES[0])]
  assert.equal(enrichRows(state, dup).find(r => r.title === ARTICLES[0].title).matched, false)
  // 手动指定 + 手动钩子覆盖
  const oldKey = `${ARTICLES[6].date}|${ARTICLES[6].title}`
  const manual = { ...state, matches: { [oldKey]: drafts[0].id }, hooks: { [first.key]: 'B' } }
  const mrows = enrichRows(manual, drafts)
  assert.equal(mrows.find(r => r.key === oldKey).matched, true)
  const mh = mrows.find(r => r.key === first.key)
  assert.equal(mh.hook, 'B')
  assert.equal(mh.hookSource, 'manual')
})

test('聚合：数字卡、日期筛选、对比分组、样本不足、星期热力', () => {
  const tendency = parseTendency(tendencyXls(), 't.xls')
  const state = { ...INSIGHTS_EMPTY, tendency }
  const drafts = matchedDrafts()
  const all = buildInsights(state, drafts, 'all')
  assert.equal(all.hasData, true)
  assert.equal(all.cards.published, 6)
  assert.equal(all.cards.reads, 10300)
  assert.equal(all.cards.withReads, 7)
  assert.equal(all.articles.length, 7)
  const week = buildInsights(state, drafts, '7')
  assert.equal(week.articles.length, 6, '近 7 天排除窗口外的旧文')
  assert.equal(week.articles.every(r => r.publishedAt >= '2026-10-01'), true)
  const hookC = all.compare.hook.find(g => g.id === 'C')
  const hookA = all.compare.hook.find(g => g.id === 'A')
  assert.equal(hookC.count, 3)
  assert.equal(hookC.avgReads, 5267)
  assert.equal(hookC.enough, true)
  assert.equal(hookA.avgReads, 4967)
  assert.equal(all.compare.hook.find(g => g.id === null).name, '未记录')
  assert.equal(all.calendar.days.length, 6, '日历只画窗口内的发表日，窗口外旧文不上日历')
  // 样本不足：只有两篇时不出规则
  const sparse = buildInsights(state, drafts.slice(0, 2), 'all')
  assert.equal(sparse.rulesInsufficient, true)
  assert.equal(sparse.rules.length, 0)
})

test('规则：够样本才出，附依据；皮肤规则不写 skill', () => {
  const tendency = parseTendency(tendencyXls(), 't.xls')
  const state = { ...INSIGHTS_EMPTY, tendency }
  const view = buildInsights(state, matchedDrafts(), 'all')
  const hookRule = view.rules.find(r => r.dimension === 'hook')
  assert.equal(hookRule.top.id, 'C')
  assert.equal(hookRule.bottom.id, 'A')
  assert.equal(hookRule.diff, 300)
  assert.equal(hookRule.target, 'headline')
  assert.match(hookRule.text, /「C • 被求助」平均阅读 5,267（3 篇）/)
  assert.equal(hookRule.top.articles.length, 3)
  const skinRule = view.rules.find(r => r.dimension === 'skin')
  assert.equal(skinRule.target, null)
  assert.ok(view.rules.find(r => r.dimension === 'banner'))
})

test('写进 skill：先预览不写文件，确认后写副本，再预览是替换；皮肤与失效规则拒绝', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ws-ins-skill-'))
  const skillsDir = join(root, 'skills')
  const tendency = parseTendency(tendencyXls(), 't.xls')
  const state = { ...INSIGHTS_EMPTY, tendency }
  const drafts = matchedDrafts()
  const preview = await previewRule(state, drafts, 'hook:C', skillsDir)
  assert.equal(preview.skill, 'headline')
  assert.equal(preview.isCopy, true)
  assert.equal(preview.replaces, false)
  assert.match(preview.section, /## 数据复盘规则/)
  assert.match(preview.newContent, /高的那组/)
  await assert.rejects(readFileMaybe(preview.path), /ENOENT/, '预览不写文件')
  const applied = await applyRule(state, drafts, 'hook:C', skillsDir)
  assert.equal(applied.skill, 'headline')
  const written = readFileSync(preview.path, 'utf8')
  assert.match(written, /## 数据复盘规则/)
  const again = await previewRule(state, drafts, 'hook:C', skillsDir)
  assert.equal(again.isCopy, false)
  assert.equal(again.replaces, true)
  await assert.rejects(previewRule(state, drafts, 'skin:neo/petrol', skillsDir), { status: 400 })
  await assert.rejects(previewRule(state, drafts, 'hook:不存在', skillsDir), { status: 409 })
})

async function readFileMaybe(path) {
  const { readFile } = await import('node:fs/promises')
  return readFile(path, 'utf8')
}

// ---------- Host 路由 ----------

function insDeps(store) {
  return { ctx: { get: () => null }, store, pipeline: { job: () => null }, insightsStore: new JsonStore(store.root, { file: 'insights.json', empty: INSIGHTS_EMPTY }) }
}
async function insRequest(deps, path, { raw, post } = {}) {
  const payload = raw ?? (post ? Buffer.from(JSON.stringify(post)) : null)
  const req = { url: '/wechat-studio/' + path, method: payload ? 'POST' : 'GET', async *[Symbol.asyncIterator]() { if (payload) yield payload } }
  let result
  await deps.route(deps, req, { setHeader() {}, end(v) { result = JSON.parse(v) } })
  return result
}

test('复盘路由：导入 → 筛选 → 打标 → 手动匹配 → 预览 → 写入', async () => {
  const { route } = await import('../src/host.js')
  const store = new Store(mkdtempSync(join(tmpdir(), 'ws-ins-route-')))
  const drafts = matchedDrafts()
  await store.update(s => { s.articles.push(...drafts) })
  const deps = { ...insDeps(store), route }
  const empty = await insRequest(deps, 'insights/data')
  assert.equal(empty.hasData, false)
  const imported = await insRequest(deps, 'insights/import?name=t.xls&range=all', { raw: tendencyXls() })
  assert.equal(imported.hasData, true)
  assert.equal(imported.articles.length, 7)
  assert.equal(imported.unmatched.length, 1)
  const week = await insRequest(deps, 'insights/data?range=7')
  assert.equal(week.articles.length, 6)
  const preview = await insRequest(deps, 'insights/rule-preview', { post: { ruleId: 'hook:C' } })
  assert.equal(preview.skill, 'headline')
  const applied = await insRequest(deps, 'insights/rule-apply', { post: { ruleId: 'hook:C' } })
  assert.equal(applied.skill, 'headline')
  assert.match(readFileSync(applied.path, 'utf8'), /## 数据复盘规则/)
  const firstKey = imported.articles.find(a => a.title === ARTICLES[0].title).key
  const tagged = await insRequest(deps, 'insights/hook', { post: { key: firstKey, hook: 'B', range: 'all' } })
  const taggedRow = tagged.articles.find(a => a.key === firstKey)
  assert.equal(taggedRow.hook, 'B')
  assert.equal(taggedRow.hookSource, 'manual')
  assert.equal((await insRequest(deps, 'insights/hook', { post: { key: firstKey, hook: 'Z' } })).error, '没有这种钩子类型')
  const oldKey = imported.unmatched[0].key
  const matched = await insRequest(deps, 'insights/match', { post: { key: oldKey, articleId: drafts[0].id, range: 'all' } })
  assert.equal(matched.unmatched.length, 0)
  const reset = await insRequest(deps, 'insights/match', { post: { key: oldKey, articleId: 'auto', range: 'all' } })
  assert.equal(reset.unmatched.length, 1)
})

test('单篇明细可独立导入，匹配后保留趋势表口径，重导保留手动匹配', async () => {
  const { route } = await import('../src/host.js')
  const store = new Store(mkdtempSync(join(tmpdir(), 'ws-detail-route-')))
  const deps = { ...insDeps(store), route }
  const raw = makeXls([{ name: '单篇', rows: [
    [null, ARTICLES[0].title],
    [null, '数据概况'],
    [null, '数据指标', '数值'],
    [null, '完读率', '0.113387'],
    [null, '阅读(人)', 43497],
    [null, '阅读数据趋势明细'],
    [null, '日期', '传播渠道', '阅读人数', '分享人数'],
    [null, '2026-10-01', '全部', 100, 7],
  ] }])
  const imported = await insRequest(deps, 'insights/import?name=detail.xls', { raw })
  assert.equal(imported.hasData, true)
  assert.equal(imported.details[0].articleKey, null)
  assert.equal(imported.details[0].metrics[0].value, 0.113387)
  const combined = await insRequest(deps, 'insights/import?name=t.xls', { raw: tendencyXls() })
  const detail = combined.details[0]
  assert.equal(detail.articleKey, combined.articles.find(row => row.title === ARTICLES[0].title).key)
  assert.notEqual(combined.articles.find(row => row.key === detail.articleKey).reads, 43497)
  await insRequest(deps, 'insights/detail-match', { post: { key: detail.key, articleKey: null } })
  const reimported = await insRequest(deps, 'insights/import?name=detail.xls', { raw })
  assert.equal(reimported.details.length, 1)
  assert.equal(reimported.details[0].articleKey, null)
  assert.equal(reimported.details[0].manual, true)
  const filtered = await insRequest(deps, 'insights/data?range=7')
  assert.equal(filtered.cards.reads, combined.cards.reads)
  assert.deepEqual(filtered.daily, combined.daily)
  const planned = await insRequest(deps, 'insights/experiment', { post: { sourceKey: detail.key, action: '  首屏先放结果截图  ' } })
  const [experiment] = planned.experiments
  assert.equal(experiment.action, '首屏先放结果截图')
  assert.equal(experiment.draftId, null)
  const nextDraft = createArticle({ topic: '下一篇工具实测' })
  await store.update(state => { state.articles.push(nextDraft) })
  await insRequest(deps, 'insights/experiment', { post: { ...experiment, draftId: nextDraft.id } })
  const reviewed = await insRequest(deps, 'insights/experiment', { post: { ...experiment, draftId: nextDraft.id, result: 'observe' } })
  assert.equal(reviewed.experiments[0].result, 'observe')
  const edited = await insRequest(deps, 'insights/experiment', { post: { ...reviewed.experiments[0], action: '首屏改放操作视频' } })
  assert.equal(edited.experiments[0].result, null)
})

// ---------- 成稿流程记录钩子 ----------

test('出标题：每个候选带钩子，自动选第一条时记下钩子', async () => {
  const store = new Store(mkdtempSync(join(tmpdir(), 'ws-ins-hook-')))
  const answer = JSON.stringify({ titles: [{ text: '被求助的标题', hook: 'C' }, { text: '打脸的标题', hook: 'A' }, { text: '没钩子', hook: '乱填' }], summary: '摘要', recommendationReason: '具体' })
  const llm = { prepareCall: async () => ({ config: {}, async *stream() { yield { type: 'text-delta', text: answer }; yield { type: 'finish', reason: { kind: 'stop' } } } }) }
  const pipeline = new Pipeline({ ctx: { get: name => ({ llm, agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) } })[name] }, store })
  const article = createArticle({ markdown: '# 草稿\n\n正文' })
  article.title = ''
  await store.update(s => { s.articles.push(article); s.currentId = article.id })
  await pipeline.titles(article.id)
  const saved = (await store.read()).articles[0]
  assert.deepEqual(saved.titles.map(t => t.hook), ['C', 'A', null])
  assert.equal(saved.title, '被求助的标题')
  assert.equal(saved.hook, 'C')
  assert.equal(saved.titles[0].recommended, true)
})

test('换标题：把候选的钩子带到稿件上', async () => {
  const { route } = await import('../src/host.js')
  const store = new Store(mkdtempSync(join(tmpdir(), 'ws-ins-pick-')))
  const article = createArticle({ markdown: '# 旧标题\n\n正文' })
  article.titles = [{ text: '候选甲', hook: 'C' }, { text: '候选乙', hook: 'A' }]
  article.hook = 'C'
  await store.update(s => { s.articles.push(article); s.currentId = article.id })
  const deps = { ...insDeps(store), pipeline: { job: () => null }, route }
  await insRequest(deps, 'title/pick', { post: { id: article.id, text: '候选乙' } })
  const saved = (await store.read()).articles[0]
  assert.equal(saved.title, '候选乙')
  assert.equal(saved.hook, 'A')
})

test('手动换标题：保存候选以外的标题并支持撤销', async () => {
  const { route } = await import('../src/host.js')
  const store = new Store(mkdtempSync(join(tmpdir(), 'ws-ins-custom-title-')))
  const article = createArticle({ markdown: '# 旧标题\n\n正文' })
  article.titles = [{ text: '候选甲', hook: 'C' }]
  article.hook = 'C'
  await store.update(s => { s.articles.push(article); s.currentId = article.id })
  const deps = { ...insDeps(store), pipeline: { job: () => null }, route }
  await insRequest(deps, 'title/pick', { post: { id: article.id, text: '  我自己定的标题  ' } })
  let saved = (await store.read()).articles[0]
  assert.equal(saved.title, '我自己定的标题')
  assert.equal(saved.hook, null)
  assert.equal(saved.history.at(-1).label, '换标题')
  await insRequest(deps, 'undo', { post: { id: article.id } })
  saved = (await store.read()).articles[0]
  assert.equal(saved.title, '旧标题')
  assert.equal(saved.hook, 'C')
})

test('normTitle：NFKC 与空白归一', () => {
  assert.equal(normTitle('ＡＢＣ  标题'), 'ABC 标题')
  assert.equal(HOOK_IDS.includes('C'), true)
})
