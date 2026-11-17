const VERSION_URLS = [
  'https://registry.npmjs.org/dsh-wechat-studio/latest',
  'https://registry.npmmirror.com/dsh-wechat-studio/latest',
]

const CACHE_TTL_MS = 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 8_000

function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)(?:\.(\d+))?)?(?:\+[0-9a-z.-]+)?$/i.exec(String(version).trim())
  if (!match) return null
  const channel = match[4]?.toLowerCase()
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    rank: channel === 'rc' ? 3 : channel === 'beta' ? 2 : channel === 'alpha' ? 1 : 4,
    serial: match[5] ? Number(match[5]) : 0,
  }
}

export function isNewerRelease(latest, current) {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (const key of ['major', 'minor', 'patch', 'rank', 'serial']) {
    if (a[key] !== b[key]) return a[key] > b[key]
  }
  return false
}

export function createVersionChecker({ currentVersion, fetchImpl = fetch, now = () => Date.now(), ttlMs = CACHE_TTL_MS }) {
  let cached = null
  let inflight = null

  const read = async () => {
    for (const url of VERSION_URLS) {
      try {
        const response = await fetchImpl(url, {
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (!response.ok) continue
        const body = await response.json()
        if (typeof body?.version !== 'string' || !body.version) continue
        const latest = body.version
        return {
          ready: true,
          failed: false,
          checkedAt: now(),
          current: currentVersion,
          latest,
          updateAvailable: isNewerRelease(latest, currentVersion),
        }
      } catch {
        // Try the mirror when the registry is unavailable or returns invalid data.
      }
    }
    return { ready: false, failed: true, checkedAt: now(), current: currentVersion, latest: null, updateAvailable: false }
  }

  return {
    async check() {
      if (cached && now() - cached.checkedAt < ttlMs) return cached
      if (!inflight) {
        inflight = read().then(result => { cached = result; return result }).finally(() => { inflight = null })
      }
      return inflight
    },
  }
}
