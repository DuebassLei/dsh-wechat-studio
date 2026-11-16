# 排期板块 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把「排期」从占位页变成可用的发射台：待排坞拖拽上日历、五项就绪体检、下一篇倒计时与发布清单、标记已发闭环进复盘。

**Architecture:** 稿件上新增 `scheduledFor` / `publishedAt` 两个可选字段（旧稿读作 null，无迁移），纯函数放 `src/article.js`，Host 加四个 POST 路由并复用现有 JSON Store 与鉴权。客户端新建 `client/schedule.jsx` 周历板块，数据全部来自现有 `GET state` 的 `articles` 列表投影（`listMeta`），不新增请求通道；发布是手动标记，不做自动定时发布。

**Tech Stack:** React 18（宿主提供）、现有 Node.js Host 路由、Node test（`node --test`）、esbuild、`npm run dev` 本地假宿主预览。

---

## 0. 交接与范围

- 开发前运行 `git status --short`、`git log -5 --oneline`。当前分支 `main`，最近提交 `000b640 feat: make cover portrait reference configurable`。建议用 `using-git-worktrees` skill 开隔离工作树执行；若直接在 main 上做，每个 Task 结束必须提交，禁止积压未提交改动。
- 设计定稿（与用户对齐的第一期范围）：
  1. 左侧「待排坞」+ 右侧周历（周一开始），拖拽即排期，拖回待排坞即取消。
  2. 每张卡带五项「发车体检环」：正文 / 标题 / 质检 / 封面 / 横幅，全部来自现有真实数据。
  3. 顶部「下一篇」倒计时卡；到点当天翻转为发布清单（去排版复制 / 下载封面 / 标记已发）。
  4. 时间粒度 = 日期 + 时段（早 8 点 / 午 12 点 / 晚 8 点 / 自定义 HH:MM）。
  5. 标记已发写入 `publishedAt`，已发卡片进周历；复盘侧现有按标题 `autoMatch` 会自动认领，**本期不改 `src/insights.js`**。
- 明确不做（YAGNI）：月视图、小时轴、自动定时发布、一键列队、节奏参谋（依赖复盘数据积累，二期）、发布提醒通知。
- 关键既有事实（写代码前核对一次）：
  - `client/state.js` 的 `act(path, body)` 会自动注入 `id: snap.data?.current?.id`，但 `...body` 在后，**显式传 `{ id: draft.id }` 可覆盖**，排期操作非当前稿件必须显式传 id。
  - `listMeta`（`src/article.js:237`）是 `GET state` 里 `articles` 的唯一投影；`bannerView`（`src/host.js:56`）已算好横幅就绪。
  - `DEFAULT_BANNER = 'poster'` 在 `src/banner.js`；`src/article.js` 保持零依赖，横幅就绪由 Host 以参数传入，避免循环 import。
  - 各模块页自带局部 `Icon`（见 `client/insights.jsx` 开头），`schedule.jsx` 照做，**不要从 `app.jsx` import Icon**（会循环依赖）。
  - 样式全部走 `client/styles.css` 现有 DSH 语义 token（`--accent` / `--ok` / `--bad` / `--line` / `--card`…），琥珀警示色新增 `--sched-warn` 并给深色主题覆盖，参照 `--ok` / `--bad` 的先例。
  - `dist/client.js` 是提交进仓库的构建产物；UI 任务提交前先 `npm run build` 并把 `dist/client.js` 一起提交。
  - 测试路由的现成范式在 `test/inline-diagram-routes.test.js:19-61`（假 req/res + `route(deps, …)`），本计划照抄简化版。
- 提交信息用英文 conventional 短句（仓库既有风格）。

---

### Task 1: 就绪体检 readiness() 与 listMeta 透出

**Files:**
- Modify: `src/article.js`（`listMeta` 之前插入 `readiness`，并改 `listMeta`）
- Test: `test/schedule.test.js`（新建）

**Step 1: 写失败测试**

新建 `test/schedule.test.js`：

```js
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
```

**Step 2: 跑测试确认失败**

Run: `node --test test/schedule.test.js`
Expected: FAIL，`readiness is not a function` / `SyntaxError: ... does not provide an export named 'readiness'`。

**Step 3: 最小实现**

在 `src/article.js` 的 `export function listMeta` 之前插入：

```js
/** 发车体检：五项全过才算就绪。横幅是否就绪由 Host 传入，避免依赖 banner.js。 */
export function readiness(article, { bannerReady = false } = {}) {
  const pending = article.blocks.some(block => ['flag', 'fixed'].includes(block.check?.status))
  const items = [
    { id: 'body', label: '正文', done: article.blocks.length > 0 },
    { id: 'title', label: '标题', done: Boolean(article.title) },
    { id: 'quality', label: '质检', done: Boolean(article.zhuque?.round) && !pending },
    { id: 'cover', label: '封面', done: Boolean(article.cover?.id) },
    { id: 'banner', label: '横幅', done: bannerReady },
  ]
  return { items, done: items.filter(item => item.done).length, total: items.length }
}
```

把 `listMeta` 整体替换为：

```js
export function listMeta(article, { bannerReady = false } = {}) {
  const chars = article.blocks.reduce((sum, block) => sum + plainOf(block.text).length, 0)
  return {
    id: article.id, title: article.title || article.topic || '未命名文章', updatedAt: article.updatedAt, chars,
    hook: article.hook ?? null,
    lastView: article.lastView === 'layout' ? 'layout' : 'paper',
    archivedAt: article.archivedAt ?? null,
    coverId: article.cover?.id ?? null,
    review: article.blocks.reduce((count, block) => count + Number(['flag', 'fixed'].includes(block.check?.status)), 0),
    checked: Boolean(article.zhuque?.round),
    scheduledFor: article.scheduledFor ?? null,
    publishedAt: article.publishedAt ?? null,
    readiness: readiness(article, { bannerReady }),
  }
}
```

