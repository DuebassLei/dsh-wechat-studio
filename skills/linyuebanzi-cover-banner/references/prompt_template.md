# 林月半子公众号横版封面 · 提示词模板(classic 经典深绿大厂博主风)

> 这是 `classic` 风格(默认)的模板。其他两种风格的模板见:
> - 新锐科技编辑风:`references/prompt_template_editorial.md`
> - 时尚人物 Campaign 风:`references/prompt_template_campaign.md`

这是把"小白也能搞 LLM 知识库"那张封面的提示词结构化后的模板。每次生成新封面时,把下面 `{{中括号}}` 占位符换成从文章提炼的新内容,**其他保持不动**——这是保证林月半子视觉 IP 一致性的关键。

## 模板正文(直接复制,填空即可)

```
A wide-format article cover banner in 21:9 ratio, dark professional tech-blogger aesthetic, similar to "大厂博主" style.

THEME PRESET:
- Theme preset: {{主题色名:amber / cyan / lime / violet}}
- Highlight word color: {{高亮色 HEX}}
- UI glow color: {{UI glow 色 HEX}}
- Supporting ambient accent: {{背景辅助色 HEX}}

OVERALL COMPOSITION:
- Wide horizontal banner, dark background
- Left 60% area: bold Chinese typography
- Right 40% area: a real-photo-style half-body portrait of the person described in SUBJECT
- Background full of subtle thematic patterns and floating UI elements

SUBJECT (RIGHT SIDE):
- [[SUBJECT]]
- Wearing [[OUTFIT]]
- Keep this outfit unchanged in every pose; do not swap it for other clothing
- Facial expression: {{表情:calm, thoughtful, slight smile / focused, confident / serene, contemplative / quietly amused — NOT exaggerated, NOT smirking, NOT shocked, NOT excited}}
- Half-body shot, positioned on the right 1/3 of the canvas
- Body slightly turned toward center
RIGHT-SIDE OBJECT SYSTEM:
- Object family: {{对象家族:floating-dashboard / screen-board / module-cluster / portal-frame / object-plus-ui}}
- Family fit: {{为什么这类对象适合这篇文章,一句话说明}}
- Right-side object description: {{右侧对象结构描述:强调整体轮廓,比如 wide dashboard with 3 tiles / framed browser board / distributed module cluster / glowing portal frame with inner scene / one physical object plus 2 compact overlays}}
- Object silhouette rule: the chosen object family must have a clearly distinct silhouette at banner scale; do NOT collapse into one narrow vertical glowing card unless the family explicitly needs it
- Anti-collapse rule: if the composition starts reading like a premium glowing UI panel, push it back toward explicit object silhouette, boundary structure, asymmetry, and multi-part geometry
- Support cards / chips / overlays may exist, but they must remain secondary; they cannot become the main hero shape unless the selected family explicitly calls for it
- Object anchoring: {{对象锚定方式: hovering beside the body / partly supported by the hand / framed by both hands / standing like a screen board / floating as a portal window}}
- Readability rule: key text and structure must remain readable, but prioritize the overall silhouette and composition over filling every area with tiny labels

Interaction pattern with the object: {{动作模式:presenting from below / pointing at a key module / lightly tapping the card surface / holding the card edge up for display / framing the object with both hands / leaning in to inspect it closely}}
- The action must clearly match both the article topic and the chosen object family, and the clothing must remain the outfit described above regardless of the action variation
- Lighting: soft warm light from the left, creating gentle facial highlights AND emphasizing the fabric texture and natural folds
- Strong rim light to separate the outfit from the dark teal background

OBJECT CONTENT INSIDE / AROUND THE RIGHT-SIDE SYSTEM:
- Top label or anchor title: "{{对象标题,通常是 1-3 词}}"
- {{对象内容组织方式:3 tiles / 1 main board + 2 side chips / 3-5 distributed modules / 1 portal frame + inner scene / 1 physical object + 2 callout overlays}}
- Content items must visualize real article concepts, not abstract buzzwords
- Soft {{UI glow 色名}} glow around the main object system
- Style: premium tech UI / board / module / portal / overlay system, depending on the chosen family
- Text inside the object system must be sharp and readable

BACKGROUND:
Deep dark teal-to-charcoal gradient (#0F2A2D to #1A1A1A), filled with:
- Faint terminal text in dim green showing "{{文章主题相关的命令行片段}}" snippets
- Subtle file tree diagram lines on far left edge showing {{文件树相关目录:raw/entities/queries 或文章相关}}
- {{1-2 个主题相关的飘浮元素:产品 logo / 文档纸张 / 工具图标}}, semi-transparent, floating in middle ground
- Ambient support glow and tiny UI highlights should use {{背景辅助色 HEX}}, but stay subtle and never overpower the title
- Overall feel: a "{{背景氛围:knowledge cosmos / multi-agent network / tool battle lab / workflow cockpit / 别的}}" environment

MAIN TYPOGRAPHY (LEFT 60% OF CANVAS):
Two-line bold Chinese title, very large, centered vertically:

Line 1 (white): "{{主标题第一行,5-7 字}}"
Line 2 (mixed): "{{第二行的非高亮部分}}" in WHITE + " " + "{{高亮词}}" in {{高亮色名}} ({{高亮色 HEX}})

Font: heavy sans-serif, bold and condensed
IMPORTANT: NO punctuation, NO quotation marks, NO apostrophes between Chinese title characters

SUBTITLE STRIP (BELOW MAIN TITLE):
{{emoji1}} {{标签1,4-6 字}}  /  {{emoji2}} {{标签2}}  /  {{emoji3}} {{标签3}}
Style: small white text with emoji icons, casual horizontal layout

ENGLISH ACCENT TEXT (subtle, top of main title area):
"{{英文副标题,2-4 词,大写}}" in faded {{高亮色名}}, semi-transparent, large but ghost-like behind the main Chinese title

STYLE NOTES:
- Photo-realistic portrait, NOT illustration
- Background has depth — slight bokeh/blur on far elements
- Main color palette: deep teal/charcoal background, the person's outfit, white title, theme accent colors from the chosen preset only
- Strong tonal separation between the outfit and the background to avoid blending
- No exaggerated facial expressions
- No author watermark or signature text anywhere
- Maintain a "professional senior dev sharing a discovery" vibe

ASPECT RATIO: 21:9 (wide cinematic banner format)
```

