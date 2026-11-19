import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readdirSync, statSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JsonStore, Store } from '../src/store.js'

const tmp = prefix => mkdtempSync(join(tmpdir(), prefix))
const article = (id, extra = {}) => ({ id, title: id, createdAt: '2026-11-19T00:00:00Z', blocks: [], history: [], ...extra })

test('JsonStore 坏文件不会被空状态覆盖', async () => {
  const root = tmp('ws-jsonstore-')
  writeFileSync(join(root, 'insights.json'), '{broken')
  const store = new JsonStore(root, { file: 'insights.json', empty: { v: 1, rows: [] } })
  await store.update(state => { state.rows.push(1) })
  assert.equal(store.problems.length, 1)
  assert.ok(readdirSync(root).some(name => name.startsWith('insights.json.corrupt-')))
})

test('分片写入：每篇一个目录，历史单独存，不再生成 state.json', async () => {
  const store = new Store(tmp('ws-shard-'))
  await store.update(state => {
    state.articles.push(article('a_1', { history: [{ label: '初稿' }] }))
    state.currentId = 'a_1'
  })
  const dir = join(store.root, 'articles', 'a_1')
  assert.equal(JSON.parse(readFileSync(join(dir, 'article.json'), 'utf8')).history, undefined)
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'history.json'), 'utf8')), [{ label: '初稿' }])
  const index = JSON.parse(readFileSync(join(store.root, 'index.json'), 'utf8'))
  assert.deepEqual([index.format, index.order, index.currentId], [2, ['a_1'], 'a_1'])
  assert.equal(existsSync(join(store.root, 'state.json')), false)
})

test('只重写被改动的稿件', async () => {
  const store = new Store(tmp('ws-shard-dirty-'))
  await store.update(state => { state.articles.push(article('a_1'), article('a_2')) })
  const ino = id => statSync(join(store.root, 'articles', id, 'article.json')).ino
  const [before1, before2] = [ino('a_1'), ino('a_2')]
  await store.update(state => { state.articles[1].title = '改了' })
  assert.equal(ino('a_1'), before1)
  assert.notEqual(ino('a_2'), before2)
})

test('重新打开得到相同状态和顺序', async () => {
  const store = new Store(tmp('ws-shard-reopen-'))
  await store.update(state => {
    state.articles.push(article('a_2'), article('a_1', { history: [{ label: 'x' }] }))
    state.lastLayoutPreferences = { theme: 'warm' }
  })
  const reopened = await new Store(store.root).read()
  assert.deepEqual(reopened, await store.read())
})

test('删除稿件会移除目录', async () => {
  const store = new Store(tmp('ws-shard-del-'))
  await store.update(state => { state.articles.push(article('a_1'), article('a_2')) })
  await store.update(state => { state.articles = state.articles.filter(a => a.id !== 'a_1') })
  assert.equal(existsSync(join(store.root, 'articles', 'a_1')), false)
  assert.deepEqual((await new Store(store.root).read()).articles.map(a => a.id), ['a_2'])
})

test('非法 ID 拒绝写入', async () => {
  const store = new Store(tmp('ws-shard-badid-'))
  await assert.rejects(store.update(state => { state.articles.push(article('../x')) }), /非法稿件 ID/)
  assert.equal(existsSync(join(store.root, 'index.json')), false)
})

test('索引落后于目录时仍能找回稿件', async () => {
  const store = new Store(tmp('ws-shard-orphan-'))
  await store.update(state => { state.articles.push(article('a_1')) })
  const late = new Store(store.root)
  await late.update(state => { state.articles.push(article('a_2', { createdAt: '2026-11-20T00:00:00Z' })) })
  writeFileSync(join(store.root, 'index.json'), JSON.stringify({ format: 2, order: ['a_1'], v: 1, currentId: null }))
  assert.deepEqual((await new Store(store.root).read()).articles.map(a => a.id), ['a_1', 'a_2'])
})

test('稿件文件和备份都坏时隔离并跳过，后续写入不删除它', async () => {
  const store = new Store(tmp('ws-shard-corrupt-'))
  await store.update(state => { state.articles.push(article('a_1'), article('a_2')) })
  const dir = join(store.root, 'articles', 'a_1')
  writeFileSync(join(dir, 'article.json'), '{broken')
  writeFileSync(join(dir, 'article.json.bak'), '{broken')
  const reopened = new Store(store.root)
  assert.deepEqual((await reopened.read()).articles.map(a => a.id), ['a_2'])
  assert.equal(reopened.problems.length, 1)
  await reopened.update(state => { state.articles[0].title = 'x' })
  assert.ok(readdirSync(dir).some(name => name.startsWith('article.json.corrupt-')))
})

test('并发 read 返回同一个对象', async () => {
  const store = new Store(tmp('ws-shard-race-'))
  const [a, b] = await Promise.all([store.read(), store.read()])
  assert.equal(a, b)
})

