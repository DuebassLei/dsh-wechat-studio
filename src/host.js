import { randomUUID } from 'node:crypto'
import { COVER_RESOLUTIONS, COVER_FORMATS, MAX_COVER_COUNT } from './cover-options.js'
// dsh-wechat-studio host 半片：/wechat-studio/* 接口。
import { join } from 'node:path'
import { defaultSelection, listModels, modelInfo, modelOverride, modelStatus, setModelOverride, skillSources } from './ai.js'
import { BANNER_CHOICES, BANNER_STYLES, DEFAULT_BANNER } from './banner.js'
import { blockKind, createArticle, fixPlan, HOOK_IDS, isCheckable, listMeta, newId, revisionChanges, snapshot, splitMarkdown, toMarkdown, touch, undo } from './article.js'
import { transferFeishuImages } from './cloudinary.js'
import { feishuImageUrls, replaceFeishuImages } from './markdown-images.js'
import { coverPrompt, generateArkCover, readCover, saveCover } from './cover.js'
import { COVER_STYLES } from './cover-styles.js'
import { STYLES, THEMES, detectionText, renderLayout } from './layout.js'
import { applyRule, buildInsights, EXPERIMENT_RESULTS, importData, INSIGHTS_EMPTY, previewRule } from './insights.js'
import { Pipeline } from './pipeline.js'
import { pdfToText } from './report.js'
import { publicSettings, readSettings, updateSettings } from './settings.js'
import { Store } from './store.js'
import { detect } from './zhuque.js'

const MAX_JSON = 2_000_000
const MAX_PDF = 30_000_000
const MAX_IMPORT = 10_000_000
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

async function insightsView(deps, range = 'all') {
  const [insights, state] = await Promise.all([deps.insightsStore.read(), deps.store.read()])
  return buildInsights(insights, state.articles, ['7', '30', 'all'].includes(range) ? range : 'all')
}

const imageJobs = new WeakMap()
const coverJobs = new WeakMap()

function coverJobMap(store) {
  if (!coverJobs.has(store)) coverJobs.set(store, new Map())
  return coverJobs.get(store)
}

function coverRuns(article) {
  if (article.coverRuns) return article.coverRuns
  return [...(article.coverHistory ?? []), article.cover].filter(Boolean).map(cover => ({
    ...cover, count: 1, format: 'png', images: [{ id: cover.id }], status: 'succeeded',
  }))
}

function startCover(deps, article, apiKey, options) {
  const { store, ctx, fetchImpl } = deps
  const jobs = coverJobMap(store)
  if (jobs.has(article.id)) return
  const title = article.title
  const markdown = toMarkdown(article)
  const { count, style } = options
  const record = {
    id: randomUUID(), title, ...options, createdAt: new Date().toISOString(),
    images: [], errors: [], status: 'running',
  }
  const job = { id: record.id, stage: 'prompt', count, index: 1 }
  jobs.set(article.id, job)
  const run = async () => {
    await store.update(() => {
      article.coverRuns ??= coverRuns(article)
      article.coverRuns.push(record)
      article.coverError = null
    })
    try {
      const prompt = await coverPrompt(ctx, title, markdown, style)
      await store.update(() => { record.prompt = prompt })
      for (let index = 1; index <= count; index++) {
        Object.assign(job, { stage: 'generating', index })
        let id
        try {
          const image = await generateArkCover(prompt, { ...options, apiKey }, fetchImpl)
          job.stage = 'saving'
          id = await saveCover(store.root, image, options.format)
        } catch (err) {
          const message = err.name === 'TimeoutError' ? '封面生成超时，请重试。' : err.message
          await store.update(() => { record.errors.push(`第 ${index} 张：${message}`) })
          continue
        }
        await store.update(() => { record.images.push({ id }) })
      }
    } catch (err) {
      await store.update(() => { record.errors.push(err.message) })
    }
    await store.update(() => {
      record.status = !record.images.length ? 'failed' : record.errors.length ? 'partial' : 'succeeded'
      if (record.images.length) {
        article.cover = { ...options, id: record.images[0].id, title, prompt: record.prompt, createdAt: record.createdAt }
      }
      article.coverError = record.errors[0] ?? null
    })
  }
  void run().catch(() => { article.coverError = '保存封面状态失败，请重试。' }).finally(() => jobs.delete(article.id))
}

function imageJobMap(store) {
  if (!imageJobs.has(store)) imageJobs.set(store, new Map())
  return imageJobs.get(store)
}

