// 封面人物与服装片段生成：由用户设置决定，不写死固定人物或服装。
export const PERSONA_GENDERS = ['auto', 'male', 'female']
export const PERSONA_OUTFITS = ['photo', 'simple', 'custom']
export const DEFAULT_PERSONA = Object.freeze({ gender: 'auto', outfit: 'photo', outfitText: '', appearance: '' })

const text = (value, limit) => (typeof value === 'string' ? value.trim().slice(0, limit) : '')

// 深炭灰在 7 种风格的底色上都有足够对比，classic 的深青底靠模板里的轮廓光分开。
const FALLBACK = {
  en: {
    auto: 'a simple plain casual top that suits the person, such as a plain crew-neck short-sleeve T-shirt in deep charcoal (#2B2B2B), relaxed fit, no logo, no print',
    male: 'a plain heavyweight cotton crew-neck short-sleeve T-shirt in deep charcoal (#2B2B2B), relaxed fit, natural fabric folds, no logo, no print',
    female: 'a simple relaxed-fit round-neck knit top in deep charcoal (#2B2B2B), clean and minimal, natural fabric folds, no logo, no print',
  },
  zh: {
    auto: '一件适合此人的简洁纯色休闲上衣，例如深炭灰（#2B2B2B）圆领短袖 T 恤，宽松版型，无 logo、无印花',
    male: '深炭灰（#2B2B2B）纯棉圆领短袖 T 恤，宽松版型，自然褶皱，无 logo、无印花',
    female: '深炭灰（#2B2B2B）宽松圆领针织上衣，简洁干净，自然褶皱，无 logo、无印花',
  },
}
const PERSON_EN = { auto: 'person', male: 'man', female: 'woman' }
const PERSON_ZH = { auto: '', male: '男性', female: '女性' }

export function normalizePersona(value) {
  const gender = PERSONA_GENDERS.includes(value?.gender) ? value.gender : DEFAULT_PERSONA.gender
  const outfit = PERSONA_OUTFITS.includes(value?.outfit) ? value.outfit : DEFAULT_PERSONA.outfit
  return { gender, outfit, outfitText: text(value?.outfitText, 300), appearance: text(value?.appearance, 120) }
}

/**
 * 生成填进封面模板的人物片段。
 * @param {object} input - 设置里的 persona。
 * @param {{hasReference: boolean}} options - 这次生成有没有带参考图。
 */
export function personaFragments(input, { hasReference }) {
  const p = normalizePersona(input)
  const custom = p.outfit === 'custom' && p.outfitText ? p.outfitText : ''
  const fallbackEn = custom || FALLBACK.en[p.gender]
  const fallbackZh = custom || FALLBACK.zh[p.gender]
  const look = p.appearance ? `, ${p.appearance}` : ''
  const lookZh = p.appearance ? `，${p.appearance}` : ''
  const genderEn = p.gender === 'auto' ? '' : ` (a ${PERSON_EN[p.gender]})`

  const SUBJECT = hasReference
    ? `A person matching the reference image${genderEn}, presented as a content creator; preserve the reference person's apparent age and facial features, hair color, hairstyle, and glasses or other accessories exactly as in the photo (do not add glasses if the person does not wear them)`
    : `An ordinary-looking ${PERSON_EN[p.gender]} who looks like a content creator${look}`
  const 人物 = hasReference
    ? `参考图里的人物${PERSON_ZH[p.gender] ? `（${PERSON_ZH[p.gender]}）` : ''}，保留其外观年龄、面部特征、发色、发型，以及眼镜等配饰（参考图没戴眼镜就不要加）`
    : `一位${PERSON_ZH[p.gender]}内容创作者${lookZh}`
  const usePhotoOutfit = p.outfit === 'photo' && hasReference
  const OUTFIT = custom || (usePhotoOutfit
    ? 'strictly the exact same outfit the person wears in the reference image (matching garment type, sleeve style, collar, color, pattern and fabric exactly; keep the reference outfit unchanged and do not replace it with other clothing)'
    : fallbackEn)
  const 服装 = custom || (usePhotoOutfit
    ? '与参考图完全一致的同一套衣服（款式、袖型、领型、颜色、花纹和面料严格保持不变，不要换成其他衣服）'
    : fallbackZh)
  const 玩偶 = `${PERSON_ZH[p.gender]}创作者形象${lookZh}，穿${fallbackZh}`
  return { SUBJECT, OUTFIT, 人物, 服装, 玩偶 }
}

export const fillPersona = (prompt, fragments) =>
  prompt.replace(/\[\[(SUBJECT|OUTFIT|人物|服装|玩偶)\]\]/g, (_, key) => fragments[key])

export const usedPersonaKeys = prompt =>
  [...new Set([...prompt.matchAll(/\[\[(SUBJECT|OUTFIT|人物|服装|玩偶)\]\]/g)].map(match => match[1]))]

// felt 的人物段只让 LLM 做二选一，正文由宿主给出；让 LLM 抄写整段时它会改写，[[玩偶]] 就丢了。
export const PERSON_SEGMENTS = {
  无人物: '场景中没有人物，只有物件，画面安静，像一张手作桌面的静物照。',
  玩偶: '物件旁站着一个羊毛毡手工玩偶：[[玩偶]]（衣服也是羊毛毡材质），神情沉静专注，带一点微笑，一只手轻触或指向物件。玩偶比例略可爱，头稍大，但材质必须是绒毛羊毛毡，不是真人，不是光滑塑料。',
}
export const isPersonSegmentSlot = name => name.startsWith('人物段')
