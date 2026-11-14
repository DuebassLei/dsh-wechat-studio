import { createHash } from 'node:crypto'

const fail = (message, status = 502) => Object.assign(new Error(message), { status })

async function upload(url, { cloudName, apiKey, apiSecret }, fetchImpl) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const publicId = 'dsh-wechat-studio/feishu-' + createHash('sha256').update(url).digest('hex')
  const signature = createHash('sha256').update(`overwrite=false&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`).digest('hex')
  const form = new FormData()
  for (const [key, value] of Object.entries({ file: url, api_key: apiKey, timestamp, signature, public_id: publicId, overwrite: 'false' })) {
    form.set(key, value)
  }
  const res = await fetchImpl(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST', body: form, signal: AbortSignal.timeout(20_000), redirect: 'error',
  })
  if (!res.ok) {
    await res.body?.cancel()
    if (res.status === 401 || res.status === 403) throw fail('Cloudinary 拒绝了上传，请检查设置中的 API Key 和 API Secret。')
    throw fail(`Cloudinary 未能转存图片（HTTP ${res.status}）。请从飞书重新复制 Markdown 后再试。`)
  }
  const { secure_url: result } = await res.json()
  if (typeof result !== 'string' || !/^https:\/\/res\.cloudinary\.com\/[a-zA-Z0-9_.~%/,-]+$/.test(result)) {
    throw fail('Cloudinary 没有返回可用的图片地址。')
  }
  return result
}

export async function transferFeishuImages(urls, config, progress, fetchImpl = fetch) {
  if (!config?.cloudName || !config.apiKey || !config.apiSecret) {
    throw fail('请先在设置中配置 Cloudinary，再重试图片转存。', 400)
  }
  let next = 0
  const failures = []
  async function worker() {
    while (next < urls.length) {
      const index = next++
      const url = urls[index]
      let result
      try {
        result = await upload(url, config, fetchImpl)
      } catch (error) {
        const detail = error.status === 502 ? error.message : '连接 Cloudinary 失败或超时，请重试。'
        failures.push({ index, detail })
      }
      progress(url, result)
    }
  }
  await Promise.all(Array.from({ length: Math.min(urls.length, 4) }, worker))
  const first = failures.sort((a, b) => a.index - b.index)[0]
  return first ? `第 ${first.index + 1} 张飞书图片转存失败：${first.detail}` : null
}
