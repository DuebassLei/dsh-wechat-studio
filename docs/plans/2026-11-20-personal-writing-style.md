# Personal Writing Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authors import 1 or more past articles (existing studio drafts, `.md`/`.txt` files, or pasted text) to generate an editable, live-previewable personal writing style that overrides `writer.md` and `headline.md` with safe backup, `## 数据复盘规则` preservation, and one-click restore to the built-in default.

**Architecture:** Put browser-safe pure logic (sample cleaner, budget-exact sampler, `StyleProfile` normalizer with strict length caps, and `pickableStyleArticles`) in `src/writing-style-shared.js` with zero Node dependencies so both server and `scripts/build.mjs` (browser bundle) share it cleanly. Keep Node-only persistence, neutral skill rendering, content-hash drift detection, timestamped `.bak` backups, and LLM calls in `src/writing-style.js`, reusing `src/insights.js`'s exact `## 数据复盘规则` section parser across both apply and restore. Expose `/wechat-studio/style/*` routes in `src/host.js` and mount a single top-level `WritingStyleWizard` modal in `Studio` triggered from `SkillsView` and `NewDialog`.

**Tech Stack:** Node.js `>=20` ESM, `node:test` + `node:assert/strict`, React 18 (`client/*.jsx` bundled via `npm run build` -> `dist/client.js`), existing `src/ai.js` (`callModel`, `extractJson`, `skillSources`), `src/insights.js` (`extractInsightsSection`, `replaceInsightsSection`), and atomic file writes (`tmp` + `rename`).

**Spec:** Agreed V1 design from brainstorming session (single active personal style per workspace; multi-style library deferred to V2).

## Global Constraints

- Node.js `>=20` ESM only; no new runtime dependencies (`package.json` dependencies unchanged).
- `src/writing-style-shared.js` MUST NOT import any `node:*` built-ins or server-only modules (`scripts/build.mjs` targets `platform: 'browser'`).
- All shell verification commands prefix `export PATH="/opt/homebrew/opt/nodejs/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"`.
- Zero prompt/skill jargon in user-facing UI copy: use plain Chinese (`我的写作风格`, `风格体检卡`, `现场试写`, `恢复默认风格`); raw generated `writer.md`/`headline.md` is hidden inside an optional collapsible disclosure.
- V1 supports one active personal style per workspace; never modify bundled `skills/writer.md` or `skills/headline.md` in the repo.
- Every file write to `style-profile.json` or `<store.root>/skills/*.md` must be atomic (write `.tmp` then `rename`).
- Do not use `vm.runInNewContext` in tests; test exported pure functions and HTTP route handlers directly with `node:test`.
- Never run `git commit` without explicit user approval during interactive sessions (commit steps in tasks are checkpoints for authorized execution).

## Review Focus

1. **Noisy articles & strict `totalChars <= maxChars` budget:** Code blocks, image/Feishu URLs, HTML tags, and `fixedLines` must be stripped, and all truncation separators (`\n……\n`) plus inter-article separators must be deducted *before* slicing so `totalChars <= maxChars` holds strictly -> pinned in Task 1 (`cleanArticleSample` & `buildSampleBundle` 5-article 1000-char test).
2. **User hand-edits & scope deselection:** Detecting drift only by `managed_by` + missing `.bak` misses (a) hand-edits that keep `managed_by` and (b) removing `managed_by` when `.bak` already exists; unchecking a previously enabled scope must also deactivate its managed file instead of leaving it active on disk -> pinned in Task 2 (hash-drift timestamped backup tests + `both -> writer-only` regression test).
3. **`## 数据复盘规则` preservation across apply AND restore:** Must reuse `src/insights.js`'s exact section boundary (`^## 数据复盘规则\s*$` to next `^## `), and `restoreDefaultStyle` (or unchecking `headline`) must never wipe or roll back newer `## 数据复盘规则` written while personal style was active -> pinned in Task 2 (`apply -> applyRule -> restoreDefaultStyle` test).
4. **Malformed/oversized LLM or client payloads & 3-title contract:** `normalizeStyleProfile` must cap every string/array/headline subfield and re-run on `apply`/`preview`/`render`; `previewWritingStyle` must enforce exactly 3 non-empty titles or return a clear Chinese error -> pinned in Task 1 & Task 3.
5. **Empty workspace, stale preview, and real `listMeta` fields:** `GET style/profile` must be routed *before* `mustFind(...)` in `src/host.js`; `pickableStyleArticles` must filter on `!article.archivedAt && article.chars > 0`; editing profile in Step 2 must never display stale `writer.md`/`headline.md` preview -> pinned in Task 1, Task 4 (`POST style/render` + empty-workspace `GET style/profile`), and Task 5.