## 填空指引

### 主标题(2 行)——每篇必改

从文章里的**金句或反常识观点**里挑,拆成两行。**第一行 5-7 字,第二行 5-8 字**。

好例子:

| 第一行(前提)| 第二行(冲击)|
|---|---|
| 小白也能搞 | LLM 知识库 |
| 朋友卡了两天 | 我帮他找到了 |
| 三个 Agent | 顶十个员工 |
| 写完才发现 | 这是管理活 |

烂例子(太平直,没情绪):

- 「LLM Wiki 教程」
- 「关于 AI 自动化的思考」

### 右侧对象家族——决定这张图是不是还像同一张卡

先选对象家族,再填对象内容。**对象家族变了,右侧轮廓才会真的变**。

| 对象家族 | 适合场景 | 轮廓特征 | 禁止退化 |
|---|---|---|---|
| `floating-dashboard` | 工作流、看板、指标、流程摘要 | 偏宽的悬浮 dashboard,有主面板和辅助 tile | 不要退化成窄长竖卡 |
| `screen-board` | 浏览器、终端、白板、产品界面 | 有边框感的屏幕/面板/看板,整体偏横向,像 workspace / control board,能看到 top bar / side rail / bounded board surface | 不要只剩一块发光玻璃卡 |
| `module-cluster` | 多 Agent、工具组合、模块关系 | 3-5 个分布式模块/节点/卡片拼组,有间距、尺寸变化、连接关系,整体不是规则矩形 | 不要所有模块又排成一列 |
| `portal-frame` | 网关、入口、桥接、解锁能力 | 一个有内部空间感的门框/窗口/入口,中间是可穿透/可望见的深度空间 | 不要降级成普通卡片 |
| `object-plus-ui` | 实物道具 + UI 说明 | 一个具体物件 + 1-2 个小 overlay | 不要只有物件没有解释层 |

### 高亮词——每篇 1-2 个

第二行里挑最关键的词,用当前主题 preset 的高亮色强调。**这个词是读者扫一眼就被勾住的视觉钩子**。

例如「LLM 知识库」里高亮"知识库"——读者一眼看到"知识库"就知道这篇讲什么。

### 主题色 preset——每篇必选 1 组

左侧高亮词、英文副标题、UI glow、背景辅助光必须来自同一组安全主题色,不要自由发挥。

