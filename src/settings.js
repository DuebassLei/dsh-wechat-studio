// 设置：存在 <DSH_HOME>/wechat-studio/settings.json（权限 600）。
// 朱雀 API Key 只留在本机，接口从不把明文返回给页面，只说「有没有」和末四位。
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { checkEndpoint, DEFAULT_ENDPOINT } from './zhuque.js'

// 每篇都一样的固定句：检测时整行去掉，避免和正文混进同一个片段把分数拉高
const DEFAULTS = { fixedLines: ['设为「星标」', '教你用AI干掉90%的重复劳动'], style: null, theme: null, zhuqueKey: '', zhuqueEndpoint: DEFAULT_ENDPOINT, model: { provider: '', model: '' } }

const lines = value => (Array.isArray(value) ? value.filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean).slice(0, 20) : null)

export async function readSettings(root) {
  let saved = {}
  try {
    saved = JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'))
  } catch {
    // 没有文件或者内容坏了，用默认值
  }
  return {
    ...DEFAULTS, ...saved,
    fixedLines: lines(saved.fixedLines) ?? DEFAULTS.fixedLines,
    zhuqueKey: typeof saved.zhuqueKey === 'string' ? saved.zhuqueKey : '',
    zhuqueEndpoint: typeof saved.zhuqueEndpoint === 'string' && saved.zhuqueEndpoint ? saved.zhuqueEndpoint : DEFAULT_ENDPOINT,
    model: saved.model?.provider && saved.model?.model ? { provider: String(saved.model.provider), model: String(saved.model.model) } : { provider: '', model: '' },
  }
}

/**
 * 按白名单更新设置。zhuqueKey 传空字符串表示清除；zhuqueEndpoint 传空字符串表示恢复默认。
 * @param {string} root - 数据目录。
 * @param {object} body - 页面发来的修改。
 */
export async function updateSettings(root, body) {
  const next = await readSettings(root)
  if (typeof body.style === 'string') next.style = body.style
  if (typeof body.theme === 'string') next.theme = body.theme
  if (lines(body.fixedLines)) next.fixedLines = lines(body.fixedLines)
  if (typeof body.zhuqueKey === 'string') next.zhuqueKey = body.zhuqueKey.trim().slice(0, 400)
  if (typeof body.zhuqueEndpoint === 'string') next.zhuqueEndpoint = body.zhuqueEndpoint.trim() ? checkEndpoint(body.zhuqueEndpoint.trim()) : DEFAULT_ENDPOINT
  if (body.model && typeof body.model === 'object') {
    const provider = typeof body.model.provider === 'string' ? body.model.provider.trim().slice(0, 200) : ''
    const model = typeof body.model.model === 'string' ? body.model.model.trim().slice(0, 200) : ''
    // 要么都填（指定模型），要么都空（跟随 DSH 默认）
    if (Boolean(provider) !== Boolean(model)) throw Object.assign(new Error('模型的提供方和名称要一起填'), { status: 400 })
    next.model = { provider, model }
  }
  await mkdir(root, { recursive: true })
  const file = join(root, 'settings.json')
  await writeFile(`${file}.tmp`, JSON.stringify(next, null, 1), { mode: 0o600 })
  await rename(`${file}.tmp`, file)
  return next
}

/** 给页面看的设置：不含密钥明文。 */
export function publicSettings(settings) {
  const key = settings.zhuqueKey
  return {
    fixedLines: settings.fixedLines,
    zhuqueKeySet: Boolean(key),
    zhuqueKeyTail: key ? key.slice(-4) : '',
    zhuqueEndpoint: settings.zhuqueEndpoint,
    zhuqueEndpointDefault: settings.zhuqueEndpoint === DEFAULT_ENDPOINT,
    model: settings.model,
  }
}
