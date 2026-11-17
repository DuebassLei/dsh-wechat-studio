// dsh-wechat-studio 浏览器半片：侧栏入口 + main 面板。
import React from 'react'
import { Icon, Studio } from './app.jsx'
import { refresh } from './state.js'
import css from './styles.css'

const PANEL_ID = 'wechat-studio'
const LABEL = '公众号成稿台'

function Panel({ onOpenPlugin }) {
  React.useEffect(() => { refresh() }, [])
  return (
    <div className="ws-root">
      <style>{css}</style>
      <Studio onOpenPlugin={onOpenPlugin} />
    </div>
  )
}

function PanelIcon({ size }) {
  return <Icon name="doc" size={size} />
}

export const inject = ['slots']

export function apply(ctx) {
  const onOpenPlugin = () => {
    try {
      const navigation = ctx.get('pluginNavigation')
      if (typeof navigation?.openBundle !== 'function') return false
      navigation.openBundle('dsh-wechat-studio')
      return true
    } catch {
      return false
    }
  }
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, props => <Panel {...props} onOpenPlugin={onOpenPlugin} />))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 6, label: () => LABEL }, PanelIcon))
}
