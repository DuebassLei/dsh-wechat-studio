import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createVersionChecker, isNewerRelease } from '../src/version.js'

test('版本比较支持正式版与预发布版本', () => {
  assert.equal(isNewerRelease('0.1.2', '0.1.1'), true)
  assert.equal(isNewerRelease('v0.2.0', '0.1.9'), true)
  assert.equal(isNewerRelease('0.2.0', '0.2.0-rc.5'), true)
  assert.equal(isNewerRelease('0.2.0-rc.2', '0.2.0-rc.1'), true)
  assert.equal(isNewerRelease('0.2.0-beta.2', '0.2.0-rc.1'), false)
  assert.equal(isNewerRelease('0.1.1', '0.1.1'), false)
  assert.equal(isNewerRelease('not-a-version', '0.1.1'), false)
})

test('版本检查合并并发、回退镜像并缓存一小时', async () => {
  let now = 1_000
  let latest = '0.2.0'
  const calls = []
  const fetchImpl = async url => {
    calls.push(url)
    if (url.includes('registry.npmjs.org')) throw new Error('offline')
    return Response.json({ version: latest })
  }
  const checker = createVersionChecker({ currentVersion: '0.1.1', fetchImpl, now: () => now })
  const [first, concurrent] = await Promise.all([checker.check(), checker.check()])
  assert.equal(first, concurrent)
  assert.equal(first.latest, '0.2.0')
  assert.equal(first.updateAvailable, true)
  assert.equal(first.failed, false)
  assert.equal(calls.length, 2)
  assert.match(calls[1], /npmmirror/)

  await checker.check()
  assert.equal(calls.length, 2)
  latest = '0.3.0'
  now += 60 * 60 * 1000 + 1
  const refreshed = await checker.check()
  assert.equal(refreshed.latest, '0.3.0')
  assert.equal(calls.length, 4)
})

test('两个 registry 都失败时静默返回并缓存失败结果', async () => {
  let calls = 0
  const checker = createVersionChecker({
    currentVersion: '0.1.1',
    fetchImpl: async () => { calls++; return { ok: false } },
  })
  const result = await checker.check()
  assert.deepEqual(result, {
    ready: false,
    failed: true,
    checkedAt: result.checkedAt,
    current: '0.1.1',
    latest: null,
    updateAvailable: false,
  })
  await checker.check()
  assert.equal(calls, 2)
})
