import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createArticle } from '../src/article.js'
import { route } from '../src/host.js'
import { updateSettings } from '../src/settings.js'
import { Store } from '../src/store.js'

const CARD = '```svg-steps 审稿流程\n第一步 | 导入\n第二步 | 检查\n第三步 | 完成\n```'
const FEISHU = 'https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=demo'
const CLOUDINARY = 'https://res.cloudinary.com/demo/image/upload/reimport.png'

async function setup({ markdown = '# 旧标题\n\n保留段落\n\n![旧图](https://example.com/old.png)' } = {}) {
  const store = new Store(mkdtempSync(join(tmpdir(), 'ws-reimport-routes-')))
  const article = createArticle({ markdown })
  article.summary = '旧摘要'
  article.titles = [{ text: '旧标题', hook: 'A' }]
  article.hook = 'A'
  article.zhuque = { round: 3, lastAt: '2026-11-17T08:00:00.000Z' }
  article.blocks[0].check = { status: 'flag', round: 3 }
  article.scheduledFor = '2026-11-20T10:00:00.000Z'
  article.cover = { id: 'cover-id', format: 'png' }
  article.layoutPreferences = { style: 'neo', theme: 'blue' }
  article.chat = [{ role: 'user', text: '保留聊天记录' }]
  const other = createArticle({ markdown: '# 另一篇\n\n不动我' })
  await store.update(state => { state.articles.push(article, other); state.currentId = article.id })
  const pipelineCalls = []
  const deps = {
    ctx: { get: () => null }, store,
    pipeline: {
      job: () => null,
      draft: id => pipelineCalls.push(['draft', id]),
      titles: id => pipelineCalls.push(['titles', id]),
    },
    fetchImpl: async () => Response.json({ secure_url: CLOUDINARY }),
  }
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
    try {
      await route(deps, req, res)
    } catch (error) {
      res.statusCode = error.status || 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: error.message }))
    }
    return { body: result, status: res.statusCode }
  }
  return { store, deps, article, other, request, pipelineCalls }
}

async function preview(request, article, markdown, updateTitle = false) {
  const response = await request('articles/reimport/preview', { id: article.id, markdown, updateTitle })
  assert.equal(response.status, 200, response.body.error)
  return response.body
}

async function waitFor(check) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await check()) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('等待后台任务超时')
}

test('预检只返回摘要；显式 ID 覆盖另一篇且不切换 currentId，也不调用模型', async () => {
  const { store, article, other, request, pipelineCalls } = await setup()
  await store.update(state => { state.currentId = other.id })
  const plan = await preview(request, article, '# 审稿标题\n\n新增开头\n\n保留段落', true)
  assert.equal(plan.currentTitle, '旧标题')
  assert.equal(plan.incomingTitle, '审稿标题')
  assert.equal(plan.finalTitle, '审稿标题')
  assert.deepEqual([plan.kept, plan.removed, plan.added], [1, 1, 1])
  assert.equal(plan.entries, undefined)
  const result = await request('articles/reimport', {
    id: article.id, markdown: '# 审稿标题\n\n新增开头\n\n保留段落', updateTitle: true,
    token: plan.token, acknowledgeRemovedMedia: false,
  })
  assert.equal(result.status, 409)
  const confirmed = await request('articles/reimport', {
    id: article.id, markdown: '# 审稿标题\n\n新增开头\n\n保留段落', updateTitle: true,
    token: plan.token, acknowledgeRemovedMedia: true,
  })
  assert.equal(confirmed.status, 200, confirmed.body.error)
  const state = await store.read()
  assert.equal(state.currentId, other.id)
  assert.equal(other.title, '另一篇')
  assert.deepEqual(article.blocks.map(block => block.text), ['新增开头', '保留段落'])
  assert.equal(article.blocks[1].id, plan.kept === 1 ? article.history[0].blocks[0].id : null)
  assert.equal(article.title, '审稿标题')
  assert.equal(article.summary, '')
  assert.deepEqual(article.titles, [])
  assert.equal(article.hook, null)
  assert.deepEqual(article.zhuque, { round: 0, lastAt: null })
  assert.equal(article.scheduledFor, '2026-11-20T10:00:00.000Z')
  assert.deepEqual(article.cover, { id: 'cover-id', format: 'png' })
  assert.deepEqual(article.layoutPreferences, { style: 'neo', theme: 'blue' })
  assert.deepEqual(article.chat, [{ role: 'user', text: '保留聊天记录' }])
  assert.equal(article.history.filter(entry => entry.label === '重新导入 Markdown').length, 1)
  assert.deepEqual(pipelineCalls, [])
  assert.match(article.notice.text, /撤销/)
})

