# Markdown Reimport Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让重新导入在删除图片、调整段落顺序、转存后撤销和换文件时都能准确反映用户确认的内容。

**Architecture:** 复用现有 Markdown 图片扫描与段落 ID，分别修复覆盖影响和改稿对比。图片转存以最近的覆盖快照为边界，弹窗由表单统一管理文件读取和提交状态。

**Tech Stack:** Node.js ESM、node:test、React 18、esbuild。

---

参考 @docs/plans/2026-11-17-reimport-article-markdown.md。审查范围从 `8a7f48b` 的纯函数实现到 `4fba2c9`。审查时 154 项测试均通过。前三项已通过本地 Node 复现，最后一项来自前端状态路径检查，需在桌面端复验。

### Task 1: P1 行内图片移出时也要求确认

**Files:** `src/markdown-images.js`、`src/markdown-reimport.js`、`client/app.jsx`、`test/markdown-reimport.test.js`、`test/markdown-reimport-routes.test.js`。

1. [ ] 在纯函数测试加入下面的场景。路由测试用同样输入确认缺少 `acknowledgeRemovedMedia` 返回 409 且正文未改。再测同 URL 多张图、图注变动以及围栏代码示例。

   ```js
   const u = 'https://example.com/a.png'
   const article = createArticle({ markdown: `图例：![图一](${u}) 和 ![图二](${u})` })
   const plan = planMarkdownReimport(article, `图例：![仍保留一张](${u})`)
   assert.equal(plan.removedMedia.length, 1)
   assert.equal(plan.removedMedia[0].src, u)
   ```

2. [ ] 运行 `node --test test/markdown-reimport*.test.js`，预期行内图片计数现为 0，未确认覆盖现返回 200。
3. [ ] 在图片模块从 `imageMatches()` 导出 `markdownImageDestinations(text)`，返回每次匹配的 `{src: match[4], caption: match[3].slice(2, match[3].lastIndexOf(']('))}`，扫描器支持转义右括号的图注时同步覆盖测试，并保留忽略代码的行为。将 `mediaAt` 改为返回数组。普通块为每个匹配返回 `{key: 'image:'+src, item: {kind:'image', blockId, number, caption, src, occurrence}}`，SVG 块继续返回单个校验后的条目。两侧遍历数组，原来的 URL 多重集消耗逻辑照用。预检列表 React key 使用 `${item.blockId}:${item.occurrence ?? 0}`。
4. [ ] 重跑第 2 步命令，预期全通过。英文提交消息 `fix: confirm removal of inline markdown images`。

### Task 2: P1 撤销普通改稿时保留已转存链接

**Files:** `src/host.js`、`test/markdown-reimport-routes.test.js`。

1. [ ] 用已有的 `setup`、`waitFor` 和延迟 fetch 夹具。旧稿和覆盖稿都含同一飞书 URL，覆盖后在转存尚未完成时通过 `block/edit` 保存一个普通段落。放开转存，等待 `imageImport === null`，先撤销手动编辑，断言仍使用图床 URL，再撤销覆盖，断言恢复旧稿快照里的原飞书 URL 和旧图片状态。对一次失败后 `images/retry` 的路径重复此断言。
2. [ ] 运行 `node --test test/markdown-reimport-routes.test.js`。预期第一次撤销把链接恢复为 `FEISHU`，此时 `imageImport` 仍是 null。
3. [ ] 在 `startImageImport` 的串行更新回调中计算最近覆盖边界，替换现有 `currentOnly` 分支。保留对 `text`、`prev` 的原有处理。撤销普通改稿可继续进行，撤销到覆盖边界仍沿用当前图片任务检查。

   ```js
   const boundary = current.history.findLastIndex(entry => entry.reimportBefore)
   const recent = current.history.slice(boundary + 1)
   const blockSets = [current.blocks, ...recent.map(entry => entry.blocks)]
   ```

   删除 `currentOnly` 参数及 `images/retry` 中的重复判断。无覆盖边界时整段历史仍按旧规则转存。补一项两次覆盖的测试，确保最近一次覆盖前的快照不会被第二次覆盖的转存改写。
