# 稿件存储分片 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把单个 `state.json` 拆成「索引 + 每篇稿件一个目录」，每次保存只写被改动的稿件；写入带 fsync 和上一版备份，文件损坏时隔离保留，不再悄悄变成空状态。

**Architecture:** `Store` 的对外接口（`read()` 返回带 `articles` 数组的状态对象，`update(fn)` 串行修改并落盘）保持不变，约 80 处调用点不动。内部改为：内存里仍持有完整状态；落盘时按文章逐篇序列化，用哈希判断哪篇变了，只重写变了的 `articles/<id>/article.json` / `history.json`，最后写 `index.json`。首次启动把旧 `state.json` 迁移成分片，并留 `state.json.v1.bak`。`insights.json` 改用抽出来的单文件 `JsonStore`，同样获得 fsync 和备份。

**Tech Stack:** Node.js ESM（engines `>=20`）、`node:fs/promises`、`node:crypto`、`node:test`。不引入任何依赖，不用 `node:sqlite`（20/22 上仍是实验特性）。

---

关联代码：`src/store.js`（现状 52 行）、`src/host.js:1115-1128`（启动时的插图清理）、`src/article.js:13,119-125`（`HISTORY_MAX = 20`，每条历史是完整快照）。

### 现状与取舍

- 本机真实数据：`state.json` 5.0 MB、21 篇；其中 `history` 占 2.1 MB，`blocks` 278 KB，`coverRuns` 186 KB。整份 parse 21 ms、stringify 8 ms。单篇最大 529 KB，中位数 45 KB。
- 现在每次 `update` 都把 5 MB 整个重写；写入是 tmp + rename，但没有 fsync、没有备份；读到坏 JSON 时 `read()` 返回空状态，下一次 `update` 会把空状态写回去，**相当于一次误操作就清空全部稿件**。这是比「慢」更要紧的问题。
- 按 ID 分目录的方向是对的，同时做三件事：
  1. 历史单独成文件（`history.json`），编辑正文和改历史互不牵连，后续想懒加载历史也有落脚点。
  2. 写入可靠性：fsync、`.bak` 上一版、损坏隔离（`.corrupt-<时间>`）且不覆盖。
  3. 接口不变：调用方继续拿到同一个状态对象，避免 80 处改造带来的回归。
- 不选的方案：SQLite（`node:sqlite` 实验特性，`better-sqlite3` 是原生依赖，桌面插件分发麻烦）；追加日志（需要压缩和回放，复杂度高）；只削减历史（能缓解体积，解决不了全量重写和损坏清空）。
- 不支持降级：迁移后旧版本读不到数据，只在 README 和发布说明里写清楚，不做兼容或检测（见 Task 7）。
- 首版不做：历史懒加载、按字节上限裁剪历史、跨进程文件锁（桌面版和网页版共用同一个宿主进程，现状也没有锁）。Task 6 的压测若显示数百篇时内存或启动时间不可接受，再单独立项。

### 目录布局

```
<DSH_HOME>/wechat-studio/
  index.json                 { format: 2, order: [id...], v, currentId, lastLayoutPreferences, ...其余顶层字段 }
  articles/<id>/article.json 稿件本体（不含 history）
  articles/<id>/history.json 改稿历史数组
  articles/<id>/*.bak        上一版
  state.json.v1.bak          迁移前的原文件，迁移后不再读写
  insights.json(.bak)        复盘数据，单文件 JsonStore
```

规则：

- **目录是稿件的事实来源**，`index.json` 只记顺序和顶层字段。新建稿件时先写分片再写索引；若中途崩溃，下次启动扫描目录仍能找回这篇，排在已知顺序之后（按 `createdAt`）。
- 删除稿件：先写索引，再 `rm` 目录。只删除「本进程加载过、现在从 `state.articles` 消失」的 ID，加载失败被隔离的稿件永远不会被删。
- 文章 ID 必须匹配 `/^[A-Za-z0-9_-]{1,64}$/`（现有 `newId` 产出 `x_<base36>`），否则 `update` 拒绝写入，防止目录穿越。
- 单个文件读取顺序：主文件 → `.bak`。两者都坏时，把主文件改名为 `<名字>.corrupt-<ISO 时间>`，记入 `store.problems`，跳过这篇（或这份历史置空），不写回。

