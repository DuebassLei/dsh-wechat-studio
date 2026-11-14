// 成稿流水线：写正文 → 出标题；对话改稿；按朱雀报告改标红段。
// 任务在 Host 里跑，关掉页面不会中断；同一篇文章同时只跑一个任务。
import { callModel, cleanMarkdown, extractJson, loadSkill } from './ai.js'
import { applyOps, fixGroups, fixPlan, numbered, setBody, snapshot, toMarkdown, touch } from './article.js'
import { BANNER_STYLES, bannerGuide, bannerRules, DEFAULT_BANNER, normalizeSpec } from './banner.js'
import { checkBanner, detectionText } from './layout.js'
import { applyReport, markBlocks } from './report.js'
import { detect, mapSegments } from './zhuque.js'

const DRAFT_RULES = `# 本次输出要求
- 只输出文章本身的 Markdown，不要任何解释、前言或结语说明。
- 第一行是 \`# 标题\`，小节用 \`## 小标题\`。
- 只用素材里出现过的事实、数字和经历。缺真实细节的地方写 \`[可补：需要什么]\` 占位，不要编造。
- 需要截图的地方写 \`[截图：内容]\` 占位。`

const TITLE_RULES = `# 本次输出要求
为文章写 5 个候选标题和一条摘要。选出最准确、具体且有吸引力的一条放在第一位，给出一句具体的主推理由（40 字以内）。只输出 JSON：
{"titles":["标题一","标题二","标题三","标题四","标题五"],"summary":"摘要","recommendationReason":"主推第一条的理由"}`

const CHAT_RULES = `# 你现在的工作：按作者的一句话改稿
作者会给你一篇分好段、带段号的文章，和一句修改意见。你只输出 JSON，不要解释：
{"reply":"一句话说明改了什么","ops":[操作, ...]}

可用的操作：
- {"op":"rewrite","block":段号,"text":"改写后的整段 Markdown"}
- {"op":"insert_after","block":段号,"text":"新段落"}（block 填 0 表示插在最前面）
- {"op":"delete","block":段号}
- {"op":"title","text":"新标题"}
- {"op":"titles","list":["候选一","候选二","候选三"]}

规则：
- 只动作者点名的段落。没点名、但意见明显只针对某几段时，只改那几段。其余段落一个字都不要动。
- 段号用文章里【】中的数字，指的是修改前的位置。
- 改写时保留这一段原有的 Markdown 记号（加粗、引用、列表、代码块）。
- 不编造作者没提供的经历、数字和原话。缺细节就写 [可补：需要什么]。
- 作者只是提问、没让你改时，ops 留空数组，在 reply 里回答。`

const FIX_RULES = `# 本次输出要求
朱雀把下面文章里的某一段标成了 AI 味偏重。按上面两份规则只改写这一段：
- 先找结构问题（整齐的并列、对仗金句、段尾总结、套路过渡），再看用词。
- 不硬加口语，不用排比制造说话感，不编造经历。缺真实细节的地方写 [可补：需要什么]。
- 保留这一段原有的 Markdown 记号，长度和原段大致相当。
- 只输出改写后的这一段，不要解释，不要带段号。`

const BATCH_RULES = `# 本次输出要求
朱雀把下面文章里相邻的几段标成了 AI 味偏重，它们通常被判成同一个片段。按上面两份规则把这几段一起改写：
- 先找跨段的结构问题：整齐的并列、对仗金句、每段一句总结、套路过渡。几段之间要详略不齐，不要每段长得一样。
- 再看用词。不硬加口语，不用排比制造说话感，不编造经历。缺真实细节的地方写 [可补：需要什么]。
- 段数不变，每段保留原有的 Markdown 记号，总长度和原来大致相当。没有问题的段可以原样交回。
- 只输出 JSON，不要解释：{"paragraphs":[{"block":段号,"text":"改写后的整段"}]}，段号用下面给出的编号。`

const BATCH_CONCURRENCY = 3

