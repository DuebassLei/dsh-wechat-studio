# 朱雀 API 与 PDF 检测结果展示优化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 API 与 PDF 检测都展示总体占比，并明确区分 API 置信度和 PDF 片段 AIGC，避免用户把两种分数当成同一指标比较。

**Architecture:** 在 `src/report.js` 中从 PDF 的片段汇总表确定性地计算人工、疑似 AI、AI 占比，不让模型做算术，也不改变现有段落映射和分类规则。计算成功时优先采用该结果并记录 `overallDerived`；无法取得完整表格时沿用现有模型解析结果。前端只调整说明和标签，不把两种分数换算成同一个值。

**Tech Stack:** Node 20+、React 18、node:test、现有 esbuild 构建，不新增依赖。

---

## 已确认的事实与边界

- 示例 PDF 的片段为：28.16% / 0.8233、12.11% / 0.9970、15.81% / 0.9698、43.93% / 0.9988。
- 按分类汇总后，疑似 AI 为 43.97%，AI 为 56.04%；保留一位小数分别为 44%、56%，与 API 的总体结果一致。
- PDF 提取文本没有直接的总体百分比，当前 `applyReport` 因而保存 `overall: null`。
- API 的 `conf` 是分类置信度；PDF 的 AIGC 是片段分数。现有 `markBlocks` 的分类逻辑正确，本计划不修改阈值、片段映射、噪声带或一键处理规则。
- 一个 PDF 片段可覆盖多个段落，所以多个段落显示相同的片段 AIGC 是预期行为。
- 已对 `~/Downloads/朱雀AI检测助手-1.pdf` 实测两条提取路径：`pdftotext -layout` 每条汇总行独占一行、列间为宽空格；unpdf 兜底也是每行一条，但「片段」写作康熙部首字符（⽚段，U+2F5A 等），必须先做 NFKC 归一化才能匹配。归一化后两条路径都算出 `{ human: 0, suspect: 44, ai: 56 }`。
- 详情区的「NO. 1 片段1 AIGC值 0.8233」行以 NO. 开头，不匹配汇总行的数字开头模式，天然被排除。
- 参考文件：`src/report.js`、`src/zhuque.js`、`src/pipeline.js:340-367`、`client/app.jsx:450-475`、`client/app.jsx:1017-1058`、`test/host.test.js`。
- 测试命令：`npm test`；构建命令：`npm run build`。提交信息使用英文 conventional 短句。

### Task 1: 从 PDF 片段表计算总体占比

**Files:**
- Modify: `src/report.js`
- Test: `test/host.test.js`

**Step 1: 写失败测试**

在 `test/host.test.js` 的 PDF/朱雀测试附近加入以下常量和测试，并把 `reportOverall` 加入 `src/report.js` 的导入列表。fixture 取自真实报告 `朱雀AI检测助手-1.pdf` 的提取结果：`REPORT_PDF_LAYOUT` 是 `pdftotext -layout` 的原样输出（宽空格），`REPORT_PDF_UNPDF` 是 unpdf 兜底的原样输出（注意「⽚段」是康熙部首字符，不是普通的「片段」）：

```js
const REPORT_SUMMARY = `序号 片段 占全文比例 占字符数 AIGC值
1 片段1 50% 100 0.8233
2 片段2 50% 100 0.9970`

const REPORT_PDF_LAYOUT = `                 序号                  片段            占全文比例                      占字符数                AIGC值
                 1                   片段1           28.16%                     1407                0.8233
                 2                   片段2           12.11%                     605                 0.9970
                 3                   片段3           15.81%                     790                 0.9698
                 4                   片段4           43.93%                     2195                0.9988

                  检测片段详情
                     NO. 1 片段1 AIGC值 0.8233`

const REPORT_PDF_UNPDF = `序号 ⽚段 占全⽂⽐例 占字符数 AIGC值
1 ⽚段1 28.16% 1407 0.8233
2 ⽚段2 12.11% 605 0.9970
3 ⽚段3 15.81% 790 0.9698
4 ⽚段4 43.93% 2195 0.9988`

test('PDF 总体占比：按片段比例和 AIGC 阈值确定性汇总', () => {
  assert.deepEqual(reportOverall(REPORT_PDF_LAYOUT), { human: 0, suspect: 44, ai: 56 })
})

test('PDF 总体占比：unpdf 的康熙部首字符归一化后同样可算', () => {
  assert.deepEqual(reportOverall(REPORT_PDF_UNPDF), { human: 0, suspect: 44, ai: 56 })
})

test('PDF 总体占比：表格不完整时不猜，分类边界与报告一致', () => {
  assert.equal(reportOverall('1 片段1 28.16% 1407 0.8233'), null)
  assert.deepEqual(reportOverall(`1 片段1 50% 100 0.5