test('预检后编辑、切换标题选项和并发覆盖都以凭据复验阻止', async () => {
  const { store, article, request } = await setup()
  const markdown = '# 新标题\n\n全新正文'
  const plan = await preview(request, article, markdown)
  const otherTitle = await preview(request, article, markdown, true)
  assert.notEqual(plan.token, otherTitle.token)
  await store.update(() => { article.blocks[0].text = '预检后又改了一段' })
  const stale = await request('articles/reimport', { id: article.id, markdown, token: plan.token })
  assert.equal(stale.status, 409)
  assert.match(stale.body.error, /重新预检/)
  await store.update(() => { article.blocks[0].text = '保留段落' })
  const concurrent = await Promise.all([
    request('articles/reimport', { id: article.id, markdown, token: plan.token, acknowledgeRemovedMedia: true }),
    request('articles/reimport', { id: article.id, markdown, token: plan.token, acknowledgeRemovedMedia: true }),
  ])
  assert.deepEqual(concurrent.map(result => result.status).sort(), [200, 409])
  assert.equal(article.history.filter(entry => entry.label === '重新导入 Markdown').length, 1)
})

test('媒体移出必须明确确认，空操作不覆盖', async () => {
  const { article, request } = await setup({ markdown: `# 标题\n\n保留\n\n![图](https://example.com/a.png)\n\n${CARD}` })
  const markdown = '# 标题\n\n保留'
  const plan = await preview(request, article, markdown)
  assert.equal(plan.removedMedia.length, 2)
  assert.deepEqual(plan.removedMedia.map(item => item.kind), ['image', 'svg'])
  const denied = await request('articles/reimport', { id: article.id, markdown, token: plan.token })
  assert.equal(denied.status, 409)
  assert.match(denied.body.error, /确认/)
  assert.equal(article.blocks.length, 3)
  const noop = await preview(request, article, '# 标题\n\n保留\n\n![图](https://example.com/a.png)\n\n' + CARD)
  assert.equal(noop.changed, false)
  const unchanged = await request('articles/reimport', { id: article.id, markdown: '# 标题\n\n保留\n\n![图](https://example.com/a.png)\n\n' + CARD, token: noop.token })
  assert.equal(unchanged.status, 409)
  assert.match(unchanged.body.error, /无需覆盖/)
})

test('活动任务、归档和已发布稿件返回 409', async () => {
  const { store, deps, article, request } = await setup()
  const markdown = '# 标题\n\n新正文'
  const assertBlocked = async expected => {
    const response = await request('articles/reimport/preview', { id: article.id, markdown })
    assert.equal(response.status, 409)
    assert.match(response.body.error, expected)
  }
  deps.pipeline.job = id => id === article.id ? { kind: 'chat' } : null
  await assertBlocked(/任务/)
  deps.pipeline.job = () => null
  await store.update(() => { article.archivedAt = new Date().toISOString() })
  await assertBlocked(/归档/)
  await store.update(() => { delete article.archivedAt; article.publishedAt = new Date().toISOString() })
  await assertBlocked(/发布/)
})

