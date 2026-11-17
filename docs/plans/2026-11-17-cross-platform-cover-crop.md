# 跨平台封面裁切（去掉 macOS sips 依赖）Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 用纯 JS 的图片解码/裁切/编码替换 `saveCover` 里的 macOS `sips` 调用，让 Windows / Linux 用户也能生成封面。

**Architecture:** 沿用 unpdf 的既有模式：pngjs + jpeg-js 只作为 devDependencies，用 esbuild 打包成 `dist/image-crop.mjs`，运行时由 `src/cover.js` 懒加载，插件保持零运行时依赖。裁切算法与现在完全一致：读出真实宽高，取最大的整数倍 47:20 矩形做中心裁切；若原图已是精确 47:20 则直接保存原字节（免重编码、无损）。不引入 sharp（原生二进制会破坏「装上就能跑」的分发模型），不做「macOS 走 sips、其他平台走 JS」的双路径（DRY）。

**Tech Stack:** Node 20+、esbuild（已有）、pngjs ^7.0.0、jpeg-js ^0.4.4、node:test（已有测试框架）。

**背景（执行者需要知道的）：**
- 封面由生图 API 生成，但比例不保证精确 2.35:1：火山方舟只传 `1K/1.5K/2K` 档位（src/cover.js:17），比例由模型决定；百炼显式宽高取整后 2K 档是 2048×872 ≈ 2.3486:1（src/cover-options.js:22）。所以落盘前必须中心裁切。
- 现状：`saveCover`（src/cover.js:90-112）写临时文件 → `sips -g` 读宽高 → `sips --cropToHeightWidth` 裁切 → rename。只有 macOS 有 sips。
- `saveCover` 全仓库只有一个调用点：src/host.js:116（封面后台任务里）。函数签名 `saveCover(root, image, format)` 和返回值（封面 id）不变，host.js 无需改动。
- 打包模型看 scripts/build.mjs 顶部注释和 src/report.js:36 的 `await import('../dist/unpdf.mjs')`——新模块照抄这个模式。
- 测试命令：`npm test`（即 `node --test test/*.test.js`）。构建：`npm run build`。
- Commit message 用英文 conventional 短句风格。
- 建议在独立 worktree 中执行（可用 using-git-worktrees skill 创建）。

---

### Task 1: 纯 JS 裁切模块 cropCover

**Files:**
- Modify: `package.json`（devDependencies 加 pngjs、jpeg-js）
- Create: `src/image-crop.js`
- Test: `test/image-crop.test.js`

**Step 1: 安装依赖**

Run: `npm install --save-dev pngjs@^7.0.0 jpeg-js@^0.4.4`
Expected: package.json 的 devDependencies 出现这两项，安装成功。注意只进 devDependencies，不进 dependencies。

**Step 2: 写失败测试**

Create `test/image-crop.test.js`：

```js
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
// 像素颜色编码坐标：r=x, g=y, b=0，用来验证裁切取的是中心区域。
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
  // 100 宽裁到 94，左边去掉 3 列：新图 (0,0) 对应原图 x=3
  assert.equal(decoded.data[0], 3)
  assert.equal(decoded.data[1], 0)
})

test('偏高的 PNG 垂直中心裁切到 47:20', () => {
  const out = cropCover(makeCoordinatePng(94, 50), 'png')
  const decoded = PNG.sync.read(out)
  assert.equal(decoded.width, 94)
  assert.equal(decoded.height, 40)
  // 50 高裁到 40，上边去掉 5 行：新图 (0,0) 对应原图 y=5
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
```

**Step 3: 跑测试确认失败**

Run: `node --test test/image-crop.test.js`
Expected: FAIL，报 `Cannot find module .../src/image-crop.js`（模块还不存在）。

**Step 4: 最小实现**

Create `src/image-crop.js`：

