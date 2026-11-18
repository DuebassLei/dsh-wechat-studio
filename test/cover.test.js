import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { deflateSync } from 'node:zlib'
import { createArticle } from '../src/article.js'
import { COVER_SKILL_DIR } from '../src/ai.js'
import { coverDownloadName, generateArkCover, generateBailianCover, readCover, saveCover } from '../src/cover.js'
import { BAILIAN_SIZES, modelsFor, providerFormats } from '../src/cover-options.js'
import { COVER_STYLES } from '../src/cover-styles.js'
import { PNG } from 'pngjs'
import { publicSettings, readSettings, updateSettings } from '../src/settings.js'
import { Store } from '../src/store.js'

const DASHSCOPE = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'
const ARK = 'https://ark.cn-beijing.volces.com/api/v3/images/generations'
const IMAGE_URL = 'https://dashscope-result.example/cover.png'
const MD = '# 封面测试标题\n\n这是一段用来生成封面的正文内容，写得稍微长一点方便模型理解主题。\n\n第二段补充一些细节，让素材更完整。'

const crcTable = (() => {
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()
const crc32 = buf => {
  let crc = 0xffffffff
  for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
// 造一张真实可被 sips 读取裁切的纯色 PNG，宽高取 47:20 的整数倍。
function makePng(width, height) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const off = y * (width * 3 + 1)
    for (let x = 0; x < width; x++) { const p = off + 1 + x * 3; raw[p] = 0x33; raw[p + 1] = 0x66; raw[p + 2] = 0x99 }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const jsonReply = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const generationReply = () => ({ ok: true, status: 200, json: async () => ({ output: { choices: [{ message: { content: [{ image: IMAGE_URL }] } }] } }) })

test('封面下载文件名：包含标题、风格、日期和序号，清理特殊字符并限制标题长度', () => {
  const run = { style: 'kinetic', format: 'png', createdAt: '2026-11-17T10:00:00', images: [{ id: 'a' }, { id: 'b' }] }
  assert.equal(coverDownloadName({ title: '提示词/写作：第二版*' }, run, 'b'), '提示词 写作：第二版-动感大字-2026-11-17-100000-02.png')
  assert.equal(coverDownloadName({ title: '文'.repeat(60) }, { images: [{ id: 'a' }] }, 'a'), `${'文'.repeat(48)}-封面-01.png`)
})

test('百炼封面：千问模型共用多模态接口，关掉自动扩写，下载 PNG 落盘', async () => {
  const png = makePng(94, 40)
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return url === DASHSCOPE ? generationReply() : new Response(png)
  }
  const image = await generateBailianCover('提示词', { apiKey: 'sk-x', model: 'qwen-image-3.0-pro', resolution: '2K', referenceImage: 'https://example.com/portrait.png' }, fetchImpl)
  assert.ok(image.equals(png))
  assert.equal(calls[0].url, DASHSCOPE)
  assert.equal(calls[0].init.headers.authorization, 'Bearer sk-x')
  const body = JSON.parse(calls[0].init.body)
  assert.equal(body.model, 'qwen-image-3.0-pro')
  assert.deepEqual(body.input.messages[0].content.map(part => Object.keys(part)[0]), ['image', 'text'])
  assert.equal(body.input.messages[0].content[0].image, 'https://example.com/portrait.png')
  assert.equal(body.input.messages[0].content[1].text, '提示词')
  assert.equal(body.parameters.size, BAILIAN_SIZES['2K'])
  assert.equal(body.parameters.prompt_extend, false)
  assert.equal(body.parameters.n, 1)
  assert.equal(body.parameters.watermark, false)
  assert.equal(calls[1].url, IMAGE_URL)
})

test('百炼封面：万相模型不传 prompt_extend，1K 用显式宽高', async () => {
  const png = makePng(94, 40)
  let body
  const fetchImpl = async (url, init) => {
    if (url === DASHSCOPE) { body = JSON.parse(init.body); return generationReply() }
    return new Response(png)
  }
  await generateBailianCover('p', { apiKey: 'k', model: 'wan2.7-image', resolution: '1K' }, fetchImpl)
  assert.equal(body.parameters.size, BAILIAN_SIZES['1K'])
  assert.ok(!('prompt_extend' in body.parameters))
})

test('封面：不传参考图时只发提示词，不带任何默认人物图', async () => {
  const png = makePng(94, 40)
  let bailianBody
  const bailianFetch = async (url, init) => {
    if (url === DASHSCOPE) { bailianBody = JSON.parse(init.body); return generationReply() }
    return new Response(png)
  }
  await generateBailianCover('p', { apiKey: 'k', model: 'wan2.7-image', resolution: '2K' }, bailianFetch)
  assert.deepEqual(bailianBody.input.messages[0].content, [{ text: 'p' }])
  let arkBody
  const arkFetch = async (url, init) => {
    arkBody = JSON.parse(init.body)
    return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: png.toString('base64') }] }) }
  }
  await generateArkCover('p', { apiKey: 'k', model: 'm', resolution: '2K', format: 'png' }, arkFetch)
  assert.ok(!('image' in arkBody))
})

