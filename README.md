# 公众号成稿台（dsh-wechat-studio）

**DeepSeek Harness 的一个插件。把写好的文章放上来，改到能发为止。**

装在 DeepSeek Harness 侧栏里的一个页面，只做公众号长文这一件事：

- **写稿**：给一句选题和素材，按 writer skill 写出正文，接着出标题候选和摘要。也可以把写好的 Markdown 直接贴进来。
- **按段改稿**：左边说一句「第 3 段太啰嗦」，只改第 3 段，其他段落一个字不动，每一步都能撤销。点正文也能直接手改。
- **朱雀质检**：在设置里填一次朱雀 API Key，之后点「一键检测」，标红的段落会在纸边挂上批注，点「改这段」只改这一段，标红段多的时候点「一键处理」，相邻的标红段成组改写（按 zhuque skill 的顺序，跳过改过两轮、该退回和噪声带的段，整批一次撤销），改完再检测一轮。没有 Key 也能用：复制检测文本 → 到朱雀网站检测并下载报告 PDF → 把 PDF 拖回来。
- **排版预览和复制**：10 套风格 × 15 套配色，点「复制全文到公众号」，到公众号编辑器里粘贴。
- **开头横幅**：第一次打开排版预览时按文章自动做一条（大字海报 / 标题卡 / 动画场景 / 不要横幅可切换），规格过一遍横幅脚本的字数检查，超了会让模型改一次。

> 状态：0.1.0，第一版。素材墙、排期、复盘和封面还没做。

## 安装

要求 DeepSeek Harness `0.2.1-rc.5` 及以上的 `0.2.x`，本机有 Python 3（排版脚本用，只用标准库）。

```bash
git clone <这个仓库> && cd dsh-wechat-studio
npm install && npm run build        # 仓库里已带 dist/，改过 client/ 才需要重新 build
dsh plugin --profile desktop add "$PWD"   # 网页版把 desktop 换成 web
```

桌面版要先完全退出（⌘Q）再装，装好重新打开；网页版装好后重启 `dsh web`。侧栏会出现「公众号成稿台」。
卸载：`dsh plugin --profile desktop remove dsh-wechat-studio`。

## 不装 DSH 先看一眼

```bash
npm install && npm run build && npm run dev   # http://127.0.0.1:4173
```

这是一个假宿主加假模型的本地预览，模型回复是写死的，只用来看界面和流程。数据在 `.dev/`，不碰 `~/.dsh`。

## 要花钱吗

插件免费开源，不带任何密钥。

| | 用什么 | 费用 |
| --- | --- | --- |
| 写稿、改稿、出标题、做横幅 | DeepSeek Harness 里你配好的模型 | 按你自己的模型账户计费 |
| 朱雀一键检测 | 你自己的 EdgeOne Makers API Key | 计入 Makers 平台每月的免费额度，超出部分按腾讯云的价格 |
| 朱雀手动上传报告 | 朱雀网站 | 插件不碰你的朱雀账号 |

### 朱雀 API Key 怎么拿

1. 登录腾讯云 EdgeOne 控制台，进入 Makers → Models → API Key。
2. 点「创建 API Key」，复制保存。
3. 回到插件，点右上角的齿轮，粘贴，点「测试连接」，保存。

接口说明见[腾讯云文档：使用朱雀模型](https://cloud.tencent.com/document/product/1552/137539)。密钥存在本机 `~/.dsh/wechat-studio/settings.json`（权限 600），页面拿不到明文，检测时由插件的 Host 直接发给腾讯云的接口。

## 数据存在哪

全在本机 `~/.dsh/wechat-studio/`：`state.json` 是文章，`settings.json` 是设置。没有云端。

设置里的「检测时去掉的固定句」：检测文本里含有这些文字的行会整行去掉（每篇都一样的开头语会和正文混进同一个片段，把分数拉高）。默认是作者自己的两句，点齿轮换成你自己的。

## 换成你自己的写作风格

写作、标题、去 AI 味、横幅由 `skills/` 里的五份 Markdown 驱动（`writer` `headline` `humanizer` `zhuque` `banner`），默认是林月半子的那一套。在 `~/.dsh/wechat-studio/skills/` 放同名文件（比如 `writer.md`）就会覆盖对应的那一份，不用改插件。

## 关于朱雀质检

- 一键检测：朱雀按片段返回原文、标签（人工 / 疑似 AI / AI 生成）和置信度，插件按文字把片段对回段落，一段被多个片段盖住时取最重的结论，对不上的段落不下结论。
- 手动上传报告：报告里的 AIGC 值来自朱雀，把片段对回段落这一步由模型完成，偶尔会对错段，以报告原文为准。
- 两种方式的分数含义不同（置信度和 AIGC 值），界面上分开显示，不要混着比。
- 插件不承诺具体分数。同一段最多改两轮，改完结论反而更重就退回上一版。这些规则来自 `skills/zhuque.md`。

## 开发

```bash
npm test          # Host 逻辑测试（需要 python3；PDF 那条需要 Chrome 和 pdftotext，没有会跳过）
npm run watch     # 监听 client/ 并重新打包
npm run dev       # 本地预览
npm pack          # 打出可安装的 tgz
```

| 目录 | 内容 |
| --- | --- |
| `client/` | 界面：稿面、对话、纸边批注、右栏、排版预览 |
| `src/` | Host 接口、文章模型、流水线、调模型、排版、朱雀 API 和报告、设置 |
| `skills/` | 写作、标题、去 AI 味、朱雀流程、开头横幅五份 skill |
| `vendor/layout/` | 排版脚本，来自 [lqshow/wechat-article-skills](https://github.com/lqshow/wechat-article-skills)（MIT） |
| `scripts/` | 打包、本地预览 |

改了 `src/` 要重启 DeepSeek Harness。

**安全：** 每个接口都经过宿主鉴权；朱雀密钥不回传给页面，自定义接口地址只收 https；模型输出只取白名单里的操作和字段，段号越界的丢弃；调用 `python3` 和 `pdftotext` 不经过 shell。

## 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的开放插件系统。

MIT · 社区插件，与 DeepSeek 无关。

飞书 Markdown 图片：在插件「设置 → Cloudinary 图床」填写 Cloud Name、API Key、API Secret（可从 [Cloudinary 控制台](https://console.cloudinary.com/settings/api-keys) 获取）。把飞书 Markdown 贴进来后，点击「放上稿面」，插件会转存其中的飞书授权下载图片，并把地址替换为 Cloudinary 的 HTTPS 地址。上传后的图片可通过地址直接访问。正文先打开，图片在后台转存。失败的图片保留原链接，可在稿面重试。如果飞书链接已过期，请重新复制 Markdown。

封面提示词由 [项目内的林月半子封面技能](skills/linyuebanzi-cover-banner/SKILL.md) 驱动。修改该目录下的技能说明、对应风格的 `references/prompt_template*.md` 或 `references/blocklist.txt`，下次生成时会重新读取。模板的第一个代码块是发给生图模型的正文，`{{…}}` 由文本模型按规则填写。
