import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createArticle } from '../src/article.js'
import { planMarkdownReimport } from '../src/markdown-reimport.js'

const CARD = '```svg-steps 审稿流程\n第一步 | 导入\n第二步 | 检查\n第三步 | 完成\n```'

test('预检处理 BOM、CRLF 和新增开头，唯一原文复用块 ID', () => {
  const article = createArticle({ markdown: '# 旧标题\n\n保留段落\n\n![旧图注](https://example.com/a.png)' })
  const plan = planMarkdownReimport(article, '\uFEFF# 审稿标题\r\n\r\n新增开头\r\n\r\n保留段落\r\n\r\n![新图注](https://example.com/a.png)')
  assert.equal(plan.title, '旧标题')
  assert.equal(plan.finalTitle, '旧标题')
  assert.equal(plan.entries[1].existing.id, article.blocks[0].id)
  assert.equal(plan.kept, 1)
  assert.equal(plan.removed, 1)
  assert.equal(plan.added, 2)
  assert.deepEqual(plan.removedMedia, [])
  assert.equal(plan.changed, true)
})

test('仅标题、front matter 或空正文不能覆盖', () => {
  const article = createArticle({ markdown: '# 标题\n\n正文' })
  for (const markdown of ['# 只有标题', '---\nslug: demo\n---', '', null]) {
    assert.throws(() => planMarkdownReimport(article, markdown), /正文|文本/)
  }
})

test('重复段落不能按文本歧义复用 ID', () => {
  const article = createArticle({ markdown: '# 标题\n\n重复\n\n保留\n\n重复' })
  const plan = planMarkdownReimport(article, '# 标题\n\n新增\n\n重复\n\n保留\n\n重复')
  assert.equal(plan.entries.filter(entry => entry.text === '重复').every(entry => entry.existing === null), true)
  assert.equal(plan.entries.find(entry => entry.text === '保留').existing.text, '保留')
  assert.equal(plan.kept, 1)
  assert.equal(plan.removed, 2)
  assert.equal(plan.added, 3)
})

test('正文完全相同时按原索引复用重复块，front matter 不影响空操作', () => {
  const article = createArticle({ markdown: '# 标题\n\n重复\n\n重复' })
  const plan = planMarkdownReimport(article, '---\nslug: new\n---\n\n# 标题\n\n重复\n\n重复')
  assert.equal(plan.changed, false)
  assert.deepEqual(plan.entries.map(entry => entry.existing.id), article.blocks.map(block => block.id))
  assert.equal(plan.kept, 2)
  assert.equal(plan.removed, 0)
  assert.equal(plan.added, 0)
})

test('顺序变化不是空操作，唯一块仍可跨位置复用', () => {
  const article = createArticle({ markdown: '# 标题\n\n甲\n\n乙' })
  const plan = planMarkdownReimport(article, '# 标题\n\n乙\n\n甲')
  assert.equal(plan.changed, true)
  assert.deepEqual(plan.entries.map(entry => entry.existing.id), [article.blocks[1].id, article.blocks[0].id])
})

test('切换标题选项改变最终标题和确认凭据', () => {
  const article = createArticle({ markdown: '# 旧标题\n\n正文' })
  const bodyOnly = planMarkdownReimport(article, '# 新标题\n\n正文')
  const withTitle = planMarkdownReimport(article, '# 新标题\n\n正文', { updateTitle: true })
  assert.equal(bodyOnly.finalTitle, '旧标题')
  assert.equal(withTitle.finalTitle, '新标题')
  assert.notEqual(bodyOnly.token, withTitle.token)
  assert.equal(bodyOnly.changed, false)
  assert.equal(withTitle.changed, true)
})

test('超过 80 字的标题只在选择更新时阻止', () => {
  const article = createArticle({ markdown: '# 标题\n\n正文' })
  const title = '长'.repeat(81)
  assert.equal(planMarkdownReimport(article, `# ${title}\n\n正文`).changed, false)
  assert.throws(() => planMarkdownReimport(article, `# ${title}\n\n正文`, { updateTitle: true }), /80/)
  assert.throws(() => planMarkdownReimport(article, '正文', { updateTitle: true }), /一级标题/)
})

test('图片只改图注时按 URL 消耗，不报告媒体移出', () => {
  const article = createArticle({ markdown: '# 标题\n\n![旧图注](https://example.com/a.png)' })
  const plan = planMarkdownReimport(article, '# 标题\n\n![新图注](https://example.com/a.png)')
  assert.deepEqual(plan.removedMedia, [])
  assert.equal(plan.kept, 0)
  assert.equal(plan.removed, 1)
  assert.equal(plan.added, 1)
})

test('相同动画卡复用 ID，被移出的动画卡列出标题和旧段号', () => {
  const article = createArticle({ markdown: `# 标题\n\n保留\n\n${CARD}` })
  const kept = planMarkdownReimport(article, `# 标题\n\n新增\n\n保留\n\n${CARD}`)
  assert.equal(kept.entries[2].existing.id, article.blocks[1].id)
  assert.deepEqual(kept.removedMedia, [])
  const removed = planMarkdownReimport(article, '# 标题\n\n保留')
  assert.equal(removed.removedMedia.length, 1)
  assert.deepEqual(removed.removedMedia[0], {
    kind: 'svg', blockId: article.blocks[1].id, number: 2, title: '审稿流程',
  })
})

test('已有无效动画卡也可作为旧媒体报告', () => {
  const invalid = '```svg-steps 坏卡\n只有一行\n```'
  const article = createArticle({ markdown: `# 标题\n\n${invalid}` })
  const plan = planMarkdownReimport(article, '# 标题\n\n正文')
  assert.equal(plan.removedMedia.length, 1)
  assert.equal(plan.removedMedia[0].kind, 'svg')
  assert.equal(plan.removedMedia[0].title, '坏卡')
})

test('新稿无效动画卡报告正文块序号和具体校验错误', () => {
  const article = createArticle({ markdown: '# 标题\n\n正文' })
  assert.throws(
    () => planMarkdownReimport(article, '# 标题\n\n正文\n\n```svg-steps 坏卡\n只有一行\n```'),
    /第 2 块.*3–5 行/,
  )
})

test('行内图片按每次出现计数，同 URL 多图只报告实际移出的数量', () => {
  const url = 'https://example.com/a.png'
  const article = createArticle({ markdown: `图例：![图一](${url}) 和 ![图二](${url})` })
  const plan = planMarkdownReimport(article, `图例：![仍保留一张](${url})`)
  assert.equal(plan.removedMedia.length, 1)
  assert.equal(plan.removedMedia[0].src, url)
  assert.equal(plan.removedMedia[0].occurrence, 1)
  const kept = planMarkdownReimport(article, `图例：![新图注](${url}) 和 ![另一张](${url})`)
  assert.deepEqual(kept.removedMedia, [])
})

test('行内图片支持转义右括号图注，围栏代码示例不算正文图片', () => {
  const url = 'https://example.com/a.png'
  const article = createArticle({ markdown: `正文 ![图\\]注](${url})\n\n\`\`\`md\n![代码示例](${url})\n\`\`\`` })
  const plan = planMarkdownReimport(article, '没有图片')
  assert.equal(plan.removedMedia.length, 1)
  assert.equal(plan.removedMedia[0].caption, '图]注')
})