**Step 4: 跑测试确认通过 + 全量回归**

Run: `node --test test/schedule.test.js && npm test`
Expected: 新测试 PASS；既有测试全部 PASS（`listMeta` 只加字段，`src/insights.js` 与既有测试不依赖精确形状）。

**Step 5: Commit**

```bash
git add src/article.js test/schedule.test.js
git commit -m "feat: add article readiness report"
```

---

### Task 2: 排期与发布的纯函数

**Files:**
- Modify: `src/article.js`（`readiness` 之后插入四个函数）
- Test: `test/schedule.test.js`（追加）

**Step 1: 写失败测试**

在 `test/schedule.test.js` 追加：

```js
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
```

**Step 2: 跑测试确认失败**

Run: `node --test test/schedule.test.js`
Expected: FAIL，`setSchedule is not a function`（或 export 缺失）。

**Step 3: 最小实现**

在 `src/article.js` 的 `readiness` 之后插入：

```js
export function setSchedule(article, at) {
  article.scheduledFor = at
  touch(article)
}

export function clearSchedule(article) {
  delete article.scheduledFor
  touch(article)
}

export function markPublished(article, at) {
  article.publishedAt = at
  touch(article)
}

export function unpublish(article) {
  delete article.publishedAt
  touch(article)
}
```

**Step 4: 跑测试确认通过**

Run: `node --test test/schedule.test.js`
Expected: PASS（3 个测试）。

**Step 5: Commit**

```bash
git add src/article.js test/schedule.test.js
git commit -m "feat: add schedule and publish article mutations"
```

---

### Task 3: Host 路由 schedule/set、schedule/clear、articles/publish、articles/unpublish

**Files:**
- Modify: `src/host.js`（import 行、`notBusy` 之后加校验函数、`snapshotState` 的 articles 投影、`case 'articles/archive':` 之前插四个 case）
- Test: `test/schedule.test.js`（追加路由测试）

**Step 1: 写失败测试**

在 `test/schedule.test.js` 追加：

```js
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
    await route(deps, req, res)
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
```

**Step 2: 跑测试确认失败**

Run: `node --test test/schedule.test.js`
Expected: 新增 4 个测试 FAIL（404「没有这个接口」），前 3 个仍 PASS。

**Step 3: 实现路由**

3a. `src/host.js` 的 article.js import 行替换为：

```js
import { blockKind, clearSchedule, createArticle, fixPlan, HOOK_IDS, isCheckable, listMeta, markPublished, newId, revisionChanges, setSchedule, snapshot, splitMarkdown, toMarkdown, touch, undo, unpublish } from './article.js'
```

3b. 在 `notBusy` 函数之后插入：

```js
function scheduleTime(value) {
  const date = new Date(value)
  if (typeof value !== 'string' || Number.isNaN(date.getTime()) || date.getFullYear() < 2000 || date.getFullYear() > 2100) {
    throw Object.assign(new Error('请选择有效的发布时间。'), { status: 400 })
  }
  return date.toISOString()
}
```

3c. `snapshotState` 中的 articles 行替换为：

```js
    articles: state.articles.map(article => listMeta(article, { bannerReady: bannerView(article).ready })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
```

3d. 在 `case 'articles/archive':` 之前插入四个 case：

```js
    case 'schedule/set': {
      const at = scheduleTime(body.at)
      await store.update(state => {
        const article = mustFind(state, body.id)
        if (article.archivedAt) throw Object.assign(new Error('归档稿件不能排期，请先恢复。'), { status: 409 })
        if (article.publishedAt) throw Object.assign(new Error('这篇已标记发布，不能改期。'), { status: 409 })
        setSchedule(article, at)
      })
      return ok()
    }
    case 'schedule/clear': {
      await store.update(state => {
        const article = mustFind(state, body.id)
        if (article.publishedAt) throw Object.assign(new Error('这篇已标记发布，不能取消排期。'), { status: 409 })
        clearSchedule(article)
      })
      return ok()
    }
    case 'articles/publish': {
      const at = body.at == null ? new Date().toISOString() : scheduleTime(body.at)
      await store.update(state => {
        const article = mustFind(state, body.id)
        if (article.archivedAt) throw Object.assign(new Error('归档稿件不能标记发布，请先恢复。'), { status: 409 })
        markPublished(article, at)
      })
      return ok()
    }
    case 'articles/unpublish': {
      await store.update(state => { unpublish(mustFind(state, body.id)) })
      return ok()
    }
```

**Step 4: 跑测试确认通过 + 全量回归**

Run: `node --test test/schedule.test.js && npm test`
Expected: 全部 PASS。

**Step 5: Commit**

```bash
git add src/host.js test/schedule.test.js
git commit -m "feat: add schedule and publish routes"
```

---

### Task 4: 排期页骨架 —— 待排坞、周历、体检环、排期弹窗、拖拽

**Files:**
- Create: `client/schedule.jsx`
- Modify: `client/app.jsx`（import、MODULES、Studio 路由三处）
- Modify: `client/styles.css`（文件末尾追加排期样式块）
- Build: `dist/client.js`

客户端没有单测设施（无 jsdom），本任务的验证 = 构建成功 + `npm run dev` 浏览器冒烟。诚实记录：浏览器验收在 Task 6 做完整循环，这里只确认渲染与主交互可用。

**Step 1: 追加 CSS**

