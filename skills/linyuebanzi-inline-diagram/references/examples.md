# 完整提示词案例

前四个案例按图类型拆分,后两个案例展示 `saas-flat` 风格的不同版式原型。

---

## 🧠 案例 1:抽象概念可视化 · Agent Profile 的真隔离

**来源文章**:Hermes 多 Agent 踩坑实战(已发)
**用在哪段**:正文"先聊聊 profile,这是整个多 Agent 的基础"这一节里

```
Diagram showing the concept of "Agent Profile" and "True Isolation."

Title: "Agent Profile & 真隔离 (True Isolation)"

Left side conceptual diagram: "Agent Profile 的本质 (Essence of Agent Profile)"
A central stylized "brain" or "avatar" icon labeled "AI 分身 (AI Doppelganger)."
Surrounding this icon, several labeled document icons point inward:
1. "config.yaml"
2. ".env"
3. "SOUL.md"
4. "独立的 Memory (Independent Memory)"
5. "独立的 Skills (Independent Skills)"
All icons connected to the central "AI 分身."

Center diagram: "物理隔离的实现 (Implementation of Physical Isolation)"
Two separate vertical process icons.
Left process: Inside a bordered box, an avatar with a "Process" text (indicating active).
Below it, another bordered box labeled "独立的 Gateway 进程 (Independent Gateway Process)."
Right process: Identical structure to the left.
Above both processes, a large upward-pointing arrow labeled "HERMES_HOME 环境变量切换根目录 (HERMES_HOME Environment Variable Switches Root Directory)."
A callout text box pointing to this arrow: "朴素实现, 实打实隔离 (Simple implementation, real-world isolation)."

Right side diagram: "对比与优势 (Comparison & Advantages)"
A stylized vs. comparison section.
Top section: A small diagram with a single gear icon (shared process). Text below: "OpenClaw (配置层面切换)"
Bottom section: A comparison diagram showing two separate gear icons (independent processes). A large directional arrow points to this. Text below: "Hermes (进程级物理隔离)."
A callout box on the right: "为什么是物理隔离? \n1. 一个挂了, 其他照常 (One crashes, others continue) \n2. 互不依赖, 稳定性高 (No interdependence, high stability)"

Bottom summary text: "用进程隔离打造真实的多 Agent 协作基础"

```

---

## 🔄 案例 2:流程/循环 · 知识复利循环

**来源文章**:LLM Wiki 知识管理(参考示例)
**用在哪段**:讲 Wiki 的自我积累机制时

```
Diagram showing a knowledge compound loop.

Title: "知识复利循环 (Knowledge Compound Loop)"

Main circular flow with four nodes connected by arrows forming a loop:
1. "用户提问" (top left) - arrow pointing right to
2. "Wiki 检索回答" (top right) - with annotation "基于已编译的知识,带引用" - arrow pointing down to
3. "高质量答案归档" (bottom right) - with annotation "自动存入 queries/ 目录" - arrow pointing left to
4. "Wiki 知识更厚" (bottom left) - with annotation "下次查询更快更准" - arrow pointing up back to node 1

Center of the loop: a large upward spiral arrow icon representing growth, with text "复利"

Right side callout box: "你的探索、提问、分析、发现 → 不消失在聊天记录里 → 持续积累到 Wiki"

Bottom summary text: "Wiki 不只是编译库,更是你思考过程的沉淀层"

```

---

## ⚖️ 案例 3:对比/分类 · delegate_task vs 多 Agent 协作

**来源文章**:Hermes 多 Agent 踩坑实战
**用在哪段**:"Step 6:以为成功了,结果发现是假的"这一节,讲两种协作模式差异时

```
Diagram showing a comparison between two Multi-Agent collaboration modes.

Title: "delegate_task vs Discord 点名 · 两种多 Agent 协作模式"

Layout: split vertically into two halves with a large "VS" indicator in the middle.

Left side: "delegate_task · 隐式协作"
- Main icon: a single large closed box labeled "Admin Agent"
- Inside the box, several small ghostly figures labeled "subagent (无状态)"
- Arrow from Admin to ghosts with label "spawn"
- Arrow back with label "only final summary"
- Check: "Token 极省"
- Check: "速度快"
- X marker: "Profile 不生效"
- X marker: "无状态,无记忆"
- Small label below: "临时打工仔,用完即焚"

Right side: "Discord 点名 · 显式协作"
- Main icon: three connected avatar boxes labeled "Admin", "Search", "Ink"
- Arrows between them labeled "@mention"
- Check: "Profile 完整生效"
- Check: "人格独立,可追溯"
- X marker: "Token 消耗 3-5x"
- X marker: "速度慢"
- Small label below: "正规军接力,各司其职"

Callout box (bottom right corner): "zero-context-cost 的代价,就是 zero-profile-data"

Bottom summary text: "追求效率用 delegate,追求团队感用点名协作"

```

---

## 🏗️ 案例 4:架构/组件 · 三人 AI 小组的角色分工

**来源文章**:Hermes 多 Agent 踩坑实战
**用在哪段**:"Step 1:建三个 Agent,分工明确"这一节,列出三个 Agent 后

