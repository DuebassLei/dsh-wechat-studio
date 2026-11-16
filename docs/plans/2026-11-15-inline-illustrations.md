# 正文插图 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在稿面「配图」页完成「建议 → 定位 → 用户选择生成 → 预览 → 确认插入」，不会自动生图或修改正文。

**Architecture:** 文本模型只给建议，生图用现有设置里的火山方舟或阿里云百炼；两种任务与正文编辑分开。候选图先留在本机，用户点「插入正文」时，通过现有 Cloudinary 配置取得可发表的 HTTPS 地址，再插入普通 Markdown 图片段落。

**Tech Stack:** React 18、现有 Node.js Host 路由、DSH 文本模型、现有生图提供方、Cloudinary、Node test、esbuild。

---

## 0. 交接与范围

- 开发前运行 `git status --short`、`git log -5 --oneline`。写本计划时，「文章｜配图｜质检」右栏已在工作区，涉及 `client/app.jsx`、`client/styles.css`、`dist/client.js`，尚未提交。接手时先确认这些改动在哪个版本，保留现有实现；不要从旧版单栏重新开发，也不要覆盖其他人的修改。
- 参考用户提供的 [插图 skill](/Users/linqiong/workspace/open-source/linyuebanzi-skills/skills/linyuebanzi-inline-diagram/SKILL.md) 和 [四类提示词模板](/Users/linqiong/workspace/open-source/linyuebanzi-skills/skills/linyuebanzi-inline-diagram/references/prompt_template.md)。完整保留项目内 `skills/linyuebanzi-inline-diagram/` 目录及全部 references，应用输出约束放在 `references/analysis-contract.md`，避免发布包依赖本机绝对路径。分析只读取该契约并剥离 frontmatter，不混入完整生成侧 SKILL；目录中的 Python 脚本、MuleRun、环境变量、人物参考图和自动插入流程不接入应用运行时。
- V1 支持整篇分析，以及在插图页手动选一个段落补建议。只支持单张生成和重试；不做批量生图、素材库、自动替换、拖拽排序或新的凭证设置。右栏标签与正文编辑状态彼此独立。
- **依赖与取舍**：分析只需要项目已有的文本模型；生成只需要生图提供方；确认插入需要现有 Cloudinary 配置。配图页首次使用时说明「插入正文时会上传到已配置的图床」；未配置时提供「去设置」和下载生成图。生成结果保留，配置后可直接插入。V1 不把本机地址、临时签名地址或 base64 写进正文。

## 1. 建议规则、校验与存储

**文件：**新增 `skills/linyuebanzi-inline-diagram/`、`src/inline-diagrams.js`、`src/inline-skill.js`、`test/inline-diagrams.test.js`；修改 `src/ai.js`，接入目录式 skill 读取和覆盖机制。读取 `src/article.js` 了解段落 ID，不改现有版本快照结构。

1. 将四种图分别映射为 `concept | flow | comparison | architecture`。优先解决抽象概念、步骤/循环、同维度对比、组件关系。已有截图/表格紧邻、纯代码、简单事实或情绪段落默认不提议；避免前约 300 字、结尾钩子以及连续段落堆图。长文通常 3–5 条，上限 5，短文可以 0 条，无需凑数。
2. 输入正文的有序块（ID、类型、文本）及标题；只使用已保存正文，提示用户先保存暂存编辑。模型输出 `{ suggestions: [{ anchorId, kind, title, reason, brief }] }`；`brief` 是内部图意，包括节点、关系和顺序，`reason` 一句话回答「这张图能帮读者看懂什么」。整篇分析输入太长时返回明确提示，让用户选一段补建议，不静默截掉后半篇。把文章当数据，忽略正文里的操作指令；模型不能指定 URL、文件路径、接口、价格或执行动作。
3. 复用 `callModel`、`extractJson`。校验已知且当前存在的正文锚点、类型枚举、字符串必填及长度（建议标题 60、理由 180、brief 1500 字符），同一锚点只留一条，按正文顺序返回。非法 JSON 与合法空数组分别显示「分析失败，可重试」和「暂时没有值得配图的位置」；过滤无效条目后若原本非空且没有合法条目，按失败处理。
4. 在稿件上增加可选 `inlineDiagrams` 数组，旧稿读作空数组，无数据迁移。建议记录由 Host 生成 ID，最少保存 `id, anchorId, sourceHash, kind, title, reason, brief, status`；生成后增加 `assetId, format, provider, model, style`，成功插入后保存 `publicUrl, insertedBlockId`。位置和段号从当前 `article.blocks` 计算，不保存数字索引。分析刷新替换未生成的普通建议和无图失败项，保留有效的手动建议、带图失败项、已生成图、已插入记录和忽略项；同锚点的忽略项不会被重新推荐，可从折叠区恢复或删除。整篇重写重新生成全部段落 ID 时清空旧插图记录，避免失效锚点残留。
5. 整篇分析发出时捕获标题和 `[id, text]` 快照的摘要；返回时在 `store.update` 内比对，有变化就丢弃本次分析结果，保留上一次列表。单段分析只校验所选段和实际传给模型的上下文。模型调用带 120 秒超时，超时后释放稿件任务锁。生成前对比来源文本摘要：仅段号变化不影响；内容变化时提示「段落已改动」，可刷新该条建议。已生成的旧图允许用户预览后明确继续使用，不能后台自动插入。

