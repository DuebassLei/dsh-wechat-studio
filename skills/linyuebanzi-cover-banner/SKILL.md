# 林月半子分享卡片横幅生成

## 视觉 IP 核心定义

林月半子的封面有七种风格,共享同一个人设 IP,但视觉语言不同:

| 风格 | id | 视觉语言 | 什么时候用 |
|---|---|---|
| **经典深绿大厂博主风** | `classic`(默认) | 深绿青底 + 主题色强调 + 终端背景 + 左字右人 | 默认选择,教程/拆解/复盘类长文 |
| **新锐科技编辑风** | `editorial` | 米白纸感底 + 克莱因蓝几何块 + 超大黑体字 + 悬浮 App 窗口卡 | 产品发布/工具安利/资讯解读,想更年轻、更轻、更"新" |
| **时尚人物 Campaign 风** | `campaign` | 奶油纸底 + 黑色巨字 + 酸性荧光绿 + 棋盘格 + 颗粒噪点 | 观点宣言/重磅实测/系列开篇,想要杂志大片感、态度感 |
| **动感斜体大字风** | `kinetic` | 暖白底 + 超大斜体黑字 + 信号红高亮词 + 红色速度线 + 空心描边英文回声 + 黑色斜切面板大头人物 | 想要冲击力、速度感、运动感,标题本身就是主角 |
| **颗粒喷溅海报风** | `grunge` | 左侧暖白皱纸 + 黑色磨损英文眉题 + 超大中文两行标题 + 颗粒喷溅过渡到右侧黑白摄影背景 + 强调色竖条/十字角块(五色 preset 选一)+ 人物指向黑色终端菜单面板 | 产品实测/商单/玩法拆解,中文标题要一眼读清,又想要杂志海报的粗粝感;也适合直接当公众号头图 |
| **纪实海报** | `magenta` | 做旧米灰墙、6 组矿物杂志点色、英文巨字、中文反差标题和桌前人物摄影 | 工具实测、工作流复盘和科技专题 |
| **羊毛毡手作** | `felt` | 米色手工纸底 + 羊毛毡/黏土微缩场景 + 特粗宋体中文标题 + 品牌色小字 | 产品发布/资讯解读/开源消息,想要温暖手作感、物件当主角 |

**七种风格不变的 IP 基线**(这是"一眼认出林月半子"的根本):

1. 画幅 21:9 宽幅
2. 人物:来自用户设置。有参考图时以参考图为准(长相、发型、配饰);服装默认沿用参考图,参考图只有头像时按性别配简单上衣,也可在设置里自定义。模板里用 [[SUBJECT]] / [[OUTFIT]] / [[人物]] / [[服装]] / [[玩偶]] 表示,由宿主填写,不要在替换值里另写人物和服装
3. 布局:左字右人(文字区在左,人物在右)
4. 无作者水印:画面不带个人署名
5. 主标题两行中文粗体 + 1 个高亮词
6. 表情克制:沉静、会心一笑、专注、温和笃定,禁止兴奋激动
7. 英文小字标签(letter-spaced 大写)作为编辑感装饰

**例外**:`magenta` 的文字层级见其专属模板;`felt` 人物默认缺席(出现时是毛毡玩偶,形象和服装来自用户设置),主标题用宋体衬线,不用英文小标签,不使用真人参考图。

**变的只是**:底色、强调色、装饰元素(终端背景 / 几何块+窗口卡 / 巨字+棋盘格 / 斜体字+速度线 / 皱纸+颗粒喷溅+终端菜单 / 毛毡微缩场景)、右侧对象形态、字体气质。

## 什么时候触发这个 skill

明确触发场景:
- 用户说「做个分享卡片」「生成分享横幅」「配个卡片头图」「给链接配图」
- 用户说「分享卡片封面」「链接预览图」「聊天卡片封面」「文章分享图」
- 用户准备把文章发到 IM / 社群 / 聊天窗口,想补一张卡片顶部横幅
- 任何与"消息卡片顶部那张横幅图"相关的场景

不要触发的场景:
- 文章首图 / 开场题图 / 正文顶部头图(这些应该走 `linyuebanzi-cover-hero`)
- 小红书封面(3:4 或 1:1,视觉风格完全不同)
- 短视频封面
- 朋友圈九宫格
- 头像、logo、海报等非文章封面的图片需求
- 文章正文插图(走别的图生成工具)

## 核心流程

这个 skill 分三步执行,**每一步都有质检点,不通过不往下走**。

### 第〇步:选风格

先决定用哪种风格,再提炼素材。**用户没指定时默认 `classic`**。

