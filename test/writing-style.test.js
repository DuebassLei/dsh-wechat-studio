import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  STYLE_PROFILE_VERSION,
  MAX_SAMPLE_CHARS,
  STYLE_LIMITS,
  cleanArticleSample,
  buildSampleBundle,
  normalizeStyleProfile,
  pickableStyleArticles,
} from '../src/writing-style-shared.js'
import { extractInsightsSection, replaceInsightsSection } from '../src/insights.js'
import {
  MANAGED_MARKER,
  renderWriterSkill,
  renderHeadlineSkill,
  readStyleState,
  applyWritingStyle,
  restoreDefaultStyle,
  analyzeWritingStyle,
  previewWritingStyle,
} from '../src/writing-style.js'

const SAMPLE_PROFILE = {
  name: '我的口语实战风',
  summary: '像朋友聊天一样讲实战踩坑，不端着、不喊口号',
  voice: ['第一人称亲历视角', '把复杂概念翻译成人话'],
  rhythm: ['开头先抛具体场景', '段落控制在 2-4 句'],
  phrases: ['说白了', '实测下来'],
  taboos: ['赋能', '闭环', '抓手'],
  headline: {
    lengthRange: '15–22 字',
    hooks: ['先说反常识结果', '用具体踩坑数字开头'],
    punctuation: '少用感叹号，偏好逗号和问号',
    summaryStyle: '一句讲清读者看完能省什么麻烦',
  },
  excerpts: [
    '前两天我把自己的工作流重新拆了一遍，发现真正拖慢节奏的从来不是写字本身。',
    '说白了，工具好不好用，不是看功能表有多长，而是看你忙起来愿不愿意打开它。',
  ],
  userNote: '整体轻松自然一点',
}

test('cleanArticleSample strips code blocks, images, URLs, HTML tags, and fixed lines while keeping prose', () => {
  const raw = [
    '# 我的第一篇测试文章',
    '',
    '今天下楼买咖啡的时候，突然想到一个很实际的问题：为什么我们总觉得工具不够用？',
    '',
    '```js',
    'const sampleCodeValue = 42;',
    '```',
    '',
    '![截图说明](https://img.local/abc123.png)',
    '顺便放个链接 https://site.local/foo/bar 大家自己看。',
    '<section><p>这是一段包裹在 HTML 里的文字。</p></section>',
    '',
    '关注我，每天聊点实在的。',
  ].join('\n')

  const cleaned = cleanArticleSample(raw, { fixedLines: ['关注我，每天聊点实在的。'] })
  assert.match(cleaned, /今天下楼买咖啡的时候/)
  assert.match(cleaned, /这是一段包裹在 HTML 里的文字/)
  assert.doesNotMatch(cleaned, /sampleCodeValue/)
  assert.doesNotMatch(cleaned, /img\.local/)
  assert.doesNotMatch(cleaned, /site\.local/)
  assert.doesNotMatch(cleaned, /<section|<p>/)
  assert.doesNotMatch(cleaned, /关注我，每天聊点实在的/)
})

test('buildSampleBundle handles single article, drops empty samples, and enforces strict maxChars budget across 5 long articles', () => {
  assert.equal(STYLE_PROFILE_VERSION, 1)
  assert.equal(MAX_SAMPLE_CHARS, 20000)

  assert.throws(
    () => buildSampleBundle([{ title: '太短', text: '只有几个字' }]),
    err => err.status === 400 && /至少提供一篇包含正文的参考文章/.test(err.message),
  )

  const single = buildSampleBundle([
    { title: '单篇测试', text: '这是一篇足够长的单篇中文正文样本，用来验证单篇文章也能顺利进入风格分析，不会被硬性门槛挡在门外。' },
  ])
  assert.equal(single.items.length, 1)
  assert.equal(single.truncated, false)
  assert.ok(single.totalChars <= MAX_SAMPLE_CHARS)

  const longSamples = Array.from({ length: 5 }, (_, i) => ({
    title: `第${i + 1}篇长文`,
    text: `第${i + 1}篇开头：` + '这是一个用来测试均匀采样和总字数上限的真实中文段落。'.repeat(25) + `第${i + 1}篇结尾。`,
  }))
  const bundle = buildSampleBundle(longSamples, { maxChars: 1000 })
  assert.equal(bundle.items.length, 5)
  assert.equal(bundle.truncated, true)
  assert.ok(bundle.totalChars <= 1000, `expected totalChars <= 1000, got ${bundle.totalChars}`)
  assert.ok(bundle.combined.length <= 1000, `expected combined.length <= 1000, got ${bundle.combined.length}`)
  for (let i = 0; i < 5; i++) {
    assert.ok(bundle.items[i].text.length > 0, `article ${i + 1} should contribute`)
  }
})

