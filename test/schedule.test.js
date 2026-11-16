import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { clearSchedule, correctPublishedAt, createArticle, listMeta, markPublished, readiness, setSchedule, unpublish } from '../src/article.js'
import { route } from '../src/host.js'
import { addDays, atOn, dayKey, isOverdue, mondayOf, parseDay, scheduleTime } from '../src/schedule-time.js'
import { Store } from '../src/store.js'

const FULL_MD = '# 一篇就绪的稿子\n\n第一段正文，写得足够长，才会参加检测，所以这里多写几个字凑够二十个字。'

function readyArticle() {
  const article = createArticle({ markdown: FULL_MD })
  article.zhuque = { round: 1, lastAt: new Date().toISOString() }
  article.cover = { id: 'cover-1' }
  article.bannerStyle = 'none'
  return article
}

test('本地日期键：周范围、午夜和跨年导航使用日历日期', () => {
  const thursday = parseDay('2026-12-31')
  assert.equal(dayKey(mondayOf(thursday)), '2026-12-28')
  assert.equal(dayKey(addDays(mondayOf(thursday), 7)), '2027-01-04')
  assert.equal(dayKey(parseDay('2027-01-01')), '2027-01-01')
  assert.equal(dayKey(mondayOf(parseDay('2027-01-03'))), '2026-12-28')
  assert.equal(dayKey(mondayOf(parseDay('2027-01-04'))), '2027-01-04')
  assert.throws(() => parseDay('2026-02-29'), RangeError)
  assert.throws(() => parseDay('2026-2-03'), RangeError)
})

test('排期时间：只接受带时区、未归一化且年份在输入日期边界内的 ISO', () => {
  assert.equal(scheduleTime('2026-11-19T20:00:00+08:00'), '2026-11-19T12:00:00.000Z')
  assert.equal(scheduleTime('2026-11-19T20:00Z'), '2026-11-19T20:00:00.000Z')
  assert.equal(scheduleTime('2000-01-01T00:00:00+14:00'), '1999-12-31T10:00:00.000Z')
  assert.equal(scheduleTime('2100-12-31T23:30:00-10:00'), '2101-01-01T09:30:00.000Z')
  for (const value of [
    '2026-11-19', '2026-11-19T20:00:00', '2026-11-19T20:00:00+08',
    '2026-02-29T20:00:00Z', '2026-11-31T20:00:00Z', '2026-11-19T24:00:00Z',
    '2026-11-19T20:00:00+08:60', '1999-12-31T23:30:00-10:00',
    '2101-01-01T00:30:00+14:00', 123, null,
  ]) assert.throws(() => scheduleTime(value), RangeError, String(value))
})

test('排期时间：浏览器本地构造保留时分并拒绝夏令时缺口', () => {
  const oldZone = process.env.TZ
  process.env.TZ = 'America/New_York'
  try {
    const beforeGap = atOn('2026-03-08', 1, 30)
    const afterGap = atOn('2026-03-08', 3, 30)
    assert.equal(beforeGap, '2026-03-08T06:30:00.000Z')
    assert.equal(afterGap, '2026-03-08T07:30:00.000Z')
    assert.equal(new Date(afterGap).getHours(), 3)
    assert.equal(new Date(afterGap).getMinutes(), 30)
    assert.throws(() => atOn('2026-03-08', 2, 30), RangeError)
    assert.equal(atOn('2026-11-01', 1, 30), '2026-11-01T05:30:00.000Z')
    assert.equal(dayKey(parseDay('2026-03-09')), '2026-03-09')
  } finally {
    if (oldZone == null) delete process.env.TZ
    else process.env.TZ = oldZone
  }
})

test('排期边界：同一时刻不算过点，下一刻才算', () => {
  const at = Date.parse('2026-11-16T20:00:00Z')
  assert.equal(isOverdue('2026-11-16T20:00:00Z', at - 1), false)
  assert.equal(isOverdue('2026-11-16T20:00:00Z', at), false)
  assert.equal(isOverdue('2026-11-16T20:00:00Z', at + 1), true)
})

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
  assert.equal(meta.publishMarkedAt, null)
  assert.equal(meta.readiness.done, 5)
})