test('百炼封面：鉴权/限流/审核/通用报错分别映射', async () => {
  const opts = { apiKey: 'k', model: 'wan2.7-image', resolution: '2K' }
  await assert.rejects(generateBailianCover('p', opts, jsonReply(400, { code: 'InvalidApiKey' })), /百炼鉴权失败/)
  await assert.rejects(generateBailianCover('p', opts, jsonReply(401, {})), /百炼鉴权失败/)
  await assert.rejects(generateBailianCover('p', opts, jsonReply(429, { code: 'Throttling' })), /百炼限流/)
  await assert.rejects(generateBailianCover('p', opts, jsonReply(400, { code: 'DataInspectionFailed' })), /内容审核/)
  await assert.rejects(generateBailianCover('p', opts, jsonReply(500, {})), /HTTP 500/)
})

test('百炼封面：没图、下载失败、非 PNG 都报错', async () => {
  const opts = { apiKey: 'k', model: 'wan2.7-image', resolution: '2K' }
  await assert.rejects(generateBailianCover('p', opts, jsonReply(200, { output: { choices: [{ message: { content: [{ text: '无图' }] } }] } })), /未返回可保存的封面/)
  const dlFail = async url => (url === DASHSCOPE ? generationReply() : { ok: false, status: 403 })
  await assert.rejects(generateBailianCover('p', opts, dlFail), /下载失败/)
  const jpeg = Buffer.from('ffd8ff00', 'hex')
  const notPng = async url => (url === DASHSCOPE ? generationReply() : new Response(jpeg))
  await assert.rejects(generateBailianCover('p', opts, notPng), /有效的 PNG/)
})

test('百炼封面：非 HTTPS 地址不发请求', async () => {
  const opts = { apiKey: 'k', model: 'wan2.7-image', resolution: '2K' }
  const fetchImpl = async url => {
    assert.equal(url, DASHSCOPE)
    return Response.json({ output: { choices: [{ message: { content: [{ image: 'http://example.com/cover.png' }] } }] } })
  }
  await assert.rejects(generateBailianCover('p', opts, fetchImpl), /无效的 HTTPS/)
})

test('百炼封面：未声明大小的下载超过上限时取消读取', async () => {
  const opts = { apiKey: 'k', model: 'wan2.7-image', resolution: '2K' }
  const chunk = new Uint8Array(4 * 1024 * 1024)
  let cancelled = false
  const body = new ReadableStream({
    pull(controller) { controller.enqueue(chunk) },
    cancel() { cancelled = true },
  })
  const fetchImpl = async url => url === DASHSCOPE ? generationReply() : new Response(body)
  await assert.rejects(generateBailianCover('p', opts, fetchImpl), /超过 24 MB/)
  assert.equal(cancelled, true)
})

