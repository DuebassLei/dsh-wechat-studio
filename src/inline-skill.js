import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { INLINE_DIAGRAM_SKILL_DIR } from './ai.js'

const DIRECTORY = 'linyuebanzi-inline-diagram'
const STYLE_ID = /^[a-z0-9-]+$/
const directories = overrideDir => [overrideDir ? join(overrideDir, DIRECTORY) : null, INLINE_DIAGRAM_SKILL_DIR].filter(Boolean)

async function readFirst(dirs, relative, required = true) {
  for (const dir of dirs) {
    try {
      return await readFile(join(dir, relative), 'utf8')
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }
  if (required) throw new Error(`找不到插图 skill 文件：${relative}`)
  return null
}

function styleName(id, content) {
  const heading = content.split(/\r?\n/).find(line => /^#\s+/.test(line))
  return heading?.replace(/^#\s+风格\s*[:：]\s*/, '').replace(/\s*\([^)]*\)\s*$/, '').trim() || id
}

export async function inlineAnalysisSkill(overrideDir) {
  const content = await readFirst(directories(overrideDir), join('references', 'analysis-contract.md'))
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim()
}

const catalogCache = new Map()

async function scanStyleDirectory(dir) {
  const directory = join(dir, 'references', 'styles')
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (err) {
    return {
      files: [],
      signature: { dir, error: err.code },
      warnings: err.code === 'ENOENT' ? [] : [`插图风格目录读取失败，已跳过（${err.code ?? '未知错误'}）。`],
    }
  }
  const names = entries.filter(entry => entry.isFile() && entry.name.endsWith('.md') && STYLE_ID.test(entry.name.slice(0, -3)))
    .map(entry => entry.name).sort()
  const files = await Promise.all(names.map(async name => {
    const path = join(directory, name)
    try {
      const info = await stat(path)
      return { id: name.slice(0, -3), path, stamp: [info.mtimeMs, info.ctimeMs, info.size, info.mode] }
    } catch (err) {
      return { id: name.slice(0, -3), path, error: err.code }
    }
  }))
  return { files, signature: { dir, files }, warnings: [] }
}

export async function readInlineStyleCatalog(overrideDir) {
  const key = directories(overrideDir).join('\0')
  const scanned = await Promise.all(directories(overrideDir).reverse().map(scanStyleDirectory))
  const signature = JSON.stringify(scanned.map(item => item.signature))
  const cached = catalogCache.get(key)
  if (cached?.signature === signature) return cached.catalog

  const styles = new Map()
  const warnings = scanned.flatMap(item => item.warnings)
  for (const { files } of scanned) {
    for (const file of files) {
      if (file.error) {
        warnings.push(`插图风格 ${file.id} 读取失败，已跳过（${file.error ?? '未知错误'}）。`)
        continue
      }
      try {
        const content = await readFile(file.path, 'utf8')
        styles.set(file.id, { id: file.id, name: styleName(file.id, content) })
      } catch (err) {
        warnings.push(`插图风格 ${file.id} 读取失败，已跳过（${err.code ?? '未知错误'}）。`)
      }
    }
  }
  const catalog = { styles: [...styles.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')), warnings }
  if (!warnings.length) catalogCache.set(key, { signature, catalog })
  else catalogCache.delete(key)
  return catalog
}

export async function listInlineStyles(overrideDir) {
  return (await readInlineStyleCatalog(overrideDir)).styles
}

export async function loadInlineStyle(id, overrideDir) {
  if (!STYLE_ID.test(id ?? '')) throw Object.assign(new Error('请选择有效的插图风格。'), { status: 400 })
  const content = await readFirst(directories(overrideDir), join('references', 'styles', `${id}.md`), false)
  if (!content) throw Object.assign(new Error('请选择有效的插图风格。'), { status: 400 })
  return { id, name: styleName(id, content), content }
}
