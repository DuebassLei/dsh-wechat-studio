# 林月半子分享卡片横幅 · 时尚人物 Campaign 风(campaign)提示词模板

风格参考图:`references/style-campaign-reference.png`

视觉定义:**奶油纸底 + 黑色超 condensed 巨字英文主题词压顶 + 酸性荧光绿高亮块 + 小面积棋盘格点缀 + 颗粒噪点 + 黑白迷你终端窗 + 栏线网格**。像街头时尚品牌的 Campaign 大片 / 独立杂志封面,粗粝、有态度、有纸张和复印机的质感。人物和 IP 基线不变。

每次生成时,把 `{{中括号}}` 占位符换成从文章提炼的新内容,**其他保持不动**。

## 模板正文(直接复制,填空即可)

```
A wide-format fashion-campaign-style editorial banner in 21:9 ratio, brutalist magazine aesthetic, like a streetwear brand campaign poster crossed with an indie tech zine cover. Gritty, confident, print-like.

COLOR SYSTEM (fixed, do not change):
- Background: warm cream paper (#F1EDE3)
- Primary type and blocks: pure black (#111111)
- Accent: acid lime (#C8F12F), fluorescent chartreuse — NOT yellow, NOT olive, NOT dark green
- No other accent colors

TEXTURE (critical for this style):
- Visible photocopy grain and film grain across the entire canvas
- Halftone noise on the photo of the subject; skin slightly desaturated, high-contrast print feel
- Paper texture on the cream background
- Everything feels printed, xeroxed, tactile — NOT clean digital rendering, NOT smooth gradients

OVERALL COMPOSITION:
- Wide horizontal banner, cream paper background with a faint editorial grid of thin hairline column rules
- Top band: one MASSIVE ultra-condensed black display word spanning the FULL WIDTH of the canvas, cropped at the edges: "{{英文主题词,大写,如 CODEX}}" — letters are gigantic, filling the top third, with photocopy grunge texture inside the letterforms
- Middle-left: two-line extra-bold black Chinese title; the highlighted phrase sits on a solid acid lime block with black text on top
- Right 40%: a real-photo-style half-body portrait of an Asian male tech blogger, standing in front of a black panel with acid lime edges
- Checkerboard accents, used with restraint: only 1-2 SMALL checkerboard patches (each just a short segment of roughly 4-10 large squares, partially cropped by the canvas edge), placed as quiet graphic accents — for example one small patch near a top corner and optionally one tiny patch elsewhere. The squares must be LARGE and chunky, similar in scale to the capsule labels. STRICTLY NO full-length checkerboard borders, NO checkerboard strips running along any canvas edge, NO dense tiny checker squares, NO checkerboard framing the composition
- One small black monochrome terminal window as a prop, bottom-right area
- Letter-spaced uppercase English capsule micro-labels scattered in the grid cells as editorial furniture

SUBJECT (RIGHT SIDE):
- An Asian male matching the reference image, looking like a senior software engineer turned content creator; preserve the reference person's apparent age and facial features
- Wearing an OVERSIZED, RELAXED-FIT, heavyweight waffle-knit short-sleeve polo shirt in Midnight Green color (#004953, deep dark green with subtle teal undertone)

  CRITICAL FIT DETAILS — this is NOT a standard fitted polo:
  - EXTREMELY relaxed, oversized silhouette — the shirt drapes loosely on the body, not hugging it
  - DROPPED SHOULDERS: the shoulder seam falls noticeably below the actual shoulder point
  - WIDE, LONG SLEEVES: short sleeves that hang loose to just above the elbow, with wide sleeve openings
  - DEEP V OPENING: collar wide and open, BOTH buttons undone, relaxed deep V-neckline
  - Visible diagonal draping wrinkles from the oversized fit

  FABRIC DETAILS:
  - Heavyweight cotton waffle-knit fabric, visible grid-like raised waffle texture
  - The dark green color: rich, slightly muted, similar to iPhone 11 Pro Midnight Green

- Glasses: thin black wire-frame
- Facial expression: {{表情:calm, confident, slight smile / focused, composed / quietly amused — 用克制表达,不要写 blocklist 里的词(excited/shocked 等),即使是否定写法也会被脚本拦截}}
- Half-body shot, right side of the canvas, in front of the black-and-lime panel
- Photo treatment: halftone photocopy grain, slightly desaturated skin, high-contrast print look
- Interaction: {{动作模式:pointing at the title / pointing at the terminal window / arms crossed, composed / open palm presenting}}
- Lighting: hard editorial flash feel, fashion-campaign contrast, NOT soft dreamy light

MINI TERMINAL WINDOW (prop, bottom-right):
- A small black window with three white dots at top-left, monospace white text
- Content: a vertical list of 4-5 short workflow verbs with "> " prefix, last line ends with a cursor "_":
  {{终端动词列表,如 Generate / Plan / Execute / Iterate / Ship_}}
- Verbs must match the article's real workflow, not generic words

MAIN TYPOGRAPHY (MIDDLE-LEFT):
Two-line extra-bold Chinese title, very large. The rendered title text must contain ONLY the Chinese characters below — do not render any English words, color names, or layout instructions.

Line 1: the text "{{主标题第一行,5-8 字}}", pure black on the cream background.
Line 2: the text "{{第二行完整文字}}", where the characters "{{第二行非高亮部分}}" are pure black on the cream background, and the characters "{{高亮词}}" are black characters sitting on a solid acid lime rectangular highlight block (#C8F12F).

Font: ultra-heavy condensed sans-serif, brutalist poster weight
IMPORTANT: NO punctuation, NO quotation marks between Chinese title characters

EDITORIAL MICRO-LABELS (letter-spaced uppercase English, small, black, placed in grid cells with thin rules):
- Top-left: "{{胶囊标签1,如 AI × PRODUCTIVITY ×}}" / "{{第二行,如 ONE-PERSON COMPANY}}"
- Top-middle: "{{胶囊标签2,如 BUILD AUTOMATE SHIP}}" and a "//" mark
- Top-right: "{{胶囊标签3,如 FROM IDEA TO REAL PRODUCT SOLO.}}"
- Bottom row: "{{胶囊标签4,如 SMALL TEAM / BIGGER POSSIBILITY}}", "{{胶囊标签5,如 AGENTS AUTOMATION REAL IMPACT}}", "{{胶囊标签6,如 CHINESE BUILDERS GLOBAL OPPORTUNITIES}}"
- Style: wide letter-spacing, small, understated furniture — the giant display word and Chinese title are the heroes

STYLE NOTES:
- Photo-realistic portrait with heavy print/grain treatment, NOT a clean digital photo
- The giant display word must dominate the top — if it reads as a normal-sized headline, it is wrong
- Flat solid blocks (black, lime), crisp edges, no gradients, no glow
- Checkerboard strips and hairline grid give the zine/fashion layout discipline
- No exaggerated facial expressions
- No author watermark or signature text
- Vibe: a fashion campaign for a one-person tech company — attitude, not sales

ASPECT RATIO: 21:9 (wide cinematic banner format)
```

