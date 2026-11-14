export const emphasisFormats = [
  { id: 'bold', label: '荧光笔加粗', symbol: 'B', marker: '**' },
  { id: 'highlight', label: '色块强调', symbol: '色', marker: '==' },
  { id: 'underline', label: '主题色下划线', symbol: 'U', marker: '++' },
]

export const insertFormats = [
  { label: '引用与提示', items: [
    ['quote', '引用卡'], ['QUOTE', '金句卡'], ['TIP', '小技巧'],
    ['WARN', '注意'], ['NOTE', '说明'], ['TLDR', '省流版'],
  ] },
  { label: '代码与提示词', items: [
    ['bash', '终端 · bash'], ['text', '终端 · text'],
    ['prompt', '长提示词 · 黑标签'], ['promptbox', '长提示词 · 虚线框'],
  ] },
  { label: '图片与分隔', items: [['image', '图片与图注'], ['long', '长图卡'], ['rule', '分隔线']] },
]

export function cardMarkdown(id, title, value) {
  const label = title.trim().replace(/[\r\n\[\]]/g, ' ')
  const content = value.trim()
  if (id === 'image' || id === 'long') {
    let url
    try { url = new URL(content) } catch { throw new Error('请输入有效的图片地址。') }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('请输入有效的 HTTP 或 HTTPS 图片地址。')
    return '![' + label + '](<' + url.href.replaceAll(')', '%29').replaceAll('>', '%3E') + '>' + (id === 'long' ? ' "long"' : '') + ')'
  }
  if (!content) throw new Error('请填写提示词内容。')
  const fence = /^\s*`{3}/m.test(content) ? '~~~' : '```'
  if (fence === '~~~' && /^\s*~{3}/m.test(content)) throw new Error('提示词同时包含两种代码围栏，请移除其中一种围栏后再插入。')
  return fence + id + ' ' + (label || (id === 'prompt' ? '提示词.txt' : '提示词')) + '\n' + content + '\n' + fence
}

export function formatSelection(text, start, end, id, card) {
  const before = text.slice(0, start)
  const after = text.slice(end)
  const selection = text.slice(start, end)
  const inline = emphasisFormats.find(item => item.id === id)
  let body, from, to
  if (card !== undefined) {
    body = card
    from = to = body.length
  } else if (inline) {
    const content = selection || '文字'
    const pieces = content.split('\n').map(line => line.replace(/^(\s*)(\S(?:.*\S)?)(\s*)$/, (_, left, core, right) =>
      left + inline.marker + core + inline.marker + right))
    body = pieces.join('\n')
    from = selection ? 0 : inline.marker.length
    to = selection ? body.length : from + content.length
  } else if (id === 'image' || id === 'long') {
    const isUrl = /^https?:\/\/\S+$/i.test(selection)
    const caption = !isUrl && selection ? selection.replace(/[[\]\r\n]/g, ' ').trim() : '图注'
    const url = isUrl ? selection : '图片地址'
    body = '![' + caption + '](<' + url + '>' + (id === 'long' ? ' "long"' : '') + ')'
    from = isUrl ? 2 : caption.length + 5
    to = from + (isUrl ? caption.length : url.length)
  } else if (id === 'rule') {
    body = '---'
    from = to = body.length
    if (selection) return formatSelection(text, end, end, id)
  } else if (['bash', 'text', 'prompt', 'promptbox'].includes(id)) {
    const header = '```' + id + ({ prompt: ' 提示词.txt', promptbox: ' 标题' }[id] || '') + '\n'
    const content = selection || (id.startsWith('prompt') ? '在这里填写提示词' : '在这里填写命令或输出')
    body = header + content + '\n```'
    from = header.length
    to = from + content.length
  } else {
    const prefix = '> ' + (id === 'quote' ? '' : '[!' + id + '] ')
    const content = selection || '在这里填写内容'
    body = prefix + content.replaceAll('\n', '\n> ')
    from = prefix.length
    to = body.length
  }
  const left = !inline && before.trim() ? before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n' : ''
  const right = !inline && after.trim() ? after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n' : ''
  return { text: before + left + body + right + after, start: start + left.length + from, end: start + left.length + to }
}
