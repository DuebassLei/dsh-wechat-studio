# 公众号 SVG 动画卡 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在稿面右栏「配图」里补做公众号动画卡，预览后插入选定段落，并让卡片随整篇排版复制。

**Architecture:** 把用户提供的 wechat-svg-cards 完整复制进内置 skills，沿用项目已有的 Python 排版引擎渲染同一种 svg-* Markdown 卡片。稿面通过隔离的小预览播放该卡片，排版预览负责文章整体效果、自查和公众号富文本复制。

**Tech Stack:** React、Node.js Host、DSH 文本模型、现有 Python 3 排版引擎和 SMIL、Node test、esbuild。

---

## 当前能力与交互决策

- `vendor/layout/layout.py` 的 `SVG_KINDS` 和 `svg_card` 已支持概念、步骤、拆解、对比、表格、柱状图、时间线、手机演示八种格式。整篇排版已经有渲染分支。稿面的 `client/app.jsx` 中 `BlockBody` 会把这些块走普通代码分支，所以**目前在稿面看不到动画，必须切到排版预览**。
- 本次开发后，稿面能就地查看插入后的动画。正文默认显示紧凑的卡片标题和「播放预览」，点击后在原位展开播放。再次点击可收起；提供重播，避免多张卡同时循环干扰写作。右栏生成后也能先预览单卡。排版预览仍用于核对卡片与整篇内容的间距、配色和复制结果。
- 入口放在「配图 → 动画卡片」。从已保存正文选一段、选择卡型、生成一张、核对卡片内容、确认插入。先让用户决定用在哪里，整篇自动推荐与批量生成可以后续再评估。沿用技能的节奏建议，一篇最多三张、同一节最多一张；达到建议数量时提示，由作者决定。示意手机卡明确标明演示，数值图必须使用正文已有的数值。
- 在 Markdown 中只持久化原有 `svg-*` 围栏块。正文插图继续使用其现有流程。动画卡直接作为排版 HTML 内联输出，不需要生图 API、Cloudinary 或图片文件。

## 任务 1：复制技能并确认渲染兼容性

**文件：**源目录 `/Users/linqiong/workspace/open-source/wechat-article-skills/skills/wechat-svg-cards/`；新增 `skills/wechat-svg-cards/`；检查 `src/ai.js`、`src/layout.js`、`vendor/layout/layout.py`、`package.json`；新增 `test/svg-cards.test.js`。

1. 开发前执行 `git status --short`，保留并避开排期相关变更。将源目录完整复制到 `skills/wechat-svg-cards/`，包括 `SKILL.md`、`examples/`、`scripts/layout.py`。记录来源版本或文件哈希。用 `diff -qr` 核对复制结果，再用 `npm pack --dry-run` 确认技能目录进入发布包。
2. 比对两份 `layout.py` 的八种卡片标记、字段语法、样式和转义规则。用复制过来的示例调用现有 `renderLayout`，按卡型验证输出和自查信息。两份脚本可能有版本差异，以样例输出为准。需要补兼容时只同步上游缺失的相关实现，保留现有整篇排版、品牌和复制逻辑。运行时只使用项目现有排版引擎，避免稿面与导出分别运行两份脚本。
3. 参照项目目录型技能的登记方式，在技能页显示「公众号动画卡片」。调用 DSH 文本模型时读取内置技能的选型规则和格式表，明确限定输出卡片数据；其中的独立脚本执行及小红书交付指令只作技能原文保留。

**验收：**执行 `node --test test/svg-cards.test.js`，八种合法示例经整篇排版出现对应 SVG，错误示例产生明确错误或自查提示。

## 任务 2：接入生成、预览与插入请求

**文件：**新增 `src/svg-cards.js`；修改 `src/host.js`、`src/layout.js`；新增 `test/svg-cards-routes.test.js`。

