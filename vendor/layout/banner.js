// 开头横幅生成器，移植自 banner.py（林月半子 · 公众号开头横幅），输出与原脚本逐字节一致。
// 数字格式要照 Python：int 原样输出，float 的整数值带 .0（f"{x}"），所以下面对可能是 float 的数都用 fl() 输出。
import { escQ, fixed, floatStr, round, chars, PyError, PY_WS, F as Fv, I as Iv, sum } from './py.js'

// ---------------- Python 语义 ----------------
const typeName = v => (v === null || v === undefined ? 'NoneType' : Array.isArray(v) ? 'list' : typeof v === 'string' ? 'str'
  : typeof v === 'boolean' ? 'bool' : typeof v === 'number' ? (Number.isInteger(v) && Math.abs(v) < 1e21 ? 'int' : 'float') : 'dict')
const isDict = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const isFloatNum = v => typeof v === 'number' && !(Number.isInteger(v) && Math.abs(v) < 1e21)

/** str(x)，spec 里的值来自 JSON：整数是 int，其余数字是 float */
function pyStr(v) {
  if (typeof v === 'string') return v
  if (v === null || v === undefined) return 'None'
  if (typeof v === 'boolean') return v ? 'True' : 'False'
  if (typeof v === 'number') return isFloatNum(v) ? floatStr(v) : String(v)
  return pyRepr(v)
}
/** str.isprintable() 为假的字符：控制、格式、代理、私用、未分配和各类空白 */
const NON_PRINTABLE = /^[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]$/u
function pyRepr(v) {
  if (typeof v === 'string') {
    const q = v.includes("'") && !v.includes('"') ? '"' : "'"
    let out = ''
    for (const c of v) {
      const cp = c.codePointAt(0)
      if (c === '\\') out += '\\\\'
      else if (c === q) out += '\\' + q
      else if (c === '\n') out += '\\n'
      else if (c === '\r') out += '\\r'
      else if (c === '\t') out += '\\t'
      else if (c !== ' ' && NON_PRINTABLE.test(c)) out += cp <= 0xff ? '\\x' + cp.toString(16).padStart(2, '0') : cp <= 0xffff ? '\\u' + cp.toString(16).padStart(4, '0') : '\\U' + cp.toString(16).padStart(8, '0')
      else out += c
    }
    return q + out + q
  }
  if (Array.isArray(v)) return '[' + v.map(pyRepr).join(', ') + ']'
  if (isDict(v)) return '{' + Object.entries(v).map(([k, x]) => pyRepr(k) + ': ' + pyRepr(x)).join(', ') + '}'
  return pyStr(v)
}
const truthy = v => !(v === null || v === undefined || v === false || v === 0 || v === '' || (Array.isArray(v) && !v.length) || (isDict(v) && !Object.keys(v).length))
const hashable = k => { if (Array.isArray(k) || isDict(k)) throw new PyError('TypeError', `unhashable type: '${typeName(k)}'`) }

/** spec 字典的 d.get(k, default) */
function g(obj, k, d = null) {
  if (!isDict(obj)) throw new PyError('AttributeError', `'${typeName(obj)}' object has no attribute 'get'`)
  hashable(k)
  return typeof k === 'string' && Object.hasOwn(obj, k) ? obj[k] : d
}
/** obj[k]，k 是字符串 */
function sub(obj, k) {
  if (isDict(obj)) {
    hashable(k)
    if (typeof k === 'string' && Object.hasOwn(obj, k)) return obj[k]
    throw new PyError('KeyError', pyRepr(k))
  }
  if (obj === null || obj === undefined || typeof obj === 'number' || typeof obj === 'boolean') throw new PyError('TypeError', `'${typeName(obj)}' object is not subscriptable`)
  if (Array.isArray(obj)) throw new PyError('TypeError', `list indices must be integers or slices, not ${typeName(k)}`)
  throw new PyError('TypeError', `string indices must be integers, not '${typeName(k)}'`)
}
/** 内部常量字典的 d[k] / d.get(k, default) */
function lookup(table, k) {
  hashable(k)
  if (typeof k === 'string' && Object.hasOwn(table, k)) return table[k]
  throw new PyError('KeyError', pyRepr(k))
}
function tget(table, k, d) {
  hashable(k)
  return typeof k === 'string' && Object.hasOwn(table, k) ? table[k] : d
}
/** x[:n]（列表或字符串） */
function head_(v, n) {
  if (Array.isArray(v)) return v.slice(0, n)
  if (typeof v === 'string') return chars(v).slice(0, n)
  if (isDict(v)) throw new PyError('KeyError', `slice(None, ${n}, None)`)
  throw new PyError('TypeError', `'${typeName(v)}' object is not subscriptable`)
}
/** 可迭代：列表、字符串（逐字）、字典（键） */
function iter(v) {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') return chars(v)
  if (isDict(v)) return Object.keys(v)
  throw new PyError('TypeError', `'${typeName(v)}' object is not iterable`)
}
function pyLen(v) {
  if (Array.isArray(v)) return v.length
  if (typeof v === 'string') return chars(v).length
  if (isDict(v)) return Object.keys(v).length
  throw new PyError('TypeError', `object of type '${typeName(v)}' has no len()`)
}
/** a + b，b 来自 spec 时要求是字符串 */
function cat(a, b) {
  if (typeof b !== 'string') throw new PyError('TypeError', `can only concatenate str (not "${typeName(b)}") to str`)
  return a + b
}
/** spec 里拿来做算术的数 */
function num(v, op, other, left = true) {
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  const [a, b] = left ? [typeName(v), other] : [other, typeName(v)]
  throw new PyError('TypeError', `unsupported operand type(s) for ${op}: '${a}' and '${b}'`)
}
/** a / b：除数为 0 时照 Python 抛错 */
function div(a, b, floaty = true) {
  if (b === 0) throw new PyError('ZeroDivisionError', floaty ? 'float division by zero' : 'division by zero')
  return a / b
}
const isNumLike = v => typeof v === 'number' || typeof v === 'boolean'
/** Python 的 a > b */
function pyGt(a, b) {
  if (isNumLike(a) && isNumLike(b)) return Number(a) > Number(b)
  if (typeof a === 'string' && typeof b === 'string') {
    const x = chars(a), y = chars(b)
    for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i].codePointAt(0) > y[i].codePointAt(0)
    return x.length > y.length
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (!(a[i] === b[i] || pyEq(a[i], b[i]))) return pyGt(a[i], b[i])
    return a.length > b.length
  }
  throw new PyError('TypeError', `'>' not supported between instances of '${typeName(a)}' and '${typeName(b)}'`)
}
/** max(f(x) for x in items)，惰性求值，跟 Python 一样边取边比 */
function pyMax(items, f = x => x) {
  if (!items.length) throw new PyError('ValueError', 'max() iterable argument is empty')
  let best = f(items[0])
  for (const x of items.slice(1)) { const v = f(x); if (pyGt(v, best)) best = v }
  return best
}
/** dict(x)：x 是字典或键值对序列 */
function pyDict(x) {
  if (isDict(x)) return { ...x }
  if (typeof x === 'string' || Array.isArray(x)) {
    const out = {}
    iter(x).forEach((el, j) => {
      if (!(typeof el === 'string' || Array.isArray(el) || isDict(el))) throw new PyError('TypeError', `cannot convert dictionary update sequence element #${j} to a sequence`)
      const kv = iter(el)
      if (kv.length !== 2) throw new PyError('ValueError', `dictionary update sequence element #${j} has length ${kv.length}; 2 is required`)
      hashable(kv[0])
      out[pyStr(kv[0])] = kv[1]
    })
    return out
  }
  throw new PyError('TypeError', `'${typeName(x)}' object is not iterable`)
}
/** 带类型的 min / max：{v, f}，相等时取第一个 */
const tmin = (a, b) => (b.v < a.v ? b : a)
const tmax = (a, b) => (b.v > a.v ? b : a)
/** {v, f} 或 number(int) 输出成 Python 的 str */
const S = x => (typeof x === 'object' ? (x.f ? floatStr(x.v) : String(x.v)) : String(x))

class PyRandom { // CPython 的 random.Random（MT19937 + init_by_array）
  constructor(seed) {
    this.mt = new Uint32Array(624)
    this.idx = 624
    this.initByArray([seed >>> 0])
  }
  initGenrand(s) {
    const mt = this.mt
    mt[0] = s >>> 0
    for (let i = 1; i < 624; i++) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30)
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0
    }
    this.idx = 624
  }
  initByArray(key) {
    const mt = this.mt, n = 624
    this.initGenrand(19650218)
    let i = 1, j = 0
    for (let k = Math.max(n, key.length); k; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30)
      mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0
      i++; j++
      if (i >= n) { mt[0] = mt[n - 1]; i = 1 }
      if (j >= key.length) j = 0
    }
    for (let k = n - 1; k; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30)
      mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0
      i++
      if (i >= n) { mt[0] = mt[n - 1]; i = 1 }
    }
    mt[0] = 0x80000000
  }
  genrand() {
    const mt = this.mt, N = 624, M = 397
    if (this.idx >= N) {
      const mag = y => (y & 1 ? 0x9908b0df : 0)
      let kk = 0, y
      for (; kk < N - M; kk++) { y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff); mt[kk] = mt[kk + M] ^ (y >>> 1) ^ mag(y) }
      for (; kk < N - 1; kk++) { y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff); mt[kk] = mt[kk + (M - N)] ^ (y >>> 1) ^ mag(y) }
      y = (mt[N - 1] & 0x80000000) | (mt[0] & 0x7fffffff); mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ mag(y)
      this.idx = 0
    }
    let y = mt[this.idx++]
    y ^= y >>> 11
    y ^= (y << 7) & 0x9d2c5680
    y ^= (y << 15) & 0xefc60000
    y ^= y >>> 18
    return y >>> 0
  }
  random() {
    const a = this.genrand() >>> 5, b = this.genrand() >>> 6
    return (a * 67108864 + b) / 9007199254740992
  }
  uniform(a, b) { return a + (b - a) * this.random() }
}

// ---------------- 横幅 ----------------
const D = 7.0 // 一轮时长（秒）
const W = 1246, HH = 220
const OR = '#C9643E', GR = '#2F9E5A', INK = '#1F1F1F', BODY = '#333333', MUT = '#9A9A9A'
const EASE = '0.23 1 0.32 1'
const SLOGAN = JSON.parse(String.raw`[["我",16,"04400e50784808480840fffe084008440a440c48183068220852088a2b061002"],["是",16,"1ff0101010101ff0101010101ff00000fffe0100110011f811002900450083fe"],["林",16,"1020102010201020fdfe10203070387054a850a8912412221420102010201020"],["月",16,"07fc040404040404040407fc04040404040407fc040404040804080410142008"],["半",16,"0100210811080910092001003ff8010001000100fffe01000100010001000100"],["子",16,"00007ff800100020004001800100fffe01000100010001000100010005000200"],["，",16,"00000000000000000000000000000000000000000c000c000400040008000000"],["教",16,"082008207ea0093e0a44ff4408447ea4242848288f1078100828084828841102"],["你",16,"08800880088011fe110232043420502091281124122412221422102010a01040"],["用",16,"00003ff82108210821083ff82108210821083ff8210821082108410841288010"],["A",8,"0000000018242442427e424242420000"],["I",8,"000000003e08080808080808083e0000"],["干",16,"00003ff801000100010001000100fffe01000100010001000100010001000100"],["掉",16,"10201020103e1020fdfc110415fc190431fcd124102013fe1020102050202020"],["9",8,"000000003c4242423e02020204380000"],["0",8,"00000000182442464a52624224180000"],["%",8,"00000000314a4a340808162929460000"],["的",16,"1040104020407e7c42844284430442447e2442244204420442047e0442280010"],["重",16,"001000f83f000100fffe01001ff011101ff011101ff001003ff80100fffe0000"],["复",16,"100010001ffc20005ff090101ff010101ff004000ff01820644003801c70e00e"],["劳",16,"08200820fffe082000007ffe420282043ff00210021004100410081010a02040"],["动",16,"004000407c40004001fc0044fe4420442044208448844484fd04450402280410"]]`) // 固定口号点阵（Unifont 16px）：我是林月半子，教你用AI干掉90%的重复劳动
const SLOGAN_COLORS = [...Array(7).fill(MUT), ...Array(7).fill(BODY), ...Array(8).fill(OR)] // 我是林月半子， / 教你用AI干掉 / 90%的重复劳动

const fl = floatStr
/** 关键帧时间：round(min(max(t / dur, 0), 1), 4) 的 str */
function keyTime(t, dur) {
  const q = t / dur
  if (q < 0) return '0'
  if (q > 1) return '1'
  return fl(round(q, 4))
}
/** f"{v:.1f}".rstrip('0').rstrip('.') */
const R = v => fixed(Object.is(v, -0) ? 0 : v, 1).replace(/0+$/, '').replace(/\.$/, '')
const esc = s => escQ(pyStr(s))
function ord(c) {
  if (typeof c !== 'string') throw new PyError('TypeError', `ord() expected string of length 1, but ${typeName(c)} found`)
  const n = chars(c).length
  if (n !== 1) throw new PyError('TypeError', `ord() expected a character, but string of length ${n} found`)
  return c.codePointAt(0)
}

/** vals 里的数按 int 输出，float 要先用 fl() 转成字符串 */
function A(attr, vals, ts, spline = null, typ = null) {
  const kt = ts.map(t => keyTime(t, D)).join(';'), vs = vals.map(String).join(';')
  let ex = ''
  if (spline) {
    const sp = Array.isArray(spline) ? spline : Array(ts.length - 1).fill(spline)
    ex = ` calcMode="spline" keySplines="${sp.join(';')}"`
  }
  if (typ) return `<animateTransform attributeName="transform" type="${typ}" values="${vs}" keyTimes="${kt}"${ex} dur="${fl(D)}s" repeatCount="indefinite"/>`
  return `<animate attributeName="${attr}" values="${vs}" keyTimes="${kt}"${ex} dur="${fl(D)}s" repeatCount="indefinite"/>`
}

const show = (t, f = 0.15) => A('opacity', [0, 0, 1, 1], [0, t, t + f, D])

const grow = (attr, a, b, t, d = 0.3, spline = '0.42 0 0.58 1') => A(attr, [a, a, b, b], [0, t, t + d, D], ['0 0 1 1', spline, '0 0 1 1'])

/** 估算文字宽度，返回 {v, f} */
function tw(s, size) {
  return sum(iter(s).map(c => (ord(c) > 255 ? Iv(size) : Fv(size * 0.58))))
}

// ---------------- fixed part: avatar + slogan ----------------
function head(brand = null) {
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${HH}" width="100%" style="display:block;width:100%;height:auto;max-width:${W}px;margin:0 auto;background:transparent;font-family:'PingFang SC',sans-serif">`,
    '<image x="4" y="18" width="216" height="190" preserveAspectRatio="xMidYMax meet" href="GIF_URL_HERE"/>']
  const original = SLOGAN.map(([ch]) => ch).join('')
  brand = truthy(brand) ? brand : {}
  const author = g(brand, 'author', ''), slogan = g(brand, 'slogan', '')
  let lines
  if ((author === '' || author === '林月半子的AI笔记') && (slogan === '' || slogan === original)) {
    lines = [[original, 86, 3.0, SLOGAN_COLORS]]
  } else {
    const entries = [[author, 2.4, BODY], [slogan, 2.8, OR]].filter(([text]) => truthy(text))
    lines = entries.map(([text, size, color], i) => [text, entries.length === 1 ? 86 : 59 + i * 55, size, Array(pyLen(text)).fill(color)])
  }
  const rng = new PyRandom(3)
  for (const [text, ty, size, colors] of lines) o.push(...animatedBrandLine(text, ty, size, colors, rng))
  return o
}

function animatedBrandLine(text, ty, size, colors, rng) {
  const o = []
  const glyphs = new Map(SLOGAN.map(([ch, w, rows]) => [ch, [w, rows]]))
  const entries = iter(text).map(ch => [ch, ...(glyphs.get(ch) ?? [ord(ch) > 255 ? 16 : 8, null])])
  if (!entries.length) return o
  const ps = Math.min(size, (W - 270) / entries.reduce((a, [, w]) => a + w, 0))
  const dot = ps * 5 / 6
  let x = 236
  entries.forEach(([ch, w, hexrows], i) => {
    const n = Math.floor(w / 4), runs = []
    for (let y = 0; y < (hexrows ? 16 : 0); y++) {
      const v = parseInt(hexrows.slice(y * n, (y + 1) * n), 16)
      const bits = Array.from({ length: w }, (_, b) => (v >> (w - 1 - b)) & 1)
      let b = 0
      while (b < w) {
        if (bits[b]) {
          let e = b
          while (e < w && bits[e]) e += 1
          runs.push(`M${R(x + b * ps)} ${R(ty + y * ps + dot / 2)}h${R((e - b) * ps)}`); b = e
        } else b += 1
      }
    }
    const cw = w * ps
    if (runs.length || (hexrows === null && !PY_WS.includes(ch))) {
      const stagger = Math.min(1, 22 / entries.length)
      const ta = 0.1 + i * 0.045 * stagger, td = 1.9 + i * 0.025 * stagger
      const dx = rng.uniform(-26, 26), dy = rng.uniform(-38, 38), mx = x + cw / 2, my = ty + 8 * ps
      let p = `<path d="${runs.join('')}" fill="none" stroke="${colors[i]}" stroke-width="${fl(dot)}" stroke-dasharray="${fl(dot)} ${R(ps - dot)}"/>`
      if (!hexrows) {
        // Fill the font outline with the same dot grid when no original bitmap exists.
        const pattern = `brand-dot-${ty}-${i}`
        const side = R(ps)
        const radius = R(dot * 0.42)
        p = `<defs><pattern id="${pattern}" patternUnits="userSpaceOnUse" width="${side}" height="${side}">`
          + `<circle cx="${radius}" cy="${radius}" r="${radius}" fill="${colors[i]}"/></pattern></defs>`
          + `<text x="${R(x)}" y="${R(ty + 14 * ps)}" font-size="${R(16 * ps)}" `
          + `textLength="${R(cw)}" lengthAdjust="spacingAndGlyphs" fill="url(#${pattern})">${esc(ch)}</text>`
      }
      o.push(`<g opacity="0">${A('opacity', [0, 0, 1, 1, 0, 0], [0, ta, ta + 0.12, td, td + 0.35, D])}`
        + `<g>${A(null, ['0 0', '0 0', `${R(dx)} ${R(dy)}`, `${R(dx)} ${R(dy)}`], [0, td, td + 0.4, D], EASE, 'translate')}`
        + `<g transform="translate(${R(mx)} ${R(my)})"><g>${A(null, ['.6', '.6', '1.08', 1, 1, '.25', '.25'], [0, ta, ta + 0.1, ta + 0.18, td, td + 0.4, D], EASE, 'scale')}`
        + `<g transform="translate(${R(-mx)} ${R(-my)})">${p}</g></g></g></g></g>`)
    }
    x += cw
  })
  return o
}