### Task 1: 抽出可靠的原子写和容错读

**Files:**
- Create: `src/fs-json.js`
- Create: `test/fs-json.test.js`

**Step 1: 写失败测试**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readJsonSafe, writeJsonAtomic } from '../src/fs-json.js'

const dir = () => mkdtempSync(join(tmpdir(), 'ws-fsjson-'))

test('写入后可读回，并保留上一版为 .bak', async () => {
  const file = join(dir(), 'a.json')
  await writeJsonAtomic(file, { n: 1 })
  await writeJsonAtomic(file, { n: 2 })
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { n: 2 })
  assert.deepEqual(JSON.parse(readFileSync(`${file}.bak`, 'utf8')), { n: 1 })
  assert.equal(readdirSync(join(file, '..')).some(name => name.endsWith('.tmp')), false)
})

test('主文件缺失时返回 missing', async () => {
  assert.deepEqual(await readJsonSafe(join(dir(), 'none.json')), { status: 'missing', value: undefined })
})

test('主文件损坏时回退到 .bak', async () => {
  const file = join(dir(), 'a.json')
  writeFileSync(file, '{broken')
  writeFileSync(`${file}.bak`, '{"n":1}')
  assert.deepEqual(await readJsonSafe(file), { status: 'backup', value: { n: 1 } })
})

test('主文件和备份都坏时隔离主文件，不删除', async () => {
  const root = dir()
  const file = join(root, 'a.json')
  writeFileSync(file, '{broken')
  const result = await readJsonSafe(file)
  assert.equal(result.status, 'corrupt')
  assert.equal(existsSync(file), false)
  const quarantined = readdirSync(root).find(name => name.startsWith('a.json.corrupt-'))
  assert.equal(readFileSync(join(root, quarantined), 'utf8'), '{broken')
})
```

**Step 2: 运行确认失败**

Run: `node --test test/fs-json.test.js`
Expected: FAIL，`Cannot find module '../src/fs-json.js'`

**Step 3: 实现**

```js
// JSON 文件的可靠读写：先 fsync 临时文件再替换，并保留上一版；读坏文件时回退备份或隔离，绝不当成空文件。
import { open, readFile, rename } from 'node:fs/promises'

export async function writeJsonAtomic(file, value, { indent = 1 } = {}) {
  const tmp = `${file}.${process.pid}.tmp`
  const handle = await open(tmp, 'w', 0o600)
  try {
    await handle.writeFile(JSON.stringify(value, null, indent))
    await handle.sync()
  } finally {
    await handle.close()
  }
  // 两次 rename 之间主文件短暂不存在，读取方会落到 .bak，因此任何时刻至少有一份完整数据。
  await rename(file, `${file}.bak`).catch(err => { if (err.code !== 'ENOENT') throw err })
  await rename(tmp, file)
}

async function parseFile(file) {
  try {
    return { ok: true, value: JSON.parse(await readFile(file, 'utf8')) }
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: false, missing: true }
    if (err instanceof SyntaxError) return { ok: false, missing: false }
    throw err
  }
}

