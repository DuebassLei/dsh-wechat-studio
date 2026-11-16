# 林月半子分享卡片横幅 · 颗粒喷溅海报风(grunge)提示词模板

风格参考图:`references/style-grunge-reference.png`(2026-10-25 网易邮箱 Mail Agent 商单「吃灰的邮箱 翻出一个知识库」出图,已验证)

视觉定义:**左侧暖白皱纸面 + 黑色印刷磨损的英文眉题 + 超大中文主标题当主角 + 颗粒喷溅过渡到右侧黑白摄影背景 + 强调色竖条和角块(5 种强调色 preset 选 1,默认荧光绿) + 人物指向的黑色终端菜单面板**。像一张被复印过几次的独立杂志海报:粗粝、有纸感,但信息层级非常清楚,中文标题一眼读得出。人物和 IP 基线不变。

和 `campaign` 的区别(容易混):

| | `campaign` | `grunge` |
|---|---|---|
| 主角 | 顶部跨满全宽的英文巨字 | 中文两行主标题(英文缩成眉题) |
| 背景 | 奶油纸 + 栏线网格 + 棋盘格 | 左纸面 → 颗粒喷溅 → 右黑白摄影背景 |
| 强调色 | 固定 `#C8F12F`,高亮块 + 棋盘格 | 5 种 preset 选 1(默认荧光绿 `#B8F03A`),只用于左侧竖条 + 右上角方块 + 高亮词底 |
| 小标签 | 5-6 组胶囊标签撒在网格里 | 标题下方只有一行等宽英文小字,竖线分隔 |
| 右侧道具 | 迷你终端窗(工作流动词) | 终端菜单面板(文章里的几个场景 + Ask_),人物食指指向它 |

## 强调色 preset(每张图选 1 组,不混用)

这个风格的配色骨架是"暖白皱纸 + 纯黑 + 黑白照片",强调色是全图唯一的彩色,只占很小的面积,所以要**饱和、明亮、平涂**。五组颜色都按同一条硬标准挑过:**高亮词是黑字压在强调色块上,黑字对色块的对比度必须 ≥ 4.5:1**(WCAG AA),这样缩到手机卡片大小也读得清。

| preset | 色值 | 黑字对比度 | 提示词锚点 | 适合什么文章 |
|---|---|---|---|---|
| `lime`(默认) | `#B8F03A` | 14.0 : 1 | fluorescent lime #B8F03A, bright and flat, NOT yellow, NOT olive | AI 工具实测、Agent 玩法,科技感 + 新鲜感 |
| `cyan` | `#3DDCFF` | 11.6 : 1 | electric cyan #3DDCFF, bright and flat, NOT teal, NOT navy, NOT sky blue | 产品发布、效率 / 数据类、冷静理性的拆解 |
| `orange` | `#FF6B1A` | 6.6 : 1 | signal orange #FF6B1A, safety-vest orange, NOT red, NOT brown | 踩坑、预警、截止日期、省钱 / 计费变化这类有紧迫感的内容 |
| `pink` | `#FF5FA2` | 6.7 : 1 | hot pink #FF5FA2, zine pink, NOT magenta-purple, NOT pastel | 设计、内容创作、创意玩法,轻松好玩的选题 |
| `violet` | `#B69CFF` | 8.3 : 1 | lavender violet #B69CFF, soft but saturated, NOT blue, NOT purple-grey | 观点、思考、模型研究,偏深度和安静的文章 |

为什么没有这些颜色:

- **黄色**:和暖白纸面亮度太接近(对比度只有约 1.2:1),竖条和角块会"融"进纸里,看不出来。
- **红色**:已经是 `kinetic` 风格的识别色,放在这里会和那个风格撞脸。
- **深蓝、深绿、深紫**:黑字压上去读不清,而且深色块会把画面压暗,丢掉这个风格的纸感。

选色规则:

1. 用户点名了颜色就用点名的;没点名时按上表"适合什么文章"选,拿不准就用 `lime`。
2. 商单时避开竞品的品牌色;甲方品牌色恰好接近某个 preset 时可以选那一组,但不要为了品牌临时发明新颜色。
3. 一张图只用一组强调色,三处位置(竖条、角块、高亮词底)都用同一个色值。
4. 人物肤色保持自然,衣服颜色按服装选项走(深绿系),不随强调色变化。

每次生成时,把 `{{中括号}}` 占位符换成从文章提炼的新内容,**其他保持不动**。

## 模板正文(直接复制,填空即可)