test('撤销恢复派生字段，重开 Store 后仍可撤销', async () => {
  const { store, deps, article, request } = await setup()
  const markdown = '# 新标题\n\n新正文'
  const plan = await preview(request, article, markdown, true)
  const oldImageImport = { error: '旧图片失败', remaining: 1 }
  await store.update(() => { article.imageImport = oldImageImport })
  const refreshed = await preview(request, article, markdown, true)
  assert.equal((await request('articles/reimport', { id: article.id, markdown, updateTitle: true, token: refreshed.token, acknowledgeRemovedMedia: true })).status, 200)
  const reopened = new Store(store.root)
  deps.store = reopened
  const response = await request('undo', { id: article.id })
  assert.equal(response.status, 200, response.body.error)
  const restored = (await reopened.read()).articles.find(item => item.id === article.id)
  assert.equal(restored.title, '旧标题')
  assert.deepEqual(restored.blocks.map(block => block.text), ['保留段落', '![旧图](https://example.com/old.png)'])
  assert.equal(restored.summary, '旧摘要')
  assert.deepEqual(restored.titles, [{ text: '旧标题', hook: 'A' }])
  assert.equal(restored.hook, 'A')
  assert.deepEqual(restored.zhuque, { round: 3, lastAt: '2026-11-17T08:00:00.000Z' })
  assert.equal(restored.blocks[0].check.status, 'flag')
  assert.deepEqual(restored.imageImport, oldImageImport)
})

test('仅更新标题保留正文检查和图片状态，不启动转存', async () => {
  const { article, request, pipelineCalls } = await setup()
  const oldImageImport = { error: '旧错误', remaining: 2 }
  article.imageImport = oldImageImport
  const markdown = '# 新标题\n\n保留段落\n\n![旧图](https://example.com/old.png)'
  const plan = await preview(request, article, markdown, true)
  const response = await request('articles/reimport', { id: article.id, markdown, updateTitle: true, token: plan.token })
  assert.equal(response.status, 200, response.body.error)
  assert.equal(article.title, '新标题')
  assert.equal(article.blocks[0].check.status, 'flag')
  assert.equal(article.zhuque.round, 3)
  assert.equal(article.summary, '旧摘要')
  assert.deepEqual(article.imageImport, oldImageImport)
  assert.deepEqual(pipelineCalls, [])
})

test('覆盖后的转存只改当前正文，运行中暂缓撤销，结束后恢复原图片状态', async () => {
  const { store, deps, article, request } = await setup()
  await updateSettings(store.root, { cloudinary: { cloudName: 'demo', apiKey: 'key', apiSecret: 'secret' } })
  const oldImageImport = { error: '旧图片失败', remaining: 1 }
  article.imageImport = oldImageImport
  const markdown = `# 标题\n\n![飞书图](${FEISHU})`
  const plan = await preview(request, article, markdown)
  let release
  const gate = new Promise(resolve => { release = resolve })
  deps.fetchImpl = async () => {
    await gate
    return Response.json({ secure_url: CLOUDINARY })
  }
  const response = await request('articles/reimport', { id: article.id, markdown, token: plan.token, acknowledgeRemovedMedia: true })
  assert.equal(response.status, 200, response.body.error)
  const before = article.history.at(-1)
  assert.equal(before.blocks[1].text, '![旧图](https://example.com/old.png)')
  const pendingUndo = await request('undo', { id: article.id })
  assert.equal(pendingUndo.status, 409)
  assert.match(pendingUndo.body.error, /图片转存完成后/)
  release()
  await waitFor(async () => (await request('state')).body.current.imageImport === null)
  assert.equal(before.blocks[1].text, '![旧图](https://example.com/old.png)')
  assert.equal((await request('undo', { id: article.id })).status, 200)
  assert.deepEqual(article.blocks.map(block => block.text), ['保留段落', '![旧图](https://example.com/old.png)'])
  assert.deepEqual(article.imageImport, oldImageImport)
})