/** @returns {Promise<{status: 'ok'|'backup'|'missing'|'corrupt', value: any}>} */
export async function readJsonSafe(file) {
  const main = await parseFile(file)
  if (main.ok) return { status: 'ok', value: main.value }
  const backup = await parseFile(`${file}.bak`)
  if (backup.ok) return { status: 'backup', value: backup.value }
  if (main.missing) return { status: backup.missing ? 'missing' : 'corrupt', value: undefined }
  await rename(file, `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  return { status: 'corrupt', value: undefined }
}
```

**Step 4: 运行确认通过**

Run: `node --test test/fs-json.test.js`
Expected: PASS（4 个用例）

**Step 5: 提交**（本仓库当前约定：先征得用户同意再提交）

```bash
git add src/fs-json.js test/fs-json.test.js
git commit -m "feat: add durable json read and write helpers"
```

### Task 2: 单文件 JsonStore，接管 insights.json

**Files:**
- Modify: `src/store.js`（把现有 `Store` 类改名为 `JsonStore`，换用 Task 1 的工具）
- Modify: `src/host.js:1117`
- Modify: `test/insights.test.js:313`
- Create: `test/store.test.js`

**Step 1: 写失败测试**（`test/store.test.js`）

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JsonStore } from '../src/store.js'

const tmp = prefix => mkdtempSync(join(tmpdir(), prefix))

test('JsonStore 坏文件不会被空状态覆盖', async () => {
  const root = tmp('ws-jsonstore-')
  writeFileSync(join(root, 'insights.json'), '{broken')
  const store = new JsonStore(root, { file: 'insights.json', empty: { v: 1, rows: [] } })
  await store.update(state => { state.rows.push(1) })
  assert.equal(store.problems.length, 1)
  assert.ok(readdirSync(root).some(name => name.startsWith('insights.json.corrupt-')))
})
```

**Step 2:** Run `node --test test/store.test.js`，Expected: FAIL（`JsonStore` 未导出）。

**Step 3: 实现**

```js
export class JsonStore {
  constructor(root, { file, empty }) {
    this.root = root
    this.file = join(root, file)
    this.empty = empty
    this.queue = Promise.resolve()
    this.cache = null
    this.loading = null
    this.problems = []
  }

  read() {
    if (this.cache) return Promise.resolve(this.cache)
    this.loading ??= this.load().finally(() => { this.loading = null })
    return this.loading
  }

  async load() {
    const { status, value } = await readJsonSafe(this.file)
    if (status === 'corrupt') this.problems.push({ file: this.file, message: `${this.file} 已损坏，已改名保留` })
    this.cache = { ...structuredClone(this.empty), ...(value ?? {}) }
    return this.cache
  }

  update(fn) {
    const run = async () => {
      const state = await this.read()
      const result = await fn(state)
      await mkdir(this.root, { recursive: true })
      await writeJsonAtomic(this.file, state)
      return result
    }
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => {})
    return next
  }
}
```

把 `host.js:1117` 和 `test/insights.test.js:313` 的 `new Store(store.root, { file: 'insights.json', empty: INSIGHTS_EMPTY })` 改成 `new JsonStore(...)`，同时调整 import。`read()` 改为共享同一个加载 Promise，修复现有实现里两个并发 `read()` 各自 parse、后者覆盖缓存的隐患。

**Step 4:** Run `node --test test/store.test.js test/insights.test.js`，Expected: PASS。

**Step 5: 提交**：`git add src/store.js src/host.js test/store.test.js test/insights.test.js && git commit -m "refactor: move insights to durable JsonStore"`

### Task 3: 分片 Store 的读写

**Files:**
- Modify: `src/store.js`（新 `Store` 类）
- Modify: `test/store.test.js`

**Step 1: 写失败测试**（追加到 `test/store.test.js`）

```js
import { statSync, existsSync, readFileSync } from 'node:fs'
import { Store } from '../src/store.js'

const article = (id, extra = {}) => ({ id, title: id, createdAt: '2026-11-19T00:00:00Z', blocks: [], history: [], ...extra })

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
```

**Step 2:** Run `node --test test/store.test.js`，Expected: 新用例 FAIL（仍是旧单文件实现）。

**Step 3: 实现**（替换 `src/store.js` 里的 `Store`，文件头注释同步改为分片说明）

```js
const EMPTY = { v: 1, currentId: null, articles: [] }
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const digest = text => createHash('sha1').update(text).digest('base64')

export class Store {
  constructor(root = join(dshHome(), 'wechat-studio'), { empty = EMPTY } = {}) {
    this.root = root
    this.dir = join(root, 'articles')
    this.indexFile = join(root, 'index.json')
    this.legacyFile = join(root, 'state.json')
    this.empty = empty
    this.queue = Promise.resolve()
    this.cache = null
    this.loading = null
    this.problems = []
    this.written = new Map() // id -> { articleHash, historyHash }
    this.writtenIndex = null
  }