---

## File Structure

- **Create:** `src/writing-style-shared.js` — Browser-safe pure helpers (zero `node:*` imports): `STYLE_PROFILE_VERSION`, `MAX_SAMPLE_CHARS`, `STYLE_LIMITS`, `cleanArticleSample`, `buildSampleBundle`, `normalizeStyleProfile`, `pickableStyleArticles`.
- **Modify:** `src/insights.js:350-375` — Export `extractInsightsSection(text)` and `replaceInsightsSection(base, section)` reusing existing `replaceSection` boundary logic.
- **Create:** `src/writing-style.js` — Node-side neutral `writer.md`/`headline.md` renderers, content-hash drift detection, timestamped `.bak` backups, atomic apply/scope-cleanup/restore preserving `## 数据复盘规则`, `style-profile.json` persistence, and LLM `analyzeWritingStyle` / `previewWritingStyle`.
- **Create:** `test/writing-style.test.js` — Unit and route tests covering all backend/shared logic and the 5 Review Focus failure modes.
- **Modify:** `src/host.js` — Add `GET style/profile` (before `mustFind`), `POST style/analyze`, `POST style/preview`, `POST style/render`, `POST style/apply`, `POST style/restore`, and `hasPersonalStyle` in `snapshotState`.
- **Create:** `client/writing-style.jsx` — `WritingStyleCard` (for `SkillsView`) and `WritingStyleWizard` (3-step human-friendly modal importing only from `../src/writing-style-shared.js` and `./state.js`).
- **Modify:** `client/state.js` — Add `style` state slice, `styleWizardStep` / `openStyleWizard` helper, and API functions (`loadStyleProfile`, `analyzeStyle`, `previewStyle`, `renderStyleMarkdown`, `applyStyle`, `restoreStyle`).
- **Modify:** `client/app.jsx` — Mount `<WritingStyleWizard>` once in top-level `Studio` (`dialog === 'style-wizard'`), render `<WritingStyleCard>` in `SkillsView`, and add subtle one-line default-style link in `NewDialog` (`从选题写` tab).
- **Modify:** `client/styles.css` — Styles for style card, 3-step wizard, editable chips, dropzone, and live test-write preview box.
- **Modify:** `README.md` — Document personal writing style workflow.

---

### Task 1: Browser-Safe Shared Module (`src/writing-style-shared.js`)

**Files:**
- Create: `src/writing-style-shared.js`
- Test: `test/writing-style.test.js`

**Interfaces:**
- Consumes: none (strictly pure JS, zero `node:*` imports).
- Produces (exported from `src/writing-style-shared.js`):
  - `STYLE_PROFILE_VERSION = 1`
  - `MAX_SAMPLE_CHARS = 20000`
  - `STYLE_LIMITS` — explicit max lengths for every field (`name: 40`, `summary: 80`, `voice: [5, 120]`, `rhythm: [5, 120]`, `phrases: [12, 30]`, `taboos: [12, 30]`, `excerpts: [5, 220]`, `userNote: 200`, `headlineLengthRange: 30`, `headlineHooks: [4, 80]`, `headlinePunctuation: 80`, `headlineSummaryStyle: 100`).
  - `cleanArticleSample(text, { fixedLines = [] } = {}) -> string`
  - `buildSampleBundle(samples, { maxChars = MAX_SAMPLE_CHARS, fixedLines = [] } = {}) -> { items: Array<{ title: string, text: string, originalChars: number }>, combined: string, totalChars: number, truncated: boolean }`
  - `normalizeStyleProfile(raw, fallbackSamples = []) -> StyleProfile`
  - `pickableStyleArticles(articles) -> Array<object>` — filters `!article.archivedAt && Number(article.chars) > 0`.

- [ ] **Step 1: Write failing tests in `test/writing-style.test.js`**