1. 在 `src/svg-cards.js` 定义八种卡型白名单。参照技能使用 `callModel` 和 `extractJson`，以目标段与有限上下文为素材，让模型输出 `{ title, lines }`。类型由用户选择，Host 拼装围栏块。校验标题单行、字段长度、围栏与分隔符、逐卡行数及数字合法性。文本是数据，禁止原始 HTML/SVG、额外围栏和越权指令。生成预览失败时说明具体格式问题。
2. 新增 `renderSvgCard`，由现有 `src/layout.js` 的 Python 启动与超时机制桥接 vendor 的 `svg_card`，使用与全文相同的主题参数和源内容解析规则。传入 JSON 或 stdin，避免把正文拼入 Python 指令。脚本的普通代码框回退应视为单卡预览失败。单卡响应只返回渲染片段；禁用任意 SVG 上传，校验输出元素、属性和外部引用，保留技能需要的 SMIL 元素。渲染器只能输入合法卡型和受限文本。
3. 使用现有 Host 鉴权和稿件访问校验，增加 `POST svg-cards/draft`、`POST svg-cards/preview`、`POST svg-cards/insert`。预览接受结构化数据或该稿的已保存卡片块 ID；排版偏好从稿件读取，未设置时共用现有默认。生成响应返回规范的卡片内容、文章 ID、目标段落 ID 和原文版本摘要。候选暂存于当前编辑会话，正文以确认插入后的记录为准。
4. 插入时在 `store.update` 内以段落 ID 定位，复核文本摘要、归档状态和卡片格式。向上新增段落不会影响位置；目标删除或改写时拒绝本次写入，提示重选或重新确认。用一次 `snapshot` 新增一个 Markdown 块，保留段落编辑和撤销。使用客户端生成的操作 ID 并在写入时防重复提交。请求失败保留候选内容，避免重新调用模型。

**验收：**用模型 stub 覆盖合法和非法返回；覆盖生成不写正文、插入后撤销、重复插入、目标上方增段、目标变更、跨稿访问和恶意文本。执行 `node --test test/svg-cards.test.js test/svg-cards-routes.test.js`。

## 任务 3：配图入口和稿面播放

**文件：**新增 `client/svg-cards.jsx`；修改 `client/app.jsx`、`client/state.js`、`client/styles.css`。

1. 在配图栏加入「动画卡片」区域。操作采用「选段与卡型 → 生成 → 预览 → 插入正文」。优先预选当前段，用户可改。生成候选后允许编辑标题与条目，再预览更新。展示卡片内容的实际结构，避免让用户编辑 SVG 源码。
2. 在 `BlockBody` 的代码块分支前识别白名单卡型，插入后在原位显示卡片和播放入口。普通代码块仍由编辑器按原方式处理。仅在用户展开时请求动画，以正文块内容和主题为缓存键，换稿、编辑或主题变化时废弃过期响应。加载失败时显示原因并提供重试，仍可编辑 Markdown。
3. 用没有 `allow-scripts` 和 `allow-same-origin` 的 sandbox iframe 加载单卡 HTML。为预览文档设置限制外部资源的 CSP，保留 SMIL，使用 iframe 重载实现重播。尊重减少动态效果的偏好，默认不自动播放。使用 Chromium 验证隔离模式中的实际动画帧变化，不以 DOM 中存在 `<animate>` 代替播放验证。
4. 单卡预览提供「复制这张卡」，复用现有公众号富文本复制逻辑，复制内联 HTML 卡片。已插入卡片随现有「复制全文到公众号」一同交付。两条路径都使用同一渲染结果，并处理剪贴板权限失败。

## 任务 4：回归与交接验收

**文件：**更新 `README.md`，运行构建更新 `dist/client.js`。

1. 运行 `npm test`、`npm run build`、`git diff --check`。按「技能与渲染」「稿面交互」分步提交，英文提交信息例如 `feat: integrate WeChat SVG card rendering` 和 `feat: preview SVG cards in the draft editor`。
2. 本地浏览器走通选段、生成、预览、插入、原位播放、编辑、重播、撤销。对同一张卡核对稿面和整篇排版的标题、条目、配色及动画。检查窄窗口、键盘操作、Python 缺失、解析失败和请求超时。
3. 用公众号测试草稿验证整篇粘贴。分别用步骤卡与手机演示卡检查位置、窄屏、循环播放、自查报告，并单独验证「复制这张卡」的粘贴结果。浏览器能播放和公众号粘贴后仍能播放是两条验收结果，应分别记录。