## 填空指引

### 英文主题词(顶部巨字)——每篇必改

campaign 风的视觉锚点。**1 个英文核心词,大写**,如 `CODEX`、`HERMES`、`AGENT`。

- 词必须是文章主角(产品名 / 核心概念),短而有力,4-8 个字母最佳
- 这个词会被放得极大、出血裁切,**不要在提示词里把它写成 "title" 或 "headline",要写 "massive display word spanning the full width, cropped at edges"**

### 主标题(2 行)——每篇必改

和 classic 同一套方法:两行、反差节奏、高亮词在第二行。区别是**高亮词是黑字压在荧光绿色块上**,不是变色字。

| 第一行(前提)| 第二行(冲击)|
|---|---|
| Codex 国产替代 | 一人公司**跑通全流程** |
| 一个人 | 就是**一家公司** |
| AI 替你干活 | 你只管**做决定** |

### 终端动词列表——每篇必改

4-5 个动词,概括文章讲的真实工作流,最后一个带光标 `_`:

| 文章主题 | 动词列表 |
|---|---|
| AI 编程工具 | Generate / Plan / Execute / Iterate / Ship_ |
| 多 Agent | Spawn / Route / Review / Merge / Ship_ |
| 内容工作流 | Collect / Draft / Edit / Publish_ |
| 评测横评 | Test / Compare / Fail / Retry / Pick_ |

### 胶囊标签——每篇必改

5-6 组 letter-spaced 英文小标签,撒在网格格子里。内容是文章气质的英文提炼,短、硬、有态度:

- 公式:`{领域} × {动作}` / `{三个动词}` / `{FROM X TO Y}` / `{人群} {态度}`
- 例:`BUILD AUTOMATE SHIP` / `FROM IDEA TO REAL PRODUCT SOLO.` / `CHINESE BUILDERS GLOBAL OPPORTUNITIES`

### 动作模式

| 文章类型 | 推荐动作 |
|---|---|
| 观点宣言 / 态度文 | pointing at the title / arms crossed, composed |
| 工具实测 / 工作流 | pointing at the terminal window |
| 产品安利 | open palm presenting |

## 风格基线——不能改的部分

1. 奶油纸底 `#F1EDE3` + 纯黑 + 酸性荧光绿 `#C8F12F`,**禁止第四种颜色**
2. 顶部巨字必须跨满全宽、出血裁切,**禁止缩成普通标题**
3. 全图颗粒噪点 + 半调复印质感,**禁止干净光滑的数字渲染感**
4. 荧光绿只用于:高亮词色块 + 人物背后色块边缘 + 棋盘格点缀。棋盘格只能是 1-2 处小面积局部点缀(每处几格大格子、被画布边缘裁切),禁止铺满任何一条边的整条棋盘格带/边框
5. 共享 IP 基线:人物、午夜绿 Polo、左字右人、克制表情(见 SKILL.md)
6. 禁止:渐变、glow、3D 效果、圆润可爱的元素

## 自检三问

1. **顶部的英文巨字是不是大到出血、压住了整个顶部?** 只是普通大小的标题 → 重写,强调 massive / full width / cropped at edges
2. **全图是不是只有奶油、黑、荧光绿三个颜色?** 出现别的彩色 → 重写
3. **照片和纸面有没有颗粒/复印质感?** 太干净太光滑 → 提示词里加 photocopy grain / halftone noise 重写