Test with `node:test` + `node:assert/strict`:
- `cleanArticleSample`: strips fenced code blocks (` ```js ... ``` `), Markdown images (`![alt](https://...)`), bare `https://` URLs, HTML tags, and trimmed lines matching `fixedLines`, while preserving Chinese prose.
- `buildSampleBundle`:
  - Accepts 1 article or multiple articles; drops samples with `< 30` cleaned chars; throws 400 error (`至少提供一篇包含正文的参考文章`) when none remain.
  - 5 long articles with `maxChars: 1000`: every article contributes, `bundle.truncated === true`, `bundle.totalChars <= 1000`, AND `bundle.combined.length <= 1000` (proving `\n……\n` and inter-article separators are deducted before slicing).
- `normalizeStyleProfile`:
  - Truncates oversized strings across **every** field (`name`, `summary`, `userNote`, every item of `voice`/`rhythm`/`phrases`/`taboos`/`excerpts`, and `headline.lengthRange`/`hooks`/`punctuation`/`summaryStyle`) to `STYLE_LIMITS`.
  - Deduplicates arrays, fills defaults when `raw` is sparse/malformed, and extracts 2–3 fallback excerpts from `fallbackSamples` when `raw.excerpts` is empty.
- `pickableStyleArticles`: excludes items with `archivedAt` truthy or `chars <= 0` / missing `chars`; keeps active items with `chars > 0` in order.

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/opt/nodejs/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" && node --test test/writing-style.test.js`
Expected: FAIL (`Cannot find module '../src/writing-style-shared.js'`).

- [ ] **Step 3: Implement `src/writing-style-shared.js`**

- Keep zero `node:*` imports.
- In `buildSampleBundle`: compute inter-article separator overhead (`(n - 1) * sep.length`, plus per-article header if included in `combined`), subtract from `maxChars` to get `bodyBudget`, allocate `perItem = Math.floor(bodyBudget / n)`; when an article exceeds `perItem`, subtract `ellipsis.length` (`'\n……\n'.length === 3`) first and split remaining chars 60% head / 40% tail so `combined.length <= maxChars` and `totalChars === combined.length <= maxChars` always hold.
- In `normalizeStyleProfile`: enforce every cap from `STYLE_LIMITS`.
- In `pickableStyleArticles`: `return (Array.isArray(articles) ? articles : []).filter(a => a && !a.archivedAt && Number(a.chars) > 0)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/opt/homebrew/opt/nodejs/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" && node --test test/writing-style.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/writing-style-shared.js test/writing-style.test.js
git commit -m "feat(style): add browser-safe sample cleaner, budget-exact sampler, and normalizer"
```

---

### Task 2: Shared Insights Section Helper, Neutral Skill Renderers, Drift-Safe Backup & Restore

**Files:**
- Modify: `src/insights.js:350-375`
- Create: `src/writing-style.js`
- Test: `test/writing-style.test.js`

**Interfaces:**
- Consumes: `normalizeStyleProfile` (`src/writing-style-shared.js`); `HOOK_IDS` (`src/article.js`); `extractInsightsSection`, `replaceInsightsSection` (`src/insights.js`).
- Produces:
  - Exported from `src/insights.js`:
    - `extractInsightsSection(text) -> string | null` (extracts `^## 数据复盘规则\s*$` through the line before the next `^## ` or EOF, matching `replaceSection`).
    - `replaceInsightsSection(base, section) -> string` (exported alias of existing `replaceSection`).
  - Exported from `src/writing-style.js`:
    - `renderWriterSkill(profile) -> string`
    - `renderHeadlineSkill(profile, existingHeadlineMd = '') -> string`
    - `readStyleState(root) -> Promise<{ active: boolean, scopes: { writer: boolean, headline: boolean }, profile: StyleProfile | null, sampleCount: number, sampleTitles: string[], updatedAt: string | null, hasBackup: { writer: boolean, headline: boolean } }>`
    - `applyWritingStyle(root, profile, { scopes = { writer: true, headline: true }, sampleTitles = [] } = {}) -> Promise<{ state, written: string[], removed: string[], backedUp: string[] }>`
    - `restoreDefaultStyle(root, { restoreBackup = false } = {}) -> Promise<{ state, removed: string[], restored: string[], preservedInsights: boolean }>`

- [ ] **Step 1: Write failing tests in `test/writing-style.test.js`**