  read() {
    if (this.cache) return Promise.resolve(this.cache)
    this.loading ??= this.load().finally(() => { this.loading = null })
    return this.loading
  }

  async load() {
    await this.migrateLegacy() // Task 4 实现；本任务先写成空函数
    const index = await readJsonSafe(this.indexFile)
    if (index.status === 'corrupt') this.problems.push({ file: this.indexFile, message: '稿件索引已损坏，已按目录重建顺序' })
    const { format, order = [], ...top } = index.value ?? {}
    const ids = await readdir(this.dir).catch(err => { if (err.code === 'ENOENT') return []; throw err })
    const articles = []
    for (const id of ids.filter(name => ID_PATTERN.test(name))) {
      const base = join(this.dir, id)
      const body = await readJsonSafe(join(base, 'article.json'))
      if (body.status === 'missing') continue
      if (body.status === 'corrupt') {
        this.problems.push({ id, message: `稿件 ${id} 已损坏，已改名保留，未加载` })
        continue
      }
      const history = await readJsonSafe(join(base, 'history.json'))
      if (history.status === 'corrupt') this.problems.push({ id, message: `稿件 ${id} 的改稿历史已损坏，已改名保留` })
      const article = { ...body.value, history: Array.isArray(history.value) ? history.value : [] }
      articles.push(article)
      const { articleHash, historyHash } = this.hashes(article)
      this.written.set(id, { articleHash, historyHash })
    }
    const rank = new Map(order.map((id, i) => [id, i]))
    articles.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity)
      || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')))
    this.cache = { ...structuredClone(this.empty), ...top, articles }
    this.writtenIndex = digest(JSON.stringify(this.indexOf(this.cache)))
    return this.cache
  }

  hashes(article) {
    const { history = [], ...body } = article
    return { articleHash: digest(JSON.stringify(body)), historyHash: digest(JSON.stringify(history)), body, history }
  }

  indexOf(state) {
    const { articles, ...top } = state
    return { format: 2, order: articles.map(a => a.id), ...top }
  }

  async persist(state) {
    for (const article of state.articles) {
      if (!ID_PATTERN.test(article?.id ?? '')) throw new Error(`非法稿件 ID：${article?.id}`)
    }
    await mkdir(this.dir, { recursive: true })
    const alive = new Set()
    for (const article of state.articles) {
      alive.add(article.id)
      const next = this.hashes(article)
      const prev = this.written.get(article.id)
      if (prev?.articleHash === next.articleHash && prev?.historyHash === next.historyHash) continue
      const base = join(this.dir, article.id)
      await mkdir(base, { recursive: true })
      if (prev?.articleHash !== next.articleHash) await writeJsonAtomic(join(base, 'article.json'), next.body)
      if (prev?.historyHash !== next.historyHash) await writeJsonAtomic(join(base, 'history.json'), next.history)
      this.written.set(article.id, { articleHash: next.articleHash, historyHash: next.historyHash })
    }
    const index = this.indexOf(state)
    const indexHash = digest(JSON.stringify(index))
    if (indexHash !== this.writtenIndex) {
      await writeJsonAtomic(this.indexFile, index)
      this.writtenIndex = indexHash
    }
    // 只删本进程加载或写过、现在已不在列表里的稿件；被隔离的坏稿件从未进入 written，不会被删。
    for (const id of [...this.written.keys()]) {
      if (alive.has(id)) continue
      await rm(join(this.dir, id), { recursive: true, force: true })
      this.written.delete(id)
    }
  }

  update(fn) {
    const run = async () => {
      const state = await this.read()
      const result = await fn(state)
      await this.persist(state)
      return result
    }
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => {})
    return next
  }
}
```

注意：`hashes()` 返回的 `body`/`history` 仅供写入使用，`written` 里只存哈希，避免常驻第二份 5 MB 字符串。非法 ID 在任何写入前统一校验，失败时 `update` 抛错且不落盘（缓存里已被 fn 改过，这与现有「fn 抛错后缓存已脏」的行为一致，不在本任务处理）。

**Step 4:** Run `node --test test/store.test.js`，Expected: PASS。

**Step 5: 提交**：`git add src/store.js test/store.test.js && git commit -m "feat: shard article storage by id"`

### Task 4: 从 state.json 一次性迁移

**Files:**
- Modify: `src/store.js`（`migrateLegacy`）
- Modify: `test/store.test.js`

**Step 1: 写失败测试**

```js
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
```

**Step 2:** Run `node --test test/store.test.js`，Expected: 三个迁移用例 FAIL。

**Step 3: 实现**

```js
  // 顺序固定：先写分片，再写索引，最后改名旧文件。任一步崩溃，下次启动都会因索引缺失而整段重跑。
  async migrateLegacy({ stopBeforeIndex = false } = {}) {
    if (await exists(this.indexFile)) return
    const legacy = await readJsonSafe(this.legacyFile)
    if (legacy.status === 'missing') return
    if (legacy.status === 'corrupt') {
      this.problems.push({ file: this.legacyFile, message: 'state.json 已损坏，已改名保留，未迁移' })
      return
    }
    const state = { ...structuredClone(this.empty), ...legacy.value }
    state.articles = Array.isArray(legacy.value.articles) ? legacy.value.articles : []
    await mkdir(this.dir, { recursive: true })
    for (const article of state.articles) {
      const { history = [], ...body } = article
      const base = join(this.dir, article.id)
      await mkdir(base, { recursive: true })
      await writeJsonAtomic(join(base, 'article.json'), body)
      await writeJsonAtomic(join(base, 'history.json'), history)
    }
    if (stopBeforeIndex) return
    await writeJsonAtomic(this.indexFile, this.indexOf(state))
    await rename(this.legacyFile, `${this.legacyFile}.v1.bak`)
  }
