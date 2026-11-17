const feishuHost = 'internal-api-drive-stream.feishu.cn'
const feishuPath = '/space/api/box/stream/download/authcode/'

function isFeishuImage(value) {
  try {
    const url = new URL(value)
    return url.origin === `https://${feishuHost}` && !url.username && !url.password &&
      url.pathname === feishuPath && Boolean(url.searchParams.get('code'))
  } catch {
    return false
  }
}

function imageMatches(markdown) {
  // Keep code examples untouched; only replace inline Markdown image destinations.
  const pattern = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[\x60~]*[ \t]*\r?$|(?![\s\S]))|(`+)[^\n]*?\2|\\[^\n]|(!\[(?:\\.|[^\]\\])*\]\(<?)([^\s>)]+)(>?(?:[ \t]+"[^"\n]*")?\))/gm
  return [...markdown.matchAll(pattern)].filter(match => match[4])
}

export function markdownImageDestinations(text) {
  return imageMatches(String(text ?? '')).map(match => ({
    src: match[4],
    caption: match[3].slice(2, match[3].lastIndexOf('](')).replace(/\\([\\\[\]])/g, '$1'),
  }))
}

export function feishuImageUrls(blocks) {
  return [...new Set(blocks.flatMap(block => imageMatches(block.text).map(match => match[4]).filter(isFeishuImage)))]
}

export function replaceFeishuImages(markdown, replacements) {
  let out = ''
  let cursor = 0
  for (const match of imageMatches(markdown)) {
    if (!replacements.has(match[4])) continue
    const start = match.index + match[3].length
    out += markdown.slice(cursor, start) + replacements.get(match[4])
    cursor = start + match[4].length
  }
  return out + markdown.slice(cursor)
}

export function countMarkdownImages(blocks) {
  return blocks.reduce((count, text) => count + imageMatches(text).length, 0)
}
