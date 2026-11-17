# Reimport Article Markdown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在原稿上导入客户审过的 Markdown，确认后覆盖正文，并能用改稿历史查看和撤销这次更新。

**Architecture:** 复用新建稿件的 Markdown 输入和飞书图片转存能力，在原稿上新增「预检 → 确认」两步接口。服务端用原稿状态与导入内容生成确认凭据，在同一笔存储更新中复验、记历史、替换正文；段落按可唯一识别的原文复用 ID。

**Tech Stack:** React 18、esbuild、Node.js ESM、node:test、现有 Store 和飞书图片转存。

---

关联文档：@docs/plans/2026-11-13-feishu-image-import.md、@docs/plans/2026-11-15-inline-illustrations.md、@docs/plans/2026-11-16-wechat-svg-cards.md。

### 产品行为

- 入口：稿面右侧 **文章 → 更多操作 → 重新导入 Markdown**，紧邻「复制 Markdown」。复制适合把稿子送审，重新导入适合收回审稿。标题栏无需再加按钮。
- 弹窗标题为「重新导入 Markdown」，副标题显示目标稿件标题。支持粘贴、选取或拖入一个 `.md` / `.markdown`。先点「查看覆盖影响」；随后显示保留、移出和新增的正文块数，标明可能移出的正文图片和 SVG 动画卡，并列出图注、卡片标题或旧段号。没有可安全复用 ID 的改写按移出＋新增计，界面不把此数字称为改写段数。
- 默认只替换正文。识别到不同的一级标题时，提供默认不勾选的「同时更新标题」，显示前后标题。首版保留旧 front matter，不把新文件的 front matter 当成稿件配置，也不显示更新选项。仅有标题或元信息的文件不允许覆盖。
- 首版是**用审稿版替换正文**。Markdown 带回的图片、代码块和有效动画卡按新文件位置呈现；文件里没带回的内容不自动拼回去，避免挂到被改写的段落后。若有图片或动画卡将移出正文，必须明确勾选「我确认这些图片和动画卡将从正文移出，可撤销」才可覆盖。想保留它们，可以先返回修改导入文本；不做三方合并，也不猜插图位置。
- 文章 ID、排期、复盘关联、封面与封面历史、排版风格、配色、头像、关注卡配置和改稿聊天保留。正文变更后清空朱雀检查结果与旧摘要、标题候选；只有选择更换标题才清空旧标题钩子。保留横幅样式和已有横幅内容，预检提醒旧横幅文案需复查，不触发重新生成。仍有关联的插图建议继续显示；缺少锚点的可重新选择位置。
- 覆盖后提示「已覆盖正文，可在改稿对比查看，或用顶部撤销恢复」。撤销恢复原正文、标题、检查标记和此次清理的派生字段。已经标记发布或归档的稿件首版不允许覆盖；已排期的未发布稿件可覆盖，排期不变。
- 不接飞书实时同步，不自动发起标题生成、质检或生图。飞书图片转存按现有机制后台运行，失败保留链接并可重试。

### Task 1: 实现纯函数预检与覆盖规则

**Files:** 新建 `src/markdown-reimport.js`、`test/markdown-reimport.test.js`。复用 `src/article.js` 的 `splitMarkdown`、`newId`、`parseMarkdownImage` 和 `src/svg-cards.js` 的 `parseSvgCardBlock`。

1. [ ] 写失败用例：BOM/CRLF；仅 H1 或 front matter；重复段落的歧义；新增开头后原块 ID 保留；在确认时切换标题选项导致凭据变化；旧图片更换图注但 URL 保留；有效 SVG 原样带回与 SVG 被移出；空操作。举例：

   ```js
   const article = createArticle({ markdown: '# 旧标题\n\n保留段落\n\n![旧图注](https://example.com/a.png)' })
   const plan = planMarkdownReimport(article, '# 审稿标题\n\n新增开头\n\n保留段落\n\n![新图注](https://example.com/a.png)')
   assert.equal(plan.title, '旧标题')
   assert.equal(plan.entries[1].existing.id, article.blocks[0].id)
   assert.deepEqual(plan.removedMedia, [])
   ```

