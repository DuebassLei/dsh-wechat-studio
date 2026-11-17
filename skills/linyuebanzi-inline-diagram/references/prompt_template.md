# 林月半子技术长文插图 · 提示词模板

## 风格前缀(由脚本自动注入)

不要在这个骨架里手写固定的 `Style:` 段。脚本会根据 `--style` 自动从 `references/styles/{style}.md` 注入风格前缀:

- `notebook`: 黑墨水主笔 + 绿正向 + 红强调 + 网格纸手绘感
- `infographic`: 米白底 + 深褐红标题 + 蓝橙双色 + 扁平信息图
- `saas-flat`: 纯白底 + 淡彩圆角卡片 + 黑圆编号 + 蓝色机器人图标 + 语义化彩色箭头(内容 prompt 里需指定版式原型 A/B/C/D 及每条箭头的颜色与标签)

这里的骨架只负责**内容结构**，不负责具体视觉风格。

---

## 四种图类型的结构骨架

### 🧠 类型 1:抽象概念可视化(中心辐射式)

**何时用**:文章在讲一个核心概念,这个概念由多个子元素构成。

**骨架**:

```
Diagram showing the concept of "{{概念名称 + 英文}}".

Title: "{{概念中文 ({{English}})}}"

Main central element:
- A stylized {{中心图标,如 brain / gear / avatar / box}} icon in the center of the page
- Labeled "{{中心标签,如 AI 分身 (AI Doppelganger)}}"

Surrounding elements (connected to center with inward-pointing arrows):
1. "{{子元素1,如 config.yaml}}" - small document icon
2. "{{子元素2,如 .env}}" - small document icon  
3. "{{子元素3,如 SOUL.md}}" - small document icon
4. "{{子元素4}}" - {{对应 icon 类型}}
5. "{{子元素5}}" - {{对应 icon 类型}}

{{可选:right side emphasis callout box}}:
"{{关键要点,如 为什么是物理隔离? 1.一个挂了其他照常 2.互不依赖}}"

Bottom summary text: "{{一句话金句,如 用进程隔离打造真实的多 Agent 协作基础}}"

{{脚本会自动在提示词开头注入所选风格前缀;这里不要手写固定 Style 段落}}
```

---

### 🔄 类型 2:流程/循环/时序(循环流程式)

**何时用**:文章描述一个"A → B → C → A"的流程,或者线性的多步骤过程。

**骨架**:

```
Diagram showing a {{"loop" if 循环 else "sequential flow"}}.

Title: "{{流程中文名 ({{English}})}}"

{{如果是循环,用这个}}:
Main circular flow with {{N}} nodes connected by arrows forming a loop:
1. "{{节点1}}" (top left) - with annotation "{{注释1}}" - arrow pointing right to
2. "{{节点2}}" (top right) - with annotation "{{注释2}}" - arrow pointing down to
3. "{{节点3}}" (bottom right) - with annotation "{{注释3}}" - arrow pointing left to
4. "{{节点4}}" (bottom left) - with annotation "{{注释4}}" - arrow pointing up back to node 1

Center of the loop: {{中心图标,如 upward spiral / target / gear}} with text "{{中心关键词}}"

{{如果是线性,用这个}}:
Linear flow from left to right with {{N}} nodes:
Step 1: "{{节点1}}" → Step 2: "{{节点2}}" → Step 3: "{{节点3}}" → Final: "{{最终结果}}"
Each step has a short annotation below in smaller text.

Right side emphasis callout: "{{关键警告或要点}}"

Bottom summary text: "{{一句话总结}}"

{{脚本会自动在提示词开头注入所选风格前缀;这里不要手写固定 Style 段落}}
```

---

### ⚖️ 类型 3:对比/分类(左右对比式)

**何时用**:文章在做 A vs B 对比,或者列举几种方案/类型。

**骨架**:

```
Diagram showing a comparison between {{A}} and {{B}}.

Title: "{{对比主题,如 隐式协作 vs 显式协作}}"

Layout: split vertically into two halves with a "VS" indicator in the middle.

Left side: "{{A 方案名}}"
- Main icon: {{代表 A 的图标,如 single closed box}}
- Characteristic 1: "{{特征1}}"
- Characteristic 2: "{{特征2}}"
- Check marks for advantages, X marks for disadvantages
- Small label: "{{A 的标签,如 快但无状态}}"

Right side: "{{B 方案名}}"
- Main icon: {{代表 B 的图标,如 connected multiple boxes}}
- Characteristic 1: "{{特征1}}"
- Characteristic 2: "{{特征2}}"
- Check marks for advantages, X marks for disadvantages
- Small label: "{{B 的标签,如 慢但有状态}}"

Bottom: small table or highlighted text comparing key metrics.

Emphasis callout box (bottom right or as an aside): "{{核心洞察,如 追求速度用 A,追求灵魂用 B}}"

Bottom summary text: "{{总结句}}"

{{脚本会自动在提示词开头注入所选风格前缀;这里不要手写固定 Style 段落}}
```

---

### 🏗️ 类型 4:架构/组件关系(分层架构式)

**何时用**:文章讲一个系统由哪些层 / 哪些模块 / 哪些角色组成。

**骨架**:

```
Diagram showing the architecture of "{{系统/概念名}}".

Title: "{{系统中文 ({{English}})}}"

Layered or role-based structure:

Top layer: "{{最上层,如 User / 用户}}"
    |
    v (primary flow arrow)
Middle layer 1: "{{中间层 1,如 Admin / 调度员}}"
    - Sub-components: "{{子组件 1}}", "{{子组件 2}}"
    |
    v (primary flow arrow)
Middle layer 2: "{{中间层 2,如 Executors / 执行员}}"
    - Parallel sub-components: "{{平行组件 A}}", "{{平行组件 B}}"
    |
    v (primary flow arrow)
Bottom layer: "{{最底层,如 Tool / 工具}}"

Annotations next to each layer (small text):
- "{{层 1 的职责}}"
- "{{层 2 的职责}}"
- "{{层 3 的职责}}"

Right side emphasis callout: "{{关键设计原则,如 身份隔离,职责单一}}"

Bottom summary text: "{{架构一句话,如 分层不混岗,协作才清爽}}"

{{脚本会自动在提示词开头注入所选风格前缀;这里不要手写固定 Style 段落}}
```

---

## 填模板时的三条自检

每生成一张图之前,过一下这三个问题:

**1. 这张图对应的"文章原文"是哪一段?**
如果说不出对应段落,说明图是你脑补的,**大概率会和文章脱节**。正确姿势:每张图的"核心要表达"必须能在文章里找到至少一段作为支撑。

**2. 这张图的标题能不能用一句话概括?**
好:"Agent Profile & 真隔离"、"知识复利循环"、"delegate_task vs 多 Agent"
烂:"讲一下配置"、"关于多 Agent 的一些事"(太泛,AI 抓不到画面)

**3. 底部那句总结,能不能被读者记住并复述?**
好:"用进程隔离打造真实的多 Agent 协作基础"
烂:"这就是 profile 的工作方式"(没信息量)

---

## 风格基线再强调一次——不要改的部分

1. **不要手写固定 Style 段**:风格由 `references/styles/{style}.md` 注入
2. **文字**:中文为主,关键概念加英文对照(放括号里)
3. **布局**:简洁最小化,留足空白,不要密集信息堆砌
4. **结构语义**:
   - 正向信息用正向标记
   - 警告/重点用强调 callout
   - 流程箭头和层级关系要清楚
5. **禁忌**:no photographs / no 3D / no gradients / no shadows(具体约束以所选 style 文件为准)