// ================= v2: illustrated scenes =================
const TEAL = '#12A37F', TEAL_L = '#D5F2E8', NAVY = '#2B3A55', GOLD = '#F2B33D', BLUE = '#5B7FB8', LINE = '#D9DEE5', SHADOW = '#E7EAEF'
const T0 = 2.4, T_END = 6.0 // scene window

/** 从 0 蹦出来：0 → big → 0.95 → 1 */
const bounce = (cx, cy, t, inner, big = 1.15) => `<g opacity="0">${show(t, 0.05)}<g transform="translate(${R(cx)} ${R(cy)})"><g>`
  + `${A(null, [0, 0, fl(big), 0.95, 1, 1], [0, t, t + 0.16, t + 0.26, t + 0.34, D], ['0 0 1 1', '0.3 0 0.6 1', '0.4 0 0.6 1', '0.4 0 0.6 1', '0 0 1 1'], 'scale')}`
  + `<g transform="translate(${R(-cx)} ${R(-cy)})">${inner}</g></g></g></g>`

const checkBadge = (cx, cy, t, r = 10) => bounce(cx, cy, t, `<circle cx="${R(cx)}" cy="${R(cy)}" r="${r}" fill="${TEAL}" stroke="#FFFFFF" stroke-width="2.5"/>`
  + `<path d="M${R(cx - r * 0.45)} ${R(cy)}l${R(r * 0.32)} ${R(r * 0.32)}l${R(r * 0.55)} ${R(-r * 0.6)}" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`, 1.3)

function label(x, y, s, t, anchor = 'middle', size = 13, col = null) {
  if (!truthy(s)) return ''
  return `<g opacity="0">${show(t, 0.2)}<text x="${R(x)}" y="${R(y)}" font-size="${size}" fill="${col || MUT}" text-anchor="${anchor}">${esc(s)}</text></g>`
}

// ---------- icons (drawn around 0,0, ~28px) ----------
function _icon(name, bg = '#FFFFFF') {
  const I = {
    sun: `<circle r="7" fill="${GOLD}"/>` + Array.from({ length: 8 }, (_, i) => i * Math.PI / 4).map(a => `<line x1="${R(10 * Math.cos(a))}" y1="${R(10 * Math.sin(a))}" x2="${R(14 * Math.cos(a))}" y2="${R(14 * Math.sin(a))}" stroke="${GOLD}" stroke-width="2.5" stroke-linecap="round"/>`).join(''),
    moon: `<circle r="11" fill="#E8C766"/><circle cx="5" cy="-4" r="9.5" fill="${bg}"/>`,
    paw: `<ellipse cy="5" rx="7" ry="6" fill="${TEAL}"/><circle cx="-8" cy="-3" r="3" fill="${TEAL}"/><circle cx="-3" cy="-9" r="3" fill="${TEAL}"/><circle cx="3" cy="-9" r="3" fill="${TEAL}"/><circle cx="8" cy="-3" r="3" fill="${TEAL}"/>`,
    pin: `<path d="M0 13C-7 4-10-1-10-4A10 10 0 1 1 10-4C10-1 7 4 0 13Z" fill="${TEAL}"/><circle cy="-4" r="4" fill="${bg}"/>`,
    pill: `<g transform="rotate(-35)"><rect x="-13" y="-6" width="26" height="12" rx="6" fill="#FFFFFF" stroke="#C9CED6" stroke-width="1.5"/><path d="M0 -6H-7A6 6 0 0 0 -7 6H0Z" fill="${OR}"/></g>`,
    bell: `<path d="M-9 6V-1A9 9 0 0 1 9-1V6L11 9H-11Z" fill="${GOLD}"/><circle cy="12" r="2.6" fill="${GOLD}"/>`,
    wallet: `<rect x="-13" y="-9" width="26" height="18" rx="3" fill="${BLUE}"/><rect x="-13" y="-4" width="26" height="4" fill="${NAVY}"/><rect x="4" y="3" width="6" height="3" rx="1" fill="#FFFFFF"/>`,
    calendar: `<rect x="-11" y="-10" width="22" height="21" rx="3" fill="#FFFFFF" stroke="${NAVY}" stroke-width="2"/><rect x="-11" y="-10" width="22" height="6" rx="2" fill="${OR}"/>` + [0, 1].flatMap(r => [0, 1, 2].map(c => `<rect x="${-7 + c * 5}" y="${0 + r * 5}" width="3" height="3" fill="${NAVY}"/>`)).join(''),
    train: `<rect x="-10" y="-13" width="20" height="21" rx="5" fill="${BLUE}"/><rect x="-7" y="-9" width="14" height="6" rx="1.5" fill="#FFFFFF"/><circle cx="-5" cy="4" r="1.6" fill="${GOLD}"/><circle cx="5" cy="4" r="1.6" fill="${GOLD}"/><path d="M-7 9L-10 13M7 9L10 13" stroke="${NAVY}" stroke-width="2" stroke-linecap="round"/>`,
    doc: `<rect x="-10" y="-13" width="20" height="26" rx="2.5" fill="#FFFFFF" stroke="#9AA3AF" stroke-width="1.5"/><rect x="-6" y="-7" width="12" height="2.5" rx="1" fill="${TEAL}"/><rect x="-6" y="-1" width="12" height="2.5" rx="1" fill="#C9CED6"/><rect x="-6" y="5" width="8" height="2.5" rx="1" fill="#C9CED6"/>`,
    scissors: `<circle cx="-5" cy="8" r="4" fill="none" stroke="${OR}" stroke-width="2.5"/><circle cx="5" cy="8" r="4" fill="none" stroke="${OR}" stroke-width="2.5"/><path d="M-3 5L6-12M3 5L-6-12" stroke="${NAVY}" stroke-width="2.5" stroke-linecap="round"/>`,
    music: `<rect x="3" y="-12" width="2.6" height="18" fill="${TEAL}"/><path d="M5.6-12C10-10 11-6 9-3C9-6 7-8 5.6-8Z" fill="${TEAL}"/><ellipse cx="0" cy="7" rx="5" ry="4" fill="${TEAL}"/>`,
    text: `<rect x="-10" y="-11" width="20" height="4.5" rx="1" fill="${NAVY}"/><rect x="-2.3" y="-11" width="4.6" height="22" rx="1" fill="${NAVY}"/>`,
    play: `<rect x="-13" y="-10" width="26" height="20" rx="5" fill="${OR}"/><path d="M-3-5L5 0L-3 5Z" fill="#FFFFFF"/>`,
    chart: `<rect x="-11" y="2" width="5" height="9" rx="1" fill="${TEAL}"/><rect x="-3" y="-4" width="5" height="15" rx="1" fill="${TEAL}"/><rect x="5" y="-11" width="5" height="22" rx="1" fill="${OR}"/>`,
    person: `<path d="M-11 13Q-11 2 0 2Q11 2 11 13Z" fill="${NAVY}"/><circle cy="-5" r="6.5" fill="#F2B98A"/><path d="M-6.5-6Q-6-13 0-12Q6-13 6.5-6L4-9L0-7L-4-9Z" fill="${INK}"/>`,
    photo: `<rect x="-13" y="-10" width="26" height="20" rx="3" fill="#DDE7F3"/><path d="M-13 10L-4-1L3 6L7 2L13 8V10Z" fill="${TEAL}"/><circle cx="6" cy="-4" r="3" fill="${GOLD}"/>`,
    cup: `<path d="M-8-7H8L6 12H-6Z" fill="#EDE3D2" stroke="${NAVY}" stroke-width="1.5"/><rect x="-10" y="-11" width="20" height="4" rx="2" fill="${NAVY}"/><rect x="-7.2" y="0" width="14.4" height="5" fill="${BLUE}"/>`,
    chat: `<path d="M-12-10H12A3 3 0 0 1 15-7V4A3 3 0 0 1 12 7H-2L-8 12V7H-12A3 3 0 0 1-15 4V-7A3 3 0 0 1-12-10Z" fill="${TEAL}"/><circle cx="-6" cy="-1.5" r="1.8" fill="#FFFFFF"/><circle cy="-1.5" r="1.8" fill="#FFFFFF"/><circle cx="6" cy="-1.5" r="1.8" fill="#FFFFFF"/>`,
    mic: `<rect x="-4.5" y="-13" width="9" height="16" rx="4.5" fill="${NAVY}"/><path d="M-8-1A8 8 0 0 0 8-1M0 7V12M-5 12H5" fill="none" stroke="${NAVY}" stroke-width="2.2" stroke-linecap="round"/>`,
    mail: `<rect x="-13" y="-9" width="26" height="18" rx="2.5" fill="#FFFFFF" stroke="${NAVY}" stroke-width="2"/><path d="M-12-7L0 2L12-7" fill="none" stroke="${OR}" stroke-width="2"/>`,
    spark: `<path d="M0-14Q2-2 14 0Q2 2 0 14Q-2 2-14 0Q-2-2 0-14Z" fill="${GOLD}"/>`,
    code: `<path d="M-6-8L-13 0L-6 8M6-8L13 0L6 8M3-11L-3 11" fill="none" stroke="${NAVY}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    image: null,
  }
  I.image = I.photo
  return tget(I, name, null) || I.spark
}

const icon = (name, cx, cy, s = 1.0, bg = '#FFFFFF') => `<g transform="translate(${R(cx)} ${R(cy)}) scale(${fl(s)})">${_icon(name, bg)}</g>`
// ---------- props (big objects) ----------
function propChat(x, cy, t) {
  const w = 150, h = 116, y = cy - h / 2
  const o = [bounce(x + w / 2, cy, t, `<rect x="${x}" y="${R(y + 6)}" width="${w}" height="${h}" rx="14" fill="${SHADOW}"/>`
    + `<rect x="${x}" y="${R(y)}" width="${w}" height="${h}" rx="14" fill="#FFFFFF" stroke="${LINE}" stroke-width="1.5"/>`
    + [0, 1, 2].map(i => `<circle cx="${x + 16 + i * 11}" cy="${R(y + 16)}" r="3.2" fill="#C9CED6"/>`).join(''))]
  const rows = [[x + 16, 70, '#D5D9E0'], [x + w - 16 - 62, 62, TEAL], [x + 16, 52, '#D5D9E0'], [x + w - 16 - 70, 70, TEAL]]
  rows.forEach(([bx, bw, col], i) => {
    const by = y + 32 + i * 20
    o.push(bounce(bx + bw / 2, by + 6, t + 0.3 + i * 0.18, `<rect x="${R(bx)}" y="${R(by)}" width="${bw}" height="12" rx="6" fill="${col}"/>`))
  })
  return [o, [x + w, cy], w]
}

function propClapper(x, cy, t, work) {
  const w = 120, h = 92, y = cy - h / 2 + 10
  const stripes = [0, 1, 2, 3, 4].map(i => `<path d="M${x + 6 + i * 22} ${R(y - 22)}L${x + 20 + i * 22} ${R(y - 22)}L${x + 12 + i * 22} ${R(y - 6)}L${x - 2 + i * 22} ${R(y - 6)}Z" fill="#FFFFFF"/>`).join('')
  const p = `${x} ${R(y - 4)}`
  const arm = `<g><rect x="${x}" y="${R(y - 24)}" width="${w}" height="20" rx="4" fill="${INK}"/>${stripes}`
    + `${A(null, [`0 ${p}`, `0 ${p}`, `-14 ${p}`, `0 ${p}`, `-14 ${p}`, `0 ${p}`, `0 ${p}`], [0, work, work + 0.12, work + 0.24, work + 0.36, work + 0.48, D], null, 'rotate')}</g>`
  const body = `<rect x="${x}" y="${R(y + 4)}" width="${w}" height="${h - 8}" rx="8" fill="${SHADOW}"/>`
    + `<rect x="${x}" y="${R(y - 2)}" width="${w}" height="${h - 8}" rx="8" fill="#3B4252"/>`
    + `<circle cx="${fl(x + w / 2)}" cy="${R(y + h / 2 - 6)}" r="16" fill="${TEAL}"/><path d="M${fl(x + w / 2 - 5)} ${R(y + h / 2 - 14)}L${fl(x + w / 2 + 8)} ${R(y + h / 2 - 6)}L${fl(x + w / 2 - 5)} ${R(y + h / 2 + 2)}Z" fill="#FFFFFF"/>`
    + `<rect x="${x + 12}" y="${R(y + 8)}" width="18" height="4" rx="2" fill="#7B8496"/><rect x="${x + w - 38}" y="${R(y + h - 24)}" width="26" height="4" rx="2" fill="#7B8496"/>`
  return [[bounce(x + w / 2, cy, t, body + arm)], [x, cy], [x + w, cy], w]
}

function propRobot(x, cy, t, work) {
  const w = 150, hx = x + 20, hy = cy - 78
  const eyes = `<g><path d="M${hx + 38} ${hy + 42}l9 -9l9 9l-9 9Z" fill="#5BD6A8"/><path d="M${hx + 72} ${hy + 42}l9 -9l9 9l-9 9Z" fill="#5BD6A8"/>`
    + `${A(null, ['1 1', '1 1', '1 0.1', '1 1', '1 1', '1 0.1', '1 1', '1 1'], [0, t + 0.6, t + 0.66, t + 0.72, work + 0.9, work + 0.96, work + 1.02, D], null, 'scale')}</g>`
  const body = `<ellipse cx="${fl(x + w / 2)}" cy="${cy + 78}" rx="56" ry="7" fill="${SHADOW}"/>`
    + `<path d="M${hx} ${hy + 6}L${hx + 110} ${hy}L${hx + 118} ${hy + 70}L${hx + 6} ${hy + 76}Z" fill="#E9EAE6"/><path d="M${hx + 110} ${hy}L${hx + 120} ${hy + 6}L${hx + 126} ${hy + 74}L${hx + 118} ${hy + 70}Z" fill="#C9CBC4"/>`
    + `<rect x="${hx + 20}" y="${hy + 18}" width="80" height="46" rx="5" fill="#1C2026"/>`
    + `<rect x="${hx + 28}" y="${hy + 26}" width="18" height="3" rx="1.5" fill="#5BD6A8" opacity=".7"/>`
    + `<path d="M${hx + 14} ${hy + 80}H${hx + 104}L${hx + 100} ${hy + 132}H${hx + 20}Z" fill="#E9EAE6"/>`
    + `<g><path d="M${hx + 34} ${hy + 92}L${hx + 122} ${hy + 84}L${hx + 130} ${hy + 126}L${hx + 40} ${hy + 134}Z" fill="#2E4A3E"/>`
    + `<path d="M${hx + 20} ${hy + 122}L${hx + 110} ${hy + 116}L${hx + 130} ${hy + 126}L${hx + 40} ${hy + 134}Z" fill="#3E6252"/>`
    + `<rect x="${hx + 70}" y="${hy + 100}" width="12" height="10" rx="2" fill="${GOLD}"/></g>`
  const mark = bounce(hx + 64, hy - 14, work + 1.0, `<rect x="${hx + 48}" y="${hy - 26}" width="32" height="22" rx="4" fill="${TEAL_L}"/><path d="M${hx + 56} ${hy - 15}l5 5l9 -9" fill="none" stroke="${TEAL}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`)
  return [[bounce(x + w / 2, cy, t, body + eyes), mark], [x, cy], [x + w, cy], w]
}

function propComputer(x, cy, t, work) {
  const w = 250, mx = x, my = cy - 62
  const keys = [0, 1, 2].flatMap(r => [0, 1, 2, 3, 4, 5, 6].map(c => `<rect x="${mx + 176 + c * 9}" y="${my + 104 + r * 7}" width="7" height="5" rx="1" fill="#FFFFFF" stroke="#CFC4AE" stroke-width=".6"/>`)).join('')
  const scr = [mx + 14, my + 12, 132, 82]
  const body = `<rect x="${mx + 18}" y="${my + 130}" width="120" height="8" rx="4" fill="#E3D9C4"/>`
    + `<path d="M${mx + 150} ${my + 90}Q${mx + 190} ${my + 92} ${mx + 200} ${my + 100}" fill="none" stroke="#B9AE97" stroke-width="1.5"/>`
    + `<rect x="${mx}" y="${my}" width="160" height="126" rx="14" fill="#EFE6D2" stroke="#CFC4AE" stroke-width="2"/>`
    + `<rect x="${scr[0]}" y="${scr[1]}" width="${scr[2]}" height="${scr[3]}" rx="8" fill="#1F242C"/>`
    + `<path d="M${mx + 40} ${my + 86}L${mx + 62} ${my + 20}H${mx + 78}L${mx + 56} ${my + 86}Z" fill="#FFFFFF" opacity=".06"/>`
    + `<rect x="${mx + 108}" y="${my + 108}" width="36" height="4" rx="2" fill="#B9AE97"/><circle cx="${mx + 20}" cy="${my + 110}" r="2.5" fill="#B9AE97"/>`
    + `<rect x="${mx + 170}" y="${my + 100}" width="74" height="28" rx="4" fill="#E3D9C4" stroke="#CFC4AE"/>${keys}`
  const glow = `<rect x="${scr[0]}" y="${scr[1]}" width="${scr[2]}" height="${scr[3]}" rx="8" fill="#2B3A55" opacity="0">`
    + `${A('opacity', [0, 0, 1, 0.85, 1, 1], [0, work, work + 0.08, work + 0.14, work + 0.2, D])}</rect>`
  return [[bounce(x + 80, cy, t, body + glow)], [x, cy], [x + w, cy], w, scr]
}

function propPhone(x, cy, t, work) {
  const w = 92, h = 176, y = cy - h / 2
  const scr = [x + 7, y + 10, 78, 156]
  const body = `<rect x="${x}" y="${R(y)}" width="${w}" height="${h}" rx="16" fill="${INK}"/>`
    + `<rect x="${scr[0]}" y="${R(scr[1])}" width="${scr[2]}" height="${scr[3]}" rx="10" fill="#2B3A55"/>`
  return [[bounce(x + w / 2, cy, t, body)], [x, cy], [x + w, cy], w, scr]
}

function propStart(x, cy, t, ic) {
  const r = 34
  return [[bounce(x + r, cy, t, `<circle cx="${x + r}" cy="${cy + 4}" r="${r}" fill="${SHADOW}"/><circle cx="${x + r}" cy="${cy}" r="${r}" fill="#FFFFFF" stroke="${LINE}" stroke-width="1.5"/>` + icon(ic, x + r, cy, 1.5))], [x + 2 * r, cy], 2 * r]
}

const PROPS = { robot: propRobot, clapper: propClapper, computer: propComputer, phone: propPhone }

// ---------- tiles ----------
// x、w 是 {v, f}：上游的 min() 可能给 int 也可能给 float
function tileCard(x, cy, t, it, w = Iv(110)) {
  const X = x.v, Wd = w.v, xs = v => S({ v, f: x.f }), ws = v => S({ v, f: w.f })
  const h = 108, y = cy - h / 2
  const inner = `<rect x="${xs(X)}" y="${R(y + 5)}" width="${ws(Wd)}" height="${h}" rx="10" fill="${SHADOW}"/>`
    + `<rect x="${xs(X)}" y="${R(y)}" width="${ws(Wd)}" height="${h}" rx="10" fill="#FFFFFF" stroke="${LINE}" stroke-width="1.5"/>`
    + [0, 1, 2].map(i => `<circle cx="${xs(X + 12 + i * 8)}" cy="${R(y + 12)}" r="2.4" fill="#C9CED6"/>`).join('')
    + `<rect x="${xs(X + 12)}" y="${R(y + 24)}" width="${ws(Wd - 24)}" height="7" rx="3.5" fill="${TEAL}"/>`
    + icon(g(it, 'icon', 'doc'), X + 30, y + 56, 0.95)
    + `<rect x="${xs(X + 50)}" y="${R(y + 48)}" width="${ws(Wd - 64)}" height="5" rx="2.5" fill="#1F7A5C"/><rect x="${xs(X + 50)}" y="${R(y + 60)}" width="${ws(Wd - 76)}" height="5" rx="2.5" fill="#6CCDAA"/>`
    + `<rect x="${xs(X + 12)}" y="${R(y + 86)}" width="${ws(Wd - 24)}" height="7" rx="3.5" fill="${TEAL}"/>`
  return [bounce(X + Wd / 2, cy, t, inner), [X + Wd - 6, y + 4], [X + Wd / 2, y + h + 18]]
}

function tileFilm(x, cy, t, it, w = Iv(160)) {
  const X = x.v, Wd = w.v, xs = v => S({ v, f: x.f }), ws = v => S({ v, f: w.f })
  const h = 104, y = cy - h / 2
  const holes = Array.from({ length: 8 }, (_, i) => `<rect x="${R(X + 10 + i * (Wd - 20) / 7)}" y="${R(y + 5)}" width="9" height="5" rx="1" fill="#FFFFFF"/><rect x="${R(X + 10 + i * (Wd - 20) / 7)}" y="${R(y + h - 10)}" width="9" height="5" rx="1" fill="#FFFFFF"/>`).join('')
  const sbg = truthy(g(it, 'bg')) ? g(it, 'bg') : ['#F5E9D3', '#DDE7F3', '#E3F1EA', '#F6E1D6'][g(it, '_i', 0) % 4]
  const inner = `<rect x="${xs(X)}" y="${R(y)}" width="${ws(Wd)}" height="${h}" rx="6" fill="#3B4252"/>${holes}`
    + `<rect x="${xs(X + 8)}" y="${R(y + 15)}" width="${ws(Wd - 16)}" height="${h - 30}" rx="3" fill="${pyStr(sbg)}"/>`
    + icon(g(it, 'icon', 'play'), X + Wd / 2, cy, 1.5, pyStr(sbg))
  return [bounce(X + Wd / 2, cy, t, inner), [X + Wd - 6, y + 4], [X + Wd / 2, y + h + 18]]
}

const TILES = { card: [tileCard, 110], film: [tileFilm, 156] }

const connector = (x1, x2, y, t, d = 0.25) => `<g opacity="0">${show(t, 0.05)}<circle cx="${R(x1)}" cy="${y}" r="4" fill="#8E97A6"/>`
  + `<line x1="${R(x1)}" y1="${y}" x2="${R(x1)}" y2="${y}" stroke="#8E97A6" stroke-width="2.5">${grow('x2', R(x1), R(x2), t, d)}</line>`
  + `<g opacity="0">${show(t + d, 0.05)}<circle cx="${R(x2)}" cy="${y}" r="4" fill="#8E97A6"/></g></g>`

// ---------- layouts ----------
function layPipeline(sc) {
  let o = [], x = 250, t = T0
  const cy = 112
  if (truthy(g(sc, 'source'))) {
    const s = sub(sc, 'source')
    let parts, out, w
    if (g(s, 'prop', 'chat') === 'chat') { [parts, out, w] = propChat(x, cy, t); o.push(...parts); t += 0.9 }
    else { [parts, out, w] = propStart(x, cy, t, g(s, 'icon', 'chat')); o.push(...parts); t += 0.4 }
    o.push(label(x + w / 2, cy + 84, g(s, 'label'), t - 0.3))
    o.push(connector(out[0] + 8, out[0] + 44, cy, t)); x = out[0] + 52; t += 0.3
  }
  const p = g(sc, 'processor', { prop: 'robot' })
  const res = lookup(PROPS, sub(p, 'prop'))(x, cy, t, t + 0.35)
  const [parts, , pout, w] = res; o.push(...parts)
  o.push(label(x + w / 2, cy + 92, g(p, 'label'), t + 0.3)); t += 0.75
  const [tf, tw0] = lookup(TILES, g(sc, 'tile', 'card'))
  const itemsRaw = sub(sc, 'items'), avail = 1236 - (pout[0] + 52)
  const gap = 10, nItems = pyLen(itemsRaw), twv = tmin(Iv(tw0), Fv(div(avail - gap * (nItems - 1), nItems, false)))
  const items = iter(itemsRaw)
  o.push(connector(pout[0] + 8, pout[0] + 44, cy, t)); t += 0.3
  let xv = Iv(pout[0] + 52)
  const step = Math.min(0.24, (T_END - 0.6 - t) / Math.max(items.length, 1))
  items.forEach((it0, i) => {
    const it = { ...pyDict(it0), _i: i }, ti = t + i * step
    const [tile, badge, lab] = tf(xv, cy, ti, it, twv)
    o.push(tile); o.push(truthy(g(it, 'check', true)) ? checkBadge(badge[0], badge[1], ti + 0.3 + step * 0.5) : '')
    o.push(label(lab[0], lab[1], g(it, 'label'), ti + 0.2)); xv = { v: xv.v + (twv.v + gap), f: xv.f || twv.f }
  })
  return o
}

function layFly(sc) {
  const o = [], cy = 108
  const dev = g(sc, 'device', 'computer'), dw = dev === 'computer' ? 250 : 92
  const items = head_(g(sc, 'items', []), 4)
  const dx = items.length ? 560 : 1236 - dw - 20
  const tArr = T0 + 1.3
  const res = lookup(PROPS, dev)(dx, cy, T0 + 0.1, tArr)
  o.push(...res[0]); const scr = res[4]
  if (!scr) throw new PyError('IndexError', 'tuple index out of range')
  o.push(label(dx + (dev === 'computer' ? 80 : 46), cy + 96, g(sc, 'device_label'), tArr + 0.2))
  const sx = 300, ex = scr[0] + 26
  const trail = (wd, col) => `<line x1="${sx}" y1="${cy}" x2="${sx}" y2="${cy}" stroke="${col}" stroke-width="${wd}" stroke-linecap="round">`
    + `${grow('x2', sx, ex - 34, T0 + 0.4, tArr - T0 - 0.4, '0.5 0 0.9 0.6')}</line>`
  o.push(`<g opacity="0">${A('opacity', [0, 0, 1, 1, 0.45, 0.45], [0, T0 + 0.3, T0 + 0.4, tArr, tArr + 0.3, D])}${trail(12, TEAL_L)}${trail(3, TEAL)}</g>`)
  o.push(`<g opacity="0">${A('opacity', [0, 0, 1, 1, 0, 0], [0, T0 + 0.3, T0 + 0.4, tArr, tArr + 0.12, D])}<g>`
    + `${A(null, [`${sx} ${cy}`, `${sx} ${cy}`, `${ex} ${cy}`, `${ex} ${cy}`], [0, T0 + 0.4, tArr, D], ['0 0 1 1', '0.5 0 0.9 0.6', '0 0 1 1'], 'translate')}`
    + `<g>${A(null, [-10, -10, 8, -6, 0, 0], [0, T0 + 0.4, T0 + 0.7, T0 + 1.0, tArr, D], null, 'rotate')}`
    + `<rect x="-24" y="-24" width="48" height="48" rx="12" fill="${TEAL}" stroke="#FFFFFF" stroke-width="3" transform="rotate(-12)"/>`
    + '<circle r="15" fill="#FFFFFF"/>' + icon(g(sc, 'flyer', 'doc'), 0, 0, 0.8) + '</g></g></g>')
  o.push(label(sx - 6, cy + 40, g(sc, 'left_label'), T0 + 0.4, 'start'))
  const scrIcons = head_(g(sc, 'screen', []), 3)
  scrIcons.forEach((ic, i) => {
    const n = scrIcons.length, cxs = scr[0] + scr[2] * (i + 1) / (n + 1), cys = scr[1] + scr[3] / 2
    o.push(bounce(cxs, cys, tArr + 0.25 + i * 0.2, `<circle cx="${R(cxs)}" cy="${R(cys)}" r="16" fill="#FFFFFF"/>` + icon(ic, cxs, cys, 0.75)))
  })
  let t = tArr + 0.3 + scrIcons.length * 0.2
  o.push(checkBadge(scr[0] + scr[2] - 4, scr[1] + 2, t, 12))
  if (items.length) {
    const x0 = dx + dw + 8
    o.push(connector(x0, x0 + 30, cy, t + 0.1)); let x = Iv(x0 + 40); t += 0.4
    const avail = 1236 - x.v, gap = 10, w = tmin(Iv(110), Fv(div(avail - gap * (items.length - 1), items.length, false)))
    const step = Math.min(0.25, (T_END - 0.5 - t) / items.length)
    items.forEach((it, i) => {
      const ti = t + i * step
      const [tile, badge, lab] = tileCard(x, cy, ti, it, w)
      o.push(tile, checkBadge(badge[0], badge[1], ti + 0.3), label(lab[0], lab[1], g(it, 'label'), ti + 0.2))
      x = { v: x.v + (w.v + gap), f: x.f || w.f }
    })
  }
  return o
}

function _bez(p0, p1, p2, p3, n = 24) {
  const pts = []
  for (let i = 0; i < n + 1; i++) {
    const u = i / n, v = 1 - u
    pts.push([v ** 3 * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u ** 3 * p3[0], v ** 3 * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u ** 3 * p3[1]])
  }
  return pts
}

function layPath(sc) {
  const nodesRaw = sub(sc, 'nodes'), n = pyLen(nodesRaw), o = [], nodes = iter(nodesRaw)
  const sx = 250, [parts, out] = propStart(sx, 112, T0, g(sc, 'start_icon', 'spark')); o.push(...parts)
  o.push(label(sx + 34, 168, g(sc, 'start_label'), T0 + 0.2))
  const xs = Array.from({ length: n }, (_, i) => out[0] + 70 + i * (1196 - out[0] - 70) / Math.max(n - 1, 1))
  const ys = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 150 : 66))
  const pts = [[out[0], 112], ...xs.map((x, i) => [x, ys[i]])]
  let d = `M${R(pts[0][0])} ${R(pts[0][1])}`, L = 0
  const cum = [0]
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1]
    const mx = (a[0] + b[0]) / 2
    const c1 = [mx, a[1]], c2 = [mx, b[1]]
    d += `C${R(c1[0])} ${R(c1[1])} ${R(c2[0])} ${R(c2[1])} ${R(b[0])} ${R(b[1])}`
    const seg = _bez(a, c1, c2, b)
    L += sum(seg.slice(1).map((q, j) => Fv(Math.hypot(q[0] - seg[j][0], q[1] - seg[j][1])))).v; cum.push(L)
  }
  const t1 = T0 + 0.35, t2 = T_END - 0.5
  for (const [wdt, col] of [[12, TEAL_L], [3, TEAL]]) {
    o.push(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${wdt}" stroke-linecap="round" stroke-dasharray="${R(L + 2)}" stroke-dashoffset="${R(L + 2)}">${grow('stroke-dashoffset', R(L + 2), 0, t1, t2 - t1, '0 0 1 1')}</path>`)
  }
  nodes.forEach((nd, i) => {
    const ti = t1 + div((t2 - t1) * cum[i + 1], L) - 0.05
    const x = xs[i], y = ys[i]
    o.push(bounce(x, y, ti, `<circle cx="${R(x)}" cy="${y + 3}" r="24" fill="${SHADOW}"/><circle cx="${R(x)}" cy="${y}" r="24" fill="#FFFFFF" stroke="${LINE}" stroke-width="1.5"/>` + icon(g(nd, 'icon', 'spark'), x, y, 0.95)))
    if (truthy(g(nd, 'check', true))) o.push(checkBadge(x + 18, y - 18, ti + 0.3, 8))
    const labY = y > 100 ? y + 44 : y - 34
    o.push(label(x, labY, g(nd, 'label'), ti + 0.15))
  })
  return o
}

