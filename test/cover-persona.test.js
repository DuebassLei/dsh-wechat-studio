import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { COVER_SKILL_DIR } from '../src/ai.js'
import { DEFAULT_PERSONA, fillPersona, isPersonSegmentSlot, normalizePersona, PERSON_SEGMENTS, personaFragments, usedPersonaKeys } from '../src/cover-persona.js'
import { coverPrompt, findBlocked, loadCoverBlocklist } from '../src/cover-prompt.js'

test('normalizePersona：非法值回落默认，文本裁剪长度', () => {
  assert.deepEqual(normalizePersona(undefined), DEFAULT_PERSONA)
  assert.deepEqual(normalizePersona({ gender: 'x', outfit: 'y' }), DEFAULT_PERSONA)
  const p = normalizePersona({ gender: 'female', outfit: 'custom', outfitText: ` ${'衣'.repeat(400)} `, appearance: '短发'.repeat(100) })
  assert.equal(p.gender, 'female')
  assert.equal(p.outfit, 'custom')
  assert.equal(p.outfitText.length, 300)
  assert.equal(p.appearance.length, 120)
})

test('有参考图 + 沿用参考图衣服：只保留照片服装，不夹带 T 恤等兜底词', () => {
  const male = personaFragments({ gender: 'male', outfit: 'photo' }, { hasReference: true })
  assert.match(male.SUBJECT, /matching the reference image/)
  assert.match(male.SUBJECT, /apparent age and facial features/)
  assert.match(male.SUBJECT, /do not add glasses/)
  assert.match(male.OUTFIT, /exact same outfit .* reference image/)
  assert.ok(!/T-shirt|knit top|charcoal/i.test(male.OUTFIT))
  assert.match(male.服装, /与参考图完全一致的同一套衣服/)
  assert.ok(!/T 恤|针织上衣|深炭灰/.test(male.服装))
})

test('有参考图 + 简约纯色上衣（头像场景）：按性别配纯色上衣，不提参考图服装', () => {
  const male = personaFragments({ gender: 'male', outfit: 'simple' }, { hasReference: true })
  assert.match(male.OUTFIT, /crew-neck short-sleeve T-shirt/)
  assert.ok(!/reference image/.test(male.OUTFIT))
  assert.match(male.服装, /圆领短袖 T 恤/)
  const female = personaFragments({ gender: 'female', outfit: 'simple' }, { hasReference: true })
  assert.match(female.OUTFIT, /knit top/)
  assert.match(female.服装, /针织上衣/)
  const auto = personaFragments({ gender: 'auto', outfit: 'simple' }, { hasReference: true })
  assert.match(auto.OUTFIT, /suits the person/)
})

test('自定义服装：不管有没有参考图都用用户描述', () => {
  const polo = 'an oversized Midnight Green (#004953) waffle-knit polo'
  for (const hasReference of [true, false]) {
    const f = personaFragments({ outfit: 'custom', outfitText: polo }, { hasReference })
    assert.equal(f.OUTFIT, polo)
    assert.equal(f.服装, polo)
    assert.ok(!/reference image/.test(f.OUTFIT))
  }
})

test('无参考图：按性别和外貌补充描述人物，不提参考图', () => {
  const f = personaFragments({ gender: 'female', appearance: '齐肩黑发，圆框眼镜' }, { hasReference: false })
  assert.ok(!/reference/.test(f.SUBJECT + f.OUTFIT))
  assert.match(f.SUBJECT, /ordinary-looking woman/)
  assert.match(f.SUBJECT, /齐肩黑发，圆框眼镜/)
  assert.match(f.人物, /女性/)
  assert.match(f.玩偶, /女性/)
  assert.match(f.玩偶, /齐肩黑发/)
  assert.match(f.玩偶, /针织上衣/)
})

test('fillPersona：只替换宿主占位符，不动 LLM 占位符和其他方括号', () => {
  const f = personaFragments({ gender: 'male' }, { hasReference: false })
  const out = fillPersona('- [[SUBJECT]]\n- Wearing [[OUTFIT]]\n人物穿[[服装]]，[[人物]]，[[玩偶]] [[OTHER]] {{槽}}', f)
  assert.ok(!out.includes('[[SUBJECT]]') && !out.includes('[[服装]]') && !out.includes('[[玩偶]]'))
  assert.ok(out.includes('[[OTHER]]'))
  assert.ok(out.includes('{{槽}}'))
})