| preset | 适合场景 | 高亮词 | UI glow | 背景辅助光 |
|---|---|---|---|---|
| `amber` | 教程、知识库、方法拆解 | `#FFA847` | `#FFB15C` | `#FFCC8A` |
| `cyan` | Agent、工具、效率、浏览器自动化 | `#38D6FF` | `#56E0FF` | `#9BEAFF` |
| `lime` | 工作流、增长、结果导向、运营 | `#9FE870` | `#B3F187` | `#D8F7B8` |
| `violet` | 架构、系统、方法论、高级感 | `#8C7BFF` | `#A897FF` | `#D5CCFF` |

### 动作模式——不要每篇都同一个手势

动作不是装饰,而是右侧信息卡的交互语言。必须根据文章主题选一种最匹配的互动方式,同时**衣服不变,人物还是同一个人**。

| 文章类型 | 推荐动作模式 |
|---|---|
| 教程 / 产品介绍 / 新能力展示 | presenting from below / holding the card edge up for display |
| 结论鲜明 / 想突出重点 | pointing at a key module |
| UI 交互 / 工作流 / 自动化触发 | lightly tapping the card surface |
| 架构 / 系统分层 / 边界说明 | framing the card with both hands |
| 拆解 / debug / 复盘 / 深度分析 | leaning in to inspect it closely |
| 对比评测 / 最终答案揭晓 | holding the card edge up for display 或 pointing at the winning item |

避免写法:
- 永远都是 open palm presenting
- 动作和文章内容没关系,只是为了"有变化"

### 英文副标题——每篇必改

主标题背后的"幽灵英文"。文章主题的 2-4 个英文核心词,大写,半透明。**作用是补充氛围,不抢主标题的戏**。

公式:`{产品名} × {主题}` 或 `{主题}` 或 `{产品名} GUIDE`

例子:
- `YOUDAONOTE × LLM WIKI`
- `HERMES × MULTI-AGENT`
- `N8N × FLOW`
- `OPENCLAW DEEP DIVE`
- `AI AGENT 2025`

### UI 卡片——每篇文章必改

右侧人物互动的"半透明发光卡片"。这是封面**信息密度最高的视觉锚点**——把文章核心概念图形化。

格式:**1 个标题 + 3 个层次/步骤/分类**(必须是 3 个,视觉节奏最好)

| 文章主题 | UI 卡片内容 |
|---|---|
| LLM Wiki 知识库 | 标题 LLM Wiki / 📁 raw / 🔗 entities / 💬 queries |
| 多 Agent 协作 | 标题 Agents / 👤 Admin / 🔍 Search / ✍️ Ink |
| 工具横评 | 标题 Tools / ❌ Veo / ❌ Sora / ✅ Kling |
| n8n 工作流 | 标题 Workflow / 🌊 Trigger / ⚙️ Process / 📤 Output |
| 知识管理 | 标题 Knowledge / 📥 Input / 🔄 Compile / 📤 Use |

**关键**:卡片里的文字必须是**真实存在的概念**,不能编造。读者点进文章会对照卡片找内容。

### 右侧对象内容——按对象家族组织,不要都写成一列

右侧不是永远一张卡。先确定对象家族,再决定内容怎么排。

| 对象家族 | 推荐内容组织 |
|---|---|
| `floating-dashboard` | 1 个主面板 + 2-4 个 tile / 小窗 / chips |
| `screen-board` | 1 个屏幕板面 + 1 个焦点区域 + 1-2 个辅助标签,强调 frame anatomy,不是随便塞几个卡片 |
| `module-cluster` | 3-5 个模块 / 节点 / 卡片空间分布,允许连接线,明确保持彼此分离,不要合成一整块大面板 |
| `portal-frame` | 1 个入口框 + 内部场景 / 流程 / 目标空间,重点在 frame 和内部深度,不是平面 UI |
| `object-plus-ui` | 1 个实体物件 + 1-2 个 overlay 注释 |

### 家族专属强化写法——不够狠时直接抄

**screen-board**
- 强调词: `wide horizontal board`, `browser workspace`, `control board`, `visible top bar`, `side rail`, `bounded board surface`
- 负面词: `NOT a floating card`, `NOT a glowing glass tile`, `NOT a narrow panel`, `NOT a tablet mockup`

