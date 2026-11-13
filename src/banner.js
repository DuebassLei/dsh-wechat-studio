// 开头横幅：按文章写一份横幅规格（banner.json），交给 vendor/layout/banner.py 去画。
// 规则来自 skills/banner.md（wechat-opening-banner skill）。只把选中风格那一节喂给模型，整份太长。

export const BANNER_STYLES = {
  poster: { name: '大字海报', from: '## 风格三', to: '## 设计规则' },
  card: { name: '标题卡', from: '## 风格二', to: '## 风格三' },
  scene: { name: '动画场景', from: '## 十种场景模板', to: '## 风格二' },
}
export const BANNER_CHOICES = [...Object.keys(BANNER_STYLES), 'none']
export const DEFAULT_BANNER = 'poster'

function section(skill, from, to) {
  const start = skill.indexOf(from)
  if (start === -1) return ''
  const end = skill.indexOf(to, start + from.length)
  return skill.slice(start, end === -1 ? undefined : end).trim()
}

/**
 * 拼出给模型的横幅规则：选中风格那一节 + 设计规则。
 * @param {string} skill - skills/banner.md 的内容。
 * @param {string} style - poster / card / scene。
 */
export function bannerGuide(skill, style) {
  const meta = BANNER_STYLES[style]
  if (!meta) throw new Error(`未知的横幅风格：${style}`)
  const body = section(skill, meta.from, meta.to)
  if (!body) throw new Error('横幅 skill 里找不到这种风格的说明')
  return `${body}\n\n${section(skill, '## 设计规则', '## 公众号限制')}`
}

const SHAPE = {
  poster: '{"slug":"英文短名","title":"开头横幅 · 大字海报 · 主题","style":"poster","poster":{...}}',
  card: '{"slug":"英文短名","title":"开头横幅 · 标题卡 · 主题","style":"card","card":{...}}',
  scene: '{"slug":"英文短名","title":"开头横幅 · 主题","caption":"产品名 实测","scene":{"layout":"模板名", ...}}',
}

export function bannerRules(style) {
  return `# 你现在的工作
读下面这篇公众号文章，按上面的规则为它写一份开头横幅的规格。

- 内容全部取自原文：起点（作者交代了什么）、谁在干活、产出了什么。不编数字、不编功能、不编产品名。
- 严格遵守上面写的字数上限，宁可短，不要超。
- 只输出一个 JSON 对象，不要解释。形状是：
${SHAPE[style]}`
}

/**
 * 模型给的规格不可信：只认对应风格的结构，风格字段由我们来定，不认模型写的。
 * @param {unknown} raw - 模型输出解析出来的 JSON。
 * @param {string} style - poster / card / scene。
 * @returns {object|null} 规范后的规格；结构不对时为 null。
 */
export function normalizeSpec(raw, style) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const key = style === 'scene' ? 'scene' : style
  const body = raw[key]
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  if (style === 'scene' && typeof body.layout !== 'string') return null
  const spec = {
    slug: typeof raw.slug === 'string' && /^[\w-]{1,40}$/.test(raw.slug) ? raw.slug : 'banner',
    title: typeof raw.title === 'string' ? raw.title.slice(0, 60) : '开头横幅',
    [key]: structuredClone(body),
  }
  if (style !== 'scene') {
    spec.style = style
    // 配色交给排版页：不写 theme，横幅才会跟着正文的配色一起换
    delete spec[key].theme
  } else if (typeof raw.caption === 'string') {
    spec.caption = raw.caption.slice(0, 30)
  }
  return spec
}
