// Python 语义的小工具：排版引擎从 Python 迁过来，输出要和原来逐字节一致。
// 数字格式化、四舍五入、转义、JSON 这几处 JS 和 Python 的默认行为不一样。

/** html.escape(s, quote=False) */
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** html.escape(s)，默认 quote=True */
export const escQ = s => esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

// 双精度数的精确十进制展开（toFixed 最多 100 位小数，|x| < 1e21 时够用）
function exactDecimal(x) {
  const s = Math.abs(x).toFixed(100)
  const [int, frac = ''] = s.split('.')
  return { neg: x < 0 || Object.is(x, -0), int, frac: frac.replace(/0+$/, '') }
}

// 按十进制精确值做“四舍六入五成双”，保留 f 位小数，返回不带符号的数字串
function roundDecimal({ int, frac }, f) {
  const digits = (int + frac.padEnd(f, '0').slice(0, f)).split('').map(Number)
  const rest = frac.slice(f)
  let up = false
  if (rest.length) {
    const first = Number(rest[0])
    if (first > 5) up = true
    else if (first === 5) up = /[1-9]/.test(rest.slice(1)) || (digits.length ? digits[digits.length - 1] % 2 === 1 : false)
  }
  if (up) {
    let i = digits.length - 1
    while (i >= 0 && digits[i] === 9) { digits[i] = 0; i-- }
    if (i < 0) digits.unshift(1)
    else digits[i] += 1
  }
  const all = digits.join('') || '0'
  const intLen = all.length - f
  const intPart = (intLen > 0 ? all.slice(0, intLen) : '0').replace(/^0+(?=\d)/, '')
  const fracPart = f ? (intLen >= 0 ? all.slice(intLen) : all.padStart(f, '0')) : ''
  return f ? `${intPart}.${fracPart}` : intPart
}

/** f"{x:.{f}f}" */
export function fixed(x, f) {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf'
  if (Math.abs(x) >= 1e21) return BigInt(Math.round(x)).toString() + (f ? '.' + '0'.repeat(f) : '')
  const d = exactDecimal(x)
  return (d.neg ? '-' : '') + roundDecimal(d, f)
}

/** round(x, n)：Python 3 的银行家舍入；n 省略时返回整数 */
export function round(x, n = 0) {
  if (!Number.isFinite(x) || Math.abs(x) >= 1e21) return x
  const d = exactDecimal(x)
  const v = Number(roundDecimal(d, n))
  return d.neg ? -v : v
}

/** repr(float)：整数值带 .0，指数形式按 Python 的写法 */
export function floatStr(x) {
  if (Number.isNaN(x)) return 'nan'
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf'
  if (x === 0) return Object.is(x, -0) ? '-0.0' : '0.0'
  const [mant, expStr] = x.toExponential().split('e')
  const exp = Number(expStr)
  const neg = mant.startsWith('-')
  const digits = mant.replace(/^-/, '').replace('.', '')
  let out
  if (exp < -4 || exp >= 16) {
    const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits
    out = `${m}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`
  } else if (exp < 0) {
    out = `0.${'0'.repeat(-exp - 1)}${digits}`
  } else if (digits.length <= exp + 1) {
    out = `${digits.padEnd(exp + 1, '0')}.0`
  } else {
    out = `${digits.slice(0, exp + 1)}.${digits.slice(exp + 1)}`
  }
  return (neg ? '-' : '') + out
}

/** f"{n:02d}" 这类补零整数 */
export const pad = (n, width = 2) => (n < 0 ? '-' + String(-n).padStart(width - 1, '0') : String(n).padStart(width, '0'))

/** Python 字符串长度和切片按码点算，JS 按 UTF-16 算 */
export const chars = s => Array.from(String(s))
export const len = s => chars(s).length
export const slice = (s, a, b) => chars(s).slice(a, b).join('')