```

`exists` 用 `access` 包一层；ID 校验复用 `ID_PATTERN`，旧数据若有非法 ID 则记 problem、跳过该篇并保留 `state.json` 不改名（防止丢数据）。`stopBeforeIndex` 仅为测试崩溃点存在，在 JSDoc 里注明。

**Step 4:** Run `node --test test/store.test.js`，Expected: PASS。

**Step 5: 提交**：`git add src/store.js test/store.test.js && git commit -m "feat: migrate legacy state.json into shards"`

### Task 5: 宿主启动检查与损坏提示

**Files:**
- Modify: `src/host.js:1120-1128`（启动清理）、`src/host.js:389` 附近 `snapshotState`（返回 `storageProblems`）
- Modify: `test/inline-diagram-routes.test.js:406-416`
- Modify: `test/host.test.js`（新增一个用例）

**Step 1: 写失败测试**

- 把 `inline-diagram-routes.test.js:409` 的 `await writeFile(store.file, '{broken json')` 改为 `await writeFile(join(store.root, 'state.json'), '{broken json')`（旧文件损坏场景），再复制一份用例：先 `store.update` 建一篇稿件，然后把 `articles/<id>/article.json` 和 `.bak` 都写坏、用 `new Store(store.root)` 重开，断言插图资产仍在。
- `host.test.js` 新增：稿件分片损坏时，`GET /wechat-studio/state` 的响应包含 `storageProblems: ['稿件 a_x 已损坏，已改名保留，未加载']`。

**Step 2:** Run `node --test test/inline-diagram-routes.test.js test/host.test.js`，Expected: 新用例 FAIL（`store.file` 已不存在、没有 `storageProblems`）。

**Step 3: 实现**

```js
  const inlineCleanup = (async () => {
    const state = await store.read()
    // 有稿件没加载出来时，无法判断哪些插图是孤儿，宁可不清。
    if (store.problems.length) return
    await removeOrphanInlineImages(store.root, state.articles)
  })().catch(() => {})