test('封面设置：提供方/模型按白名单校验，密钥不回传明文', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ws-cover-settings-'))
  const def = await readSettings(root)
  assert.equal(def.coverProvider, 'ark')
  assert.equal(def.arkModel, modelsFor('ark')[0].id)
  assert.equal(def.bailianModel, modelsFor('bailian')[0].id)
  const pub = publicSettings(await updateSettings(root, { coverProvider: 'bailian', bailianKey: '  sk-bailian-9999  ', bailianModel: 'wan2.7-image-pro' }))
  assert.equal(pub.coverProvider, 'bailian')
  assert.equal(pub.bailianModel, 'wan2.7-image-pro')
  assert.equal(pub.bailianKeySet, true)
  assert.ok(!JSON.stringify(pub).includes('bailian-9999'))
  assert.equal((await readSettings(root)).bailianKey, 'sk-bailian-9999')
  await assert.rejects(updateSettings(root, { coverProvider: 'nope' }), /封面提供方/)
  await assert.rejects(updateSettings(root, { bailianModel: modelsFor('ark')[0].id }), /百炼封面模型/)
  await assert.rejects(updateSettings(root, { arkModel: modelsFor('bailian')[0].id }), /封面模型/)
  assert.deepEqual(providerFormats('bailian'), ['png'])
  assert.deepEqual(providerFormats('ark'), ['png', 'jpeg'])
})

test('封面设置：IP 人物参考图有默认地址，只收 https，留空清除', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ws-portrait-settings-'))
  assert.equal((await readSettings(root)).portraitUrl, 'https://r2.cloudnative101.net/assets/images/portrait.png')
  const pub = publicSettings(await updateSettings(root, { portraitUrl: '  https://example.com/me.png  ' }))
  assert.equal(pub.portraitUrl, 'https://example.com/me.png')
  assert.equal((await readSettings(root)).portraitUrl, 'https://example.com/me.png')
  await assert.rejects(updateSettings(root, { portraitUrl: 'http://example.com/me.png' }), /https/)
  await assert.rejects(updateSettings(root, { portraitUrl: 'https://user:pass@example.com/me.png' }), /https/)
  await assert.rejects(updateSettings(root, { portraitUrl: '不是地址' }), /https/)
  assert.equal(publicSettings(await updateSettings(root, { portraitUrl: '' })).portraitUrl, '')
  assert.equal((await readSettings(root)).portraitUrl, '', '显式清空后不回落到默认地址')
})

// 读真实模板数出占位符个数，再挑一个不含禁用词的填充值，让 coverPrompt 校验通过。
async function coverLLM(style = 'classic') {
  const templateName = style === 'classic' ? 'prompt_template.md' : `prompt_template_${style}.md`
  const template = await readFile(join(COVER_SKILL_DIR, `references/${templateName}`), 'utf8')
  const body = template.match(/^```[^\n]*\n([\s\S]*?)^```[ \t]*$/m)?.[1]?.trim()
  const slotCount = [...body.matchAll(/\{\{([^{}]+)\}\}/g)].length
  const terms = (await readFile(join(COVER_SKILL_DIR, 'references/blocklist.txt'), 'utf8'))
    .split(/\r?\n/).map(line => line.trim().toLowerCase()).filter(line => line && !line.startsWith('#'))
  let filler = '封面示例'
  while (terms.some(term => filler.toLowerCase().includes(term))) filler += '字'
  const values = Array.from({ length: slotCount }, () => filler)
  return { prepareCall: async () => ({ config: {}, async *stream() { yield { type: 'text-delta', text: JSON.stringify({ values }) }; yield { type: 'finish', reason: { kind: 'stop' } } } }) }
}

async function coverHost({ provider, key, model, fetchImpl, llm }) {
  const { route } = await import('../src/host.js')
  const store = new Store(mkdtempSync(join(tmpdir(), 'ws-cover-host-')))
  const article = createArticle({ markdown: MD })
  await store.update(state => { state.articles.push(article); state.currentId = article.id })
  const settings = { coverProvider: provider }
  if (provider === 'bailian') { settings.bailianKey = key; if (model) settings.bailianModel = model }
  else { settings.arkKey = key; if (model) settings.arkModel = model }
  await updateSettings(store.root, settings)
  const services = llm ? { llm, agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) } } : {}
  const deps = { ctx: { get: name => services[name] ?? null }, store, pipeline: { job: () => null }, fetchImpl }
  const request = async (path, payload) => {
    const req = { url: '/wechat-studio/' + path, method: payload ? 'POST' : 'GET', async *[Symbol.asyncIterator]() { if (payload) yield Buffer.from(JSON.stringify(payload)) } }
    let result
    await route(deps, req, { setHeader() {}, end(value) { result = JSON.parse(value) } })
    return result
  }
  const requestImage = async path => {
    const req = { url: '/wechat-studio/' + path, method: 'GET' }
    const headers = {}
    let body
    await route(deps, req, { setHeader(name, value) { headers[name] = value }, end(value) { body = value } })
    return { headers, body }
  }
  return { store, article, request, requestImage }
}

