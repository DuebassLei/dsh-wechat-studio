// dsh-wechat-studio host 半片：/wechat-studio/* 接口。
import { join } from 'node:path'
import { defaultSelection, listModels, modelInfo, modelOverride, modelStatus, setModelOverride, skillSources } from './ai.js'
import { BANNER_CHOICES, BANNER_STYLES, DEFAULT_BANNER } from './banner.js'
import { blockKind, createArticle, fixPlan, isCheckable, listMeta, snapshot, toMarkdown, touch, undo } from './article.js'
import { detectionText, renderLayout } from './layout.js'
import { Pipeline } from './pipeline.js'
import { pdfToText } from './report.js'
import { publicSettings, readSettings, updateSettings } from './settings.js'
import { Store } from './store.js'
import { detect } from './zhuque.js'

const MAX_JSON = 2_000_000
const MAX_PDF = 30_000_000
function json(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readBuffer(req, limit) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw Object.assign(new Error('内容太大'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function readJson(req) {
  const raw = await readBuffer(req, MAX_JSON)
  if (!raw.length) return {}
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw Object.assign(new Error('请求不是有效的 JSON'), { status: 400 })
  }
}

function bannerView(article) {
  const style = article.bannerStyle ?? DEFAULT_BANNER
  const saved = article.banners?.[style]
  return { style, choices: BANNER_CHOICES.map(id => ({ id, name: BANNER_STYLES[id]?.name ?? '不要横幅' })), ready: style === 'none' || Boolean(saved), warnings: saved?.warnings ?? [], at: saved?.at ?? null }
}

function view(article, pipeline) {
  if (!article) return null
  return {
    id: article.id, topic: article.topic, title: article.title, titles: article.titles, summary: article.summary,
    blocks: article.blocks.map(block => ({ id: block.id, text: block.text, kind: blockKind(block.text), checkable: isCheckable(block.text), check: block.check, hasPrev: Boolean(block.prev) })),
    banner: bannerView(article),
    fixPlan: (({ picked, skipped }) => ({ count: picked.length, skipped }))(fixPlan(article)),
    chat: article.chat.slice(-40), canUndo: article.history.length > 0, zhuque: article.zhuque, notice: article.notice ?? null,
    job: pipeline.job(article.id),
  }
}

async function snapshotState(ctx, store, pipeline) {
  const state = await store.read()
  const current = state.articles.find(a => a.id === state.currentId) ?? null
  const info = modelInfo(ctx)
  const settings = await readSettings(store.root)
  return {
    zhuqueReady: Boolean(settings.zhuqueKey),
    articles: state.articles.map(listMeta).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    current: view(current, pipeline),
    model: info ? info.model : null, modelPinned: Boolean(modelOverride()), modelOk: modelStatus.ok, modelError: modelStatus.error,
  }
}

function mustFind(state, id) {
  const article = state.articles.find(a => a.id === (id ?? state.currentId))
  if (!article) throw Object.assign(new Error('文章不存在'), { status: 404 })
  return article
}

function mustBlock(article, id) {
  const block = article.blocks.find(b => b.id === id)
  if (!block) throw Object.assign(new Error('这一段已经不在了'), { status: 404 })
  return block
}

function notBusy(pipeline, id) {
  if (pipeline.job(id)) throw Object.assign(new Error('这篇文章还有任务在跑，等它结束再试。'), { status: 409 })
}

/**
 * 处理一个 /wechat-studio/<path> 请求。鉴权在外层做完了。
 * @param {{ctx: object, store: Store, pipeline: Pipeline}} deps - 依赖。
 */
export async function route(deps, req, res) {
  const { ctx, store, pipeline } = deps
  const url = new URL(req.url, 'http://local')
  const path = url.pathname.replace(/^.*\/wechat-studio\/?/, '')
  const ok = async () => json(res, 200, await snapshotState(ctx, store, pipeline))
  const get = req.method === 'GET'
  if (!get && req.method !== 'POST') return json(res, 405, { error: '不支持的请求方法' })

  if (get) {
    if (path === 'state') return ok()
    if (path === 'settings') return json(res, 200, publicSettings(await readSettings(store.root)))
    if (path === 'models') return json(res, 200, { providers: await listModels(ctx), default: defaultSelection(ctx), current: modelOverride() })
    if (path === 'skills') {
      const dir = join(store.root, 'skills')
      return json(res, 200, { dir, skills: await skillSources(dir) })
    }
    const article = mustFind(await store.read(), url.searchParams.get('id'))
    if (path === 'markdown') return json(res, 200, { markdown: toMarkdown(article) })
    if (path === 'detection-text') {
      const settings = await readSettings(store.root)
      return json(res, 200, { text: await detectionText(toMarkdown(article), settings.fixedLines) })
    }
    if (path === 'layout') {
      const settings = await readSettings(store.root)
      const style = article.bannerStyle ?? DEFAULT_BANNER
      const banner = style === 'none' ? null : article.banners?.[style]?.spec ?? null
      const { html, report } = await renderLayout(toMarkdown(article), { ...settings, banner })
      return json(res, 200, { html, report })
    }
    return json(res, 404, { error: '没有这个接口' })
  }

  if (path === 'zhuque/report') {
    const state = await store.read()
    const article = mustFind(state, url.searchParams.get('id'))
    notBusy(pipeline, article.id)
    const text = await pdfToText(await readBuffer(req, MAX_PDF))
    pipeline.report(article.id, text)
    return ok()
  }

  const body = await readJson(req)
  switch (path) {
    case 'articles/new': {
      const hasBody = typeof body.markdown === 'string' && body.markdown.trim()
      if (!hasBody && !String(body.topic ?? '').trim() && !String(body.material ?? '').trim()) throw Object.assign(new Error('写一句选题，或者贴入已有的文章。'), { status: 400 })
      const article = createArticle(body)
      await store.update(state => {
        state.articles.push(article)
        state.currentId = article.id
      })
      if (!hasBody) pipeline.draft(article.id)
      else if (!article.titles.length && body.titles !== false) pipeline.titles(article.id)
      return ok()
    }
    case 'articles/select':
      await store.update(state => { state.currentId = mustFind(state, body.id).id })
      return ok()
    case 'articles/delete': {
      notBusy(pipeline, body.id)
      await store.update(state => {
        const article = mustFind(state, body.id)
        state.articles = state.articles.filter(a => a.id !== article.id)
        if (state.currentId === article.id) state.currentId = state.articles.at(-1)?.id ?? null
      })
      return ok()
    }
    case 'chat': {
      const message = String(body.message ?? '').trim().slice(0, 4000)
      if (!message) throw Object.assign(new Error('消息为空'), { status: 400 })
      const id = await store.update(state => {
        const article = mustFind(state, body.id)
        notBusy(pipeline, article.id)
        article.chat.push({ role: 'user', text: message })
        article.notice = null
        return article.id
      })
      pipeline.chat(id, message)
      return ok()
    }
    case 'titles/regen': {
      const article = mustFind(await store.read(), body.id)
      pipeline.titles(article.id)
      return ok()
    }
    case 'title/pick':
      await store.update(state => {
        const article = mustFind(state, body.id)
        const value = String(body.text ?? '').trim().slice(0, 80)
        if (!value || value === article.title) return
        snapshot(article, '换标题')
        article.title = value
        touch(article)
      })
      return ok()
    case 'block/update':
      await store.update(state => {
        const article = mustFind(state, body.id)
        notBusy(pipeline, article.id)
        const block = mustBlock(article, body.blockId)
        const value = String(body.text ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 20000)
        if (value === block.text) return
        snapshot(article, '手动改稿')
        if (!value) article.blocks = article.blocks.filter(b => b !== block)
        else {
          block.text = value
          // 自己动手改过的段落，旧的检测结论不再作数
          block.check = null
        }
        touch(article)
      })
      return ok()
    case 'banner/style': {
      if (!BANNER_CHOICES.includes(body.style)) throw Object.assign(new Error('没有这种横幅风格'), { status: 400 })
      const article = await store.update(state => {
        const target = mustFind(state, body.id)
        target.bannerStyle = body.style
        touch(target)
        return target
      })
      if (body.style !== 'none' && !article.banners?.[body.style] && !pipeline.job(article.id)) pipeline.banner(article.id)
      return ok()
    }
    case 'banner/generate': {
      const article = mustFind(await store.read(), body.id)
      if ((article.bannerStyle ?? DEFAULT_BANNER) === 'none') throw Object.assign(new Error('当前设置是不要横幅'), { status: 400 })
      if (!article.blocks.length) throw Object.assign(new Error('先有正文，才能做横幅'), { status: 400 })
      pipeline.banner(article.id)
      return ok()
    }
    case 'block/fix': {
      const article = mustFind(await store.read(), body.id)
      mustBlock(article, body.blockId)
      pipeline.fix(article.id, body.blockId)
      return ok()
    }
    case 'block/fix-all': {
      const article = mustFind(await store.read(), body.id)
      if (!fixPlan(article).picked.length) throw Object.assign(new Error('没有需要处理的标红段'), { status: 400 })
      pipeline.fixAll(article.id)
      return ok()
    }
    case 'job/stop':
      pipeline.stop(mustFind(await store.read(), body.id).id)
      return ok()
    case 'block/keep':
      await store.update(state => {
        const article = mustFind(state, body.id)
        const block = mustBlock(article, body.blockId)
        block.check = { ...(block.check ?? {}), status: 'kept' }
        touch(article)
      })
      return ok()
    case 'block/revert':
      await store.update(state => {
        const article = mustFind(state, body.id)
        notBusy(pipeline, article.id)
        const block = mustBlock(article, body.blockId)
        if (!block.prev) throw Object.assign(new Error('这一段没有上一版'), { status: 400 })
        snapshot(article, '退回上一版')
        block.text = block.prev
        block.prev = null
        block.check = { status: 'kept', round: block.check?.round }
        touch(article)
      })
      return ok()
    case 'undo':
      await store.update(state => {
        const article = mustFind(state, body.id)
        notBusy(pipeline, article.id)
        const label = undo(article)
        if (label) article.notice = { text: `已撤销：${label}`, at: new Date().toISOString() }
      })
      return ok()
    case 'notice/clear':
      await store.update(state => { mustFind(state, body.id).notice = null })
      return ok()
    case 'settings': {
      const next = await updateSettings(store.root, body)
      setModelOverride(next.model)
      return json(res, 200, publicSettings(next))
    }
    case 'zhuque/test': {
      // 用一句固定的话试一次，确认密钥和接口地址能用。填了新密钥就试新的，没填就试已保存的。
      const settings = await readSettings(store.root)
      const key = typeof body.zhuqueKey === 'string' && body.zhuqueKey.trim() ? body.zhuqueKey.trim() : settings.zhuqueKey
      const endpoint = typeof body.zhuqueEndpoint === 'string' && body.zhuqueEndpoint.trim() ? body.zhuqueEndpoint.trim() : settings.zhuqueEndpoint
      const result = await detect('今天下楼取快递的时候，发现小区门口新开了一家面馆，排队的人不少，我就没进去。', { key, endpoint, fetchImpl: deps.fetchImpl })
      return json(res, 200, { ok: true, tokens: result.tokens })
    }
    case 'zhuque/detect': {
      const article = mustFind(await store.read(), body.id)
      if (!article.blocks.length) throw Object.assign(new Error('这篇文章还没有正文'), { status: 400 })
      const settings = await readSettings(store.root)
      if (!settings.zhuqueKey) throw Object.assign(new Error('还没有设置朱雀 API Key，点右上角的齿轮去设置'), { status: 400 })
      pipeline.detect(article.id, { key: settings.zhuqueKey, endpoint: settings.zhuqueEndpoint, fixedLines: settings.fixedLines })
      return ok()
    }
    default:
      return json(res, 404, { error: '没有这个接口' })
  }
}

/**
 * Web 服务不会替插件路由鉴权，每个请求都要自己过一遍 Host/Origin 和登录凭证检查。
 * 拿不到鉴权服务时一律拒绝。
 */
export function requestRejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return 403
  return connection.requestRejection({ headers: req.headers })
}

export function createHandler(ctx, { store = new Store(), fetchImpl } = {}) {
  const pipeline = new Pipeline({ ctx, store, skillsDir: join(store.root, 'skills'), fetchImpl })
  const deps = { ctx, store, pipeline, fetchImpl }
  // 启动时恢复用户在插件里选过的模型
  readSettings(store.root).then(saved => setModelOverride(saved.model)).catch(() => {})
  return async (req, res) => {
    try {
      const rejection = requestRejection(ctx, req)
      if (rejection) return json(res, rejection, { error: '未授权' })
      await route(deps, req, res)
    } catch (err) {
      if (res.headersSent) return res.end()
      json(res, err.status || 500, { error: err.message })
    }
  }
}

export const name = 'dsh-wechat-studio'

export default {
  inject: ['webServer', 'connection'],
  apply(ctx) {
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/wechat-studio', handler: createHandler(ctx) }), 'dsh-wechat-studio: /wechat-studio routes')
  },
}