/** json.dumps(x, ensure_ascii=False)，默认分隔符 ", " 和 ": " */
export function dumps(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (Array.isArray(value)) return `[${value.map(dumps).join(', ')}]`
  return `{${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${dumps(v)}`).join(', ')}}`
}

/** str.strip() / rstrip() / lstrip()：不带参数时按 Python 的空白字符集 */
export const PY_WS = '\t\n\u000b\f\r\u001c\u001d\u001e\u001f \u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000'
export function strip(s, set = PY_WS) {
  const cs = new Set(set)
  const a = chars(s)
  let i = 0, j = a.length
  while (i < j && cs.has(a[i])) i++
  while (j > i && cs.has(a[j - 1])) j--
  return a.slice(i, j).join('')
}
export function rstrip(s, set = PY_WS) {
  const cs = new Set(set)
  const a = chars(s)
  let j = a.length
  while (j > 0 && cs.has(a[j - 1])) j--
  return a.slice(0, j).join('')
}
export function lstrip(s, set = PY_WS) {
  const cs = new Set(set)
  const a = chars(s)
  let i = 0
  while (i < a.length && cs.has(a[i])) i++
  return a.slice(i).join('')
}

/** Python 的异常：名字会出现在提示文字里（type(e).__name__） */
export class PyError extends Error {
  constructor(name, message = '') { super(message); this.name = name }
}

/** list[i]：越界抛 IndexError，负数从末尾数 */
export function ix(list, i) {
  if (list === null || list === undefined) throw new PyError('TypeError', "'NoneType' object is not subscriptable")
  const items = typeof list === 'string' ? chars(list) : list
  const k = i < 0 ? items.length + i : i
  if (k < 0 || k >= items.length) throw new PyError('IndexError', 'index out of range')
  return items[k]
}

/** max() / min()：空序列抛 ValueError，相等时保留第一个 */
export function max(items, key = x => x) {
  if (!items.length) throw new PyError('ValueError', 'max() arg is an empty sequence')
  let best = items[0]
  for (const x of items.slice(1)) if (key(x) > key(best)) best = x
  return best
}
export function min(items, key = x => x) {
  if (!items.length) throw new PyError('ValueError', 'min() arg is an empty sequence')
  let best = items[0]
  for (const x of items.slice(1)) if (key(x) < key(best)) best = x
  return best
}

/** 带类型的数：f 为 true 表示 Python 里是 float */
export const F = v => ({ v, f: true })
export const I = v => ({ v, f: false })

/** CPython 3.12 的 sum()：整数直接加，遇到浮点后用 Neumaier 补偿求和 */
export function sum(items) {
  let acc = 0, i = 0
  for (; i < items.length && !items[i].f; i++) acc += items[i].v
  if (i === items.length) return I(acc)
  let f = acc + items[i].v, c = 0
  for (i++; i < items.length; i++) {
    const x = items[i].v
    if (items[i].f) {
      const t = f + x
      c += Math.abs(f) >= Math.abs(x) ? (f - t) + x : (x - t) + f
      f = t
    } else f += x
  }
  if (c && Number.isFinite(c)) f += c
  return F(f)
}

// Unicode 十进制数字按数值换算（int('１２') 在 Python 里是 12）
function digitValue(ch) {
  let cp = ch.codePointAt(0)
  let start = cp
  while (start > 0 && /\p{Nd}/u.test(String.fromCodePoint(start - 1))) start--
  return (cp - start) % 10
}
function asciiDigits(s) {
  return chars(s).map(c => (/\p{Nd}/u.test(c) ? String(digitValue(c)) : c)).join('')
}

/** int(s) */
export function int(s) {
  const t = asciiDigits(strip(String(s))).replace(/_/g, '')
  if (!/^[+-]?\d+$/.test(t)) throw new PyError('ValueError', `invalid literal for int() with base 10: '${s}'`)
  return Number(t)
}

/** float(s) */
export function float(s) {
  const t = asciiDigits(strip(String(s)))
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) throw new PyError('ValueError', `could not convert string to float: '${s}'`)
  return Number(t)
}

/** s.split(sep, maxsplit) */
export function splitN(s, sep, maxsplit) {
  const parts = s.split(sep)
  return parts.length <= maxsplit + 1 ? parts : [...parts.slice(0, maxsplit), parts.slice(maxsplit).join(sep)]
}

/** s.split() 不带参数 */
export const splitWs = s => strip(s).split(new RegExp(`[${PY_WS}]+`, 'u')).filter(Boolean)

/** str.splitlines() */
export const splitlines = s => {
  const out = String(s).split(/\r\n|[\n\r\u000b\f\u001c\u001d\u001e\u0085\u2028\u2029]/)
  if (out.length && out[out.length - 1] === '') out.pop()
  return out
}

/** str.expandtabs(n) */
export function expandtabs(s, n = 8) {
  let out = '', col = 0
  for (const c of String(s)) {
    if (c === '\t') { const k = n - (col % n); out += ' '.repeat(k); col += k }
    else if (c === '\n' || c === '\r') { out += c; col = 0 }
    else { out += c; col++ }
  }
  return out
}

/** dict.get(k, default)，只认自己的键 */
export const get = (obj, k, d) => (obj && Object.hasOwn(obj, k) ? obj[k] : d)