```
Diagram showing the role architecture of a three-Agent team.

Title: "林家班三人小组 · 角色架构 (Three-Agent Team Architecture)"

Layered role-based structure from top to bottom:

Top layer: "用户 (User)"
  - Simple stick figure or user icon
  - Arrow pointing down with label "提交需求"

Middle layer: "林小管 · Admin (调度员 / Planner)"
  - A box with a clipboard/planner icon
  - Small annotation: "拆解任务,公开点名"
  - Two arrows branching down to two executors

Executor layer (side by side, parallel):
  - Left box: "林小探 · Search (情报专家 / Searcher)"
    - Magnifying glass icon
    - Annotation: "联网调研,引用信源"
  - Right box: "林小墨 · Ink (文案专家 / Writer)"
    - Pen icon
    - Annotation: "Markdown 整理,Obsidian 双链"

At the bottom, a thin line connecting both executors back up to Admin with label "任务完成汇报"

Right side callout box: "身份隔离 · 严禁越权 · 一个 Agent 就是一个岗位"

Bottom summary text: "三人小组的最小协作单元:一个调度 + 两个执行"

```

---

## 🔷 案例 5:saas-flat 风格 · AI 研发闭环(原型 A:横向步骤流 + 异常回环)

**对应原文**:讲"需求文档 → AI 分析 → 人审方案 → AI 实现 → AI 测试,不符合就加日志查 SLS 再修复"这一段。

**提示词**(只写内容,风格前缀由 `--style saas-flat` 注入;每张卡片的 header 都按 "black circle badge + bold title, left-aligned at top-left" 理解):

```
Layout prototype: A (horizontal step flow + exception loop). 16:9.

Top row, left to right, 5 step cards + 1 success card, grey-blue chevron arrows between them:
  1 "需求文档" — white document icon; caption "在平台编写并导出"; pale blue card
  2 "AI 分析需求" — the head-only blue robot mascot; caption "Codex / Claude"; pale peach card
  3 "我审核方案" — the flat cartoon man avatar behind a laptop; pale mint card
  4 "AI 实现并提交" — blue robot + code document icon </>; caption "合并到灰度分支"; pale lavender card
  5 "AI 自动测试" — browser window with three green check rows; caption "模拟请求 检查是否符合需求"; pale lavender card
  Success card "完成" — big green check circle; caption "灰度发布"; pale mint card, reached from step 5 by a green arrow labeled "符合"

Bottom: a pale pink container panel holding 3 cards flowing right to left, pink arrows between them:
  6 "AI 添加日志" — code document icon with a red plus badge
  7 "通过 MCP 查询日志" — robot -> purple document tile labeled "sls-log-proxy" -> orange bracket tile labeled "阿里云 SLS"
  8 "AI 分析问题并修复" — robot + wrench icon

Connectors:
  Magenta-pink arrow labeled "不符合" from step 5 down into step 6.
  Magenta-pink rounded line labeled "重新提交" from step 8 back up to step 3.
  Magenta-pink rounded line from the right side looping under the panel into step 8.

No headline, no footer text. All labels exactly as given.
```

---

## 🔷 案例 6:saas-flat 风格 · 一切皆插件(原型 D:左右对比,已验证效果)

**对应原文**:讲 Harness"一切皆插件"、别的 Agent 是精装房而 Harness 是毛坯房加标准水电接口的段落。效果图见 `previews/saas-flat.png`。

**提示词**(只写内容,风格前缀由 `--style saas-flat` 注入):

```
Layout prototype: D (left-right comparison). 16:9.

Headline at top center (large bold, restrained size): "一切皆插件"
Grey subtitle below: "别的 Agent 是精装房，Harness 是毛坯房加标准接口"

Left card (pale grey tint, borderless). Header at top-left: black circle badge "1" + bold title "其他 Agent"; grey caption under the title: "装修好的房子".
  Center icon (small): a simple flat house outline icon with a small grey padlock badge.
  Three short rows, each with a small grey cross icon: "功能固定" / "界面固定" / "最多换换家具"

Center between the cards: a small grey circle badge with "VS".

Right card (pale blue tint, borderless). Header at top-left: black circle badge "2" + bold title "DeepSeek Harness"; grey caption under the title: "毛坯房 + 标准接口".
  Center icon group (small): the head-only blue robot mascot in the middle, surrounded by four small flat puzzle-piece icons, each with a short label: "工具" (blue) / "技能" (violet) / "界面" (orange) / "侧边栏入口" (green). Thin dashed lines connect each puzzle piece to the robot.
  Three short rows, each with a small green check icon: "全部由插件拼成" / "按需长出新功能" / "房间怎么隔你说了算"

Bottom center, one line of medium bold dark text: "把需求说清楚，它就能长进你自己的软件里", with a violet hand-drawn underline swoosh under "长进你自己的软件里".

All labels exactly as given, no other text.
```

---

## 使用这些案例的方法

给新文章生成插图时:

1. **先判断这个位置属于四类中的哪一类**
2. **找对应案例作为模板骨架**
3. **把案例里的 `{{占位符}}` 或具体内容换成新文章的内容**
4. **不要额外手写 `Style: ...` 段落**，脚本会按 `--style` 自动注入风格前缀
5. **提交给 API 之前,过一遍 `prompt_template.md` 里的三条自检**