```
A wide-format editorial poster banner in 21:9 ratio. Gritty indie-zine print aesthetic: crumpled paper, photocopy grain, ink spray, but with a very clear typographic hierarchy where the large Chinese title is the hero and reads instantly.

COLOR SYSTEM (fixed):
- Left background: warm off-white crumpled paper (#EEEBE4) with visible creases and fine halftone dots
- Right background: black-and-white high-contrast photograph of a dim room with soft window-light shadows and a blurred plant, fully desaturated
- Type and panels: pure black (#111111) and white
- Accent: {{强调色锚点,从 preset 表复制,如 fluorescent lime #B8F03A, bright and flat, NOT yellow, NOT olive}}
- No other colors. The person's skin keeps a natural tone; the shirt keeps its midnight green.

TRANSITION:
- Between the paper area and the photo area, a wide band of black ink spray and coarse grain particles, like spray paint or a worn photocopy edge, dissolving from left paper into the right photo. The transition runs vertically roughly at 55% of the width.

ACCENT COLOR (exactly these three places, the accent color appears nowhere else):
1. A thin solid accent-color vertical strip along the full left edge of the canvas
2. One solid accent-color square in the top-right corner area with a thin black crosshair (+) drawn on it
3. The solid accent-color block behind the highlighted Chinese words

LAYOUT (left to right):
- Left 58%: typography on paper
  - Top: the English eyebrow word, ultra-condensed heavy black sans-serif with distressed ink texture inside the letters. It is big but secondary: its height is about 22% of the canvas height and it only spans the left part of the canvas, roughly the same width as the Chinese title. It is not full width.
  - Below it: the two-line Chinese title, the largest element in the image. Each line is about 18% of the canvas height. Ultra-heavy black sans-serif with slight ink-wear texture. The second line may extend to about 62% of the canvas width and may overlap the person's pointing hand.
  - Below the title: one single line of small monospace uppercase English, black, separated by vertical bars.
- Right 42%: the person, a black terminal menu panel

SUBJECT (RIGHT SIDE):
- A 30-something Asian male, senior software engineer turned content creator, thin black wire-frame glasses, slightly messy short black hair
- Wearing {{服装,从下方服装选项复制一段,默认 tee}}
- Real photographic look with light film grain; the face stays sharp and recognizable
- Half body, positioned in the right part of the canvas, body slightly turned, head near the top of the canvas
- Facial expression: {{表情:calm, confident, slight smile / quietly amused / composed and focused — 用克制表达,不要写 blocklist 里的词}}
- Interaction: right hand index finger pointing down-right at the terminal menu panel, the fingertip close to the first highlighted row

TERMINAL MENU PANEL (bottom-right):
- A black rounded-corner panel with three white dots at the top-left
- Inside, 3-4 rows of monospace white text, each row starting with "> ", the first row has a light grey highlight bar behind it, the last row is "> Ask_" with a cursor
- Rows: {{终端菜单行,3 个文章里真实出现的场景/能力 + Ask_,如 "> 选题雷达" "> 时间线" "> 结算台账" "> Ask_"}}

TEXT IN THE IMAGE (render exactly these texts, each only once, and no other text):
1. English eyebrow: "{{英文眉题,1 个大写单词,4-6 个字母,如 INBOX}}"
2. Chinese title line 1: the text "{{主标题第一行,4-6 字}}", pure black on the paper
3. Chinese title line 2: the text "{{第二行完整文字}}", where the characters "{{第二行非高亮部分}}" are pure black on the paper, and the characters "{{高亮词}}" are black characters sitting on the solid accent-color block ({{强调色色值,如 #B8F03A}})
4. Small monospace line under the title: "{{小字1}}" | "{{小字2}}" | "{{小字3}}"
5. The terminal menu rows listed above
Do not render any color names, hex codes, layout words or other English words.
NO punctuation, NO quotation marks between the Chinese title characters.

STYLE NOTES:
- The Chinese title is the hero; the English eyebrow supports it
- Grain, crumpled paper and ink spray give texture, while all text stays crisp and readable
- Flat solid accent-color blocks with crisp edges, no gradients, no glow, no 3D
- Calm, restrained expression, no exaggerated face
- No logos, no app screenshots, no robots, no glowing chips, no extra people, no dates
- No author watermark or signature text

ASPECT RATIO: 21:9 (wide cinematic banner format)
```

## 服装选项(grunge 专属,两选一)