async function waitCover(request) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const { current } = await request('state')
    const run = current.coverRuns?.at(-1)
    if (!current.coverJob && run && run.status !== 'running') return current
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.fail('封面生成未结束')
}

test('封面路由：按提供方查 Key，百炼只收 png', async () => {
  const ark = await coverHost({ provider: 'ark', key: '' })
  assert.match((await ark.request('cover/generate', { id: ark.article.id, style: 'classic', format: 'png' })).error, /火山方舟 API Key/)
  assert.match((await ark.request('cover/generate', { id: ark.article.id, style: 'classic', format: 'jpeg' })).error, /火山方舟 API Key/, 'ark 接受 jpeg，过了格式闸才查 Key')
  const bl = await coverHost({ provider: 'bailian', key: '' })
  assert.match((await bl.request('cover/generate', { id: bl.article.id, style: 'classic', format: 'png' })).error, /百炼 API Key/)
  assert.match((await bl.request('cover/generate', { id: bl.article.id, style: 'classic', format: 'jpeg' })).error, /只支持 png/)
})

test('封面路由：百炼走多模态接口并落盘，记录提供方', async () => {
  const png = makePng(94, 40)
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return url === DASHSCOPE ? generationReply() : new Response(png)
  }
  const { article, request, requestImage } = await coverHost({ provider: 'bailian', key: 'sk-bl', model: 'wan2.7-image-pro', fetchImpl, llm: await coverLLM() })
  const res = await request('cover/generate', { id: article.id, style: 'classic', resolution: '2K', count: 1, format: 'png' })
  assert.ok(!res.error, res.error)
  const current = await waitCover(request)
  assert.equal(calls[0].url, DASHSCOPE)
  assert.equal(JSON.parse(calls[0].init.body).model, 'wan2.7-image-pro')
  assert.equal(current.coverError, null)
  assert.equal(current.coverRuns.at(-1).status, 'succeeded')
  assert.equal(current.coverRuns.at(-1).images.length, 1)
  assert.equal(current.cover.provider, 'bailian')
  assert.equal(current.cover.model, 'wan2.7-image-pro')
  const download = await requestImage(`cover/image?id=${article.id}&asset=${current.cover.id}&download=1`)
  assert.ok(Buffer.isBuffer(download.body))
  const disposition = download.headers['content-disposition']
  assert.match(disposition, /filename\*=UTF-8''/)
  const filename = decodeURIComponent(disposition.split("filename*=UTF-8''")[1])
  assert.equal(filename, coverDownloadName(article, current.coverRuns.at(-1), current.cover.id))
  assert.match(filename, /^封面测试标题-经典深绿-\d{4}-\d{2}-\d{2}-\d{6}-01\.png$/)
})

test('封面路由：火山方舟仍走原接口', async () => {
  const png = makePng(94, 40)
  const calls = []
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: png.toString('base64') }] }) } }
  const { store, article, request } = await coverHost({ provider: 'ark', key: 'sk-ark', model: 'doubao-seedream-5-5-261028', fetchImpl, llm: await coverLLM() })
  await updateSettings(store.root, { portraitUrl: 'https://example.com/me.png' })
  await request('cover/generate', { id: article.id, style: 'classic', resolution: '2K', count: 1, format: 'png' })
  const current = await waitCover(request)
  assert.equal(calls[0].url, ARK)
  assert.equal(JSON.parse(calls[0].init.body).model, 'doubao-seedream-5-5-261028')
  assert.equal(JSON.parse(calls[0].init.body).image, 'https://example.com/me.png')
  assert.equal(current.coverRuns.at(-1).status, 'succeeded')
  assert.equal(current.cover.provider, 'ark')
})