export class Pipeline {
  constructor({ ctx, store, skillsDir, fetchImpl }) {
    this.ctx = ctx
    this.store = store
    this.skillsDir = skillsDir
    this.fetchImpl = fetchImpl
    this.jobs = new Map()
  }

  job(articleId) {
    const job = this.jobs.get(articleId)
    if (!job) return null
    return { kind: job.kind, label: job.label, text: job.text, target: job.target ?? null, targets: job.targets ? [...job.targets] : [], progress: job.progress ?? null, stopping: Boolean(job.stopping) }
  }

  /** 让正在跑的一键处理在当前这几组改完后停下。已经改好的段保留。 */
  stop(articleId) {
    const job = this.jobs.get(articleId)
    if (!job || job.kind !== 'fixall') return false
    job.stopping = true
    return true
  }

  /** 起一个后台任务。同一篇文章已经有任务在跑时拒绝。 */
  start(articleId, kind, label, work, extra = {}) {
    if (this.jobs.has(articleId)) throw Object.assign(new Error('这篇文章还有任务在跑，等它结束再试。'), { status: 409 })
    const job = { kind, label, text: '', ...extra }
    this.jobs.set(articleId, job)
    const done = work(job)
      .catch(err => this.store.update(state => {
        const article = state.articles.find(a => a.id === articleId)
        if (article) article.notice = { error: true, text: `${label}失败：${err.message}`, at: new Date().toISOString() }
      }))
      .finally(() => this.jobs.delete(articleId))
    job.done = done
    return done
  }

  async article(articleId) {
    const state = await this.store.read()
    const article = state.articles.find(a => a.id === articleId)
    if (!article) throw Object.assign(new Error('文章不存在'), { status: 404 })
    return article
  }

  /** 按选题和素材写正文，写完接着出标题。 */
  draft(articleId) {
    return this.start(articleId, 'draft', '写正文', async job => {
      const article = await this.article(articleId)
      const system = `${await loadSkill('writer', this.skillsDir)}\n\n${DRAFT_RULES}`
      const user = `选题：${article.topic || '（作者没有写选题，请从素材里提炼）'}\n\n素材：\n${article.material || '（没有额外素材）'}`
      const text = await callModel(this.ctx, { system, user, task: 'draft', maxTokens: 12000, onText: delta => { job.text += delta } })
      await this.store.update(state => {
        const target = state.articles.find(a => a.id === articleId)
        if (!target) return
        setBody(target, cleanMarkdown(text))
        target.notice = null
        touch(target)
      })
      job.kind = 'titles'
      job.label = '出标题'
      job.text = ''
      await this.writeTitles(articleId)
    })
  }

  titles(articleId) {
    return this.start(articleId, 'titles', '出标题', () => this.writeTitles(articleId))
  }

  async writeTitles(articleId) {
    const article = await this.article(articleId)
    const system = `${await loadSkill('headline', this.skillsDir)}\n\n${TITLE_RULES}`
    const raw = await callModel(this.ctx, { system, user: toMarkdown(article), task: 'titles', maxTokens: 3000 })
    const parsed = extractJson(raw)
    const list = (Array.isArray(parsed?.titles) ? parsed.titles : []).map(row => (typeof row === 'string' ? row : row?.text)).filter(value => typeof value === 'string' && value.trim()).map(value => value.trim().slice(0, 80)).slice(0, 8)
    if (!list.length) throw new Error('模型没有给出可用的标题')
    await this.store.update(state => {
      const target = state.articles.find(a => a.id === articleId)
      if (!target) return
      snapshot(target, '出标题')
      const reason = typeof parsed.recommendationReason === 'string' ? parsed.recommendationReason.trim().slice(0, 80) : ''
      target.titles = [...new Set(list)].map((text, index) => ({
        text,
        ...(index === 0 && reason ? { recommended: true, reason } : {}),
      }))
      if (typeof parsed.summary === 'string') target.summary = parsed.summary.trim().slice(0, 300)
      if (!target.title) target.title = list[0]
      touch(target)
    })
  }