```js
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

// 47:20 = 公众号封面 2.35:1。units 上限 100 沿用 sips 版本的尺寸闸。
export function cropCover(image, format) {
  const decoded = format === 'jpeg' ? jpeg.decode(image) : PNG.sync.read(image)
  const { width, height, data } = decoded
  const units = Math.min(Math.floor(width / 47), Math.floor(height / 20))
  if (!units || units > 100) throw new Error('Invalid image dimensions')
  const cropWidth = units * 47
  const cropHeight = units * 20
  if (cropWidth === width && cropHeight === height) return image
  const left = Math.floor((width - cropWidth) / 2)
  const top = Math.floor((height - cropHeight) / 2)
  const out = Buffer.alloc(cropWidth * cropHeight * 4)
  for (let y = 0; y < cropHeight; y++) {
    const start = ((top + y) * width + left) * 4
    data.copy(out, y * cropWidth * 4, start, start + cropWidth * 4)
  }
  return format === 'jpeg'
    ? jpeg.encode({ data: out, width: cropWidth, height: cropHeight }, 90).data
    : PNG.sync.write({ data: out, width: cropWidth, height: cropHeight })
}
```

说明：pngjs 和 jpeg-js 解码结果都是 RGBA 的 `data` Buffer，裁切就是逐行 copy 中心矩形。JPEG 重编码质量取 90（sips 裁切同样会重编码，画质损失相当）。

**Step 5: 跑测试确认通过**

Run: `node --test test/image-crop.test.js`
Expected: PASS，5 个测试全绿。

**Step 6: Commit**

```bash
git add package.json package-lock.json src/image-crop.js test/image-crop.test.js
git commit -m "feat: add pure-js cover crop module"
```

---

### Task 2: 打包进 dist 并替换 saveCover 的 sips 实现

**Files:**
- Modify: `scripts/build.mjs`（新增第三个打包目标）
- Modify: `src/cover.js:1-9`（删 execFile/promisify 相关导入）、`src/cover.js:90-112`（重写 saveCover）
- Test: `test/cover.test.js`（追加 saveCover 测试）

**Step 1: 写失败测试**

在 `test/cover.test.js` 顶部导入区追加：

```js
import { readdir } from 'node:fs/promises'
import { PNG } from 'pngjs'
import { readCover, saveCover } from '../src/cover.js'
```

（`generateBailianCover` 已在导入列表里，把 `readCover, saveCover` 合并进同一行即可。）

在文件末尾追加测试：

```js
test('saveCover：跨平台裁切落盘，失败提示不再依赖 sips', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ws-save-cover-'))
  const id = await saveCover(root, makePng(100, 40), 'png')
  const decoded = PNG.sync.read(await readCover(root, id))
  assert.equal(decoded.width, 94)
  assert.equal(decoded.height, 40)
  assert.deepEqual(await readdir(join(root, 'covers')), [`${id}.png`], '不留临时文件')
  await assert.rejects(
    saveCover(root, Buffer.from('not an image'), 'png'),
    error => !/sips/.test(error.message) && /封面裁切或保存失败/.test(error.message),
  )
})
```

**Step 2: 跑测试确认失败**

Run: `node --test test/cover.test.js`
Expected: 新测试 FAIL——坏图片走 sips 失败后，现有错误文案是「请确认 DSH 宿主可运行 macOS 的 sips」，断言 `!/sips/` 不满足。（在 macOS 上裁切部分本身会过，失败点就在文案断言，这正是 TDD 钩子。）

**Step 3: 改构建脚本**

在 `scripts/build.mjs` 的 `const pdf = {...}` 之后、`await build(pdf)` 之前加：

```js
const imageCrop = {
  stdin: { contents: "export { cropCover } from './src/image-crop.js'", resolveDir: process.cwd() },
  outfile: 'dist/image-crop.mjs',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  minify: true,
  legalComments: 'none',
}
```

并把 `await build(pdf)` 改为：

```js
await build(pdf)
await build(imageCrop)
```

同时把顶部注释第 2 条扩成两句，说明 dist/unpdf.mjs 读朱雀报告 PDF、dist/image-crop.mjs 裁切封面，都是打进来后零运行时依赖。

