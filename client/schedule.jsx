// 排期页：左边待排坞，右边周历，拖拽即排期。公众号发布是手动的，这里只管排哪天、够不够格发、发完标记。
import React from 'react'
import { act, setState, toast, useStudio } from './state.js'

const ICONS = {
  check: 'M3 8.5l3.2 3.2L13 5',
  close: 'M4 4l8 8M12 4l-8 8',
  plus: 'M8 3v10M3 8h10',
  doc: 'M4 2h5.5L12.5 5v9H4zM6.5 8h4M6.5 10.5h4',
}
function Icon({ name, size = 16 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg>
}

const SLOTS = [
  { id: 'morning', label: '早 8 点', hour: 8 },
  { id: 'noon', label: '午 12 点', hour: 12 },
  { id: 'evening', label: '晚 8 点', hour: 20 },
  { id: 'custom', label: '自定义', hour: null },
]
const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const pad = n => String(n).padStart(2, '0')
const dayKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const parseDay = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (date, days) => { const d = new Date(date); d.setDate(d.getDate() + days); return d }
const mondayOf = date => addDays(date, -((date.getDay() + 6) % 7))
const weekdayName = date => WEEKDAYS[(date.getDay() + 6) % 7]
const atOn = (key, hour, minute = 0) => { const d = parseDay(key); d.setHours(hour, minute, 0, 0); return d.toISOString() }
const timeLabel = iso => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const slotOf = iso => { const d = new Date(iso); return SLOTS.find(s => s.hour === d.getHours() && d.getMinutes() === 0) ?? SLOTS[3] }
const coverUrl = draft => `wechat-studio/cover/image?${new URLSearchParams({ id: draft.id, asset: draft.coverId })}`

async function openDraft(draft, view) {
  if (!await act('articles/select', { id: draft.id })) return
  setState({ module: 'paper', paperHome: false, view: view ?? (draft.lastView === 'layout' ? 'layout' : 'paper'), editing: null })
}

function ReadinessRing({ readiness, size = 22 }) {
  const r = 8, c = 10, gap = 0.14
  const arc = index => {
    const start = (index / 5) * Math.PI * 2 - Math.PI / 2 + gap
    const end = ((index + 1) / 5) * Math.PI * 2 - Math.PI / 2 - gap
    return `M${(c + r * Math.cos(start)).toFixed(2)} ${(c + r * Math.sin(start)).toFixed(2)} A${r} ${r} 0 0 1 ${(c + r * Math.cos(end)).toFixed(2)} ${(c + r * Math.sin(end)).toFixed(2)}`
  }
  return (
    <svg className="ws-sched-ring" width={size} height={size} viewBox="0 0 20 20" role="img"
      aria-label={`就绪 ${readiness.done}/${readiness.total}：${readiness.items.map(i => `${i.label}${i.done ? '已完成' : '未完成'}`).join('，')}`}>
      {readiness.items.map((item, index) => <path key={item.id} d={arc(index)} fill="none" strokeWidth="2.6" strokeLinecap="round" className={item.done ? 'is-done' : ''} />)}
    </svg>
  )
}

function CoverThumb({ draft }) {
  const [failed, setFailed] = React.useState(false)
  return <div className="ws-sched-thumb">{draft.coverId && !failed
    ? <img src={coverUrl(draft)} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <Icon name="doc" size={18} />}</div>
}

function DockCard({ draft, onPick, onDragStart }) {
  const missing = draft.readiness.total - draft.readiness.done
  return (
    <article className="ws-sched-card" draggable onDragStart={e => onDragStart(e, draft)}>
      <div className="ws-sched-card-top">
        <CoverThumb draft={draft} />
        <div className="ws-sched-card-copy">
          <button type="button" className="ws-sched-card-title" onClick={() => openDraft(draft)}>{draft.title}</button>
          <span className="ws-muted ws-small">{draft.chars} 字</span>
        </div>
        <ReadinessRing readiness={draft.readiness} />
      </div>
      <div className="ws-sched-card-foot">
        <span className="ws-muted ws-small">{missing ? `还差 ${missing} 项` : '就绪'}</span>
        <button type="button" className="ws-link" onClick={() => onPick(draft)}>排期</button>
      </div>
    </article>
  )
}

function ScheduledCard({ draft, now, onPick, onUnschedule, onDragStart }) {
  const missing = draft.readiness.items.filter(i => !i.done)
  const overdue = new Date(draft.scheduledFor).getTime() < now
  return (
    <article className={`ws-sched-entry ${overdue ? 'is-overdue' : ''} ${missing.length ? 'is-notready' : ''}`} draggable onDragStart={e => onDragStart(e, draft)}>
      <div className="ws-sched-entry-head">
        <span className="ws-sched-time">{timeLabel(draft.scheduledFor)}</span>
        <ReadinessRing readiness={draft.readiness} size={18} />
      </div>
      <button type="button" className="ws-sched-entry-title" onClick={() => openDraft(draft)}>{draft.title}</button>
      {missing.length ? <span className="ws-sched-missing">还差：{missing.map(i => i.label).join('、')}</span> : null}
      {overdue ? <span className="ws-sched-overdue">已过点，未标记发布</span> : null}
      <div className="ws-sched-entry-actions">
        <button type="button" className="ws-link" onClick={() => onPick(draft)}>改期</button>
        <button type="button" className="ws-link" onClick={() => onUnschedule(draft)}>取消</button>
      </div>
    </article>
  )
}

function PublishedCard({ draft }) {
  return (
    <article className="ws-sched-entry is-published">
      <div className="ws-sched-entry-head">
        <span className="ws-sched-time">{timeLabel(draft.publishedAt)}</span>
        <span className="ws-sched-published-tag"><Icon name="check" size={12} />已发</span>
      </div>
      <button type="button" className="ws-sched-entry-title" onClick={() => openDraft(draft)}>{draft.title}</button>
      <div className="ws-sched-entry-actions">
        <button type="button" className="ws-link" onClick={async () => { if (await act('articles/unpublish', { id: draft.id })) toast('已撤销发布标记') }}>撤销标记</button>
      </div>
    </article>
  )
}

function SchedulePicker({ data, picker, onClose }) {
  const dock = data.articles.filter(a => !a.archivedAt && !a.publishedAt && !a.scheduledFor)
  const [id, setId] = React.useState(picker.id ?? dock[0]?.id ?? '')
  const [day, setDay] = React.useState(picker.day)
  const chosen = data.articles.find(a => a.id === id)
  const existing = chosen?.scheduledFor ? new Date(chosen.scheduledFor) : null
  const [slot, setSlot] = React.useState(existing ? slotOf(chosen.scheduledFor).id : 'evening')
  const [time, setTime] = React.useState(existing ? timeLabel(chosen.scheduledFor) : '20:00')
  const pending = useStudio(s => s.pending)
  const submit = async event => {
    event.preventDefault()
    if (!id || !day) return
    const hour = slot === 'custom' ? Number(time.split(':')[0]) : SLOTS.find(s => s.id === slot).hour
    const minute = slot === 'custom' ? Number(time.split(':')[1]) : 0
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return toast('请填写有效的时间', true)
    const at = atOn(day, hour, minute)
    if (await act('schedule/set', { id, at })) {
      toast(`已排到 ${weekdayName(parseDay(day))} ${timeLabel(at)}`)
      onClose()
    }
  }
  return (
    <div className="ws-sched-overlay" role="presentation" onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <form className="ws-sched-picker" role="dialog" aria-modal="true" aria-label="安排发布时间" onSubmit={submit}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
        <div className="ws-sched-picker-head">
          <h2>{picker.id ? '改期' : '排一篇'}</h2>
          <button type="button" className="ws-icon-btn" aria-label="关闭" onClick={onClose}><Icon name="close" /></button>
        </div>
        {picker.id ? <p className="ws-sched-picker-title">{chosen?.title}</p> : (
          <label className="ws-sched-field">选稿件
            <select value={id} onChange={e => setId(e.target.value)} autoFocus>
              {dock.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </label>
        )}
        <label className="ws-sched-field">日期
          <input type="date" value={day} min="2000-01-01" max="2100-12-31" required autoFocus={Boolean(picker.id)} onChange={e => setDay(e.target.value)} />
        </label>
        <div className="ws-sched-slots" role="radiogroup" aria-label="时段">
          {SLOTS.map(s => <button key={s.id} type="button" role="radio" aria-checked={slot === s.id} className={slot === s.id ? 'is-on' : ''} onClick={() => setSlot(s.id)}>{s.label}</button>)}
        </div>
        {slot === 'custom' ? <label className="ws-sched-field">时间<input type="time" value={time} required onChange={e => setTime(e.target.value)} /></label> : null}
        <div className="ws-sched-picker-actions">
          <button type="button" className="ws-btn" onClick={onClose}>取消</button>
          <button type="submit" className="ws-btn is-primary" disabled={!id || !day || Boolean(pending)}>排上日历</button>
        </div>
      </form>
    </div>
  )
}

export function ScheduleView({ data }) {
  const [weekOffset, setWeekOffset] = React.useState(0)
  const [picker, setPicker] = React.useState(null)
  const [overDay, setOverDay] = React.useState(null)
  const pending = useStudio(s => s.pending)
  const now = Date.now()
  const today = new Date()
  const monday = addDays(mondayOf(today), weekOffset * 7)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const active = data.articles.filter(a => !a.archivedAt)
  const dock = active.filter(a => !a.scheduledFor && !a.publishedAt)
  const scheduled = active.filter(a => a.scheduledFor && !a.publishedAt)
  const published = active.filter(a => a.publishedAt)
  const weekStart = dayKey(days[0])
  const weekEnd = dayKey(days[6])
  const weekPublished = published.filter(a => { const k = dayKey(new Date(a.publishedAt)); return k >= weekStart && k <= weekEnd }).length
  const byDay = key => ({
    scheduled: scheduled.filter(a => dayKey(new Date(a.scheduledFor)) === key).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)),
    published: published.filter(a => dayKey(new Date(a.publishedAt)) === key).sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)),
  })
  const dragStart = (e, draft) => { e.dataTransfer.setData('text/plain', draft.id); e.dataTransfer.effectAllowed = 'move' }
  const dropOnDay = async (id, key) => {
    setOverDay(null)
    const draft = active.find(a => a.id === id)
    if (!draft || draft.publishedAt || pending) return
    if (draft.scheduledFor && dayKey(new Date(draft.scheduledFor)) === key) return
    const old = draft.scheduledFor ? new Date(draft.scheduledFor) : null
    const at = atOn(key, old ? old.getHours() : 20, old ? old.getMinutes() : 0)
    if (await act('schedule/set', { id, at })) toast(`已排到 ${weekdayName(parseDay(key))} ${timeLabel(at)}`)
  }
  const dropOnDock = async id => {
    const draft = active.find(a => a.id === id)
    if (!draft?.scheduledFor || pending) return
    if (await act('schedule/clear', { id })) toast('已移回待排')
  }
  const unschedule = async draft => { if (await act('schedule/clear', { id: draft.id })) toast('已取消排期，回到待排') }
  const pickFor = draft => setPicker({ id: draft.id, day: draft.scheduledFor ? dayKey(new Date(draft.scheduledFor)) : dayKey(today) })
  return (
    <main className="ws-sched">
      <header className="ws-sched-head">
        <div><h1>排期</h1><p className="ws-muted">{dock.length} 篇待排 · 本周已发 {weekPublished} 篇</p></div>
        <div className="ws-sched-weeknav">
          <button type="button" className="ws-btn" onClick={() => setWeekOffset(w => w - 1)}>上一周</button>
          <button type="button" className="ws-btn" disabled={weekOffset === 0} onClick={() => setWeekOffset(0)}>本周</button>
          <button type="button" className="ws-btn" onClick={() => setWeekOffset(w => w + 1)}>下一周</button>
          <span className="ws-muted ws-small">{days[0].getMonth() + 1} 月 {days[0].getDate()} 日 – {days[6].getMonth() + 1} 月 {days[6].getDate()} 日</span>
        </div>
      </header>
      <div className="ws-sched-body">
        <aside className="ws-sched-dock" aria-label="待排稿件"
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
          onDrop={e => { e.preventDefault(); dropOnDock(e.dataTransfer.getData('text/plain')) }}>
          <h2 className="ws-pane-title">待排 <span>{dock.length}</span></h2>
          {dock.length ? dock.map(d => <DockCard key={d.id} draft={d} onPick={pickFor} onDragStart={dragStart} />)
            : <p className="ws-muted ws-small">稿件都排上了。新写一篇，或把日历上的卡拖回来。</p>}
          <p className="ws-muted ws-small ws-sched-dock-hint">拖到右边某天即可排期；点「排期」可选时段。</p>
        </aside>
        <section className="ws-sched-main" aria-label="周日历">
          <div className="ws-sched-week">
            {days.map(date => {
              const key = dayKey(date)
              const rows = byDay(key)
              return (
                <div key={key} className={`ws-sched-day ${key === dayKey(today) ? 'is-today' : ''} ${overDay === key ? 'is-over' : ''}`}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverDay(key) }}
                  onDragLeave={() => setOverDay(current => current === key ? null : current)}
                  onDrop={e => { e.preventDefault(); dropOnDay(e.dataTransfer.getData('text/plain'), key) }}>
                  <header className="ws-sched-day-head"><span>{weekdayName(date)}</span><b>{date.getMonth() + 1}/{date.getDate()}</b></header>
                  <div className="ws-sched-day-list">
                    {rows.scheduled.map(d => <ScheduledCard key={d.id} draft={d} now={now} onPick={pickFor} onUnschedule={unschedule} onDragStart={dragStart} />)}
                    {rows.published.map(d => <PublishedCard key={d.id} draft={d} />)}
                    {!rows.scheduled.length && !rows.published.length ? (
                      <button type="button" className="ws-sched-empty" onClick={() => setPicker({ id: null, day: key })}><Icon name="plus" size={13} />排一篇</button>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
      {picker ? <SchedulePicker data={data} picker={picker} onClose={() => setPicker(null)} /> : null}
    </main>
  )
}