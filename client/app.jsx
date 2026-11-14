import { plainOf, splitMarkdown } from '../src/article.js'
import { countMarkdownImages, feishuImageUrls } from '../src/markdown-images.js'
import magentaPreview from './assets/cover-styles/magenta.webp'
import { COVER_MODELS, COVER_RESOLUTIONS, COVER_FORMATS, MAX_COVER_COUNT } from '../src/cover-options.js'
import classicPreview from './assets/cover-styles/classic.webp'
import editorialPreview from './assets/cover-styles/editorial.webp'
import campaignPreview from './assets/cover-styles/campaign.webp'
import kineticPreview from './assets/cover-styles/kinetic.webp'
import grungePreview from './assets/cover-styles/grunge.webp'
import { COVER_STYLES } from '../src/cover-styles.js'
// 稿面：左边对话改稿，中间是稿子和纸边批注，右边是标题、朱雀质检和导出。
import React from 'react'
import { act, copyDetectionText, copyMarkdown, copyText, loadLayout, loadModels, loadSettings, loadSkills, saveSettings, setState, testZhuque, toast, uploadReport, useStudio } from './state.js'

const ICONS = {
  check: 'M3 8.5l3.2 3.2L13 5',
  send: 'M8 13V3M3.5 7.5L8 3l4.5 4.5',
  plus: 'M8 3v10M3 8h10',
  undo: 'M6 4L2.5 7.5 6 11M3 7.5h6.5a3.5 3.5 0 010 7H8',
  chat: 'M2.5 3.5h11v7.5h-6L4.5 13.5v-2.5h-2z',
  down: 'M4 6l4 4 4-4',
  close: 'M4 4l8 8M12 4l-8 8',
  doc: 'M4 2h5.5L12.5 5v9H4zM6.5 8h4M6.5 10.5h4',
  upload: 'M8 11V3M4.5 6.5L8 3l3.5 3.5M3 13h10',
  materials: 'M2.5 2.5h4.5v4.5h-4.5zM9 3.5h4.5v4.5H9zM3.5 9H8v4.5H3.5z',
  schedule: 'M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3',
  insights: 'M2.5 13.5h11M3.5 10.5l3-3.5 2.5 2 4-5',
  skills: 'M8 2l5.5 3v6L8 14l-5.5-3V5zM2.5 5L8 8l5.5-3M8 8v6',
  gear: 'M8 5.6a2.4 2.4 0 100 4.8 2.4 2.4 0 000-4.8zM8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M12.4 3.6l-1.2 1.2M4.8 11.2l-1.2 1.2',
  scan: 'M2.5 5.5v-3h3M10.5 2.5h3v3M13.5 10.5v3h-3M5.5 13.5h-3v-3M5 8h6',
  spark: 'M7 2l1.3 3.7L12 7l-3.7 1.3L7 12l-1.3-3.7L2 7l3.7-1.3zM12.5 10.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z',
}