Using `mkdtemp` temp workspace dirs:
- `extractInsightsSection`: extracts `## 数据复盘规则` stopping cleanly before a subsequent `## 其他说明` heading (not eating to EOF).
- `renderWriterSkill`: includes `profile` fields + preserves `# 标题`, `## 小标题`, `[可补：`, `[截图：` and neutral anti-AI baseline; re-normalizes oversized input.
- `renderHeadlineSkill`: includes `profile.headline`, `HOOK_IDS` (`A`, `B`, `C`, `D`, `other`), JSON schema contract, AND preserves an existing `## 数据复盘规则` section (without swallowing trailing `##` sections).
- **Backup & drift protection (3 cases)**:
  1. First apply over an existing hand-edited `writer.md` -> creates `writer.md.bak` and reports it in `backedUp`.
  2. User hand-edits generated `writer.md` **while keeping `managed_by` marker**, then re-applies -> hash drift detected, creates timestamped backup `writer.md.bak.<YYYYMMDD-HHmmss>` (preserving hand-edits and existing `.bak`), reports in `backedUp`.
  3. User removes `managed_by` marker when `writer.md.bak` **already exists**, then re-applies -> creates timestamped backup `writer.md.bak.<YYYYMMDD-HHmmss>` without overwriting the earlier `writer.md.bak`.
- **Scope deselection regression**: apply `{ writer: true, headline: true }`, then re-apply `{ writer: true, headline: false }` -> managed `headline.md` is removed from `<root>/skills/`, `readStyleState.scopes` is `{ writer: true, headline: false }`, and `writer.md` remains active.
- **Insights preservation across restore**: apply personal style (`writer` + `headline`) -> run `applyRule` (or write updated `## 数据复盘规则` into `<root>/skills/headline.md`) -> call `restoreDefaultStyle(root)` -> `state.active === false`, `state.scopes` is `{ writer: false, headline: false }`, `<root>/skills/writer.md` is deleted, AND `<root>/skills/headline.md` contains bundled default headline content + the **latest** `## 数据复盘规则` (without `managed_by`), while repo `skills/` files remain untouched. Also test `restoreDefaultStyle(root, { restoreBackup: true })` merges the latest `## 数据复盘规则` into the restored `.bak`.

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/opt/nodejs/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" && node --test test/writing-style.test.js`
Expected: FAIL.

- [ ] **Step 3: Export section helpers in `src/insights.js` and implement renderers/persistence in `src/writing-style.js`**

- In `src/insights.js`: add and export `extractInsightsSection(text)` using the exact same `^## 数据复盘规则\s*$` to next `^## ` loop as `replaceSection`, and export `replaceSection as replaceInsightsSection`.
- In `src/writing-style.js`:
  - `MANAGED_MARKER = 'managed_by: dsh-wechat-studio-personal-style'`.
  - `contentHash(name, text)`: for `headline`, strip `extractInsightsSection(text)` before SHA-256 so updating `## 数据复盘规则` never registers as manual drift; for `writer`, hash trimmed text.
  - `backupExistingFile(skillsDir, name, existingText)`: if `<name>.md.bak` does not exist, write `<name>.md.bak`; otherwise write `<name>.md.bak.<YYYYMMDD-HHmmss>` (with collision suffix if same second).
  - `applyWritingStyle`: re-run `normalizeStyleProfile(profile)`. For each of `['writer', 'headline']`:
    - If `scopes[name]` is `true`: if file exists on disk and (`!existing.includes(MANAGED_MARKER)` OR `contentHash(name, existing) !== saved.managedHashes?.[name]`), call `backupExistingFile`. Render new content (preserving `extractInsightsSection(existing)` for `headline`), write atomically, record new `managedHashes[name]`.
    - If `scopes[name]` is `false`: if file exists on disk AND `existing.includes(MANAGED_MARKER)` AND `contentHash(name, existing) === saved.managedHashes?.[name]`: deactivate it using the same insights-preserving rule as restore (for `headline` with `## 数据复盘规则`, write bundled `skills/headline.md` + latest insights section without `MANAGED_MARKER`; otherwise `unlink`). If user hand-edited it, leave it untouched.
  - `readStyleState(root)`: inspect disk files; `scopes[name]` is `true` iff `<skillsDir>/<name>.md` exists and contains `MANAGED_MARKER`; `active = scopes.writer || scopes.headline`.
  - `restoreDefaultStyle(root, { restoreBackup = false })`: for each managed skill file on disk, capture `latestInsights = extractInsightsSection(existing)` for `headline`; if `restoreBackup` and `.bak` exists, restore `.bak` (merging `latestInsights` via `replaceInsightsSection` if present); else if `name === 'headline' && latestInsights`, write `replaceInsightsSection(bundledHeadline, latestInsights)` (no `MANAGED_MARKER`); else `unlink`. Update `style-profile.json` with `active: false` while keeping `profile` saved for future re-editing.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/opt/homebrew/opt/nodejs/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" && node --test test/writing-style.test.js test/insights.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/insights.js src/writing-style.js test/writing-style.test.js
