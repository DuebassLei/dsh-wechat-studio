// 本地存储：全部文章存在 <DSH_HOME>/wechat-studio/state.json，桌面版和网页版共用。
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

const EMPTY = { v: 1, currentId: null, articles: [] }

export class Store {
  constructor(root = join(dshHome(), 'wechat-studio')) {
    this.root = root
    this.file = join(root, 'state.json')
    this.queue = Promise.resolve()
    this.cache = null
  }

  async read() {
    if (this.cache) return this.cache
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8'))
      this.cache = { ...EMPTY, ...parsed, articles: Array.isArray(parsed.articles) ? parsed.articles : [] }
    } catch (err) {
      if (err.code !== 'ENOENT' && !(err instanceof SyntaxError)) throw err
      this.cache = structuredClone(EMPTY)
    }
    return this.cache
  }

  /**
   * 串行修改状态并落盘。fn 可以直接改传入的 state。
   * @param {(state: object) => any} fn - 修改函数，返回值原样返回。
   */
  update(fn) {
    const run = async () => {
      const state = await this.read()
      const result = await fn(state)
      await mkdir(this.root, { recursive: true })
      const tmp = `${this.file}.${process.pid}.tmp`
      await writeFile(tmp, JSON.stringify(state, null, 1), { mode: 0o600 })
      await rename(tmp, this.file)
      return result
    }
    const next = this.queue.then(run, run)
    this.queue = next.catch(() => {})
    return next
  }
}