function startImageImport(deps, article, urls) {
  if (!urls.length) return
  const { store, fetchImpl } = deps
  const jobs = imageJobMap(store)
  if (jobs.has(article.id)) return
  const progress = { total: urls.length, done: 0 }
  jobs.set(article.id, progress)
  const replacements = new Map()
  const run = async () => {
    const settings = await readSettings(store.root)
    let error
    try {
      error = await transferFeishuImages(urls, settings.cloudinary, (url, result) => {
        progress.done++
        if (result) replacements.set(url, result)
      }, fetchImpl)
    } catch (err) {
      error = err.message
    }
    await store.update(state => {
      const current = state.articles.find(item => item.id === article.id)
      if (!current) return
      // Apply URLs to the latest text so edits made during upload are preserved.
      for (const blocks of [current.blocks, ...current.history.map(entry => entry.blocks)]) {
        for (const block of blocks) {
          block.text = replaceFeishuImages(block.text, replacements)
          if (block.prev) block.prev = replaceFeishuImages(block.prev, replacements)
        }
      }
      const remaining = feishuImageUrls(current.blocks).length
      current.imageImport = remaining ? { error: error ?? '还有飞书图片待转存。', remaining } : null
    })
  }
  void run().catch(() => {
    article.imageImport = { error: '图片转存结果保存失败，请重试。' }
  }).finally(() => jobs.delete(article.id))
}

function view(article, pipeline, store) {
  if (!article) return null
  const currentText = new Map(article.blocks.map(block => [block.id, block.text]))
  const previousText = new Map()
  const restoredBlocks = new Set()
  for (let i = article.history.length - 1; i >= 0; i--) {
    for (const block of article.history[i].blocks) {
      if (currentText.has(block.id) && currentText.get(block.id) !== block.text && !previousText.has(block.id)) {
        previousText.set(block.id, block.text)
        if (article.history[i].label === '恢复段落上一版') restoredBlocks.add(block.id)
      }
    }
  }
  return {
    id: article.id, topic: article.topic, title: article.title, titles: article.titles, summary: article.summary,
    blocks: article.blocks.map(block => ({
      id: block.id, text: block.text, kind: blockKind(block.text), checkable: isCheckable(block.text), check: block.check,
      hasPrev: Boolean(block.prev), previousText: previousText.get(block.id) ?? (block.prev !== block.text ? block.prev ?? null : null),
      lastChangeWasRestore: restoredBlocks.has(block.id),
    })),
    banner: bannerView(article),
    followCard: article.followCard === true,
    layoutPreferences: article.layoutPreferences ?? null,
    fixPlan: (({ picked, skipped }) => ({ count: picked.length, skipped }))(fixPlan(article)),
    chat: article.chat.slice(-40), canUndo: article.history.length > 0, zhuque: article.zhuque, notice: article.notice ?? null,
    job: pipeline.job(article.id),
    coverRuns: coverRuns(article).map(run => run.status === 'running' && coverJobMap(store).get(article.id)?.id !== run.id
      ? { ...run, status: 'interrupted' } : run),
    cover: article.cover ?? null, coverJob: coverJobMap(store).get(article.id) ?? null, coverError: article.coverError ?? null,
    imageImport: imageJobMap(store).get(article.id) ?? article.imageImport ?? null,
  }
}