const LAYOUTS = { pipeline: layPipeline, fly: layFly, path: layPath }
// ================= v3: seven more scene skeletons =================
const PALE = ['#E3F1EA', '#DDE7F3', '#F5E9D3', '#F6E1D6']

/** 从上方掉下来，落地回弹 */
const drop = (t, inner, dy = 160) => `<g opacity="0">${show(t, 0.04)}<g>`
  + `${A(null, [`0 ${-dy}`, `0 ${-dy}`, '0 5', '0 -2', '0 0', '0 0'], [0, t, t + 0.24, t + 0.31, t + 0.37, D], ['0 0 1 1', '0.55 0 1 1', '0.3 0 0.6 1', '0.4 0 0.6 1', '0 0 1 1'], 'translate')}`
  + `${inner}</g></g>`

const arrow = (x1, x2, y, t, d = 0.3) => `<g opacity="0">${show(t, 0.05)}`
  + `<line x1="${R(x1)}" y1="${y}" x2="${R(x1)}" y2="${y}" stroke="#8E97A6" stroke-width="3" stroke-linecap="round">${grow('x2', R(x1), R(x2 - 8), t, d)}</line>`
  + `<g opacity="0">${show(t + d, 0.05)}<path d="M${R(x2 - 13)} ${y - 8}L${R(x2)} ${y}L${R(x2 - 13)} ${y + 8}Z" fill="#8E97A6"/></g></g>`

const miniDoc = (cx, cy, ic, rot = 0, w = 50, h = 60) => `<g transform="rotate(${rot} ${R(cx)} ${R(cy)})"><rect x="${R(cx - w / 2)}" y="${R(cy - h / 2 + 3)}" width="${w}" height="${h}" rx="6" fill="${SHADOW}"/>`
  + `<rect x="${R(cx - w / 2)}" y="${R(cy - h / 2)}" width="${w}" height="${h}" rx="6" fill="#FFFFFF" stroke="${LINE}" stroke-width="1.5"/>`
  + icon(ic, cx, cy - 6, 0.75) + `<rect x="${R(cx - w / 2 + 9)}" y="${R(cy + h / 2 - 15)}" width="${w - 18}" height="4" rx="2" fill="#C9CED6"/></g>`

function cardsRow(x0, items, t, { cy = 110, maxw = 120, gap = 10, xEnd = 1236 } = {}) {
  const o = [], n = items.length
  if (!n) return [o, t]
  const w = tmax(Iv(84), tmin(Iv(maxw), Fv((xEnd - x0 - gap * (n - 1)) / n)))
  const step = Math.min(0.25, Math.max(0.12, (T_END - 0.4 - t) / n))
  let x = Iv(x0)
  items.forEach((it, i) => {
    const ti = t + i * step
    const [tile, badge, lab] = tileCard(x, cy, ti, it, w)
    o.push(tile, truthy(g(it, 'check', true)) ? checkBadge(badge[0], badge[1], ti + 0.3) : '', label(lab[0], lab[1], g(it, 'label'), ti + 0.2))
    x = { v: x.v + (w.v + gap), f: x.f || w.f }
  })
  return [o, t + n * step]
}

const bigCircle = (cx, cy, r, ic, s, ring = TEAL) => `<circle cx="${R(cx)}" cy="${R(cy + 4)}" r="${r}" fill="${SHADOW}"/>`
  + `<circle cx="${R(cx)}" cy="${R(cy)}" r="${r}" fill="#FFFFFF" stroke="${ring}" stroke-width="3"/>` + icon(ic, cx, cy, s)

// ---- 4. before_after 前后对比：一堆乱活 → 箭头 → 整齐成品 ----
function layBeforeAfter(sc) {
  const o = [], cx0 = 392, cy0 = 118
  const slots = [[-88, -22, -12], [-36, 12, 8], [14, -30, -6], [66, 8, 13], [-64, 44, 5], [32, 48, -10], [92, -28, 9]]
  const ics = head_(g(sc, 'before', ['doc', 'chart', 'mail', 'photo', 'doc', 'text']), 7)
  o.push(label(cx0, 30, g(sc, 'before_label'), T0, 'middle', 14))
  const pile = ics.slice(0, slots.length).map((ic, i) => {
    const [dx, dy, rot] = slots[i]
    return bounce(cx0 + dx, cy0 + dy, T0 + 0.05 + i * 0.1, miniDoc(cx0 + dx, cy0 + dy, ic, rot))
  }).join('')
  const tw_ = T0 + 0.15 + ics.length * 0.1
  const c = `${cx0} ${cy0}`
  o.push(`<g>${A(null, [`0 ${c}`, `0 ${c}`, `-3 ${c}`, `3 ${c}`, `-2 ${c}`, `0 ${c}`, `0 ${c}`], [0, tw_, tw_ + 0.08, tw_ + 0.16, tw_ + 0.24, tw_ + 0.32, D], null, 'rotate')}${pile}</g>`)
  let t = tw_ + 0.4
  o.push(arrow(518, 648, 112, t))
  const v = g(sc, 'via', {})
  o.push(bounce(583, 112, t + 0.15, bigCircle(583, 112, 22, g(v, 'icon', 'spark'), 0.85)))
  o.push(label(583, 156, g(v, 'label'), t + 0.25))
  t += 0.45
  o.push(label(662, 30, g(sc, 'after_label'), t, 'start', 14, TEAL))
  const [parts] = cardsRow(662, head_(g(sc, 'items', []), 4), t + 0.1); o.push(...parts)
  return o
}