```

`snapshotState` 返回值加 `storageProblems: store.problems.map(p => p.message)`（为空时也返回空数组，客户端暂不展示；展示入口另立小任务）。同时在 `createHandler` 里对每条 problem 调一次 `ctx.get('logger')?.warn?.(...)`，若宿主没有 logger 则用 `console.warn`。执行前先 `rg -n "logger" src/host.js` 看现有写法并照抄。

**Step 4:** Run `npm test`，Expected: 全部通过（当前基线 194 个 + 本计划新增）。

**Step 5: 提交**：`git add src/host.js test/inline-diagram-routes.test.js test/host.test.js && git commit -m "fix: skip orphan cleanup when storage has problems"`

### Task 6: 真实数据迁移演练与压测

**Files:** 只用临时脚本，放 `/tmp`，不入库。

1. 复制真实数据到临时目录：`cp -R ~/.dsh/wechat-studio /tmp/ws-migrate-drill`（约 5 MB；磁盘紧张，演练后删除）。
2. 用 `DSH_HOME` 指向演练目录的父级，执行 `node -e` 打开新 `Store`，断言 `read()` 结果与原 `state.json` 的 `JSON.parse` 结果 `deepStrictEqual`，并打印迁移耗时。
3. 生成合成数据：按真实中位数 45 KB、最大 529 KB 的分布造 300 篇，测三项并记录：冷启动 `read()` 耗时、改一篇标题的 `update` 耗时与写入字节数（对比旧实现整文件重写）、常驻内存（`process.memoryUsage().heapUsed`）。
4. 判定：单次 `update` 只写一篇的分片 + 索引；若 300 篇时 `update` 的哈希开销（每次仍对全部稿件 stringify）超过 50 ms，记录数字并单独提「`update(fn, { ids })` 只比对指定稿件」的后续计划，不在本计划内硬塞。
5. 清理：`rm -rf /tmp/ws-migrate-drill /tmp/ws-bench-*`。

### Task 7: 文档与发布说明

**Files:** Modify `README.md:244` 附近的数据目录表格。仓库里没有 CHANGELOG，发布说明写在发版时的 GitHub Release 正文里。

1. 把 README 的 `state.json` 一行换成 `index.json`、`articles/<id>/article.json`、`articles/<id>/history.json`、`state.json.v1.bak`（迁移备份，可在确认无误后手动删除）、`*.bak` / `*.corrupt-*` 的说明，并写一句恢复方法：「某篇稿件打不开时，把同目录下的 `.corrupt-*` 或 `.bak` 改回 `article.json` 即可」。
2. 在同一表格下方加一段「升级与降级」：

   > 从旧版本升级时，首次启动会自动把 `state.json` 迁移到 `articles/` 目录，原文件改名为 `state.json.v1.bak`，无需手动操作。迁移后**不支持降级**：装回旧版本会看到空的稿件列表，旧版本里新写的内容也不会被新版本读取。如果必须回到旧版本，先退出插件，把 `state.json.v1.bak` 改名回 `state.json`；迁移后在新版本里做的修改不会带回去。

3. 发版时把下面这段放进 Release 正文（版本号按实际填写）：

   > **存储格式升级（不可降级）**：稿件改为按篇存放在 `articles/<id>/`，每次保存只写改动的稿件，写入带备份，文件损坏时会保留原文件并提示，不再清空数据。首次启动自动迁移，旧数据备份为 `state.json.v1.bak`。升级后请勿装回旧版本；如需回退，见 README「升级与降级」。

Run: `npm test && npm run build`，Expected: 全部通过、构建成功。

提交：`git add README.md && git commit -m "docs: describe sharded storage layout and no-downgrade policy"`
### 验收清单

- [ ] 旧用户首次启动自动迁移，数据与原 `state.json` 完全一致，留有 `state.json.v1.bak`。
- [ ] 编辑一篇稿件只重写这一篇的文件和 `index.json`。
- [ ] 任意一个分片损坏：其他稿件正常，坏文件被改名保留，不会被覆盖或删除，插图清理跳过，接口返回 `storageProblems`。
- [ ] 80 处 `store.read()` / `store.update()` 调用点未改动，`npm test` 全部通过。
- [ ] README 有「升级与降级」说明，发布说明写明不可降级及回退方法。
- [ ] Task 6 的压测数字写进 PR 描述。
