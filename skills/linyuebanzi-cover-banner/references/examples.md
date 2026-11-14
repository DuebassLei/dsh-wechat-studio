# 已验证的横版封面提示词案例

这里是已经跑通过的几个案例,供参考"怎么把不同类型的文章提炼成提示词"。

**风格说明**:案例 1-5 是 `classic` 经典深绿大厂博主风;案例 6 是 `editorial` 新锐科技编辑风;案例 7 是 `campaign` 时尚人物 Campaign 风;案例 8 是 `kinetic` 动感斜体大字风;案例 9 是 `grunge` 颗粒喷溅海报风。五种风格的人设/服装/水印/表情基线完全一致,变的是底色、强调色、装饰元素和右侧对象。

---

## 右侧对象家族速查

| 对象家族 | 适合什么文章 | 轮廓提示 | 推荐动作 |
|---|---|---|---|
| `floating-dashboard` | 工作流、运营看板、流程摘要 | 宽面板 + 2-4 个 tile,整体偏横向 | `presenting from below` / `lightly tapping the card surface` |
| `screen-board` | 浏览器工具、产品 UI、终端界面 | 有边框感的屏幕 / 面板 / 白板,整体偏横向,像 workspace 而不是浮空卡 | `pointing at a key module` / `lightly tapping the card surface` |
| `module-cluster` | 多 Agent、工具集成、系统模块 | 3-5 个分布式模块 / 节点 / 卡片,整体轮廓不规则,有连接关系 | `pointing at a key module` / `leaning in to inspect it closely` |
| `portal-frame` | 网关、入口、桥接、切换、穿透 | 一个能看见内部空间的门框/窗口/入口,像穿过一个边界 | `framing the object with both hands` |
| `object-plus-ui` | 拿着某个东西讲解、道具感更强 | 一个实体物件 + 1-2 个 UI overlay | `holding the card edge up for display` / `presenting from below` |

---

## 案例 1:LLM Wiki + 有道云笔记(已发,作为风格基准)

**文章核心**:用龙虾 + 有道云笔记的 youdaonote-llm-wiki skill,小白也能搭 Karpathy 的 LLM Wiki 知识库。文章标题《朋友被 Hermes 卡了两天,我帮他找到了小白版的 LLM Wiki》。

**素材提炼**:

| 元素 | 内容 |
|---|---|
| 主标题第一行 | 小白也能搞 |
| 主标题第二行 | LLM **知识库** |
| 高亮词 | 知识库 |
| 主题色 preset | amber (`#FFA847` / `#FFB15C` / `#FFCC8A`) |
| 对象家族 | floating-dashboard |
| 英文副标题 | YOUDAONOTE × LLM WIKI |
| 右侧对象 | LLM Wiki 主面板 + raw/entities/queries 三块 tile + 1 个云端同步 chip |
| 三标签 | 🪄 零终端门槛 / 📚 多端同步 / ✨ 知识复利 |
| 表情 | calm, thoughtful, slight smile |
| 动作模式 | presenting from below |
| 背景命令 | `youdaonote-llm-wiki`, `wiki-init` |
| 飘浮元素 | YoudaoNote app icon, document papers |

**完整提示词** 见本文件末尾「完整示例 1」区块。

---

## 案例 2(示意):Hermes 多 Agent 实战

**文章核心**:搭三个 Hermes Agent 协作,踩三个坑,搞完才悟"这是管理活"。

**素材提炼**:

| 元素 | 内容 |
|---|---|
| 主标题第一行 | 三个 Agent |
| 主标题第二行 | 顶**十个员工** |
| 高亮词 | 十个员工 |
| 主题色 preset | cyan (`#38D6FF` / `#56E0FF` / `#9BEAFF`) |
| 对象家族 | module-cluster |
| 英文副标题 | HERMES × MULTI-AGENT |
| 右侧对象 | 3 个分布式模块: Admin / Search / Ink, 中间有细连接线和路由箭头,模块彼此分离,整体轮廓不规则,绝不并成一整块大面板 |
| 三标签 | 🎯 三个 Agent / ⚙️ 踩了三个坑 / 💡 搞完才悟了 |
| 表情 | knowing smile, slightly tired but composed |
| 动作模式 | pointing at a key module |
| 背景命令 | `hermes spawn`, `hermes route`, `hermes status` |
| 飘浮元素 | Discord 头像缩略图,@ 符号气泡 |