// ---- 5. hub 中心发散：一个中心，周围能力逐个连上 ----
function layHub(sc) {
  const o = [], cx = 740, cy = 106, nodes = head_(sub(sc, 'nodes'), 6), n = nodes.length
  const slots = [[-440, -6], [-300, -56], [-200, 52], [200, 52], [300, -56], [440, -6]]
  const use = Array.from({ length: n }, (_, i) => [0, 5, 2, 3, 1, 4][i]).sort((a, b) => a - b)
  const pos = use.map(i => slots[i]).sort((a, b) => a[0] - b[0])
  const c = g(sc, 'center', {})
  for (const tp of [T0 + 0.45, T0 + 1.45, T0 + 2.45]) {
    o.push(`<circle cx="${cx}" cy="${cy}" r="44" fill="none" stroke="${TEAL}" stroke-width="2" opacity="0">`
      + `${A('r', [44, 44, 90, 90], [0, tp, tp + 1.0, D], ['0 0 1 1', '0.2 0.6 0.4 1', '0 0 1 1'])}${A('opacity', [0, 0, 0.5, 0, 0], [0, tp, tp + 0.05, tp + 1.0, D])}</circle>`)
  }
  o.push(bounce(cx, cy, T0, bigCircle(cx, cy, 44, g(c, 'icon', 'spark'), 1.6)))
  o.push(label(cx, cy + 70, g(c, 'label'), T0 + 0.2, 'middle', 14, INK))
  const t = T0 + 0.5, step = Math.min(0.42, (T_END - 0.6 - t) / Math.max(n, 1))
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(pos[a][0]) - Math.abs(pos[b][0])) // 由近到远依次连上
  order.forEach((i, k) => {
    const nd = nodes[i], nx = cx + pos[i][0], ny = cy + pos[i][1], ti = t + k * step
    const L = Math.hypot(nx - cx, ny - cy), ux = (nx - cx) / L, uy = (ny - cy) / L
    const x1 = cx + ux * 48, y1 = cy + uy * 48, x2 = nx - ux * 28, y2 = ny - uy * 28
    o.push(`<line x1="${R(x1)}" y1="${R(y1)}" x2="${R(x1)}" y2="${R(y1)}" stroke="#AEB6C2" stroke-width="2.5" stroke-dasharray="5 5" stroke-linecap="round" opacity="0">`
      + `${show(ti, 0.05)}${grow('x2', R(x1), R(x2), ti, 0.25)}${grow('y2', R(y1), R(y2), ti, 0.25)}</line>`)
    o.push(bounce(nx, ny, ti + 0.22, `<circle cx="${R(nx)}" cy="${R(ny + 3)}" r="25" fill="${SHADOW}"/><circle cx="${R(nx)}" cy="${R(ny)}" r="25" fill="#FFFFFF" stroke="${LINE}" stroke-width="1.5"/>` + icon(g(nd, 'icon', 'spark'), nx, ny, 0.95)))
    if (truthy(g(nd, 'check', true))) o.push(checkBadge(nx + 19, ny - 19, ti + 0.5, 8))
    o.push(label(nx, ny < cy - 20 ? ny - 36 : ny + 44, g(nd, 'label'), ti + 0.35))
  })
  return o
}

// ---- 6. stack 搭积木：模块一块块掉进托盘，拼成成品 ----
function layStack(sc) {
  const o = [], blocks = head_(sub(sc, 'blocks'), 6), n = blocks.length
  const cols = Math.min(3, Math.max(1, Math.ceil(n / 2))), bw = cols === 3 ? 140 : 160, bh = 54, gap = 10
  const x0 = cols === 3 ? 350 : 380, Wd = cols * bw + (cols - 1) * gap, base = 186
  o.push(`<g opacity="0">${show(T0, 0.2)}<path d="M${x0 - 14} 58V${base + 2}H${x0 + Wd + 14}V58" fill="none" stroke="#C9CED6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>`)
  let t = T0 + 0.2
  const step = Math.min(0.32, 2.0 / Math.max(n, 1))
  blocks.forEach((b, i) => {
    const r = Math.floor(i / cols), cidx = i % cols
    const x = x0 + cidx * (bw + gap), y = base - 6 - bh - r * (bh + 8)
    const col = PALE[i % 4]
    const inner = `<rect x="${x}" y="${y + 4}" width="${bw}" height="${bh}" rx="8" fill="${SHADOW}"/>`
      + `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="8" fill="${col}" stroke="#FFFFFF" stroke-width="2"/>`
      + `<circle cx="${x + 26}" cy="${fl(y + bh / 2)}" r="17" fill="#FFFFFF"/>` + icon(g(b, 'icon', 'spark'), x + 26, y + bh / 2, 0.75)
      + `<text x="${x + 52}" y="${fl(y + bh / 2 + 5)}" font-size="14" fill="${INK}">${esc(g(b, 'label', ''))}</text>`
    o.push(drop(t + i * step, inner))
  })
  t = t + n * step + 0.1
  const P = 2 * (Wd + 28) + 2 * (base - 48 + 6)
  o.push(`<rect x="${x0 - 14}" y="48" width="${Wd + 28}" height="${base - 42}" rx="12" fill="none" stroke="${TEAL}" stroke-width="2.5" stroke-dasharray="${P}" stroke-dashoffset="${P}">${grow('stroke-dashoffset', P, 0, t, 0.45, '0 0 1 1')}</rect>`)
  o.push(label(x0 + Wd / 2, 210, g(sc, 'label'), t + 0.2))
  const ax = x0 + Wd + 28; t += 0.45
  o.push(arrow(ax, ax + 80, 112, t)); t += 0.3
  const res = g(sc, 'result', {}), rx = ax + 92, rw = 210, rh = 136, ry = 112 - rh / 2
  const card = `<rect x="${rx}" y="${fl(ry + 6)}" width="${rw}" height="${rh}" rx="14" fill="${SHADOW}"/>`
    + `<rect x="${rx}" y="${fl(ry)}" width="${rw}" height="${rh}" rx="14" fill="#FFFFFF" stroke="${LINE}" stroke-width="1.5"/>`
    + [0, 1, 2].map(i => `<circle cx="${rx + 16 + i * 10}" cy="${fl(ry + 15)}" r="3" fill="#C9CED6"/>`).join('')
    + `<circle cx="${rx + 52}" cy="${fl(ry + 72)}" r="28" fill="${TEAL_L}"/>` + icon(g(res, 'icon', 'play'), rx + 52, ry + 72, 1.3)
    + `<rect x="${rx + 96}" y="${fl(ry + 52)}" width="92" height="9" rx="4.5" fill="${TEAL}"/><rect x="${rx + 96}" y="${fl(ry + 70)}" width="70" height="7" rx="3.5" fill="#C9CED6"/><rect x="${rx + 96}" y="${fl(ry + 86)}" width="80" height="7" rx="3.5" fill="#C9CED6"/>`
  o.push(bounce(rx + rw / 2, 112, t, card, 1.1))
  o.push(checkBadge(rx + rw - 8, ry + 6, t + 0.4, 13))
  o.push(label(rx + rw / 2, ry + rh + 24, g(res, 'label'), t + 0.2, 'middle', 14, INK))
  return o
}

// ---- 7. dialog 对话来回：你一句它一句，最后交付成品 ----
function layDialog(sc) {
  const o = [], msgs = head_(sub(sc, 'messages'), 4), wx = 258, wy = 16, ww = 470, wh = 190
  const win = `<rect x="${wx}" y="${wy + 6}" width="${ww}" height="${wh}" rx="14" fill="${SHADOW}"/>`
    + `<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="14" fill="#FFFFFF" stroke="${LINE}" stroke-width="1.5"/>`
    + [0, 1, 2].map(i => `<circle cx="${wx + 16 + i * 11}" cy="${wy + 16}" r="3.2" fill="#C9CED6"/>`).join('')
    + (truthy(g(sc, 'window_title')) ? `<text x="${fl(wx + ww / 2)}" y="${wy + 20}" font-size="12" fill="${MUT}" text-anchor="middle">${esc(sub(sc, 'window_title'))}</text>` : '')
  o.push(bounce(wx + ww / 2, wy + wh / 2, T0, win, 1.06))
  let y = wy + 34, t = T0 + 0.3
  for (const m of msgs) {
    const txt = g(m, 'text', ''), bw = tw(txt, 13).v + 28, bh = 28
    if (g(m, 'from') === 'me') {
      const bx = wx + ww - 16 - bw
      const b = `<rect x="${R(bx)}" y="${y}" width="${R(bw)}" height="${bh}" rx="14" fill="${TEAL}"/><text x="${R(bx + 14)}" y="${y + 19}" font-size="13" fill="#FFFFFF">${esc(txt)}</text>`
      o.push(bounce(bx + bw, y + bh / 2, t, b, 1.08)); t += 0.42
    } else {
      const bx = wx + 50
      o.push(bounce(wx + 28, y + bh / 2, t, `<circle cx="${wx + 28}" cy="${fl(y + bh / 2)}" r="14" fill="${TEAL_L}"/>` + icon('spark', wx + 28, y + bh / 2, 0.6)))
      const dots = [0, 1, 2].map(i => `<circle cx="${bx + 16 + i * 10}" cy="${fl(y + bh / 2)}" r="3" fill="#9AA3AF"/>`).join('')
      o.push(`<g opacity="0">${A('opacity', [0, 0, 1, 1, 0, 0], [0, t + 0.05, t + 0.1, t + 0.4, t + 0.45, D])}<rect x="${bx}" y="${y}" width="52" height="${bh}" rx="14" fill="#F2F4F7"/>${dots}</g>`)
      t += 0.42
      const b = `<rect x="${bx}" y="${y}" width="${R(bw)}" height="${bh}" rx="14" fill="#F2F4F7"/><text x="${bx + 14}" y="${y + 19}" font-size="13" fill="${INK}">${esc(txt)}</text>`
      o.push(bounce(bx, y + bh / 2, t, b, 1.08)); t += 0.42
    }
    y += 40
  }
  const x = wx + ww + 10
  o.push(connector(x, x + 34, 112, t)); t += 0.3
  const [parts] = cardsRow(x + 44, head_(g(sc, 'items', []), 3), t, { maxw: 130 }); o.push(...parts)
  return o
}

// ---- 8. calendar 一周打卡：设一次，每天自动盖章 ----
function layCalendar(sc) {
  const o = [], days = head_(sub(sc, 'days'), 7), n = days.length
  const [parts, out] = propStart(254, 108, T0, g(sc, 'start_icon', 'bell')); o.push(...parts)
  o.push(label(288, 166, g(sc, 'start_label'), T0 + 0.2))
  o.push(connector(out[0] + 6, out[0] + 30, 108, T0 + 0.3))
  const x0 = out[0] + 38, gap = 10, cw = Math.min(124, div(1236 - x0 - gap * (n - 1), n, false)), ch = 116, y = 46
  days.forEach((d, i) => {
    const x = x0 + i * (cw + gap), ti = T0 + 0.5 + i * 0.1
    const card = `<rect x="${R(x)}" y="${y + 5}" width="${R(cw)}" height="${ch}" rx="10" fill="${SHADOW}"/>`
      + `<rect x="${R(x)}" y="${y}" width="${R(cw)}" height="${ch}" rx="10" fill="#FFFFFF" stroke="${LINE}" stroke-width="1.5"/>`
      + `<path d="M${R(x)} ${y + 26}V${y + 10}A10 10 0 0 1 ${R(x + 10)} ${y}H${R(x + cw - 10)}A10 10 0 0 1 ${R(x + cw)} ${y + 10}V${y + 26}Z" fill="${NAVY}"/>`
      + `<text x="${R(x + cw / 2)}" y="${y + 18}" font-size="12" fill="#FFFFFF" text-anchor="middle">${esc(g(d, 'day', ''))}</text>`
      + icon(g(d, 'icon', 'spark'), x + cw / 2, y + 66, 1.2)
    o.push(bounce(x + cw / 2, y + ch / 2, ti, card))
    o.push(label(x + cw / 2, y + ch + 24, g(d, 'label'), ti + 0.1))
  })
  const ts0 = T0 + 0.6 + n * 0.1 + 0.2, step = Math.min(0.4, (T_END - 0.2 - ts0) / Math.max(n, 1))
  days.forEach((d, i) => {
    const st = g(d, 'stamp', g(sc, 'stamp', '已办'))
    if (!truthy(st)) return
    const x = x0 + i * (cw + gap), sx = x + cw - 24, sy = y + ch - 22, ts = ts0 + i * step
    const inner = `<g transform="rotate(-14 ${R(sx)} ${sy})"><circle cx="${R(sx)}" cy="${sy}" r="20" fill="#FFFFFF" fill-opacity=".85" stroke="${OR}" stroke-width="2.5"/>`
      + `<circle cx="${R(sx)}" cy="${sy}" r="15.5" fill="none" stroke="${OR}" stroke-width="1"/>`
      + `<text x="${R(sx)}" y="${sy + 4}" font-size="11" font-weight="700" fill="${OR}" text-anchor="middle">${esc(st)}</text></g>`
    o.push(`<g opacity="0">${show(ts, 0.04)}<g transform="translate(${R(sx)} ${sy})"><g>`
      + `${A(null, [1.9, 1.9, 0.9, 1.04, 1, 1], [0, ts, ts + 0.12, ts + 0.2, ts + 0.26, D], ['0 0 1 1', '0.6 0 1 1', '0.4 0 0.6 1', '0.4 0 0.6 1', '0 0 1 1'], 'scale')}`
      + `<g transform="translate(${R(-sx)} ${-sy})">${inner}</g></g></g></g>`)
  })
  return o
}

// ---- 9. funnel 漏斗筛选：一大堆信息倒进去，只出几样重点 ----
function layFunnel(sc) {
  const o = []
  const ins = head_(g(sc, 'inputs', ['mail', 'chat', 'doc', 'mail', 'photo', 'chat', 'doc', 'mail', 'chart', 'chat']), 10)
  const P = [[298, 62], [356, 92], [418, 58], [476, 96], [306, 138], [370, 160], [436, 128], [494, 160], [352, 40], [470, 40]]
  o.push(label(392, 208, g(sc, 'input_label'), T0 + 0.3))
  const fx = 560
  const fun = `<path d="M${fx} 34L${fx + 130} 95H${fx + 186}V127H${fx + 130}L${fx} 188Z" fill="#3B4252"/>`
    + `<path d="M${fx} 34L${fx + 130} 95H${fx + 186}V100H${fx + 130}L${fx} 42Z" fill="#FFFFFF" opacity=".12"/>`
    + `<text x="${fx + 64}" y="${116}" font-size="14" fill="#FFFFFF" text-anchor="middle">${esc(g(sc, 'filter_label', ''))}</text>`
  o.push(bounce(fx + 93, 111, T0, fun, 1.08))
  let tm = T0
  ins.forEach((ic, i) => {
    const [x, y] = P[i], ti = T0 + 0.15 + i * 0.08
    tm = T0 + 1.15 + i * 0.13
    const chip = `<rect x="${x - 17}" y="${y - 17 + 3}" width="34" height="34" rx="8" fill="${SHADOW}"/>`
      + `<rect x="${x - 17}" y="${y - 17}" width="34" height="34" rx="8" fill="#FFFFFF" stroke="${LINE}" stroke-width="1.2"/>` + icon(ic, x, y, 0.7)
    o.push(`<g>${A('opacity', [1, 1, 0, 0], [0, tm + 0.24, tm + 0.36, D])}<g>`
      + `${A(null, ['0 0', '0 0', `${fx + 30 - x} ${111 - y}`, `${fx + 30 - x} ${111 - y}`], [0, tm, tm + 0.36, D], ['0 0 1 1', '0.5 0 0.9 0.7', '0 0 1 1'], 'translate')}`
      + `${bounce(x, y, ti, chip)}</g></g>`)
  })
  const t = tm + 0.4
  o.push(connector(fx + 192, fx + 222, 111, t - 0.1))
  const [parts] = cardsRow(fx + 232, head_(g(sc, 'items', []), 3), t + 0.1, { cy: 111, maxw: 130 }); o.push(...parts)
  return o
}

// ---- 10. chart 数据对比：柱子长高，右侧亮出结论 ----
function layChart(sc) {
  const o = [], bars = head_(sub(sc, 'bars'), 6), n = bars.length, ax0 = 290, ax1 = 830, base = 176, maxh = 122
  let vmax = pyMax(bars, b => sub(b, 'value'))
  if (!truthy(vmax)) vmax = 1
  /** maxh * b["value"] / vmax */
  const height = v => {
    if (!isNumLike(v) && typeof v !== 'string' && !Array.isArray(v)) throw new PyError('TypeError', `unsupported operand type(s) for *: 'int' and '${typeName(v)}'`)
    if (!isNumLike(v) || !isNumLike(vmax)) throw new PyError('TypeError', `unsupported operand type(s) for /: '${typeName(v)}' and '${typeName(vmax)}'`)
    return maxh * Number(v) / Number(vmax)
  }
  o.push(`<g opacity="0">${show(T0, 0.2)}<line x1="${ax0 - 10}" y1="${base}" x2="${ax1}" y2="${base}" stroke="#C9CED6" stroke-width="2"/></g>`)
  const slot = div(ax1 - ax0, n, false), bw = Math.min(78, slot * 0.56), step = Math.min(0.4, 2.2 / n)
  let t = T0 + 0.2
  const cols = { gray: '#C9CED6', teal: TEAL, orange: OR, blue: BLUE }
  bars.forEach((b, i) => {
    const x = ax0 + slot * i + (slot - bw) / 2, h = Math.max(4, height(sub(b, 'value'))), ti = t + i * step
    const col = tget(cols, g(b, 'color'), i === n - 1 ? OR : '#C9CED6')
    const sp = ['0 0 1 1', '0.2 0.8 0.3 1', '0 0 1 1']
    o.push(`<rect x="${R(x)}" y="${base}" width="${R(bw)}" height="0" rx="6" fill="${col}">`
      + `${A('y', [base, base, R(base - h), R(base - h)], [0, ti, ti + 0.5, D], sp)}${A('height', [0, 0, R(h), R(h)], [0, ti, ti + 0.5, D], sp)}</rect>`)
    o.push(`<rect x="${R(x)}" y="${base - 6}" width="${R(bw)}" height="6" fill="${col}" opacity="0">${show(ti, 0.02)}</rect>`)
    o.push(label(x + bw / 2, base - h - 10, g(b, 'text'), ti + 0.45, 'middle', 15, INK))
    o.push(label(x + bw / 2, base + 22, g(b, 'label'), ti))
  })
  t = t + n * step + 0.3
  const bd = g(sc, 'badge', {}), big = g(bd, 'label', ''), subt = g(bd, 'sub', '')
  const w = Math.max(250, 120 + Math.max(tw(big, 30).v, tw(subt, 13).v)), h = 112, x = 1226 - w, y = 110 - h / 2
  const card = `<rect x="${R(x)}" y="${R(y + 6)}" width="${R(w)}" height="${h}" rx="16" fill="${SHADOW}"/>`
    + `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${h}" rx="16" fill="#FFFFFF" stroke="${LINE}" stroke-width="1.5"/>`
    + `<circle cx="${R(x + 52)}" cy="110" r="30" fill="${TEAL_L}"/>` + icon(g(bd, 'icon', 'chart'), x + 52, 110, 1.3)
    + `<text x="${R(x + 98)}" y="${!truthy(subt) ? 122 : 112}" font-size="30" font-weight="700" fill="${OR}">${esc(big)}</text>`
    + (truthy(subt) ? `<text x="${R(x + 100)}" y="138" font-size="13" fill="${MUT}">${esc(subt)}</text>` : '')
  o.push(bounce(x + w / 2, 110, t, card, 1.1))
  o.push(checkBadge(x + w - 8, y + 6, t + 0.4, 13))
  return o
}

