import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createArticle, listMeta, readiness } from '../src/article.js'
import { route } from '../src/host.js'
import { Store } from '../src/store.js'

const FULL_MD = '# 一篇就绪的稿子\n\n第一段正文，写得足够长，才会参加检测，所以这里多写几个字凑够二十个字。'

function readyArticle() {
  const article = createArticle({ markdown: FULL_MD })
  article.zhuque = { round: 1, lastAt: new Date().toISOString() }
  article.cover = { id: 'cover-1' }
  article.bannerStyle = 'none'
  return article
}

test('readiness：五项体检，缺什么报什么', () => {
  const empty = createArticle({ topic: '只有选题' })
  const report = readiness(empty)
  assert.equal(report.total, 5)
  assert.equal(report.done, 0)
  assert.deepEqual(report.items.map(i => i.id), ['body', 'title', 'quality', 'cover', 'banner'])
  const full = readyArticle()
  assert.equal(readiness(full, { bannerReady: true }).done, 5)
  full.blocks[0].check = { status: 'flag' }
  const flagged = readiness(full, { bannerReady: true })
  assert.equal(flagged.done, 4)
  assert.equal(flagged.items.find(i => i.id === 'quality').done, false)
})

test('listMeta 透出排期、发布和体检结果', () => {
  const article = readyArticle()
  const meta = listMeta(article, { bannerReady: true })
  assert.equal(meta.scheduledFor, null)
  assert.equal(meta.publishedAt, null)
  assert.equal(meta.readiness.done, 5)
})