---

## 案例 3(示意):AI 视频工具横评

**文章核心**:测评 5 款 AI 视频工具,最后留下 Kling。

**素材提炼**:

| 元素 | 内容 |
|---|---|
| 主标题第一行 | 测完五款 |
| 主标题第二行 | 我只留下**一个** |
| 高亮词 | 一个 |
| 主题色 preset | violet (`#8C7BFF` / `#A897FF` / `#D5CCFF`) |
| 对象家族 | object-plus-ui |
| 英文副标题 | AI VIDEO BENCHMARK |
| 右侧对象 | 人物手里拿一块获胜结果牌,旁边叠 2 个小 overlay: Veo / Sora 淘汰,Kling 胜出 |
| 三标签 | 🎥 五款横评 / 💰 烧了一杯奶茶 / 🏆 答案出人意料 |
| 表情 | quietly amused, confident |
| 动作模式 | holding the card edge up for display |
| 背景命令 | 视频生成 prompt 片段 |
| 飘浮元素 | 视频帧缩略图,timeline |

---

## 案例 4(示意):n8n 工作流教程

**文章核心**:用 n8n 搭跨境电商内容生成的工作流,自动化处理。

**素材提炼**:

| 元素 | 内容 |
|---|---|
| 主标题第一行 | 一个工作流 |
| 主标题第二行 | 顶**三天人工** |
| 高亮词 | 三天人工 |
| 主题色 preset | lime (`#9FE870` / `#B3F187` / `#D8F7B8`) |
| 对象家族 | screen-board |
| 英文副标题 | N8N × CROSS-BORDER |
| 右侧对象 | 一块带边框的 workflow screen board, 有清晰 top bar、side rail 和主工作区, 中间高亮 Trigger → Process → Output 流程,像 browser workspace 而不是漂浮 UI 卡 |
| 三标签 | 🔁 全自动 / 🌍 跨境场景 / ⏰ 三天压一小时 |
| 表情 | focused, confident |
| 动作模式 | lightly tapping the card surface |
| 背景命令 | `n8n start`, JSON workflow 片段 |
| 飘浮元素 | 节点连线图示,数据流箭头 |

---

## 案例 5(示意):AI 网关 / 中转站 / 入口型文章

**文章核心**:一篇讲 API Gateway、AI relay、中转站、流量入口和上下游路由的文章,核心不是一张卡里的信息层级,而是“穿过一个入口之后到达另一个系统”的空间感。

**素材提炼**:

| 元素 | 内容 |
|---|---|
| 主标题第一行 | 中转站 |
| 主标题第二行 | **解剖**给你看 |
| 高亮词 | 解剖 |
| 主题色 preset | cyan (`#38D6FF` / `#56E0FF` / `#9BEAFF`) |
| 对象家族 | portal-frame |
| 英文副标题 | AI RELAY × API GATEWAY |
| 右侧对象 | 一个发光入口门框,门框内部能看到请求从上游进入、路由分发、日志回写的空间化流程,重点是门框边界和内部深度,不是一块填满内容的屏幕 |
| 三标签 | 🛰 API 网关 / 🔀 路由分发 / 📜 日志边界 |
| 表情 | focused, confident |
| 动作模式 | framing the object with both hands |
| 背景命令 | `gateway route`, `relay status`, `request_id` |
| 飘浮元素 | 微弱的 request flow 箭头,上游/下游标签 |

---

## 完整示例 1:LLM Wiki(基准案例)

这是案例 1 的完整提示词,作为 Claude 填模板时的参考范例:

```
A wide-format article cover banner in 21:9 ratio, dark professional tech-blogger aesthetic, similar to "大厂博主" style.

THEME PRESET:
- Theme preset: amber
- Highlight word color: #FFA847
- UI glow color: #FFB15C
- Supporting ambient accent: #FFCC8A

OVERALL COMPOSITION:
- Wide horizontal banner, dark background
- Left 60% area: bold Chinese typography
- Right 40% area: a real-photo-style half-body portrait of an Asian male tech blogger
- Background full of subtle thematic patterns and floating UI elements

SUBJECT (RIGHT SIDE):
- A 30-something Asian male, looking like a senior software engineer turned content creator
- Wearing an OVERSIZED, RELAXED-FIT, heavyweight waffle-knit short-sleeve polo shirt in Midnight Green color (#004953, deep dark green with subtle teal undertone)

  CRITICAL FIT DETAILS — this is NOT a standard fitted polo:
  - EXTREMELY relaxed, oversized silhouette — the shirt drapes loosely on the body, not hugging it
  - DROPPED SHOULDERS: the shoulder seam falls noticeably below the actual shoulder point, creating natural sagging fabric folds at the shoulder area
  - WIDE, LONG SLEEVES: short sleeves that hang loose and extend down to just above the elbow, with wide sleeve openings
  - DEEP V OPENING: the collar is wide and open, BOTH buttons completely undone, creating a relaxed deep V-neckline that exposes the upper chest area
  - Visible diagonal draping wrinkles from the oversized fit
  - Body of the shirt drapes loosely, not tight to the torso

  FABRIC DETAILS:
  - Heavyweight cotton waffle-knit fabric, very thick and structured
  - HIGHLY VISIBLE waffle texture: prominent grid-like raised pattern across the entire shirt
  - The fabric should look substantial and grainy, with strong tactile presence
  - Light catches the raised waffle pattern creating subtle highlights that emphasize the texture
  - The dark green color: rich, slightly muted, similar to iPhone 11 Pro Midnight Green

  STYLE REFERENCE: Japanese-inspired oversized casual polo, like the relaxed polos popular in 2024-2025 menswear — NOT a tight business polo, NOT a Lacoste classic fit, NOT a sportswear polo

- Glasses: thin black wire-frame
- Facial expression: calm, thoughtful, slight smile — NOT exaggerated, NOT smirking, NOT shocked, NOT excited
- Half-body shot, positioned on the right 1/3 of the canvas
- Body slightly turned toward center
- Interaction pattern with the UI card: presenting from below
- Lighting: soft warm light from the left, creating gentle facial highlights AND emphasizing the waffle fabric texture and the draping fabric folds
- Strong rim light to separate the dark green polo from the dark teal background

FLOATING UI ELEMENT (NEXT TO HIS HAND):
A semi-transparent glowing card panel showing a stylized "knowledge base" structure:
- Top label: "LLM Wiki"
- Three small cards stacked vertically inside:
  Card 1: folder icon with "raw"
  Card 2: connected nodes icon with "entities"
  Card 3: chat bubble icon with "queries"
- Soft amber glow around the panel
- Style: like a holographic UI overlay
- Text inside the card must be sharp and readable

BACKGROUND:
Deep dark teal-to-charcoal gradient (#0F2A2D to #1A1A1A), filled with:
- Faint terminal text in dim green showing "youdaonote-llm-wiki" command line snippets
- Subtle file tree diagram lines on far left edge showing "raw / entities / queries" structure
- A faded YoudaoNote app icon floating top-right area as a subtle ghost element
- Some abstract document/note paper shapes drifting in middle ground
- Overall feel: a "knowledge cosmos" environment

MAIN TYPOGRAPHY (LEFT 60% OF CANVAS):
Two-line bold Chinese title, very large, centered vertically:

Line 1 (white): "小白也能搞"
Line 2 (mixed): "LLM" in WHITE + " " + "知识库" in AMBER (#FFA847)

Font: heavy sans-serif, bold and condensed
IMPORTANT: NO punctuation, NO quotation marks, NO apostrophes between Chinese title characters

SUBTITLE STRIP (BELOW MAIN TITLE):
🪄 零终端门槛  /  📚 多端同步  /  ✨ 知识复利
Style: small white text with emoji icons, casual horizontal layout

ENGLISH ACCENT TEXT (subtle, top of main title area):
"YOUDAONOTE × LLM WIKI" in faded amber, semi-transparent, large but ghost-like behind the main Chinese title

AUTHOR WATERMARK (bottom right corner):
"@林月半子 · LunarAITalk" in small grey text

STYLE NOTES:
- Photo-realistic portrait, NOT illustration
- Background has depth — slight bokeh/blur on far elements
- Main color palette: deep teal/charcoal background, midnight green polo, white title, amber-orange accent (#FFA847)
- Strong tonal separation between the polo and the background to avoid blending
- No exaggerated facial expressions
- Maintain a "professional senior dev sharing a discovery" vibe

ASPECT RATIO: 21:9 (wide cinematic banner format)
```

