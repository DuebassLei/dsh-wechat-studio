// 浏览器侧的状态：Host 状态的本地镜像，加上只属于界面的视图、弹窗等。
import React from 'react'

const BASE = 'wechat-studio/'

let snap = { data: null, error: null, view: 'paper', paperHome: true, dialog: null, toast: null, editing: null, layout: null, pending: null, chatOpen: true, bannerTried: {}, module: 'paper', skills: null, settings: null }
const listeners = new Set()
let timer = null

export function getState() {
  return snap
}

export function setState(patch) {
  snap = { ...snap, ...(typeof patch === 'function' ? patch(snap) : patch) }
  listeners.forEach(fn => fn())
}

export function useStudio(selector) {
  return React.useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn) }, () => selector(snap))
}

export function toast(text, error = false) {
  const item = { text, error, at: Date.now() }
  setState({ toast: item })
  setTimeout(() => { if (snap.toast === item) setState({ toast: null }) }, error ? 6000 : 2600)
}

async function request(path, options) {
  const res = await fetch(BASE + path, options)
  let body = null
  try {
    body = await res.json()
  } catch {
    // 不是 JSON 时按状态码报错
  }
  if (!res.ok) throw new Error(body?.error || `请求失败（${res.status}）`)
  return body
}

const bodyKey = (current, brand) => (current ? [current.id, current.title, current.banner?.style, current.banner?.at, current.followCard, brand?.author, brand?.slogan, ...current.blocks.map(b => b.text)].join('\u0001') : '')

export function loadRevisions(id, signal) {
  return request(`revisions?${new URLSearchParams({ id })}`, { signal })
}

function accept(data) {
  const current = data.current
  // 正文变了，之前排好的版式就过期了
  const layout = snap.layout?.key === bodyKey(current, data.brand) ? snap.layout : null
  setState({ data, error: null, layout })
  clearTimeout(timer)
  if (current?.job || current?.coverJob || current?.imageImport?.total) timer = setTimeout(refresh, 900)
}

export async function refresh() {
  try {
    accept(await request('state'))
  } catch (err) {
    setState({ error: err.message })
    clearTimeout(timer)
    timer = setTimeout(refresh, 4000)
  }
}

/** 发一个修改请求，返回是否成功。失败时弹提示，不抛出。 */
export async function act(path, body = {}, { quiet = false } = {}) {
  setState({ pending: path })
  try {
    accept(await request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: snap.data?.current?.id, ...body }) }))
    return true
  } catch (err) {
    if (!quiet) toast(err.message, true)
    return false
  } finally {
    setState({ pending: null })
  }
}

let viewWrite = Promise.resolve()

export function rememberArticleView(id, view) {
  viewWrite = viewWrite.then(() => saveArticleView(id, view))
  return viewWrite
}

async function saveArticleView(id, view) {
  try {
    await request('articles/view', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, view }),
    })
    setState(s => s.data ? { data: { ...s.data, articles: s.data.articles.map(item =>
      item.id === id ? { ...item, lastView: view } : item) } } : {})
  } catch (err) {
    toast(err.message, true)
  }
}

export async function uploadReport(file) {
  if (!file) return
  setState({ pending: 'zhuque/report' })
  try {
    accept(await request(`zhuque/report?id=${encodeURIComponent(snap.data.current.id)}`, { method: 'POST', headers: { 'content-type': 'application/pdf' }, body: file }))
  } catch (err) {
    toast(err.message, true)
  } finally {
    setState({ pending: null })
  }
}

export async function copyText(text, done) {
  let ok = false
  try {
    await navigator.clipboard.writeText(text)
    ok = true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.cssText = 'position:fixed;opacity:0;left:-999px'
    document.body.appendChild(area)
    area.select()
    try { ok = document.execCommand('copy') } catch { ok = false }
    area.remove()
  }
  toast(ok ? done : '浏览器没让写剪贴板，请手动复制', !ok)
  return ok
}

export async function copyDetectionText() {
  try {
    const { text } = await request(`detection-text?id=${encodeURIComponent(snap.data.current.id)}`)
    await copyText(text, `已复制检测文本（${text.length} 字），贴到朱雀去检测`)
  } catch (err) {
    toast(err.message, true)
  }
}

export async function copyMarkdown() {
  try {
    const { markdown } = await request(`markdown?id=${encodeURIComponent(snap.data.current.id)}`)
    await copyText(markdown, '已复制 Markdown')
  } catch (err) {
    toast(err.message, true)
  }
}

export async function loadLayout() {
  const id = snap.data?.current?.id
  if (!id) return
  const key = bodyKey(snap.data.current, snap.data.brand)
  const loading = { loading: true, key }
  setState({ layout: loading })
  try {
    const result = await request(`layout?id=${encodeURIComponent(id)}`)
    if (snap.layout === loading) setState({ layout: { html: result.html, report: result.report, key } })
  } catch (err) {
    if (snap.layout === loading) setState({ layout: { error: err.message, key } })
  }
}

export async function loadSkills() {
  try {
    setState({ skills: await request('skills') })
  } catch (err) {
    setState({ skills: { error: err.message } })
  }
}

export async function loadSettings() {
  try {
    setState({ settings: await request('settings') })
  } catch (err) {
    toast(err.message, true)
  }
}

/** 保存设置。成功返回 true；朱雀密钥有没有设置会影响稿面，所以顺手刷新一次状态。 */
export async function saveSettings(patch) {
  try {
    setState({ settings: await request('settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) }) })
    await refresh()
    return true
  } catch (err) {
    toast(err.message, true)
    return false
  }
}

/** 试一次朱雀接口。返回 {ok, tokens} 或 {error}。 */
export async function testZhuque(patch) {
  try {
    return await request('zhuque/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) })
  } catch (err) {
    return { error: err.message }
  }
}

export async function loadModels() {
  return request('models')
}
