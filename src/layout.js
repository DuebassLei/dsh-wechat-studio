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
const STYLES = ['std', 'mag', 'min', 'geek', 'bold', 'neo', 'note', 'zen', 'bento', 'dark']
const THEMES = ['orange', 'blue', 'teal', 'ink', 'navy', 'violet', 'rose', 'amber', 'morandi', 'forest', 'petrol', 'mist', 'matcha', 'cocoa', 'dusty']

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
