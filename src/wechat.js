// 微信公众号 API：凭证校验、IP 白名单识别、草稿箱推送。
// 只用 Node 自带的 fetch 和 FormData，不给插件加运行时依赖。
// AppSecret 只存在本机 settings.json（600 权限），接口从不回传明文。
import { deflateSync } from 'node:zlib'

const API = 'https://api.weixin.qq.com'

const TIMEOUT_MS = 30_000
const MAX_IMAGE_BYTES = 5_000_000
const MAX_TITLE = 64
const MAX_CONTENT_IMAGES = 50

/** 把微信返回的错误翻成给用户看的话。40164 是 IP 不在白名单，要把 IP 报出来让用户去加。 */
export function friendlyWechatError(errcode, errmsg) {
  const detail = String(errmsg ?? '').trim()
  if (errcode === 40164) {
    const ip = detail.match(/invalid ip ([0-9a-fA-F:.]+)/)?.[1]
    return '接口拒绝了请求：本机出口 IP 不在公众号的 IP 白名单里。'
      + (ip ? `请到 mp.weixin.qq.com「设置与开发 → 基本配置 → IP 白名单」，把这个 IP 加进去再试：${ip}` : '请到「设置与开发 → 基本配置 → IP 白名单」加上提示里的 IP 再试。')
  }
  if (errcode === 40013) return 'AppID 不对，请到公众号「设置与开发 → 基本配置」核对开发者 ID。'
  if (errcode === 40001 || errcode === 40125) return 'AppSecret 不对或者已经重置过，请到公众号「设置与开发 → 基本配置」重新生成并填进来。'
  if (errcode === 40002) return '凭证类型不对，请确认这是公众号（服务号或订阅号）而不是小程序的 AppID。'
  if (errcode === 48001) return '这个公众号没有草稿箱接口权限，未认证的订阅号需要先完成微信认证。'
  return detail ? `微信接口报错（${errcode}）：${detail}` : `微信接口报错（${errcode}）`
}

function wechatFailure(data) {
  const err = new Error(friendlyWechatError(data.errcode, data.errmsg))
  err.errcode = data.errcode
  err.status = 502
  return err
}