Object.assign(LAYOUTS, { before_after: layBeforeAfter, hub: layHub, stack: layStack, dialog: layDialog, calendar: layCalendar, funnel: layFunnel, chart: layChart })
// ================= style "card": 标题卡横幅（左标题 + 右步骤卡 + 结论按钮） =================
const CW = 1246, CH = 420, TT = 4.4 // 画布、入场动画总时长（只播一次，停在最终画面）
export const THEMES = {
  blue: { main: '#2563EB', light: '#DBEAFE', line: '#93C5FD', border: '#BFDBFE', bg: '#F8FAFC' },
  orange: { main: '#C9643E', light: '#F6E1D6', line: '#E3A688', border: '#EBCBB9', bg: '#FBF8F5' },
  teal: { main: '#12A37F', light: '#D5F2E8', line: '#7FD1B6', border: '#BCE7D8', bg: '#F6FBF9' },
}

/** 只播一次并停住（fill=freeze） */
function Fz(attr, vals, ts, spline = null, typ = null) {
  const kt = ts.map(t => keyTime(t, TT)).join(';'), vs = vals.map(String).join(';')
  let ex = ''
  if (spline) {
    const sp = Array.isArray(spline) ? spline : Array(ts.length - 1).fill(spline)
    ex = ` calcMode="spline" keySplines="${sp.join(';')}"`
  }
  if (typ) return `<animateTransform attributeName="transform" type="${typ}" values="${vs}" keyTimes="${kt}"${ex} dur="${fl(TT)}s" fill="freeze"/>`
  return `<animate attributeName="${attr}" values="${vs}" keyTimes="${kt}"${ex} dur="${fl(TT)}s" fill="freeze"/>`
}

const fIn = (t, d = 0.3) => Fz('opacity', [0, 0, 1, 1], [0, t, t + d, TT])

const fRise = (t, inner, dy = 18, d = 0.4) => `<g opacity="0">${fIn(t, d)}<g>${Fz(null, [`0 ${dy}`, `0 ${dy}`, '0 0', '0 0'], [0, t, t + d, TT], ['0 0 1 1', EASE, '0 0 1 1'], 'translate')}`
  + `${inner}</g></g>`

const fPop = (cx, cy, t, inner, big = 1.08) => `<g opacity="0">${fIn(t, 0.08)}<g transform="translate(${R(cx)} ${R(cy)})"><g>`
  + `${Fz(null, [0.6, 0.6, fl(big), 0.98, 1, 1], [0, t, t + 0.18, t + 0.28, t + 0.36, TT], ['0 0 1 1', '0.3 0 0.6 1', '0.4 0 0.6 1', '0.4 0 0.6 1', '0 0 1 1'], 'scale')}`
  + `<g transform="translate(${R(-cx)} ${R(-cy)})">${inner}</g></g></g></g>`

function lineIcon(name, cx, cy, c, lt, sc = 1.0) {
  const sn = `stroke="${c}" stroke-width="${R(4 / sc)}" stroke-linecap="round" stroke-linejoin="round"`
  const s = 'fill="none" ' + sn
  const I = {
    grid: `<path d="M-12-30V30M12-30V30M-34-11H34M-34 11H34" ${s}/>`,
    code: `<path d="M-20-18L-38 0L-20 18M20-18L38 0L20 18M6-24L-6 24" ${s}/>`,
    play: `<rect x="-36" y="-26" width="72" height="52" rx="6" fill="${lt}"/><path d="M-10-15L16 0L-10 15Z" fill="${c}"/>`,
    doc: `<path d="M-20-30H8L22-16V30H-20Z" ${s}/><path d="M8-30V-16H22M-10-2H12M-10 12H8" ${s}/>`,
    lines: `<path d="M-36-16H36M-36 0H24M-36 16H30" ${s}/>`,
    chat: `<path d="M-32-24H32V14H-6L-20 28V14H-32Z" ${s}/><path d="M-16-6H16" ${s}/>`,
    spark: `<path d="M0-30Q4-4 30 0Q4 4 0 30Q-4 4-30 0Q-4-4 0-30Z" ${s}/>`,
    image: `<rect x="-34" y="-24" width="68" height="48" rx="6" ${s}/><path d="M-30 18L-8-4L6 10L14 2L30 18" ${s}/><circle cx="14" cy="-10" r="5" fill="${c}"/>`,
    mic: `<rect x="-9" y="-30" width="18" height="34" rx="9" ${s}/><path d="M-20-2A20 20 0 0 0 20-2M0 18V28M-12 28H12" ${s}/>`,
    music: `<path d="M-10 20V-24L22-30V14" ${s}/><circle cx="-18" cy="20" r="8" ${s}/><circle cx="14" cy="14" r="8" ${s}/>`,
    bell: `<path d="M-20 14V-4A20 20 0 0 1 20-4V14L26 20H-26Z" ${s}/><path d="M-6 26H6" ${s}/>`,
    calendar: `<rect x="-30" y="-24" width="60" height="52" rx="6" ${s}/><path d="M-30-8H30M-14-32V-18M14-32V-18" ${s}/>`,
    chart: `<rect x="-36" y="-26" width="72" height="52" rx="6" fill="${lt}" opacity=".6"/><path d="M-24 14V2M-12 14V-8M0 14V-2M10-12H28M10 0H28M10 12H22" ${s}/>`,
    mail: `<rect x="-34" y="-22" width="68" height="44" rx="5" ${s}/><path d="M-32-18L0 6L32-18" ${s}/>`,
    person: `<circle cy="-14" r="13" ${s}/><path d="M-26 28Q-26 4 0 4Q26 4 26 28" ${s}/>`,
    cube: `<path d="M0-30L28-15V15L0 30L-28 15V-15Z" fill="${lt}" ${sn}/><path d="M-28-15L0 0L28-15M0 0V30" ${s}/>`,
    game: `<path d="M-24-14H24A14 14 0 0 1 36 4L32 18A8 8 0 0 1 18 22L10 12H-10L-18 22A8 8 0 0 1-32 18L-36 4A14 14 0 0 1-24-14Z" ${s}/><path d="M-20-2V8M-25 3H-15" ${s}/><circle cx="18" cy="0" r="3" fill="${c}"/><circle cx="24" cy="7" r="3" fill="${c}"/>`,
    scissors: `<circle cx="-14" cy="18" r="9" ${s}/><circle cx="14" cy="18" r="9" ${s}/><path d="M-8 11L18-28M8 11L-18-28" ${s}/>`,
    text: `<path d="M-26-24H26M0-24V28M-12 28H12" ${s}/>`,
    wand: `<path d="M-26 26L14-14" ${s}/><path d="M18-34L21-23L32-20L21-17L18-6L15-17L4-20L15-23Z" fill="${c}"/>`,
    robot: `<rect x="-28" y="-18" width="56" height="42" rx="10" ${s}/><path d="M0-18V-30" ${s}/><circle cy="-32" r="3" fill="${c}"/><circle cx="-11" cy="2" r="4" fill="${c}"/><circle cx="11" cy="2" r="4" fill="${c}"/>`,
    web: `<rect x="-40" y="-26" width="80" height="52" rx="3" ${s}/><rect x="-32" y="-18" width="64" height="36" fill="${lt}"/><path d="M-20 10L-10-6H10L20 10" ${s}/><circle cy="4" r="4" fill="${c}"/>`,
    home: `<path d="M-26-4L0-28L26-4V26H-26Z" fill="${lt}" ${sn}/>`,
    dice: `<rect x="-26" y="-26" width="52" height="52" rx="8" ${s}/><circle cx="-11" cy="-11" r="4" fill="${c}"/><circle r="4" fill="${c}"/><circle cx="11" cy="11" r="4" fill="${c}"/>`,
    box: `<rect x="-30" y="-24" width="60" height="48" rx="3" ${s}/><path d="M-30-10H30M-8 2H8" ${s}/>`,
    layers: `<path d="M0-26L30-12L0 2L-30-12Z" ${s}/><path d="M-30 0L0 14L30 0M-30 12L0 26L30 12" ${s}/>`,
    monitor: `<rect x="-34" y="-26" width="68" height="44" rx="5" fill="${lt}" ${sn}/><path d="M-18-10H18M-18 2H10M-12 30H12M0 18V30" ${s}/>`,
    heart: `<path d="M0 26C-36 4-28-26 0-12C28-26 36 4 0 26Z" ${s}/>`,
    film: `<rect x="-36" y="-24" width="72" height="48" rx="5" ${s}/><path d="M-24-24V24M24-24V24M-36-8H-24M-36 8H-24M24-8H36M24 8H36" ${s}/>`,
    scene_wide: `<path d="M-24-28H24L16-16H-16Z" ${s}/><path d="M-40 26H40M32 26V-30H44V26" ${s}/><circle cy="0" r="7" fill="${c}"/><path d="M-12 26L0 6L12 26Z" fill="${c}"/>`,
    scene_mid: `<circle cy="-24" r="11" fill="${c}"/><path d="M-22 30L0-10L22 30Z" fill="${c}"/><path d="M-40 10L-18-2M18-2L40-14" ${s}/>`,
    scene_close: `<path d="M-40 24L-10 4L10 14L40-12" fill="none" stroke="${c}" stroke-width="${R(8 / sc)}" stroke-linecap="round" opacity=".35"/><rect x="-18" y="-24" width="36" height="26" rx="3" fill="#FFFFFF" ${sn}/><path d="M-18-22L0-8L18-22" ${s}/>`,
  }
  return `<g transform="translate(${R(cx)} ${R(cy)}) scale(${fl(sc)})">${tget(I, name, I.spark)}</g>`
}

// ---------- card 右栏通用部件 ----------
const INK2 = '#111827', GRAY = '#6B7280', GRAY2 = '#94A3B8', MONO = '#94A3B8'
const X0 = 592, X1 = 1196

function _txt(x, y, s, size = 16, w = 400, fill = INK2, anchor = 'start', ls = 0) {
  const lsa = ls ? ` letter-spacing="${ls}"` : ''
  return `<text x="${R(x)}" y="${R(y)}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}"${lsa}>${esc(s)}</text>`
}

const _box = (x, y, w, h, stroke, fill = '#FFFFFF', rx = 16, sw = 2) => `<rect x="${R(x)}" y="${R(y)}" width="${R(w)}" height="${R(h)}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`

function _gline(x1, y1, x2, y2, col, t, d = 0.25, sw = 2.5, dash = '') {
  const da = dash ? ` stroke-dasharray="${dash}"` : ''
  return `<line x1="${R(x1)}" y1="${R(y1)}" x2="${R(x1)}" y2="${R(y1)}" stroke="${col}" stroke-width="${sw}" stroke-linecap="round"${da}>`
    + `${Fz('x2', [R(x1), R(x1), R(x2), R(x2)], [0, t, t + d, TT])}${Fz('y2', [R(y1), R(y1), R(y2), R(y2)], [0, t, t + d, TT])}</line>`
}

const _gpath = (d, L, col, t, dur = 0.4, sw = 2.5) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${L}" stroke-dashoffset="${L}">`
  + `${Fz('stroke-dashoffset', [L, L, 0, 0], [0, t, t + dur, TT])}</path>`

/** y 可能是 float（yF） */
const _arrow = (x1, x2, y, col, t, yF = false) => _gline(x1, y, x2 - 2, y, col, t)
  + `<g opacity="0">${fIn(t + 0.22, 0.1)}<path d="M${R(x2 - 10)} ${S({ v: y - 7, f: yF })}L${R(x2)} ${S({ v: y, f: yF })}L${R(x2 - 10)} ${S({ v: y + 7, f: yF })}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></g>`

/** 入场后，k 个元素轮流高亮（其余变淡） */
function _cycle(i, k, each = 1.5, low = 0.4) {
  if (k < 2) return ''
  const e = 0.12 / k, s0 = i / k, s1 = (i + 1) / k
  const P = v => Fv(v), N = v => Iv(v), lo = Fv(low), one = Iv(1)
  let pts
  if (i === 0) pts = [[N(0), one], [P(s1 - e), one], [P(s1), lo], [P(1 - e), lo], [N(1), one]]
  else if (i === k - 1) pts = [[N(0), lo], [P(s0), lo], [P(s0 + e), one], [P(1 - e), one], [N(1), lo]]
  else pts = [[N(0), lo], [P(s0), lo], [P(s0 + e), one], [P(s1 - e), one], [P(s1), lo], [N(1), lo]]
  return `<animate attributeName="opacity" values="${pts.map(([, v]) => S(v)).join(';')}" keyTimes="${pts.map(([p]) => (p.f ? fl(round(p.v, 4)) : String(p.v))).join(';')}" `
    + `dur="${fl(k * each)}s" begin="${fl(TT)}s" repeatCount="indefinite"/>`
}

function _button(y, h, text, th, t, x = X0, w = null, size = 22) {
  w = w || (X1 - x)
  const mid = x + w / 2
  const shine = `<path d="M${x + 14} ${y}h34l-${R(h * 0.35)} ${h}h-34Z" fill="#FFFFFF" opacity="0">`
    + `<animateTransform attributeName="transform" type="translate" values="0 0;${R(w - 60)} 0;${R(w - 60)} 0" keyTimes="0;0.35;1" dur="3.2s" begin="${fl(TT)}s" repeatCount="indefinite"/>`
    + `<animate attributeName="opacity" values="0;0.28;0.28;0;0" keyTimes="0;0.05;0.3;0.35;1" dur="3.2s" begin="${fl(TT)}s" repeatCount="indefinite"/></path>`
  return fPop(mid, y + h / 2, t, `<rect x="${x}" y="${y}" width="${R(w)}" height="${h}" rx="${S(tmin(Iv(16), Fv(h / 2)))}" fill="${th.main}"/>`
    + _txt(mid, y + h / 2 + size * 0.36, text, size, 800, '#FFFFFF', 'middle') + shine, 1.05)
}

const _mono = (x, y, s, t, anchor = 'start') => `<g opacity="0">${fIn(t)}${_txt(x, y, s, 14, 500, MONO, anchor, 2)}</g>`

const _caption = (y, s, th, t) => fRise(t, _txt((X0 + X1) / 2, y, s, 22, 800, th.main, 'middle'), 8)

/** 拿 spec 的列表做 enumerate 前的 x[:n]，x 缺省是 [] */
const items_ = (c, k, n) => head_(g(c, k, []), n)

// ---------- 右栏版式 ----------
function rSteps(c, th, t) {
  const M = th.main, LT = th.light, LN = th.line, BD = th.border, o = []
  const steps = items_(c, 'steps', 4), n = steps.length, gap = 26
  const cw = (X1 - X0 - gap * (n - 1)) / Math.max(n, 1), y0 = 72, h = 150
  steps.forEach((st, i) => {
    const x = X0 + i * (cw + gap), ti = t + i * 0.28
    if (i) o.push(_gline(x - gap, y0 + h / 2, x, y0 + h / 2, LN, ti - 0.1, 0.18))
    const card = _box(x, y0, cw, h, BD, '#FFFFFF', 18) + lineIcon(g(st, 'icon', 'spark'), x + cw / 2, y0 + 56, M, LT) + _txt(x + cw / 2, y0 + 126, g(st, 'label', ''), 19, 700, M, 'middle')
    o.push(fPop(x + cw / 2, y0 + h / 2, ti, card))
  })
  const mid = (X0 + X1) / 2, t2 = t + n * 0.28 + 0.15
  o.push(`<line x1="${fl(mid)}" y1="262" x2="${fl(mid)}" y2="262" stroke="${LN}" stroke-width="2.5">`
    + `${Fz('x1', [mid, mid, mid - 215, mid - 215].map(fl), [0, t2, t2 + 0.35, TT], ['0 0 1 1', EASE, '0 0 1 1'])}${Fz('x2', [mid, mid, mid + 215, mid + 215].map(fl), [0, t2, t2 + 0.35, TT], ['0 0 1 1', EASE, '0 0 1 1'])}</line>`)
  const t3 = t2 + 0.25; o.push(_button(294, 64, g(c, 'result', ''), th, t3))
  const flowRaw = g(c, 'flow')
  const flow = truthy(flowRaw) ? iter(flowRaw) : steps.map(s => g(s, 'label', '')), t4 = t3 + 0.35
  o.push(`<g opacity="0">${fIn(t4, 0.2)}<circle cx="${X0 + 30}" cy="383" r="5" fill="${M}"/></g>`)
  const spans = flow.map((seg, i) => `<tspan fill-opacity="0">${Fz('fill-opacity', [0, 0, 1, 1], [0, t4 + 0.15 * i, t4 + 0.15 * i + 0.2, TT])}${esc(cat(i ? ' → ' : '', seg))}</tspan>`).join('')
  o.push(`<text x="${X0 + 46}" y="389" font-size="16" font-weight="700" fill="#4B5563" xml:space="preserve">${spans}</text>`)
  return o
}

