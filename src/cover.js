import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
export { coverPrompt } from './cover-prompt.js'

const run = promisify(execFile)
const portrait = 'https://r2.cloudnative101.net/ScreenShot_2026-04-17_135957_070.png'
const MAX_IMAGE = 24 * 1024 * 1024

export async function generateArkCover(prompt, { apiKey, model, resolution, format }, fetchImpl = fetch) {
  const res = await fetchImpl('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(180_000),
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model, prompt, image: portrait, size: resolution,
      response_format: 'b64_json', output_format: format, background: 'opaque', watermark: false,
    }),
  })
  if (!res.ok) {
    const code = (await res.json().catch(() => null))?.error?.code
    if (code === 'ModelNotOpen') throw new Error('当前火山方舟账号尚未开通 Doubao Seedream 5.5，请在方舟控制台的「开通管理」中开通。')
    if (code === 'InvalidEndpointOrModel.NotFound') throw new Error('火山方舟找不到 Seedream 5.5 或当前 API Key 无权调用，请检查项目和模型权限。')
    if (code === 'InvalidEndpointOrModel.ModelIDAccessDisabled') throw new Error('当前火山方舟账号不允许通过模型 ID 调用，需要使用有权限的推理接入点。')
    if (res.status === 401 || res.status === 403) throw new Error('火山方舟鉴权失败，请检查 API Key 和模型权限。')
    throw new Error(`火山方舟生成失败（HTTP ${res.status}），请重试。`)
  }
  const { data } = await res.json()
  const encoded = data?.[0]?.b64_json
  if (typeof encoded !== 'string' || encoded.length > MAX_IMAGE * 4 / 3) throw new Error('火山方舟未返回可保存的封面。')
  const image = Buffer.from(encoded, 'base64')
  const valid = format === 'jpeg'
    ? image.toString('hex', 0, 3) === 'ffd8ff'
    : image.toString('hex', 0, 8) === '89504e470d0a1a0a'
  if (!valid) throw new Error('生成结果与所选图片格式不符。')
  return image
}

export async function saveCover(root, image, format) {
  const dir = join(root, 'covers')
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const id = randomUUID()
  const input = join(dir, `${id}.source.${format}`)
  const output = join(dir, `${id}.crop.${format}`)
  try {
    await writeFile(input, image, { mode: 0o600 })
    const { stdout } = await run('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', input], { timeout: 20_000 })
    const width = Number(stdout.match(/pixelWidth: (\d+)/)?.[1])
    const height = Number(stdout.match(/pixelHeight: (\d+)/)?.[1])
    const units = Math.min(Math.floor(width / 47), Math.floor(height / 20))
    if (!units || units > 100) throw new Error('Invalid image dimensions')
    // 47:20 produces exactly 2.35:1 and keeps the center of the composition.
    await run('sips', ['--cropToHeightWidth', String(units * 20), String(units * 47), input, '--out', output], { timeout: 20_000 })
    await rename(output, join(dir, `${id}.${format}`))
    return id
  } catch {
    throw new Error('封面裁切或保存失败，请确认 DSH 宿主可运行 macOS 的 sips。')
  } finally {
    await Promise.allSettled([rm(input, { force: true }), rm(output, { force: true })])
  }
}

export function readCover(root, id, format = 'png') {
  if (!/^[a-f0-9-]{36}$/.test(id ?? '')) throw new Error('无效的封面 ID。')
  return readFile(join(root, 'covers', `${id}.${format}`))
}