判断建议:

- 用户明确说"编辑风 / 浅色 / 蓝白 / 年轻一点 / 杂志感" → `editorial`
- 用户明确说"Campaign / 大片感 / 时尚 / 荧光绿 / 态度" → `campaign`
- 用户明确说"冲击力 / 速度感 / 运动感 / 大字 / 标题党" → `kinetic`
- 用户明确说"颗粒 / 喷溅 / 复印感 / 海报风 / 中文大标题 / INBOX 那种" → `grunge`
- 用户明确说"毛毡 / 羊毛毡 / 黏土 / 手作 / 微缩 / 温暖一点 / 赛博禅心那种" → `felt`
- 用户给了参考图 → 对照 `references/style-editorial-reference.png`、`references/style-campaign-reference.png`、`references/style-kinetic-reference.png`、`references/style-grunge-reference.png` 判断属于哪种
- 都没说 → `classic`

也可以根据文章气质主动建议:产品发布/新工具安利适合 `editorial`;观点宣言/系列开篇/重磅实测适合 `campaign`;教程/拆解/复盘适合 `classic`;标题本身就是最大看点、想要强视觉冲击适合 `kinetic`;产品实测/商单/玩法拆解,中文标题要一眼读清又想要粗粝海报感适合 `grunge`;产品发布/资讯解读/开源消息,想要温暖手作感、让物件当主角适合 `felt`。

### 第一步:读懂文章,提炼封面素材

先把文章内容吃透,然后从文章中抽出关键素材。七种风格共享的素材:

1. **主标题(2 行)** —— 文章核心论点的极简表达,2 行布局,每行不超过 7 个汉字。第一行是"前提",第二行是"反差/结论",形成"小钩子-大冲击"的节奏
2. **高亮词** —— 主标题里挑 1-2 个最关键的词,用风格强调色强调
3. **英文主题词** —— 文章主题的 1-4 个英文核心词,大写。`classic` 里它是标题背后的幽灵副标题(如 `YOUDAONOTE × LLM WIKI`);`editorial` 里它是胶囊小标签;`campaign` 里它是画面顶部的**黑色巨型展示字**(如 `CODEX`);`kinetic` 里它是左下角的**空心描边大字回声**(如 `Codex`);`grunge` 里它是中文标题上方的**磨损英文眉题**(如 `INBOX`,只占左侧,不跨满全宽)
4. **右侧对象** —— 每种风格有自己的对象体系,见第二步
5. **底部/角落小标签** —— `classic` 用 emoji + 4-6 字三标签;`editorial` / `campaign` 用 letter-spaced 英文胶囊标签(如 `AI × DEVELOPER` / `SMALL TEAM BIGGER POSSIBILITIES`);`grunge` 只在标题下方放一行等宽英文小字,竖线分隔三段(如 `ASK, DON'T SEARCH | 2 INBOXES · 1 AGENT | NO PDF DOWNLOAD`)
6. **人物互动动作** —— 托举 / 指向 / 轻触 / 双手框定 / 提起展示 / 近距离检视,根据文章内容和右侧对象决定,不要每篇都退化成同一个手势
7. **主题色** —— `classic` 从 amber/cyan/lime/violet 四组 preset 选 1 组;`editorial` 固定克莱因蓝;`campaign` 固定酸性荧光绿;`kinetic` 固定信号红;`grunge` 从 lime/cyan/orange/pink/violet 五组 preset 选 1 组(默认 lime,色值和选色规则见 `references/prompt_template_grunge.md`);`magenta` 按文章题材从深钴蓝/松烟墨绿/矿物朱砂/焦橙陶土/梅子暗紫/油墨洋红六组 preset 选 1 组(不要因 id 叫 `magenta` 就偏选洋红,见 `references/prompt_template_magenta.md`);`felt` 跟随文章主角的品牌色(preset 表见 `references/prompt_template_felt.md`,默认赭橙)

**重要原则**:

- 主标题里的"金句"优先使用文章里**已经出现过的原句**,不要另起炉灶搞营销腔
- 情绪要和文章主线一致,但人物表情统一限制在克制、稳定的范围内,优先用沉静、会心一笑、专注、温和、笃定,不要用兴奋、激动、狂喜这类高唤醒状态
- 右侧对象必须是**具体可视化的东西**,不能是"数据""协作""智能"这类抽象概念
- 小标签的内容必须跟文章语义相关,不要用没信息量的通用词
- 主题色只能用风格批准的配色,不要为了一篇文章临时发明新颜色

### 第二步:按风格选模板,生成完整提示词