test('转存失败后可撤销，旧正文和旧图片状态都能恢复', async () => {
  const { store, deps, article, request } = await setup()
  await updateSettings(store.root, { cloudinary: { cloudName: 'demo', apiKey: 'key', apiSecret: 'secret' } })
  deps.fetchImpl = async () => new Response('failed', { status: 500 })
  const markdown = `# 标题\n\n![飞书图](${FEISHU})`
  const plan = await preview(request, article, markdown)
  assert.equal((await request('articles/reimport', { id: article.id, markdown, token: plan.token, acknowledgeRemovedMedia: true })).status, 200)
  await waitFor(async () => Boolean((await request('state')).body.current.imageImport?.error))
  assert.match(article.imageImport.error, /转存失败/)
  assert.equal((await request('undo', { id: article.id })).status, 200)
  assert.deepEqual(article.blocks.map(block => block.text), ['保留段落', '![旧图](https://example.com/old.png)'])
  assert.equal(article.imageImport, undefined)
})

test('正文插图移出后建议不再显示已插入，撤销后恢复原插入状态', async () => {
  const image = 'https://res.cloudinary.com/demo/image/upload/inline.png'
  const { article, request } = await setup({ markdown: `# 标题\n\n保留段落\n\n![正文插图](${image})` })
  article.inlineDiagrams = [{
    id: 'diagram-1', anchorId: article.blocks[0].id, insertedBlockId: article.blocks[1].id,
    publicUrl: image, assetId: 'asset-1', status: 'inserted',
  }]
  article.svgCardInsertions = [{ operationId: 'keep-operation', cardBlockId: 'old-card' }]
  const markdown = '# 标题\n\n保留段落'
  const plan = await preview(request, article, markdown)
  const response = await request('articles/reimport', {
    id: article.id, markdown, token: plan.token, acknowledgeRemovedMedia: true,
  })
  assert.equal(response.status, 200, response.body.error)
  assert.equal(response.body.current.inlineDiagrams[0].status, 'generated')
  assert.equal(response.body.current.inlineDiagrams[0].insertedBlockExists, false)
  assert.equal(article.inlineDiagrams[0].assetId, 'asset-1')
  assert.deepEqual(article.svgCardInsertions, [{ operationId: 'keep-operation', cardBlockId: 'old-card' }])
  const undone = await request('undo', { id: article.id })
  assert.equal(undone.status, 200)
  assert.equal(undone.body.current.inlineDiagrams[0].status, 'inserted')
  assert.equal(undone.body.current.inlineDiagrams[0].insertedBlockExists, true)
})

test('行内图片移出未确认时返回 409，正文保持不变', async () => {
  const url = 'https://example.com/a.png'
  const { article, request } = await setup({ markdown: `# 标题\n\n图例：![图一](${url}) 和 ![图二](${url})` })
  const markdown = `# 标题\n\n图例：![仍保留一张](${url})`
  const plan = await preview(request, article, markdown)
  assert.equal(plan.removedMedia.length, 1)
  const response = await request('articles/reimport', { id: article.id, markdown, token: plan.token })
  assert.equal(response.status, 409)
  assert.match(response.body.error, /确认/)
  assert.equal(article.blocks[0].text, `图例：![图一](${url}) 和 ![图二](${url})`)
})

test('转存后撤销普通编辑保留图床链接，再撤销覆盖恢复原飞书链接', async () => {
  const { store, deps, article, request } = await setup({ markdown: `# 标题\n\n保留段落\n\n![飞书图](${FEISHU})` })
  await updateSettings(store.root, { cloudinary: { cloudName: 'demo', apiKey: 'key', apiSecret: 'secret' } })
  const oldImageImport = { error: '旧状态', remaining: 1 }
  article.imageImport = oldImageImport
  const markdown = `# 标题\n\n新增开头\n\n保留段落\n\n![飞书图](${FEISHU})`
  const plan = await preview(request, article, markdown)
  let release
  const gate = new Promise(resolve => { release = resolve })
  deps.fetchImpl = async () => { await gate; return Response.json({ secure_url: CLOUDINARY }) }
  assert.equal((await request('articles/reimport', { id: article.id, markdown, token: plan.token })).status, 200)
  const target = article.blocks.find(block => block.text === '保留段落')
  assert.equal((await request('block/update', { id: article.id, blockId: target.id, expectedText: target.text, text: '普通手动编辑' })).status, 200)
  release()
  await waitFor(async () => (await request('state')).body.current.imageImport === null)
  assert.equal((await request('undo', { id: article.id })).status, 200)
  assert.equal(article.blocks.find(block => block.id === target.id).text, '保留段落')
  assert.equal(article.blocks.at(-1).text, `![飞书图](${CLOUDINARY})`)
  assert.equal(article.imageImport, null)
  assert.equal((await request('undo', { id: article.id })).status, 200)
  assert.equal(article.blocks.at(-1).text, `![飞书图](${FEISHU})`)
  assert.deepEqual(article.imageImport, oldImageImport)
})