在 `client/styles.css` 末尾追加：

```css
/* 排期 */
.ws-sched { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: auto; padding: clamp(18px, 3cqw, 40px); background: radial-gradient(ellipse at top right, var(--accent-soft), transparent 55%), var(--bg); --sched-warn: #a16207; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
body[data-ds-dark-theme] .ws-sched { --sched-warn: #e2b93b; }
.ws-sched::-webkit-scrollbar, .ws-sched-dock::-webkit-scrollbar { width: 10px; }
.ws-sched::-webkit-scrollbar-thumb, .ws-sched-dock::-webkit-scrollbar-thumb { background: var(--line); border-radius: 999px; border: 2px solid var(--panel); }
.ws-sched::-webkit-scrollbar-thumb:hover, .ws-sched-dock::-webkit-scrollbar-thumb:hover { background: var(--ink2); }
.ws-sched-head { display: flex; align-items: flex-end; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; }
.ws-sched-head h1 { font-size: clamp(26px, 3.4cqw, 38px); line-height: 1.1; letter-spacing: -.03em; margin-bottom: 6px; }
.ws-sched-weeknav { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ws-sched-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 16px; align-items: start; }
.ws-sched-dock { display: flex; flex-direction: column; gap: 10px; max-height: min(640px, calc(100vh - 220px)); overflow: auto; padding: 12px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--panel); scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
.ws-sched-card { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--card); cursor: grab; }
.ws-sched-card:hover { border-color: var(--accent); box-shadow: 0 6px 16px rgb(0 0 0 / .08); }
.ws-sched-card:active { cursor: grabbing; }
.ws-sched-card-top { display: grid; grid-template-columns: 64px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.ws-sched-thumb { display: grid; place-items: center; width: 64px; aspect-ratio: 2.35; overflow: hidden; border-radius: 6px; background: linear-gradient(125deg, var(--accent-soft), var(--panel)); color: var(--ink2); }
.ws-sched-thumb img { width: 100%; height: 100%; object-fit: cover; }
.ws-sched-card-copy { display: grid; gap: 2px; min-width: 0; }
.ws-sched-card-title { font-weight: 600; font-size: 13px; line-height: 19px; text-align: left; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.ws-sched-card-title:hover { color: var(--accent); }
.ws-sched-card-foot { display: flex; align-items: center; justify-content: space-between; }
.ws-sched-ring path { stroke: var(--line); }
.ws-sched-ring path.is-done { stroke: var(--ok); }
.ws-sched-main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.ws-sched-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
.ws-sched-day { display: flex; flex-direction: column; gap: 8px; min-height: 260px; padding: 8px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); transition: border-color .15s, background .15s; }
.ws-sched-day.is-today { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 5%, var(--panel)); }
.ws-sched-day.is-over { border-color: var(--accent); border-style: dashed; background: var(--accent-soft); }
.ws-sched-day-head { display: flex; align-items: baseline; justify-content: space-between; font-size: 12px; color: var(--ink2); }
.ws-sched-day.is-today .ws-sched-day-head { color: var(--accent); font-weight: 600; }
.ws-sched-day-head b { font-size: 13px; }
.ws-sched-day-list { display: flex; flex-direction: column; gap: 6px; }
.ws-sched-empty { display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 44px; border: 1px dashed var(--line); border-radius: 8px; color: var(--ink2); font-size: 12px; }
.ws-sched-empty:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.ws-sched-entry { display: grid; gap: 4px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); cursor: grab; }
.ws-sched-entry.is-notready { border-color: color-mix(in srgb, var(--sched-warn) 45%, var(--line)); }
.ws-sched-entry.is-overdue { border-color: var(--sched-warn); background: color-mix(in srgb, var(--sched-warn) 8%, var(--card)); }
.ws-sched-entry.is-published { cursor: default; opacity: .85; background: color-mix(in srgb, var(--ok) 6%, var(--card)); }
.ws-sched-entry-head { display: flex; align-items: center; justify-content: space-between; }
.ws-sched-time { font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent); }
.ws-sched-entry.is-overdue .ws-sched-time { color: var(--sched-warn); }
.ws-sched-published-tag { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: var(--ok); font-weight: 600; }
.ws-sched-entry-title { font-size: 12px; line-height: 18px; font-weight: 600; text-align: left; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.ws-sched-entry-title:hover { color: var(--accent); }
.ws-sched-missing { font-size: 11px; color: var(--sched-warn); }
.ws-sched-overdue { font-size: 11px; color: var(--sched-warn); font-weight: 600; }
.ws-sched-entry-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.ws-sched-entry-actions .ws-link { font-size: 12px; padding: 0; }
.ws-sched-next { display: grid; grid-template-columns: 120px minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 14px; border: 1px solid var(--accent); border-radius: var(--r-md); background: linear-gradient(120deg, var(--accent-soft), var(--card) 60%); }
.ws-sched-next .ws-sched-thumb { width: 120px; }
.ws-sched-next.is-overdue { border-color: var(--sched-warn); background: linear-gradient(120deg, color-mix(in srgb, var(--sched-warn) 10%, var(--card)), var(--card) 60%); }
.ws-sched-next-copy { display: grid; gap: 3px; min-width: 0; }
.ws-sched-next-title { font-size: 16px; font-weight: 700; text-align: left; overflow-wrap: anywhere; }
.ws-sched-next-title:hover { color: var(--accent); }
.ws-sched-count { font-size: 13px; font-weight: 600; color: var(--accent); font-variant-numeric: tabular-nums; }
.ws-sched-checklist { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.ws-sched-overlay { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: rgb(0 0 0 / .35); }
.ws-sched-picker { display: grid; gap: 12px; width: min(360px, calc(100vw - 32px)); padding: 18px; border: 1px solid var(--line); border-radius: var(--r-md); background: var(--card); box-shadow: 0 18px 48px rgb(0 0 0 / .22); }
.ws-sched-picker-head { display: flex; align-items: center; justify-content: space-between; }
.ws-sched-picker-head h2 { font-size: 16px; font-weight: 700; }
.ws-sched-picker-title { font-weight: 600; overflow-wrap: anywhere; }
.ws-sched-field { display: grid; gap: 4px; font-size: 12px; color: var(--ink2); }
.ws-sched-field :is(input, select) { padding: 7px 10px; border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--panel); color: var(--ink); font-size: 13px; }
.ws-sched-slots { display: flex; gap: 6px; flex-wrap: wrap; }
.ws-sched-slots button { padding: 5px 12px; border: 1px solid var(--line); border-radius: 999px; font-size: 12px; color: var(--ink2); }
.ws-sched-slots button.is-on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); font-weight: 600; }
.ws-sched-picker-actions { display: flex; justify-content: flex-end; gap: 8px; }
@container (max-width: 980px) {
  .ws-sched-body { grid-template-columns: 1fr; }
  .ws-sched-dock { flex-direction: row; flex-wrap: wrap; max-height: none; }
  .ws-sched-dock > .ws-pane-title, .ws-sched-dock-hint { flex-basis: 100%; }
  .ws-sched-card { flex: 1 1 220px; }
  .ws-sched-week { grid-template-columns: 1fr; }
  .ws-sched-day { min-height: 0; }
  .ws-sched-next { grid-template-columns: 84px minmax(0, 1fr); }
  .ws-sched-next .ws-sched-thumb { width: 84px; }
  .ws-sched-checklist { grid-column: 1 / -1; justify-content: flex-start; }
}
@media (prefers-reduced-motion: reduce) { .ws-sched-day { transition: none; } }
```