根据第〇步选定的风格,使用对应的模板文件填空:

| 风格 | 模板文件 |
|---|---|
| `classic` | `references/prompt_template.md` |
| `editorial` | `references/prompt_template_editorial.md` |
| `campaign` | `references/prompt_template_campaign.md` |
| `kinetic` | `references/prompt_template_kinetic.md` |
| `grunge` | `references/prompt_template_grunge.md` |
| `magenta` | `references/prompt_template_magenta.md` |
| `felt` | `references/prompt_template_felt.md` |

选中 `magenta` 时，文字层级与强调色遵循该模板专属设定。

**关键坚持**(七种风格共享的品牌基线,**不要为了"创意"改掉**):

- 画幅:21:9 宽幅(API 固定)
- 人物:来自用户设置(参考图 + 人物设置),模板里用 [[SUBJECT]] / [[OUTFIT]] / [[人物]] / [[服装]] / [[玩偶]] 表示,由宿主填写,不要在替换值里另写人物和服装
- 布局:左文字区 / 右人物 + 对象区
- 无作者水印:画面不渲染个人署名
- 字体要求:主标题粗体,关键词用风格强调色
- 禁用元素:日期、过多装饰、夸张表情

**blocklist 注意**:生成脚本会对最终提示词做禁用词**子串匹配**(`references/blocklist.txt`,含 excited/shocked/amazed 等),即使是 "NOT excited" 这种否定写法也会命中并停止。填完模板后,把这些词从最终提示词里彻底删掉,改用 calm and composed / restrained 这类正面克制表达。

**各风格专属基线**:

- `classic`:深绿青底(#0F2A2D 到 #1A1A1A 渐变),主题色从 amber/cyan/lime/violet 四组 preset 选 1 组,背景必备终端命令片段 + 目录树,右侧对象从 5 种对象家族里选
- `editorial`:米白纸感底(#F4F3EF),强调色固定克莱因蓝(#1F4FE0),必备蓝色几何块 + 悬浮白色 App 窗口卡 + 细线分隔 + letter-spaced 英文胶囊标签
- `campaign`:奶油纸底(#F1EDE3),强调色固定酸性荧光绿(#C8F12F),必备顶部黑色巨字英文主题词 + 荧光绿高亮块 + 小面积棋盘格点缀 + 颗粒噪点质感 + 黑白迷你终端窗 + 栏线网格
- `kinetic`:暖白底(#F5F3EE),强调色固定信号红(#EE2B24),必备超大斜体中文标题 + 红色速度线 + 左下角空心描边英文回声 + 右侧黑色斜切面板 + 大头人物特写;没有右侧 UI 对象、没有小标签,所有斜体元素共享同一倾斜角度
- `grunge`:左侧暖白皱纸(#EEEBE4)+ 右侧黑白摄影背景,中间黑色颗粒喷溅过渡;强调色从五组 preset 选一(lime #B8F03A 默认 / cyan #3DDCFF / orange #FF6B1A / pink #FF5FA2 / violet #B69CFF,都保证黑字压色块对比度 ≥4.5:1),只用三处(左侧竖条、右上角十字角块、高亮词底);中文两行标题是全图最大元素(每行约画面高度 18%),英文眉题约 22% 高且只占左侧;标题下一行等宽英文小字;右下角黑色终端菜单面板(文章里的 3 个场景 + `Ask_`),人物食指指向第一行;不画棋盘格、栏线网格、胶囊标签
- `felt`:米色手工纸底(#EFE8D8),右侧物件必须是羊毛毡/黏土手作微缩质感(绒毛纤维、哑光手捏痕、柔和接触阴影、浅景深);主标题特粗宋体/衬线纯黑,顶部品牌名小字用品牌色(preset 表见模板,默认赭橙 #D97757),强调色只出现在品牌名、高亮词、物件细节三处;文字平面印刷,禁止毛毡化;人物默认缺席,人物段只填「无人物」或「玩偶」,玩偶的形象和服装由宿主填写;宿主对本风格不传真人参考图

## 常见翻车点与对策

| 翻车点 | 原因 | 对策 |
|---|---|---|
| 人物长得不像本人 | 这是 AI 生图的根本机制问题——纯文字提示词每次的 seed 都不同 | 在设置里上传清晰的正脸半身照 |
| 半身照里的衣服被换掉 | 模型没遵守「沿用参考图服装」 | 在设置里把服装来源改成自定义描述,写清款式和颜色 |
| 标题里出现奇怪的引号或乱码 | AI 生图对中文标点处理不稳定 | 提示词加 NO punctuation between Chinese title words;翻车后用 PS/Figma 涂掉 |
| 表情太夸张(微笑过度,亢奋) | AI 默认会让人物显得"销售感" | 提示词写 NOT exaggerated, NOT smirking;用 calm/thoughtful/slight smile 这种克制表达 |
| 背景代码太杂乱抢戏(classic) | 背景元素铺得太密 | 提示词强调 background elements should be FAINT and SUBTLE,透明度低,不抢主体 |
| 人物和背景颜色融在一起(classic) | 深色衣服 + 深绿背景容易糊掉 | 提示词强调 strong tonal separation, use rim light to separate subject from background |
| 卡片里文字模糊 | AI 对小字处理差 | 提示词强调 the text inside the UI card must be sharp and readable;翻车后 PS 覆盖 |
| editorial 风做成了深色底 | 模型对"editorial"惯性理解偏杂志暗调 | 提示词开头就写 off-white paper background, bright, high-key lighting,并加负面词 NOT dark background |
| editorial 蓝不够正(偏天蓝/偏紫) | "blue"太泛 | 锚定 Klein blue / royal blue #1F4FE0, saturated and deep, NOT sky blue, NOT navy |
| campaign 风荧光绿偏黄或偏暗 | "lime green"不稳定 | 锚定 acid lime #C8F12F, fluorescent chartreuse, NOT yellow, NOT olive |
| campaign 棋盘格铺满边缘成边框 | 模型把 "checkerboard strips" 理解成整条装饰带 | 提示词限定 only 1-2 SMALL checkerboard patches, large chunky squares, partially cropped;加 STRICTLY NO full-length checkerboard borders / strips along canvas edges |
| campaign 标题渲染出提示词原文(如 in BLACK) | 模型把排版指令当成画面文字 | 标题段用陈述式描述("the text 'xxx', where the characters…"),并加 do not render any English words or layout instructions |
| campaign 巨字没压住画面顶部 | 模型把大字缩成了普通标题 | 强调 the display word spans the FULL WIDTH, cropped at the edges, massively oversized |
| campaign 缺颗粒感,太干净 | 默认渲染偏光滑 | 强调 photocopy grain, film grain, halftone noise texture on photo and background |
| kinetic 斜体角度不一致(字和红条各倒各的) | 模型分别渲染各元素 | 强调 ALL type and red bars share the SAME italic slant angle, one consistent direction of speed |
| kinetic 红色偏橙/偏暗 | "red"太泛 | 锚定 vivid signal red #EE2B24, NOT orange, NOT dark red, NOT pink |
| kinetic 长出了 UI 卡片/小标签/终端窗 | 其他风格的装饰习惯串场 | 提示词明确 no capsule labels, no terminal windows, no extra decoration — type and person only |
| grunge 英文眉题比中文标题还大 | 模型沿用了 campaign 的巨字习惯 | 眉题写明 height about 22% of the canvas, only spans the left part, not full width;删掉 massive / full width 这类词 |
| grunge 强调色到处都是,或色相跑偏(橙变红、青变蓝) | 颜色用途和色相没写死 | 写明 exactly these four places, the accent color appears nowhere else;从 preset 表复制完整的 NOT 锚点 |
| grunge 文字贴边、被裁 | 21:9 以外的比例出图后再裁 | 一律用 `--aspect-ratio 21:9` 原生出图,不要出 16:9 再裁 |
| felt 物件渲染成光滑塑料或真实物件 | "miniature"太泛,模型默认光滑 3D | 锚定 needle-felted wool / matte polymer clay,写明绒毛纤维感、哑光手捏痕、边缘圆润略不完美 |
| felt 标题渲染成黑体 | 模型惯性用无衬线 | 写明 extra-bold Song / serif (Source Han Serif Heavy),中文"特粗宋体/衬线体"双锚点 |
| felt 画面长出真人 | 其他风格的人物习惯串场,或传了真人参考图 | 人物段默认选"无人物"固定段;宿主对 felt 不传 referenceImage;用玩偶时写明材质是羊毛毡不是真人 |
| felt 文字被毛毡化、立体化 | 模型把全场材质统一到文字上 | 写明文字是平面印刷质感,清晰锐利,不做立体、不做毛毡化、不加投影 |
| 生成任务直接失败,报 Response missing candidates field | 上游模型拦截,常因提示词里有过于强硬的指令措辞(如 if the characters stand straight up, the image is WRONG / Absolutely NO xxx) | 把强硬否定改成平铺直述的正向描述后重试;偶发的上游抽风重试一次即可 |