test('失败后重试的转存同样保留普通编辑快照中的图床链接', async () => {
  const { store, deps, article, request } = await setup({ markdown: `# 标题\n\n保留段落\n\n![飞书图](${FEISHU})` })
  await updateSettings(store.root, { cloudinary: { cloudName: 'demo', apiKey: 'key', apiSecret: 'secret' } })
  const markdown = `# 标题\n\n新增开头\n\n保留段落\n\n![飞书图](${FEISHU})`
  const plan = await preview(request, article, markdown)
  deps.fetchImpl = async () => new Response('failed', { status: 500 })
  assert.equal((await request('articles/reimport', { id: article.id, markdown, token: plan.token })).status, 200)
  await waitFor(async () => Boolean((await request('state')).body.current.imageImport?.error))
  const target = article.blocks.find(block => block.text === '保留段落')
  assert.equal((await request('block/update', { id: article.id, blockId: target.id, expectedText: target.text, text: '普通手动编辑' })).status, 200)
  let release
  const gate = new Promise(resolve => { release = resolve })
  deps.fetchImpl = async () => { await gate; return Response.json({ secure_url: CLOUDINARY }) }
  await request('images/retry', { id: article.id })
  release()
  await waitFor(async () => (await request('state')).body.current.imageImport === null)
  assert.equal((await request('undo', { id: article.id })).status, 200)
  assert.equal(article.blocks.at(-1).text, `![飞书图](${CLOUDINARY})`)
  assert.equal((await request('undo', { id: article.id })).status, 200)
  assert.equal(article.blocks.at(-1).text, `![飞书图](${FEISHU})`)
})

test('第二次覆盖的转存不会改写最近一次覆盖前的快照', async () => {
  const { store, deps, article, request } = await setup()
  await updateSettings(store.root, { cloudinary: { cloudName: 'demo', apiKey: 'key', apiSecret: 'secret' } })
  const firstMarkdown = `# 标题\n\n![飞书图](${FEISHU})`
  const first = await preview(request, article, firstMarkdown)
  deps.fetchImpl = async () => new Response('failed', { status: 500 })
  assert.equal((await request('articles/reimport', { id: article.id, markdown: firstMarkdown, token: first.token, acknowledgeRemovedMedia: true })).status, 200)
  await waitFor(async () => Boolean((await request('state')).body.current.imageImport?.error))
  const secondMarkdown = `# 标题\n\n新增开头\n\n![飞书图](${FEISHU})`
  const second = await preview(request, article, secondMarkdown)
  deps.fetchImpl = async () => Response.json({ secure_url: CLOUDINARY })
  assert.equal((await request('articles/reimport', { id: article.id, markdown: secondMarkdown, token: second.token })).status, 200)
  await waitFor(async () => (await request('state')).body.current.imageImport === null)
  assert.equal(article.history[0].blocks[1].text, '![旧图](https://example.com/old.png)')
  assert.equal(article.history[1].blocks[0].text, `![飞书图](${FEISHU})`)
})

test('仅更新标题且正文不变时预检不报告飞书转存', async () => {
  const { article, request } = await setup({ markdown: `# 旧标题\n\n![飞书图](${FEISHU})` })
  const markdown = `# 新标题\n\n![飞书图](${FEISHU})`
  const plan = await preview(request, article, markdown, true)
  assert.equal(plan.bodyChanged, false)
  assert.equal(plan.transfers, 0)
})