**Step 2: 新建 `client/schedule.jsx`（本任务完整版）**

```jsx
// 排期页：左边待排坞，右边周历，拖拽即排期。公众号发布是手动的，这里只管排哪天、够不够格发、发完标记。
import React from 'react'
import { act, setState, toast, useStudio } from './state.js'

const ICONS = {
  check: 'M3 8.5l3.2 3.2L13 5',
  close: 'M4 4l8 8M12 4l-8 8',
  plus: 'M8 3v10M3 8h10',
  doc: 'M4 2h5.5L12.5 5v9H4zM6.5 8h4M6.5 10.5h4',
}
function Icon({ name, size = 16 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg>
}

const SLOTS = [
  { id: 'morning', label: '早 8 点', hour: 8 },
  { id: 'noon', label: '午 12 点', hour: 12 },
  { id: 'evening', label: '晚 8 点', hour: 20 },
  { id: 'custom', label: '自定义', hour: null },
]
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const pad = n => String(n).padStart(2, '0')
const dayKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const parseDay = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d }
const mondayOf = date => addDays(date, -((date.getDay() + 6) % 7))
const weekdayName = date => WEEKDAYS[(date.getDay() + 6) % 7]
const atOn = (key, hour, minute = 0) => { const d = parseDay(key); d.setHours(hour, minute, 0, 0); return d.toISOString() }
const timeLabel = iso => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const slotOf = iso => { const d = new Date(iso); return SLOTS.find(s => s.hour === d.getHours() && d.getMinutes() === 0) ?? SLOTS[3] }
const coverUrl = draft => `wechat-studio/cover/image?${new URLSearchParams({ id: draft.id, asset: draft.coverId })}`

async function openDraft(draft, view) {
  if (!await act('articles/select', { id: draft.id })) return
  setState({ module: 'paper', paperHome: false, view: view ?? (draft.lastView === 'layout' ? 'layout' : 'paper'), editing: null })
}

function ReadinessRing({ readiness, size = 22 }) {
  const r = 8, c = 10, gap = 0.14
  const arc = index => {
    const start = (index / 5) * Math.PI * 2 - Math.PI / 2 + gap
    const end = ((index + 1) / 5) * Math.PI * 2 - Math.PI / 2 - gap
    return `M${(c + r * Math.cos(start)).toFixed(2)} ${(c + r * Math.sin(start)).toFixed(2)} A${r} ${r} 0 0 1 ${(c + r * Math.cos(end)).toFixed(2)} ${(c + r * Math.sin(end)).toFixed(2)}`
  }
  return (
    <svg className="ws-sched-ring" width={size} height={size} viewBox="0 0 20 20" role="img"
      aria-label={`就绪 ${readiness.done}/${readiness.total}：${readiness.items.map(i => `${i.label}${i.done ? '已完成' : '未完成'}`).join('，')}`}>
      {readiness.items.map((item, index) => <path key={item.id} d={arc(index)} fill="none" strokeWidth="2.6" strokeLinecap="round" className={item.done ? 'is-done' : ''} />)}
    </svg>
  )
}

function CoverThumb({ draft }) {
  const [failed, setFailed] = React.useState(false)
  return <div className="ws-sched-thumb">{draft.coverId && !failed
    ? <img src={coverUrl(draft)} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <Icon name="doc" size={18} />}</div>
}

function DockCard({ draft, onPick, onDragStart }) {
  const missing = draft.readiness.total - draft.readiness.done
  return (
    <article className="ws-sched-card" draggable onDragStart={e => onDragStart(e, draft)}>
      <div className="ws-sched-card-top">
        <CoverThumb draft={draft} />
        <div className="ws-sched-card-copy">
          <button type="button" className="ws-sched-card-title" onClick={() => openDraft(draft)}>{draft.title}</button>
          <span className="ws-muted ws-small">{draft.chars} 字</span>
        </div>
        <ReadinessRing readiness={draft.readiness} />
      </div>
      <div className="ws-sched-card-foot">
        <span className="ws-muted ws-small">{missing ? `还差 ${missing} 项` : '就绪'}</span>
        <button type="button" className="ws-link" onClick={() => onPick(draft)}>排期</button>
      </div>
    </article>
  )
}

function ScheduledCard({ draft, now, onPick, onUnschedule, onDragStart }) {
  const missing = draft.readiness.items.filter(i => !i.done)
  const overdue = new Date(draft.scheduledFor).getTime() < now
  return (
    <article className={`ws-sched-entry ${overdue ? 'is-overdue' : ''} ${missing.length ? 'is-notready' : ''}`} draggable onDragStart={e => onDragStart(e, draft)}>
      <div className="ws-sched-entry-head">
        <span className="ws-sched-time">{timeLabel(draft.scheduledFor)}</span>
        <ReadinessRing readiness={draft.readiness} size={18} />
      </div>
      <button type="button" className="ws-sched-entry-title" onClick={() => openDraft(draft)}>{draft.title}</button>
      {missing.length ? <span className="ws-sched-missing">还差：{missing.map(i => i.label).join('、')}</span> : null}
      {overdue ? <span className="ws-sched-overdue">已过点，未标记发布</span> : null}
      <div className="ws-sched-entry-actions">
        <button type="button" className="ws-link" onClick={() => onPick(draft)}>改期</button>
        <button type="button" className="ws-link" onClick={() => onUnschedule(draft)}>取消</button>
      </div>
    </article>
  )
}

function PublishedCard({ draft }) {
  return (
    <article className="ws-sched-entry is-published">
      <div className="ws-sched-entry-head">
        <span className="ws-sched-time">{timeLabel(draft.publishedAt)}</span>
        <span className="ws-sched-published-tag"><Icon name="check" size={12} />已发</span>
      </div>
      <button type="button" className="ws-sched-entry-title" onClick={() => openDraft(draft)}>{draft.title}</button>
      <div className="ws-sched-entry-actions">
        <button type="button" className="ws-link" onClick={async () => { if (await act('articles/unpublish', { id: draft.id })) toast('已撤销发布标记') }}>撤销标记</button>
      </div>
    </article>
  )
}

function SchedulePicker({ data, picker, onClose }) {
  const dock = data.articles.filter(a => !a.archivedAt && !a.publishedAt && !a.scheduledFor)
  const [id, setId] = React.useState(picker.id ?? dock[0]?.id ?? '')
  const [day, setDay] = React.useState(picker.day)
  const chosen = data.articles.find(a => a.id === id)
  const existing = chosen?.scheduledFor ? new Date(chosen.scheduledFor) : null
  const [slot, setSlot] = React.useState(existing ? slotOf(chosen.scheduledFor).id : 'evening')
  const [time, setTime] = React.useState(existing ? timeLabel(chosen.scheduledFor) : '20:00')
  const pending = useStudio(s => s.pending)
  const submit = async event => {
    event.preventDefault()
    if (!id || !day) return
    const hour = slot === 'custom' ? Number(time.split(':')[0]) : SLOTS.find(s => s.id === slot).hour
    const minute = slot === 'custom' ? Number(time.split(':')[1]) : 0
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return toast('请填写有效的时间', true)
    const at = atOn(day, hour, minute)
    if (await act('schedule/set', { id, at })) {
      toast(`已排到 ${weekdayName(parseDay(day))} ${timeLabel(at)}`)
      onClose()
    }
  }
  return (
    <div className="ws-sched-overlay" role="presentation" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <form className="ws-sched-picker" role="dialog" aria-modal="true" aria-label="安排发布时间" onSubmit={submit}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
        <div className="ws-sched-picker-head">
          <h2>{picker.id ? '改期' : '排一篇'}</h2>
          <button type="button" className="ws-icon-btn" aria-label="关闭" onClick={onClose}><Icon name="close" /></button>
        </div>
        {picker.id ? <p className="ws-sched-picker-title">{chosen?.title}</p> : (
          <label className="ws-sched-field">选稿件
            <select value={id} onChange={e => setId(e.target.value)} autoFocus>
              {dock.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </label>
        )}
        <label className="ws-sched-field">日期
          <input type="date" value={day} min="2000-01-01" max="2100-12-31" required autoFocus={Boolean(picker.id)} onChange={e => setDay(e.target.value)} />
        </label>
        <div className="ws-sched-slots" role="radiogroup" aria-label="时段">
          {SLOTS.map(s => <button key={s.id} type="button" role="radio" aria-checked={slot === s.id} className={slot === s.id ? 'is-on' : ''} onClick={() => setSlot(s.id)}>{s.label}</button>)}
        </div>
        {slot === 'custom' ? <label className="ws-sched-field">时间<input type="time" value={time} required onChange={e => setTime(e.target.value)} /></label> : null}
        <div className="ws-sched-picker-actions">
          <button type="button" className="ws-btn" onClick={onClose}>取消</button>
          <button type="submit" className="ws-btn is-primary" disabled={!id || !day || Boolean(pending)}>排上日历</button>
        </div>
      </form>
    </div>
  )
}

export function ScheduleView({ data }) {
  const [weekOffset, setWeekOffset] = React.useState(0)
  const [picker, setPicker] = React.useState(null)
  const [overDay, setOverDay] = React.useState(null)
  const pending = useStudio(s => s.pending)
  const now = Date.now()
  const today = new Date()
  const monday = addDays(mondayOf(today), weekOffset * 7)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const active = data.articles.filter(a => !a.archivedAt)
  const dock = active.filter(a => !a.scheduledFor && !a.publishedAt)
  const scheduled = active.filter(a => a.scheduledFor && !a.publishedAt)
  const published = active.filter(a => a.publishedAt)
  const weekStart = dayKey(days[0])
  const weekEnd = dayKey(days[6])
  const weekPublished = published.filter(a => { const k = dayKey(new Date(a.publishedAt)); return k >= weekStart && k <= weekEnd }).length
  const byDay = key => ({
    scheduled: scheduled.filter(a => dayKey(new Date(a.scheduledFor)) === key).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)),
    published: published.filter(a => dayKey(new Date(a.publishedAt)) === key).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)),
  })
  const dragStart = (e, draft) => { e.dataTransfer.setData('text/plain', draft.id); e.dataTransfer.effectAllowed = 'move' }
  const dropOnDay = async (id, key) => {
    setOverDay(null)
    const draft = active.find(a => a.id === id)
    if (!draft || draft.publishedAt || pending) return
    if (draft.scheduledFor && dayKey(new Date(draft.scheduledFor)) === key) return
    const old = draft.scheduledFor ? new Date(draft.scheduledFor) : null
    const at = atOn(key, old ? old.getHours() : 20, old ? old.getMinutes() : 0)
    if (await act('schedule/set', { id, at })) toast(`已排到 ${weekdayName(parseDay(key))} ${timeLabel(at)}`)
  }
  const dropOnDock = async id => {
    const draft = active.find(a => a.id === id)
    if (!draft?.scheduledFor || pending) return
    if (await act('schedule/clear', { id })) toast('已移回待排')
  }
  const unschedule = async draft => { if (await act('schedule/clear', { id: draft.id })) toast('已取消排期，回到待排') }
  const pickFor = draft => setPicker({ id: draft.id, day: draft.scheduledFor ? dayKey(new Date(draft.scheduledFor)) : dayKey(today) })
  return (
    <main className="ws-sched">
      <header className="ws-sched-head">
        <div><h1>排期</h1><p className="ws-muted">{dock.length} 篇待排 · 本周已发 {weekPublished} 篇</p></div>
        <div className="ws-sched-weeknav">
          <button type="button" className="ws-btn" onClick={() => setWeekOffset(w => w - 1)}>上一周</button>
          <button type="button" className="ws-btn" disabled={weekOffset === 0} onClick={() => setWeekOffset(0)}>本周</button>
          <button type="button" className="ws-btn" onClick={() => setWeekOffset(w => w + 1)}>下一周</button>
          <span className="ws-muted ws-small">{days[0].getMonth() + 1} 月 {days[0].getDate()} 日 – {days[6].getMonth() + 1} 月 {days[6].getDate()} 日</span>
        </div>
      </header>
      <div className="ws-sched-body">
        <aside className="ws-sched-dock" aria-label="待排稿件"
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
          onDrop={e => { e.preventDefault(); dropOnDock(e.dataTransfer.getData('text/plain')) }}>
          <h2 className="ws-pane-title">待排 <span>{dock.length}</span></h2>
          {dock.length ? dock.map(d => <DockCard key={d.id} draft={d} onPick={pickFor} onDragStart={dragStart} />)
            : <p className="ws-muted ws-small">稿件都排上了。新写一篇，或把日历上的卡拖回来。</p>}
          <p className="ws-muted ws-small ws-sched-dock-hint">拖到右边某天即可排期；点「排期」可选时段。</p>
        </aside>
        <section className="ws-sched-main" aria-label="周日历">
          <div className="ws-sched-week">
            {days.map(date => {
              const key = dayKey(date)
              const rows = byDay(key)
              return (
                <div key={key} className={`ws-sched-day ${key === dayKey(today) ? 'is-today' : ''} ${overDay === key ? 'is-over' : ''}`}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverDay(key) }}
                  onDragLeave={() => setOverDay(current => current === key ? null : current)}
                  onDrop={e => { e.preventDefault(); dropOnDay(e.dataTransfer.getData('text/plain'), key) }}>
                  <header className="ws-sched-day-head"><span>{weekdayName(date)}</span><b>{date.getMonth() + 1}/{date.getDate()}</b></header>
                  <div className="ws-sched-day-list">
                    {rows.scheduled.map(d => <ScheduledCard key={d.id} draft={d} now={now} onPick={pickFor} onUnschedule={unschedule} onDragStart={dragStart} />)}
                    {rows.published.map(d => <PublishedCard key={d.id} draft={d} />)}
                    {!rows.scheduled.length && !rows.published.length ? (
                      <button type="button" className="ws-sched-empty" onClick={() => setPicker({ id: null, day: key })}><Icon name="plus" size={13} />排一篇</button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
      {picker ? <SchedulePicker data={data} picker={picker} onClose={() => setPicker(null)} /> : null}
    </main>
  )
}
```