/** 三卡流程（源 → 高亮改造 → 结果）+ 下方镜头轨道 */
function rRemix(c, th, t) {
  const M = th.main, LT = th.light, LN = th.line, BD = th.border, o = []
  const cards = items_(c, 'cards', 3), gap = 50, cw = (X1 - X0 - 2 * gap) / 3, y0 = 64, h = 158
  const centers = []
  cards.forEach((cd, i) => {
    const x = X0 + i * (cw + gap), ti = t + i * 0.35, cx = x + cw / 2; centers.push(cx)
    let inner
    if (truthy(g(cd, 'hl'))) {
      const hy = y0 + 22, hh = h - 44
      inner = _box(x, hy, cw, hh, LN, LT, 16) + _txt(cx, hy + 48, g(cd, 'title', ''), 21, 800, M, 'middle')
        + _txt(cx, hy + 84, g(cd, 'sub', ''), 19, 600, '#475569', 'middle')
    } else {
      const art = g(cd, 'art', 'nodes')
      let a
      if (art === 'nodes') {
        const ax = x + 24, ay = y0 + 70
        a = `<path d="M${R(ax + 48)} ${ay + 13}H${R(ax + 78)}M${R(ax + 30)} ${ay + 26}V${ay + 56}H${R(ax + 78)}" fill="none" stroke="${BD}" stroke-width="2"/>`
          + `<rect x="${R(ax)}" y="${ay}" width="48" height="26" rx="5" fill="#E2E8F0"/><rect x="${R(ax + 78)}" y="${ay}" width="${R(cw - 126)}" height="26" rx="5" fill="${LT}"/>`
          + `<rect x="${R(ax + 78)}" y="${ay + 44}" width="${R(cw - 126)}" height="24" rx="5" fill="${LT}" opacity=".55"/>`
      } else if (art === 'image') {
        const ax = x + 18, ay = y0 + 58, aw = cw - 36
        a = `<rect x="${R(ax)}" y="${ay}" width="${R(aw)}" height="80" rx="6" fill="${LT}"/>`
          + `<path d="M${R(ax)} ${ay + 76}L${R(ax + aw * 0.3)} ${ay + 40}L${R(ax + aw * 0.55)} ${ay + 66}L${R(ax + aw * 0.75)} ${ay + 30}L${R(ax + aw)} ${ay + 70}V${ay + 80}H${R(ax)}Z" fill="${LN}" opacity=".7"/>`
          + `<circle cx="${R(ax + aw / 2)}" cy="${ay + 28}" r="9" fill="${M}"/><path d="M${R(ax + aw / 2 - 18)} ${ay + 58}A18 16 0 0 1 ${R(ax + aw / 2 + 18)} ${ay + 58}Z" fill="${M}"/>`
      } else {
        a = lineIcon(art, cx, y0 + 100, M, LT, 0.85)
      }
      const col = i === cards.length - 1 ? M : '#475569'
      inner = _box(x, y0, cw, h, BD) + _txt(cx, y0 + 34, g(cd, 'title', ''), 19, 800, col, 'middle') + a
    }
    if (i) o.push(_arrow(x - gap + 8, x - 6, y0 + h / 2, LN, ti - 0.15, true))
    o.push(fPop(cx, y0 + h / 2, ti, inner))
  })
  const t2 = t + cards.length * 0.35 + 0.1
  const tx = X0 + (X1 - X0) * 0.5
  if (!centers.length) throw new PyError('IndexError', 'list index out of range')
  const last = centers[centers.length - 1]
  const d = `M${R(last)} ${y0 + h}V${y0 + h + 30}H${R(tx)}V${y0 + h + 60}`, L = round(30 + Math.abs(last - tx) + 30 + 4)
  o.push(_gpath(d, L, LN, t2, 0.35))
  const ty = y0 + h + 60, thh = 76, t3 = t2 + 0.3
  o.push(`<g opacity="0">${fIn(t3)}${_box(X0, ty, X1 - X0, thh, BD)}${_txt(X0 + 22, ty + 26, g(c, 'track_label', 'SHOT'), 14, 700, GRAY2, 'start', 2)}</g>`)
  const segs = iter(g(c, 'track', [0.36, 0.4, 0.24])), wtot = X1 - X0 - 44, cols = [LN, LT, LT]
  let x = X0 + 22
  segs.forEach((f, i) => {
    if (typeof f === 'string' || Array.isArray(f)) throw new PyError('TypeError', `unsupported operand type(s) for -: '${typeName(f)}' and 'int'`)
    const fv = num(f, '*', 'int', false)
    const w = wtot * fv - 10, ti = t3 + 0.15 + i * 0.18
    o.push(`<rect x="${R(x)}" y="${ty + 40}" width="0" height="20" rx="4" fill="${cols[i % 3]}" opacity="${i < 2 ? 1 : 0.6}">${Fz('width', [0, 0, R(w), R(w)], [0, ti, ti + 0.25, TT])}</rect>`)
    x += wtot * fv
  })
  o.push(`<g opacity="0">${fIn(t3 + 0.7)}<rect x="${X0 + 22}" y="${ty + 32}" width="3" height="36" rx="1.5" fill="${M}">`
    + `<animateTransform attributeName="transform" type="translate" values="0 0;${wtot - 4} 0;${wtot - 4} 0" keyTimes="0;0.8;1" dur="4s" begin="${fl(TT)}s" repeatCount="indefinite"/></rect></g>`)
  o.push(_caption(ty + thh + 32, g(c, 'caption', ''), th, t3 + 0.6))
  return o
}

/** 一堆平均方案 → 「选」→ 一张歪着的高亮卡 */
function rPick(c, th, t) {
  const M = th.main, LT = th.light, LN = th.line, o = []
  const gx = X0, gy = 66, tw_ = 60, th_ = 76, gp = 12
  for (let i = 0; i < 6; i++) {
    const r = Math.floor(i / 3), cidx = i % 3, x = gx + cidx * (tw_ + gp), y = gy + r * (th_ + gp)
    const tile = _box(x, y, tw_, th_, '#E2E8F0', '#FFFFFF', 8, 1.5) + `<circle cx="${x + 30}" cy="${y + 24}" r="9" fill="#CBD5E1"/>`
      + `<rect x="${x + 14}" y="${y + 44}" width="32" height="4" rx="2" fill="#CBD5E1"/><rect x="${x + 14}" y="${y + 56}" width="32" height="4" rx="2" fill="#CBD5E1"/>`
    o.push(fPop(x + tw_ / 2, y + th_ / 2, t + i * 0.08, tile))
  }
  o.push(`<g opacity="0">${fIn(t + 0.5)}${_txt(gx + 102, gy + 2 * (th_ + gp) + 20, g(c, 'grid_label', ''), 17, 600, GRAY2, 'middle')}</g>`)
  const t2 = t + 0.7, cy = 152, px = X0 + 300
  o.push(_gline(X0 + 222, cy, px - 34, cy, LN, t2, 0.2))
  o.push(fPop(px, cy, t2 + 0.15, `<circle cx="${px}" cy="${cy}" r="32" fill="${LT}" stroke="${LN}" stroke-width="2"/>` + _txt(px, cy + 9, g(c, 'pick', '选'), 24, 800, M, 'middle'), 1.15))
  o.push(`<g opacity="0">${fIn(t2 + 0.3)}${_txt(px, cy + 60, g(c, 'pick_label', ''), 17, 600, '#475569', 'middle')}</g>`)
  o.push(_arrow(px + 36, X0 + 404, cy, LN, t2 + 0.35))
  const hx = X0 + 418, hy = 44, hw = 176, hh = 236, hc = [hx + hw / 2, hy + hh / 2], t3 = t2 + 0.6
  const card = `<g transform="rotate(5 ${R(hc[0])} ${R(hc[1])})">` + _box(hx, hy, hw, hh, M, '#FFFFFF', 14, 3.5)
    + `<line x1="${hx + 26}" y1="${hy + 24}" x2="${hx + hw - 26}" y2="${hy + 24}" stroke="${LT}" stroke-width="2"/>`
    + _txt(hx + 24, hy + 66, g(c, 'card_title1', ''), 20, 800, INK2) + _txt(hx + 24, hy + 102, g(c, 'card_title2', ''), 28, 800, M)
    + `<circle cx="${hx + 118}" cy="${hy + 168}" r="38" fill="${LT}"/><path d="M${hx + 48} ${hy + 204}L${hx + 96} ${hy + 136}L${hx + 150} ${hy + 200}Z" fill="${M}"/>`
    + `<line x1="${hx + 26}" y1="${hy + hh - 18}" x2="${hx + hw - 26}" y2="${hy + hh - 18}" stroke="${LN}" stroke-width="2"/></g>`
  const float_ = `<g>${card}<animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0" keyTimes="0;0.5;1" dur="3s" begin="${fl(TT)}s" repeatCount="indefinite"/></g>`
  o.push(fPop(hc[0], hc[1], t3, float_, 1.12))
  o.push(_gline(X0, 326, X1, 326, LT, t3 + 0.3, 0.4, 2, '6 7'))
  o.push(_caption(372, g(c, 'caption', ''), th, t3 + 0.5))
  return o
}

/** 竖向时间线：圆点 + 卡片，轮流高亮 */
function rTimeline(c, th, t) {
  const M = th.main, LN = th.line, BD = th.border, o = []
  const items = items_(c, 'items', 4), k = items.length, lx = X0 + 40, cx0 = X0 + 96
  const top = 44, bottom = truthy(g(c, 'result')) ? 344 : 390, gap = 14
  const h = div(bottom - top - gap * (k - 1), k, false), ys = Array.from({ length: k }, (_, i) => top + i * (h + gap))
  o.push(_gline(lx, ys[0] + h / 2, lx, ys[ys.length - 1] + h / 2, LN, t, 0.25 * k, 4))
  items.forEach((it, i) => {
    const y = ys[i], ti = t + i * 0.25, cy = y + h / 2
    const box = _box(cx0, y, X1 - cx0, h, BD, '#FFFFFF', 14)
    const inner = box + _txt(cx0 + 28, truthy(g(it, 'desc')) ? cy - 4 : cy + 8, g(it, 'title', ''), 21, 800, M)
      + (truthy(g(it, 'desc')) ? _txt(cx0 + 28, cy + 24, g(it, 'desc', ''), 16, 400, '#475569') : '')
    const dot = `<circle cx="${lx}" cy="${R(cy)}" r="10" fill="${M}"/>`
    o.push(`<g>${_cycle(i, k)}${fPop(lx, cy, ti + 0.05, dot, 1.4)}${fPop(cx0 + (X1 - cx0) / 2, cy, ti, inner, 1.04)}</g>`)
  })
  if (truthy(g(c, 'result'))) o.push(_button(358, 38, sub(c, 'result'), th, t + k * 0.25 + 0.2, cx0, X1 - cx0, 18))
  return o
}

/** 编号卡并排 → 括号汇合 → 底部大框 */
function rConverge(c, th, t) {
  const M = th.main, LT = th.light, LN = th.line, BD = th.border, o = []
  o.push(_mono((X0 + X1) / 2, 58, g(c, 'caption', ''), t, 'middle'))
  const cards = items_(c, 'cards', 4), n = cards.length, gap = 16, cw = div(X1 - X0 - gap * (n - 1), n, false), y0 = 74, h = 170
  const xs = []
  cards.forEach((cd, i) => {
    const x = X0 + i * (cw + gap), ti = t + 0.15 + i * 0.28; xs.push(x + cw / 2)
    if (i) o.push(_gline(x - gap, y0 + h / 2, x, y0 + h / 2, LN, ti - 0.05, 0.12))
    const inner = _box(x, y0, cw, h, BD) + _txt(x + 22, y0 + 30, g(cd, 'num', ''), 15, 700, GRAY2)
      + lineIcon(g(cd, 'icon', 'doc'), x + cw / 2, y0 + 86, i === 0 ? LN : M, LT, 0.95) + _txt(x + cw / 2, y0 + 146, g(cd, 'label', ''), 20, 800, M, 'middle')
    o.push(fPop(x + cw / 2, y0 + h / 2, ti, inner))
  })
  const t2 = t + 0.15 + n * 0.28, by = y0 + h + 22, mid = (X0 + X1) / 2
  for (const x of xs) o.push(_gline(x, y0 + h, x, by, LN, t2, 0.15))
  o.push(_gline(mid, by, xs[0], by, LN, t2 + 0.15, 0.25)); o.push(_gline(mid, by, xs[xs.length - 1], by, LN, t2 + 0.15, 0.25))
  o.push(_gline(mid, by, mid, by + 18, LN, t2 + 0.35, 0.12))
  const bxY = by + 18, t3 = t2 + 0.45
  const inner = _box(X0, bxY, X1 - X0, 392 - bxY, BD, LT, 16) + _txt(mid, bxY + 40, g(c, 'box_title', ''), 23, 800, M, 'middle')
    + _txt(mid, bxY + 72, g(c, 'box_sub', ''), 17, 500, '#475569', 'middle')
  o.push(fPop(mid, (bxY + 392) / 2, t3, inner, 1.04))
  return o
}

/** 一句话 → 分叉 → 2×2 功能卡（轮流高亮）→ 按钮 */
function rTree(c, th, t) {
  const M = th.main, LT = th.light, LN = th.line, BD = th.border, o = []
  const mid = (X0 + X1) / 2, hw = 440
  o.push(fPop(mid, 70, t, _box(mid - hw / 2, 44, hw, 52, BD, '#FFFFFF', 26) + _txt(mid, 77, g(c, 'head', ''), 20, 500, '#475569', 'middle')))
  const items = items_(c, 'items', 4), gap = 18, cw = (X1 - X0 - gap) / 2, ch = 88, ys = [130, 130 + ch + 14]
  const cxs = [X0 + cw / 2, X0 + cw + gap + cw / 2], t2 = t + 0.3
  o.push(_gline(mid, 96, mid, 112, LN, t2, 0.1))
  o.push(_gline(mid, 112, cxs[0], 112, LN, t2 + 0.1, 0.2)); o.push(_gline(mid, 112, cxs[1], 112, LN, t2 + 0.1, 0.2))
  o.push(_gline(cxs[0], 112, cxs[0], 130, LN, t2 + 0.3, 0.1)); o.push(_gline(cxs[1], 112, cxs[1], 130, LN, t2 + 0.3, 0.1))
  items.forEach((it, i) => {
    const r = Math.floor(i / 2), ci = i % 2, x = X0 + ci * (cw + gap), y = ys[r], ti = t2 + 0.4 + i * 0.15
    const inner = _box(x, y, cw, ch, BD, '#FFFFFF', 14) + lineIcon(g(it, 'icon', 'spark'), x + 46, y + ch / 2, LN, LT, 0.62)
      + _txt(x + 86, y + 38, g(it, 'title', ''), 20, 800, M) + _txt(x + 86, y + 66, g(it, 'desc', ''), 15, 400, GRAY)
    o.push(`<g>${_cycle(i, items.length)}${fPop(x + cw / 2, y + ch / 2, ti, inner, 1.05)}</g>`)
  })
  o.push(_button(338, 54, g(c, 'result', ''), th, t2 + 0.5 + items.length * 0.15, X0, null, 19))
  return o
}

/** 同一题目 → 多家结果并排（轮流高亮）→ 结论按钮 */
function rCompare(c, th, t) {
  const M = th.main, LT = th.light, LN = th.line, BD = th.border, o = []
  o.push(_mono(X0, 56, g(c, 'caption', ''), t))
  const mid = (X0 + X1) / 2
  o.push(fPop(mid, 98, t + 0.1, _box(X0, 72, X1 - X0, 52, BD, LT, 14) + _txt(mid, 105, g(c, 'head', ''), 20, 800, M, 'middle', 2), 1.04))
  const items = items_(c, 'items', 4), n = items.length, gap = 22, cw = div(X1 - X0 - gap * (n - 1), n, false), y0 = 150, h = 132
  const cxs = Array.from({ length: n }, (_, i) => X0 + i * (cw + gap) + cw / 2), t2 = t + 0.4
  o.push(_gline(mid, 124, mid, 138, LN, t2, 0.1))
  o.push(_gline(mid, 138, cxs[0], 138, LN, t2 + 0.1, 0.2)); o.push(_gline(mid, 138, cxs[cxs.length - 1], 138, LN, t2 + 0.1, 0.2))
  for (const x of cxs) o.push(_gline(x, 138, x, y0, LN, t2 + 0.3, 0.08))
  items.forEach((it, i) => {
    const x = X0 + i * (cw + gap), ti = t2 + 0.4 + i * 0.2
    const inner = _box(x, y0, cw, h, BD) + lineIcon(g(it, 'icon', 'web'), x + cw / 2, y0 + 52, LN, LT, 0.95) + _txt(x + cw / 2, y0 + 108, g(it, 'label', ''), 19, 800, '#334155', 'middle')
    o.push(`<g>${_cycle(i, n)}${fPop(x + cw / 2, y0 + h / 2, ti, inner)}</g>`)
  })
  o.push(_button(306, 66, g(c, 'result', ''), th, t2 + 0.5 + n * 0.2))
  return o
}

