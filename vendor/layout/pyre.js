// Python re 的写法和语义翻成 JS 正则：\s \w \d \b 按 Unicode，. 只排除 \n，
// $ 也匹配末尾换行之前，re.M 只认 \n 换行。模式照抄 Python 源码，由这里统一转换。
const SP = '\\t-\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
// SP 的补集，字符类里写 \S 时用
const NSP = '\\0-\\x08\\x0e-\\x1b\\x21-\\x84\\x86-\\x9f\\xa1-\\u167f\\u1681-\\u1fff\\u200b-\\u2027\\u202a-\\u202e\\u2030-\\u205e\\u2060-\\u2fff\\u3001-\\u{10ffff}'
const W = '\\p{L}\\p{N}_'
const SYNTAX = new Set('^$\\.*+?()[]{}|/')

function translate(src, flags) {
  let M = flags.includes('m'), S = flags.includes('s'), I = flags.includes('i')
  const lead = /^\(\?([imsx]+)\)/.exec(src)
  if (lead) {
    M ||= lead[1].includes('m'); S ||= lead[1].includes('s'); I ||= lead[1].includes('i')
    src = src.slice(lead[0].length)
  }
  let out = '', inClass = false, classStart = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    const first = classStart
    classStart = false
    if (ch === '\\') {
      const n = src[++i]
      if (n === 's') out += inClass ? SP : `[${SP}]`
      else if (n === 'S') out += inClass ? NSP : `[^${SP}]`
      else if (n === 'w') out += inClass ? W : `[${W}]`
      else if (n === 'W') {
        if (inClass) throw new Error('不支持字符类里的 \\W')
        out += `[^${W}]`
      } else if (n === 'd') out += '\\p{Nd}'
      else if (n === 'D') out += '\\P{Nd}'
      else if (n === 'b') out += inClass ? '\\x08' : `(?:(?<=[${W}])(?![${W}])|(?<![${W}])(?=[${W}]))`
      else if (n === 'B') out += `(?:(?<=[${W}])(?=[${W}])|(?<![${W}])(?![${W}]))`
      else if (n === 'A') out += '(?<![\\s\\S])'
      else if (n === 'Z') out += '(?![\\s\\S])'
      else if (n === 'x') { out += '\\x' + src.slice(i + 1, i + 3); i += 2 }
      else if (n === 'u') { out += '\\u' + src.slice(i + 1, i + 5); i += 4 }
      else if (/[0-9A-Za-z]/.test(n)) out += '\\' + n
      else out += `\\u{${n.codePointAt(0).toString(16)}}`
      continue
    }
    if (inClass) {
      if (ch === ']' && !first) inClass = false
      out += ch === ']' && first ? '\\]' : ch === '[' ? '\\[' : ch
      if (ch === '^' && first) classStart = true
      continue
    }
    if (ch === '[') { inClass = true; classStart = true; out += ch; continue }
    if (ch === '.') out += S ? '[\\s\\S]' : '[^\\n]'
    else if (ch === '^') out += M ? '(?<![^\\n])' : '(?<![\\s\\S])'
    else if (ch === '$') out += M ? '(?![^\\n])' : '(?=\\n?(?![\\s\\S]))'
    else if (ch === '{') {
      const q = /^\{(\d*)(,(\d*))?\}/.exec(src.slice(i))
      if (q && (q[1] || q[3])) { out += `{${q[1] || 0}${q[2] ? ',' + q[3] : ''}}`; i += q[0].length - 1 }
      else out += '\\{'
    } else if (ch === '}') out += '\\}'
    else if (ch === '(' && src.startsWith('(?P<', i)) { out += '(?<'; i += 3 }
    else if (ch === '(' && src.startsWith('(?P=', i)) {
      const end = src.indexOf(')', i)
      out += `\\k<${src.slice(i + 4, end)}>`; i = end
    } else out += ch
  }
  return { source: out, flags: 'u' + (I ? 'i' : '') }
}

const cache = new Map()
function compiled(pattern, flags, extra) {
  const key = `${flags}\u0000${extra}\u0000${pattern}`
  let re = cache.get(key)
  if (!re) {
    const t = translate(pattern, flags)
    re = new RegExp(t.source, t.flags + extra)
    cache.set(key, re)
  }
  re.lastIndex = 0
  return re
}

/** 编译好的 Python 正则：flags 用 i / m / s */
export class Re {
  constructor(pattern, flags = '') { this.pattern = pattern; this.flags = flags }
  /** re.match：只锚定开头 */
  match(s) { return compiled(this.pattern, this.flags, 'y').exec(s) }
  /** re.search */
  search(s) { return compiled(this.pattern, this.flags, '').exec(s) }
  /** re.sub：repl 是函数（参数是匹配数组）或不含反向引用的字符串 */
  sub(repl, s, count = 0) {
    const fn = typeof repl === 'function' ? (...a) => repl(a.slice(0, -2 - (typeof a[a.length - 1] === 'object' ? 1 : 0))) : () => repl
    if (count === 1) return s.replace(compiled(this.pattern, this.flags, ''), (...a) => fn(...a))
    return s.replace(compiled(this.pattern, this.flags, 'g'), (...a) => fn(...a))
  }
  /** re.findall */
  findall(s) {
    const re = compiled(this.pattern, this.flags, 'g')
    return [...s.matchAll(re)].map(m => (m.length === 1 ? m[0] : m.length === 2 ? m[1] ?? '' : m.slice(1).map(x => x ?? '')))
  }
  /** re.split：分组内容也会放进结果，没参与匹配的分组是 null */
  split(s) {
    return s.split(compiled(this.pattern, this.flags, '')).map(x => x ?? null)
  }
}

export const re = (pattern, flags) => new Re(pattern, flags)
