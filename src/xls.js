// 微信后台导出的两种「xls」：真正的 BIFF8 复合文档，或套着 xls 后缀的 HTML 表格。
// 只解析导出里实际出现的记录类型，遇到没见过的关键记录就报错，不猜数据。

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

/** 把导出文件解析成 { sheets: [{ name, rows }] }，rows 是二维数组，单元格为 string | number | boolean | null。 */
export function parseWorkbook(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  if (buf.subarray(0, 8).equals(OLE_MAGIC)) return parseXls(buf)
  const text = buf.toString('utf8').replace(/^﻿/, '')
  if (/<\s*(html|table|!doctype)/i.test(text.slice(0, 2000))) return { sheets: parseHtmlTables(text) }
  throw new Error('认不出这个文件：既不是 Excel 复合文档，也不是 HTML 表格。请直接从公众号后台重新导出。')
}

// ---------- OLE2 复合文档：取出 Workbook 流 ----------

function oleStream(buf, wanted) {
  if (buf.length < 512) throw new Error('文件不完整')
  const sectorSize = 1 << buf.readUInt16LE(0x1e)
  const miniSize = 1 << buf.readUInt16LE(0x20)
  const miniCutoff = buf.readUInt32LE(0x38)
  const sector = id => buf.subarray(512 + id * sectorSize, 512 + (id + 1) * sectorSize)

  // DIFAT：头 109 个 FAT 扇区号在文件头里，更多的挂在 DIFAT 链上
  const fatIds = []
  for (let i = 0; i < 109; i++) {
    const id = buf.readUInt32LE(0x4c + i * 4)
    if (id === 0xffffffff) break
    fatIds.push(id)
  }
  let difat = buf.readUInt32LE(0x44)
  const difatCount = buf.readUInt32LE(0x48)
  for (let n = 0; n < difatCount && difat !== 0xffffffff && difat !== 0xfffffffe; n++) {
    const block = sector(difat)
    for (let i = 0; i < sectorSize / 4 - 1; i++) {
      const id = block.readUInt32LE(i * 4)
      if (id === 0xffffffff) break
      fatIds.push(id)
    }
    difat = block.readUInt32LE(sectorSize - 4)
  }
  const fat = Buffer.concat(fatIds.map(sector))
  const next = id => fat.readUInt32LE(id * 4)
  const chain = (start, table, nextId) => {
    const parts = []
    let id = start
    let guard = 0
    while (id !== 0xfffffffe && id !== 0xffffffff) {
      if (++guard > 1_000_000) throw new Error('文件扇区链损坏')
      parts.push(table(id))
      id = nextId(id)
    }
    return Buffer.concat(parts)
  }

  const dir = chain(buf.readUInt32LE(0x30), sector, next)
  let root = null
  let target = null
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const nameLen = dir.readUInt16LE(off + 0x40)
    if (nameLen < 2) continue
    const name = dir.subarray(off, off + nameLen - 2).toString('utf16le')
    const entry = { name, type: dir[off + 0x42], start: dir.readUInt32LE(off + 0x74), size: dir.readUInt32LE(off + 0x78) }
    if (entry.type === 5) root = entry
    if (entry.type === 2 && name.toLowerCase() === wanted) target = entry
  }
  if (!target) throw new Error('文件里没有找到 Workbook 流')
  if (target.size >= miniCutoff) return chain(target.start, sector, next).subarray(0, target.size)

  // 小流走 MiniFAT，数据挂在根目录项的流里
  const miniFat = chain(buf.readUInt32LE(0x3c), sector, next)
  const miniNext = id => miniFat.readUInt32LE(id * 4)
  const miniStream = chain(root.start, sector, next)
  const parts = []
  let id = target.start
  let guard = 0
  while (id !== 0xfffffffe && id !== 0xffffffff) {
    if (++guard > 1_000_000) throw new Error('文件扇区链损坏')
    parts.push(miniStream.subarray(id * miniSize, (id + 1) * miniSize))
    id = miniNext(id)
  }
  return Buffer.concat(parts).subarray(0, target.size)
}

// ---------- BIFF8 ----------

function rkValue(rk) {
  const value = rk & 0x2 ? (rk >> 2) : (() => {
    const b = Buffer.alloc(8)
    b.writeUInt32LE(rk & 0xfffffffc, 4)
    return b.readDoubleLE(0)
  })()
  return rk & 0x1 ? value / 100 : value
}

/** XLUnicodeString：字符数 u16 + 标志 u8（bit0=0 压缩单字节，=1 UTF-16LE）。 */
function readUnicodeString(buf, pos) {
  const count = buf.readUInt16LE(pos)
  const wide = buf[pos + 2] & 0x1
  const start = pos + 3
  const bytes = count * (wide ? 2 : 1)
  const text = wide ? buf.subarray(start, start + bytes).toString('utf16le') : buf.subarray(start, start + bytes).toString('latin1')
  return { text, end: start + bytes }
}

