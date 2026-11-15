// Compare complete calendar-day windows anchored to the recorded publication date.
export function articleWindow(detail, days) {
  if (!detail.publishedAt) return null
  const daily = new Map(detail.daily.filter(row => row.channel === '全部').map(row => [row.date, row]))
  const dates = Array.from({ length: days }, (_, index) => {
    const date = new Date(detail.publishedAt + 'T00:00:00Z')
    date.setUTCDate(date.getUTCDate() + index)
    return date.toISOString().slice(0, 10)
  })
  const rows = dates.map(date => daily.get(date))
  if (rows.some(row => row?.reads == null)) return null
  const reads = rows.reduce((sum, row) => sum + row.reads, 0)
  const shares = rows.every(row => row.shares != null) ? rows.reduce((sum, row) => sum + row.shares, 0) : null
  return { reads, shares, shareRate: shares != null && reads > 0 ? shares / reads : null }
}

export function median(values) {
  const sorted = values.filter(value => value != null).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function diagnoseArticle(detail) {
  const metrics = new Map(detail.metrics.map(({ label, value }) => [
    String(label).normalize('NFKC').replace(/\s/g, '').replace(/\([^)]*\)$/, ''), value,
  ]))
  const conversion = new Map(detail.conversion.map(({ label, value }) => [String(label).trim(), value]))
  const delivered = conversion.get('送达人数')
  const opened = conversion.get('公众号消息阅读人数')
  const openRate = Number.isFinite(delivered) && Number.isFinite(opened) && delivered > 0 && opened >= 0 && opened <= delivered ? opened / delivered : null
  const completion = metrics.get('完读率')
  const channels = new Map()
  for (const row of detail.daily) {
    if (row.channel === '全部' || !Number.isFinite(row.reads) || row.reads <= 0) continue
    channels.set(row.channel, (channels.get(row.channel) ?? 0) + row.reads)
  }
  return {
    delivered, opened, openRate,
    completion: Number.isFinite(completion) && completion >= 0 && completion <= 1 ? completion : null,
    duration: metrics.get('平均停留时长'),
    reads: metrics.get('阅读'),
    shares: metrics.get('分享'),
    follows: metrics.get('新增关注'),
    topChannel: [...channels].sort((a, b) => b[1] - a[1])[0],
  }
}

export function compareArticle(detail, details, days) {
  const current = articleWindow(detail, days)
  const seen = new Set([detail.articleKey])
  const peers = []
  if (detail.topic) {
    const recent = [...details].sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    for (const item of recent) {
      if (item.topic !== detail.topic || seen.has(item.articleKey)) continue
      const score = articleWindow(item, days)
      if (!score) continue
      seen.add(item.articleKey)
      peers.push({ item, score })
    }
  }
  const shareRates = peers.map(row => row.score.shareRate).filter(value => value != null)
  return {
    current, peers, shareCount: shareRates.length,
    readsMedian: peers.length >= 3 ? median(peers.map(row => row.score.reads)) : null,
    shareMedian: shareRates.length >= 3 ? median(shareRates) : null,
  }
}

export function reviewHighlights(details, range) {
  const recent = [...details].sort((a, b) => b.importedAt.localeCompare(a.importedAt))
  const seen = new Set()
  const highlights = new Map()
  for (const detail of recent) {
    if (!detail.articleKey || seen.has(detail.articleKey) || !detail.topic) continue
    if (range && (detail.publishedAt < range.from || detail.publishedAt > range.to)) continue
    const score = compareArticle(detail, details, 7)
    const { current, readsMedian, shareMedian, peers } = score
    if (current?.shareRate == null || readsMedian == null || shareMedian == null) continue
    seen.add(detail.articleKey)
    const reads = current.reads - readsMedian
    const shares = current.shareRate - shareMedian
    let kind
    if (reads > 0 && shares > 0) kind = 'followup'
    else if (reads < 0 && shares > 0) kind = 'angle'
    else if (reads > 0 && shares < 0) kind = 'opening'
    else if (reads < 0 && shares < 0) kind = 'review'
    if (!kind) continue
    const comparable = peers.filter(row => row.score.shareRate != null)
    const peer = comparable.sort((a, b) => kind === 'opening'
      ? b.score.shareRate - a.score.shareRate || b.score.reads - a.score.reads
      : b.score.reads - a.score.reads)[0]
    const strength = Math.abs(shares)
    if (strength > (highlights.get(kind)?.strength ?? -1)) {
      highlights.set(kind, { kind, detail, peerKey: peer.item.key, reads, shares, strength, count: score.shareCount })
    }
  }
  return ['followup', 'angle', 'opening', 'review'].flatMap(kind => highlights.has(kind) ? [highlights.get(kind)] : [])
}