test('封面路由：火山方舟详细错误写入生成记录，并清理敏感信息', async () => {
  const apiKey = 'sk-ark-secret'
  const fetchImpl = async () => Response.json({
    error: { code: 'InvalidParameter', message: `提示词参数无效\n请检查请求，密钥 ${apiKey} 不应写入历史。${'补'.repeat(700)}` },
  }, { status: 400, headers: { 'x-request-id': 'req-ark-123' } })
  const { article, request } = await coverHost({ provider: 'ark', key: apiKey, fetchImpl, llm: await coverLLM() })
  await request('cover/generate', { id: article.id, style: 'classic', resolution: '2K', count: 1, format: 'png' })
  const current = await waitCover(request)
  const error = current.coverRuns.at(-1).errors[0]
  assert.match(error, /HTTP 400/)
  assert.match(error, /InvalidParameter/)
  assert.match(error, /提示词参数无效/)
  assert.match(error, /req-ark-123/)
  assert.ok(!error.includes(apiKey))
  assert.ok(!error.includes('\n'))
  assert.ok(error.length < 700)
  assert.equal(current.coverError, error)
})

test('火山方舟封面：无法读取详细错误时保留通用提示', async () => {
  const opts = { apiKey: 'k', model: 'm', resolution: '2K', format: 'png' }
  await assert.rejects(generateArkCover('p', opts, jsonReply(400, {})), /HTTP 400.*请重试/)
  await assert.rejects(generateArkCover('p', opts, jsonReply(400, { error: { code: 'ModelNotOpen', message: 'provider detail' } })), /尚未开通/)
})
test('封面模板：每种风格都有带占位符的提示词代码块', async () => {
  for (const style of COVER_STYLES) {
    const templateName = style.id === 'classic' ? 'prompt_template.md' : `prompt_template_${style.id}.md`
    const template = await readFile(join(COVER_SKILL_DIR, `references/${templateName}`), 'utf8')
    const body = template.match(/^```[^\n]*\n([\s\S]*?)^```[ \t]*$/m)?.[1]?.trim()
    assert.ok(body, `${style.id} 模板缺少提示词代码块`)
    assert.ok([...body.matchAll(/\{\{([^{}]+)\}\}/g)].length > 0, `${style.id} 模板没有占位符`)
  }
})

test('颗粒海报：人物外观以参考图为准，不固定年龄和发色', async () => {
  const template = await readFile(join(COVER_SKILL_DIR, 'references/prompt_template_grunge.md'), 'utf8')
  assert.ok(!template.includes('30-something'))
  assert.ok(!template.includes('short black hair'))
  assert.match(template, /matching the reference image/)
  assert.match(template, /facial features, hair color, hairstyle and glasses/)
})

test('其他真人海报：不指定固定年龄，外观年龄以参考图为准', async () => {
  for (const name of ['prompt_template.md', 'prompt_template_editorial.md', 'prompt_template_campaign.md', 'prompt_template_kinetic.md']) {
    const template = await readFile(join(COVER_SKILL_DIR, `references/${name}`), 'utf8')
    assert.ok(!template.includes('30-something'), name)
    assert.match(template, /matching the reference image/, name)
    assert.match(template, /apparent age and facial features/, name)
  }
})

test('封面路由：felt 风格不传真人参考图', async () => {
  const png = makePng(94, 40)
  const calls = []
  const fetchImpl = async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: png.toString('base64') }] }) } }
  const { store, article, request } = await coverHost({ provider: 'ark', key: 'sk-ark', fetchImpl, llm: await coverLLM('felt') })
  await updateSettings(store.root, { portraitUrl: 'https://example.com/me.png' })
  await request('cover/generate', { id: article.id, style: 'felt', resolution: '2K', count: 1, format: 'png' })
  const current = await waitCover(request)
  assert.equal(JSON.parse(calls[0].init.body).image, undefined, 'felt 是毛毡微缩场景，不能带真人参考图')
  assert.equal(current.coverRuns.at(-1).status, 'succeeded')
  assert.equal(current.cover.style, 'felt')
})

test('saveCover：跨平台裁切落盘，失败提示不再依赖 sips', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ws-save-cover-'))
  const id = await saveCover(root, makePng(100, 40), 'png')
  const decoded = PNG.sync.read(await readCover(root, id))
  assert.equal(decoded.width, 94)
  assert.equal(decoded.height, 40)
  assert.deepEqual(await readdir(join(root, 'covers')), [`${id}.png`], '不留临时文件')
  await assert.rejects(
    saveCover(root, Buffer.from('not an image'), 'png'),
    error => !/sips/.test(error.message) && /封面裁切或保存失败/.test(error.message),
  )
})