test('排期与发布标记：写入、清除都更新 updatedAt', () => {
  const article = readyArticle()
  const before = article.updatedAt
  setSchedule(article, '2026-11-17T12:00:00.000Z')
  assert.equal(article.scheduledFor, '2026-11-17T12:00:00.000Z')
  markPublished(article, '2026-11-17T12:30:00.000Z', '2026-11-17T13:00:00.000Z')
  assert.equal(article.publishedAt, '2026-11-17T12:30:00.000Z')
  assert.equal(article.publishMarkedAt, '2026-11-17T13:00:00.000Z')
  assert.equal(listMeta(article).scheduledFor, '2026-11-17T12:00:00.000Z')
  assert.equal(listMeta(article).publishedAt, '2026-11-17T12:30:00.000Z')
  assert.equal(listMeta(article).publishMarkedAt, '2026-11-17T13:00:00.000Z')
  assert.equal(markPublished(article, '2026-11-18T12:30:00.000Z', '2026-11-18T13:00:00.000Z'), false)
  assert.equal(article.publishedAt, '2026-11-17T12:30:00.000Z')
  correctPublishedAt(article, '2026-11-17T12:45:00.000Z')
  assert.equal(article.publishedAt, '2026-11-17T12:45:00.000Z')
  assert.equal(article.publishMarkedAt, '2026-11-17T13:00:00.000Z')
  clearSchedule(article)
  unpublish(article)
  assert.equal(listMeta(article).scheduledFor, null)
  assert.equal(listMeta(article).publishedAt, null)
  assert.equal(listMeta(article).publishMarkedAt, null)
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
  for (const at of ['不是时间', 123, '2026-11-19', '2026-11-19T20:00:00', '2026-02-30T20:00:00Z']) {
    assert.equal((await request('schedule/set', { id: article.id, at })).status, 400)
  }
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

test('articles/publish / unpublish：实际时间与标记时间分开，可补记和撤销', async () => {
  const { article, archived, request } = await setup()
  await request('schedule/set', { id: article.id, at: '2026-11-09T08:00:00Z' })
  const before = Date.now()
  const published = await request('articles/publish', { id: article.id })
  assert.equal(published.status, 200)
  assert.ok(new Date(metaOf(published.body, article.id).publishedAt).getTime() >= before)
  assert.ok(new Date(metaOf(published.body, article.id).publishMarkedAt).getTime() >= before)
  const undone = await request('articles/unpublish', { id: article.id })
  assert.equal(metaOf(undone.body, article.id).publishedAt, null)
  assert.equal(metaOf(undone.body, article.id).publishMarkedAt, null)
  assert.equal(metaOf(undone.body, article.id).scheduledFor, '2026-11-09T08:00:00.000Z')
  const explicit = await request('articles/publish', { id: article.id, at: '2026-11-10T08:00:00Z' })
  assert.equal(metaOf(explicit.body, article.id).publishedAt, '2026-11-10T08:00:00.000Z')
  assert.notEqual(metaOf(explicit.body, article.id).publishMarkedAt, '2026-11-10T08:00:00.000Z')
  assert.equal((await request('articles/publish', { id: archived.id })).status, 409)
  assert.equal((await request('articles/unpublish', { id: archived.id })).status, 409)
  const future = new Date(Date.now() + 3600000).toISOString()
  assert.equal((await request('articles/publish', { id: article.id, at: future })).status, 400)
})

test('articles/publish：重复与并发确认保留首次时间，更正走独立入口', async () => {
  const { article, request } = await setup()
  const at = '2026-11-10T08:00:00Z'
  const [first, second] = await Promise.all([
    request('articles/publish', { id: article.id, at }),
    request('articles/publish', { id: article.id, at: '2026-11-11T08:00:00Z' }),
  ])
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  const repeated = await request('articles/publish', { id: article.id, at: '2026-11-12T08:00:00Z' })
  const before = metaOf(repeated.body, article.id)
  assert.equal(before.publishedAt, new Date(at).toISOString())
  const markedAt = before.publishMarkedAt
  assert.ok(markedAt)
  const corrected = await request('articles/correct-publish', { id: article.id, at: '2026-11-10T09:30:00Z' })
  assert.equal(corrected.status, 200)
  assert.equal(metaOf(corrected.body, article.id).publishedAt, '2026-11-10T09:30:00.000Z')
  assert.equal(metaOf(corrected.body, article.id).publishMarkedAt, markedAt)
  const future = new Date(Date.now() + 3600000).toISOString()
  assert.equal((await request('articles/correct-publish', { id: article.id, at: future })).status, 400)
  assert.equal((await request('articles/unpublish', { id: article.id })).status, 200)
  assert.equal((await request('articles/correct-publish', { id: article.id, at })).status, 409)
})

test('旧发布记录：没有标记时间仍可读取，不清空原排期', async () => {
  const { store, article, request } = await setup()
  await store.update(state => {
    const current = state.articles.find(item => item.id === article.id)
    current.scheduledFor = '2026-11-09T12:00:00.000Z'
    current.publishedAt = '2026-11-10T12:00:00.000Z'
  })
  const state = await request('state')
  const meta = metaOf(state.body, article.id)
  assert.equal(meta.scheduledFor, '2026-11-09T12:00:00.000Z')
  assert.equal(meta.publishedAt, '2026-11-10T12:00:00.000Z')
  assert.equal(meta.publishMarkedAt, null)
  const corrected = await request('articles/correct-publish', { id: article.id, at: '2026-11-10T11:30:00Z' })
  assert.equal(corrected.status, 200)
  assert.equal(metaOf(corrected.body, article.id).publishedAt, '2026-11-10T11:30:00.000Z')
  assert.equal(metaOf(corrected.body, article.id).publishMarkedAt, '2026-11-10T12:00:00.000Z')
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