2. [ ] 运行 `node --test test/markdown-reimport.test.js`，预期先因模块缺失失败。
3. [ ] 实现 `planMarkdownReimport(article, markdown, { updateTitle = false } = {})`。拒绝非字符串与空正文，去掉文件开头的 BOM 后走现有 parser。对前后正文分别按完整块文本建频次与旧块索引；同一文本两侧都只出现一次才允许做跨位置复用。正文完全相同时按原索引复用全部块，避免重复段落触发假改动。改写块发新 ID，禁止按段号猜测。校验新稿中使用内置 SVG 卡类型的块；无效卡显示具体段号和校验错误。既有无效卡仍可作为旧媒体条目报告。图片按解析后的 URL、动画卡按规范化后内容做多重集比较，逐一消耗新稿计数，报告剩余旧条目；空操作以正文顺序及最终标题判断，不受被忽略的 front matter 影响。

   ```js
   const sha = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
   const token = sha([
     article.id, article.title, article.summary, article.hook, article.titles,
     article.blocks, article.zhuque, article.archivedAt, article.publishedAt,
     parsed.blocks, parsed.title, updateTitle,
   ])
   // entries 属于内部模型；对客户端只返回摘要和 token。
   ```

   标题在服务端再次校验：仅允许有效的解析结果，使用手动换标题同样的 80 字限制；超出时阻止选用并告知用户，可仍用正文覆盖。纯函数不要修改原稿，不在预检分配 ID。
4. [ ] 重跑并确认全部通过。提交：`git add src/markdown-reimport.js test/markdown-reimport.test.js && git commit -m "feat: plan safe markdown replacement"`。

### Task 2: 接入预检、覆盖、撤销与图片转存

**Files:** 修改 `src/host.js`、`src/article.js`、`src/markdown-reimport.js`；新增 `test/markdown-reimport-routes.test.js`。路由测试夹具参考 `test/svg-cards-routes.test.js`。先核对 `src/store.js`：更新是串行写入，回调直接操作缓存对象，不能先改缓存再做业务校验。

1. [ ] 写失败测试：先预检而后读盘，原稿完全一致；显式 id 指向另一篇且不切换 currentId；预检后手动编辑，旧 token 覆盖返回 409；没有确认时不能移出媒体；两个并发提交最多一次成功；活动中的任务、归档和已发布返回 409；覆盖后只出现一次「重新导入 Markdown」历史，撤销恢复旧数据；重开 Store 仍可撤销。断言排期、封面和插图记录保持，且未发起模型调用。
2. [ ] 运行 `node --test test/markdown-reimport-routes.test.js`，预期新接口未实现。
3. [ ] 加 `POST articles/reimport/preview` 与 `POST articles/reimport`。请求分别为 `{id, markdown, updateTitle}` 和加上 `{token, acknowledgeRemovedMedia}`；预检返回 `{token, currentTitle, incomingTitle, finalTitle, changed, kept, removed, added, removedMedia, transfers}`。两路都检查 `mustActive`、未发布、pipeline、封面、插图和图片任务；只检查正在运行的图片任务，不因可重试的持久化错误而锁死。确认代码的顺序：

   ```js
   const result = await store.update(state => {
     const article = mustFind(state, body.id)
     assertCanReimport(deps, article)
     const plan = planMarkdownReimport(article, body.markdown, { updateTitle: body.updateTitle === true })
     if (plan.token !== body.token) throw importConflict('稿件或导入选项已变化，请重新预检。')
     if (plan.removedMedia.length && body.acknowledgeRemovedMedia !== true) {
       throw importConflict('请先确认将移出的图片和动画卡。')
     }
     if (!plan.changed) throw importConflict('与当前稿件一致，无需覆盖。')
     const applied = applyMarkdownReimport(article, plan)
     article.notice = { text: '已覆盖稿件，可在改稿对比查看，或用撤销恢复。', at: new Date().toISOString() }
     return applied
   })
   startImageImport(deps, result.article, result.urls)
   return ok()
   ```

   `applyMarkdownReimport` 先保存 `snapshot(article, '重新导入 Markdown')`，给该条追加专用扩展 `reimportBefore: { summary, zhuque, imageImport }`，深拷贝非标量。接着按 entries 建块，复用原 ID 也要在正文变化时将 `check` 和 `prev` 清掉；仅标题变更时保留这些检查和图片状态。保留 `inlineDiagrams` 和 `svgCardInsertions`，由现有锚点、来源哈希与正文块检查判定是否需要重新定位，禁止删除资产文件。测试确认正文插图被移出后，建议不再显示为已插入；撤销后能找回原图。若现有视图仍用持久化状态显示「已插入」，在 `inlineDiagramView` 按实际块 ID 和对应 URL 推导显示状态，不回写建议。