/** 一个角色 → 分镜（全景/中景/特写，取景框扫过）→ 流程按钮 */
function rStoryboard(c, th, t) {
  const M = th.main, LT = th.light, LN = th.line, BD = th.border, o = []
  o.push(_mono(X0, 56, g(c, 'caption', ''), t))
  const who = g(c, 'who', {}), wx = X0, wy = 72, ww = 152, wh = 186
  const art = truthy(g(who, 'avatar'))
    ? `<image x="${wx + 18}" y="${wy + 18}" width="${ww - 36}" height="120" preserveAspectRatio="xMidYMax meet" href="GIF_URL_HERE"/>`
    : lineIcon(g(who, 'icon', 'person'), wx + ww / 2, wy + 78, M, LT, 1.2)
  o.push(fPop(wx + ww / 2, wy + wh / 2, t + 0.1, _box(wx, wy, ww, wh, BD) + `<rect x="${wx + 16}" y="${wy + 16}" width="${ww - 32}" height="124" rx="10" fill="${LT}" opacity=".6"/>` + art
    + _txt(wx + ww / 2, wy + wh - 18, g(who, 'label', ''), 19, 800, '#1F2937', 'middle')))
  o.push(_arrow(wx + ww + 12, wx + ww + 48, wy + wh / 2, LN, t + 0.4, true))
  const px = wx + ww + 60, pw = X1 - px, t2 = t + 0.55
  o.push(fPop(px + pw / 2, wy + wh / 2, t2, _box(px, wy, pw, wh, BD) + `<line x1="${px + 18}" y1="${wy + 20}" x2="${X1 - 18}" y2="${wy + 20}" stroke="${LT}" stroke-width="6" stroke-dasharray="18 12"/>`, 1.03))
  const shots = items_(c, 'shots', 3), n = Math.max(shots.length, 1), gg = 14, sw = (pw - 36 - gg * (n - 1)) / n, sy = wy + 38, sh = 104
  shots.forEach((sh_, i) => {
    const x = px + 18 + i * (sw + gg), ti = t2 + 0.3 + i * 0.22
    o.push(fPop(x + sw / 2, sy + sh / 2, ti, `<rect x="${R(x)}" y="${sy}" width="${R(sw)}" height="${sh}" rx="8" fill="${LT}" opacity=".7"/>`
      + lineIcon(g(sh_, 'icon', 'image'), x + sw / 2, sy + sh / 2, M, LT, 0.9) + _txt(x + sw / 2, sy + sh + 30, g(sh_, 'label', ''), 16, 500, GRAY, 'middle')))
  })
  const fr = `<rect x="${R(px + 16)}" y="${sy - 3}" width="${R(sw + 4)}" height="${sh + 6}" rx="10" fill="none" stroke="${M}" stroke-width="3">`
    + (n === 3 ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;${R(sw + gg)} 0;${R(sw + gg)} 0;${R(2 * (sw + gg))} 0;${R(2 * (sw + gg))} 0;0 0" keyTimes="0;0.25;0.33;0.58;0.66;0.92;1" dur="4.5s" begin="${fl(TT)}s" repeatCount="indefinite"/>` : '') + '</rect>'
  o.push(`<g opacity="0">${Fz('opacity', [0, 0, 1, 1], [0, TT - 0.3, TT, TT])}${fr}</g>`)
  const t3 = t2 + 0.4 + n * 0.22, by = 296, bh = 66
  const flow = iter(g(c, 'flow', []))
  const spans = flow.map((seg, i) => `<tspan fill-opacity="0">${Fz('fill-opacity', [0, 0, 1, 1], [0, t3 + 0.3 + 0.18 * i, t3 + 0.5 + 0.18 * i, TT])}${esc(cat(i ? ' → ' : '', seg))}</tspan>`).join('')
  o.push(fPop((X0 + X1) / 2, by + bh / 2, t3, `<rect x="${X0}" y="${by}" width="${X1 - X0}" height="${bh}" rx="16" fill="${M}"/><circle cx="${X0 + 38}" cy="${fl(by + bh / 2)}" r="6" fill="#FFFFFF" opacity=".6"/>`
    + `<text x="${X0 + 64}" y="${fl(by + bh / 2 + 8)}" font-size="22" font-weight="800" fill="#FFFFFF" xml:space="preserve">${spans}</text>`, 1.04))
  return o
}

/** 聊天窗口里来回几句 → 弹出交付卡 */
function rChat(c, th, t) {
  const M = th.main, LT = th.light, LN = th.line, BD = th.border, o = []
  const msgs = items_(c, 'messages', 4)
  for (const m of msgs) g(m, 'from')
  const wx = X0, ww = 372, wh = 58 + msgs.length * 54, wy = 46 + (270 - wh) / 2
  o.push(fPop(wx + ww / 2, wy + wh / 2, t, _box(wx, wy, ww, wh, BD) + [0, 1, 2].map(i => `<circle cx="${wx + 20 + i * 12}" cy="${fl(wy + 20)}" r="4" fill="#CBD5E1"/>`).join('')
    + (truthy(g(c, 'window_title')) ? _txt(wx + ww / 2, wy + 25, sub(c, 'window_title'), 14, 600, GRAY2, 'middle') : ''), 1.03))
  let y = wy + 44, tt = t + 0.3
  for (const m of msgs) {
    const s = g(m, 'text', ''), bw = tw(s, 16).v + 32, bh = 38
    if (g(m, 'from') === 'me') {
      const bx = wx + ww - 18 - bw
      o.push(fPop(bx + bw, y + bh / 2, tt, `<rect x="${R(bx)}" y="${fl(y)}" width="${R(bw)}" height="${bh}" rx="19" fill="${M}"/>` + _txt(bx + 16, y + 25, s, 16, 600, '#FFFFFF'), 1.06)); tt += 0.32
    } else {
      const bx = wx + 18
      const dots = [0, 1, 2].map(i => `<circle cx="${bx + 18 + i * 11}" cy="${fl(y + bh / 2)}" r="3.5" fill="${LN}"/>`).join('')
      o.push(`<g opacity="0">${Fz('opacity', [0, 0, 1, 1, 0, 0], [0, tt, tt + 0.05, tt + 0.3, tt + 0.35, TT])}<rect x="${bx}" y="${fl(y)}" width="58" height="${bh}" rx="19" fill="${LT}"/>${dots}</g>`); tt += 0.32
      o.push(fPop(bx, y + bh / 2, tt, `<rect x="${R(bx)}" y="${fl(y)}" width="${R(bw)}" height="${bh}" rx="19" fill="${LT}"/>` + _txt(bx + 16, y + 25, s, 16, 600, '#1E293B'), 1.06)); tt += 0.32
    }
    y += bh + 16
  }
  o.push(_arrow(wx + ww + 12, wx + ww + 50, 181, LN, tt))
  const rx = wx + ww + 62, rw = X1 - rx, ry = 66, rh = 230; tt += 0.25
  const inner = _box(rx, ry, rw, rh, M, '#FFFFFF', 16, 3) + `<rect x="${rx + 20}" y="${ry + 20}" width="${rw - 40}" height="96" rx="10" fill="${LT}"/>`
    + lineIcon(g(c, 'result_icon', 'doc'), rx + rw / 2, ry + 68, M, LT, 0.85)
    + _txt(rx + rw / 2, ry + 156, g(c, 'result_title', ''), 22, 800, M, 'middle') + _txt(rx + rw / 2, ry + 188, g(c, 'result_sub', ''), 16, 500, GRAY, 'middle')
  o.push(fPop(rx + rw / 2, ry + rh / 2, tt, inner, 1.08))
  o.push(_caption(368, g(c, 'caption', ''), th, tt + 0.3))
  return o
}

/** 2–3 个大数字，下划线长出来 → 结论按钮 */
function rStats(c, th, t) {
  const M = th.main, LT = th.light, LN = th.line, BD = th.border, o = []
  o.push(_mono(X0, 56, g(c, 'caption', ''), t))
  const items = items_(c, 'items', 3), n = items.length, gap = 40, cw = div(X1 - X0 - gap * (n - 1), n, false), y0 = 72, h = 196
  items.forEach((it, i) => {
    const x = X0 + i * (cw + gap), ti = t + 0.15 + i * 0.35, cx = x + cw / 2
    const hl = truthy(g(it, 'hl', i === n - 1))
    const inner = _box(x, y0, cw, h, hl ? M : BD, hl ? LT : '#FFFFFF', 18, hl ? 3 : 2)
      + _txt(cx, y0 + 48, g(it, 'label', ''), 17, 700, '#475569', 'middle')
      + _txt(cx, y0 + 122, g(it, 'value', ''), 52, 800, hl ? M : '#334155', 'middle')
      + _txt(cx, y0 + 170, g(it, 'note', ''), 15, 400, GRAY2, 'middle')
    if (i) o.push(`<g opacity="0">${fIn(ti - 0.1)}${_txt(x - gap / 2, y0 + h / 2 + 10, '→', 26, 800, LN, 'middle')}</g>`)
    o.push(fPop(cx, y0 + h / 2, ti, inner, 1.08))
    o.push(`<rect x="${R(cx - 50)}" y="${y0 + 136}" width="0" height="5" rx="2.5" fill="${hl ? M : LN}">${Fz('width', [0, 0, 100, 100], [0, ti + 0.3, ti + 0.6, TT])}</rect>`)
  })
  o.push(_button(300, 64, g(c, 'result', ''), th, t + 0.3 + n * 0.35))
  return o
}

/** 待办清单逐项打勾，进度条走满 */
function rChecklist(c, th, t) {
  const M = th.main, LT = th.light, LN = th.line, BD = th.border, o = []
  const items = items_(c, 'items', 5), n = items.length, x = X0, w = X1 - X0, rowh = 40, h = 74 + n * rowh + 34
  const yv = tmax(Iv(44), Fv((CH - h - 60) / 2)), y = yv.v, ys = v => S({ v, f: yv.f })
  o.push(fPop(x + w / 2, y + h / 2, t, _box(x, y, w, h, BD) + _txt(x + 26, y + 40, g(c, 'title', ''), 21, 800, INK2)
    + `<rect x="${x + 26}" y="${ys(y + h - 28)}" width="${w - 52}" height="8" rx="4" fill="${LT}"/>`, 1.03))
  const tt = t + 0.35, step = Math.min(0.35, 1.8 / Math.max(n, 1))
  items.forEach((s, i) => {
    const ry = y + 66 + i * rowh, ti = tt + i * step
    o.push(`<g opacity="0">${fIn(ti - 0.15)}<rect x="${x + 26}" y="${ys(ry)}" width="24" height="24" rx="6" fill="#FFFFFF" stroke="${LN}" stroke-width="2"/>${_txt(x + 64, ry + 19, s, 18, 500, '#334155')}</g>`)
    o.push(fPop(x + 38, ry + 12, ti + 0.1, `<rect x="${x + 26}" y="${ys(ry)}" width="24" height="24" rx="6" fill="${M}"/><path d="M${x + 32} ${ys(ry + 12)}l5 5l9 -10" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`, 1.3))
  })
  const pw = w - 52
  o.push(`<rect x="${x + 26}" y="${ys(y + h - 28)}" width="0" height="8" rx="4" fill="${M}">${Fz('width', [0, 0, pw, pw], [0, tt, tt + n * step + 0.2, TT])}</rect>`)
  o.push(`<g opacity="0">${fIn(tt + n * step)}${_txt(x + w - 26, y + 40, g(c, 'done', `${n}/${n} 完成`), 17, 800, M, 'end')}</g>`)
  o.push(_caption(y + h + 44, g(c, 'caption', ''), th, tt + n * step + 0.2))
  return o
}

/** 深色终端：命令一行行出现，最后亮绿勾 */
function rTerminal(c, th, t) {
  const LN = th.line, o = []
  const lines = items_(c, 'lines', 6), x = X0, w = X1 - X0, h = 70 + (lines.length + 1) * 34
  const yv = tmax(Iv(44), Fv((CH - h - 60) / 2)), y = yv.v, ys = v => S({ v, f: yv.f })
  o.push(fPop(x + w / 2, y + h / 2, t, `<rect x="${x}" y="${ys(y)}" width="${w}" height="${h}" rx="16" fill="#0F172A"/>`
    + ['#F87171', '#FBBF24', '#34D399'].map((col, i) => `<circle cx="${x + 22 + i * 16}" cy="${ys(y + 22)}" r="5" fill="${col}"/>`).join('')
    + _txt(x + w / 2, y + 27, g(c, 'title', ''), 14, 600, '#64748B', 'middle'), 1.03))
  const cols = { cmd: '#E2E8F0', out: '#94A3B8', ok: '#34D399' }
  let ly = y + 70, tt = t + 0.35
  for (const ln of lines) {
    const typ = g(ln, 'type', 'out'), s = g(ln, 'text', '')
    const pre = typ === 'cmd' ? '$ ' : typ === 'ok' ? '✓ ' : '  '
    o.push(`<g opacity="0">${fIn(tt, 0.12)}<text x="${x + 28}" y="${ys(ly)}" font-size="17" font-weight="${typ !== 'out' ? 700 : 400}" fill="${lookup(cols, typ)}" font-family="Menlo,Consolas,monospace" xml:space="preserve">`
      + `<tspan fill="${LN}">${esc(pre)}</tspan>${esc(s)}</text></g>`)
    tw(cat(pre, s), 17); ly += 34; tt += typ === 'cmd' ? 0.4 : 0.22
  }
  o.push(`<g opacity="0">${Fz('opacity', [0, 0, 1, 1], [0, tt, tt + 0.05, TT])}<text x="${x + 28}" y="${ys(ly)}" font-size="17" font-weight="700" fill="${LN}" font-family="Menlo,Consolas,monospace">$</text>`
    + `<rect x="${x + 46}" y="${ys(ly - 15)}" width="10" height="19" fill="#E2E8F0"><animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.5;0.5;1" dur="1s" begin="${fl(TT)}s" repeatCount="indefinite"/></rect></g>`)
  o.push(_caption(y + h + 44, g(c, 'caption', ''), th, tt + 0.1))
  return o
}

const RIGHTS = { steps: rSteps, remix: rRemix, pick: rPick, timeline: rTimeline, converge: rConverge, tree: rTree,
  compare: rCompare, storyboard: rStoryboard, chat: rChat, stats: rStats, checklist: rChecklist, terminal: rTerminal }

// ================= 风格三/四：大字海报（poster）和潮酷（neo）=================
/** {**x}：x 必须是字典 */
function mapping(v) {
  if (!isDict(v)) throw new PyError('TypeError', `'${typeName(v)}' object is not a mapping`)
  return v
}

function buildCard(spec, themes) {
  const card = mapping(sub(spec, 'card'))
  const c = { ...card, ...mapping(g(spec, 'brand', {})) }, th = tget(themes, g(c, 'theme', 'blue'), themes.blue)
  const M = th.main, LT = th.light, BD = th.border, BG = th.bg
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" width="100%" style="display:block;width:100%;height:auto;max-width:${CW}px;margin:0 auto;background:transparent;font-family:'PingFang SC','Helvetica Neue',sans-serif">`]
  o.push(fPop(CW / 2, CH / 2, 0, `<rect x="10" y="10" width="${CW - 20}" height="${CH - 20}" rx="34" fill="${BG}" stroke="${BD}" stroke-width="2"/>`, 1.01))
  const L = 70
  const dot = `<circle cx="${L + 8}" cy="62" r="6" fill="${M}"/>`
    + `<circle cx="${L + 8}" cy="62" r="6" fill="none" stroke="${M}" stroke-width="2" opacity="0">`
    + `<animate attributeName="r" values="6;16;16" keyTimes="0;0.5;1" dur="2.4s" begin="${fl(TT)}s" repeatCount="indefinite"/>`
    + `<animate attributeName="opacity" values="0.6;0;0" keyTimes="0;0.5;1" dur="2.4s" begin="${fl(TT)}s" repeatCount="indefinite"/></circle>`
  o.push(`<g opacity="0">${fIn(0.25)}${dot}<text x="${L + 28}" y="69" font-size="17" font-weight="700" letter-spacing="1" fill="${M}">${esc(g(c, 'eyebrow', ''))}</text></g>`)
  o.push(fRise(0.4, `<text x="${L}" y="150" font-size="46" font-weight="800" fill="${INK2}">${esc(g(c, 'title1', ''))}</text>`))
  o.push(fRise(0.6, `<text x="${L}" y="218" font-size="46" font-weight="800" fill="${M}">${esc(g(c, 'title2', ''))}</text>`))
  o.push(`<rect x="${L}" y="250" width="0" height="7" rx="3.5" fill="${M}">${Fz('width', [0, 0, 90, 90], [0, 0.85, 1.2, TT], ['0 0 1 1', EASE, '0 0 1 1'])}</rect>`)
  o.push(fRise(1.0, `<text x="${L}" y="302" font-size="21" fill="${GRAY}">${esc(g(c, 'sub', ''))}</text>`, 10))
  if (truthy(g(c, 'avatar', true))) {
    o.push(fPop(L + 36, 356, 1.2, `<circle cx="${L + 36}" cy="358" r="34" fill="${LT}"/><image x="${L - 6}" y="314" width="84" height="80" preserveAspectRatio="xMidYMax meet" href="GIF_URL_HERE"/>`))
    const author = g(c, 'author', '林月半子的AI笔记')
    const slogan = g(c, 'slogan', '我是林月半子，教你用AI干掉90%的重复劳动')
    o.push(fRise(1.35, _pt(L + 86, 352, author, _fit(author, 18, 350), '#1F2937', 700)
      + _pt(L + 86, 378, slogan, _fit(slogan, 14, 350), '#9CA3AF', 400), 8))
  } else if (truthy(g(spec, 'brand'))) {
    o.push(fRise(1.35, _pt(L, 352, g(c, 'author', ''), _fit(g(c, 'author', ''), 18, 460), '#1F2937', 700)
      + _pt(L, 378, g(c, 'slogan', ''), _fit(g(c, 'slogan', ''), 14, 460), '#9CA3AF', 400), 8))
  } else {
    o.push(fRise(1.2, `<text x="${L}" y="372" font-size="15" letter-spacing="1" fill="#9CA3AF">${esc(g(c, 'foot', g(c, 'eyebrow', '')))}</text>`, 8))
  }
  o.push(`<line x1="548" y1="72" x2="548" y2="72" stroke="${LT}" stroke-width="2">${Fz('y2', [72, 72, 372, 372], [0, 0.5, 1.0, TT], ['0 0 1 1', EASE, '0 0 1 1'])}</line>`)
  o.push(...lookup(RIGHTS, g(c, 'right', 'steps'))(c, th, 1.1))
  o.push('</svg>')
  return o.join('')
}

// 按手机可读设计：一条横幅只放 2–3 个元素，最小的字也有 30px（手机上约 9px）
const _pw = (t, size) => chars(pyStr(t)).reduce((a, ch) => a + (ord(ch) > 255 ? size : size * 0.58), 0)
const _fit = (t, size, maxw) => Math.trunc(Math.min(size, size * maxw / Math.max(_pw(t, size), 1)))
const _pt = (x, y, t, size, fill, w = 800, anchor = 'start', extra = '') => `<text x="${R(x)}" y="${R(y)}" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}"${extra}>${esc(pyStr(t))}</text>`
const _pcheck = (cx, cy, r = 28) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${TEAL}" stroke="#FFFFFF" stroke-width="5"/>`
  + `<path d="M${R(cx - r * 0.42)} ${cy}l${R(r * 0.3)} ${R(r * 0.32)}l${R(r * 0.56)} ${R(-r * 0.6)}" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`

function buildPoster(spec, neo, themes) {
  let c = g(spec, 'poster')
  if (!truthy(c)) c = g(spec, 'card')
  if (!truthy(c)) c = {}
  const th = tget(themes, g(c, 'theme', 'orange'), themes.orange)
  const M = th.main, LT = th.light, BG = th.bg
  const K = '#111827', H_ = neo ? 484 : 460
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${H_}" width="100%" style="display:block;width:100%;height:auto;max-width:${CW}px;margin:0 auto;background:transparent;font-family:'PingFang SC','Helvetica Neue',sans-serif">`]
  /** 右栏的块：海报是圆角浅色块，潮酷是三层淡色叠出的柔和阴影 */
  const panel = (x, y, w, h, fill, rot = 0, rx = 30) => {
    if (!neo) return [`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${fill !== M ? LT : M}" stroke-width="3"/>`, '']
    const sh = [0, 1, 2].map(k => `<rect x="${x + 4 - k * 2}" y="${y + 8 + k * 4}" width="${w - 8 + k * 4}" height="${h}" rx="${rx}" fill="#0F172A" opacity="0.035"/>`).join('')
    return [sh + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${fill === M ? M : LT}" stroke-width="2"/>`, '']
  }
  const t1 = g(c, 'title1', ''), t2 = g(c, 'title2', ''), eb = g(c, 'eyebrow', '')
  let fs, ay
  if (neo) {
    const big = pyStr(g(c, 'big', ''))
    o.push([0, 1, 2].map(k => `<rect x="${14 - k * 3}" y="${14 + k * 5}" width="${CW - 28 + k * 6}" height="${H_ - 36}" rx="40" fill="#0F172A" opacity="0.03"/>`).join('')
      + `<rect x="8" y="3" width="${CW - 16}" height="${H_ - 30}" rx="38" fill="#FFFFFF" stroke="${LT}" stroke-width="2.5"/>`)
    if (big) o.push(`<text x="${CW - 64}" y="${H_ - 62}" font-size="${_fit(big, 300, 500)}" font-weight="900" font-style="italic" fill="${LT}" opacity="0.5" text-anchor="end" font-family="Helvetica,Arial,sans-serif" letter-spacing="-10">${esc(big)}</text>`)
    const ew = _pw(eb, 30) + pyLen(eb) * 3 + 86
    o.push(`<rect x="60" y="48" width="${R(ew)}" height="58" rx="29" fill="${K}"/><circle cx="92" cy="77" r="7" fill="${M}"/>` + _pt(60 + ew / 2 + 12, 88, eb, 30, '#FFFFFF', 800, 'middle', ' letter-spacing="3"'))
    fs = Math.min(_fit(t1, 82, 640), _fit(t2, 80, 590))
    o.push(_pt(60, 210, t1, fs, K, 900))
    const sw = _pw(t2, fs) + 48
    o.push(fRise(0.3, `<rect x="56" y="240" width="${R(sw)}" height="108" rx="20" fill="${M}"/>` + _pt(80, 294 + fs * 0.34, t2, fs, '#FFFFFF', 900), 24))
    ay = 404
  } else {
    o.push(`<rect x="2" y="2" width="${CW - 4}" height="${H_ - 4}" rx="40" fill="${BG}" stroke="${LT}" stroke-width="3"/>`)
    o.push(`<circle cx="76" cy="76" r="10" fill="${M}"><animate attributeName="r" values="10;14;10" dur="2s" repeatCount="indefinite"/></circle>` + _pt(100, 88, eb, 32, M, 800, 'start', ' letter-spacing="3"'))
    fs = Math.min(_fit(t1, 80, 640), _fit(t2, 80, 640))
    o.push(_pt(60, 196, t1, fs, K, 900)); o.push(fRise(0.3, _pt(60, 300, t2, fs, M, 900), 20))
    o.push(`<rect x="64" y="330" width="0" height="12" rx="6" fill="${M}">${Fz('width', [0, 0, 110, 110], [0, 0.6, 1.0, TT], ['0 0 1 1', EASE, '0 0 1 1'])}</rect>`)
    ay = 404
  }
  if (truthy(g(c, 'avatar', true))) {
    const brand = g(spec, 'brand', {})
    const author = g(brand, 'author', g(c, 'author', '林月半子的AI笔记'))
    const slogan = g(brand, 'slogan')
    o.push(`<circle cx="96" cy="${ay}" r="34" fill="${LT}"/>`
      + `<image x="54" y="${ay - 44}" width="84" height="80" preserveAspectRatio="xMidYMax meet" href="GIF_URL_HERE"/>`
      + _pt(146, truthy(slogan) ? ay : ay + 12, author, _fit(author, 33, 570), K, neo ? 900 : 800))
    if (truthy(slogan)) o.push(_pt(146, ay + 28, slogan, _fit(slogan, 18, 570), K, 400))
  } else if (truthy(g(spec, 'brand'))) {
    const brand = sub(spec, 'brand')
    const author = g(brand, 'author', ''), slogan = g(brand, 'slogan', '')
    if (truthy(author)) o.push(_pt(60, truthy(slogan) ? ay : ay + 12, author, _fit(author, 33, 640), K, 800))
    if (truthy(slogan)) o.push(_pt(60, ay + 28, slogan, _fit(slogan, 18, 640), K, 400))
  }
  // ---- 右栏 ----
  const X = 770, W_ = 400, top = neo ? 60 : 56
  let r = g(c, 'right')
  if (!truthy(r)) r = neo && truthy(g(c, 'tags')) ? 'tags' : 'flow'
  if (r === 'tags') {
    let tg0 = g(c, 'tags')
    if (!truthy(tg0)) tg0 = []
    const tags = head_(tg0, 3)
    // gap 只在 2–3 个时算出来，且都大于 40，所以 y 恒为整数
    const gap = tags.length > 1 ? (H_ - 100 - tags.length * 88) / Math.max(tags.length - 1, 1) : 0
    tags.forEach((tg, i) => {
      const y = 50 + i * (88 + Math.min(gap, 40)) + (tags.length === 3 ? 0 : 60), hl = i === 1 || tags.length === 1
      const x = X + 40, w = 320
      const [a, b] = panel(x, y, w, 88, hl ? M : '#FFFFFF', 0, 44)
      o.push(fPop(x + w / 2, y + 44, 0.9 + i * 0.3, a + _pt(x + w / 2, y + 44 + 15, tg, _fit(tg, 42, w - 50), hl ? '#FFFFFF' : K, 900, 'middle') + b))
    })
  } else if (r === 'stat') {
    const [a, b] = panel(X, top + 20, W_, H_ - 2 * top - 50, '#FFFFFF', -2)
    const v = pyStr(g(c, 'value', '')), cy = H_ / 2
    o.push(fPop(X + W_ / 2, cy, 0.9, a + _pt(X + W_ / 2, cy - 78, g(c, 'label', ''), 34, GRAY, 700, 'middle')
      + _pt(X + W_ / 2, cy + 44, v, _fit(v, 120, W_ - 60), M, 900, 'middle') + _pt(X + W_ / 2, cy + 104, g(c, 'note', ''), 30, K, 700, 'middle') + b))
  } else if (r === 'steps') {
    let s0 = g(c, 'steps')
    if (!truthy(s0)) s0 = []
    const st_ = head_(s0, 3), hh = 92, y0 = (H_ - (st_.length * hh + (st_.length - 1) * 18)) / 2 - (neo ? 6 : 0)
    st_.forEach((tx, i) => {
      const y = y0 + i * (hh + 18), last = i === st_.length - 1
      const [a, b] = panel(X, round(y), W_, hh, last ? M : '#FFFFFF')
      o.push(fRise(0.9 + i * 0.35, a + `<circle cx="${X + 52}" cy="${R(y + hh / 2)}" r="26" fill="${last ? '#FFFFFF' : M}"/>`
        + _pt(X + 52, y + hh / 2 + 11, i + 1, 30, last ? M : '#FFFFFF', 900, 'middle')
        + _pt(X + 96, y + hh / 2 + 14, tx, _fit(tx, 38, W_ - 120), last ? '#FFFFFF' : K, 800) + b, 22))
    })
  } else { // flow：一句话 → 结果
    const ask = g(c, 'ask', ''), res = g(c, 'result', ''), sb = g(c, 'result_sub', '')
    let [a, b] = panel(X, top, W_, 116, '#FFFFFF', -3)
    const tail = neo ? '' : `<path d="M${X + 330} ${top + 114}l40 40l-4 -42z" fill="#FFFFFF" stroke="${LT}" stroke-width="3"/><rect x="${X + 320}" y="${top + 104}" width="60" height="12" fill="#FFFFFF"/>`
    o.push(fRise(0.9, a + tail + _pt(X + W_ / 2, top + 74, ask, _fit(ask, 44, W_ - 50), K, 800, 'middle') + b, 22))
    o.push(fRise(1.5, `<path d="M${fl(X + W_ / 2)} ${top + 142}v52m-18 -20l18 22l18 -22" fill="none" stroke="${M}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`, -14, 0.3))
    const y2 = top + 214;
    [a, b] = panel(X, y2, W_, 140, M, 2)
    const ic = `<circle cx="${X + 80}" cy="${y2 + 70}" r="42" fill="#FFFFFF"/><path d="M${X + 66} ${y2 + 46}v48l40 -24z" fill="${M}"/>`
    o.push(fRise(1.9, a + ic + _pt(X + 146, y2 + (truthy(sb) ? 60 : 86), res, _fit(res, 46, W_ - 170), '#FFFFFF', 900)
      + (truthy(sb) ? `<text x="${X + 146}" y="${y2 + 106}" font-size="${_fit(sb, 30, W_ - 170)}" font-weight="500" fill="#FFFFFF" opacity="0.88">${esc(sb)}</text>` : '') + b, 26))
    o.push(fPop(X + W_ - 8, y2 + 6, 2.4, _pcheck(X + W_ - 8, y2 + 6, 30)))
  }
  o.push('</svg>')
  return o.join('')
}

/**
 * 画一条横幅，返回 SVG 字符串。themes 用来替换标题卡 / 海报 / 潮酷的配色表（跟着正文配色走时用）。
 * spec 写错时抛 PyError，name/message 与原 Python 脚本的异常一致。
 */
export function build(spec, themes = THEMES) {
  const st = g(spec, 'style')
  if (st === 'poster' || st === 'neo') return buildPoster(spec, sub(spec, 'style') === 'neo', themes)
  if (st === 'card') return buildCard(spec, themes)
  const o = head(g(spec, 'brand'))
  const sc = sub(spec, 'scene')
  o.push(`<g opacity="0">${A('opacity', [0, 0, 1, 1, 0, 0], [0, 2.3, 2.4, 6.7, 6.9, D])}`)
  o.push(...lookup(LAYOUTS, sub(sc, 'layout'))(sc))
  if (truthy(g(spec, 'caption'))) o.push(label(1236, 22, sub(spec, 'caption'), T0 + 0.3, 'end', 12))
  o.push('</g></svg>')
  return o.join('')
}

// ---------------- 文字自查（代替截图）----------------
const _w = t => chars(pyStr(t)).reduce((a, ch) => a + (ord(ch) > 255 ? 1 : 0.5), 0)
/** format(v, 'g') */
function fmtG(v) {
  let s = v.toPrecision(6)
  if (s.includes('e')) {
    let [m, e] = s.split('e')
    if (m.includes('.')) m = m.replace(/0+$/, '').replace(/\.$/, '')
    return `${m}e${e[0]}${e.slice(1).padStart(2, '0')}`
  }
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '')
  return s
}
/** Python 的 a == b（JSON 值） */
function pyEq(a, b) {
  const na = typeof a === 'number' || typeof a === 'boolean', nb = typeof b === 'number' || typeof b === 'boolean'
  if (na || nb) return na && nb && Number(a) === Number(b)
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null)
  if (typeof a === 'string' || typeof b === 'string') return a === b
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => pyEq(x, b[i]))
  const ka = Object.keys(a), kb = Object.keys(b)
  return ka.length === kb.length && ka.every(k => Object.hasOwn(b, k) && pyEq(a[k], b[k]))
}
/** 字典 o in container */
function dictIn(o, container) {
  if (Array.isArray(container)) return container.some(x => x === o || pyEq(x, o))
  if (typeof container === 'string') throw new PyError('TypeError', "'in <string>' requires string as left operand, not dict")
  if (isDict(container)) throw new PyError('TypeError', "unhashable type: 'dict'")
  throw new PyError('TypeError', `argument of type '${typeName(container)}' is not iterable`)
}
/** 列表 / 字符串的 a + b */
function pyAdd(a, b) {
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) throw new PyError('TypeError', `can only concatenate list (not "${typeName(b)}") to list`)
    return [...a, ...b]
  }
  if (typeof a === 'string') {
    if (typeof b !== 'string') throw new PyError('TypeError', `can only concatenate str (not "${typeName(b)}") to str`)
    return a + b
  }
  const isNum = v => typeof v === 'number' || typeof v === 'boolean'
  if (isNum(a) && isNum(b)) return Number(a) + Number(b)
  throw new PyError('TypeError', `unsupported operand type(s) for +: '${typeName(a)}' and '${typeName(b)}'`)
}
const has = (table, k) => { hashable(k); return typeof k === 'string' && Object.hasOwn(table, k) }
const PY_WS_ATTR = new RegExp(`[${PY_WS}](id|class)="`, 'u')