git commit -m "feat(style): add neutral renderers, hash-drift backups, scope cleanup, and insights-safe restore"
```

---

### Task 3: LLM Style Analyzer & Live Test-Write Preview

**Files:**
- Modify: `src/writing-style.js`
- Test: `test/writing-style.test.js`

**Interfaces:**
- Consumes: `callModel`, `extractJson` (`src/ai.js`); `buildSampleBundle`, `normalizeStyleProfile` (`src/writing-style-shared.js`); `renderWriterSkill`, `renderHeadlineSkill` (Task 2).
- Produces (exported from `src/writing-style.js`):
  - `analyzeWritingStyle(ctx, samples, { userNote = '', fixedLines = [] } = {}) -> Promise<{ profile: StyleProfile, meta: { sampleCount: number, totalChars: number, truncated: boolean, sampleTitles: string[] } }>`
  - `previewWritingStyle(ctx, profile, topic) -> Promise<{ topic: string, opening: string, titles: string[] }>`

- [ ] **Step 1: Write failing tests in `test/writing-style.test.js`**

Use the same stubbed `ctx` mock pattern as `test/host.test.js` and `test/cover.test.js`:
- `analyzeWritingStyle`: sends cleaned sample bundle + `userNote` to `callModel`, parses fenced JSON via `extractJson`, returns normalized `StyleProfile` + `meta`.
- `analyzeWritingStyle` error path: non-JSON or empty summary+voice throws 502 with `模型没有返回可用的风格分析结果，请重试。`.
- `previewWritingStyle`:
  - Defaults blank `topic` to `AI 工具真能帮普通人省时间吗？`; returns trimmed `opening` and **exact 3** non-empty `titles` (slices to 3 if model returns 4).
  - Throws 502 with `模型没有给出 3 个可用标题，请重试。` if model returns fewer than 3 non-empty titles or empty `opening`.

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/opt/nodejs/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" && node --test test/writing-style.test.js`
Expected: FAIL (`analyzeWritingStyle is not a function`).

- [ ] **Step 3: Implement `analyzeWritingStyle` and `previewWritingStyle` in `src/writing-style.js`**

- `analyzeWritingStyle`: call `buildSampleBundle`, call `callModel`, parse via `extractJson`, require non-empty `summary` or `voice`, normalize with `normalizeStyleProfile(parsed, bundle.items)`.
- `previewWritingStyle`: normalize `profile`, default empty `topic`, pass rendered writer+headline style directives to `callModel` requesting `{"opening": "...", "titles": ["...", "...", "..."]}`, parse via `extractJson`, filter non-empty trimmed strings, require `opening.length > 0` and `titles.length >= 3`, return `{ topic, opening, titles: titles.slice(0, 3) }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/opt/homebrew/opt/nodejs/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" && node --test test/writing-style.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/writing-style.js test/writing-style.test.js
git commit -m "feat(style): add LLM style analyzer and 3-title live preview"
```

---

### Task 4: Host HTTP Routes & `snapshotState` Integration

**Files:**
- Modify: `src/host.js:1-35,380-405,460-475,1120-1140`
- Test: `test/writing-style.test.js`