**Step 3: 接线 `client/app.jsx`（三处精确替换）**

3a. 在 `import { InlineDiagramDialog, InlineDiagramPane } from './inline-diagrams.jsx'` 之后加一行：

```js
import { ScheduleView } from './schedule.jsx'
```

3b. MODULES 中的排期条目：

旧：
```js
  { id: 'schedule', label: '排期', icon: 'schedule', soon: true, title: '排期', lead: '把写好的稿子拖到日历上，排好哪天几点发。', points: ['一张日历看清这周要发什么', '右上角永远是下一篇要发的', '发完标记一下，进复盘'] },
```
新：
```js
  { id: 'schedule', label: '排期', icon: 'schedule' },
```

3c. `Studio` 中 `else if (item.id === 'insights') content = <InsightsView />` 之后加一行：

```js
  else if (item.id === 'schedule') content = <ScheduleView data={data} />
```

**Step 4: 构建 + 冒烟**

Run: `npm test && npm run build`
Expected: 测试全 PASS；输出 `dist/client.js … KB`，无 esbuild 报错。

Run: `npm run dev`（后台），浏览器打开 `http://127.0.0.1:4173`：
- 左侧模块栏「排期」不再带「即将」角标，点进去是周历而不是占位页。
- 空库时待排坞显示空态文案，七天格子各有「排一篇」按钮。
- 点「排一篇」弹窗可选日期时段（空库时 select 无选项、提交按钮禁用，属预期）。
- 回「稿面」新建一篇文章（选题随便写，假模型会出正文），再回排期：待排坞出现卡片，体检环亮「正文、标题」两段。
- 点卡片「排期」→ 选明天 + 晚 8 点 → 提交：卡片出现在明天格子，toast 提示；点「取消」回到待排坞。
- 控制台无报错（用 browser-use 的 `list_console_messages` 检查）。

