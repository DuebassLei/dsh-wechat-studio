// 朱雀报告：把下载的 PDF 取成文字，再对回文章里的段落。
// 报告的版式没有公开规范，所以对段落这一步交给模型，结果只收白名单字段并校验段号。
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { callModel, extractJson } from './ai.js'
import { isCheckable, plainOf } from './article.js'

const PDFTOTEXT = ['pdftotext', '/opt/homebrew/bin/pdftotext', '/usr/local/bin/pdftotext']

function tryPdftotext(bin, file) {
  return new Promise((resolve, reject) => {
    execFile(bin, ['-layout', file, '-'], { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)))
  })
}

/**
 * PDF → 文字。装了 pdftotext 就用它（和 zhuque skill 的做法一致），没有就用打包进来的 unpdf。
 * @param {Buffer} buffer - PDF 内容。
 * @returns {Promise<string>} 报告文字。
 */
export async function pdfToText(buffer) {
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw Object.assign(new Error('这不是 PDF 文件。请上传朱雀下载的检测报告 PDF。'), { status: 400 })
  const dir = await mkdtemp(join(tmpdir(), 'wechat-studio-pdf-'))
  const file = join(dir, 'report.pdf')
  await writeFile(file, buffer)
  for (const bin of PDFTOTEXT) {
    try {
      const text = await tryPdftotext(bin, file)
      if (text.trim()) return text
    } catch {
      // 没装或者失败，换下一个
    }
  }
  const { extractText, getDocumentProxy } = await import('../dist/unpdf.mjs')
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const { text } = await extractText(pdf, { mergePages: true })
  if (!String(text).trim()) throw Object.assign(new Error('没能从这份 PDF 里读出文字，可能是扫描件。'), { status: 422 })
  return String(text)
}

export function reportOverall(reportText) {
  // unpdf 会把「片段」等提取成康熙部首字符，NFKC 归一化后才能匹配
  const lines = String(reportText).normalize('NFKC').split(/\r?\n/).filter(line => /^\s*\d+\s+片段\s*\d+/.test(line))
  if (!lines.length) return null
  const rows = lines.map(line => line.match(/^\s*\d+\s+片段\s*\d+\s+(\d+(?:\.\d+)?)%\s+[\d,]+\s+(0(?:\.\d+)?|1(?:\.0+)?)\s*$/))
  if (rows.some(row => !row)) return null
  const totals = { human: 0, suspect: 0, ai: 0 }
  let sum = 0
  for (const row of rows) {
    const ratio = Number(row[1])
    const score = Number(row[2])
    if (ratio < 0 || ratio > 100) return null
    const level = score < 0.5 ? 'human' : score < 0.99 ? 'suspect' : 'ai'
    totals[level] += ratio
    sum += ratio
  }
  if (sum < 99 || sum > 101) return null
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(value * 10) / 10]))
}

const SYSTEM = `你在帮作者核对一份「朱雀 AI 检测」报告。报告把文章切成若干片段，每个片段有一个 AIGC 值：
0–0.5 是人工特征，0.5–0.99 是疑似 AI，0.99–1 是 AI 特征。片段的切分位置和文章的段落不一定对齐。

你的任务：按文字内容，把报告里 AIGC 值 ≥ 0.5 的片段对回文章的段落编号。
- 一个片段可能盖住好几段，这几段都列出来，分数都用这个片段的 AIGC 值。
- 一段被多个片段盖住时取最高的分数。
- 只按报告里写明的数值填，不要自己判断哪段像 AI，报告里没有的不要列。
- 报告里如果有总体占比（人工特征 / 疑似 AI / AI 特征的百分比），原样填进 overall，没有就填 null。

只输出 JSON，不要解释：
{"overall":{"human":数字或null,"suspect":数字或null,"ai":数字或null},"segments":[{"block":段落编号,"score":0到1的小数}]}`