export function Icon({ name, size = 16 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg>
}

/** 行内 Markdown：加粗、色块强调、行内代码，以及 [可补：…] [截图：…] 这类待办占位。 */
function inline(text) {
  const parts = []
  const pattern = /(\*\*[^*\n]+\*\*|==[^=\n]+==|`[^`\n]+`|\[(?:可补|截图|可选)[：:][^\]\n]*\])/g
  let last = 0
  let match
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const token = match[0]
    const key = parts.length
    if (token.startsWith('**')) parts.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('==')) parts.push(<mark key={key}>{token.slice(2, -2)}</mark>)
    else if (token.startsWith('`')) parts.push(<code key={key}>{token.slice(1, -1)}</code>)
    else parts.push(<span key={key} className="ws-todo">{token}</span>)
    last = match.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function BlockBody({ block }) {
  const { kind, text } = block
  if (kind === 'heading') {
    const level = /^#+/.exec(text)[0].length
    return <div className={`ws-h ws-h${Math.min(level, 3)}`}>{inline(text.replace(/^#+\s+/, ''))}</div>
  }
  if (kind === 'code' || kind === 'table') return <pre className="ws-pre">{text}</pre>
  if (kind === 'quote') {
    const tag = /^\s*>\s?\[!([A-Z]+)\]/.exec(text)?.[1]
    const names = { QUOTE: '金句', TIP: '小技巧', NOTE: '说明', WARN: '注意', TLDR: '省流版' }
    return (
      <blockquote className="ws-quote">
        {tag ? <span className="ws-tag">{names[tag] ?? tag}</span> : null}
        {text.split('\n').map((line, i) => <div key={i}>{inline(line.replace(/^\s*>\s?(\[![A-Z]+\]\s*)?/, ''))}</div>)}
      </blockquote>
    )
  }
  if (kind === 'list') return <div className="ws-list">{text.split('\n').map((line, i) => <div key={i}>{inline(line)}</div>)}</div>
  if (kind === 'media') return <div className="ws-media">{text}</div>
  if (kind === 'rule') return <hr className="ws-rule" />
  return <p className="ws-p">{text.split('\n').map((line, i) => <React.Fragment key={i}>{i ? <br /> : null}{inline(line)}</React.Fragment>)}</p>
}

function Editor({ block, onDone }) {
  const [value, setValue] = React.useState(block.text)
  const ref = React.useRef(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  React.useEffect(() => { ref.current.focus() }, [])
  const save = async () => {
    if (value.trim() !== block.text) await act('block/update', { blockId: block.id, text: value })
    onDone()
  }
  return (
    <textarea
      ref={ref} className="ws-edit" value={value} aria-label="编辑这一段"
      onChange={e => setValue(e.target.value)} onBlur={save}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); onDone() }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.currentTarget.blur() }
      }}
    />
  )
}

function Annotation({ block, job }) {
  const check = block.check
  if ((job?.kind === 'fix' && job.target === block.id) || (job?.kind === 'fixall' && job.targets.includes(block.id))) return <div className="ws-note is-busy"><span className="ws-shimmer">正在改写这一段…</span></div>
  if (!check) return null
  if (check.status === 'pass') return <div className="ws-mark is-pass"><Icon name="check" size={14} />已通过</div>
  if (check.status === 'kept') return <div className="ws-mark">保留原样</div>
  if (check.status === 'fixed') {
    return (
      <div className="ws-note">
        <p className="ws-note-title">已改写，等下一轮检测</p>
        {block.hasPrev ? <div className="ws-note-actions"><button type="button" className="ws-btn" onClick={() => act('block/revert', { blockId: block.id })}>退回上一版</button></div> : null}
      </div>
    )
  }
  if (check.status !== 'flag') return null
  const label = check.level === 'ai' ? 'AI 特征' : '疑似 AI'
  return (
    <div className="ws-note is-flag">
      <p className="ws-note-title">朱雀：{label}<span className="ws-score">{check.source === 'api' ? `置信度 ${Math.round(check.score * 100)}%` : `AIGC ${check.score}`}</span></p>
      {check.worse ? <p className="ws-note-text">改完分数反而升了，建议退回上一版的写法。</p>
        : check.fixes >= 2 ? <p className="ws-note-text">这一段已经改过两轮。建议你用自己平时说话的方式重说一遍，点正文就能直接改。</p>
        : check.source !== 'api' && check.score < 0.6 ? <p className="ws-note-text">0.5–0.6 是噪声带，每次重测都会浮动，可以不改。</p> : null}
      <div className="ws-note-actions">
        {check.worse && block.hasPrev ? <button type="button" className="ws-btn is-primary" onClick={() => act('block/revert', { blockId: block.id })}>退回上一版</button>
          : <button type="button" className="ws-btn is-primary" disabled={Boolean(job)} onClick={() => act('block/fix', { blockId: block.id })}>改这段</button>}
        <button type="button" className="ws-btn" onClick={() => act('block/keep', { blockId: block.id })}>保留</button>
      </div>
    </div>
  )
}

function Paper({ article, reviewTarget }) {
  const editing = useStudio(s => s.editing)
  const job = article.job
  if (job?.kind === 'draft') {
    return (
      <div className="ws-sheet-wrap">
        <div className="ws-row"><div className="ws-sheet is-first is-last"><p className="ws-live">{job.text || <span className="ws-shimmer">正在写正文…</span>}</p></div><div className="ws-margin" /></div>
      </div>
    )
  }
  if (!article.blocks.length) {
    return <div className="ws-sheet-wrap"><div className="ws-row"><div className="ws-sheet is-first is-last"><p className="ws-muted">这篇文章还没有正文。在左边说一句想写什么，或者新建一篇把写好的文章贴进来。</p></div><div className="ws-margin" /></div></div>
  }
  return (
    <div className="ws-sheet-wrap">
      <div className="ws-row">
        <div className="ws-sheet is-first"><h1 className="ws-title">{article.title || '还没有标题'}</h1></div>
        <div className="ws-margin" />
      </div>
      {article.blocks.map((block, index) => {
        const flagged = block.check?.status === 'flag'
        const last = index === article.blocks.length - 1
        return (
          <div className={`ws-row ${reviewTarget === block.id ? 'is-review-target' : ''}`} id={`ws-review-${article.id}-${block.id}`} key={block.id}>
            <div className={`ws-sheet ${flagged ? 'is-flag' : ''} ${last ? 'is-last' : ''}`}>
              <span className="ws-no" aria-hidden="true">{index + 1}</span>
              {editing === block.id ? <Editor block={block} onDone={() => setState({ editing: null })} />
                : <button type="button" className="ws-block" disabled={Boolean(job)} title="点一下直接改这一段" onClick={() => setState({ editing: block.id })}><BlockBody block={block} /></button>}
            </div>
            <div className="ws-margin"><Annotation block={block} job={job} /></div>
          </div>
        )
      })}
    </div>
  )
}

function BannerBar({ article }) {
  const banner = article.banner
  const job = article.job
  const making = job?.kind === 'banner'
  const failed = !making && !banner.ready && article.notice?.error && article.notice.text.startsWith('做开头横幅')
  return (
    <div className="ws-bannerbar">
      <span className="ws-pane-title">开头横幅</span>
      <div className="ws-tabs" role="radiogroup" aria-label="开头横幅风格">
        {banner.choices.map(choice => (
          <button type="button" role="radio" key={choice.id} aria-checked={banner.style === choice.id} className={banner.style === choice.id ? 'is-on' : ''} disabled={Boolean(job)}
            onClick={() => { if (choice.id !== banner.style) act('banner/style', { style: choice.id }) }}>{choice.name}</button>
        ))}
      </div>
      <span className="ws-bannerbar-status">
        {making ? <span className="ws-shimmer">正在按文章做横幅…</span>
          : failed ? <span className="ws-warn">横幅没做出来</span>
          : banner.style !== 'none' && banner.ready ? (banner.warnings.length ? <span className="ws-warn" title={banner.warnings.join('\n')}>有 {banner.warnings.length} 处超字数，可能挤在一起</span> : <span className="ws-ok"><Icon name="check" size={13} />已生成</span>) : null}
      </span>
      <span className="ws-grow" />
      {banner.style !== 'none' ? <button type="button" className="ws-link" disabled={Boolean(job)} onClick={() => act('banner/generate')}>{banner.ready || failed ? '重新生成' : '生成'}</button> : null}
    </div>
  )
}

function LayoutView({ article }) {
  const pending = useStudio(s => s.pending)
  const layout = useStudio(s => s.layout)
  const tried = useStudio(s => s.bannerTried)
  const frame = React.useRef(null)
  React.useEffect(() => {
    const dismiss = () => frame.current?.contentWindow?.dismissLayoutPopovers?.()
    const onKeyDown = event => { if (event.key === 'Escape') dismiss() }
    document.addEventListener('pointerdown', dismiss, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', dismiss, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
  const enhanced = layout?.html?.includes('window.setStudioOptions=')
  const syncOptions = () => {
    const banner = article.banner
    try {
      frame.current?.contentWindow?.setStudioOptions?.({
        banner, busy: Boolean(article.job) || Boolean(pending),
        status: article.job?.kind === 'banner' ? '正在生成横幅…'
          : banner.style === 'none' ? ''
          : banner.warnings.length ? `有 ${banner.warnings.length} 处字数提醒`
          : banner.ready ? '已生成' : '待生成',
        followCard: article.followCard, followPending: pending === 'layout/follow-card',
      }, (path, body) => act(path, { ...body, id: article.id }))
    } catch {
      // The frame is replaced when a new preview arrives.
    }
  }
  React.useLayoutEffect(() => {
    syncOptions()
    const iframe = frame.current
    iframe?.addEventListener('studio-options-ready', syncOptions)
    return () => iframe?.removeEventListener('studio-options-ready', syncOptions)
  }, [article, layout, pending])
  const banner = article.banner
  const tryKey = `${article.id}:${banner.style}`
  // 第一次打开排版、当前风格还没有横幅时，自动做一次；失败了不再自动重试
  React.useEffect(() => {
    if (banner.ready || article.job || tried[tryKey] || !article.blocks.length) return
    setState(s => ({ bannerTried: { ...s.bannerTried, [tryKey]: true } }))
    act('banner/generate', {}, { quiet: true })
  }, [banner.ready, article.job, tryKey])
  React.useEffect(() => { if (!layout && article.job?.kind !== 'banner') loadLayout() }, [layout, article.id, article.job?.kind])
  let content
  if (article.job?.kind === 'banner' && !layout?.html) content = <div className="ws-center"><span className="ws-shimmer">先按文章做开头横幅，做好就排版…</span></div>
  else if (!layout || layout.loading) content = <div className="ws-center"><span className="ws-shimmer">正在排版…</span></div>
  else if (layout.error) content = <div className="ws-center"><p className="ws-muted">排版失败：{layout.error}</p><button type="button" className="ws-btn" onClick={loadLayout}>重试</button></div>
  else {
    content = (
      <>
        {!layout.html.includes('id="review-panel"') ? (
          <details className="ws-layout-report"><summary>自查报告</summary><pre>{layout.report}</pre></details>
        ) : null}
        <iframe key={layout.key} ref={frame} onLoad={syncOptions} className="ws-frame" title="公众号排版预览" srcDoc={layout.html} allow="clipboard-write" />
      </>
    )
  }
  return (
    <div className="ws-layout">
      {!enhanced ? <>
      <BannerBar article={article} />
      <div className="ws-bannerbar">
        {typeof article.followCard === 'boolean' ? (
          <label className="ws-follow-toggle">
            <span>文末关注卡</span>
            <input type="checkbox" role="switch" checked={article.followCard} disabled={pending === 'layout/follow-card'}
              onChange={e => act('layout/follow-card', { id: article.id, enabled: e.target.checked })} />
            <span className="ws-follow-track" aria-hidden="true" />
          </label>
        ) : (
          <span className="ws-muted">文末关注卡 · 完全退出 DSH（⌘Q）并重新打开后可设置</span>
        )}
      </div>
      </> : null}
      {content}
    </div>
  )
}

function FixAll({ article }) {
  const job = article.job
  if (job?.kind === 'fixall') {
    const { done, total } = job.progress ?? { done: 0, total: 0 }
    return (
      <div className="ws-batch">
        <div className="ws-batch-head">
          <span>{job.stopping ? '正在停下…' : `正在处理 ${done}/${total} 段`}</span>
          <button type="button" className="ws-link" disabled={job.stopping} onClick={() => act('job/stop')}>停止</button>
        </div>
        <div className="ws-meter" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><span style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        <p className="ws-muted ws-small">相邻的标红段一组一起改，同时改三组。改完可以撤销一次全部退回。</p>
      </div>
    )
  }
  const plan = article.fixPlan
  if (!plan?.count) return null
  const skipped = plan.skipped.twice + plan.skipped.worse + plan.skipped.noise
  return (
    <div className="ws-batch">
      <button type="button" className="ws-btn is-wide" disabled={Boolean(job)} onClick={() => act('block/fix-all')}>一键处理 {plan.count} 段</button>
      <p className="ws-muted ws-small">AI 特征先改，疑似 AI 后改{skipped ? `；${skipped} 段不在其中（改过两轮、该退回上一版或在噪声带）` : ''}。</p>
    </div>
  )
}

function ChatPane({ article }) {
  const [text, setText] = React.useState('')
  const listRef = React.useRef(null)
  const busy = Boolean(article.job)
  React.useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [article.chat.length, busy])
  const send = async event => {
    event.preventDefault()
    const message = text.trim()
    if (!message || busy) return
    setText('')
    if (!(await act('chat', { message }))) setText(message)
  }
  const lastUndoable = article.canUndo ? article.chat.findLastIndex(turn => turn.undoable) : -1
  return (
    <section className="ws-chat" aria-label="改稿对话">
      <h2 className="ws-pane-title">改稿</h2>
      <div className="ws-chat-list" ref={listRef}>
        {article.chat.length ? null : <p className="ws-muted">说一句，改一段。比如「第 3 段太啰嗦，砍一半」「开头直接一点」「标题别超过 20 个字」。</p>}
        {article.chat.map((turn, index) => turn.role === 'user' ? <p className="ws-bubble" key={index}>{turn.text}</p> : (
          <div className={`ws-reply ${turn.error ? 'is-error' : ''}`} key={index}>
            <p>{turn.text}</p>
            {turn.receipts?.length ? (
              <div className="ws-receipts">
                <span>{turn.receipts.join('，')}</span>
                {index === lastUndoable && index === article.chat.length - 1 ? <button type="button" className="ws-link" disabled={busy} onClick={() => act('undo')}>撤销</button> : null}
              </div>
            ) : null}
          </div>
        ))}
        {article.job?.kind === 'chat' ? <div className="ws-reply"><span className="ws-shimmer">正在改…</span></div> : null}
      </div>
      <form className="ws-composer" onSubmit={send}>
        <label className="ws-sr" htmlFor="ws-chat-input">改稿指令</label>
        <input id="ws-chat-input" type="text" value={text} placeholder="说一句，改一段" autoComplete="off" onChange={e => setText(e.target.value)} />
        <button type="submit" className="ws-send" aria-label="发送" disabled={busy || !text.trim()}><Icon name="send" size={17} /></button>
      </form>
    </section>
  )
}

const coverStylePreviews = { classic: classicPreview, editorial: editorialPreview, campaign: campaignPreview, kinetic: kineticPreview, grunge: grungePreview, magenta: magentaPreview }

function CoverOptionGroup({ label, name, options, value, onChange, disabled }) {
  return (
    <fieldset className="ws-cover-option" disabled={disabled}>
      <legend>{label}</legend>
      <div className="ws-cover-segments">
        {options.map(option => (
          <label key={option}>
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
            <span>{String(option).toUpperCase()}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function CoverStyleDialog({ article }) {
  const [style, setStyle] = React.useState(article.cover?.style ?? 'classic')
  const [resolution, setResolution] = React.useState(article.cover?.resolution ?? '2K')
  const [count, setCount] = React.useState(article.cover?.count ?? 1)
  const [format, setFormat] = React.useState(article.cover?.format ?? 'png')
  const [busy, setBusy] = React.useState(false)
  const close = () => { if (!busy) setState({ dialog: null }) }
  const submit = async event => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    const ok = await act('cover/generate', { id: article.id, style, resolution, count, format })
    setBusy(false)
    if (ok) setState({ dialog: null })
  }
  return (
    <div className="ws-scrim" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
      <form className="ws-dialog ws-cover-dialog" role="dialog" aria-modal="true" aria-label="选择封面风格" onSubmit={submit}>
        <div className="ws-dialog-head">
          <h2 className="ws-dialog-title">选择封面风格</h2>
          <button type="button" className="ws-icon-btn" disabled={busy} aria-label="关闭" onClick={close}><Icon name="close" /></button>
        </div>
        <div className="ws-cover-dialog-body">
          <fieldset className="ws-cover-gallery" disabled={busy}>
            <legend>风格</legend>
            <div className="ws-cover-style-grid">
              {COVER_STYLES.map(item => (
                <label className={`ws-choice ws-cover-style ${style === item.id ? 'is-on' : ''}`} key={item.id}>
                  <input type="radio" aria-label={item.name} name="cover-style" value={item.id} checked={style === item.id} onChange={() => setStyle(item.id)} />
                  <span className="ws-cover-style-body">
                    <img src={coverStylePreviews[item.id]} alt="" />
                    <strong>{item.name}</strong>
                  </span>
                </label>
              ))}
            </div>
            <p className="ws-cover-style-description">{COVER_STYLES.find(item => item.id === style)?.description}</p>
          </fieldset>
          <div className="ws-cover-options">
            <CoverOptionGroup label="选择分辨率" name="cover-resolution" options={COVER_RESOLUTIONS}
              value={resolution} onChange={setResolution} disabled={busy} />
            <CoverOptionGroup label="生成张数" name="cover-count" options={Array.from({ length: MAX_COVER_COUNT }, (_, i) => i + 1)}
              value={count} onChange={setCount} disabled={busy} />
            <CoverOptionGroup label="图片格式" name="cover-format" options={COVER_FORMATS}
              value={format} onChange={setFormat} disabled={busy} />
          </div>
        </div>
        <div className="ws-dialog-foot">
          <button type="button" className="ws-btn" disabled={busy} onClick={close}>取消</button>
          <button type="submit" className="ws-btn is-primary" disabled={busy}>{busy ? '正在提交…' : '生成封面'}</button>
        </div>
      </form>
    </div>
  )
}

const coverRunStatus = { running: '进行中', succeeded: '完成', partial: '部分完成', failed: '失败', interrupted: '已中断' }

function CoverHistoryDialog({ article }) {
  const pending = useStudio(s => s.pending)
  const runs = article.coverRuns ?? []
  const historyAvailable = Array.isArray(article.coverRuns)
  const [selectedId, setSelectedId] = React.useState(null)
  const run = runs.find(item => item.id === selectedId) ?? runs.at(-1)
  const styleName = item => COVER_STYLES.find(style => style.id === item.style)?.name ?? '封面'
  const dateLabel = value => new Date(value).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const close = () => setState({ dialog: null })
  const imageUrl = id => `wechat-studio/cover/image?${new URLSearchParams({ id: article.id, asset: id })}`
  return (
    <div className="ws-scrim" onMouseDown={event => { if (event.target === event.currentTarget) close() }}
      onKeyDown={event => { if (event.key === 'Escape') close() }}>
      <section className="ws-dialog ws-cover-history" role="dialog" aria-modal="true" aria-label="封面生成记录">
        <div className="ws-dialog-head">
          <h2 className="ws-dialog-title">封面生成记录{historyAvailable ? `（${runs.length} 次）` : ''}</h2>
          <button type="button" className="ws-icon-btn" aria-label="关闭" onClick={close}><Icon name="close" /></button>
        </div>
        {!run ? <p className="ws-history-empty ws-muted">{historyAvailable ? '还没有生成记录。' : '请完全退出 DSH（⌘Q）后重新打开，以加载封面记录。'}</p> : (
          <div className="ws-history-body">
            <nav className="ws-history-list" aria-label="生成批次">
              {[...runs].reverse().map((item, index) => (
                <button type="button" className={`ws-history-run ${run.id === item.id ? 'is-on' : ''}`}
                  key={item.id} aria-pressed={run.id === item.id} onClick={() => setSelectedId(item.id)}>
                  <strong>第 {runs.length - index} 次 · {styleName(item)}</strong>
                  <small>{dateLabel(item.createdAt)} · {item.images.length}/{item.count} 张</small>
                </button>
              ))}
            </nav>
            <div className="ws-history-detail" key={run.id}>
              <div className="ws-history-heading">
                <h3>{styleName(run)}</h3>
                <span className={`ws-history-status is-${run.status}`}>{coverRunStatus[run.status]}</span>
              </div>
              <p className="ws-history-meta">{[new Date(run.createdAt).toLocaleString('zh-CN'), run.model, run.resolution, run.format?.toUpperCase()].filter(Boolean).join(' · ')}</p>
              <div className={`ws-history-images ${run.images.length > 1 ? 'is-grid' : ''}`}>
                {run.images.map((image, index) => (
                  <figure key={image.id}>
                    <img src={imageUrl(image.id)} alt={`封面 ${index + 1}`} loading="lazy" />
                    <figcaption>
                      <span>封面 {index + 1}</span>
                      <div className="ws-history-image-actions">
                        {article.cover?.id === image.id ? <span className="ws-ok"><Icon name="check" size={13} />当前封面</span> : (
                          <button type="button" className="ws-link" disabled={Boolean(article.coverJob) || pending === 'cover/select'}
                            onClick={async () => {
                              setSelectedId(run.id)
                              if (await act('cover/select', { id: article.id, asset: image.id })) toast('已设为当前封面')
                            }}>设为当前封面</button>
                        )}
                        <a className="ws-link" href={imageUrl(image.id) + '&download=1'} download={`cover.${run.format ?? 'png'}`}>下载</a>
                      </div>
                    </figcaption>
                  </figure>
                ))}
              </div>
              {run.prompt ? (
                <section className="ws-history-prompt" aria-label="生成提示词">
                  <div className="ws-history-heading">
                    <h4>提示词</h4>
                    <button type="button" className="ws-btn" onClick={() => copyText(run.prompt, '已复制提示词')}>复制提示词</button>
                  </div>
                  <pre tabIndex={0} aria-label="提示词正文">{run.prompt}</pre>
                </section>
              ) : null}
              {run.errors?.map((error, i) => <p className="ws-warn" key={i}>{error}</p>)}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function CoverPane({ article }) {
  const pending = useStudio(s => s.pending)
  const { cover, coverJob, coverError } = article
  const imageUrl = id => `wechat-studio/cover/image?${new URLSearchParams({ id: article.id, asset: id })}`
  const src = cover && imageUrl(cover.id)
  const stage = { prompt: '正在分析文章…', generating: '正在生成封面…', saving: '正在裁切并保存…' }
  return (
    <section className="ws-sec">
      <div className="ws-sec-head">
        <h2 className="ws-pane-title">封面</h2>
        <div className="ws-cover-actions">
          <button type="button" className="ws-link" onClick={() => setState({ dialog: 'cover-history' })}>
            生成记录{Array.isArray(article.coverRuns) ? `（${article.coverRuns.length} 次）` : ''}
          </button>
          <button type="button" className="ws-link" disabled={Boolean(coverJob) || pending === 'cover/generate' || !article.title || !article.blocks.length}
            onClick={() => setState({ dialog: 'cover' })}>{cover ? '重新生成' : '生成封面'}</button>
        </div>
      </div>
      <div className="ws-cover-preview">
        {cover ? <img src={src} alt={cover.title} /> : <span>封面图 · 2.35:1</span>}
      </div>
      {coverJob ? <p className="ws-shimmer" role="status">{stage[coverJob.stage]}{coverJob.stage !== 'prompt' ? `（${coverJob.index}/${coverJob.count}）` : ''}</p> : null}
      {!coverJob && coverError ? <p className="ws-warn" role="status">{coverError}</p> : null}
      {cover ? <>
        <a className="ws-link" href={src + '&download=1'} download={`cover.${cover.format ?? 'png'}`}>下载封面</a>
        <details className="ws-manual"><summary>查看提示词</summary><p>{cover.prompt}</p></details>
      </> : null}
    </section>
  )
}

function ReviewQueue({ article, target, onJump }) {
  const rows = article.blocks.map((block, index) => ({ block, number: index + 1 }))
    .filter(({ block }) => ['flag', 'fixed'].includes(block.check?.status))
  if (!rows.length) return null
  const current = rows.findIndex(({ block }) => block.id === target)
  return (
    <section className="ws-review-queue" aria-label="待处理段落">
      <div className="ws-sec-head">
        <h3>待处理段落 <span>{rows.length}</span></h3>
        <div className="ws-review-nav">
          <button type="button" className="ws-btn" disabled={current <= 0} onClick={() => onJump(rows[current - 1].block.id)}>上一处</button>
          <button type="button" className="ws-btn" disabled={current >= rows.length - 1} onClick={() => onJump(rows[current + 1].block.id)}>下一处</button>
        </div>
      </div>
      <div className="ws-review-list">
        {rows.map(({ block, number }) => {
          const check = block.check
          const status = check.status === 'fixed' ? '待复测' : check.worse ? '建议退回' : check.level === 'ai' ? 'AI 特征' : '疑似 AI'
          const excerpt = block.text.replace(/\s+/g, ' ').trim()
          return (
            <button type="button" key={block.id} className="ws-review-item" aria-current={target === block.id ? 'true' : undefined}
              onClick={() => onJump(block.id)}>
              <span className="ws-review-item-head"><strong>第 {number} 段</strong><span className={check.status === 'fixed' ? 'ws-muted' : 'ws-warn'}>{status}</span></span>
              <span className="ws-review-excerpt">{excerpt}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function SidePane({ article, flagged, ready, reviewTarget, onReviewJump }) {
  const fileRef = React.useRef(null)
  const [over, setOver] = React.useState(false)
  const busy = Boolean(article.job)
  const zhuque = article.zhuque ?? { round: 0 }
  const overall = zhuque.overall && [['人工', zhuque.overall.human], ['疑似', zhuque.overall.suspect], ['AI', zhuque.overall.ai]].filter(([, value]) => value !== null && value !== undefined)
  const drop = event => {
    event.preventDefault()
    setOver(false)
    if (!busy) uploadReport(event.dataTransfer.files?.[0])
  }
  return (
    <aside className="ws-side" aria-label="标题与质检">
      <section className="ws-sec">
        <div className="ws-sec-head">
          <h2 className="ws-pane-title">标题候选</h2>
          <button type="button" className="ws-link" disabled={busy || !article.blocks.length} onClick={() => act('titles/regen')}>{article.titles.length ? '重新出' : '出标题'}</button>
        </div>
        {article.job?.kind === 'titles' ? <p className="ws-shimmer">正在出标题…</p> : null}
        {article.titles.map(item => (
          <button type="button" key={item.text} className={`ws-choice ws-title-choice ${item.recommended ? 'is-recommended' : ''} ${item.text === article.title ? 'is-on' : ''}`}
            aria-pressed={item.text === article.title} onClick={() => act('title/pick', { text: item.text })}>
            {item.recommended ? <span className="ws-title-recommendation"><Icon name="spark" size={13} />主推</span> : null}
            <span>{item.text}</span>
            {item.recommended && item.reason ? <small>{item.reason}</small> : null}
          </button>
        ))}
        {article.summary ? <p className="ws-summary"><span>摘要</span>{article.summary}</p> : null}
      </section>

      <CoverPane article={article} />

      <section className="ws-sec">
        <h2 className="ws-pane-title">朱雀质检{zhuque.round ? <span className="ws-round">第 {zhuque.round} 轮</span> : null}</h2>
        {ready ? (
          <button type="button" className="ws-btn is-primary is-wide" disabled={busy || !article.blocks.length} onClick={() => act('zhuque/detect')}>
            <Icon name="scan" />{article.job?.kind === 'report' ? '正在检测…' : zhuque.round ? '再检测一轮' : '一键检测'}
          </button>
        ) : (
          <p className="ws-hint">设置朱雀 API Key 后可以一键检测，不用来回复制和下载。<button type="button" className="ws-link" onClick={() => setState({ dialog: 'settings' })}>去设置</button></p>
        )}
        {overall?.length ? <p className="ws-overall">{overall.map(([name, value]) => <span key={name}>{name} {value}%</span>)}</p> : null}
        <FixAll article={article} />
        <ReviewQueue article={article} target={reviewTarget} onJump={onReviewJump} />
        <details className="ws-manual" open={!ready}>
          <summary>手动上传报告</summary>
          <ol className="ws-steps">
            <li><button type="button" className="ws-btn is-wide" disabled={!article.blocks.length} onClick={copyDetectionText}><Icon name="doc" />复制检测文本</button></li>
            <li className="ws-muted">到朱雀贴进去检测，下载报告 PDF</li>
            <li>
              <button type="button" className={`ws-drop ${over ? 'is-over' : ''}`} disabled={busy || !article.blocks.length}
                onClick={() => fileRef.current?.click()} onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={drop}>
                <Icon name="upload" />把报告 PDF 拖到这里，或点击选择
              </button>
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={e => { uploadReport(e.target.files?.[0]); e.target.value = '' }} />
            </li>
          </ol>
        </details>
        <p className="ws-muted ws-small">不保证具体分数，结果以朱雀为准。</p>
      </section>

      <div className="ws-side-foot">
        {flagged ? <p className="ws-warn">还有 {flagged} 段没处理</p> : null}
        <button type="button" className="ws-btn is-primary is-big" disabled={!article.blocks.length} onClick={() => setState({ view: 'layout' })}>去排版</button>
        <button type="button" className="ws-btn is-wide" disabled={!article.blocks.length} onClick={copyMarkdown}>复制 Markdown</button>
      </div>
    </aside>
  )
}

const draftDate = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
})

function Switcher({ data }) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const root = React.useRef(null)
  const trigger = React.useRef(null)
  const panelId = React.useId()
  const current = data.current
  const terms = query.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const results = data.articles.filter(item => {
    const title = item.title.normalize('NFKC').toLowerCase()
    return terms.every(term => title.includes(term))
  })
  const close = () => { setOpen(false); setQuery('') }
  React.useEffect(() => {
    if (!open) return
    const dismiss = event => { if (!root.current?.contains(event.target)) close() }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])
  const pick = item => {
    close()
    trigger.current?.focus()
    if (item.id === current?.id) return
    setState({ view: 'paper', editing: null })
    act('articles/select', { id: item.id })
  }
  return (
    <div className="ws-switch" ref={root} onKeyDown={event => {
      if (open && event.key === 'Escape') {
        event.stopPropagation()
        close()
        trigger.current?.focus()
      }
    }}>
      <button type="button" className="ws-switch-btn" ref={trigger} aria-expanded={open} aria-controls={open ? panelId : undefined}
        onClick={() => open ? close() : setOpen(true)}>
        <span>{current?.title || current?.topic || '未命名文章'}</span><Icon name="down" size={14} />
      </button>
      {open ? (
        <div className="ws-menu ws-draft-picker" id={panelId} role="region" aria-label="查找文章">
          <div className="ws-draft-search">
            <input autoFocus type="search" aria-label="搜索文章标题" placeholder="搜索文章标题…" value={query}
              onChange={event => setQuery(event.target.value)} onKeyDown={event => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || !results.length) return
                event.preventDefault()
                pick(results[0])
              }} />
          </div>
          <div className="ws-draft-list-label" role="status">{terms.length ? `找到 ${results.length} 篇` : '最近编辑'}</div>
          <div className="ws-draft-results">
            {results.map(item => {
              const date = new Date(item.updatedAt)
              const edited = Number.isNaN(date.getTime()) ? '' : draftDate.format(date)
              return (
                <button type="button" key={item.id} className={item.id === current?.id ? 'is-on' : ''} aria-current={item.id === current?.id ? 'true' : undefined} onClick={() => pick(item)}>
                  <div className="ws-draft-result"><span title={item.title}>{item.title}</span><small>{[edited, `${item.chars} 字`].filter(Boolean).join(' · ')}</small></div>
                  {item.id === current?.id ? <Icon name="check" size={14} /> : null}
                </button>
              )
            })}
            {!results.length ? <p className="ws-draft-empty">没有找到匹配的文章。</p> : null}
          </div>
          <button type="button" className="ws-menu-new" onClick={() => { close(); setState({ dialog: 'new' }) }}><Icon name="plus" size={14} />新建文章</button>
        </div>
      ) : null}
    </div>
  )
}

function Steps({ article, flagged, retest }) {
  const round = article.zhuque?.round ?? 0
  const steps = [
    { label: '正文', state: article.blocks.length ? 'done' : article.job?.kind === 'draft' ? 'now' : 'todo' },
    { label: '标题', state: article.title ? 'done' : 'todo' },
    { label: '质检', state: !round ? 'todo' : flagged || retest ? 'now' : 'done', extra: !round ? '未检测' : flagged ? `剩 ${flagged} 段` : retest ? `${retest} 段待复测` : null },
  ]
  return (
    <ol className="ws-stepper">
      {steps.map(step => <li key={step.label} className={`is-${step.state}`}>{step.state === 'done' ? <Icon name="check" size={13} /> : null}{step.label}{step.extra ? <small>{step.extra}</small> : null}</li>)}
    </ol>
  )
}

export function NewDialog() {
  const [tab, setTab] = React.useState('paste')
  const [topic, setTopic] = React.useState('')
  const [material, setMaterial] = React.useState('')
  const [markdown, setMarkdown] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [reading, setReading] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const [fileName, setFileName] = React.useState('')
  const [fileError, setFileError] = React.useState('')
  const fileInput = React.useRef(null)
  const locked = busy || reading
  const readFiles = async files => {
    if (locked || !files.length) return
    if (files.length !== 1 || !/\.(md|markdown)$/i.test(files[0].name)) {
      setFileError('请选择一个 .md 或 .markdown 文件。')
      return
    }
    const file = files[0]
    if (file.size >= 2_000_000) {
      setFileError('文件过大，请拆成较小的 Markdown 文件后再导入。')
      return
    }
    setFileError('')
    setReading(true)
    try {
      const text = await file.text()
      if (!text.trim()) {
        setFileError('这个 Markdown 文件没有内容。')
        return
      }
      setMarkdown(text)
      setFileName(file.name)
    } catch {
      setFileError('读取文件失败，请重新选择。')
    } finally {
      setReading(false)
    }
  }
  const dragOver = event => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = locked ? 'none' : 'copy'
    if (!locked) setDragging(true)
  }
  const drop = event => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    setDragging(false)
    void readFiles(event.dataTransfer.files)
  }
  const preview = React.useMemo(() => {
    if (!markdown.trim()) return null
    const { title, blocks } = splitMarkdown(markdown)
    return {
      title,
      chars: Array.from(blocks.map(plainOf).join('').replace(/\s/g, '')).length,
      images: countMarkdownImages(blocks),
      transfers: feishuImageUrls(blocks.map(text => ({ text }))).length,
    }
  }, [markdown])
  const close = () => { if (!locked) setState({ dialog: null }) }
  const submit = async event => {
    event.preventDefault()
    if (locked) return
    setBusy(true)
    const ok = await act('articles/new', tab === 'paste' ? { markdown } : { topic, material })
    setBusy(false)
    if (ok) setState({ dialog: null, module: 'paper', paperHome: false, view: 'paper', editing: null })
  }
  return (
    <div className="ws-scrim" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <form className={`ws-dialog ${tab === 'paste' ? 'ws-import-dialog' : ''}`} role="dialog" aria-modal="true" aria-label="新建文章" onSubmit={submit}>
        <div className="ws-dialog-head">
          <div className="ws-tabs" role="tablist">
            <button type="button" role="tab" disabled={locked} aria-selected={tab === 'paste'} className={tab === 'paste' ? 'is-on' : ''} onClick={() => setTab('paste')}>贴入已有文章</button>
            <button type="button" role="tab" disabled={locked} aria-selected={tab === 'write'} className={tab === 'write' ? 'is-on' : ''} onClick={() => setTab('write')}>从选题写</button>
          </div>
          <button type="button" className="ws-icon-btn" aria-label="关闭" onClick={close}><Icon name="close" /></button>
        </div>
        {tab === 'paste' ? (
          <div className="ws-import-workbench">
            <div className={`ws-import-source ${dragging ? 'is-dragging' : ''}`} onDragOver={dragOver}
              onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }} onDrop={drop}>
              <div className="ws-import-source-head">
                <label htmlFor="ws-import-markdown">文章 Markdown</label>
                <button type="button" className="ws-btn" disabled={locked} onClick={() => fileInput.current?.click()}>
                  <Icon name="upload" />{reading ? '正在读取…' : fileName ? '更换文件' : '选择文件'}
                </button>
                <input ref={fileInput} type="file" accept=".md,.markdown" hidden onChange={event => {
                  void readFiles(event.target.files)
                  event.target.value = ''
                }} />
              </div>
              <textarea id="ws-import-markdown" required readOnly={locked} rows={preview ? 12 : 8} value={markdown}
                placeholder="粘贴 Markdown，或把 .md 文件拖到这里" onChange={event => setMarkdown(event.target.value)} />
              {fileName ? <p className="ws-import-file-name" title={fileName}>已载入 {fileName}</p> : null}
              {fileError ? <p className="ws-warn" role="alert">{fileError}</p> : null}
            </div>
            <aside className="ws-import-summary" aria-label="导入预检">
              <h3><Icon name="doc" />导入预检</h3>
              {preview ? <>
                <div className="ws-import-title"><span>识别到的标题</span><strong>{preview.title || '未识别到一级标题'}</strong></div>
                <dl className="ws-import-metrics">
                  <div><dt>估算字数</dt><dd>{preview.chars.toLocaleString('zh-CN')}</dd></div>
                  <div><dt>正文图片</dt><dd>{preview.images}</dd></div>
                </dl>
                <p className="ws-import-transfer"><Icon name="upload" />{preview.transfers
                  ? `${preview.transfers} 张飞书图片将在导入后后台转存`
                  : '没有需要转存的飞书图片'}</p>
              </> : <p className="ws-muted">载入 Markdown 后，在这里查看标题、字数和图片。</p>}
            </aside>
          </div>
        ) : (
          <>
            <label className="ws-field"><span>选题</span>
              <input type="text" required value={topic} placeholder="一句话说清这篇要写什么" onChange={e => setTopic(e.target.value)} />
            </label>
            <label className="ws-field"><span>素材（可选）</span>
              <textarea rows={8} value={material} placeholder="聊天记录、笔记、数据、你的原话。正文只会用这里出现过的事实，缺的地方会留 [可补] 占位。" onChange={e => setMaterial(e.target.value)} />
            </label>
          </>
        )}
        <div className="ws-dialog-foot">
          <button type="button" className="ws-btn" onClick={close}>取消</button>
          <button type="submit" className="ws-btn is-primary" disabled={locked || (tab === 'paste' && !preview)}>{busy ? (tab === 'paste' ? '正在导入…' : '正在创建…') : (tab === 'paste' ? '放上稿面' : '开始写')}</button>
        </div>
      </form>
    </div>
  )
}

function ModelButton({ data }) {
  const title = data.modelError ? `上次调用失败：${data.modelError}` : data.modelPinned ? '插件指定的模型，点击切换' : '跟随 DeepSeek Harness 默认模型，点击切换'
  return (
    <button type="button" className={`ws-model ${data.model ? '' : 'is-off'} ${data.modelOk === false ? 'is-warn' : ''}`} title={title} onClick={() => setState({ dialog: 'model' })}>
      <Icon name="spark" size={13} />{data.model || '选择模型'}
    </button>
  )
}

function ModelDialog() {
  const [list, setList] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    loadModels().then(setList).catch(err => setList({ providers: [], default: null, current: null, error: err.message }))
  }, [])
  const close = () => setState({ dialog: null })
  const pick = async (provider, model) => {
    setBusy(true)
    const ok = await saveSettings({ model: { provider, model } })
    setBusy(false)
    if (ok) close()
  }
  const current = list?.current
  const isOn = (provider, model) => current?.provider === provider && current?.model === model
  return (
    <div className="ws-scrim" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <div className="ws-dialog" role="dialog" aria-modal="true" aria-label="模型">
        <div className="ws-dialog-head">
          <h2 className="ws-dialog-title">模型</h2>
          <button type="button" className="ws-icon-btn" aria-label="关闭" onClick={close}><Icon name="close" /></button>
        </div>
        <div className="ws-model-group">
          <div className="ws-chips">
            <button type="button" disabled={busy} className={list && !current ? 'is-on' : ''} aria-pressed={Boolean(list && !current)} onClick={() => pick('', '')}>
              跟随默认{list?.default?.model ? `（${list.default.model}）` : ''}
            </button>
          </div>
          <p className="ws-muted ws-small">不指定时，写稿、改稿、出标题、做横幅都用 DeepSeek Harness 的默认模型，在那边换了这里跟着换。</p>
        </div>
        {!list ? <p className="ws-shimmer">正在读取可用模型…</p> : null}
        {list?.error ? <p className="ws-warn">读取模型列表失败：{list.error}</p> : null}
        {(list?.providers ?? []).map(p => (
          <div className="ws-model-group" key={p.provider}>
            <h3>{p.name}</h3>
            <div className="ws-chips">
              {p.models.map(m => (
                <button type="button" key={m.id} disabled={busy} className={isOn(p.provider, m.id) ? 'is-on' : ''} aria-pressed={isOn(p.provider, m.id)} onClick={() => pick(p.provider, m.id)}>{m.name}</button>
              ))}
            </div>
          </div>
        ))}
        {list && !list.error && !list.providers.length ? <p className="ws-muted">DeepSeek Harness 里还没有接入模型提供方，先到那边的设置里接一个。</p> : null}
      </div>
    </div>
  )
}

function SettingsDialog() {
  const settings = useStudio(s => s.settings)
  const [page, setPage] = React.useState('brand')
  const [cloudinary, setCloudinary] = React.useState({})
  const [brand, setBrand] = React.useState({})
  const [arkModel, setArkModel] = React.useState(null)
  const [arkKey, setArkKey] = React.useState('')
  const [key, setKey] = React.useState('')
  const [endpoint, setEndpoint] = React.useState(null)
  const [fixed, setFixed] = React.useState(null)
  const [test, setTest] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { loadSettings() }, [])
  const close = () => setState({ dialog: null })
  if (!settings) return <div className="ws-scrim"><div className="ws-dialog"><span className="ws-shimmer">正在读取设置…</span></div></div>
  const pages = [
    { id: 'brand', title: '公众号品牌', icon: 'doc', description: '设置开头横幅和文末关注卡的品牌文案。' },
    { id: 'cover', title: '封面生成', icon: 'spark', description: '配置火山方舟的生图模型和凭证。', ready: settings.arkKeySet, link: 'https://ark.volcengine.com/region:cn-beijing/apikey', linkLabel: '火山方舟 API Key' },
    { id: 'storage', title: '图片图床', icon: 'upload', description: '将飞书图片自动转存到 Cloudinary，供排版预览使用。', ready: Boolean(settings.cloudinary?.cloudName && settings.cloudinary?.apiKey && settings.cloudinary?.apiSecretSet), link: 'https://console.cloudinary.com/settings/api-keys', linkLabel: 'Cloudinary API Keys' },
    { id: 'quality', title: '朱雀质检', icon: 'scan', description: '管理检测凭证和需要排除的固定文案。', ready: settings.zhuqueKeySet, link: 'https://console.cloud.tencent.com/edgeone', linkLabel: 'EdgeOne 控制台' },
  ]
  const selected = pages.find(item => item.id === page)
  const endpointValue = endpoint ?? (settings.zhuqueEndpointDefault ? '' : settings.zhuqueEndpoint)
  const fixedValue = fixed ?? settings.fixedLines.join('\n')
  const patch = () => {
    const out = { zhuqueEndpoint: endpointValue, fixedLines: fixedValue.split('\n') }
    out.brand = brand
    out.arkModel = arkModel ?? settings.arkModel
    if (arkKey.trim()) out.arkKey = arkKey.trim()
    if (key.trim()) out.zhuqueKey = key.trim()
    out.cloudinary = { ...cloudinary }
    if (out.cloudinary.apiSecret === '') delete out.cloudinary.apiSecret
    return out
  }
  const runTest = async () => {
    setTest({ running: true })
    setTest(await testZhuque({ zhuqueKey: key.trim(), zhuqueEndpoint: endpointValue }))
  }
  const submit = async event => {
    event.preventDefault()
    setBusy(true)
    const ok = await saveSettings(patch())
    setBusy(false)
    if (ok) close()
  }
  const clearKey = async () => {
    if (await saveSettings({ zhuqueKey: '' })) { setKey(''); setTest(null) }
  }
  return (
    <div className="ws-scrim" onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <form className="ws-dialog ws-settings-dialog" role="dialog" aria-modal="true" aria-label="设置" onSubmit={submit}>
        <div className="ws-dialog-head">
          <h2 className="ws-dialog-title">设置</h2>
          <button type="button" className="ws-icon-btn" aria-label="关闭" onClick={close}><Icon name="close" /></button>
        </div>

        <div className="ws-settings-body">
          <nav className="ws-settings-nav" aria-label="设置分类">
            {pages.map(item => (
              <button key={item.id} type="button" aria-current={page === item.id ? 'page' : undefined}
                onClick={() => setPage(item.id)}><Icon name={item.icon} /><span>{item.title}</span></button>
            ))}
          </nav>
          <div className="ws-settings-content">
            <div className="ws-settings-section-head">
              <h3>{selected.title}</h3>
              {selected.ready !== undefined ? <span className={`ws-settings-status ${selected.ready ? 'ws-ok' : 'ws-muted'}`}>{selected.ready ? '已配置' : '未配置'}</span> : null}
            </div>
            <p className="ws-settings-description ws-muted">{selected.description}</p>
            {selected.link ? <a className="ws-link ws-settings-provider" href={selected.link} target="_blank" rel="noreferrer">{selected.linkLabel} ↗</a> : null}

            <fieldset className="ws-group ws-settings-fields" hidden={page !== 'brand'}>
              <label className="ws-field"><span>账号名称</span>
                <input value={brand.author ?? settings.brand?.author ?? ''} maxLength={32}
                  onChange={e => setBrand({ ...brand, author: e.target.value })} />
              </label>
              <label className="ws-field"><span>Slogan</span>
                <input value={brand.slogan ?? settings.brand?.slogan ?? ''} maxLength={80}
                  onChange={e => setBrand({ ...brand, slogan: e.target.value })} />
              </label>
              <p className="ws-muted ws-small">用于开头横幅和文末关注卡。清空并保存可恢复默认文案。</p>
            </fieldset>
            <fieldset className="ws-group ws-settings-fields" hidden={page !== 'cover'}>
              <label className="ws-field"><span>图片模型</span>
                <select value={arkModel ?? settings.arkModel} onChange={e => setArkModel(e.target.value)}>
                  {COVER_MODELS.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
                </select>
              </label>
              <label className="ws-field"><span>API Key</span>
                <input type="password" autoComplete="off" value={arkKey} onChange={e => setArkKey(e.target.value)}
                  placeholder={settings.arkKeySet ? '已保存，留空表示不改' : '输入火山方舟 API Key'} />
              </label>
            </fieldset>
            <fieldset className="ws-group ws-settings-fields" hidden={page !== 'storage'}>
              {['cloudName', 'apiKey', 'apiSecret'].map((field, index) => (
                <label className="ws-field" key={field}><span>{['Cloud Name', 'API Key', 'API Secret'][index]}</span>
                  <input type={field === 'apiSecret' ? 'password' : 'text'} autoComplete="off" spellCheck={false}
                    value={cloudinary[field] ?? settings.cloudinary?.[field] ?? ''}
                    placeholder={field === 'apiSecret' && settings.cloudinary?.apiSecretSet ? '已保存，留空表示不改' : ''}
                    onChange={e => setCloudinary({ ...cloudinary, [field]: e.target.value })} />
                </label>
              ))}
            </fieldset>

            <fieldset className="ws-group ws-settings-fields" hidden={page !== 'quality'}>
              <label className="ws-field"><span>API Key{settings.zhuqueKeySet ? <em className="ws-ok">已保存，末四位 {settings.zhuqueKeyTail}</em> : null}</span>
                <input type="password" value={key} autoComplete="off" spellCheck={false} placeholder={settings.zhuqueKeySet ? '留空表示不改' : '粘贴 EdgeOne Makers 的 API Key'} onChange={e => { setKey(e.target.value); setTest(null) }} />
              </label>
              <p className="ws-muted ws-small">在腾讯云 EdgeOne 控制台的 Makers → Models → API Key 里创建。密钥只存在这台电脑上，检测时直接发给腾讯云的接口。</p>
              <div className="ws-row-actions">
                <button type="button" className="ws-btn" disabled={test?.running || (!key.trim() && !settings.zhuqueKeySet)} onClick={runTest}>{test?.running ? '正在测试…' : '测试连接'}</button>
                {settings.zhuqueKeySet ? <button type="button" className="ws-link" onClick={clearKey}>清除已保存的 Key</button> : null}
                {test?.ok ? <span className="ws-ok"><Icon name="check" size={13} />能用{test.tokens !== null && test.tokens !== undefined ? `，这次测试用了 ${test.tokens} token` : ''}</span> : null}
              </div>
              {test?.error ? <p className="ws-warn">{test.error}</p> : null}
              <details className="ws-manual">
                <summary>高级</summary>
                <label className="ws-field"><span>接口地址</span>
                  <input type="url" value={endpointValue} spellCheck={false} placeholder="留空用默认的 EdgeOne 网关" onChange={e => { setEndpoint(e.target.value); setTest(null) }} />
                </label>
              </details>
            </fieldset>

            <fieldset className="ws-group ws-settings-fields" hidden={page !== 'quality'}>
              <legend>检测时去掉的固定句</legend>
              <label className="ws-field"><span>每行一句。检测文本里含有这些文字的行会整行去掉</span>
                <textarea rows={3} value={fixedValue} onChange={e => setFixed(e.target.value)} />
              </label>
              <p className="ws-muted ws-small">每篇都一样的开头语、结尾引导会和正文混进同一个片段，把分数拉高。</p>
            </fieldset>

          </div>
        </div>
        <div className="ws-dialog-foot">
          <button type="button" className="ws-btn" onClick={close}>取消</button>
          <button type="submit" className="ws-btn is-primary" disabled={busy}>{busy ? '正在保存…' : '保存设置'}</button>
        </div>
      </form>
    </div>
  )
}

function Empty({ model }) {
  return (
    <div className="ws-empty">
      <h1>把写好的文章放上来，<span>改到能发为止。</span></h1>
      <p>按段改稿、朱雀报告质检、公众号排版和一键复制，都在这一页。</p>
      <div className="ws-empty-actions">
        <button type="button" className="ws-btn is-primary is-big" onClick={() => setState({ dialog: 'new' })}><Icon name="plus" />新建文章</button>
      </div>
      {model ? null : <p className="ws-warn">还没有可用的模型。先在 DeepSeek Harness 里配置好模型，写稿和改稿才能用。</p>}
    </div>
  )
}

const MODULES = [
  { id: 'materials', label: '素材', icon: 'materials', soon: true, title: '素材', lead: '把零散的灵感、链接、聊天记录先放这里，攒够了挑几条一起成稿。', points: ['一句话、一个链接、一段聊天记录，贴进来就是一张卡片', '挑几张卡片一起成稿，稿子会记住用了哪些素材', '素材里出现过的事实和原话，写稿时优先用'] },
  { id: 'paper', label: '稿面', icon: 'doc' },
  { id: 'schedule', label: '排期', icon: 'schedule', soon: true, title: '排期', lead: '把写好的稿子拖到日历上，排好哪天几点发。', points: ['一张日历看清这周要发什么', '右上角永远是下一篇要发的', '发完标记一下，进复盘'] },
  { id: 'insights', label: '复盘', icon: 'insights', soon: true, title: '复盘', lead: '导入公众号后台导出的数据，看哪种写法读的人更多。', points: ['阅读、在看、转发按篇对比', '成稿时记下的标题套路、横幅和皮肤，可以拿来比较', '从数据里提炼出的规则，一键写进写作 skill'] },
  { id: 'skills', label: '技能', icon: 'skills' },
]

const SKILL_INFO = {
  writer: { name: '写作', use: '写正文、对话改稿' },
  headline: { name: '标题', use: '出标题候选和摘要' },
  humanizer: { name: '去 AI 味', use: '改写朱雀标红的段落' },
  zhuque: { name: '朱雀流程', use: '按报告逐段改，什么时候停手' },
  banner: { name: '开头横幅', use: '按文章写横幅规格' },
}

function Rail({ module }) {
  return (
    <nav className="ws-rail" aria-label="模块">
      {MODULES.map(item => (
        <button type="button" key={item.id} className={module === item.id ? 'is-on' : ''} aria-current={module === item.id ? 'page' : undefined} onClick={() => setState({ module: item.id, ...(item.id === 'paper' ? { paperHome: true } : {}) })}>
          <Icon name={item.icon} size={20} />
          <span>{item.label}</span>
          {item.soon ? <small>即将</small> : null}
        </button>
      ))}
      <span className="ws-grow" />
      <button type="button" onClick={() => setState({ dialog: 'settings' })}><Icon name="gear" size={20} /><span>设置</span></button>
    </nav>
  )
}

function SoonView({ item }) {
  return (
    <div className="ws-soon">
      <p className="ws-soon-tag">还在做</p>
      <h1>{item.title}</h1>
      <p className="ws-soon-lead">{item.lead}</p>
      <ul>{item.points.map(point => <li key={point}>{point}</li>)}</ul>
      <button type="button" className="ws-btn" onClick={() => setState({ module: 'paper' })}>回到稿面</button>
    </div>
  )
}

function SkillsView() {
  const skills = useStudio(s => s.skills)
  React.useEffect(() => { loadSkills() }, [])
  if (!skills) return <div className="ws-center"><span className="ws-shimmer">正在读取…</span></div>
  if (skills.error) return <div className="ws-center"><p className="ws-muted">读取失败：{skills.error}</p></div>
  return (
    <div className="ws-page">
      <h1 className="ws-page-title">技能</h1>
      <p className="ws-page-lead">写稿、改稿、出标题、去 AI 味、做横幅，都按下面这几份 skill 来。想换成自己的写法，把同名文件放进覆盖目录，下一次调用就会用你的版本，不用改插件。</p>
      <div className="ws-skill-list">
        {skills.skills.map(item => (
          <div className="ws-skill" key={item.name}>
            <div className="ws-skill-head">
              <strong>{SKILL_INFO[item.name]?.name ?? item.name}</strong>
              <span className={`ws-skill-src ${item.source === 'user' ? 'is-user' : ''}`}>{item.source === 'user' ? '你的版本' : item.source === 'missing' ? '缺失' : '内置'}</span>
            </div>
            <p className="ws-muted">{SKILL_INFO[item.name]?.use}</p>
            <code>{item.name}.md{item.chars ? ` · ${Math.round(item.chars / 1000)}K` : ''}</code>
          </div>
        ))}
      </div>
      <div className="ws-skill-dir">
        <span>覆盖目录</span>
        <code>{skills.dir}</code>
        <button type="button" className="ws-link" onClick={() => navigator.clipboard?.writeText(skills.dir)}>复制路径</button>
      </div>
    </div>
  )
}

function PaperModule({ data }) {
  const view = useStudio(s => s.view)
  const chatOpen = useStudio(s => s.chatOpen)
  const [review, setReview] = React.useState(null)
  const article = data.current
  if (!article) return <Empty model={data.model} />
  const reviewTarget = review?.articleId === article.id ? review.blockId : null
  const jumpToReview = blockId => {
    setReview({ articleId: article.id, blockId })
    const row = document.getElementById(`ws-review-${article.id}-${blockId}`)
    row?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }
  const flagged = article.blocks.filter(b => b.check?.status === 'flag').length
  const retest = article.blocks.filter(b => b.check?.status === 'fixed').length
  return (
    <>
      <header className="ws-top" data-window-drag="">
        <nav className="ws-crumb" aria-label="当前位置"><button type="button" className="ws-link" onClick={() => setState({ paperHome: true })}>稿面</button><span aria-hidden="true">/</span><Switcher data={data} /></nav>
        <Steps article={article} flagged={flagged} retest={retest} />
        <span className="ws-grow" />
        <div className="ws-tabs" role="tablist" aria-label="视图">
          <button type="button" role="tab" aria-selected={view === 'paper'} className={view === 'paper' ? 'is-on' : ''} onClick={() => setState({ view: 'paper' })}>稿面</button>
          <button type="button" role="tab" aria-selected={view === 'layout'} className={view === 'layout' ? 'is-on' : ''} onClick={() => setState({ view: 'layout' })}>排版预览</button>
        </div>
        {article.canUndo ? <button type="button" className="ws-icon-btn" aria-label="撤销上一步" title="撤销上一步" disabled={Boolean(article.job)} onClick={() => act('undo')}><Icon name="undo" /></button> : null}
        <button type="button" className="ws-icon-btn" aria-label={chatOpen ? '收起改稿对话' : '打开改稿对话'} aria-pressed={chatOpen} onClick={() => setState({ chatOpen: !chatOpen })}><Icon name="chat" /></button>
        <ModelButton data={data} />
        <button type="button" className="ws-icon-btn" aria-label="设置" title="设置" onClick={() => setState({ dialog: 'settings' })}><Icon name="gear" /></button>
      </header>
      {article.imageImport?.error ? (
        <div className="ws-banner is-error" role="status">
          <span>飞书图片转存未完成。{article.imageImport.error}</span>
          <button type="button" className="ws-btn" onClick={() => act('images/retry')}>重试转存</button>
        </div>
      ) : article.imageImport?.total ? (
        <div className="ws-transfer-banner">
          <span className="ws-transfer-icon"><Icon name="upload" size={18} /></span>
          <div className="ws-transfer-content">
            <div className="ws-transfer-heading">
              <strong>正在后台转存飞书图片</strong>
              <span>{article.imageImport.done} / {article.imageImport.total} 张</span>
            </div>
            <progress aria-label="飞书图片转存进度" value={article.imageImport.done} max={article.imageImport.total} />
            <p className="ws-muted ws-small">正文已导入，可以继续编辑。</p>
          </div>
        </div>
      ) : null}
      {article.notice ? (
        <div className={`ws-banner ${article.notice.error ? 'is-error' : ''}`} role="status">
          <span>{article.notice.text}</span>
          <button type="button" className="ws-icon-btn" aria-label="关闭提示" onClick={() => act('notice/clear', {}, { quiet: true })}><Icon name="close" size={14} /></button>
        </div>
      ) : null}
      <div className={`ws-body ${chatOpen && view !== 'layout' ? '' : 'no-chat'}`}>
        {chatOpen && view !== 'layout' ? <ChatPane article={article} /> : null}
        <main className="ws-main">{view === 'layout' ? <LayoutView article={article} /> : <Paper article={article} reviewTarget={reviewTarget} />}</main>
        {view === 'paper' ? <SidePane article={article} flagged={flagged} ready={data.zhuqueReady} reviewTarget={reviewTarget} onReviewJump={jumpToReview} /> : null}
      </div>
    </>
  )
}

function DraftArtwork({ draft }) {
  const [failed, setFailed] = React.useState(false)
  return (
    <div className="ws-draft-art">
      {draft.coverId && !failed ? (
        <img src={`wechat-studio/cover/image?${new URLSearchParams({ id: draft.id, asset: draft.coverId })}`}
          alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : <span aria-hidden="true">{draft.title}</span>}
    </div>
  )
}

function DraftHome({ data }) {
  const [query, setQuery] = React.useState('')
  const pending = useStudio(s => s.pending)
  const drafts = data.articles
  const featured = drafts.find(item => item.id === data.current?.id) ?? drafts[0]
  const terms = query.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const matches = drafts.filter(draft => terms.every(term => draft.title.normalize('NFKC').toLowerCase().includes(term)))
  const open = async draft => {
    if (pending) return
    if (draft.id !== data.current?.id && !await act('articles/select', { id: draft.id })) return
    setState({ paperHome: false, view: 'paper', editing: null })
  }
  const edited = draft => {
    const date = new Date(draft.updatedAt)
    return Number.isNaN(date.getTime()) ? '' : draftDate.format(date)
  }
  return (
    <main className="ws-draft-home">
      <header className="ws-draft-home-head">
        <div><h1>稿面</h1><p className="ws-muted">{drafts.length} 篇稿件</p></div>
        <div className="ws-draft-home-tools">
          <input type="search" aria-label="搜索稿件标题" placeholder="搜索稿件标题…" value={query} onChange={e => setQuery(e.target.value)} />
          <button type="button" className="ws-btn is-primary" onClick={() => setState({ dialog: 'new' })}><Icon name="plus" />新建文章</button>
        </div>
      </header>
      {featured && !terms.length ? (
        <section className="ws-draft-feature">
          <div className="ws-draft-feature-copy">
            <span className="ws-muted ws-small">{featured.id === data.current?.id ? '上次打开' : '最近编辑'}</span>
            <h2>{featured.title}</h2>
            <p className="ws-muted ws-small">{[edited(featured), `${featured.chars} 字`].filter(Boolean).join(' · ')}</p>
            <button type="button" className="ws-btn is-primary" disabled={Boolean(pending)} onClick={() => open(featured)}>继续写作 <span aria-hidden="true">→</span></button>
          </div>
          <DraftArtwork key={featured.coverId || featured.id} draft={featured} />
        </section>
      ) : null}
      <section className="ws-draft-shelf" aria-label="全部稿件">
        <div className="ws-sec-head"><h2>{terms.length ? '搜索结果' : '全部稿件'}</h2><span className="ws-muted ws-small">{terms.length ? `${matches.length} 篇` : '按最近编辑排序'}</span></div>
        {matches.length ? (
          <div className="ws-draft-grid">
            {matches.map(draft => (
              <button type="button" className="ws-draft-card" key={draft.id} disabled={Boolean(pending)} onClick={() => open(draft)}>
                <DraftArtwork key={draft.coverId || draft.id} draft={draft} />
                <div className="ws-draft-card-copy">
                  <strong>{draft.title}</strong>
                  <span className="ws-muted ws-small">{[edited(draft), `${draft.chars} 字`].filter(Boolean).join(' · ')}</span>
                  {draft.review || draft.checked ? <span className="ws-draft-review">{draft.review ? `${draft.review} 段待检查` : '已质检'}</span> : null}
                </div>
              </button>
            ))}
          </div>
        ) : <p className="ws-draft-home-empty ws-muted">{terms.length ? '没有找到匹配的稿件。' : '还没有稿件。点「新建文章」粘贴 Markdown 或开始写作。'}</p>}
      </section>
    </main>
  )
}

export function Studio() {
  const data = useStudio(s => s.data)
  const error = useStudio(s => s.error)
  const module = useStudio(s => s.module)
  const paperHome = useStudio(s => s.paperHome)
  const dialog = useStudio(s => s.dialog)
  const note = useStudio(s => s.toast)
  const item = MODULES.find(m => m.id === module) ?? MODULES[1]
  let content
  if (!data) content = <div className="ws-center">{error ? <p className="ws-muted">加载失败：{error}</p> : <span className="ws-shimmer">正在打开稿面…</span>}</div>
  else if (item.id === 'paper') content = paperHome ? <DraftHome data={data} /> : <PaperModule data={data} />
  else if (item.id === 'skills') content = <SkillsView />
  else content = <SoonView item={item} />
  return (
    <>
      <Rail module={item.id} />
      <div className="ws-col">{content}</div>
      {dialog === 'cover-history' && data?.current ? <CoverHistoryDialog key={data.current.id} article={data.current} /> : null}
      {dialog === 'cover' && data?.current ? <CoverStyleDialog key={data.current.id} article={data.current} /> : null}
      {dialog === 'new' ? <NewDialog /> : null}
      {dialog === 'settings' ? <SettingsDialog /> : null}
      {dialog === 'model' ? <ModelDialog /> : null}
      {note ? <div className={`ws-toast ${note.error ? 'is-error' : ''}`} role="status">{note.text}</div> : null}
    </>
  )
}