**Step 5: Commit**

```bash
git add client/schedule.jsx client/app.jsx client/styles.css dist/client.js
git commit -m "feat: add schedule board with week calendar and dock"
```

---

### Task 5: 下一篇倒计时 + 发布清单 + 标记已发

**Files:**
- Modify: `client/schedule.jsx`（加 `NextUp` 组件；`ScheduledCard` 加「标记已发」；`ScheduleView` 挂载 NextUp）
- Build: `dist/client.js`

**Step 1: 加 NextUp 组件**

在 `client/schedule.jsx` 的 `SchedulePicker` 之后、`export function ScheduleView` 之前插入：

```jsx
function NextUp({ data, onReschedule }) {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer) }, [])
  const candidates = data.articles.filter(a => !a.archivedAt && !a.publishedAt && a.scheduledFor)
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor))
  const next = candidates.find(a => new Date(a.scheduledFor).getTime() >= now) ?? null
  const overdue = candidates.filter(a => new Date(a.scheduledFor).getTime() < now)
  const target = next ?? overdue[0]
  if (!target) return null
  const at = new Date(target.scheduledFor).getTime()
  const diff = at - now
  const isToday = dayKey(new Date(at)) === dayKey(new Date(now))
  const countdown = diff <= 0 ? '已过发布时间'
    : diff < 3600000 ? `还有 ${Math.max(1, Math.round(diff / 60000))} 分钟`
      : diff < 86400000 ? `还有 ${Math.floor(diff / 3600000)} 小时 ${Math.floor(diff % 3600000 / 60000)} 分`
        : `还有 ${Math.floor(diff / 86400000)} 天 ${Math.floor(diff % 86400000 / 3600000)} 小时`
  const publish = async () => { if (await act('articles/publish', { id: target.id })) toast('已标记发布。导入复盘数据后会自动对上这篇。') }
  return (
    <section className={`ws-sched-next ${diff <= 0 ? 'is-overdue' : ''}`} aria-label="下一篇要发的">
      <CoverThumb draft={target} />
      <div className="ws-sched-next-copy">
        <span className="ws-muted ws-small">下一篇 · {weekdayName(new Date(at))} {timeLabel(target.scheduledFor)}</span>
        <button type="button" className="ws-sched-next-title" onClick={() => openDraft(target)}>{target.title}</button>
        <span className={diff <= 0 ? 'ws-warn' : 'ws-sched-count'}>{countdown}</span>
      </div>
      <div className="ws-sched-checklist">
        {isToday || diff <= 0 ? <>
          <button type="button" className="ws-btn" onClick={() => openDraft(target, 'layout')}>去排版复制</button>
          {target.coverId ? <a className="ws-btn" href={coverUrl(target) + '&download=1'} download>下载封面</a> : <span className="ws-muted ws-small">还没有封面</span>}
          <button type="button" className="ws-btn is-primary" onClick={publish}><Icon name="check" size={13} />标记已发</button>
        </> : <>
          <button type="button" className="ws-btn" onClick={() => onReschedule(target)}>改期</button>
          <button type="button" className="ws-btn" onClick={publish}>提前标记已发</button>
        </>}
      </div>
    </section>
  )
}
```