async function callWechat(path, options = {}, fetchImpl = fetch) {
  let res
  try {
    res = await fetchImpl(`${API}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS), ...options })
  } catch (err) {
    throw Object.assign(new Error(`连不上微信接口：${err.name === 'TimeoutError' ? '请求超时' : err.message}`), { status: 502 })
  }
  let data
  try {
    data = await res.json()
  } catch {
    throw Object.assign(new Error(`微信接口返回了看不懂的内容（${res.status}）`), { status: 502 })
  }
  if (data.errcode && data.errcode !== 0) throw wechatFailure(data)
  return data
}

/** 用 AppID + AppSecret 换 access_token。 */
export async function fetchAccessToken(appId, appSecret, fetchImpl = fetch) {
  const query = new URLSearchParams({ grant_type: 'client_credential', appid: appId, secret: appSecret })
  const data = await callWechat(`/cgi-bin/token?${query}`, {}, fetchImpl)
  return data.access_token
}

/**
 * 验证一对凭证能不能用。能换到 access_token 且能读到账号信息就算通过。
 * @returns {Promise<{nickname: string, headImg: string}>} 公众号昵称和头像，读不到信息时是空字符串。
 */
export async function verifyCredentials(appId, appSecret, fetchImpl = fetch) {
  const token = await fetchAccessToken(appId, appSecret, fetchImpl)
  let nickname = '', headImg = ''
  try {
    const data = await callWechat(`/cgi-bin/account/getaccountinfo?access_token=${encodeURIComponent(token)}`, {}, fetchImpl)
    nickname = String(data.nick_name ?? '')
    headImg = String(data.head_img ?? '')
  } catch {
    // 读账号信息失败不影响验证结果：token 已经换到了
  }
  return { nickname, headImg }
}

async function uploadImage(token, path, buffer, filename, mime, fetchImpl) {
  const form = new FormData()
  form.append('media', new Blob([buffer], { type: mime }), filename)
  return callWechat(`${path}?access_token=${encodeURIComponent(token)}`, { method: 'POST', body: form }, fetchImpl)
}

/** 把封面图传成公众号永久素材，拿 thumb_media_id。 */
export async function uploadThumb(token, buffer, format, fetchImpl = fetch) {
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png'
  const data = await uploadImage(token, '/cgi-bin/material/add_material', buffer, `cover.${format}`, mime, fetchImpl)
  return data.media_id
}

/** 把正文里的图传成公众号图文素材，换回 mmbiz 域名的地址。 */
export async function uploadContentImage(token, buffer, mime, fetchImpl = fetch) {
  const extension = mime === 'image/jpeg' ? 'jpg' : mime === 'image/gif' ? 'gif' : 'png'
  const data = await uploadImage(token, '/cgi-bin/media/uploadimg', buffer, `img.${extension}`, mime, fetchImpl)
  return data.url
}

async function fetchRemoteImage(url, fetchImpl) {
  let res
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    throw new Error(err.name === 'TimeoutError' ? '下载图片超时' : err.message)
  }
  if (!res.ok) throw new Error(`下载图片失败（${res.status}）`)
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
  const buffer = Buffer.from(await res.arrayBuffer())
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('图片超过 10 MB 上限')
  return { buffer, type }
}

/** 从排版 HTML 里挑出要转存的图：http(s) 地址、不是公众号自己的图、不是 data: 内联图。 */
export function contentImageUrls(html) {
  const urls = new Set()
  for (const match of String(html).matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const url = match[1].trim()
    if (/^https?:\/\//.test(url) && !url.includes('mmbiz.qpic.cn') && !urls.has(url) && urls.size < MAX_CONTENT_IMAGES) urls.add(url)
  }
  return [...urls]
}

/** 正文里不是公众号域名的图都换成 uploadimg 返回的地址；换不动的保持原样并汇报。 */
export async function rewriteContentImages(html, { token, fetchImpl = fetch } = {}) {
  const urls = contentImageUrls(html)
  if (!urls.length) return { content: html, warnings: [] }
  const map = new Map()
  const warnings = []
  for (const url of urls) {
    try {
      const { buffer, type } = await fetchRemoteImage(url, fetchImpl)
      const lower = url.toLowerCase()
      const mime = ['image/jpeg', 'image/png', 'image/gif'].includes(type)
        ? type
        : /\.(jpe?g)(\?|$)/.test(lower) ? 'image/jpeg'
        : /\.gif(\?|$)/.test(lower) ? 'image/gif' : 'image/png'
      map.set(url, await uploadContentImage(token, buffer, mime, fetchImpl))
    } catch (err) {
      warnings.push(`有一张图没能转存（${err.message}），推送的草稿里它还是原来的地址。`)
    }
  }
  let content = html
  for (const [from, to] of map) content = content.split(from).join(to)
  return { content, warnings }
}

// 草稿必须带封面（thumb_media_id）。没生成过封面时用一张纯色占位图，纯 Node 画 PNG，不加依赖。

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = -1
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function solidRows(row, height) {
  const rows = Buffer.alloc(row.length * height)
  for (let y = 0; y < height; y++) row.copy(rows, y * row.length)
  return rows
}

/**
 * 画一张纯色 PNG 当占位封面，尺寸按公众号封面比例 2.35:1。
 * @returns {Buffer}
 */
export function placeholderPng(width = 900, height = 383, [r, g, b] = [37, 42, 38]) {
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r
    row[1 + x * 3 + 1] = g
    row[1 + x * 3 + 2] = b
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = 2 // 真彩色
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(solidRows(row, height))),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** 选这篇稿子最新的封面图，没有就返回 null（推送时画占位图）。 */
export function latestCover(article) {
  const runs = (article.coverRuns ?? []).filter(run => run.images?.length)
  if (!runs.length) return null
  const run = runs.at(-1)
  return { id: run.images.at(-1).id, format: run.format ?? 'png' }
}

/**
 * 把排版好的 HTML 推到公众号草稿箱。
 * @param {{article: object, html: string, settings: object, cover?: {buffer: Buffer, format: string} | null, fetchImpl?: Function}} input
 *   cover 由调用方用 readCover 读好：有就用真封面，null 用占位图。
 * @returns {Promise<{mediaId: string, warnings: string[]}>}
 */
export async function pushWechatDraft({ article, html, settings, cover = null, fetchImpl = fetch }) {
  const appId = settings.mp?.appId
  const appSecret = settings.mp?.appSecret
  if (!appId || !appSecret) throw Object.assign(new Error('请先在「设置 → 公众号凭证」里填写并保存 AppID 和 AppSecret。'), { status: 400 })
  const content = String(html ?? '').trim()
  if (!content || content.length > 1_000_000) throw Object.assign(new Error('正文内容是空的或者太大，先回到排版预览再推送。'), { status: 400 })

  const token = await fetchAccessToken(appId, appSecret, fetchImpl)

  const warnings = []
  let thumb
  try {
    if (cover) {
      thumb = await uploadThumb(token, cover.buffer, cover.format === 'jpeg' ? 'jpeg' : 'png', fetchImpl)
    } else {
      thumb = await uploadThumb(token, placeholderPng(), 'png', fetchImpl)
      warnings.push('这篇还没有生成封面，草稿里放了占位图；想用真封面，先生成封面再重新推送。')
    }
  } catch (err) {
    if (!cover) throw err
    thumb = await uploadThumb(token, placeholderPng(), 'png', fetchImpl)
    warnings.push(`封面图没能用上（${err.message}），草稿里放了一张占位图。`)
  }

  const { content: rewritten, warnings: imageWarnings } = await rewriteContentImages(content, { token, fetchImpl })
  warnings.push(...imageWarnings)

  const payload = {
    articles: [{
      title: String(article.title ?? '未命名').slice(0, MAX_TITLE),
      author: String(settings.brand?.author ?? '').slice(0, 16),
      digest: '',
      content: rewritten,
      content_source_url: '',
      thumb_media_id: thumb,
      need_open_comment: 1,
      only_fans_can_comment: 0,
    }],
  }
  const data = await callWechat(`/cgi-bin/draft/add?access_token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  }, fetchImpl)
  return { mediaId: data.media_id, warnings }
}