  /** 对话改稿：模型只给结构化的修改，落稿走 applyOps。 */
  chat(articleId, message) {
    return this.start(articleId, 'chat', '改稿', async () => {
      const article = await this.article(articleId)
      const history = article.chat.slice(-6).map(turn => `${turn.role === 'user' ? '作者' : '你'}：${turn.text}`).join('\n')
      const system = `${await loadSkill('writer', this.skillsDir)}\n\n${CHAT_RULES}`
      const user = `# 当前标题\n${article.title || '（还没有）'}\n\n# 标题候选\n${article.titles.map(t => `- ${t.text}`).join('\n') || '（还没有）'}\n\n# 正文\n${numbered(article)}\n\n# 之前的对话\n${history || '（无）'}\n\n# 作者这次说\n${message}`
      const raw = await callModel(this.ctx, { system, user, task: 'chat', maxTokens: 12000 })
      const parsed = extractJson(raw)
      await this.store.update(state => {
        const target = state.articles.find(a => a.id === articleId)
        if (!target) return
        const reply = typeof parsed?.reply === 'string' ? parsed.reply.trim().slice(0, 600) : ''
        if (!parsed) {
          target.chat.push({ role: 'assistant', text: '这次没能读懂模型的回复，稿子没有改动。换个说法再试一次。', error: true })
          return
        }
        snapshot(target, message.slice(0, 30))
        const { receipts } = applyOps(target, parsed.ops)
        if (!receipts.length) target.history.pop()
        target.chat.push({ role: 'assistant', text: reply || (receipts.length ? '改好了。' : '这次没有改动。'), receipts, undoable: receipts.length > 0 })
        if (target.chat.length > 60) target.chat.splice(0, target.chat.length - 60)
      })
    })
  }

  /** 改写一个被朱雀标红的段落。上一版留在 block.prev，分数变差时可以退回。 */
  fix(articleId, blockId) {
    return this.start(articleId, 'fix', '改标红段', async () => {
      const article = await this.article(articleId)
      const index = article.blocks.findIndex(b => b.id === blockId)
      if (index === -1) throw new Error('这一段已经不在了')
      const block = article.blocks[index]
      const system = `${await loadSkill('humanizer', this.skillsDir)}\n\n---\n\n${await loadSkill('zhuque', this.skillsDir)}\n\n${FIX_RULES}`
      const score = typeof block.check?.score === 'number' ? `朱雀给它的 AIGC 值是 ${block.check.score}。` : ''
      const user = `# 全文（供你了解上下文，不要改别的段）\n${numbered(article)}\n\n# 要改写的是第 ${index + 1} 段\n${score}\n${block.text}`
      const text = cleanMarkdown(await callModel(this.ctx, { system, user, task: 'fix', maxTokens: 4000 })).replace(/^【\d+】/, '').trim()
      if (!text) throw new Error('模型没有给出改写结果')
      await this.store.update(state => {
        const target = state.articles.find(a => a.id === articleId)
        const current = target?.blocks.find(b => b.id === blockId)
        if (!current) return
        snapshot(target, `改写第 ${index + 1} 段`)
        current.prev = current.text
        current.text = text
        current.check = { status: 'fixed', score: current.check?.score ?? null, level: current.check?.level, source: current.check?.source, round: current.check?.round ?? target.zhuque?.round ?? 0, fixes: (current.check?.fixes ?? 0) + 1 }
        touch(target)
      })
    }, { target: blockId })
  }