## 案例 6(editorial 新锐科技编辑风):Codex 国产替代实测

**风格参考**:`references/style-editorial-reference.png`(已验证出图)。

**文章核心**:用国产 Codex 替代方案,一个人跑通了从产品想法到上线的全流程。

**素材提炼**:

| 元素 | 内容 |
|---|---|
| 主标题第一行 | Codex 国产替代 |
| 主标题第二行 | 一人公司**跑通全流程** |
| 高亮词 | 跑通全流程(克莱因蓝 `#1F4FE0`) |
| 胶囊标签 | 左上 `AI × DEVELOPER` / `A MORE OPEN FUTURE`;左下 `SMALL TEAM` / `BIGGER POSSIBILITIES`;右上 `IDEAS TOOLS #PRODUCTIVITY` |
| 悬浮窗口卡 | Codex 产品界面:traffic-light 三点 + sidebar 图标 + "Codex" 标题 + 2-3 行内容占位条 |
| 表情 | calm, confident, slight smile |
| 动作模式 | pointing at the floating app window |
| 几何块 | 右侧大块实体蓝形 + 1 个小蓝三角 |

**关键提示词锚点**:`off-white paper background (#F4F3EF), high-key` / `Klein blue #1F4FE0, NOT sky blue, NOT navy` / `flat geometric shapes, crisp edges, no gradients` / `NOT a dark background, NOT a dark moody tech style`。

---

## 案例 7(campaign 时尚人物 Campaign 风):Codex 国产替代实测(同文异风)

**风格参考**:`references/style-campaign-reference.png`(已验证出图)。同一篇文章用 campaign 风出的版本,可以对照案例 6 看两种风格的差异。

**素材提炼**:

| 元素 | 内容 |
|---|---|
| 顶部英文巨字 | `CODEX`(超 condensed 黑色,跨满全宽,出血裁切,字内带复印颗粒) |
| 主标题第一行 | Codex 国产替代 |
| 主标题第二行 | 一人公司**跑通全流程**(黑字压荧光绿 `#C8F12F` 色块) |
| 迷你终端窗 | Generate / Plan / Execute / Iterate / Ship_ |
| 胶囊标签 | `AI × PRODUCTIVITY ×` / `ONE-PERSON COMPANY`、`BUILD AUTOMATE SHIP`、`FROM IDEA TO REAL PRODUCT SOLO.`、`SMALL TEAM BIGGER POSSIBILITY`、`AGENTS AUTOMATION REAL IMPACT`、`CHINESE BUILDERS GLOBAL OPPORTUNITIES` |
| 棋盘格 | 左上角一小段 + 人物附近一小块,每处 4-10 格大格子,被画布边缘裁切——是局部点缀,不铺整条边 |
| 表情 | calm, confident, slight smile |
| 动作模式 | pointing at the terminal window |
| 质感 | 全图 photocopy grain + 人物照片 halftone 半调 + 皮肤轻度去饱和 |

**关键提示词锚点**:`massive ultra-condensed display word spanning the FULL WIDTH, cropped at the edges` / `acid lime #C8F12F, fluorescent chartreuse, NOT yellow` / `photocopy grain, film grain, halftone noise` / `hard editorial flash, fashion-campaign contrast`。

---

## 案例 8(kinetic 动感斜体大字风):Step 5 Preview 实测

**风格参考**:`references/style-kinetic-reference.png`。

**文章核心**:用阶跃 Step 5 Preview,拿一张截图当需求文档,四轮对话复刻出完整的英语学习应用。