**验证：**先写模型响应 fixture，覆盖空结果、未知 ID、重复锚点、文章恶意指令、刷新保留忽略项、分析期间改稿。运行 `node --test test/inline-diagrams.test.js`。

## 2. 复用生图接口，单独保存插图资产

**文件：**修改 `src/cover.js`、`src/cover-options.js`；新增 `src/inline-assets.js`；扩展 `test/cover.test.js` 和 `test/inline-diagrams.test.js`。

1. 从现有函数抽出共用的方舟/百炼请求与响应校验，保留 `generateArkCover`、`generateBailianCover` 的现有默认行为与调用测试。加插图用参数，显式传 `referenceImage: null`、`format: 'png'` 和独立的宽图尺寸。百炼用纯文本 content；方舟省略 `image` 字段。不得把封面人像、封面提示词、2.35:1 的尺寸或 `saveCover` 的裁切带进插图。
2. 插图目标 16:9。执行时先核对四个百炼模型和方舟当前尺寸契约、分辨率下限及 PNG 支持；建议从 `2048×1152` 这类满足比例的候选尺寸核对，按各接口的格式传值。若某模型只能接收分辨率档位，按其已验证的方式生成并保留原图比例；不要为了凑 16:9 强裁流程图的边缘。继续沿用超时、禁止跟随重定向、HTTPS 下载、流式上限与 PNG 检查。
3. 生成前让用户选风格。风格由 `skills/linyuebanzi-inline-diagram/references/styles/` 动态发现，用户覆盖目录可以新增或覆盖风格，不在 JavaScript 中硬编码风格名称或提示词。生成对话框使用画廊展示原 skill 仓库的成品预览，源文件与封面一样放在 `client/assets/inline-styles/`，缩至 640px 宽后以内联 WebP 打包，扩展风格没有内置预览时显示回退卡片。点击「生成插图」才调用生图接口；显式显示所选风格及当次提供方。提示词由服务端拼装：选定的风格 Markdown + 图种结构 + brief；短中文标签、大字、留白、箭头有方向，不添加未在稿件出现的数据或标识。尺寸由本地代码决定。
4. 文件保存到 `<DSH_HOME>/wechat-studio/inline-images/`，用 UUID 和固定 PNG 扩展名，临时文件写完再改名；不把字节存进 JSON。记录写入失败时回滚新文件，Host 启动后的首个请求前，在状态文件有效的前提下清理崩溃遗留的无引用 PNG 和临时文件，不做可能与生成任务竞态的定时 GC。预览用受 Host 认证的 `GET /wechat-studio/inline-diagrams/image?id=...&asset=...`，验证确属该稿和格式，拒绝跨稿访问及非法路径。右栏使用等比小图、延迟加载；点图看大图。V1 可用同一张有大小上限的源图展示缩略预览，后续有性能数据再加独立缩略文件。

**验证：**mock 两家提供方，断言选用已配置模型、纯文生图、PNG、封面路径和裁切不变；覆盖超限、无效响应、超时及跨稿读图。运行 `node --test test/cover.test.js test/inline-diagrams.test.js`。

## 3. Host 路由、后台任务与确认插入

**文件：**修改 `src/host.js`、`src/cloudinary.js`；必要时扩展 `src/inline-diagrams.js`、新增 `test/inline-diagram-routes.test.js`。

| 路由（POST，公共前缀 /wechat-studio/inline-diagrams/） | 请求和效果 |
| --- | --- |
| `analyze` | `{ id, blockId? }`；整篇或手动选段，保存建议，不调用生图。 |
| `ignore` / `restore` | `{ id, diagramId }`；只改建议状态，无正文修改；恢复前复用锚点冲突检查，已有有效候选时保留忽略状态。 |
| `delete` | `{ id, diagramId }`；删除未插入记录并清理不再引用的本机 PNG，无正文修改。 |
| `generate` | `{ id, diagramId, style }`；按当前设置生成单张，记录进度或失败原因，不上传，不插正文。 |
| `reanchor` | `{ id, diagramId, blockId }`；未插入项选择新的合法正文段；无图建议标记为待分析，刷新新段建议后才能生图；明确提示旧图不会根据新段重新生成。 |
| `insert` | `{ id, diagramId, expectedAnchorHash, acceptStale? }`；用已生成图和当前合法锚点，上传后插入 Markdown 图片块。 |

