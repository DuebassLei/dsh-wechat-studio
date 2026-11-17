import { createHash } from 'node:crypto'
import { newId, snapshot, splitMarkdown, touch } from './article.js'
import { feishuImageUrls, markdownImageDestinations } from './markdown-images.js'
import { parseSvgCardBlock } from './svg-cards.js'

const fail = message => Object.assign(new Error(message), { status: 400 })
const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const isSvg = text => /^```svg-[a-z]+(?:\s|$)/.test(text.trim())

function svgMedia(text, number, blockId) {
  let card
  try {
    card = parseSvgCardBlock(text)
  } catch (error) {
    if (blockId === undefined) throw fail(`第 ${number} 块动画卡无效：${error.message}`)
    const title = text.trim().match(/^```svg-[a-z]+(?:[ \t]+([^\n]+))?/)?.[1] ?? '动画卡'
    return { key: `svg-raw:${text}`, item: { kind: 'svg', blockId, number, title } }
  }
  return {
    key: `svg:${JSON.stringify(card)}`,
    item: { kind: 'svg', blockId, number, title: card.title },
  }
}

function mediaAt(text, number, blockId) {
  if (isSvg(text)) return [svgMedia(text, number, blockId)]
  return markdownImageDestinations(text).map((image, occurrence) => ({
    key: `image:${image.src}`,
    item: { kind: 'image', blockId, number, caption: image.caption, src: image.src, occurrence },
  }))
}

export function planMarkdownReimport(article, markdown, { updateTitle = false } = {}) {
  if (typeof markdown !== 'string') throw fail('Markdown 必须是文本。')
  const parsed = splitMarkdown(markdown.replace(/^\uFEFF/, ''))
  if (!parsed.blocks.length) throw fail('导入文件必须包含正文，只有标题或元信息不能覆盖。')
  if (updateTitle && !parsed.title) throw fail('选择更新标题时，文件必须包含一级标题。')
  if (updateTitle && parsed.title.length > 80) {
    throw fail('一级标题不能超过 80 字；可取消同时更新标题后仅覆盖正文。')
  }

  const sameBody = parsed.blocks.length === article.blocks.length
    && parsed.blocks.every((text, index) => text === article.blocks[index].text)
  const oldFrequencies = new Map()
  const newFrequencies = new Map()
  const oldByText = new Map()
  for (const block of article.blocks) {
    oldFrequencies.set(block.text, (oldFrequencies.get(block.text) ?? 0) + 1)
    oldByText.set(block.text, block)
  }
  for (const text of parsed.blocks) newFrequencies.set(text, (newFrequencies.get(text) ?? 0) + 1)
  const entries = parsed.blocks.map((text, index) => {
    const unique = oldFrequencies.get(text) === 1 && newFrequencies.get(text) === 1
    return { text, existing: sameBody ? article.blocks[index] : unique ? oldByText.get(text) : null }
  })

  const incomingMedia = new Map()
  parsed.blocks.forEach((text, index) => {
    for (const media of mediaAt(text, index + 1)) {
      incomingMedia.set(media.key, (incomingMedia.get(media.key) ?? 0) + 1)
    }
  })
  const removedMedia = []
  article.blocks.forEach((block, index) => {
    for (const media of mediaAt(block.text, index + 1, block.id)) {
      const remaining = incomingMedia.get(media.key) ?? 0
      if (remaining > 0) incomingMedia.set(media.key, remaining - 1)
      else removedMedia.push(media.item)
    }
  })

  const finalTitle = updateTitle ? parsed.title : article.title
  const changed = !sameBody || finalTitle !== article.title
  const kept = entries.filter(entry => entry.existing).length
  const token = sha([
    article.id, article.title, article.summary, article.hook, article.titles,
    article.blocks, article.zhuque, article.archivedAt, article.publishedAt,
    parsed.blocks, parsed.title, updateTitle,
  ])
  return {
    token, title: article.title, finalTitle, incomingTitle: parsed.title,
    changed, bodyChanged: !sameBody, kept, removed: article.blocks.length - kept, added: entries.length - kept,
    entries, removedMedia,
  }
}

export function applyMarkdownReimport(article, plan) {
  const bodyChanged = plan.bodyChanged
  snapshot(article, '重新导入 Markdown')
  article.history.at(-1).reimportBefore = {
    summary: structuredClone(article.summary),
    zhuque: structuredClone(article.zhuque),
    imageImport: structuredClone(article.imageImport),
  }
  if (bodyChanged) {
    article.blocks = plan.entries.map(entry => ({ id: entry.existing?.id ?? newId(), text: entry.text, check: null }))
    article.summary = ''
    article.titles = []
    article.zhuque = { round: 0, lastAt: null }
    article.imageImport = null
  }
  if (plan.finalTitle !== article.title) {
    article.title = plan.finalTitle
    article.hook = null
  }
  touch(article)
  return { article, urls: bodyChanged ? feishuImageUrls(article.blocks) : [] }
}