**素材提炼**:

| 元素 | 内容 |
|---|---|
| 主标题第一行 | 一张截图当需求 |
| 主标题第二行 | 四轮做出**完整应用**(斜体,高亮词信号红 `#EE2B24`) |
| 空心回声词 | `STEP5`(左下角,空心描边斜体,被底部和左边缘裁切) |
| 红色速度线 | 标题上方 2-3 条斜切平行四边条,与斜体字同角度 |
| 右侧面板 | 黑色斜切面板 + 左边缘一条红色斜切条纹 |
| 人物 | 大头特写(头和上胸),直视镜头,无道具无动作 |
| 表情 | calm, confident, direct gaze at camera |

**关键提示词锚点**:`kinetic-typography sports-poster aesthetic` / `vivid signal red #EE2B24, NOT orange, NOT dark red` / `ALL type and red bars share the SAME italic slant angle` / `giant hollow OUTLINE-ONLY echo, thin black stroke, no fill, partially cropped` / `no capsule labels, no terminal windows, no extra decoration — type and person only`。

**注意**:kinetic 没有右侧对象家族和动作模式——这个风格里字就是主角,人物只是压住画面。

---

## 案例 9(grunge 颗粒喷溅海报风):网易邮箱大师 Mail Agent 商单

**风格参考**:`references/style-grunge-reference.png`(已验证出图,2026-10-25)。

**文章核心**:《我让 AI Agent 翻了一遍吃灰的邮箱,翻出一个现成的知识库》。把 Gmail 和 163 加进网易邮箱大师,用 Mail Agent 把邮箱当知识库提问:AI 社区周报变选题雷达、跨邮箱拉 DeepSeek 时间线、不下载 PDF 汇总互选结算单。商单,封面不出现品牌名。

**素材提炼**:

| 元素 | 内容 |
|---|---|
| 英文眉题 | `INBOX`(磨损黑色压缩字,约画面高度 22%,只占左侧) |
| 主标题第一行 | 吃灰的邮箱 |
| 主标题第二行 | 翻出一个**知识库**(黑字压荧光绿 `#B8F03A` 色块) |
| 等宽小字 | `ASK, DON'T SEARCH` \| `2 INBOXES · 1 AGENT` \| `NO PDF DOWNLOAD` |
| 终端菜单 | `> 选题雷达` / `> 时间线` / `> 结算台账` / `> Ask_`(第一行浅灰高亮) |
| 强调色 | preset `lime` `#B8F03A`:左侧竖条 + 右上角十字角块 + "知识库"色块 + 水印小方块,只这四处 |
| 表情 | calm, confident, slight smile |
| 服装 | `tee` 深绿圆领 T(定稿图);用 skill 默认的 Polo 也跑过一版,两种都可用 |
| 动作 | 右手食指指向终端菜单第一行 |

**关键提示词锚点**:`the large Chinese title is the hero and reads instantly` / `English eyebrow height about 22% of the canvas, only spans the left part, not full width` / `black ink spray and coarse grain particles dissolving from left paper into the right black-and-white photo` / `exactly these four lime accents, nothing else in lime` / `render exactly these texts, each only once`。

**踩过的坑**:第一版用 16:9 出图,英文巨字占了画面上半、中文偏小,裁成 2.35:1 时上下都会切到内容。第二版改成"中文当主角、英文压成眉题",并保证所有内容落在 21:9 安全区内,一次通过。之后统一用 `--aspect-ratio 21:9` 原生出图。

---

## 填模板时的三条自检

每次生成新封面前,用这三条问一下自己:

1. **主标题两行能不能一句话讲出"反差/冲突/洞察"?**
   只是描述"教你如何 X X X" → 烂概念,重写

2. **UI 卡片里的内容是不是文章里真实存在的概念?**
   "raw/entities/queries"是真概念 ✅
   "智能/高效/便捷"是抽象词 ❌

3. **三标签的 emoji 跟语义匹配吗?**
   📚 多端同步 = 书堆暗示积累 ✅
   ✅ 多端同步 = 通用 emoji,没信息量 ❌