async function snapshotState(ctx, store, pipeline) {
  const state = await store.read()
  const current = state.articles.find(a => a.id === state.currentId && !a.archivedAt) ?? null
  const info = modelInfo(ctx)
  const settings = await readSettings(store.root)
  return {
    brand: settings.brand,
    zhuqueReady: Boolean(settings.zhuqueKey),
    articles: state.articles.map(listMeta).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    current: view(current, pipeline, store),
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
    if (path === 'insights/data') return json(res, 200, await insightsView(deps, url.searchParams.get('range')))
    const article = mustFind(await store.read(), url.searchParams.get('id'))
    if (path === 'cover/image') {
      const id = url.searchParams.get('asset')
      const run = coverRuns(article).find(run => run.images.some(image => image.id === id))
      if (!run) return json(res, 404, { error: '未找到封面' })
      const format = run.format ?? 'png'
      let image
      try {
        image = await readCover(store.root, id, format)
      } catch {
        return json(res, 404, { error: '封面文件不存在' })
      }
      res.setHeader('content-type', `image/${format}`)
      res.setHeader('cache-control', 'private, no-store')
      if (url.searchParams.has('download')) res.setHeader('content-disposition', `attachment; filename="cover.${format}"`)
      return res.end(image)
    }
    if (path === 'revisions') {
      res.setHeader('cache-control', 'private, no-store')
      return json(res, 200, { revisions: revisionChanges(article) })
    }
    if (path === 'markdown') return json(res, 200, { markdown: toMarkdown(article) })
    if (path === 'detection-text') {
      const settings = await readSettings(store.root)
      return json(res, 200, { text: await detectionText(toMarkdown(article), settings.fixedLines) })
    }
    if (path === 'layout') {
      const settings = await readSettings(store.root)
      const style = article.bannerStyle ?? DEFAULT_BANNER
      const banner = style === 'none' ? null : article.banners?.[style]?.spec ?? null
      const studioOptions = {
        banner: bannerView(article), followCard: article.followCard === true,
        layoutPreferences: article.layoutPreferences ?? null,
      }
      const { html, report } = await renderLayout(toMarkdown(article), {
        ...settings, ...article.layoutPreferences, banner, followCard: studioOptions.followCard, studioOptions,
      })
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

  if (path === 'insights/import') {
    const fileName = String(url.searchParams.get('name') ?? '导出.xls').slice(0, 200)
    const parsed = importData(await readBuffer(req, MAX_IMPORT), fileName)
    await deps.insightsStore.update(state => {
      if (parsed.kind !== 'detail') {
        state[parsed.kind] = parsed
        return
      }
      const existing = (state.details ?? []).find(detail => detail.key === parsed.key)
      if (existing?.articleKey !== undefined) parsed.articleKey = existing.articleKey
      if (existing?.topic) parsed.topic = existing.topic
      state.details = [...(state.details ?? []).filter(detail => detail.key !== parsed.key), parsed]
    })
    return json(res, 200, await insightsView(deps, url.searchParams.get('range')))
  }

  const body = await readJson(req)
  switch (path) {
    case 'insights/experiment':
      await deps.insightsStore.update(async state => {
        const items = state.experiments ?? []
        const existing = body.id ? items.find(item => item.id === body.id) : null
        if (body.id && !existing) throw Object.assign(new Error('找不到这条尝试'), { status: 404 })
        const sourceKey = existing?.sourceKey ?? body.sourceKey
        const source = (state.details ?? []).find(detail => detail.key === sourceKey)
        const action = typeof body.action === 'string' ? body.action.trim() : ''
        if (!source || !action || action.length > 300) throw Object.assign(new Error('请选择来源文章，并填写 300 字以内的改法'), { status: 400 })
        const draftId = body.draftId || null
        if (draftId && !(await store.read()).articles.some(draft => draft.id === draftId)) {
          throw Object.assign(new Error('找不到关联稿件'), { status: 404 })
        }
        const result = existing && existing.draftId === draftId && existing.action === action ? body.result ?? null : null
        if (result != null && !Object.hasOwn(EXPERIMENT_RESULTS, result)) {
          throw Object.assign(new Error('请选一个有效结论'), { status: 400 })
        }
        const item = { id: existing?.id ?? randomUUID(), sourceKey, action, draftId, result }
        state.experiments = existing ? items.map(row => row.id === item.id ? item : row) : [item, ...items]
      })
      return json(res, 200, await insightsView(deps, body.range))
    case 'insights/detail-topic':
      await deps.insightsStore.update(state => {
        const detail = (state.details ?? []).find(item => item.key === body.key)
        if (!detail) throw Object.assign(new Error('没有这份单篇明细'), { status: 404 })
        detail.topic = String(body.topic ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').slice(0, 40)
      })
      return json(res, 200, await insightsView(deps, body.range))
    case 'insights/detail-match':
      await deps.insightsStore.update(state => {
        const detail = (state.details ?? []).find(item => item.key === body.key)
        if (!detail) throw Object.assign(new Error('没有这份单篇明细'), { status: 404 })
        if (body.articleKey === 'auto') delete detail.articleKey
        else if (body.articleKey == null || state.tendency?.articles.some(row => row.key === body.articleKey)) detail.articleKey = body.articleKey
        else throw Object.assign(new Error('没有这篇数据趋势文章'), { status: 404 })
      })
      return json(res, 200, await insightsView(deps, body.range))
    case 'articles/new': {
      const hasBody = typeof body.markdown === 'string' && body.markdown.trim()
      if (!hasBody && !String(body.topic ?? '').trim() && !String(body.material ?? '').trim()) throw Object.assign(new Error('写一句选题，或者贴入已有的文章。'), { status: 400 })
      const article = createArticle(body)
      const urls = hasBody ? feishuImageUrls(article.blocks) : []
      if (urls.length) article.imageImport = { error: '图片转存中断，可以重试。', remaining: urls.length }
      await store.update(state => {
        if (state.lastLayoutPreferences) article.layoutPreferences = { ...state.lastLayoutPreferences }
        state.articles.push(article)
        state.currentId = article.id
      })
      startImageImport(deps, article, urls)
      if (!hasBody) pipeline.draft(article.id)
      else if (!article.titles.length && body.titles !== false) pipeline.titles(article.id)
      return ok()
    }
    case 'cover/select': {
      await store.update(async state => {
        const article = mustFind(state, body.id)
        if (coverJobMap(store).has(article.id)) {
          throw Object.assign(new Error('请等当前封面生成结束后再切换。'), { status: 409 })
        }
        const runs = coverRuns(article)
        const run = runs.find(entry => entry.images.some(image => image.id === body.asset))
        if (!run) throw Object.assign(new Error('这篇文章没有这张封面。'), { status: 404 })
        const { title, prompt, style, model, createdAt, resolution, count, format } = run
        try {
          await readCover(store.root, body.asset, format)
        } catch {
          throw Object.assign(new Error('封面文件不存在。'), { status: 404 })
        }
        article.coverRuns = runs
        article.cover = { id: body.asset, title, prompt, style, model, createdAt, resolution, count, format }
        touch(article)
      })
      return ok()
    }
    case 'cover/generate': {
      const style = COVER_STYLES.find(item => item.id === body.style)?.id
      if (!style) return json(res, 400, { error: '请先选择封面风格。' })
      const article = mustFind(await store.read(), body.id)
      if (!article.title?.trim() || !article.blocks.length) return json(res, 400, { error: '请先选定标题并填写正文。' })
      const { resolution = '2K', count = 1, format = 'png' } = body
      if (!COVER_RESOLUTIONS.includes(resolution) || !COVER_FORMATS.includes(format) ||
          !Number.isInteger(count) || count < 1 || count > MAX_COVER_COUNT) {
        return json(res, 400, { error: '请选择有效的分辨率、格式和生成张数（1 至 4）。' })
      }
      const { arkKey, arkModel } = await readSettings(store.root)
      if (!arkKey) return json(res, 400, { error: '请先在设置中填写火山方舟 API Key。' })
      startCover(deps, article, arkKey, { style, resolution, count, format, model: arkModel })
      return ok()
    }
    case 'images/retry': {
      const article = mustFind(await store.read(), body.id)
      const urls = feishuImageUrls(article.blocks)
      if (urls.length) startImageImport(deps, article, urls)
      else await store.update(() => { article.imageImport = null })
      return ok()
    }
    case 'articles/view': {
      if (body.view !== 'paper' && body.view !== 'layout') {
        return json(res, 400, { error: '请选择有效的稿件页面。' })
      }
      await store.update(state => { mustFind(state, body.id).lastView = body.view })
      return ok()
    }
    case 'articles/archive':
    case 'articles/restore': {
      await store.update(state => {
        const article = mustFind(state, body.id)
        if (path === 'articles/restore') {
          delete article.archivedAt
          return
        }
        notBusy(pipeline, article.id)
        if (coverJobMap(store).has(article.id) || imageJobMap(store).has(article.id)) {
          throw Object.assign(new Error('请等封面生成或图片转存完成后再归档。'), { status: 409 })
        }
        article.archivedAt ??= new Date().toISOString()
        if (state.currentId === article.id) state.currentId = null
      })
      return ok()
    }
    case 'articles/select':
      await store.update(state => {
        const article = mustFind(state, body.id)
        if (article.archivedAt) throw Object.assign(new Error('请先恢复这篇稿件。'), { status: 409 })
        state.currentId = article.id
      })
      return ok()
    case 'articles/delete': {
      notBusy(pipeline, body.id)
      if (coverJobMap(store).has(body.id)) return json(res, 409, { error: '封面生成完成后再删除这篇文章。' })
      await store.update(state => {
        const article = mustFind(state, body.id)
        state.articles = state.articles.filter(a => a.id !== article.id)
        if (state.currentId === article.id) state.currentId = state.articles.findLast(a => !a.archivedAt)?.id ?? null
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
        article.hook = article.titles.find(t => t.text === value)?.hook ?? null
        touch(article)
      })
      return ok()
    case 'block/update':
      await store.update(state => {
        const article = mustFind(state, body.id)
        notBusy(pipeline, article.id)
        const block = mustBlock(article, body.blockId)
        if (typeof body.expectedText === 'string' && block.text !== body.expectedText) {
          throw Object.assign(new Error('这一段已有新版本，未保存的编辑已保留。'), { status: 409 })
        }
        const value = String(body.text ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 20000)
        if (value === block.text) return
        snapshot(article, '手动改稿')
        if (!value) article.blocks = article.blocks.filter(b => b !== block)
        else {
          const [first, ...rest] = splitMarkdown(value, { bodyOnly: true }).blocks
          block.text = first
          if (rest.length) article.blocks.splice(article.blocks.indexOf(block) + 1, 0,
            ...rest.map(text => ({ id: newId(), text, check: null })))
          // 自己动手改过的段落，旧的检测结论不再作数
          block.check = null
        }
        touch(article)
      })
      return ok()
    case 'layout/preferences': {
      if (!STYLES.includes(body.style) || !THEMES.includes(body.theme)) {
        return json(res, 400, { error: '请选择有效的正文风格和配色。' })
      }
      await store.update(state => {
        const article = mustFind(state, body.id)
        article.layoutPreferences = { style: body.style, theme: body.theme }
        state.lastLayoutPreferences = { ...article.layoutPreferences }
      })
      return ok()
    }
    case 'layout/follow-card': {
      if (typeof body.enabled !== 'boolean') return json(res, 400, { error: '请指定是否显示文末关注卡。' })
      await store.update(state => { mustFind(state, body.id).followCard = body.enabled })
      return ok()
    }
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
    case 'block/restore-revision':
      await store.update(state => {
        const article = mustFind(state, body.id)
        notBusy(pipeline, article.id)
        const block = mustBlock(article, body.blockId)
        const previous = article.history.findLast(entry => entry.blocks.some(item => item.id === block.id && item.text !== block.text))
          ?.blocks.find(item => item.id === block.id)?.text ?? block.prev
        if (block.text !== body.expectedText || previous !== body.previousText || previous == null || previous === block.text) {
          throw Object.assign(new Error('这段文字或对比版本已变化，请关闭后重新打开对比。'), { status: 409 })
        }
        snapshot(article, '恢复段落上一版')
        block.text = previous
        block.prev = null
        block.check = null
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
    case 'insights/match': {
      const key = String(body.key ?? '')
      await deps.insightsStore.update(async state => {
        if (!state.tendency?.articles.some(a => a.key === key)) throw Object.assign(new Error('没有这篇导出文章'), { status: 404 })
        if (body.articleId === 'auto') delete state.matches[key]
        else if (body.articleId == null) state.matches[key] = null
        else {
          const draft = (await store.read()).articles.find(a => a.id === body.articleId)
          if (!draft) throw Object.assign(new Error('没有这篇稿件'), { status: 404 })
          state.matches[key] = body.articleId
        }
      })
      return json(res, 200, await insightsView(deps, body.range))
    }
    case 'insights/hook': {
      const key = String(body.key ?? '')
      const hook = body.hook == null ? null : String(body.hook)
      if (hook != null && !HOOK_IDS.includes(hook)) return json(res, 400, { error: '没有这种钩子类型' })
      await deps.insightsStore.update(state => {
        if (!state.tendency?.articles.some(a => a.key === key)) throw Object.assign(new Error('没有这篇导出文章'), { status: 404 })
        if (hook == null) delete state.hooks[key]
        else state.hooks[key] = hook
      })
      return json(res, 200, await insightsView(deps, body.range))
    }
    case 'insights/rule-preview': {
      const [insights, state] = await Promise.all([deps.insightsStore.read(), store.read()])
      return json(res, 200, await previewRule(insights, state.articles, String(body.ruleId ?? ''), join(store.root, 'skills'), body.range))
    }
    case 'insights/rule-apply': {
      const [insights, state] = await Promise.all([deps.insightsStore.read(), store.read()])
      const result = await applyRule(insights, state.articles, String(body.ruleId ?? ''), join(store.root, 'skills'), body.range)
      return json(res, 200, result)
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
  const insightsStore = new Store(store.root, { file: 'insights.json', empty: INSIGHTS_EMPTY })
  const deps = { ctx, store, pipeline, insightsStore, fetchImpl }
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