其他四种风格固定穿午夜绿华夫格 Polo。`grunge` 是例外:这个风格的定稿图穿的是深绿圆领 T,和皱纸、黑白照片的粗粝感更搭,所以**默认用圆领 T**,想和其他风格保持一致时再换 Polo。两种都是深绿系,IP 的"绿色上衣"记忆点不变。

| 选项 | 什么时候用 | 填进 `{{服装}}` 的英文 |
|---|---|---|
| `tee`(默认) | 大多数情况;想要更随性、更像工作室实拍 | a plain heavyweight cotton crew-neck short-sleeve T-shirt in deep dark green (#1E3329, almost charcoal green), relaxed fit, slightly dropped shoulders, natural fabric folds, no logo, no print, no collar, no buttons |
| `polo` | 想和 classic / campaign 等风格的封面放在一起时视觉统一 | an OVERSIZED, RELAXED-FIT heavyweight waffle-knit short-sleeve polo shirt in Midnight Green (#004953), dropped shoulders, loose drape, collar open, similar to iPhone 11 Pro Midnight Green |

注意:

- 两段英文**只放一段**进提示词,不要同时出现 T 恤和 Polo 的描述,模型会混出带领子的 T 恤。
- 用 `tee` 时,模型偶尔会画出领子或纽扣:把 no collar, no buttons 留着;仍然出现就在末尾补一句 the shirt is a simple crew-neck tee。
- 人物在黑白摄影背景前,衣服保留深绿色,不要跟着背景一起去饱和;需要时加一句 the person is in natural color while the background photo is black and white。

## 填空指引

### 英文眉题——每篇必改

1 个大写英文单词,4-6 个字母最好,是文章主题的"物件"或"场景":`INBOX`(邮箱)、`AGENT`、`SKILL`、`PROMPT`。它只是眉题,**高度约画面 22%、只占左侧**,不要写 full width / spanning the canvas,否则会抢走中文标题的位置。

### 主标题(2 行)——每篇必改

这个风格中文是主角,所以**字要少、字要大**:第一行 4-6 字,第二行 6-8 字,高亮词 2-3 字放在第二行末尾。

| 第一行 | 第二行 |
|---|---|
| 吃灰的邮箱 | 翻出一个**知识库** |
| 三个 Agent | 顶一个**小团队** |
| 一张截图 | 做出**完整应用** |

### 等宽小字——每篇必改

一行三段,竖线分隔,每段 2-4 个英文单词,写文章的三个真实卖点:`ASK, DON'T SEARCH` | `2 INBOXES · 1 AGENT` | `NO PDF DOWNLOAD`。

### 终端菜单——每篇必改

3 行文章里真实出现的场景或能力(中文 2-4 字最好),加最后一行 `Ask_`(或换成和文章匹配的动作词 + 光标)。人物食指指向第一行,所以第一行放最重要的那个。

## 风格基线——不能改的部分

1. 左侧暖白皱纸 `#EEEBE4` + 右侧黑白摄影背景 + 中间颗粒喷溅过渡
2. 强调色从 5 组 preset 里选 1 组(默认 `lime` `#B8F03A`),只用三处:左侧竖条、右上角十字角块、高亮词底;不临时发明新颜色
3. 中文两行标题是全图最大元素;英文是眉题,不跨满全宽
4. 标题下只有一行等宽小字,不撒胶囊标签、不画棋盘格、不画栏线网格
5. 人物食指指向右下角黑色终端菜单面板
6. 共享 IP 基线:人物、左字右人、克制表情(见 SKILL.md);服装是本风格的例外,默认深绿圆领 T,也可以换回午夜绿 Polo(见「服装选项」)

## 自检三问

1. **缩到手机卡片大小,中文标题还是一眼最先看到的吗?** 英文眉题比中文还抢眼 → 把眉题高度写小,删掉 full width 之类的词
2. **强调色是不是只出现在那三处、色相对不对?** 多出来的色块 / 色字,或者橙变红、青变蓝 → 重写颜色段,把 preset 表里的 NOT 锚点补全
3. **画面里有没有多出来的字?**(模型自加的英文标语、提示词原文、边缘说明文字)→ 文字段强调 render exactly these texts, each only once

## 发到公众号的注意

- 这个 skill 原生出 21:9,和公众号 2.35:1 头图很接近,上传时裁剪框基本只切掉一点左右边缘,不会切到标题。
- 公众号转发小图是 1:1,裁剪框放在左侧"英文眉题 + 中文主标题"那一块。