2 片段2 50% 100 0.99`), { human: 0, suspect: 50, ai: 50 })
  assert.equal(reportOverall('没有片段汇总表'), null)
})
```

**Step 2: 运行测试，确认失败**

Run: `node --test test/host.test.js`

Expected: FAIL。注意 ESM 下导入不存在的具名导出会让整个测试文件在加载期报错 `The requested module '../src/report.js' does not provide an export named 'reportOverall'`，文件里所有测试都跑不起来，这是预期现象，不是环境问题。

**Step 3: 实现最小解析函数**

在 `src/report.js` 的 `pdfToText` 之后、`SYSTEM` 之前加入：

```js
export function reportOverall(reportText) {
  const lines = String(reportText).normalize('NFKC').split(/\r?\n/).filter(line => /^\s*\d+\s+片段\s*\d+/.test(line))
  if (!lines.length) return null
  const rows = lines.map(line => line.match(/^\s*\d+\s+片段\s*\d+\s+(\d+(?:\.\d+)?)%\s+[\d,]+\s+(0(?:\.\d+)?|1(?:\.0+)?)\s*$/))
  if (rows.some(row => !row)) return null
  const totals = { human: 0, suspect: 0, ai: 0 }
  let sum = 0
  for (const row of rows) {
    const ratio = Number(row[1])
    const score = Number(row[2])
    if (ratio < 0 || ratio > 100) return null
    const level = score < 0.5 ? 'human' : score < 0.99 ? 'suspect' : 'ai'
    totals[level] += ratio
    sum += ratio
  }
  if (sum < 99 || sum > 101) return null
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.round(value * 10) / 10]))
}
```

只接受占全文比例、字符数、AIGC 三列完整的汇总行。先做 NFKC 归一化：unpdf 提取的「⽚段」等是康熙部首字符，不归一化就永远匹配不上。总比例必须约为 100%，允许表格自身四舍五入造成的 99–101% 浮动；否则返回 `null`，避免用残缺表格生成看似精确的总体结果。两个已知的取舍：容差意味着缺失 ≤1% 小片段的残表也会被接受，偏差很小，可接受；三个分类各自四舍五入到一位小数，显示加总可能不是恰好 100%（如 33.3×3=99.9%），前端按原值显示，不强行凑整。

**Step 4: 运行测试，确认通过**

Run: `node --test test/host.test.js`

Expected: PASS，新增测试和原有测试全部通过。

**Step 5: Commit**

```bash
git add src/report.js test/host.test.js
git commit -m "feat: derive overall scores from PDF report segments"
```

### Task 2: 接入 PDF 解析流程并记录占比来源

**Files:**
- Modify: `src/report.js:62-68,77-119`
- Test: `test/host.test.js:170-215`

**Step 1: 写失败集成测试**

把现有流水线测试中的：

```js
await pipeline.report(article.id, '报告文字')
```

改为：

```js
await pipeline.report(article.id, REPORT_SUMMARY)
```

并在其后的 `saved = (await store.read()).articles[0]` **之后**加入（不能插在 report 调用和读库之间，那时 `saved` 还是上一步的旧值，`saved.zhuque` 为 `undefined` 会直接抛错）：

```js
assert.deepEqual(saved.zhuque.overall, { human: 0, suspect: 50, ai: 50 })
assert.equal(saved.zhuque.overallDerived, true)
```

现有 mock 模型仍返回 `{"overall":null,"segments":[...]}`，因此这个测试可以证明总体占比来自 PDF 表格，而不是模型编造。

**Step 2: 运行测试，确认失败**

Run: `node --test test/host.test.js`

Expected: FAIL，`saved.zhuque.overall` 当前为 `null`。

**Step 3: 接入计算结果**

把 `applyReport` 最后的：

```js
return markBlocks(article, parsed)
```

改为：

```js
const derived = reportOverall(reportText)
return markBlocks(article, {
  ...parsed,
  overall: derived ?? parsed.overall,
  overallDerived: Boolean(derived),
})
```

在 `markBlocks` 中，把：

```js
article.zhuque = { round, lastAt: new Date().toISOString(), overall, flagged, passed, source }
```

改为：

```js
article.zhuque = {
  round,
  lastAt: new Date().toISOString(),
  overall,
  overallDerived: parsed.overallDerived === true,
  flagged,
  passed,
  source,
}
```