**Interfaces:**
- Consumes: `readStyleState`, `analyzeWritingStyle`, `previewWritingStyle`, `applyWritingStyle`, `restoreDefaultStyle`, `renderWriterSkill`, `renderHeadlineSkill` (`src/writing-style.js`); `toMarkdown` (`src/article.js`); `readSettings` (`src/settings.js`); `skillSources` (`src/ai.js`).
- Produces (HTTP routes under `/wechat-studio/`):
  - `GET style/profile` (MUST be placed **before** `const article = mustFind(...)` at `src/host.js:468`) -> `{ ...styleState, previewMarkdown: { writer, headline } | null }`
  - `POST style/analyze` -> `{ profile, meta, previewMarkdown: { writer, headline } }`
  - `POST style/preview` -> `{ topic, opening, titles, previewMarkdown: { writer, headline } }`
  - `POST style/render` -> `{ profile, previewMarkdown: { writer, headline } }` (pure, zero-LLM re-render for live Step 2 edits)
  - `POST style/apply` -> `{ state, written, removed, backedUp, skills }`
  - `POST style/restore` -> `{ state, removed, restored, preservedInsights, skills }`
  - `GET state` includes `hasPersonalStyle: boolean`.

- [ ] **Step 1: Write failing HTTP route tests in `test/writing-style.test.js`**

Test `route(deps, req, res)` directly (following `test/host.test.js`):
- **Empty workspace** (0 articles): `GET style/profile` returns 200 `{ active: false, profile: null, ... }` (does NOT fail with 404 `文章不存在`).
- `GET state` returns `hasPersonalStyle: false` initially and `true` after `POST style/apply`.
- `POST style/analyze` loads non-archived `articleIds` from `store` + `pasted`, passes `settings.fixedLines`, returns `{ profile, meta, previewMarkdown }`.
- `POST style/render` returns freshly rendered `{ profile, previewMarkdown }` reflecting edited profile fields (and current disk `## 数据复盘规则` if present).
- `POST style/preview` returns `{ topic, opening, titles, previewMarkdown }` with 3 titles.
- `POST style/apply` & `POST style/restore` return updated `state` and `skills`.

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/opt/nodejs/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" && node --test test/writing-style.test.js`
Expected: FAIL.

- [ ] **Step 3: Wire routes and `hasPersonalStyle` in `src/host.js`**

- Import style helpers from `./writing-style.js` and `normalizeStyleProfile` from `./writing-style-shared.js`.
- Add a helper `renderPreviewMarkdown(storeRoot, profile)` that reads existing `<storeRoot>/skills/headline.md` (if any) so `headline` preview includes any existing `## 数据复盘规则`.
- In `snapshotState`: add `readStyleState(store.root)` to `Promise.all` and return `hasPersonalStyle: styleState.active`.
- Place `if (path === 'style/profile')` in the `if (get)` block **right after** `if (path === 'skills')` (before `mustFind`).
- Add `style/analyze`, `style/render`, `style/preview`, `style/apply`, `style/restore` to the `POST` switch.

- [ ] **Step 4: Run tests to verify pass**

Run: `export PATH="/opt/homebrew/opt/nodejs/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" && node --test test/writing-style.test.js test/host.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/host.js test/writing-style.test.js
git commit -m "feat(style): add /wechat-studio/style/* routes and hasPersonalStyle state"
```

---

### Task 5: Client State Helpers & 3-Step Wizard (`client/writing-style.jsx`)

**Files:**
- Modify: `client/state.js:10-15,220-235`
- Create: `client/writing-style.jsx`

**Interfaces:**
- Consumes: Task 4 HTTP routes; `pickableStyleArticles` from `../src/writing-style-shared.js`; `useStudio`, `setState`, `toast`, `refresh`, `loadSkills` from `./state.js`.
- Produces:
  - `client/state.js`: `style: null`, `styleWizardStep: 1` in `snap` + `openStyleWizard(step = 1)`, `loadStyleProfile()`, `analyzeStyle(payload)`, `previewStyle(payload)`, `renderStyleMarkdown(profile)`, `applyStyle(payload)`, `restoreStyle(options)`.
  - `client/writing-style.jsx`:
    - `WritingStyleCard()` — top card in `SkillsView` showing current state (built-in default vs. personal style summary + sample count + updated date) and plain Chinese actions (`导入文章，生成我的风格` / `微调风格` / `重新学习` / `恢复默认风格`).
    - `WritingStyleWizard()` — rendered when `dialog === 'style-wizard'`:
      - Step 1 (**投喂参考文章**): checkboxes of `pickableStyleArticles(data.articles)`, `.md`/`.txt` drag-drop/file picker, pasted articles list (`+ 再加一篇`), soft hint `建议 3–5 篇，1 篇也能开始`, optional one-line preference input.
      - Step 2 (**风格体检卡 & 现场试写**): editable cards/chips for all `StyleProfile` fields; **「现场试写」** panel showing opening + 3 titles; collapsible `<details>` for `writer.md`/`headline.md` that marks preview stale on any profile edit and auto-calls `renderStyleMarkdown(draftProfile)` when expanded (or via `刷新预览` button) so it never shows outdated Markdown.
      - Step 3 (**一键启用**): checkboxes for `写正文与对话改稿` and `出标题与摘要`, clear note that pre-existing custom files are backed up automatically, primary button `启用我的写作风格`.