**module-cluster**
- 强调词: `multiple separate modules`, `distributed cluster`, `visible spacing`, `thin connectors`, `varied sizes`, `non-rectangular aggregate silhouette`
- 负面词: `do NOT merge into one large panel`, `NOT a unified dashboard slab`, `NOT a single board with sections`

**portal-frame**
- 强调词: `hollow frame`, `visible inner depth`, `threshold`, `gateway opening`, `window into another system`, `frame first, content second`
- 负面词: `NOT a filled rectangular screen`, `NOT a popup modal`, `NOT a login panel`, `NOT a plain luminous rectangle`

### 三标签——底部一行

文章 3 个核心卖点 / 看点 / 关键词。`emoji + 4-6 字短语`。

公式推荐:

- 第一个:**主题/能力**(🪄 零终端门槛 / 🧪 五款横评 / 🤖 三个 Agent)
- 第二个:**特征/优势**(📚 多端同步 / 💰 烧了一杯奶茶 / ⏰ 熬了一整夜)
- 第三个:**结果/洞察**(✨ 知识复利 / 🏆 答案出人意料 / 💡 想通了一切)

### 表情(按文章情绪挑)

| 文章基调 | 推荐表情 |
|---|---|
| 教程/分享(本篇 LLM Wiki) | calm, thoughtful, slight smile |
| 安利/推荐 | focused, confident, quietly amused |
| 复盘/反思 | serene, contemplative |
| 踩坑/吐槽 | tired but composed, knowing smile |

**永远不写**:excited, thrilled, ecstatic, shocked, amazed, wide-eyed

### 姿态/动作模式(按文章语义 + 对象家族挑)

- **托举展示**:presenting from below / holding the card edge up for display —— 更适合 `floating-dashboard` / `object-plus-ui`
- **重点指向**:pointing at a key module —— 更适合 `screen-board` / `module-cluster`
- **交互轻触**:lightly tapping the card surface —— 更适合 `screen-board` / `floating-dashboard`
- **双手框定**:framing the object with both hands —— 更适合 `portal-frame` / 大尺寸 `screen-board`
- **近距离检视**:leaning in to inspect it closely —— 更适合 `module-cluster` / 拆解型 `object-plus-ui`

### 背景命令行

按文章主题写实际相关的命令片段。**写真实存在的命令,不要编造**。

| 文章主题 | 推荐命令片段 |
|---|---|
| 有道云笔记 + LLM Wiki | `youdaonote-llm-wiki`, `wiki-init`, `wiki-ingest` |
| Hermes 多 Agent | `hermes spawn`, `hermes route`, `hermes status` |
| n8n | `n8n start`, `npx n8n`, workflow JSON 片段 |
| Claude Code | `claude code`, `claude --print`, MCP 配置片段 |

## 风格基线——不能改的部分

下面这些是"林月半子横版视觉 IP"的基线,**不管什么文章都保持一致**:

1. **画幅** 21:9 宽幅
2. **背景色** 深绿青到深炭灰渐变(`#0F2A2D` → `#1A1A1A`)
3. **强调色** 从批准的 4 组 preset 里选 1 组,不要自由改色
4. **人物与服装** 来自用户设置(参考图 + 人物设置),模板不写死
6. **布局** 左 60% 文字 / 右 40% 人物 + UI 卡片
7. **无水印** 画面不带作者署名
8. **背景必备** 终端命令片段 + 目录树
9. **从右上方打来的定向光**
10. **禁用** 日期、分割线、过度装饰、夸张表情

## 自检三问

每次生成新封面前,用这三条问一下自己:

1. **主标题两行能不能一句话讲出"反差/冲突/洞察"?**
   只是描述"教你如何 X X X" → 烂概念,重写

2. **选的主题色 preset 有没有和文章气质匹配,并且高亮词 / UI glow / 背景辅助光保持同一组?**
   混搭成一篇图里两三种强调色 → 视觉会飘,重写

3. **UI 卡片里的内容是不是文章里真实存在的概念?**
   "raw/entities/queries"是真概念 ✅
   "智能/高效/便捷"是抽象词 ❌

4. **动作模式是不是在表达文章语义,而不只是换个手势凑变化?**
   workflow 用 tapping / 架构图用 framing / 拆解文用 inspect → 对路 ✅
   每篇都还是 open palm presenting → 退化 ❌

5. **三标签的 emoji 跟语义匹配吗?**
   📚 多端同步 = 书堆暗示积累 ✅
   ✅ 多端同步 = 通用 emoji,没信息量 ❌