/** 查字数、数量超限和公众号会吞掉的写法。返回问题列表，空 = 通过 */
export function checkSpec(spec, svgs) {
  const out = []
  const lim = (v, n, what) => {
    if (v !== null && v !== undefined && _w(v) > n) out.push(`${what}「${pyStr(v)}」有 ${fmtG(_w(v))} 个字宽，超过 ${n}，会挤出去或重叠，缩短一点`)
  }
  const cnt = (v, lo, hi, what) => {
    if (v !== null && v !== undefined && !(lo <= pyLen(v) && pyLen(v) <= hi)) out.push(`${what} 有 ${pyLen(v)} 个，要在 ${lo}–${hi} 个之间，多出来的会画不下`)
  }
  const or_ = (v, d) => (truthy(v) ? v : d)
  const st = g(spec, 'style')
  if (st === 'poster' || st === 'neo') {
    const c = g(spec, 'poster', {})
    let r = g(c, 'right')
    if (!truthy(r)) r = sub(spec, 'style') === 'neo' && truthy(g(c, 'tags')) ? 'tags' : 'flow'
    lim(g(c, 'eyebrow'), 10, '眉标 eyebrow'); lim(g(c, 'title1'), 8, '标题第一行'); lim(g(c, 'title2'), 8, '标题第二行'); lim(g(c, 'big'), 2, '底纹大字 big')
    if (!['flow', 'tags', 'stat', 'steps'].includes(r)) out.push(`没有「${pyStr(r)}」这个右栏，可选：flow、tags、stat、steps`)
    if (r === 'flow') {
      for (const [k, n] of [['ask', 9], ['result', 6], ['result_sub', 9]]) lim(g(c, k), n, k)
      if (!truthy(g(c, 'ask')) || !truthy(g(c, 'result'))) out.push('flow 右栏要写 ask（你说的一句话）和 result（得到的结果）')
    }
    if (r === 'tags') {
      cnt(or_(g(c, 'tags'), []), 2, 3, 'tags')
      for (const x of iter(or_(g(c, 'tags'), []))) lim(x, 6, '贴纸')
    }
    if (r === 'steps') {
      cnt(or_(g(c, 'steps'), []), 2, 3, 'steps')
      for (const x of iter(or_(g(c, 'steps'), []))) lim(x, 8, '步骤')
    }
    if (r === 'stat') { lim(g(c, 'value'), 5, '大数字 value'); lim(g(c, 'label'), 10, 'label'); lim(g(c, 'note'), 12, 'note') }
  } else if (st === 'card') {
    const c = g(spec, 'card', {}), r = g(c, 'right', 'steps')
    lim(g(c, 'eyebrow'), 15, '眉标 eyebrow'); lim(g(c, 'title1'), 9, '标题第一行'); lim(g(c, 'title2'), 9, '标题第二行'); lim(g(c, 'sub'), 20, '副标题')
    if (!has(RIGHTS, r)) out.push(`没有「${pyStr(r)}」这个右栏版式，可选：${Object.keys(RIGHTS).join('、')}`)
    for (const k of ['caption', 'result', 'result_title', 'result_sub', 'head', 'box_title', 'box_sub', 'pick_label', 'grid_label']) lim(g(c, k), 18, k)
    for (const [k, [lo, hi]] of Object.entries({ steps: [2, 4], items: [2, 5], cards: [2, 4], shots: [3, 3], messages: [1, 4], lines: [1, 6] })) {
      if (Object.hasOwn(c, k)) cnt(c[k], lo, hi, k)
    }
    let all = pyAdd(or_(g(c, 'steps'), []), or_(g(c, 'cards'), []))
    all = pyAdd(all, or_(g(c, 'shots'), []))
    all = pyAdd(all, iter(or_(g(c, 'items'), [])).filter(isDict))
    for (const it of iter(all)) {
      lim(g(it, 'label'), 8, '卡片标题'); lim(g(it, 'title'), 8, '卡片标题'); lim(g(it, 'desc'), 14, '卡片描述'); lim(g(it, 'sub'), 14, '卡片描述')
    }
    for (const m of iter(or_(g(c, 'messages'), []))) lim(g(m, 'text'), 12, '聊天气泡')
    for (const l of iter(or_(g(c, 'lines'), []))) lim(g(l, 'text'), 17, '终端一行')
    if (r === 'checklist') for (const x of iter(or_(g(c, 'items'), []))) lim(x, 14, '清单一项')
  } else {
    const sc = g(spec, 'scene', {}), lay = g(sc, 'layout', '')
    if (!has(LAYOUTS, lay)) { out.push(`没有「${pyStr(lay)}」这个场景模板，可选：${Object.keys(LAYOUTS).join('、')}`); return out }
    lim(g(spec, 'caption'), 14, '右上角 caption')
    const caps = {
      pipeline: ['items', 1, g(sc, 'tile') === 'card' || !truthy(g(sc, 'source')) ? 5 : 4], path: ['nodes', 3, 5], fly: ['items', 0, 4],
      before_after: ['items', 1, 4], hub: ['nodes', 2, 6], stack: ['blocks', 2, 6], dialog: ['items', 0, 3],
      calendar: ['days', 3, 7], funnel: ['items', 1, 3], chart: ['bars', 2, 6],
    }
    if (Object.hasOwn(caps, lay) && Object.hasOwn(sc, caps[lay][0])) cnt(sc[caps[lay][0]], caps[lay][1], caps[lay][2], caps[lay][0])
    if (lay === 'pipeline' && g(sc, 'tile') === 'film') cnt(or_(g(sc, 'items'), []), 1, 4, '胶片帧 items')
    if (lay === 'before_after') cnt(or_(g(sc, 'before'), []), 1, 7, 'before')
    if (lay === 'funnel') { cnt(or_(g(sc, 'inputs'), []), 1, 10, 'inputs'); lim(g(sc, 'filter_label'), 5, 'filter_label') }
    if (lay === 'dialog') {
      cnt(or_(g(sc, 'messages'), []), 1, 4, 'messages')
      for (const m of iter(or_(g(sc, 'messages'), []))) lim(g(m, 'text'), 12, '聊天气泡')
    }
    const walk = o => {
      if (isDict(o)) {
        if (Object.hasOwn(o, 'label')) lim(o.label, lay === 'stack' && dictIn(o, or_(g(sc, 'blocks'), [])) ? 5 : 8, '标签')
        for (const v of Object.values(o)) walk(v)
      } else if (Array.isArray(o)) {
        for (const v of o) walk(v)
      }
    }
    walk(sc)
    for (const k of ['before_label', 'after_label', 'input_label', 'start_label', 'left_label', 'device_label']) lim(g(sc, k), 10, k)
  }
  for (const sv of svgs) {
    if (PY_WS_ATTR.test(sv) || sv.includes('<style') || sv.includes('<script') || sv.includes('Gradient') || sv.includes('<use')) {
      out.push('生成的 SVG 里有 id/class/style/script/渐变/use，公众号会吞掉'); break
    }
  }
  return out
}