**Step 2: ScheduledCard 加「标记已发」**

`ScheduledCard` 签名改为接收 `onPublish`：

旧：`function ScheduledCard({ draft, now, onPick, onUnschedule, onDragStart }) {`
新：`function ScheduledCard({ draft, now, onPick, onUnschedule, onPublish, onDragStart }) {`

旧：
```jsx
      <div className="ws-sched-entry-actions">
        <button type="button" className="ws-link" onClick={() => onPick(draft)}>改期</button>
        <button type="button" className="ws-link" onClick={() => onUnschedule(draft)}>取消</button>
      </div>
```
新：
```jsx
      <div className="ws-sched-entry-actions">
        <button type="button" className="ws-link" onClick={() => onPublish(draft)}>标记已发</button>
        <button type="button" className="ws-link" onClick={() => onPick(draft)}>改期</button>
        <button type="button" className="ws-link" onClick={() => onUnschedule(draft)}>取消</button>
      </div>
```

**Step 3: ScheduleView 挂载**

在 `const pickFor = ...` 之后加：

```js
  const publish = async draft => { if (await act('articles/publish', { id: draft.id })) toast('已标记发布。导入复盘数据后会自动对上这篇。') }
```

`<section className="ws-sched-main" aria-label="周日历">` 内、`<div className="ws-sched-week">` 之前插入：

