import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createArticle, toMarkdown } from '../src/article.js'
import { route } from '../src/host.js'
import { svgCardSourceHash } from '../src/svg-cards.js'
import { updateSettings } from '../src/settings.js'
import { Store } from '../src/store.js'

const STEPS = { title: '三步完成', lines: ['打开首页 | 点新建', '粘贴正文 | 不要改动', '确认插入 | 检查位置'] }

async function setup() {
  const store = new Store(mkdtempSync(join(tmpdir(), 'ws-svg-routes-')))
  const article = createArticle({ markdown: '# 动画卡测试\n\n第一段介绍具体步骤。\n\n第二段保持不变。' })
  article.layoutPreferences = { style: 'neo', theme: 'blue' }
  const other = createArticle({ markdown: '# 另一篇\n\n其他段落。' })
  await store.update(state => { state.articles.push(article, other); state.currentId = article.id })
  let output = JSON.stringify(STEPS)
  let beforeStream = null
  const calls = []
  const llm = {
    prepareCall() {
      return {
        config: {},
        async *stream(request) {
          calls.push(request)
          if (beforeStream) await beforeStream()
          yield { type: 'text-delta', text: output }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
  const services = { llm, agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) } }
  const deps = { ctx: { get: name => services[name] ?? null }, store, pipeline: { job: () => null } }
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
  return {
    store, article, other, request, calls,
    setOutput(value) { output = typeof value === 'string' ? value : JSON.stringify(value) },
    setBeforeStream(fn) { beforeStream = fn },
    async candidate() {
      const response = await request('svg-cards/draft', { id: article.id, blockId: article.blocks[0].id, kind: 'svg-steps' })
      assert.equal(response.status, 200, response.body.error)
      return response.body
    },
  }
}

test('svg-cards/draft：模型按技能生成候选但不写正文', async () => {
  const { article, request, calls, candidate } = await setup()
  const before = toMarkdown(article)
  const result = await candidate()
  assert.equal(result.card.title, STEPS.title)
  assert.deepEqual(result.card.lines, STEPS.lines)
  assert.equal(result.articleId, article.id)
  assert.equal(result.blockId, article.blocks[0].id)
  assert.equal(result.sourceHash, svgCardSourceHash(article.blocks[0].text))
  assert.match(result.markdown, /^```svg-steps 三步完成/)
  assert.equal(toMarkdown(article), before)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].messages[0].source.task, 'svg-card-draft')
  assert.match(calls[0].system, /公众号 SVG 动画卡/)
  const user = JSON.parse(calls[0].messages[0].content[0].text)
  assert.equal(user.target, article.blocks[0].text)
  assert.equal(user.next, article.blocks[1].text)
})

test('svg-cards/draft：非法 JSON、HTML、围栏和错误格式返回明确错误', async () => {
  const { article, request, setOutput } = await setup()
  const make = output => request('svg-cards/draft', { id: article.id, blockId: article.blocks[0].id, kind: 'svg-steps' })
  setOutput('不是 JSON')
  assert.equal((await make()).status, 502)
  setOutput({ title: '<script>alert(1)</script>', lines: STEPS.lines })
  assert.match((await make()).body.error, /字符/)
  setOutput({ title: '额外围栏', lines: ['第一步 | ```', '第二步 | 内容', '第三步 | 内容'] })
  assert.match((await make()).body.error, /围栏/)
  setOutput({ title: '格式错误', lines: ['没有分隔符'] })
  assert.match((await make()).body.error, /3–5 行/)
  setOutput({ title: '<script>', lines: STEPS.lines })
  assert.match((await make()).body.error, /字符/)
})

test('svg-cards/draft：柱状图只接受目标段落已有数值', async () => {
  const { store, article, request, setOutput } = await setup()
  await store.update(() => { article.blocks[0].text = '初稿需要 40 分钟，现在只要 10 分钟。' })
  const make = () => request('svg-cards/draft', { id: article.id, blockId: article.blocks[0].id, kind: 'svg-bars' })
  setOutput({ title: '时间对比', lines: ['初稿 | 40 | 40 分钟', '现在 | 10 | 10 分钟'] })
  assert.equal((await make()).status, 200)
  setOutput({ title: '时间对比', lines: ['初稿 | 99 | 99 分钟'] })
  const invalid = await make()
  assert.equal(invalid.status, 502)
  assert.match(invalid.body.error, /已经出现/)
  setOutput({ title: '时间对比', lines: ['初稿 | -40 | 40 分钟'] })
  assert.equal((await make()).status, 502)
})

test('svg-cards/draft：完整数值、千分位、百分比和显示文案一致性', async () => {
  const { store, article, request, setOutput } = await setup()
  const make = () => request('svg-cards/draft', { id: article.id, blockId: article.blocks[0].id, kind: 'svg-bars' })
  await store.update(() => { article.blocks[0].text = '原文只有 120，没有其他数字。' })
  setOutput({ title: '错误截断', lines: ['样本 | 20 | 20'] })
  assert.equal((await make()).status, 502)
  await store.update(() => { article.blocks[0].text = '累计 1,200 次，转化率 20%，现在只要 10 分钟。' })
  setOutput({ title: '完整数值', lines: ['累计 | 1,200 | 1,200 次', '转化率 | 20% | 20%', '现在 | 10 | 明显更快'] })
  assert.equal((await make()).status, 200)
  setOutput({ title: '百分比语义', lines: ['转化率 | 20 | 20%'] })
  assert.equal((await make()).status, 502)
  setOutput({ title: '矛盾文案', lines: ['现在 | 10 | 40 分钟'] })
  assert.match((await make()).body.error, /一致/)
  setOutput({ title: '多个数值', lines: ['现在 | 10 | 从 40 到 10 分钟'] })
  assert.match((await make()).body.error, /一致/)
})

test('svg-cards/draft：条目必须是字符串，概念卡允许重点行和金句', async () => {
  const { article, request, setOutput } = await setup()
  setOutput({ title: '对象条目', lines: [{ text: '第一步 | 内容' }] })
  const invalid = await request('svg-cards/draft', { id: article.id, blockId: article.blocks[0].id, kind: 'svg-steps' })
  assert.equal(invalid.status, 502)
  assert.match(invalid.body.error, /字符串/)
  setOutput({
    title: '什么是 Personal Agent',
    lines: ['一个记得你、会主动找你的 AI', '以前的 AI | 你问一句 | 它答一句', 'Personal Agent | 记住你的习惯 | 主动找你', '! 关键差别：不用重新交代', '> 交代一次，它一直记着'],
  })
  const concept = await request('svg-cards/draft', { id: article.id, blockId: article.blocks[0].id, kind: 'svg-concept' })
  assert.equal(concept.status, 200, concept.body.error)
  assert.equal(concept.body.card.lines.length, 5)
})

test('svg-cards/preview：结构化候选与已保存块共用同一渲染器，且不写正文', async () => {
  const { article, request, candidate } = await setup()
  const draft = await candidate()
  const before = toMarkdown(article)
  const preview = await request('svg-cards/preview', { ...draft, card: draft.card })
  assert.equal(preview.status, 200, preview.body.error)
  assert.match(preview.body.html, /<svg/)
  assert.match(preview.body.html, /<animate/)
  assert.match(preview.body.html, /#2952B6/)
  assert.doesNotMatch(preview.body.html, /\s(?:id|class)="|<script|href=/)
  assert.equal(toMarkdown(article), before)
  const inserted = await request('svg-cards/insert', { ...draft, card: draft.card, operationId: 'preview-saved-card' })
  assert.equal(inserted.status, 200)
  const saved = inserted.body.current.blocks.find(block => block.text.startsWith('```svg-steps'))
  const savedPreview = await request('svg-cards/preview', { id: article.id, cardBlockId: saved.id })
  assert.equal(savedPreview.status, 200, savedPreview.body.error)
  assert.equal(savedPreview.body.card.title, draft.card.title)
  assert.match(savedPreview.body.html, /#2952B6/)
})

test('svg-cards/insert：按段落 ID 插入、撤销、重复提交幂等', async () => {
  const { store, article, request, candidate } = await setup()
  const draft = await candidate()
  await store.update(() => { article.blocks.unshift({ id: 'new-opening', text: '新增开头', check: null }) })
  const targetIndex = article.blocks.findIndex(block => block.id === draft.blockId)
  const inserted = await request('svg-cards/insert', { ...draft, card: draft.card, operationId: 'insert-operation-1' })
  assert.equal(inserted.status, 200, inserted.body.error)
  assert.equal(article.blocks[targetIndex + 1].text, draft.markdown)
  const count = article.blocks.length
  const history = article.history.length
  const duplicate = await request('svg-cards/insert', { ...draft, card: draft.card, operationId: 'insert-operation-1' })
  assert.equal(duplicate.status, 200)
  assert.equal(article.blocks.length, count)
  assert.equal(article.history.length, history)
  assert.equal((await request('undo', { id: article.id })).status, 200)
  assert.equal(article.blocks.length, count - 1)
  const reinserted = await request('svg-cards/insert', { ...draft, card: draft.card, operationId: 'insert-operation-1' })
  assert.equal(reinserted.status, 200)
  assert.equal(article.blocks.length, count)
})

test('svg-cards/insert：目标变更、跨稿、归档和恶意文本都拒绝写入', async () => {
  const { store, article, other, request, candidate } = await setup()
  const draft = await candidate()
  const make = (overrides = {}) => request('svg-cards/insert', { ...draft, card: draft.card, operationId: 'insert-operation-2', ...overrides })
  const cross = await make({ id: other.id })
  assert.equal(cross.status, 409)
  await store.update(() => { article.blocks.find(block => block.id === draft.blockId).text = '目标已经改写。' })
  const stale = await make()
  assert.equal(stale.status, 409)
  assert.match(stale.body.error, /发生变化/)
  const malicious = await make({ sourceHash: svgCardSourceHash('目标已经改写。'), card: { kind: 'svg-steps', title: '恶意', lines: ['第一步 | <svg onload=alert(1)>', '第二步 | 内容', '第三步 | 内容'] } })
  assert.equal(malicious.status, 400)
  assert.equal((await make({ operationId: 'x' })).status, 400)
  await store.update(() => { article.archivedAt = new Date().toISOString() })
  assert.equal((await make()).status, 409)
  assert.equal(other.blocks.length, 1)
})

function fullSvg(page, style, theme) {
  const data = JSON.parse(page.match(/const D=(.*);\nconst G=/s)[1])
  let body = data.styles[style]
  for (const [key, token] of Object.entries(data.tokens)) body = body.split(token).join(data.palette[theme][key])
  return body.match(/<svg[\s\S]*?<\/svg>/)?.[0]
}

for (const [name, settings, preferences, expected] of [
  ['全局风格生效', { style: 'mag', theme: 'violet' }, null, { style: 'mag', theme: 'violet' }],
  ['稿件偏好覆盖全局', { style: 'mag', theme: 'violet' }, { style: 'neo', theme: 'blue' }, { style: 'neo', theme: 'blue' }],
  ['无偏好使用引擎默认', {}, null, { style: 'std', theme: 'orange' }],
]) {
  test(`单卡与全文配色一致：${name}`, async () => {
    const { store, article, request, candidate } = await setup()
    await updateSettings(store.root, settings)
    await store.update(() => {
      if (preferences) article.layoutPreferences = preferences
      else delete article.layoutPreferences
    })
    const draft = await candidate()
    const preview = await request('svg-cards/preview', { ...draft, card: draft.card })
    assert.equal(preview.status, 200, preview.body.error)
    assert.deepEqual(preview.body.preferences, expected)
    await request('svg-cards/insert', { ...draft, card: draft.card, operationId: `layout-${expected.style}-${expected.theme}` })
    const layout = await request(`layout?id=${article.id}`)
    assert.equal(layout.status, 200)
    assert.equal(fullSvg(layout.body.html, expected.style, expected.theme), preview.body.html.match(/<svg[\s\S]*?<\/svg>/)?.[0])
  })
}

test('svg-cards/draft：等待模型时目标被改写则拒绝过期候选', async () => {
  const { store, article, request, calls, setBeforeStream } = await setup()
  let release
  setBeforeStream(() => new Promise(resolve => { release = resolve }))
  const pending = request('svg-cards/draft', { id: article.id, blockId: article.blocks[0].id, kind: 'svg-steps' })
  for (let attempt = 0; attempt < 100 && !calls.length; attempt++) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(calls.length, 1)
  const prompt = JSON.parse(calls[0].messages[0].content[0].text)
  assert.equal(prompt.target, '第一段介绍具体步骤。')
  await store.update(() => { article.blocks[0].text = '等待期间改成了新内容。' })
  release()
  const result = await pending
  assert.equal(result.status, 409)
  assert.match(result.body.error, /发生变化/)
  assert.equal(article.blocks.length, 2)
})
