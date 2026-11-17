// 排版：直接调用 vendor/layout 里的 layout.py（来自 lqshow/wechat-article-skills），不重写一遍。
// 产物是一个自带风格、配色切换和复制按钮的完整 HTML 页面，前端放进 iframe 里用。
import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VENDOR = join(dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'layout')
// 从访达启动的桌面应用 PATH 很短，Homebrew 的 python 不一定找得到，所以挨个试
const PYTHONS = [process.env.WECHAT_STUDIO_PYTHON, 'python3', '/usr/bin/python3', '/opt/homebrew/bin/python3', '/usr/local/bin/python3'].filter(Boolean)
export const STYLES = ['std', 'mag', 'min', 'geek', 'bold', 'neo', 'note', 'zen', 'bento', 'dark']
export const THEMES = ['orange', 'blue', 'teal', 'ink', 'navy', 'violet', 'rose', 'amber', 'morandi', 'forest', 'petrol', 'mist', 'matcha', 'cocoa', 'dusty']
// 显示名与 vendor/layout/layout.py 的 STYLES/THEMES 保持一致，复盘对比块用
export const STYLE_NAMES = { std: '标准', mag: '杂志', min: '极简', geek: '极客', bold: '醒目', neo: '质感', note: '手账', zen: '雅致', bento: '卡片', dark: '暗夜' }
export const THEME_NAMES = { orange: '品牌橙', blue: '科技蓝', teal: '薄荷绿', ink: '墨黑', navy: '藏青金', violet: '葡萄紫', rose: '胭脂红', amber: '琥珀', morandi: '莫兰迪', forest: '松柏金', petrol: '孔雀青', mist: '雾霾蓝', matcha: '橄榄绿', cocoa: '可可棕', dusty: '豆沙粉' }

export function resolveLayoutPreferences(settings = {}, article = {}) {
  const preferred = article.layoutPreferences ?? {}
  return {
    style: STYLES.includes(preferred.style) ? preferred.style : STYLES.includes(settings.style) ? settings.style : 'std',
    theme: THEMES.includes(preferred.theme) ? preferred.theme : THEMES.includes(settings.theme) ? settings.theme : 'orange',
  }
}

function run(file, args, { input, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { cwd, timeout: 60_000, maxBuffer: 32 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' } }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stderr }))
      else resolve({ stdout, stderr })
    })
    if (input !== undefined) child.stdin.end(input)
  })
}

async function python(args, options) {
  let missing = null
  for (const bin of PYTHONS) {
    try {
      return await run(bin, args, options)
    } catch (err) {
      if (err.code !== 'ENOENT') throw new Error((err.stderr || err.message).trim().split('\n').slice(-3).join('\n'))
      missing = err
    }
  }
  throw Object.assign(new Error('没找到 python3。排版脚本需要 Python 3，装好后重启 DeepSeek Harness；也可以用环境变量 WECHAT_STUDIO_PYTHON 指定路径。'), { cause: missing, status: 424 })
}

/**
 * 把 Markdown 排成公众号版式页面。
 * @param {string} markdown - 文章 Markdown。
 * @param {{style?: string, theme?: string, banner?: object, followCard?: boolean, brand?: {author?: string, slogan?: string}}} [options] - 默认风格和配色（不合法的值忽略），横幅规格（没有就不画横幅）。
 * @returns {Promise<{html: string, report: string}>} 页面和脚本打印的自查报告。
 */
export async function renderLayout(markdown, { style, theme, banner, followCard = false, brand, studioOptions } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'wechat-studio-'))
  await writeFile(join(dir, 'article.md'), markdown)
  const args = [join(VENDOR, 'layout.py'), 'article.md', '--out', 'out']
  args.push('--outro', followCard ? 'true' : 'false')
  if (brand?.author) args.push('--brand-author=' + brand.author)
  if (brand?.slogan) args.push('--brand-slogan=' + brand.slogan)
  if (studioOptions) args.push('--studio-options=' + JSON.stringify(studioOptions))
  if (banner) {
    await writeFile(join(dir, 'banner.json'), JSON.stringify(banner))
    args.push('--banner', 'banner.json')
  }
  if (STYLES.includes(style)) args.push('--style', style)
  if (THEMES.includes(theme)) args.push('--theme', theme)
  const { stdout } = await python(args, { cwd: dir })
  const files = (await readdir(join(dir, 'out'))).filter(name => name.endsWith('.html'))
  if (!files.length) throw new Error(`排版脚本没有产出页面：${stdout.trim().slice(-300)}`)
  return { html: await readFile(join(dir, 'out', files[0]), 'utf8'), report: stdout.trim() }
}

/**
 * 检测用纯文本：等于读者最终读到的文字，用来贴到朱雀。先用 layout.py 自带的 plain_md，
 * 再去掉每篇都一样的固定句（它们会和正文混进同一个片段，把分数拉高）。
 * @param {string} markdown - 文章 Markdown。
 * @param {string[]} [fixedLines] - 含有这些文字的行整行去掉。
 * @returns {Promise<string>} 纯文本。
 */