**Step 4: 构建并验证产物**

Run: `npm run build && node -e "import('./dist/image-crop.mjs').then(m => console.log(typeof m.cropCover))"`
Expected: 构建无报错，输出 `function`。

**Step 5: 重写 saveCover**

`src/cover.js` 顶部导入改为（删掉 execFile、promisify、rename、rm，它们不再被用到）：

```js
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BAILIAN_SIZES } from './cover-options.js'
export { coverPrompt } from './cover-prompt.js'

const MAX_IMAGE = 24 * 1024 * 1024
```

（即删除第 1 行 `import { execFile } ...`、第 5 行 `import { promisify } ...` 和第 9 行 `const run = promisify(execFile)`。）

`saveCover` 整体替换为：

```js
export async function saveCover(root, image, format) {
  const dir = join(root, 'covers')
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const id = randomUUID()
  try {
    const { cropCover } = await import('../dist/image-crop.mjs')
    const cropped = cropCover(image, format)
    await writeFile(join(dir, `${id}.${format}`), cropped, { mode: 0o600 })
    return id
  } catch {
    throw new Error('封面裁切或保存失败，请重试。')
  }
}
```

不再需要临时文件、rename 和 finally 清理——裁切在内存里完成，一次写盘。`readCover` 和两个 generate 函数不动。

**Step 6: 跑测试确认通过**

Run: `node --test test/cover.test.js`
Expected: PASS，包括新测试和原有全部封面路由测试（它们现在不再依赖 sips）。

**Step 7: 跑全量测试**

Run: `npm test`
Expected: 全部 PASS。

**Step 8: Commit**

```bash
git add scripts/build.mjs src/cover.js test/cover.test.js dist/image-crop.mjs
git commit -m "feat: crop covers in pure js instead of macos sips"
```

（dist/client.js、dist/unpdf.mjs 若因重新构建产生 diff，一并 add 进本次提交；仓库本来就跟踪 dist。）

---

### Task 3: 更新 README 并确认 sips 痕迹清干净

**Files:**
- Modify: `README.md:75`

**Step 1: 改 README**

把第 75 行中的：

```
排版需要 Python 3，使用 Python 标准库；封面裁切目前依赖 macOS 的 `sips`。
```

改为：

```
排版需要 Python 3，使用 Python 标准库；封面裁切为内置纯 JS 实现，Windows / macOS / Linux 均可用。
```

**Step 2: 全仓库确认无残留依赖**

Run: `grep -rn "sips" src/ scripts/ README.md test/`
Expected: 无输出。（docs/plans/ 里的历史计划文档提到 sips 属正常，不改；src/cover-options.js:21 和 scripts/dev.mjs:104 的注释只提 saveCover 裁切，仍然准确，保留。）

**Step 3: 最终验证**

Run: `npm run build && npm test`
Expected: 构建成功，全部测试 PASS。

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: cover crop is cross-platform now"
```

---

## 风险与备注

- **jpeg-js 兼容性**：jpeg-js 支持 baseline 和 progressive JPEG，但个别极端编码可能解码失败。火山方舟返回的 JPEG 是常规编码，风险低；若线上遇到，错误会落进封面任务的 `record.errors`（src/host.js:117-120），单张失败不影响其他张。
- **性能**：2K 图约 180 万像素，纯 JS 解码+编码约 1-3 秒，封面后台任务本身生图就要几十秒，可接受。已是精确 47:20 的图（百炼 1K/1.5K 档）走原字节直存，零开销。
- **内存**：jpeg-js 默认解码内存上限 512MB，24MB 上限的 JPEG 最坏情况也在范围内，不需调参。
- **Windows 真机验证**：本计划所有测试在任意平台可跑（不再 spawn 子进程），但合并前最好在一台 Windows 机器上跑一次 `npm test` 和真实封面生成做冒烟验证；没有条件时在 PR 里注明未做 Windows 真机验证。