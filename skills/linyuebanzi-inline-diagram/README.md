# 林月半子技术长文插图生成器

把一篇 3000~8000 字的技术长文,自动加上 4-5 张 16:9 概念图、流程图、对比图、架构图。支持**七种风格**:

- **notebook** · 手绘笔记本风: 黑墨水主笔 + 绿正向 + 红强调,网格纸背景
- **infographic** · 专业信息图风: 米白底 + 深褐红标题 + 蓝/橙双色
- **cozy-handdrawn** · 温暖手绘卡片风: 米白纸感底 + 黑色手绘线条 + 粉彩圆角卡片 + 轻漫画式信息图布局 + LQ 个人动画形象辅助叙事
- **tech-doodle** · 技术简笔画风: 暖白奶油底 + 墨线笔触 + 极淡粉彩 + 极简火柴人 + 荧光笔金句
- **cartoon-infographic** · 卡通信息图风: 干净白底 + 手绘圆角容器 + 功能性柔和多色 + 可选 LQ 卡通形象
- **whiteboard-sketch** · 白板手绘风: 暖奶油底 + 马克笔线条 + 柔和粉彩容器 + 教育图示布局
- **saas-flat** · SaaS 产品扁平风: 纯白底 + 极淡粉彩圆角卡片 + 黑色圆形步骤编号 + 蓝色机器人图标 + 语义化彩色箭头(成功绿 / 回环粉 / 数据流紫蓝)+ 超大彩色数字指标

如果用户没有明确指定风格，必须先询问是 `notebook`、`infographic`、`cozy-handdrawn`、`tech-doodle`、`cartoon-infographic`、`whiteboard-sketch` 还是 `saas-flat`，不要直接按默认风格生成。

## 这个 skill 干嘛用的

文章写完了觉得太单调?告诉 Claude:

> "给这篇文章加几张手绘图,关键位置就行"

Claude 会:

1. **通读文章**,从四类位置里挑出 4-5 个最值得配图的地方:
   - 🧠 抽象概念可视化(读者难凭空想象的概念)
   - 🔄 流程/循环/时序
   - ⚖️ 对比/分类
   - 🏗️ 架构/组件关系

2. **给你看一眼提案**(插图位置 + 标题 + 要表达什么),等你确认
3. **按所选风格模板**生成每张图的提示词
4. **批量调 MuleRun API**,串行生成所有图
5. **给你一份 `diagrams_manifest.md`** 清单,告诉你每张图该插文章哪个段落

## 目录结构

```
linyuebanzi-inline-diagram/
├── SKILL.md                          # Claude 入口,定义触发和流程
├── README.md                         # 你看的
└── references/
    ├── styles/
    │   ├── notebook.md              # 手绘笔记本风风格定义
    │   ├── infographic.md           # 专业信息图风风格定义
    │   ├── cozy-handdrawn.md        # 温暖手绘卡片风风格定义
    │   └── saas-flat.md             # SaaS 产品扁平风风格定义
    ├── analysis-contract.md          # 应用内建议分析的 JSON 输出契约
    ├── prompt_template.md            # 四种类型图的提示词骨架
    └── examples.md                   # 完整案例
```

## 使用方式

### 方式 1:让 Claude 全自动跑(推荐)

```
把这篇文章加几张插图,关键位置就行:

[粘贴文章全文]
```

Claude 走完识别→确认→生图全流程,最后把图打包给你。

### 方式 2:给 Markdown 文件路径(本地已有稿件)

文章已经存在本地,懒得复制粘贴:

> "把这篇文章加几张插图,用 linyuebanzi-inline-diagram 这个 skill 
> ~/Downloads/hermes-llm-wiki.md"

Claude 会自动读取文件内容,识别关键位置,走完整流程生成插图。

适用场景:文章已经写好存在本地,不想折腾复制粘贴。

### 方式 3:自己准备 JSON 清单,跑脚本

如果你已经想清楚要画哪几张、每张画什么,直接写一个 `diagrams.json`:

```json
[
  {
    "id": "01-profile-isolation",
    "title": "Agent Profile & 真隔离",
    "insert_after": "底层实现其实挺朴素这一段",
    "prompt": "Diagram showing the concept of true isolation..."
  },
  {
    "id": "02-role-division",
    "title": "三人小组角色分工",
    "insert_after": "Step 1 列出三个 Agent 名字的段落",
    "prompt": "Diagram showing the role architecture of a three-Agent team..."
  }
]
```

然后:

```bash
export MULERUN_API_KEY=sk-xxx
python3 linyuebanzi-image-gen/scripts/generate.py --manifest diagrams.json
```

产物默认在 `./diagrams/{时间戳}/` 目录下。

**方式 3b: 单独重跑某张图（调试用）**

如果某张图生成效果不满意，改了 `.txt` 里的提示词想重跑，不需要重建整个 JSON，直接传 txt 文件路径：

```bash
export MULERUN_API_KEY=sk-xxx
python3 linyuebanzi-image-gen/scripts/generate.py \
  --mode generation \
  --prompt-file diagram-04-knowledge-compound-loop.txt \
  --name-tag diagram-04-knowledge-compound-loop
```

适用场景：
- 提示词微调后重跑某张图
- 不满意某张图效果，想单独重做而不触发整批
- 想保留同一张图的内容结构，但切到另一种风格重跑