  /**
   * 一键处理：按 zhuque skill 的顺序成组改写所有标红段，同时跑三组。
   * 整批开始前存一个快照，撤销一次就全部退回。某一组失败不影响其他组。
   */
  fixAll(articleId) {
    return this.start(articleId, 'fixall', '一键处理', async job => {
      const original = await this.article(articleId)
      const { picked, skipped } = fixPlan(original)
      if (!picked.length) throw new Error('没有需要处理的标红段')
      const groups = fixGroups(original, picked)
      const ids = groups.map(group => group.map(i => original.blocks[i].id))
      job.progress = { done: 0, total: picked.length }
      job.targets = new Set()
      await this.store.update(state => {
        const target = state.articles.find(a => a.id === articleId)
        if (target) snapshot(target, `一键处理 ${picked.length} 段`)
      })
      const system = `${await loadSkill('humanizer', this.skillsDir)}\n\n---\n\n${await loadSkill('zhuque', this.skillsDir)}\n\n${BATCH_RULES}`
      let changed = 0
      let failed = 0
      let next = 0
      const runGroup = async groupIds => {
        groupIds.forEach(id => job.targets.add(id))
        try {
          const article = await this.article(articleId)
          const numbers = groupIds.map(id => article.blocks.findIndex(b => b.id === id) + 1).filter(n => n > 0)
          if (!numbers.length) return
          const parts = numbers.map(n => {
            const check = article.blocks[n - 1].check
            const note = check?.source === 'api' ? `朱雀判为${check.level === 'ai' ? 'AI 特征' : '疑似 AI'}` : `AIGC 值 ${check?.score}`
            return `【${n}】（${note}）\n${article.blocks[n - 1].text}`
          }).join('\n\n')
          const user = `# 全文（供你了解上下文，只改下面点名的段）\n${numbered(article)}\n\n# 要一起改写的段\n${parts}`
          const parsed = extractJson(await callModel(this.ctx, { system, user, task: 'fixall', maxTokens: 6000 }))
          const rows = Array.isArray(parsed?.paragraphs) ? parsed.paragraphs : []
          const byNumber = new Map(rows.filter(r => Number.isInteger(r?.block) && typeof r.text === 'string').map(r => [r.block, cleanMarkdown(r.text).replace(/^【\d+】/, '').trim()]))
          if (!byNumber.size) throw new Error('模型没有给出可用的改写')
          await this.store.update(state => {
            const target = state.articles.find(a => a.id === articleId)
            if (!target) return
            numbers.forEach((n, k) => {
              const block = target.blocks.find(b => b.id === groupIds[k])
              const text = byNumber.get(n)
              // 只认点名的段；原样交回的段算处理过，但不计入改写轮数
              if (!block || !text || text.length > 20000) return
              const rewritten = text !== block.text
              if (rewritten) {
                block.prev = block.text
                block.text = text
                changed += 1
              }
              block.check = { status: 'fixed', score: block.check?.score ?? null, level: block.check?.level, source: block.check?.source, round: block.check?.round ?? target.zhuque?.round ?? 0, fixes: (block.check?.fixes ?? 0) + (rewritten ? 1 : 0) }
            })
            touch(target)
          })
        } catch {
          failed += groupIds.length
        } finally {
          groupIds.forEach(id => job.targets.delete(id))
          job.progress.done += groupIds.length
        }
      }
      const worker = async () => {
        while (next < ids.length && !job.stopping) await runGroup(ids[next++])
      }
      await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, ids.length) }, worker))
      const left = picked.length - job.progress.done
      await this.store.update(state => {
        const target = state.articles.find(a => a.id === articleId)
        if (!target) return
        const todo = target.blocks.map((b, i) => (/\[可补[：:]/.test(b.text) && b.check?.status === 'fixed' ? i + 1 : 0)).filter(Boolean)
        const notes = []
        notes.push(job.stopping ? `已停止：处理了 ${job.progress.done} 段，改写 ${changed} 段，还有 ${left} 段没动。` : `一键处理完：改写了 ${changed} 段。`)
        if (failed) notes.push(`${failed} 段这次没改成，可以再点一次。`)
        const skip = [skipped.twice && `${skipped.twice} 段改过两轮，留给你自己重说`, skipped.worse && `${skipped.worse} 段建议退回上一版`, skipped.noise && `${skipped.noise} 段在噪声带`].filter(Boolean)
        if (skip.length) notes.push(`跳过：${skip.join('，')}。`)
        if (todo.length) notes.push(`第 ${todo.join('、')} 段留了 [可补]，要你补真实细节。`)
        notes.push('再检测一轮看效果。')
        target.notice = { error: !changed && failed > 0, text: notes.join(''), at: new Date().toISOString() }
        if (!changed) target.history.pop()
      })
    })
  }

  /**
   * 按文章写开头横幅的规格，用横幅脚本自带的检查过一遍；有问题让模型照着问题改一次。
   * 规格按风格分别存，切回之前的风格不用重做。
   */
  banner(articleId) {
    return this.start(articleId, 'banner', '做开头横幅', async () => {
      const article = await this.article(articleId)
      const style = article.bannerStyle ?? DEFAULT_BANNER
      if (!BANNER_STYLES[style]) return
      const system = `${bannerGuide(await loadSkill('banner', this.skillsDir), style)}\n\n${bannerRules(style)}`
      const body = toMarkdown(article).slice(0, 30000)
      const ask = async user => normalizeSpec(extractJson(await callModel(this.ctx, { system, user, task: 'banner', maxTokens: 3000 })), style)
      let spec = await ask(body)
      if (!spec) throw new Error('模型没有给出可用的横幅规格')
      let warnings = await checkBanner(spec)
      if (warnings.length) {
        const retry = await ask(`${body}\n\n# 你上一次写的规格\n${JSON.stringify(spec)}\n\n# 横幅脚本检查出的问题，逐条改掉，其余不动\n${warnings.map(w => `- ${w}`).join('\n')}`)
        if (retry) {
          const again = await checkBanner(retry)
          if (again.length < warnings.length) {
            spec = retry
            warnings = again
          }
        }
      }
      await this.store.update(state => {
        const target = state.articles.find(a => a.id === articleId)
        if (!target) return
        target.banners = { ...(target.banners ?? {}), [style]: { spec, warnings, at: new Date().toISOString() } }
        touch(target)
      })
    })
  }

  /** 把一轮检测结果写回文章。检测期间正文被改过的话段落对不上，放弃这次结果。 */
  commitCheck(articleId, stamp, checked, result, extra = '') {
    return this.store.update(state => {
      const target = state.articles.find(a => a.id === articleId)
      if (!target) return
      if (target.updatedAt !== stamp || target.blocks.length !== checked.blocks.length) throw new Error('检测期间稿子被改过，请重新检测一次')
      target.blocks.forEach((block, i) => { block.check = checked.blocks[i].check })
      target.zhuque = checked.zhuque
      const head = `朱雀第 ${checked.zhuque.round} 轮：`
      const body = result.flagged ? `${result.flagged} 段要处理，${result.passed} 段通过。` : `${result.passed} 段全部通过。`
      const loose = result.unmatched ? `另有 ${result.unmatched} 段没对上检测结果，没有下结论。` : ''
      target.notice = { text: head + body + loose + extra, at: checked.zhuque.lastAt }
      touch(target)
    })
  }

  /** 读一份朱雀报告 PDF 的文字，给段落打上标红或通过。 */
  report(articleId, reportText) {
    return this.start(articleId, 'report', '读朱雀报告', async () => {
      const original = await this.article(articleId)
      const stamp = original.updatedAt
      const article = structuredClone(original)
      const result = await applyReport(this.ctx, article, reportText)
      await this.commitCheck(articleId, stamp, article, result)
    })
  }

  /** 直接调朱雀 API 检测全文，按片段原文对回段落。 */
  detect(articleId, { key, endpoint, fixedLines }) {
    return this.start(articleId, 'report', '朱雀检测', async () => {
      const original = await this.article(articleId)
      const stamp = original.updatedAt
      const article = structuredClone(original)
      const text = await detectionText(toMarkdown(article), fixedLines)
      const found = await detect(text, { key, endpoint, fetchImpl: this.fetchImpl })
      const mapped = mapSegments(article, found.segments)
      if (!mapped.covered.size) throw new Error('朱雀返回的片段和文章段落一段都没对上，这次结果没有采用')
      const result = markBlocks(article, { ...mapped, overall: found.overall }, 'api')
      await this.commitCheck(articleId, stamp, article, result, found.tokens !== null ? `本次用了 ${found.tokens} token。` : '')
    })
  }
}