test('normalizeStyleProfile enforces STYLE_LIMITS on every field and extracts fallback excerpts', () => {
  const huge = '很'.repeat(500)
  const raw = {
    name: huge,
    summary: huge,
    voice: [huge, '第一人称聊天感', '第一人称聊天感', '', 'a', 'b', 'c', 'd'],
    rhythm: [huge, '短句开场'],
    phrases: Array.from({ length: 20 }, (_, i) => `口头禅${i}_${huge}`),
    taboos: Array.from({ length: 20 }, (_, i) => `禁用词${i}_${huge}`),
    headline: {
      lengthRange: huge,
      hooks: Array.from({ length: 8 }, (_, i) => `钩子${i}_${huge}`),
      punctuation: huge,
      summaryStyle: huge,
    },
    excerpts: [],
    userNote: huge,
  }
  const fallbackSamples = [
    {
      title: '样本1',
      text: '第一段太短。\n\n前两天我把自己的工作流重新拆了一遍，发现真正拖慢节奏的从来不是写字本身，而是每次打开文档都要重新找状态。\n\n后来我换了个笨办法，直接把常用的开场结构写死在模板里，结果半小时就把初稿顺出来了，省了不少来回纠结的时间。',
    },
  ]

  const profile = normalizeStyleProfile(raw, fallbackSamples)
  assert.equal(profile.version, STYLE_PROFILE_VERSION)
  assert.ok(profile.name.length <= STYLE_LIMITS.name)
  assert.ok(profile.summary.length <= STYLE_LIMITS.summary)
  assert.ok(profile.userNote.length <= STYLE_LIMITS.userNote)
  assert.ok(profile.voice.length <= STYLE_LIMITS.voice[0])
  assert.ok(profile.voice.every(v => v.length <= STYLE_LIMITS.voice[1]))
  assert.ok(profile.rhythm.length <= STYLE_LIMITS.rhythm[0])
  assert.ok(profile.rhythm.every(v => v.length <= STYLE_LIMITS.rhythm[1]))
  assert.equal(profile.phrases.length, STYLE_LIMITS.phrases[0])
  assert.ok(profile.phrases.every(v => v.length <= STYLE_LIMITS.phrases[1]))
  assert.equal(profile.taboos.length, STYLE_LIMITS.taboos[0])
  assert.ok(profile.taboos.every(v => v.length <= STYLE_LIMITS.taboos[1]))
  assert.ok(profile.headline.lengthRange.length <= STYLE_LIMITS.headlineLengthRange)
  assert.equal(profile.headline.hooks.length, STYLE_LIMITS.headlineHooks[0])
  assert.ok(profile.headline.hooks.every(v => v.length <= STYLE_LIMITS.headlineHooks[1]))
  assert.ok(profile.headline.punctuation.length <= STYLE_LIMITS.headlinePunctuation)
  assert.ok(profile.headline.summaryStyle.length <= STYLE_LIMITS.headlineSummaryStyle)
  assert.ok(profile.excerpts.length >= 2 && profile.excerpts.length <= STYLE_LIMITS.excerpts[0])
  assert.ok(profile.excerpts.every(v => v.length <= STYLE_LIMITS.excerpts[1]))
})