/**
 * 让模型把报告片段对回段落，然后给每个可检测的段落打上「标红」或「通过」。
 * @param {object} ctx - Cordis 上下文。
 * @param {object} article - 文章，会被就地修改。
 * @param {string} reportText - 报告文字。
 * @returns {Promise<{flagged: number, passed: number, overall: object|null}>} 结果统计。
 */
export async function applyReport(ctx, article, reportText) {
  const body = article.blocks.map((block, index) => (isCheckable(block.text) ? `【${index + 1}】${plainOf(block.text)}` : null)).filter(Boolean).join('\n\n')
  if (!body) throw Object.assign(new Error('这篇文章还没有可以检测的正文段落。'), { status: 400 })
  const raw = await callModel(ctx, { system: SYSTEM, user: `# 朱雀报告\n${reportText.slice(0, 60000)}\n\n# 文章段落\n${body}`, task: 'report', maxTokens: 4000 })
  const parsed = extractJson(raw)
  if (!parsed || !Array.isArray(parsed.segments)) throw Object.assign(new Error('没能读懂这份报告。请确认它是朱雀的检测报告，并且检测的是这篇文章。'), { status: 422 })
  return markBlocks(article, parsed)
}

const RANK = { suspect: 1, ai: 2 }
const heavier = (a, b) => RANK[a.level] > RANK[b.level] || (a.level === b.level && a.score > b.score)

/**
 * 把一轮检测结果落到段落上：标红、通过，或者（对不上的）不下结论。
 * @param {object} article - 文章，会被就地修改。
 * @param {{segments: Array<{block: number, score: number, level?: string}>, covered?: Set<number>, overall?: object}} parsed -
 *   标红的段（段号 1 起）。没给 level 的按 AIGC 值算：≥0.5 疑似，≥0.99 AI。给了 covered 时，只有对上了的段才算通过。
 * @param {'pdf'|'api'} [source] - 结果来自报告 PDF 还是 API。两者的分数含义不同，界面上分开显示。
 */
export function markBlocks(article, parsed, source = 'pdf') {
  const found = new Map()
  for (const row of parsed.segments.slice(0, 2000)) {
    const index = Number.isInteger(row?.block) ? row.block - 1 : -1
    const score = Number(row?.score)
    const given = row?.level === 'ai' || row?.level === 'suspect' ? row.level : null
    if (!article.blocks[index] || !isCheckable(article.blocks[index].text) || !(score >= 0 && score <= 1)) continue
    if (!given && score < 0.5) continue
    const hit = { score, level: given ?? (score >= 0.99 ? 'ai' : 'suspect') }
    if (!found.has(index) || heavier(hit, found.get(index))) found.set(index, hit)
  }
  const covered = parsed.covered instanceof Set ? parsed.covered : null
  const round = (article.zhuque?.round ?? 0) + 1
  let flagged = 0
  let passed = 0
  let unmatched = 0
  article.blocks.forEach((block, index) => {
    if (!isCheckable(block.text)) return
    const hit = found.get(index)
    const before = block.check
    if (!hit) {
      if (covered && !covered.has(index)) {
        block.check = null
        unmatched += 1
        return
      }
      block.check = { status: 'pass', round }
      passed += 1
      return
    }
    flagged += 1
    // 上一轮改过、这一轮反而更重：提示退回上一版（zhuque skill 第 5 步）
    const worse = before?.status === 'fixed' && typeof before.score === 'number' && Boolean(block.prev) && heavier(hit, { score: before.score, level: before.level ?? 'suspect' })
    block.check = { status: 'flag', score: Math.round(hit.score * 100) / 100, level: hit.level, source, round, fixes: before?.fixes ?? 0, worse }
  })
  const num = value => (Number.isFinite(Number(value)) && value !== null ? Number(value) : null)
  const overall = parsed.overall && typeof parsed.overall === 'object' ? { human: num(parsed.overall.human), suspect: num(parsed.overall.suspect), ai: num(parsed.overall.ai) } : null
  article.zhuque = { round, lastAt: new Date().toISOString(), overall, flagged, passed, source }
  article.updatedAt = article.zhuque.lastAt
  return { flagged, passed, unmatched, overall }
}
