# 林月半子分享卡片横幅 · 新锐科技编辑风(editorial)提示词模板

风格参考图:`references/style-editorial-reference.png`

视觉定义:**米白纸感底 + 克莱因蓝几何块 + 超大黑色粗体字 + 悬浮白色 App 窗口卡 + 细线 + letter-spaced 英文胶囊标签**。像一本新锐科技杂志的封面/ keynote 主视觉,明亮、干净、年轻,和 classic 的深色终端氛围完全不同,但人物和 IP 基线不变。

每次生成时,把 `{{中括号}}` 占位符换成从文章提炼的新内容,**其他保持不动**。

## 模板正文(直接复制,填空即可)

```
A wide-format article cover banner in 21:9 ratio, bright minimal "new-wave tech editorial" aesthetic, like a modern tech magazine cover or a product keynote hero slide. High-key, clean, youthful.

COLOR SYSTEM (fixed, do not change):
- Background: off-white paper (#F4F3EF), bright and airy
- Primary type: pure black (#111111)
- Accent: Klein blue / royal blue (#1F4FE0), saturated and deep — NOT sky blue, NOT navy, NOT purple
- NOT a dark background, NOT a dark moody tech style

OVERALL COMPOSITION:
- Wide horizontal banner on clean off-white paper background
- Left 55-60% area: huge bold black Chinese typography, left-aligned
- Right 40% area: a real-photo-style half-body portrait of an Asian male tech blogger + one floating white app window card
- Flat geometric Klein blue shapes as accents: one large solid blue shape behind the right side of the canvas, plus 1-2 smaller blue triangle / wedge accents
- Thin black hairline rules and letter-spaced uppercase English micro-labels placed in corners as editorial furniture
- Generous negative space, crisp edges, magazine layout discipline

SUBJECT (RIGHT SIDE):
- A 30-something Asian male, looking like a senior software engineer turned content creator
- Wearing an OVERSIZED, RELAXED-FIT, heavyweight waffle-knit short-sleeve polo shirt in Midnight Green color (#004953, deep dark green with subtle teal undertone)

  CRITICAL FIT DETAILS — this is NOT a standard fitted polo:
  - EXTREMELY relaxed, oversized silhouette — the shirt drapes loosely on the body, not hugging it
  - DROPPED SHOULDERS: the shoulder seam falls noticeably below the actual shoulder point, creating natural sagging fabric folds at the shoulder area
  - WIDE, LONG SLEEVES: short sleeves that hang loose and extend down to just above the elbow, with wide sleeve openings
  - DEEP V OPENING: the collar is wide and open, BOTH buttons completely undone, creating a relaxed deep V-neckline that exposes the upper chest area
  - Visible diagonal draping wrinkles from the oversized fit

  FABRIC DETAILS:
  - Heavyweight cotton waffle-knit fabric, very thick and structured
  - HIGHLY VISIBLE waffle texture: prominent grid-like raised pattern across the entire shirt
  - The dark green color: rich, slightly muted, similar to iPhone 11 Pro Midnight Green

- Glasses: thin black wire-frame
- Facial expression: {{表情:calm, thoughtful, slight smile / focused, confident / quietly amused — 用克制表达,不要写 blocklist 里的词(excited/shocked 等),即使是否定写法也会被脚本拦截}}
- Half-body shot, positioned on the right 1/3 of the canvas, standing in front of the large blue geometric shape
- Interaction: {{动作模式:pointing at the floating app window / open palm presenting the window / lightly tapping the window surface}}
- Lighting: bright, clean, soft studio lighting with a subtle soft shadow — high-key, NOT dark, NOT dramatic

RIGHT-SIDE OBJECT — FLOATING APP WINDOW CARD:
- A clean white macOS-style app window floating at a slight angle beside/behind the subject
- Window chrome: three traffic-light dots (red/yellow/green) at top-left, a thin title bar
- Window content: {{窗口内容:产品界面示意,如 sidebar icons + app name "产品名" + 2-3 行内容占位条}}
- The window must look like a real product UI, not a generic glowing panel
- Flat design, white surface, subtle drop shadow, sharp and readable
- Optionally one small blue UI accent inside the window (an icon or active state)

MAIN TYPOGRAPHY (LEFT 55-60% OF CANVAS):
Two-line extra-bold Chinese title, very large, left-aligned, tight line spacing:

Line 1 (pure black): "{{主标题第一行,5-8 字}}"
Line 2 (mixed): "{{第二行非高亮部分}}" in BLACK + "{{高亮词}}" in Klein blue (#1F4FE0)

Font: ultra-heavy condensed sans-serif, black weight, confident editorial feel
IMPORTANT: NO punctuation, NO quotation marks between Chinese title characters

EDITORIAL MICRO-LABELS (letter-spaced uppercase English, small, black, placed with thin hairline rules):
- Top-left corner: "{{胶囊标签1,如 AI × DEVELOPER}}" / "{{胶囊标签1 第二行,如 A MORE OPEN FUTURE}}"
- Bottom-left corner: "{{胶囊标签2,如 SMALL TEAM}}" / "{{胶囊标签2 第二行,如 BIGGER POSSIBILITIES}}"
- Top-right corner: "{{胶囊标签3,如 IDEAS TOOLS #PRODUCTIVITY}}"
- Style: wide letter-spacing, small size, understated — furniture, not the hero

STYLE NOTES:
- Photo-realistic portrait, NOT illustration
- Bright high-key overall exposure, clean white-ish background with subtle paper texture
- Flat vector-like blue geometric shapes, crisp edges, no gradients on the shapes
- No terminal code background, no dark ambience, no glow effects
- Main color palette: off-white, black, Klein blue, midnight green polo — nothing else
- No exaggerated facial expressions
- No author watermark or signature text
- Vibe: a sharp young tech editor presenting a finding, magazine-cover confidence

ASPECT RATIO: 21:9 (wide cinematic banner format)
```