- [ ] **Step 1: Add `style` state helpers to `client/state.js`**

Add `style: null, styleWizardStep: 1` to `snap`, plus `openStyleWizard(step = 1)` (sets `{ dialog: 'style-wizard', styleWizardStep: step }` and kicks off `loadStyleProfile()`), `loadStyleProfile`, `analyzeStyle`, `previewStyle`, `renderStyleMarkdown`, `applyStyle` (syncs `style`, `skills`, and `refresh()`), and `restoreStyle` (syncs `style`, `skills`, `refresh()`, toasts `已恢复内置默认风格`).

- [ ] **Step 2: Create `client/writing-style.jsx`**

Implement `WritingStyleCard` and `WritingStyleWizard` importing ONLY from `react`, `./state.js`, and `../src/writing-style-shared.js`. Ensure Escape closes the modal, buttons show Chinese loading states during requests, and Step 2's collapsible Markdown preview refreshes via `renderStyleMarkdown` whenever stale and opened.

- [ ] **Step 3: Verify browser bundle compiles cleanly**

Run: `export PATH="/opt/homebrew/opt/nodejs/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" && npm run build`
Expected: `npm run build` exits 0 with no Node-builtin import errors.

- [ ] **Step 4: Commit**

```bash
git add client/state.js client/writing-style.jsx dist/client.js
git commit -m "feat(style): add client state helpers and 3-step writing style wizard"
```

---

### Task 6: Wire Entry Points in `client/app.jsx`, Add CSS, Verify & Update Docs

**Files:**
- Modify: `client/app.jsx` (`Studio`, `SkillsView`, `NewDialog`)
- Modify: `client/styles.css`
- Modify: `README.md`
- Output: `dist/client.js` (via `npm run build`)

**Interfaces:**
- Consumes: `WritingStyleCard`, `WritingStyleWizard` (`client/writing-style.jsx`); `loadStyleProfile`, `openStyleWizard`, `useStudio` (`client/state.js`).
- Produces: Single top-level `<WritingStyleWizard />` mount in `Studio`, `<WritingStyleCard />` at top of `SkillsView`, subtle default-style link in `NewDialog`, full styles, built `dist/client.js`, updated `README.md`.

- [ ] **Step 1: Wire `WritingStyleWizard`, `WritingStyleCard`, and `NewDialog` in `client/app.jsx`**

- In top-level `Studio`: mount `{dialog === 'style-wizard' && <WritingStyleWizard />}` alongside the other modals so it opens directly from any view (`SkillsView` or `NewDialog`).
- In `SkillsView`: call `loadStyleProfile()` alongside `loadSkills()` on mount, and render `<WritingStyleCard />` at the top above the skill list.
- In `NewDialog` (`从选题写` tab): when `!data?.hasPersonalStyle`, render a subtle one-line footer prompt `当前按内置默认风格写作 · 生成我的风格` calling `openStyleWizard(1)`.

- [ ] **Step 2: Add styles in `client/styles.css`**

Style `.ws-style-card`, `.ws-style-wizard` (respecting `.ws-scrim` desktop titlebar clearance and `max-height: min(100%, 720px)` with scrollable body), step pills, `.ws-chip-list` / `.ws-chip`, `.ws-dropzone`, and `.ws-style-preview` matching the studio's warm paper palette.

- [ ] **Step 3: Build frontend bundle and run full test suite**

Run: `export PATH="/opt/homebrew/opt/nodejs/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" && npm run build && npm test`
Expected: `npm run build` succeeds; all tests pass with 0 failures.

- [ ] **Step 4: Update `README.md`**

Add a concise section explaining「我的写作风格」: importing past articles, editing the style card, live test-writing, and one-click restore to default.

- [ ] **Step 5: Commit**

```bash
git add client/app.jsx client/styles.css dist/client.js README.md
git commit -m "feat(style): wire writing style entry points, styles, and docs"
```