## 风格对比

| 风格 | 适用场景 | 视觉特点 |
|---|---|---|
| **notebook** | 技术教程、工程师向、个人博客 | 黑墨水主笔 + 绿正向 + 红强调,网格纸背景,手绘感 |
| **infographic** | 商业演示、对比分析、品牌内容 | 米白底 + 深褐红标题,蓝/橙双色,扁平专业感 |
| **cozy-handdrawn** | 中文技术长文、概念解释、流程拆解、公众号教程配图 | 米白纸感底 + 黑色手绘线条 + 粉彩圆角卡片 + 轻漫画式信息图 + LQ 动画形象辅助叙事 |
| **saas-flat** | AI 工程化实践、研发运维流程、MCP/Agent 调用链、效率复盘 | 纯白底 + 淡彩圆角卡片 + 黑圆编号 + 蓝色机器人图标 + 语义化彩色箭头 + 大号彩色数字 |

## 产物结构

```
diagrams/20260421-143000/
├── diagram-01-profile-isolation.png       # 每张图的本体
├── diagram-01-profile-isolation.txt       # 每张图的提示词
├── diagram-02-role-division.png
├── diagram-02-role-division.txt
├── ...
├── diagrams_manifest.md                   # 插入位置清单(最有用!)
└── _run_metadata.json                     # 调试元数据
```

`diagrams_manifest.md` 长这样:

```markdown
## 插图 1: diagram-01-profile-isolation.png
**建议插入位置**: 底层实现其实挺朴素这一段后面
**本地路径**: `./diagrams/20260421-143000/diagram-01-profile-isolation.png`
**提示词**: `./diagrams/20260421-143000/diagram-01-profile-isolation.txt`(不满意改这个文件重跑)
```

你按清单手动把图插进 Markdown 文章就行。

## 固定参数

| 参数 | 值 | 说明 |
|---|---|---|
| aspect_ratio | `16:9` | 适合插在文章中段 |
| resolution | `2K` | 够清晰,不至于太大 |
| 风格 | `notebook` / `infographic` / `cozy-handdrawn` / `tech-doodle` / `cartoon-infographic` / `whiteboard-sketch` / `saas-flat` | 由 `--style` 决定 |
| 并发 | 串行(默认) / `--parallel` | 默认更稳,需要提速时可切并行 |

## 环境变量

生图脚本 `linyuebanzi-image-gen` 支持三种生图 API,根据环境变量自动检测:

- `MULERUN_API_KEY` —— MuleRun Nano Banana 2
- `APIMART_API_KEY` —— APImart GPT Image 2
- `ATLASCLOUD_API_KEY` —— Atlas Cloud GPT Image 2

只设一个就会自动用对应的 API,不需要额外传参。多个都设了默认走 MuleRun。

## 常见问题

### 如果图风格飘了怎么办

先检查运行时选的 `--style` 是否正确。风格前缀由 `references/styles/{style}.md` 自动注入，不需要也不应该在模板正文里手写固定的 `Style:` 段。

### 某张图没生成成功

看 `diagrams_manifest.md` 里"生成失败的"那节,能看到失败阶段(create/poll/download)。绝大多数失败是网络抖动,**重跑一次就好**——脚本支持只跑失败的那几张,改 `diagrams.json` 只留失败的那几项再跑。

### 中文字符被渲染错了

Nano Banana 2 对中文字符有时候会翻车(这是模型限制)。两个解决方法:

1. 在提示词里把关键中文也配上英文对照,比如 `"AI 分身 (AI Doppelganger)"`,两个都渲染,至少一个能用
2. 用 Figma/PS 在生成图上覆盖文字(推荐,15 分钟搞定,比反复重跑省 API 额度)

### 某一张图不满意怎么单独重跑

不用整个重跑。每张图生成的时候会同时保存一份提示词文本（`.txt` 文件），改一下不满意的地方，拿着它跑脚本就行：

```bash
python linyuebanzi-image-gen/scripts/generate.py \
  --mode generation \
  --prompt-file output/image-xxx.txt \
  --name-tag image-v2
```

30 秒内出结果。

![](../../previews/rerun-single.png)

### 4-5 张是不是太多了

按你自己的文章密度调。skill 内置的建议:

- 3000 字文章: 2-3 张图
- 5000 字文章: 4-5 张图
- 8000 字文章: 5-6 张图

超过 6 张图反而会让文章碎片化,读起来像 PPT。

## 自定义风格

四种风格都不满意？自己加一个也很简单。`references/styles/` 目录下每种风格就是一个 `.md` 文件，照着现有的格式写一份新的丢进去就行，Skill 会自动识别。应用内的 8 张成品预览作为前端静态资源放在 `client/assets/inline-styles/`；扩展风格没有内置预览时会显示名称和回退卡片。

## 费用参考

- 每张图大概占用 1 次 MuleRun API 调用额度
- 5 张图的文章,总耗时约 5-15 分钟(视 queue 状态)

## 下一步 TODO

- [ ] 支持给图传"参考风格图"作为二次参考(走 edit API)
- [ ] 提示词模板做成可配置,换主题(比如青蓝赛博科幻风)一键切
- [ ] 对失败的任务支持自动重试 1 次
