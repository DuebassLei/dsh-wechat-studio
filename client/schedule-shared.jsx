import React from 'react'
import { dayKey } from '../src/schedule-time.js'
import { act, setState } from './state.js'

const ICONS = {
  check: 'M3 8.5l3.2 3.2L13 5',
  close: 'M4 4l8 8M12 4l-8 8',
  plus: 'M8 3v10M3 8h10',
  chevron: 'M4 6l4 4 4-4',
  doc: 'M4 2h5.5L12.5 5v9H4zM6.5 8h4M6.5 10.5h4',
}

export function Icon({ name, size = 16 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name]} /></svg>
}

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
export const pad = n => String(n).padStart(2, '0')
export const weekdayName = date => WEEKDAYS[(date.getDay() + 6) % 7]
export const timeLabel = iso => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
export const dateLabel = iso => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}` }
export const inputTime = date => `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
export const pubSlot = draft => draft.scheduledFor ?? draft.publishedAt
export const coverUrl = draft => `wechat-studio/cover/image?${new URLSearchParams({ id: draft.id, asset: draft.coverId })}`

export async function openDraft(draft, view) {
  if (!await act('articles/select', { id: draft.id })) return
  setState({ module: 'paper', paperHome: false, view: view ?? (draft.lastView === 'layout' ? 'layout' : 'paper'), editing: null })
}

export function ReadinessRing({ readiness, size = 22 }) {
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

export function CoverThumb({ draft }) {
  const [failed, setFailed] = React.useState(false)
  return <div className="ws-sched-thumb">{draft.coverId && !failed
    ? <img src={coverUrl(draft)} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <Icon name="doc" size={18} />}</div>
}