test('usedPersonaKeys 与人物段枚举', () => {
  assert.deepEqual(usedPersonaKeys('- [[SUBJECT]] [[OUTFIT]] [[SUBJECT]]'), ['SUBJECT', 'OUTFIT'])
  assert.deepEqual(Object.keys(PERSON_SEGMENTS), ['无人物', '玩偶'])
  assert.ok(PERSON_SEGMENTS.玩偶.includes('[[玩偶]]'))
  assert.ok(isPersonSegmentSlot('人物段:只填「无人物」或「玩偶」'))
  assert.ok(!isPersonSegmentSlot('毛毡场景'))
})

const fakeCtx = values => {
  const llm = { prepareCall: async () => ({ config: {}, async *stream() { yield { type: 'text-delta', text: JSON.stringify({ values }) }; yield { type: 'finish', reason: { kind: 'stop' } } } }) }
  const services = { llm, agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) } }
  return { get: name => services[name] ?? null }
}

// 按模板实际槽位造值；人物段填指定的枚举
async function slotValues(file, segment = '无人物') {
  const body = (await readFile(join(COVER_SKILL_DIR, `references/${file}`), 'utf8')).match(/^\x60{3}[^\n]*\n([\s\S]*?)^\x60{3}[ \t]*$/m)[1]
  return [...body.matchAll(/\{\{([^{}]+)\}\}/g)].map(match => (match[1].startsWith('人物段') ? segment : '封面示例'))
}

test('coverPrompt：宿主占位符在 LLM 填完后替换', async () => {
  const values = await slotValues('prompt_template.md')
  const prompt = await coverPrompt(fakeCtx(values), '标题', '正文', 'classic', { outfit: 'custom', outfitText: 'a beige linen shirt' }, { hasReference: true })
  assert.ok(prompt.includes('a beige linen shirt'))
  assert.match(prompt, /matching the reference image/)
  assert.ok(!/\[\[/.test(prompt))
})

test('coverPrompt：只校验这次用到的人物片段', async () => {
  const values = await slotValues('prompt_template.md')
  const persona = { appearance: 'excited eyes' }
  const withPhoto = await coverPrompt(fakeCtx(values), '标题', '正文', 'classic', persona, { hasReference: true })
  assert.ok(!withPhoto.includes('excited'), '有参考图时 appearance 用不到，不该拦')
  await assert.rejects(
    coverPrompt(fakeCtx(values), '标题', '正文', 'classic', persona, { hasReference: false }),
    /人物描述含禁用词「excited」/,
  )
})

test('coverPrompt：felt 人物段由宿主展开，玩偶描述不会丢', async () => {
  const persona = { gender: 'male', outfit: 'custom', outfitText: '藏青色牛仔衬衫', appearance: '短黑发' }
  const doll = await coverPrompt(fakeCtx(await slotValues('prompt_template_felt.md', '玩偶')), '标题', '正文', 'felt', persona)
  assert.match(doll, /羊毛毡手工玩偶：男性创作者形象，短黑发，穿藏青色牛仔衬衫/)
  const empty = await coverPrompt(fakeCtx(await slotValues('prompt_template_felt.md', '无人物')), '标题', '正文', 'felt', persona)
  assert.match(empty, /场景中没有人物/)
  assert.ok(!empty.includes('藏青色牛仔衬衫'))
  await assert.rejects(
    coverPrompt(fakeCtx(await slotValues('prompt_template_felt.md', '一个戴眼镜的玩偶')), '标题', '正文', 'felt', persona),
    /人物段只能填/,
  )
})

test('兜底服装和人物句本身不含禁用词', async () => {
  const terms = await loadCoverBlocklist()
  for (const gender of ['auto', 'male', 'female']) {
    for (const hasReference of [true, false]) {
      for (const value of Object.values(personaFragments({ gender }, { hasReference }))) assert.equal(findBlocked(terms, value), undefined, value)
    }
  }
})