4. [ ] 扩展 `undo` 仅在快照存在 `reimportBefore` 时恢复这几个字段，旧历史保持兼容。覆盖后通过 `feishuImageUrls` 定位新正文待转存图，按 `articles/new` 的方式先写入可恢复状态，再后台启动任务；仅标题更新不启动。覆盖产生的转存批次只替换**当前正文**，不要改覆盖前快照（给 `startImageImport` 增加可选参数，其他导入保持原行为）。覆盖动作是历史栈顶且图片任务仍在运行时，服务端暂缓撤销，前端解释「图片转存完成后可恢复覆盖前版本」；测试模拟延迟与失败，确保任务结束后可撤销且旧图片状态能恢复。不修改共享 Store 的落盘方式；所有可预见的业务失败必须发生在变更原稿之前。
5. [ ] 运行 `node --test test/markdown-reimport*.test.js test/host.test.js test/inline-diagram-routes.test.js test/svg-cards-routes.test.js`，预期全通过。提交时仅暂存本任务文件，英文消息 `feat: reimport markdown into an existing article`。

### Task 3: 复用导入界面，串起两步确认

**Files:** 修改 `client/app.jsx`、`client/state.js`、`client/styles.css`。从 `NewDialog` 抽出共享的 `MarkdownImportFields`（可独立放到 `client/markdown-import.jsx`，若移动则同时带上所需的 Icon 依赖或以 prop 传入），复用 `ws-import-*`。

1. [ ] 记录当前复现：打开稿件，展开「更多操作」，当前只有复制。提取文件选择、拖放、文本及本地统计，先确认「新建文章」两个标签和各自提交行为保持原样。
2. [ ] 在 `ArticleInfoPane` 放入入口，打开时捕获 `reimportArticleId`；`App` 按该 ID 渲染并以 ID 为 key，文章切换时关闭。未保存段落先通过现有「保存／丢弃」处理，不自动清除草稿；打开与点击覆盖前都检查 `unsavedParagraphCount(article)`。已发布、归档或任务进行中显示禁用原因。
3. [ ] 新弹窗默认用共享输入模块。预检与提交显式带上目标 ID；使用 `client/state.js` 中的 `request` 或从该模块提供专用包装，保留 409 的错误语义，不让轮询后默认的 currentId 改变目标。只要更改输入或开关标题，立即清空 token 和媒体确认；迟到的预检响应用请求序号丢弃。失败时原输入留在弹窗里；409 要求重新预检。提交中禁止重复触发。在发请求前校验序列化请求体的 UTF-8 大小（用 `TextEncoder`，与 host 的 `MAX_JSON` 一致，不能只用 file.size）。取消无副作用。
4. [ ] 成功后收起弹窗，回到同篇稿面，清除临时选段、排版缓存和该稿未插入的 SVG 候选；原继续编辑定位只有在对应段落 ID 仍存在时保留。切到「排版预览」展示新正文。复用稿面通知和总撤销入口；服务端 notices 区分转存、失败和完成情况，避免让「后台转存中」盖掉用户需要的撤销说明。
5. [ ] 运行 `npm run build`，预期无构建错误。按 Task 4 的手测场景验证再提交：`feat: add a markdown reimport dialog`。按仓库惯例判断是否需要包含构建产物，勿提交其他改动。

### Task 4: 桌面验收与说明

**Files:** 修改 `README.md`，在现有稿面/导入说明下补充入口、保留范围及撤销方式。

1. [ ] 运行 `npm test` 和 `npm run build`，预期全绿。在有测试稿件的桌面环境验证「复制 Markdown → 模拟飞书改标题、改数段、删除一张图和一张动画卡、加入一张飞书图 → 回到原稿重新导入」。未勾选确认时不能覆盖；确认后稿件 ID、封面、排期和排版配置相同；新正文及保留的 SVG 在稿面和排版预览均可见；历史只有一笔覆盖记录。
2. [ ] 用无直连或故意失败的图片转存验证失败提示与重试，等待任务结束后撤销。重开稿件后验证旧图片、动画卡、质检及正文恢复。另验一次带未保存段落、归档或已发布状态，以及预检后从另一客户端修改稿件；三种阻断都能解释原因，不能静默覆盖。
3. [ ] 更新 README，提交：`git add README.md && git commit -m "docs: explain draft markdown reimport"`。