function parseXls(buf) {
  const stream = oleStream(buf, 'workbook')
  // 先扫一遍记录：SST（含 CONTINUE）和 BOUNDSHEET 在全局区，单元格在各 sheet 的 BOF..EOF 里
  const records = []
  for (let pos = 0; pos + 4 <= stream.length;) {
    const type = stream.readUInt16LE(pos)
    const size = stream.readUInt16LE(pos + 2)
    records.push({ type, data: stream.subarray(pos + 4, pos + 4 + size), at: pos })
    pos += 4 + size
  }
  const sst = readSst(records)
  const sheets = []
  const bounds = records.filter(r => r.type === 0x85)
  for (const bound of bounds) {
    // BOUNDSHEET 的表名是 ShortXLUnicodeString：字符数 u8 + 标志 u8
    const count = bound.data[6]
    const wide = bound.data[7] & 0x1
    const name = wide ? bound.data.subarray(8, 8 + count * 2).toString('utf16le') : bound.data.subarray(8, 8 + count).toString('latin1')
    const start = bound.data.readUInt32LE(0)
    const rows = new Map()
    let maxCol = 0
    const put = (row, col, value) => {
      if (!rows.has(row)) rows.set(row, new Map())
      rows.get(row).set(col, value)
      maxCol = Math.max(maxCol, col)
    }
    for (let pos = start; pos + 4 <= stream.length;) {
      const type = stream.readUInt16LE(pos)
      const size = stream.readUInt16LE(pos + 2)
      const data = stream.subarray(pos + 4, pos + 4 + size)
      pos += 4 + size
      if (type === 0x0a) break // EOF
      if (type === 0xfd) put(data.readUInt16LE(0), data.readUInt16LE(2), sst[data.readUInt32LE(6)] ?? null) // LABELSST
      else if (type === 0x204) put(data.readUInt16LE(0), data.readUInt16LE(2), readUnicodeString(data, 6).text) // LABEL
      else if (type === 0x203) put(data.readUInt16LE(0), data.readUInt16LE(2), data.readDoubleLE(6)) // NUMBER
      else if (type === 0x27e) put(data.readUInt16LE(0), data.readUInt16LE(2), rkValue(data.readUInt32LE(6))) // RK
      else if (type === 0xbd) { // MULRK：row, firstCol, [ixfe(2) + rk(4)]…, lastCol
        const row = data.readUInt16LE(0)
        const firstCol = data.readUInt16LE(2)
        for (let p = 4; p + 6 <= data.length - 2; p += 6) put(row, firstCol + (p - 4) / 6, rkValue(data.readUInt32LE(p + 2)))
      } else if (type === 0x205) put(data.readUInt16LE(0), data.readUInt16LE(2), data[7] ? null : Boolean(data[6])) // BOOLERR
      else if (type === 0x06 && data.readUInt16LE(12) !== 0xffff) put(data.readUInt16LE(0), data.readUInt16LE(2), data.readDoubleLE(6)) // FORMULA 缓存数值
    }
    const grid = []
    for (const [row, cells] of rows) {
      const line = Array(maxCol + 1).fill(null)
      for (const [col, value] of cells) line[col] = value
      grid[row] = line
    }
    sheets.push({ name, rows: Array.from(grid, row => row ?? []) })
  }
  if (!sheets.length) throw new Error('Excel 文件里没有工作表')
  return { sheets }
}

/** SST 的字符串可能跨 CONTINUE 记录，边界处会重发一个 grbit 字节，按记录边界读。 */
function readSst(records) {
  const index = records.findIndex(r => r.type === 0xfc)
  if (index === -1) return []
  const chunks = [records[index].data]
  for (let i = index + 1; i < records.length && records[i].type === 0x3c; i++) chunks.push(records[i].data)
  const boundaries = []
  let total = 0
  for (const chunk of chunks) { total += chunk.length; boundaries.push(total) }
  const buf = Buffer.concat(chunks)
  const unique = buf.readUInt32LE(4)
  let pos = 8
  let chunkIndex = 0
  const strings = []
  const remaining = () => boundaries[chunkIndex] - pos
  const crossBoundary = () => { chunkIndex++ }
  for (let n = 0; n < unique; n++) {
    let count = buf.readUInt16LE(pos)
    let wide = buf[pos + 2] & 0x1
    pos += 3
    let text = ''
    while (count > 0) {
      if (remaining() === 0) { crossBoundary(); wide = buf[pos] & 0x1; pos++ }
      const take = Math.min(count, Math.floor(remaining() / (wide ? 2 : 1)))
      const bytes = take * (wide ? 2 : 1)
      text += wide ? buf.subarray(pos, pos + bytes).toString('utf16le') : buf.subarray(pos, pos + bytes).toString('latin1')
      pos += bytes
      count -= take
    }
    strings.push(text)
  }
  return strings
}

// ---------- HTML 表格（微信「用户增长」等导出是这种） ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code) => {
    if (code[0] === '#') {
      const num = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(num) ? String.fromCodePoint(num) : all
    }
    return ENTITIES[code.toLowerCase()] ?? all
  })
}

function cellText(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

export function parseHtmlTables(text) {
  const sheets = []
  const tables = text.match(/<table[\s\S]*?<\/table>/gi) ?? []
  for (const table of tables) {
    const rows = []
    for (const rowHtml of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
      const cells = []
      for (const cell of rowHtml.match(/<(th|td)\b[^>]*>[\s\S]*?<\/\1>/gi) ?? []) {
        const colspan = Number(/colspan\s*=\s*["']?(\d+)/i.exec(cell)?.[1] ?? 1)
        const value = cellText(cell.replace(/^<t[hd][^>]*>/i, '').replace(/<\/t[hd]>$/i, ''))
        for (let i = 0; i < Math.min(colspan, 50); i++) cells.push(value)
      }
      if (cells.some(value => value !== '')) rows.push(cells)
    }
    if (rows.length) sheets.push({ name: '', rows })
  }
  if (!sheets.length) throw new Error('HTML 里没有找到数据表格')
  return sheets
}