4. [ ] 重跑第 2 步，预期全通过。英文提交消息 `fix: preserve transferred image URLs when undoing edits`。

### Task 3: P2 段落重排进入改稿对比

**Files:** `src/article.js`、`client/app.jsx`、`test/markdown-reimport.test.js`。

1. [ ] 对「甲、乙」覆盖为「乙、甲」断言有「重新导入 Markdown」记录，含 `kind: 'move'` 且前后段号正确。对「甲、乙」覆盖为「开场、甲、乙」断言只新增一块。再验有重排又有新增或删除的情况。
2. [ ] 运行 `node --test test/markdown-reimport.test.js test/host.test.js`，预期仅重排时 `revisionChanges()` 返回空。
3. [ ] 在 `revisionChanges` 的现有索引构造后计算共有 ID 的相对顺序。在 after 循环中保留原有新增与改写分支，再接下列移动分支。标题与正文同时改动时，各自显示对应行。客户端给 `revisionKinds` 增加 `move: '调整顺序'`，两侧复用旧段号和新段号。

   ```js
   const oldRank = new Map(before.blocks.filter(b => newIds.has(b.id)).map((b, rank) => [b.id, rank]))
   const newRank = new Map(after.blocks.filter(b => oldBlocks.has(b.id)).map((b, rank) => [b.id, rank]))
   // Append after the existing insert/rewrite branch.
   else if (oldRank.get(block.id) !== newRank.get(block.id)) {
     rows.push({ kind: 'move', before: old, after: { text: block.text, number: i + 1 } })
   }
   ```

4. [ ] 重跑第 2 步，预期全通过。英文提交消息 `fix: show reordered paragraphs in revision history`。

### Task 4: P2 换文件时锁住提交并重置标题选择

**Files:** `client/markdown-import.jsx`、`client/app.jsx`、`src/markdown-reimport.js`、`src/host.js`、`test/markdown-reimport-routes.test.js`。

1. [ ] 在桌面端放慢新文件读取。先预检旧稿，再选新文件并立即确认，检查是否发出旧正文。也可在读取期间点预检后让读取先完成，随后返回预检响应，观察「正在预检」一直锁住。勾选「同时更新标题」后换成没有 H1 的文件，验证选项消失但请求仍带 true。另写路由断言，原正文含飞书图而此次仅更新标题时，预检 `transfers === 0`。
2. [ ] 运行 `node --test test/markdown-reimport-routes.test.js`，预期仅更新标题时预检误报待转存图。
3. [ ] 两个父表单分别持有文件读取状态，传给共享字段，并在调用 `file.text()` 前同步更新一个 ref。读取期间禁用提交，`onSubmit` 入口也检查 ref。共享字段读取成功后先调用 `onChange(text)` 再释放读取锁。文件读取完成后，重新导入的值变化处理重置标题选择和原预检。

   ```js
   // ReimportDialog
   const changeMarkdown = value => {
     invalidate()
     setUpdateTitle(false)
     setMarkdown(value)
   }
   // Both forms use this callback for the shared file field.
   const handleReadingChange = value => {
     readingRef.current = value
     setReading(value)
   }
   ```

   `planMarkdownReimport` 返回 `bodyChanged: !sameBody`，预检以 `plan.bodyChanged ? feishuImageUrls(plan.entries).length : 0` 返回数量。覆盖逻辑可复用同一字段，避免预检和执行规则再次分离。
4. [ ] 重跑第 2 步，再运行 `npm test` 和 `npm run build`。桌面复验新建与重新导入两处，覆盖文件读取成功、失败和切换标题选项。按仓库惯例包含重新生成的 `dist/client.js`。英文提交消息 `fix: synchronize markdown file reads and confirmation`。