```jsx
          <NextUp data={data} onReschedule={pickFor} />
```

周历里 ScheduledCard 的调用处补 `onPublish={publish}`：

旧：`{rows.scheduled.map(d => <ScheduledCard key={d.id} draft={d} now={now} onPick={pickFor} onUnschedule={unschedule} onDragStart={dragStart} />)}`
新：`{rows.scheduled.map(d => <ScheduledCard key={d.id} draft={d} now={now} onPick={pickFor} onUnschedule={unschedule} onPublish={publish} onDragStart={dragStart} />)}`

**Step 4: 构建 + 浏览器验证发布闭环**

Run: `npm test && npm run build`
Expected: PASS + 构建成功。

`npm run dev` 浏览器里走完闭环：
- 把一篇稿子排到**今天**（自定义时段选一个已过去的时刻也行）：顶部出现「下一篇」卡，倒计时文案正确；到点/过点显示发布清单三件套。
- 「去排版复制」跳到该稿排版预览；返回排期，「标记已发」→ 卡片变成绿色「已发」样式，待排数不变、本周已发 +1。
- 「撤销标记」→ 卡片回到 scheduled 状态。
- 排一篇到下周：NextUp 显示「还有 X 天 X 小时」，只有「改期 / 提前标记已发」两个按钮。
- 过点未发的卡：琥珀色边框 + 「已过点，未标记发布」。
- 控制台无报错；重复标记/撤销 5 次状态不漂移。

**Step 5: Commit**

```bash
git add client/schedule.jsx dist/client.js
git commit -m "feat: add next-up countdown and publish checklist"
```

---

### Task 6: 响应式与细节打磨 + 完整验收 + README

**Files:**
- Modify: `client/schedule.jsx` / `client/styles.css`（仅修验收发现的问题）
- Modify: `README.md`
- Build: `dist/client.js`

**Step 1: 完整浏览器验收（browser-use MCP，`npm run dev` 起服务）**

准备数据：稿面新建 2–3 篇；给其中一篇在设置里填任意方舟 Key（dev 假接口不校验）后生成封面；跑一轮朱雀检测（Key 填 `demo`，假接口按「不仅/值得一提」判段）。逐项核对：

1. **拖拽主流程**：待排卡拖到后天 → 默认晚 8 点落位、toast 正确；已排卡拖到另一天 → 保留原时刻；拖回待排坞 → 取消排期。拖拽悬停时目标格虚线高亮，松手后高亮消失。
2. **体检环**：无封面稿显示「还差：封面、横幅」（按实际缺项）；生成封面 + 质检通过后环全绿。缺项卡排上日历显示琥珀边框但不阻止。
3. **弹窗键盘路径**：空格/回车打开「排一篇」，Tab 遍历日期与时段，Escape 关闭，点遮罩关闭；改期弹窗回填原日期与时段。
4. **周导航**：上一周/下一周/本周，跨月边界日期标签正确；今天的格子始终高亮。
5. **发布闭环**：今天到点 → 清单三件套 → 标记已发 → 已发卡片与计数 → 撤销标记。
6. **响应式**：把窗口缩到 <980px（容器查询生效）：待排坞变横向卡片带、周历变纵向列表、NextUp 清单换行不溢出；375px 宽下无横向滚动条、无文字截断不可读。
7. **深色主题**：若宿主可切 `body[data-ds-dark-theme]`，在 dev 页控制台执行 `document.body.dataset.dsDarkTheme = 'true'` 检查 `--sched-warn` 覆盖与对比度。
8. **回归**：稿面改稿、配图、质检、复盘、技能页各点一遍，确认 MODULES 改动没有破坏路由；`list_console_messages` 全程无 error。
9. **稳定性**：连续排期/取消/标记 10 次，无重复卡片、无状态漂移；切走模块再切回，周偏移重置为本周属预期。

发现问题就修，修完重跑对应项。所有截图留档，未跑的项如实标注。

**Step 2: README 更新**

`README.md` 中：

旧：`素材和排期入口目前为预留页面。`
新：`素材入口目前为预留页面。`

并在「写作与发布」表格的「复制到公众号」行之后加一行：

```markdown
| 排期发布 | 在「排期」把稿件拖上日历，按日期和时段安排发布；卡片显示正文、标题、质检、封面、横幅五项就绪度。到点在「下一篇」清单里复制排版、下载封面并标记已发，复盘导入数据后按标题自动对上。 |
```

**Step 3: 最终全量验证**

Run: `npm test && npm run build && git diff --check`
Expected: 全部 PASS；构建成功；无空白错误。

**Step 4: Commit**

```bash
git add client/schedule.jsx client/styles.css dist/client.js README.md
git commit -m "docs: describe schedule module"
```

（若 Step 1 有修复，修复单独提交，如 `fix: keep schedule drop highlight in sync`，再提交文档。）

---

## 验收标准（汇总）

- [ ] `npm test` 全绿，含 `test/schedule.test.js` 的 7 个测试。
- [ ] 排期模块无「即将」角标，周历 + 待排坞 + 体检环 + 拖拽 + 弹窗全部可用。
- [ ] 下一篇倒计时准确，到点出现发布清单，标记已发/撤销闭环稳定。
- [ ] 归档稿、已发稿的排期冲突返回 409 且有中文提示；非法时间 400。
- [ ] <980px 容器宽度下布局降级可用，无溢出、无不可达控件。
- [ ] 稿面/配图/质检/复盘/技能无回归；控制台无 error。
- [ ] README 与实现一致；`dist/client.js` 与源码同步提交。