test('pickableStyleArticles filters by !archivedAt and chars > 0', () => {
  const articles = [
    { id: '1', title: '正常稿件', chars: 1200, archivedAt: null },
    { id: '2', title: '已归档稿件', chars: 2000, archivedAt: '2026-11-01T00:00:00Z' },
    { id: '3', title: '空正文稿件', chars: 0, archivedAt: null },
    { id: '4', title: '缺字数稿件', archivedAt: null },
    { id: '5', title: '另一篇正常稿件', chars: 80, archivedAt: null },
  ]
  const picked = pickableStyleArticles(articles)
  assert.deepEqual(picked.map(a => a.id), ['1', '5'])
})

test('extractInsightsSection stops cleanly before the next H2 heading', () => {
  const md = [
    '# 标题规则',
    '',
    '## 数据复盘规则',
    '',
    '- 标题套路：A 高于 B。',
    '',
    '## 其他补充',
    '',
    '这里不属于复盘规则。',
  ].join('\n')

  const extracted = extractInsightsSection(md)
  assert.match(extracted, /^## 数据复盘规则/)
  assert.match(extracted, /标题套路：A 高于 B/)
  assert.doesNotMatch(extracted, /其他补充/)
  assert.doesNotMatch(extracted, /这里不属于复盘规则/)

  const replaced = replaceInsightsSection(md, '## 数据复盘规则\n\n- 新规则。')
  assert.match(replaced, /- 新规则。/)
  assert.match(replaced, /## 其他补充/)
})

test('renderWriterSkill and renderHeadlineSkill preserve pipeline contracts and insights section', () => {
  const writerMd = renderWriterSkill(SAMPLE_PROFILE)
  assert.match(writerMd, new RegExp(MANAGED_MARKER))
  assert.match(writerMd, /像朋友聊天一样讲实战踩坑/)
  assert.match(writerMd, /说白了/)
  assert.match(writerMd, /赋能/)
  assert.match(writerMd, /# 标题/)
  assert.match(writerMd, /## 小标题/)
  assert.match(writerMd, /\[可补：/)
  assert.match(writerMd, /\[截图：/)

  const existingHeadline = [
    '# 旧标题规则',
    '',
    '## 数据复盘规则',
    '',
    '- 标题套路：C 比 D 高 30%。',
    '',
    '## 尾部注释',
    '尾部内容不应被当作复盘规则。',
  ].join('\n')

  const headlineMd = renderHeadlineSkill(SAMPLE_PROFILE, existingHeadline)
  assert.match(headlineMd, new RegExp(MANAGED_MARKER))
  assert.match(headlineMd, /15–22 字/)
  assert.match(headlineMd, /\bA\b.*\bB\b.*\bC\b.*\bD\b.*other/s)
  assert.match(headlineMd, /recommendationReason/)
  assert.match(headlineMd, /## 数据复盘规则/)
  assert.match(headlineMd, /标题套路：C 比 D 高 30%/)
  assert.doesNotMatch(headlineMd, /尾部内容不应被当作复盘规则/)
})

test('applyWritingStyle protects hand-edited files with .bak and timestamped backups across drift scenarios', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ws-style-bak-'))
  try {
    const skillsDir = join(root, 'skills')
    await mkdir(skillsDir, { recursive: true })
    await writeFile(join(skillsDir, 'writer.md'), '# 用户最初手写的 writer\n', 'utf8')

    const first = await applyWritingStyle(root, SAMPLE_PROFILE, { scopes: { writer: true, headline: true }, sampleTitles: ['文章1'] })
    assert.ok(first.backedUp.some(f => f === 'writer.md.bak'))
    assert.equal(await readFile(join(skillsDir, 'writer.md.bak'), 'utf8'), '# 用户最初手写的 writer\n')
    assert.equal(first.state.active, true)
    assert.deepEqual(first.state.scopes, { writer: true, headline: true })

    const currentWriter = await readFile(join(skillsDir, 'writer.md'), 'utf8')
    await writeFile(join(skillsDir, 'writer.md'), `${currentWriter}\n- 用户额外手加的一条规矩\n`, 'utf8')
    const second = await applyWritingStyle(root, { ...SAMPLE_PROFILE, summary: '第二版定位' }, { scopes: { writer: true, headline: true } })
    assert.ok(second.backedUp.some(f => /^writer\.md\.bak\.\d{8}-\d{6}/.test(f)), `expected timestamped backup, got ${second.backedUp}`)
    assert.equal(await readFile(join(skillsDir, 'writer.md.bak'), 'utf8'), '# 用户最初手写的 writer\n')

    await writeFile(join(skillsDir, 'writer.md'), '# 用户删掉标记后彻底重写\n', 'utf8')
    const third = await applyWritingStyle(root, { ...SAMPLE_PROFILE, summary: '第三版定位' }, { scopes: { writer: true, headline: true } })
    assert.ok(third.backedUp.some(f => /^writer\.md\.bak\.\d{8}-\d{6}/.test(f)), `expected timestamped backup, got ${third.backedUp}`)
    const files = await readdir(skillsDir)
    const bakFiles = files.filter(f => f.startsWith('writer.md.bak'))
    assert.ok(bakFiles.length >= 3, `expected at least 3 backups, got ${bakFiles}`)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('applyWritingStyle deactivates unchecked managed scope (both -> writer only)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ws-style-scope-'))
  try {
    await applyWritingStyle(root, SAMPLE_PROFILE, { scopes: { writer: true, headline: true } })
    const state = await readStyleState(root)
    assert.deepEqual(state.scopes, { writer: true, headline: true })

    const updated = await applyWritingStyle(root, SAMPLE_PROFILE, { scopes: { writer: true, headline: false } })
    assert.deepEqual(updated.state.scopes, { writer: true, headline: false })
    assert.ok(updated.removed.includes('headline'))
    const files = await readdir(join(root, 'skills'))
    assert.ok(files.includes('writer.md'))
    assert.ok(!files.includes('headline.md'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('restoreDefaultStyle preserves newer insights rules in both default restore and backup restore', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ws-style-restore-'))
  try {
    const skillsDir = join(root, 'skills')
    await mkdir(skillsDir, { recursive: true })
    await writeFile(
      join(skillsDir, 'headline.md'),
      '# 老手写标题规则\n\n## 数据复盘规则\n\n- 旧复盘规则。\n',
      'utf8',
    )

    await applyWritingStyle(root, SAMPLE_PROFILE, { scopes: { writer: true, headline: true } })

    const managedHeadline = await readFile(join(skillsDir, 'headline.md'), 'utf8')
    const updatedHeadline = replaceInsightsSection(managedHeadline, '## 数据复盘规则\n\n- 2026-11-20 最新复盘规则：A 钩子高 45%。')
    await writeFile(join(skillsDir, 'headline.md'), updatedHeadline, 'utf8')

    const restoredDefault = await restoreDefaultStyle(root, { restoreBackup: false })
    assert.equal(restoredDefault.state.active, false)
    assert.deepEqual(restoredDefault.state.scopes, { writer: false, headline: false })
    assert.equal(restoredDefault.preservedInsights, true)
    const headlineAfterDefault = await readFile(join(skillsDir, 'headline.md'), 'utf8')
    assert.doesNotMatch(headlineAfterDefault, new RegExp(MANAGED_MARKER))
    assert.match(headlineAfterDefault, /2026-11-20 最新复盘规则：A 钩子高 45%/)

    await applyWritingStyle(root, SAMPLE_PROFILE, { scopes: { writer: true, headline: true } })
    const managed2 = await readFile(join(skillsDir, 'headline.md'), 'utf8')
    await writeFile(
      join(skillsDir, 'headline.md'),
      replaceInsightsSection(managed2, '## 数据复盘规则\n\n- 2026-11-21 二次更新复盘规则。'),
      'utf8',
    )
    const restoredBak = await restoreDefaultStyle(root, { restoreBackup: true })
    assert.equal(restoredBak.state.active, false)
    assert.ok(restoredBak.restored.includes('headline'))
    const headlineAfterBak = await readFile(join(skillsDir, 'headline.md'), 'utf8')
    assert.match(headlineAfterBak, /# 老手写标题规则/)
    assert.match(headlineAfterBak, /2026-11-21 二次更新复盘规则/)
    assert.doesNotMatch(headlineAfterBak, /旧复盘规则/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

function mockCtx(replyText) {
  const llm = {
    prepareCall: async () => ({
      config: {},
      async *stream() {
        yield { type: 'text-delta', text: replyText }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }),
  }
  const services = {
    llm,
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
  }
  return { get: name => services[name] ?? null }
}

test('analyzeWritingStyle parses fenced JSON response and handles invalid LLM output', async () => {
  const samples = [
    { title: '实战复盘1', text: '前两天我把自己的工作流重新拆了一遍，发现真正拖慢节奏的从来不是写字本身，而是每次打开文档都要重新找状态。' },
  ]
  const okCtx = mockCtx('```json\n' + JSON.stringify(SAMPLE_PROFILE) + '\n```')
  const result = await analyzeWritingStyle(okCtx, samples, { userNote: '更像聊天' })
  assert.equal(result.profile.name, '我的口语实战风')
  assert.equal(result.profile.userNote, '更像聊天')
  assert.equal(result.meta.sampleCount, 1)
  assert.deepEqual(result.meta.sampleTitles, ['实战复盘1'])

  const badCtx = mockCtx('这里没有 JSON，只有一段普通废话')
  await assert.rejects(
    () => analyzeWritingStyle(badCtx, samples),
    err => err.status === 502 && /模型没有返回可用的风格分析结果/.test(err.message),
  )
})

test('previewWritingStyle enforces 3 non-empty titles and defaults blank topic', async () => {
  const okCtx = mockCtx(JSON.stringify({
    opening: '前两天我算了一笔账，很多人花在挑工具上的时间，早就够把活干完两遍了。',
    titles: ['标题一：先算时间账', '标题二：别被工具牵着走', '标题三：半小时跑通的笨办法', '多余的第四个标题'],
  }))
  const res = await previewWritingStyle(okCtx, SAMPLE_PROFILE, '   ')
  assert.equal(res.topic, 'AI 工具真能帮普通人省时间吗？')
  assert.match(res.opening, /前两天我算了一笔账/)
  assert.equal(res.titles.length, 3)

  const tooFewCtx = mockCtx(JSON.stringify({
    opening: '一段正常开头',
    titles: ['只有一个标题'],
  }))
  await assert.rejects(
    () => previewWritingStyle(tooFewCtx, SAMPLE_PROFILE, '测试选题'),
    err => err.status === 502 && /模型没有给出 3 个可用标题/.test(err.message),
  )
})

test('host routes: empty workspace GET style/profile, analyze, render, preview, apply, restore, and hasPersonalStyle', async () => {
  const { route } = await import('../src/host.js')
  const { Store } = await import('../src/store.js')
  const { createArticle } = await import('../src/article.js')

  const root = await mkdtemp(join(tmpdir(), 'ws-style-host-'))
  try {
    const store = new Store(root)
    let replyQueue = []
    const llm = {
      prepareCall: async () => ({
        config: {},
        async *stream() {
          const text = replyQueue.shift() ?? '{}'
          yield { type: 'text-delta', text }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }),
    }
    const services = { llm, agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) } }
    const deps = { ctx: { get: name => services[name] ?? null }, store, pipeline: { job: () => null } }

    const call = async (path, payload) => {
      const req = {
        url: '/wechat-studio/' + path,
        method: payload ? 'POST' : 'GET',
        async *[Symbol.asyncIterator]() {
          if (payload) yield Buffer.from(JSON.stringify(payload))
        },
      }
      let status = 200
      let body
      await route(deps, req, {
        set statusCode(code) { status = code },
        get statusCode() { return status },
        setHeader() {},
        end(value) { body = JSON.parse(value) },
      })
      return { status, body }
    }

    // 1. Empty workspace GET style/profile must return 200 (not 404 文章不存在)
    const emptyProfile = await call('style/profile')
    assert.equal(emptyProfile.status, 200)
    assert.equal(emptyProfile.body.active, false)
    assert.equal(emptyProfile.body.profile, null)

    const initialState = await call('state')
    assert.equal(initialState.status, 200)
    assert.equal(initialState.body.hasPersonalStyle, false)

    // 2. Add one active article and one archived article, then POST style/analyze
    const activeArticle = createArticle({
      markdown: '# 我的旧文章\n\n这是一篇真实的过往文章，用来测试后端接口从馆藏稿件里读取正文并做风格分析。',
    })
    const archivedArticle = createArticle({
      markdown: '# 归档文章\n\n归档文章不应该被接口选入风格分析样本里。',
    })
    archivedArticle.archivedAt = '2026-11-01T00:00:00Z'
    await store.update(state => {
      state.articles.push(activeArticle, archivedArticle)
      state.currentId = activeArticle.id
    })

    replyQueue.push(JSON.stringify(SAMPLE_PROFILE))
    const analyzed = await call('style/analyze', {
      articleIds: [activeArticle.id, archivedArticle.id],
      pasted: [{ title: '粘贴样本', text: '这是用户随手粘贴进来的一篇补充样本，字数也足够多，用来验证混合来源分析。' }],
      userNote: '自然克制',
    })
    assert.equal(analyzed.status, 200)
    assert.equal(analyzed.body.meta.sampleCount, 2)
    assert.match(analyzed.body.previewMarkdown.writer, new RegExp(MANAGED_MARKER))
    assert.match(analyzed.body.previewMarkdown.headline, new RegExp(MANAGED_MARKER))

    // 3. POST style/render reflects edited profile immediately without LLM
    const edited = { ...analyzed.body.profile, summary: '编辑后的最新定位' }
    const rendered = await call('style/render', { profile: edited })
    assert.equal(rendered.status, 200)
    assert.match(rendered.body.previewMarkdown.writer, /编辑后的最新定位/)

    // 4. POST style/preview returns 3 titles + fresh previewMarkdown
    replyQueue.push(JSON.stringify({
      opening: '这是现场试写的开头段落。',
      titles: ['试写标题1', '试写标题2', '试写标题3'],
    }))
    const previewed = await call('style/preview', { profile: edited, topic: '测试选题' })
    assert.equal(previewed.status, 200)
    assert.equal(previewed.body.titles.length, 3)
    assert.match(previewed.body.previewMarkdown.writer, /编辑后的最新定位/)

    // 5. POST style/apply -> hasPersonalStyle becomes true & skills show user override
    const applied = await call('style/apply', {
      profile: edited,
      scopes: { writer: true, headline: true },
      sampleTitles: analyzed.body.meta.sampleTitles,
    })
    assert.equal(applied.status, 200)
    assert.equal(applied.body.state.active, true)
    assert.equal(applied.body.skills.find(s => s.name === 'writer')?.source, 'user')
    assert.equal((await call('state')).body.hasPersonalStyle, true)

    // 6. POST style/restore -> back to bundled default & hasPersonalStyle false
    const restored = await call('style/restore', { restoreBackup: false })
    assert.equal(restored.status, 200)
    assert.equal(restored.body.state.active, false)
    assert.equal(restored.body.skills.find(s => s.name === 'writer')?.source, 'bundled')
    const afterRestoreState = (await call('state')).body
    assert.equal(afterRestoreState.hasPersonalStyle, false)
    assert.deepEqual(afterRestoreState.personalStyleScopes, { writer: false, headline: false })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('restoreDefaultStyle backs up hand-edited managed writer.md and headline.md and supports backup restore from default state', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ws-style-restore-drift-'))
  try {
    const skillsDir = join(root, 'skills')
    await mkdir(skillsDir, { recursive: true })
    await writeFile(join(skillsDir, 'writer.md'), '# 原始手写 writer\n', 'utf8')

    await applyWritingStyle(root, SAMPLE_PROFILE, { scopes: { writer: true, headline: true } })

    const w = await readFile(join(skillsDir, 'writer.md'), 'utf8')
    await writeFile(join(skillsDir, 'writer.md'), `${w}\n- 恢复前手加的正文规则\n`, 'utf8')
    const h = await readFile(join(skillsDir, 'headline.md'), 'utf8')
    await writeFile(join(skillsDir, 'headline.md'), `${h}\n- 恢复前手加的标题规则\n`, 'utf8')

    const res = await restoreDefaultStyle(root, { restoreBackup: false })
    assert.equal(res.state.active, false)
    assert.ok(res.backedUp.some(f => f.startsWith('writer.md.bak.')), `expected writer timestamp backup, got ${res.backedUp}`)
    assert.ok(res.backedUp.some(f => f === 'headline.md.bak'), `expected headline backup, got ${res.backedUp}`)

    const fromDefault = await restoreDefaultStyle(root, { restoreBackup: true })
    assert.ok(fromDefault.restored.includes('writer'))
    assert.equal(await readFile(join(skillsDir, 'writer.md'), 'utf8'), '# 原始手写 writer\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('applyWritingStyle backs up and deactivates a hand-edited managed scope when unchecked', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ws-style-uncheck-drift-'))
  try {
    const skillsDir = join(root, 'skills')
    await applyWritingStyle(root, SAMPLE_PROFILE, { scopes: { writer: true, headline: true } })
    const h = await readFile(join(skillsDir, 'headline.md'), 'utf8')
    await writeFile(join(skillsDir, 'headline.md'), `${h}\n- 用户手改标题规则\n`, 'utf8')

    const res = await applyWritingStyle(root, SAMPLE_PROFILE, { scopes: { writer: true, headline: false } })
    assert.deepEqual(res.state.scopes, { writer: true, headline: false })
    assert.ok(res.removed.includes('headline'))
    assert.ok(res.backedUp.some(f => f.startsWith('headline.md.bak')), `expected backup for drifted unchecked headline, got ${res.backedUp}`)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('analyzeWritingStyle discards hallucinated excerpts not present in samples and falls back to real sample text', async () => {
  const samples = [
    {
      title: '真实样本',
      text: '今天下午我把整个发布流程重新跑了一遍，发现最耗时间的根本不是写代码，而是每次都要手动改配置。\n\n后来我干脆把这些重复步骤全写进脚本里，十秒钟就能跑完，心里踏实多了。',
    },
  ]
  const fakeReply = {
    ...SAMPLE_PROFILE,
    excerpts: ['这是一句模型自己编出来的假原话，原文里根本没有出现过。'],
  }
  const res = await analyzeWritingStyle(mockCtx(JSON.stringify(fakeReply)), samples)
  assert.ok(res.profile.excerpts.length >= 1)
  assert.ok(res.profile.excerpts.every(e => !e.includes('模型自己编出来的假原话')))
  assert.ok(res.profile.excerpts.some(e => e.includes('今天下午我把整个发布流程重新跑了一遍')))
})

test('analyzeWritingStyle and previewWritingStyle forward AbortSignal to callModel', async () => {
  const seenSignals = []
  const llm = {
    prepareCall: async (_opts, signal) => {
      seenSignals.push(signal)
      return {
        config: {},
        async *stream() {
          yield {
            type: 'text-delta',
            text: seenSignals.length === 1
              ? JSON.stringify(SAMPLE_PROFILE)
              : JSON.stringify({ opening: '试写开头', titles: ['标1', '标2', '标3'] }),
          }
          yield { type: 'finish', reason: { kind: 'stop' } }
        },
      }
    },
  }
  const services = { llm, agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) } }
  const ctx = { get: name => services[name] ?? null }

  const c1 = new AbortController()
  await analyzeWritingStyle(ctx, [{ title: '样本', text: '这是一段用于验证中断信号透传到后端模型调用的中文测试正文，字数超过三十个字确保能顺利通过清洗检查。' }], { signal: c1.signal })
  const c2 = new AbortController()
  await previewWritingStyle(ctx, SAMPLE_PROFILE, '测试', { signal: c2.signal })

  assert.equal(seenSignals[0], c1.signal)
  assert.equal(seenSignals[1], c2.signal)
})