## 填空指引

### 主标题(2 行)——每篇必改

和 classic 同一套方法:从文章金句/反常识观点里挑,拆两行,**第一行 5-8 字,第二行 5-8 字**。高亮词放第二行,用克莱因蓝。

| 第一行(前提)| 第二行(冲击)|
|---|---|
| Codex 国产替代 | 一人公司**跑通全流程** |
| 这个工具 | 让我**少加一周班** |
| 别再卷模型了 | **工作流**才是壁垒 |

### 胶囊标签——每篇必改

editorial 风的"三标签"是 2-3 组英文胶囊小标签,letter-spaced 大写,每组 1-2 行,每行 2-4 个词。**内容是文章气质的英文提炼,不是标题翻译**。

公式:
- 左上:`{领域} × {动作}` + `{一句态度}` —— 如 `AI × DEVELOPER` / `A MORE OPEN FUTURE`
- 左下:`{人群/团队}` + `{可能性}` —— 如 `SMALL TEAM` / `BIGGER POSSIBILITIES`
- 右上:`{三个关键词}` —— 如 `IDEAS TOOLS #PRODUCTIVITY`


### 悬浮窗口卡——每篇必改

窗口里是文章主角产品的界面示意,**必须是真实存在的产品/界面**,不能编造:

- 产品名写真实名字(Codex / Hermes / n8n / Claude Code)
- 窗口内容用 2-3 个可读的 UI 元素概括(sidebar、列表行、按钮),不要塞满小字
- AI 对小字处理差,窗口内文字越少越安全

### 动作模式

| 文章类型 | 推荐动作 |
|---|---|
| 产品发布 / 新工具安利 | pointing at the floating app window |
| 教程 / 功能展示 | lightly tapping the window surface |
| 观点 / 结论鲜明 | open palm presenting the window |

## 风格基线——不能改的部分

1. 米白纸感底 `#F4F3EF`,明亮高调,**禁止深色底**
2. 强调色只有克莱因蓝 `#1F4FE0`,高亮词和几何块共用,**禁止第二种强调色**
3. 几何块是平的纯色块, crisp edges,**禁止渐变和发光**
4. 共享 IP 基线:人物、午夜绿 Polo、左字右人、克制表情(见 SKILL.md)
5. 禁止:终端代码背景、暗色氛围、glow 特效、夸张表情

## 自检三问

1. **远看这张图是不是"明亮、干净、蓝黑白"三色?** 出现第四种颜色或变暗 → 重写
2. **窗口卡里的产品是不是文章里真实的主角?** 编造的产品名 → 重写
3. **蓝色是不是饱和的克莱因蓝?** 偏天蓝/偏紫/偏淡 → 提示词里加锚定重写