const SVG_CARD_KINDS = ['svg-table', 'svg-bars', 'svg-steps', 'svg-timeline', 'svg-breakdown', 'svg-compare', 'svg-concept', 'svg-phone']
const SVG_ELEMENTS = new Set(['section', 'svg', 'g', 'rect', 'circle', 'line', 'path', 'text', 'animate', 'animateTransform', 'set'])
const SVG_ATTRIBUTES = new Set([
  'xmlns', 'viewBox', 'width', 'height', 'style', 'opacity', 'x', 'y', 'rx', 'ry', 'fill', 'stroke',
  'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'font-size',
  'font-weight', 'font-family', 'text-anchor', 'cx', 'cy', 'r', 'x1', 'x2', 'y1', 'y2', 'd', 'transform',
  'attributeName', 'values', 'keyTimes', 'calcMode', 'keySplines', 'dur', 'repeatCount', 'begin', 'from', 'to', 'type', 'by',
])

export function assertSvgCardFragment(html) {
  const source = String(html ?? '')
  if (!source || source.length > 500_000 || (source.match(/<svg\b/g) ?? []).length !== 1 || (source.match(/<\/svg>/g) ?? []).length !== 1) {
    throw Object.assign(new Error('单卡渲染没有返回唯一 SVG。'), { status: 422 })
  }
  if (/<(?:script|style|foreignObject|iframe|image|use|clipPath)\b|Gradient|\son\w+\s*=|(?:href|src)\s*=|url\s*\(|@import/i.test(source)) {
    throw Object.assign(new Error('单卡渲染包含脚本、外部引用或不支持的元素。'), { status: 422 })
  }
  for (const match of source.matchAll(/<\/?([A-Za-z][\w-]*)[^>]*>/g)) {
    const [tag, element] = match
    if (!SVG_ELEMENTS.has(element)) throw Object.assign(new Error(`单卡渲染包含不支持的元素：${element}`), { status: 422 })
    for (const attr of tag.matchAll(/([A-Za-z_:][\w:.-]*)\s*=/g)) {
      if (!SVG_ATTRIBUTES.has(attr[1])) throw Object.assign(new Error(`单卡渲染包含不支持的属性：${attr[1]}`), { status: 422 })
    }
  }
  if (!/<(?:animate|animateTransform|set)\b/.test(source)) {
    throw Object.assign(new Error('卡片格式无法渲染成动画，请检查条目和分隔符。'), { status: 422 })
  }
  return source
}

export async function renderSvgCard(card, { style = 'std', theme = 'orange' } = {}) {
  if (!SVG_CARD_KINDS.includes(card?.kind) || typeof card.title !== 'string' || !Array.isArray(card.lines) || card.lines.some(line => typeof line !== 'string')) {
    throw Object.assign(new Error('卡片类型或内容格式无效。'), { status: 400 })
  }
  const safeStyle = STYLES.includes(style) ? style : 'std'
  const safeTheme = THEMES.includes(theme) ? theme : 'orange'
  const code = [
    'import sys, json',
    'sys.path.insert(0, sys.argv[1])',
    'import layout as L',
    'data = json.load(sys.stdin)',
    'style = data["style"]',
    'theme = data["theme"]',
    'T = dict(L.THEMES[theme], st=style, r=L.STYLES[style]["r"])',
    'html = L.svg_card(data["kind"], data["title"], data["lines"], T)',
    'sys.stdout.write(json.dumps({"html": html, "warnings": L.WARN}, ensure_ascii=False))',
  ].join('\n')
  const input = JSON.stringify({ kind: card.kind, title: card.title, lines: card.lines, style: safeStyle, theme: safeTheme })
  const { stdout } = await python(['-c', code, VENDOR], { input })
  const result = JSON.parse(stdout)
  if (!String(result.html).includes('<svg')) {
    throw Object.assign(new Error(`卡片格式无法渲染：${result.warnings.join('；') || '请检查条目和分隔符'}`), { status: 422 })
  }
  return { html: assertSvgCardFragment(result.html), report: result.warnings.join('\n') }
}

export async function detectionText(markdown, fixedLines = []) {
  const code = 'import sys\nsys.path.insert(0, sys.argv[1])\nimport layout\nsys.stdout.write(layout.plain_md(sys.stdin.read()))'
  const body = String(markdown).replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n?/, '')
  const { stdout } = await python(['-c', code, VENDOR], { input: body })
  const needles = fixedLines.map(line => String(line).trim()).filter(Boolean)
  return stdout.split('\n')
    .filter(line => !needles.some(needle => line.includes(needle)))
    // plain_md 留下了标题井号、二级标题的英文副标题和引用符号，读者看不到这些
    .map(line => (/^#{1,6}\s/.test(line) ? line.replace(/^#{1,6}\s+/, '').replace(/\s*\|\s*[A-Za-z0-9 &·'.-]+$/, '') : line.replace(/^>\s?/, '')))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 用横幅脚本自带的 check_spec 检查规格：字数、数量超限、写法不对。
 * @param {object} spec - 横幅规格。
 * @returns {Promise<string[]>} 问题列表，空数组表示通过；规格坏到画不出来时也作为一条问题返回。
 */
export async function checkBanner(spec) {
  const code = [
    'import sys, json',
    'sys.path.insert(0, sys.argv[1])',
    'import banner as B',
    'spec = json.load(sys.stdin)',
    'try:',
    '    out = B.check_spec(spec, [B.build(spec)])',
    'except Exception as e:',
    '    out = ["规格画不出来：%s: %s" % (type(e).__name__, e)]',
    'sys.stdout.write(json.dumps(out, ensure_ascii=False))',
  ].join('\n')
  const { stdout } = await python(['-c', code, VENDOR], { input: JSON.stringify(spec) })
  const parsed = JSON.parse(stdout || '[]')
  return Array.isArray(parsed) ? parsed.map(String) : []
}
