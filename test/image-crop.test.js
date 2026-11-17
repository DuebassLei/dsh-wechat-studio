import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deflateSync } from 'node:zlib'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'
import { cropCover } from '../src/image-crop.js'

const crcTable = (() => {
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()
const crc32 = buf => {
  let crc = 0xffffffff
  for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function makeCoordinatePng(width, height) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const off = y * (width * 3 + 1)
    for (let x = 0; x < width; x++) { const p = off + 1 + x * 3; raw[p] = x; raw[p + 1] = y; raw[p + 2] = 0 }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

test('已是精确 47:20 的 PNG 原样返回，不重编码', () => {
  const png = makeCoordinatePng(94, 40)
  assert.ok(cropCover(png, 'png').equals(png))
})

test('偏宽的 PNG 水平中心裁切到 47:20', () => {
  const out = cropCover(makeCoordinatePng(100, 40), 'png')
  const decoded = PNG.sync.read(out)
  assert.equal(decoded.width, 94)
  assert.equal(decoded.height, 40)
  assert.equal(decoded.data[0], 3)
  assert.equal(decoded.data[1], 0)
})

test('偏高的 PNG 垂直中心裁切到 47:20', () => {
  const out = cropCover(makeCoordinatePng(94, 50), 'png')
  const decoded = PNG.sync.read(out)
  assert.equal(decoded.width, 94)
  assert.equal(decoded.height, 40)
  assert.equal(decoded.data[0], 0)
  assert.equal(decoded.data[1], 5)
})

test('JPEG 解码裁切后重编码，尺寸精确', () => {
  const width = 100, height = 40
  const data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4
      data[p] = x * 2; data[p + 1] = y * 4; data[p + 2] = 128; data[p + 3] = 255
    }
  }
  const source = jpeg.encode({ data, width, height }, 95).data
  const out = cropCover(source, 'jpeg')
  assert.equal(out.toString('hex', 0, 3), 'ffd8ff')
  const decoded = jpeg.decode(out)
  assert.equal(decoded.width, 94)
  assert.equal(decoded.height, 40)
})

test('尺寸不足 47:20 时报错', () => {
  assert.throws(() => cropCover(makeCoordinatePng(40, 20), 'png'), /Invalid image dimensions/)
})

test('尺寸超过上限时在完整解码前报错', () => {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(4701, 0); ihdr.writeUInt32BE(2000, 4)
  const headerOnly = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr)])
  assert.throws(() => cropCover(headerOnly, 'png'), /Invalid image dimensions/)
})