test('旧 state.json 迁移成分片，并保留备份', async () => {
  const root = tmp('ws-migrate-')
  const legacy = { v: 1, currentId: 'a_2', lastLayoutPreferences: { theme: 'x' },
    articles: [article('a_2', { history: [{ label: 'h' }] }), article('a_1')] }
  writeFileSync(join(root, 'state.json'), JSON.stringify(legacy))
  const state = await new Store(root).read()
  assert.deepEqual(state, legacy)
  assert.equal(existsSync(join(root, 'state.json')), false)
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'state.json.v1.bak'), 'utf8')), legacy)
  assert.deepEqual(await new Store(root).read(), legacy)
})

test('迁移中途崩溃（已有分片、无索引）重跑结果一致', async () => {
  const root = tmp('ws-migrate-retry-')
  const legacy = { v: 1, currentId: null, articles: [article('a_1')] }
  writeFileSync(join(root, 'state.json'), JSON.stringify(legacy))
  const first = new Store(root)
  await first.migrateLegacy({ stopBeforeIndex: true })
  assert.deepEqual(await new Store(root).read(), legacy)
})

test('旧 state.json 损坏时不迁移、不清空，改名保留', async () => {
  const root = tmp('ws-migrate-bad-')
  writeFileSync(join(root, 'state.json'), '{broken')
  const store = new Store(root)
  assert.deepEqual((await store.read()).articles, [])
  assert.equal(store.problems.length, 1)
  assert.ok(readdirSync(root).some(name => name.startsWith('state.json.corrupt-')))
})

test('旧 state.json 含非法 ID 时跳过该篇并保留原文件', async () => {
  const root = tmp('ws-migrate-badid-')
  const legacy = { v: 1, currentId: 'a_1', articles: [article('a_1'), article('../evil')] }
  writeFileSync(join(root, 'state.json'), JSON.stringify(legacy))
  const store = new Store(root)
  const state = await store.read()
  assert.deepEqual(state.articles.map(a => a.id), ['a_1'])
  assert.equal(store.problems.length, 1)
  assert.equal(existsSync(join(root, 'state.json')), true)
})

test('主文件损坏回退到 .bak 时记录 problem（正文、历史、索引、JsonStore）', async () => {
  const root = tmp('ws-backup-problem-')
  const seed = new Store(root)
  await seed.update(state => { state.articles.push(article('a_1', { title: 'v1', history: [{ label: 'h1' }] })) })
  await seed.update(state => {
    state.articles[0].title = 'v2'
    state.articles[0].history.push({ label: 'h2' })
    state.currentId = 'a_1'
  })
  const dir = join(root, 'articles', 'a_1')
  writeFileSync(join(root, 'index.json'), '{broken')
  writeFileSync(join(dir, 'article.json'), '{broken')
  writeFileSync(join(dir, 'history.json'), '{broken')

  const reopened = new Store(root)
  const state = await reopened.read()
  assert.equal(state.articles[0].title, 'v1')
  assert.deepEqual(state.articles[0].history, [{ label: 'h1' }])
  assert.equal(reopened.problems.length, 3)
  assert.ok(reopened.problems.some(p => p.message.includes('稿件索引主文件已损坏')))
  assert.ok(reopened.problems.some(p => p.message.includes('稿件 a_1 主文件已损坏')))
  assert.ok(reopened.problems.some(p => p.message.includes('稿件 a_1 的改稿历史主文件已损坏')))

  const jroot = tmp('ws-jsonstore-backup-')
  const jstore = new JsonStore(jroot, { file: 'insights.json', empty: { v: 1, rows: [] } })
  await jstore.update(s => { s.rows.push(1) })
  await jstore.update(s => { s.rows.push(2) })
  writeFileSync(join(jroot, 'insights.json'), '{broken')
  const jreopened = new JsonStore(jroot, { file: 'insights.json', empty: { v: 1, rows: [] } })
  assert.deepEqual((await jreopened.read()).rows, [1])
  assert.equal(jreopened.problems.length, 1)
  assert.match(jreopened.problems[0].message, /主文件已损坏/)
})

test('删除稿件中途崩溃（索引已写墓碑、目录未删），重启后不会复活且自动清理目录', async () => {
  const root = tmp('ws-del-crash-')
  const store = new Store(root)
  await store.update(state => { state.articles.push(article('a_1'), article('a_2')) })
  const state = await store.read()
  state.articles = state.articles.filter(a => a.id !== 'a_1')
  await store.persist(state, { stopBeforeRemove: true })

  assert.equal(existsSync(join(root, 'articles', 'a_1')), true)
  const pendingIndex = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'))
  assert.deepEqual(pendingIndex.deleting, ['a_1'])

  const reopened = new Store(root)
  const loaded = await reopened.read()
  assert.deepEqual(loaded.articles.map(a => a.id), ['a_2'])
  assert.equal(loaded.deleting, undefined)
  assert.equal(existsSync(join(root, 'articles', 'a_1')), false)
  const cleanedIndex = JSON.parse(readFileSync(join(root, 'index.json'), 'utf8'))
  assert.equal(cleanedIndex.deleting, undefined)
})
