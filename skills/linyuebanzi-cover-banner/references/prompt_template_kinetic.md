# 林月半子分享卡片横幅 · 动感斜体大字风(kinetic)提示词模板

风格参考图:`references/style-kinetic-reference.png`

视觉定义:**暖白底 + 超大斜体黑色粗字 + 鲜红高亮词 + 红色速度线/斜切条 + 底部空心描边英文大字回声 + 右侧大头人物配黑色斜切面板**。像运动品牌海报 / 赛车涂装的字体动能感,高对比、有速度、有冲击力。没有右侧 UI 对象、没有小标签,全部能量都在字和人上。人物和 IP 基线不变。

每次生成时,把 `{{中括号}}` 占位符换成从文章提炼的新内容,**其他保持不动**。

## 模板正文(直接复制,填空即可)

```
A wide-format article cover banner in 21:9 ratio, kinetic-typography sports-poster aesthetic — high-energy italic display type, like a racing livery or an athletic brand campaign. Bold, fast, high-contrast.

COLOR SYSTEM (fixed, do not change):
- Background: warm off-white (#F5F3EE)
- Primary type: pure black (#111111)
- Accent: vivid signal red (#EE2B24), saturated and bright — NOT orange, NOT dark red, NOT pink
- The right side features a solid black diagonal-cut panel behind the person
- No other accent colors

OVERALL COMPOSITION:
- Wide horizontal banner on warm off-white background, with a few faint thin diagonal hairlines in the far background
- Left 60%: the title typography dominates — ultra-heavy ITALIC condensed Chinese characters, two lines, massively oversized, touching the top and left edges of the canvas, tightly stacked line spacing
- Red kinetic accents: ONE OR TWO very long, thick, bold slanted parallelogram bars — spanning almost the full width, cropped by the canvas edges, placed above the title, same slant angle as the italic type — like one big motion streak. Absolutely NOT many small scattered fragments
- Bottom-left corner: a giant hollow OUTLINE-ONLY echo of the word "{{英文主题词,如 Codex}}" in italic — thin black stroke, no fill, partially cropped by the bottom edge, like a ghost of the title speeding past
- Right 40%: a solid black panel cut on a strong diagonal, with one vivid red diagonal slash stripe along its left edge; the person stands in front of it
- Composition reads as one fast diagonal flow from bottom-left to top-right

SUBJECT (RIGHT SIDE):
- A 30-something Asian male, looking like a senior software engineer turned content creator
- LARGE HEAD-AND-SHOULDERS close-up (bigger crop than a half-body shot — the face is BIG in frame, head nearly touching the top edge, face and upper chest fill the right side), facing the camera directly with quiet confidence
- Wearing an OVERSIZED, RELAXED-FIT, heavyweight waffle-knit short-sleeve polo shirt in Midnight Green color (#004953, deep dark green with subtle teal undertone)

  CRITICAL FIT DETAILS — this is NOT a standard fitted polo:
  - EXTREMELY relaxed, oversized silhouette — the shirt drapes loosely on the body
  - DROPPED SHOULDERS: the shoulder seam falls noticeably below the actual shoulder point
  - WIDE, LONG SLEEVES: short sleeves hanging loose to just above the elbow
  - DEEP V OPENING: collar wide and open, BOTH buttons undone, relaxed deep V-neckline

  FABRIC DETAILS:
  - Heavyweight cotton waffle-knit fabric, visible grid-like raised waffle texture
  - The dark green color: rich, slightly muted, similar to iPhone 11 Pro Midnight Green

- Glasses: thin black wire-frame
- Facial expression: {{表情:calm, confident, direct gaze at camera / composed, slight smile / focused and assured — 用克制表达,不要写 blocklist 里的词(excited/shocked 等),即使是否定写法也会被脚本拦截}}
- No hand props, no UI objects — the type is the hero, the person just owns the frame
- Lighting: clean editorial studio light with a slight dramatic edge, sharp catchlights in the eyes, strong tonal separation from the black panel

MAIN TYPOGRAPHY (LEFT 60%, THE ABSOLUTE HERO):
Two-line ultra-heavy ITALIC condensed Chinese title, enormous, filling the left area edge to edge. The rendered title text must contain ONLY the Chinese characters below — do not render any English words, color names, or layout instructions.

Line 1: the text "{{主标题第一行,5-8 字}}", pure black italic.
Line 2: the text "{{第二行完整文字}}", where the characters "{{第二行非高亮部分}}" are pure black italic, and the characters "{{高亮词}}" are vivid signal red (#EE2B24) italic.

TYPEFACE — THIS IS CRITICAL:
- Ultra-heavy, ultra-condensed Chinese gothic headline typeface, maximum stroke weight, chunky and dense
- Slight italic oblique lean: every vertical stroke of every Chinese character leans gently to the right, about 8 degrees — subtle speed, not dramatic. No fully upright characters, but do not over-slant
- Extremely tight tracking between characters, extremely tight line spacing — the two lines almost touch each other
- The two title lines together form one dense, slanted typographic block
IMPORTANT: NO punctuation, NO quotation marks between Chinese title characters

OUTLINE ECHO (BOTTOM-LEFT):
- The word "{{英文主题词,大写首字母,如 Codex}}" in giant italic outline-only letters — thin black stroke, transparent fill, partially cropped by the bottom and left edges
- It must read as a background echo, much lighter than the main title

AUTHOR WATERMARK (bottom right corner):
"@林月半子 · LunarAITalk" in small white text, sitting on the black panel area

STYLE NOTES:
- Photo-realistic portrait, NOT illustration
- The italic slant of ALL type and ALL red bars must share the same angle — one consistent direction of speed
- Flat solid color blocks only: no gradients, no glow, no 3D effects, no shadows on type
- No capsule labels, no terminal windows, no checkerboards, no extra decoration — type and person only
- No exaggerated facial expressions
- Vibe: a sports-poster for a tech argument — speed, conviction, impact

ASPECT RATIO: 21:9 (wide cinematic banner format)
```