同时更新 `markBlocks` 的 JSDoc，使 `parsed` 类型包含 `overallDerived?: boolean`。完整表格的计算结果优先于模型返回的 `overall`；没有完整表格时仍沿用原逻辑，API 的 `overallDerived` 为 `false`。

**Step 4: 运行测试，确认通过**

Run: `node --test test/host.test.js`

Expected: PASS，集成测试得到 `{ human: 0, suspect: 50, ai: 50 }`，API 原有测试不受影响。

**Step 5: Commit**

```bash
git add src/report.js test/host.test.js
git commit -m "feat: show derived overall scores for PDF checks"
```

### Task 3: 统一前端信息结构并解释分数语义

**Files:**
- Modify: `client/app.jsx:459-466`
- Modify: `client/app.jsx:1017-1055`
- Modify: `README.md:233`
- Build output: `dist/client.js`

**Step 1: 明确段落批注的来源和指标**

在 `client/app.jsx` 的段落批注中，把 `label` 和返回部分改为：

```jsx
const label = check.level === 'ai' ? 'AI 特征' : '疑似 AI'
const source = check.source === 'api' ? 'API' : 'PDF'
const score = check.source === 'api'
  ? `置信度 ${Math.round(check.score * 100)}%`
  : `片段 AIGC ${check.score}`
return (
  <div className="ws-note is-flag">
    <p className="ws-note-title">朱雀 {source}：{label}<span className="ws-score">{score}</span></p>
```

后续 `check.worse`、噪声带和操作按钮代码保持不变。旧记录没有 `source` 时继续走 PDF 展示，与 `markBlocks` 的默认值一致。

**Step 2: 在质检页增加简洁说明**

在 `QualityPane` 的 `overall` 定义后加入：

```js
const metricNote = zhuque.source === 'api'
  ? 'API 置信度与 PDF 片段 AIGC 含义不同，不直接比较。'
  : `${zhuque.overallDerived ? '总体占比按 PDF 片段计算；' : ''}片段 AIGC 应用于该片段覆盖的段落，不与 API 置信度直接比较。`
```

把总体占比后面的区域改为：

```jsx
{overall?.length ? <p className="ws-overall">{overall.map(([name, value]) => <span key={name}>{name} {value}%</span>)}</p> : null}
{zhuque.round ? <p className="ws-muted ws-small">{metricNote}</p> : null}
<FixAll article={article} />
```

不新增样式：复用现有 `ws-muted ws-small`，避免说明文字抢占主要操作区域。只有完成过检测时才显示说明。

**Step 3: 更新 README 的既有说明**

把 `README.md` 中朱雀 API/PDF 的说明调整为：

```markdown
朱雀 API 的置信度和 PDF 报告里的片段 AIGC 分别显示，两者含义不同，不直接比较。PDF 有完整片段汇总表时，人工、疑似 AI 和 AI 的总体占比按片段比例计算并明确标注。API 按原文匹配段落，PDF 的段落对应由模型辅助，以报告原文为准。重复的开头语等内容，可在设置里加入检测时排除的固定句。
```

**Step 4: 构建并运行全量测试**

Run: `npm run build && npm test`

Expected: `dist/client.js` 构建成功，全部测试 PASS。

**Step 5: 在真实页面验收两种检测**

Run: `npm run dev`，打开 `http://127.0.0.1:4173`，使用有正文和检测结果的稿件。

API 验收：

1. 执行一次 API 检测。
2. 总体区域显示人工、疑似、AI 占比。
3. 段落批注显示「朱雀 API」和「置信度 N%」。
4. 质检页说明两种分数不直接比较。

PDF 验收：

1. 展开「更多检测方式 · 上传 PDF」，上传 `朱雀AI检测助手-1.pdf` 或包含完整片段表的同类报告。
2. 总体区域显示由片段表计算的占比；示例报告应约为人工 0%、疑似 44%、AI 56%。
3. 说明显示「总体占比按 PDF 片段计算」。
4. 同一 PDF 片段覆盖的多个段落显示「朱雀 PDF」和相同的「片段 AIGC」，界面不再把它呈现为段落独立置信度。
5. 上传没有完整片段表的报告时，不显示伪造的计算占比，原模型解析与段落标红流程仍可用。

**Step 6: Commit**

```bash
git add client/app.jsx dist/client.js README.md
git commit -m "fix: clarify API and PDF detection metrics"
```

---

## 最终检查

```bash
npm run build
npm test
git diff --check
git status --short
```

预期构建和全部测试通过，没有未预期的生成文件。不要修改 `src/zhuque.js` 的 API 标签映射，不要把 API 置信度转换为 AIGC，也不要改变一键处理的跳过规则。