1. 复用 Host 的鉴权、`mustFind`、`store.update`、状态视图。拒绝对归档稿或其他稿件的资产发起操作；不回传 Key。每稿同一时间一个插图任务，重复点击返回明确的进行中状态，正文仍可编辑。分析、生成、插入可用短请求启动，轮询沿用 `client/state.js` 的现有刷新机制。后台任务引用稳定 ID，完成时重新查找稿件和记录；全程不要在 Store 串行写锁里等待模型或上传。
2. 建议状态最少有 `suggested / ignored / generating / generated / failed / inserted`；分析中、上传中属于任务状态。生成失败回到可重试卡片；上传失败保留 `generated`。异常退出后把没有对应活动任务的 `generating` 显示为「已中断」，提供重试；不自动补发付费请求。错误文案区分没配 Key/图床、鉴权、限流、超时、内容审核、位置消失与存储失败。
3. 添加 Cloudinary 二进制上传函数，沿用现有签名、`secure_url` 校验和凭证；不要复用飞书专属的失败文案。由稿件和资产 ID 派生稳定的图床 ID，使用 `overwrite=true` 和同步更新的签名，让响应丢失或同名资源已存在后的重传保持幂等；不能猜路径。取得有效地址后才进入正文写入。上传后缓存稳定 URL 供重试；即使上传完成，若锚点在等待中被删除或修改，仍不写正文，提示重新选位置或重新确认。
4. 真正插入放在一次 `store.update`：重新按 `anchorId` 找位置，将当前锚点文本摘要与用户确认时的 expectedAnchorHash 比对，并复核稿件和候选状态；acceptStale 只表示接受旧图，不能跳过版本校验。同一条建议已经有仍存在的图片块时幂等返回。调用 `snapshot(article, '插入正文插图')`，在锚点后插入带新 ID、`check: null` 的普通图片块 `![图注](https://...)`，图注转义并去掉换行，然后 `touch(article)`。同一锚点有多条手动建议时要么禁止重复，要么保持确认顺序；V1 采用一个锚点一条有效候选。
5. 插入状态以 `insertedBlockId` 是否仍存在为准：撤销、手动删除后显示「可再次插入」，本机图与图床链接都保留；再次插入继续复用链接。原锚点删除后不得自动用同段号的下一段顶替；恢复旧段落后可回到原位置。已有正文图不会随「忽略」或重新分析被删除。

**验证：**先测「生图成功正文不变」「上方插段后插对位置」「上传中删除或改写锚点不误插」「重复请求只插一张」「上传失败可重试」「撤销后可重新插入」「正常导出 Markdown 有可访问 HTTPS 图链」。运行 `node --test test/inline-diagram-routes.test.js`。不要把真实 Key 放进测试。

## 4. 配图页交互和发布验收

**文件：**修改 `client/app.jsx`、`client/state.js`、`client/styles.css`；增量更新 `README.md`，构建 `dist/client.js`。

1. 把右栏「正文插图」占位替换为紧凑列表。顶部有「分析正文」和「指定段落」；按正文顺序显示「第 N 段后 · 图种」、理由、状态和小图。忽略项默认折叠，带数量和恢复入口。手动选段用当前段号和一行正文摘录，提交时只发块 ID。
2. 卡片主操作随状态变化：建议态「定位到正文 / 生成插图 / 忽略」，生成中显示进度，生成态「预览大图 / 插入正文」，失败时提供对应的重试，失去锚点时显示「重新选位置」。用稿面已有 `jumpToReview` 跳转并高亮对应段落；不要进入段落编辑或切走当前标签。大图对话框支持 Escape、关闭后焦点返回。插入前让用户看到目标段落和图床去向；点确认才写正文。
3. 保存、换稿、切换标签以及后台任务结束时，要正确按稿件刷新，不抢焦点、不自动切页。待完成任务仍可在配图页看到，已插入卡片可定位到图片本身。保留封面历史和下载、标题候选、朱雀定位。不要改变现有封面生成入口或 API Key 管理。
4. 跑 `npm test`、`npm run build`、`git diff --check`；预期现有和新增测试都通过，生成包与源码一致。用本地预览或 DSH 做一轮浏览器验收：短稿空建议、长稿多张卡片、忽略/恢复、键盘切换与预览关闭、图床未配时保留已生成图、窄窗口可操作。
5. **发布验收单列**：用测试稿确认插入后稿面、排版预览、「复制 Markdown」和「复制全文到公众号」都包含新图；粘贴到公众号草稿并预览，确认图可加载、比例和图注正常。应用内能看不代表公众号能显示。真实生图、图床上传和公众号验证由执行时的授权和测试配置决定；无配置时用 mock 完成自动测试，并如实标出尚未跑的端到端环节。

建议实现顺序：建议模型与校验 → 提供方适配与资产 → Host 插入和撤销 → UI 与公众号验收。提交信息用英文，可按功能拆分；本交接不要求立即提交这份计划。