## 填空指引

### 主标题(2 行)——每篇必改

和其他风格同一套方法:两行、反差节奏。区别是 **kinetic 的高亮词直接变红色斜体字**,不压色块。

| 第一行(前提)| 第二行(冲击)|
|---|---|
| Codex 国产替代 | 一人公司**跑通**全流程 |
| 一张截图 | **四轮**做出完整应用 |
| 别再卷模型 | **工作流**定胜负 |

注意:这个风格字超大,**每行最好控制在 5-8 个字**,字多了会挤。

### 英文主题词(底部空心回声)——每篇必改

文章主角的 1 个英文词,做成左下角的空心描边大字,**被底部和左边缘裁切**。如 `Codex`、`STEP5`、`Hermes`。

- 词必须短(4-8 个字母最佳),长了空心描边会糊
- 是"回声",不是标题——它必须明显弱于中文主标题

### 表情——每篇按文章情绪挑

这个风格没有人物动作和右侧对象,**表情和眼神是唯一的人物变量**:

| 文章类型 | 推荐表情 |
|---|---|
| 观点宣言 / 态度文 | calm, confident, direct gaze at camera |
| 实测 / 评测 | composed, slight smile |
| 教程 / 安利 | focused and assured |

## 风格基线——不能改的部分

1. 暖白底 `#F5F3EE` + 纯黑 + 鲜红 `#EE2B24`,**禁止第四种颜色**
2. 所有斜体元素(中文标题、红色速度条、空心英文回声)**共享同一个倾斜角度**
3. 高亮词是红色斜体字本身,**禁止压色块**(那是 campaign 的玩法)
4. 右侧是黑色斜切面板 + 一条红色斜切条纹 + 大头人物特写,**没有右侧 UI 对象、没有小标签、没有终端窗**
5. 共享 IP 基线:人物、午夜绿 Polo、左字右人、水印、克制表情(见 SKILL.md)
6. 禁止:渐变、glow、3D、胶囊标签、棋盘格、任何其他装饰

## 自检三问

1. **全部斜体元素的倾斜角度是不是一致?** 字往一边倒、红条往另一边倒 → 重写,强调 same slant angle
2. **红色是不是鲜亮的信号红?** 偏橙/偏暗红/偏粉 → 锚定 #EE2B24 重写
3. **画面是不是只有"字 + 人 + 红条 + 空心回声"?** 长出了 UI 卡片/标签/终端窗 → 重写,这是 kinetic,不是别的风格
