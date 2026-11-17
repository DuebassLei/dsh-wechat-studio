import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { skillSources } from '../src/ai.js'
import { assertSvgCardFragment, renderLayout, renderSvgCard } from '../src/layout.js'
import { normalizeSvgCard, serializeSvgCard } from '../src/svg-cards.js'

function articleBody(page, style = 'std') {
  const match = page.match(/const D=(.*);\nconst G=/s)
  assert.ok(match, '排版页应包含正文数据')
  return JSON.parse(match[1]).styles[style]
}

const EXAMPLES = [
  ['svg-concept', '什么是 Personal Agent', '一个记得你、会主动找你的 AI\n以前的 AI | 你问一句 | 它答一句\nPersonal Agent | 记住你的习惯 | 替你盯着事 | 到点主动找你\n! 关键差别：不用每次重新交代\n> 交代一次，它一直记着', '主动找你'],
  ['svg-steps', '三步完成初剪', '打开首页 | 点「口播剪辑」\n引用素材 | 用 @ 选上一个项目\n直接发送 | 预填要求不用改', '口播剪辑'],
  ['svg-breakdown', '把提示词拆开', '角色 | 你是公众号编辑\n任务 | 把长文改成口播稿\n★ 限制 | 不新增事实', '不新增事实'],
  ['svg-compare', '以前和现在', '以前 | 现在\n手动复制 | 一键排版\n反复检查 | 自动自查', '一键排版'],
  ['svg-table', '工具分工表', '| 工具 | 用途 |\n| --- | --- |\n| 稿面 | 写正文 |\n| ★ 排版 | 输出卡片 |', '输出卡片'],
  ['svg-bars', '写稿时间对比', '初稿 | 40 | 40 分钟\n现在 | 10 | 10 分钟', '40 分钟'],
  ['svg-timeline', '一周写作节奏', '周一 | 找选题\n周三 | 写初稿\n周五 | 发布复盘', '发布复盘'],
  ['svg-phone', '按规则演示提醒', '按我交代的规则演示\n到点提醒 | 06:00 | 该写稿了\n没回就催 | 14:30 | 还没打卡，再提醒一次\n打卡 | 我 | 已完成', '还没打卡，再提醒'],
]

for (const [kind, title, body, expected] of EXAMPLES) {
  test(`候选校验与整篇排版：${kind} 渲染为安全 SMIL 动画卡`, async () => {
    const card = normalizeSvgCard({ kind, title, lines: body.split('\n') }, { sourceText: body })
    const { html: single } = await renderSvgCard(card, { style: 'neo', theme: 'blue' })
    assert.match(single, /<svg/)
    assert.ok(single.includes(title) && single.includes(expected))
    const { html: page, report } = await renderLayout(`# 动画卡测试\n\n${serializeSvgCard(card)}\n`, { style: 'neo', theme: 'blue' })
    const svg = articleBody(page, 'neo').match(/<svg[\s\S]*?<\/svg>/)?.[0]
    assert.ok(svg, '应输出 SVG 卡片')
    assert.match(svg, /<(?:animate|animateTransform|set)\b/)
    assert.ok(svg.includes(title), '应保留卡片标题')
    assert.ok(svg.includes(expected), '应保留卡片正文')
    assert.doesNotMatch(svg, /\s(?:id|class)="|<style|<script|Gradient/)
    assert.doesNotMatch(report, /内容格式不对/)
  })
}

test('整篇排版：标题和条目按文本转义', async () => {
  const { html: page } = await renderLayout('# 转义测试\n\n```svg-bars 数据 <对比> & 实录\n初稿 <旧> | 40 | 40 分钟\n现在 & 新 | 10 | 10 分钟\n```\n', { style: 'std', theme: 'orange' })
  const svg = articleBody(page).match(/<svg[\s\S]*?<\/svg>/)?.[0]
  assert.ok(svg.includes('数据 &lt;对比&gt; &amp; 实录'))
  assert.ok(svg.includes('初稿 &lt;旧&gt;'))
  assert.ok(svg.includes('现在 &amp; 新'))
  assert.doesNotMatch(svg, /<旧>|<对比>/)
})

test('整篇排版：错误示例退回代码框并给出明确自查提示', async () => {
  const { html: page, report } = await renderLayout('# 错误示例\n\n```svg-table 空表格\n| --- | --- |\n```\n')
  assert.match(report, /svg-table「空表格」的内容格式不对/)
  assert.match(report, /普通代码框/)
  assert.match(articleBody(page), /\| --- \| --- \|/)
  assert.match(articleBody(page), /background:#0B0B0C/)
})

test('单卡渲染：普通代码框回退视为失败', async () => {
  await assert.rejects(
    renderSvgCard({ kind: 'svg-table', title: '空表格', lines: ['| --- | --- |'] }, { style: 'neo', theme: 'blue' }),
    /卡片格式无法渲染/,
  )
})

test('单卡渲染：拒绝上传式 SVG、外部引用、脚本和额外属性', () => {
  const valid = '<section><svg xmlns="http://www.w3.org/2000/svg"><animate attributeName="opacity" values="0;1" dur="1s" repeatCount="indefinite"/></svg></section>'
  assert.equal(assertSvgCardFragment(valid), valid)
  assert.throws(() => assertSvgCardFragment(valid.replace('<animate', '<image href="https://example.com/a.png"/><animate')), /外部引用|不支持/)
  assert.throws(() => assertSvgCardFragment(valid.replace('<animate', '<script>alert(1)</script><animate')), /脚本|不支持/)
  assert.throws(() => assertSvgCardFragment(valid.replace('<svg ', '<svg onload="alert(1)" ')), /脚本|不支持/)
  assert.throws(() => assertSvgCardFragment(valid.replace('<animate', '<video/><animate')), /不支持的元素/)
})

test('技能登记：公众号动画卡片进入技能页数据来源', async () => {
  const skills = await skillSources()
  const card = skills.find(item => item.name === 'wechat-svg-cards')
  assert.equal(card.source, 'bundled')
  assert.equal(card.displayPath, 'wechat-svg-cards/SKILL.md')
  assert.ok(card.chars > 0)
})

test('技能来源：复制脚本哈希与上游记录一致', async () => {
  const provenance = JSON.parse(await readFile(new URL('../skills/wechat-svg-cards.upstream.json', import.meta.url), 'utf8'))
  assert.match(provenance.commit, /^[0-9a-f]{40}$/)
  const script = await readFile(new URL('../skills/wechat-svg-cards/scripts/layout.py', import.meta.url))
  assert.equal(createHash('sha256').update(script).digest('hex'), provenance.layoutSha256)
})
