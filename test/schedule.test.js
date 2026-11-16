import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { clearSchedule, createArticle, listMeta, markPublished, readiness, setSchedule, unpublish } from '../src/article.js'
import { route } from '../src/host.js'
import { Store } from '../src/store.js'

const FULL_MD = '# 一篇就绪的稿子\n\n第一段正文，写得足够长，才会参加检测，所以这里多写几个字凑够二十个字。'

function readyArticle() {
  const article = createArticle({ markdown: FULL_MD })
  article.zhuque = { round: 1, lastAt: new Date().toISOString() }
  article.cover = { id: 'cover-1' }
  article.bannerStyle = 'none'
  return article
}

test('readiness：五项体检，缺什么报什么', () => {
  const empty = createArticle({ topic: '只有选题' })
  const report = readiness(empty)
  assert.equal(report.total, 5)
  assert.equal(report.done, 0)
  assert.deepEqual(report.items.map(i => i.id), ['body', 'title', 'quality', 'cover', 'banner'])
  const full = readyArticle()
  assert.equal(readiness(full, { bannerReady: true }).done, 5)
  full.blocks[0].check = { status: 'flag' }
  const flagged = readiness(full, { bannerReady: true })
  assert.equal(flagged.done, 4)
  assert.equal(flagged.items.find(i => i.id === 'quality').done, false)
})

test('listMeta 透出排期、发布和体检结果', () => {
  const article = readyArticle()
  const meta = listMeta(article, { bannerReady: true })
  assert.equal(meta.scheduledFor, null)
  assert.equal(meta.publishedAt, null)
  assert.equal(meta.readiness.done, 5)
})

test('排期与发布标记：写入、清除都更新 updatedAt', () => {
  const article = readyArticle()
  const before = article.updatedAt
  setSchedule(article, '2026-11-17T12:00:00.000Z')
  assert.equal(article.scheduledFor, '2026-11-17T12:00:00.000Z')
  markPublished(article, '2026-11-17T12:30:00.000Z')
  assert.equal(article.publishedAt, '2026-11-17T12:30:00.000Z')
  assert.equal(listMeta(article).scheduledFor, '2026-11-17T12:00:00.000Z')
  assert.equal(listMeta(article).publishedAt, '2026-11-17T12:30:00.000Z')
  clearSchedule(article)
  unpublish(article)
  assert.equal(listMeta(article).scheduledFor, null)
  assert.equal(listMeta(article).publishedAt, null)
  assert.ok(article.updatedAt >= before)
})

async function setup() {
  const store = new Store(mkdtempSync(join(tmpdir(), 'ws-schedule-')))
  const article = readyArticle()
  const archived = createArticle({ markdown: '# 归档稿\n\n正文。' })
  archived.archivedAt = new Date().toISOString()
  await store.update(state => { state.articles.push(article, archived); state.currentId = article.id })
  const deps = { ctx: { get: () => null }, store, pipeline: { job: () => null } }
  const request = async (path, payload) => {
    const req = {
      url: `/wechat-studio/${path}`, method: payload ? 'POST' : 'GET',
      async *[Symbol.asyncIterator]() { if (payload) yield Buffer.from(JSON.stringify(payload)) },
    }
    let result
    const res = {
      statusCode: 0, headers: {},
      setHeader(name, value) { this.headers[name] = value },
      end(value) { result = this.headers['content-type']?.startsWith('application/json') ? JSON.parse(value) : value },
    }
    // route 抛错、createHandler 负责转状态码；这里照搬那层映射，才能断言 400/409
    try {
      await route(deps, req, res)
    } catch (err) {
      res.statusCode = err.status || 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: err.message }))
    }
    return { body: result, status: res.statusCode }
  }
  return { store, article, archived, request }
}

const metaOf = (body, id) => body.articles.find(a => a.id === id)

test('schedule/set：排期落到稿件，非法时间、归档稿、已发稿都拒绝', async () => {
  const { article, archived, request } = await setup()
  const ok = await request('schedule/set', { id: article.id, at: '2026-11-19T20:00:00+08:00' })
  assert.equal(ok.status, 200)
  assert.equal(metaOf(ok.body, article.id).scheduledFor, new Date('2026-11-19T20:00:00+08:00').toISOString())
  assert.equal((await request('schedule/set', { id: article.id, at: '不是时间' })).status, 400)
  assert.equal((await request('schedule/set', { id: article.id, at: 123 })).status, 400)
  assert.equal((await request('schedule/set', { id: archived.id, at: '2026-11-19T12:00:00Z' })).status, 409)
  await request('articles/publish', { id: article.id })
  assert.equal((await request('schedule/set', { id: article.id, at: '2026-11-20T12:00:00Z' })).status, 409)
})

test('schedule/clear：取消排期回到待排，已发稿不能取消', async () => {
  const { article, request } = await setup()
  await request('schedule/set', { id: article.id, at: '2026-11-19T12:00:00Z' })
  const cleared = await request('schedule/clear', { id: article.id })
  assert.equal(cleared.status, 200)
  assert.equal(metaOf(cleared.body, article.id).scheduledFor, null)
  await request('articles/publish', { id: article.id })
  assert.equal((await request('schedule/clear', { id: article.id })).status, 409)
})

test('articles/publish / unpublish：默认当前时间，可指定，可撤销，归档稿拒绝', async () => {
  const { article, archived, request } = await setup()
  const before = Date.now()
  const published = await request('articles/publish', { id: article.id })
  assert.equal(published.status, 200)
  assert.ok(new Date(metaOf(published.body, article.id).publishedAt).getTime() >= before)
  const undone = await request('articles/unpublish', { id: article.id })
  assert.equal(metaOf(undone.body, article.id).publishedAt, null)
  const explicit = await request('articles/publish', { id: article.id, at: '2026-11-10T08:00:00Z' })
  assert.equal(metaOf(explicit.body, article.id).publishedAt, '2026-11-10T08:00:00.000Z')
  assert.equal((await request('articles/publish', { id: archived.id })).status, 409)
})

test('state 投影：横幅就绪计入体检，排期字段随路由变化', async () => {
  const { article, request } = await setup()
  const state = await request('state')
  const meta = metaOf(state.body, article.id)
  assert.equal(meta.readiness.done, 5, 'bannerStyle=none 时横幅视为就绪')
  await request('schedule/set', { id: article.id, at: '2026-11-21T20:00:00Z' })
  const after = await request('state')
  assert.equal(metaOf(after.body, article.id).scheduledFor, '2026-11-21T20:00:00.000Z')
})