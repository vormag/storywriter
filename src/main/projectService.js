import { dialog } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { CONVERSATIONS_DIRECTORY, PROJECT_MARKER, SUMMARIES_DIRECTORY } from './constants.js'
import {
  getWorkspacePreferences,
  updateRecent,
  updateWorkspacePreferences as saveWorkspacePreferences
} from './settingsService.js'
import { atomicWrite, pathExists, readJson } from './storage.js'
import { normalizeRelative, slugify } from './utils.js'

let activeRoot = null
let activeProject = null
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'])

export function getActiveRoot() {
  if (!activeRoot) throw new Error('No project is open.')
  return activeRoot
}

export function resolveProjectPath(relativePath) {
  const root = getActiveRoot()
  const relative = normalizeRelative(relativePath)
  const resolved = path.resolve(root, relative)
  const rootPrefix = `${path.resolve(root)}${path.sep}`
  if (resolved !== path.resolve(root) && !resolved.startsWith(rootPrefix)) {
    throw new Error('The requested path is outside the project.')
  }
  return resolved
}

function titleFromMarkdown(markdown, fallback) {
  const match = String(markdown).match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() || fallback
}

async function markdownTitle(absolutePath, fallback) {
  try {
    return titleFromMarkdown(await fs.readFile(absolutePath, 'utf8'), fallback)
  } catch {
    return fallback
  }
}

async function scanLoreDirectory(absoluteDirectory, relativeDirectory) {
  const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true })
  const result = []
  for (const entry of entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true })
  })) {
    if (entry.name.startsWith('.')) continue
    const relativePath = `${relativeDirectory}/${entry.name}`
    const absolutePath = path.join(absoluteDirectory, entry.name)
    if (entry.isDirectory()) {
      result.push({
        id: relativePath,
        path: relativePath,
        label: entry.name.replaceAll('_', ' '),
        kind: 'folder',
        children: await scanLoreDirectory(absolutePath, relativePath)
      })
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      const fallback = path.basename(entry.name, '.md').replaceAll('_', ' ')
      result.push({
        id: relativePath,
        path: relativePath,
        label: await markdownTitle(absolutePath, fallback),
        kind: 'lore'
      })
    }
  }
  return result
}

async function scanAgentsDirectory(absoluteDirectory) {
  const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true })
  const result = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue
    const relativePath = `agents/${entry.name}`
    const config = await readJson(path.join(absoluteDirectory, entry.name), null)
    result.push({
      id: relativePath,
      path: relativePath,
      label: String(config?.name || path.basename(entry.name, '.json')).trim(),
      kind: 'agent'
    })
  }
  return result
}

async function scanAssetsDirectory(absoluteDirectory, relativeDirectory = 'assets') {
  await fs.mkdir(absoluteDirectory, { recursive: true })
  const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true })
  const result = []
  for (const entry of entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true })
  })) {
    if (entry.name.startsWith('.')) continue
    const relativePath = `${relativeDirectory}/${entry.name}`
    const absolutePath = path.join(absoluteDirectory, entry.name)
    if (entry.isDirectory()) {
      result.push({
        id: relativePath,
        path: relativePath,
        label: entry.name.replaceAll('_', ' '),
        kind: 'asset-folder',
        children: await scanAssetsDirectory(absolutePath, relativePath)
      })
    } else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      result.push({
        id: relativePath,
        path: relativePath,
        label: entry.name,
        kind: 'asset'
      })
    }
  }
  return result
}

async function buildProjectSnapshot() {
  const root = getActiveRoot()
  if (!activeProject) throw new Error('No project is open.')
  const storyDirectory = path.join(root, 'story')
  const loreDirectory = path.join(root, 'lore')
  const agentsDirectory = path.join(root, 'agents')
  const assetsDirectory = path.join(root, 'assets')
  const storyEntries = await fs.readdir(storyDirectory, { withFileTypes: true })
  const story = []
  for (const entry of storyEntries) {
    const match = entry.isFile() && entry.name.match(/^chapter_(\d+)\.md$/i)
    if (!match) continue
    const relativePath = `story/${entry.name}`
    story.push({
      id: relativePath,
      path: relativePath,
      index: Number(match[1]),
      label: await markdownTitle(path.join(storyDirectory, entry.name), `Chapter ${Number(match[1])}`),
      kind: 'chapter'
    })
  }
  story.sort((a, b) => a.index - b.index)
  return {
    root,
    title: activeProject.title,
    marker: activeProject,
    preferences: await getWorkspacePreferences(root),
    tree: {
      story,
      lore: await scanLoreDirectory(loreDirectory, 'lore'),
      agents: await scanAgentsDirectory(agentsDirectory),
      assets: await scanAssetsDirectory(assetsDirectory),
      timeline: {
        id: 'TIMELINE.md',
        path: 'TIMELINE.md',
        label: 'Timeline',
        kind: 'timeline'
      }
    }
  }
}

function createProjectMarker(root, title) {
  return {
    schemaVersion: 1,
    id: randomUUID(),
    title: String(title || '').trim() || path.basename(root),
    createdAt: new Date().toISOString(),
    page: {
      format: 'A4',
      marginsMm: { top: 25, right: 25, bottom: 25, left: 25 }
    },
    typography: { fontFamily: 'Literata', baseSize: 16 }
  }
}

async function initializeProject(root, title) {
  const markerPath = path.join(root, PROJECT_MARKER)
  const marker = createProjectMarker(root, title)
  const storyDirectory = path.join(root, 'story')

  await fs.mkdir(storyDirectory, { recursive: true })
  await fs.mkdir(path.join(root, 'lore'), { recursive: true })
  await fs.mkdir(path.join(root, 'agents'), { recursive: true })
  await fs.mkdir(path.join(root, 'assets'), { recursive: true })
  await fs.mkdir(path.join(root, CONVERSATIONS_DIRECTORY), { recursive: true })
  await fs.mkdir(path.join(root, SUMMARIES_DIRECTORY), { recursive: true })

  const storyEntries = await fs.readdir(storyDirectory, { withFileTypes: true })
  const hasChapter = storyEntries.some(entry => entry.isFile() && /^chapter_\d+\.md$/i.test(entry.name))
  if (!hasChapter) {
    await atomicWrite(path.join(storyDirectory, 'chapter_001.md'), '# Chapter 1\n\n')
  }
  if (!(await pathExists(path.join(root, 'TIMELINE.md')))) {
    await atomicWrite(
      path.join(root, 'TIMELINE.md'),
      '| Date | Time | Event | Lore |\n| --- | --- | --- | --- |\n'
    )
  }

  await atomicWrite(markerPath, `${JSON.stringify(marker, null, 2)}\n`)
  return marker
}

export async function activateProject(root) {
  const absoluteRoot = path.resolve(root)
  const markerPath = path.join(absoluteRoot, PROJECT_MARKER)
  const rootStat = await fs.stat(absoluteRoot).catch(() => null)
  if (!rootStat?.isDirectory()) throw new Error('The selected project folder does not exist.')

  const markerExists = await pathExists(markerPath)
  const marker = markerExists
    ? await readJson(markerPath, null)
    : await initializeProject(absoluteRoot)
  if (!marker || marker.schemaVersion !== 1 || !marker.title) {
    throw new Error('The existing .storywriter_project.json file is invalid.')
  }
  await fs.mkdir(path.join(absoluteRoot, 'agents'), { recursive: true })
  await fs.mkdir(path.join(absoluteRoot, 'assets'), { recursive: true })
  await fs.mkdir(path.join(absoluteRoot, CONVERSATIONS_DIRECTORY), { recursive: true })
  await fs.mkdir(path.join(absoluteRoot, SUMMARIES_DIRECTORY), { recursive: true })
  for (const required of ['story', 'lore', 'agents', 'assets']) {
    const stat = await fs.stat(path.join(absoluteRoot, required)).catch(() => null)
    if (!stat?.isDirectory()) throw new Error(`Project folder is missing: ${required}`)
  }
  if (!(await pathExists(path.join(absoluteRoot, 'TIMELINE.md')))) {
    throw new Error('Project file is missing: TIMELINE.md')
  }
  activeRoot = absoluteRoot
  activeProject = marker
  await updateRecent(activeRoot, activeProject)
  return buildProjectSnapshot()
}

export async function refreshProject() {
  return buildProjectSnapshot()
}

export async function getStoryExportData() {
  const snapshot = await buildProjectSnapshot()
  const chapters = []
  for (const chapter of snapshot.tree.story) {
    chapters.push({
      path: chapter.path,
      title: chapter.label,
      content: await fs.readFile(resolveProjectPath(chapter.path), 'utf8')
    })
  }
  return {
    root: snapshot.root,
    title: snapshot.title,
    page: snapshot.marker.page,
    typography: snapshot.marker.typography,
    chapters
  }
}

export async function chooseAndOpenProject(mainWindow) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Storywriter project',
    properties: ['openDirectory']
  })
  if (result.canceled) return null
  return activateProject(result.filePaths[0])
}

export async function chooseAndCreateProject(mainWindow, title) {
  const properties = ['openDirectory']
  if (process.platform === 'darwin') properties.push('createDirectory')
  if (process.platform === 'win32') properties.push('promptToCreate')
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose the new project folder',
    buttonLabel: 'Use this folder',
    properties
  })
  if (result.canceled) return null
  const root = path.resolve(result.filePaths[0])
  if (await pathExists(path.join(root, PROJECT_MARKER))) {
    throw new Error('That folder is already a Storywriter project.')
  }
  await initializeProject(root, title)
  return activateProject(root)
}

export async function updateWorkspacePreferences(payload) {
  if (!activeProject) throw new Error('No project is open.')
  return saveWorkspacePreferences(getActiveRoot(), payload)
}

export async function updateProjectTypography(payload = {}) {
  const root = getActiveRoot()
  if (!activeProject) throw new Error('No project is open.')
  const current = activeProject.typography ?? { fontFamily: 'Literata', baseSize: 16 }
  const fontFamily = String(payload.fontFamily ?? current.fontFamily).trim()
  const baseSize = Math.round(Number(payload.baseSize ?? current.baseSize))
  if (!fontFamily || fontFamily.length > 80) throw new Error('Invalid font family.')
  if (!Number.isFinite(baseSize) || baseSize < 8 || baseSize > 32) {
    throw new Error('Base font size must be between 8 and 32.')
  }
  activeProject = { ...activeProject, typography: { fontFamily, baseSize } }
  await atomicWrite(
    path.join(root, PROJECT_MARKER),
    `${JSON.stringify(activeProject, null, 2)}\n`
  )
  return buildProjectSnapshot()
}

export async function createEntry(payload) {
  const kind = payload?.kind
  if (kind === 'chapter') {
    const snapshot = await buildProjectSnapshot()
    const next = Math.max(0, ...snapshot.tree.story.map(item => item.index)) + 1
    const filename = `chapter_${String(next).padStart(3, '0')}.md`
    const relativePath = `story/${filename}`
    await atomicWrite(resolveProjectPath(relativePath), `# ${payload.title?.trim() || `Chapter ${next}`}\n\n`)
    return { path: relativePath, project: await buildProjectSnapshot() }
  }

  if (kind === 'category') {
    const relativePath = `lore/${slugify(payload.title)}`
    const target = resolveProjectPath(relativePath)
    if (await pathExists(target)) throw new Error('That lore category already exists.')
    await fs.mkdir(target, { recursive: false })
    return { path: relativePath, project: await buildProjectSnapshot() }
  }

  if (kind === 'lore') {
    const category = normalizeRelative(payload.category || 'lore/notes')
    if (category !== 'lore' && !category.startsWith('lore/')) {
      throw new Error('Lore pages must be created inside the lore folder.')
    }
    const categoryPath = resolveProjectPath(category)
    await fs.mkdir(categoryPath, { recursive: true })
    const relativePath = `${category}/${slugify(payload.title)}.md`
    const target = resolveProjectPath(relativePath)
    if (await pathExists(target)) throw new Error('That lore page already exists.')
    await atomicWrite(target, `# ${String(payload.title || 'Untitled').trim()}\n\n`)
    return { path: relativePath, project: await buildProjectSnapshot() }
  }

  if (kind === 'agent') {
    const name = String(payload.title || 'New agent').trim()
    const relativePath = `agents/${slugify(name)}.json`
    const target = resolveProjectPath(relativePath)
    if (await pathExists(target)) throw new Error('That agent already exists.')
    await atomicWrite(target, `${JSON.stringify({
      name,
      systemPrompt: '',
      model: 'gpt-5.6-terra',
      reasoning: 'medium',
      tools: []
    }, null, 2)}\n`)
    return { path: relativePath, project: await buildProjectSnapshot() }
  }

  throw new Error('Unsupported project entry type.')
}

async function collectMarkdownFiles(directory = getActiveRoot()) {
  const files = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await collectMarkdownFiles(absolute)))
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(absolute)
  }
  return files
}

const MAX_SEARCH_RESULTS = 250

async function collectSearchableFiles(directory = getActiveRoot()) {
  const files = []
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectSearchableFiles(absolute))
      continue
    }
    const relative = normalizeRelative(path.relative(getActiveRoot(), absolute))
    const searchable = entry.name.toLowerCase().endsWith('.md') || /^agents\/[^/]+\.json$/i.test(relative)
    if (entry.isFile() && searchable) files.push({ absolute, relative })
  }
  return files
}

export async function searchProject(query) {
  const value = String(query ?? '')
  if (!value.trim()) return { query: value, matches: [], truncated: false }
  if (value.length > 500) throw new Error('Search queries are limited to 500 characters.')

  const needle = value.toLocaleLowerCase()
  const matches = []
  let truncated = false
  for (const file of await collectSearchableFiles()) {
    const lines = (await fs.readFile(file.absolute, 'utf8')).split(/\r\n|\n|\r/)
    let occurrence = 0
    for (let index = 0; index < lines.length; index += 1) {
      const haystack = lines[index].toLocaleLowerCase()
      const firstMatch = haystack.indexOf(needle)
      if (firstMatch === -1) continue
      const matchCount = haystack.split(needle).length - 1
      matches.push({ path: file.relative, line: index + 1, text: lines[index], occurrence: occurrence + 1 })
      occurrence += matchCount
      if (matches.length >= MAX_SEARCH_RESULTS) {
        truncated = true
        break
      }
    }
    if (truncated) break
  }
  return { query: value, matches, truncated }
}

async function rewriteRelativeLinks(oldRelative, newRelative) {
  const oldPath = normalizeRelative(oldRelative)
  const newPath = normalizeRelative(newRelative)
  for (const file of await collectMarkdownFiles()) {
    const current = await fs.readFile(file, 'utf8')
    const updated = current.replaceAll(`](${oldPath})`, `](${newPath})`)
    if (updated !== current) await atomicWrite(file, updated)
  }
}

export async function renameEntry(payload) {
  const relativePath = normalizeRelative(payload.path)
  const newName = String(payload.newName || '').trim()
  if (!newName) throw new Error('A name is required.')
  if (relativePath === 'TIMELINE.md') throw new Error('Timeline cannot be renamed.')

  if (/^story\/chapter_\d+\.md$/i.test(relativePath)) {
    const target = resolveProjectPath(relativePath)
    const current = await fs.readFile(target, 'utf8')
    const updated = /^#\s+.+$/m.test(current)
      ? current.replace(/^#\s+.+$/m, `# ${newName}`)
      : `# ${newName}\n\n${current}`
    await atomicWrite(target, updated)
    return { path: relativePath, project: await buildProjectSnapshot() }
  }

  if (/^agents\/[^/]+\.json$/i.test(relativePath)) {
    const target = resolveProjectPath(relativePath)
    const nextRelative = `agents/${slugify(newName)}.json`
    const nextTarget = resolveProjectPath(nextRelative)
    if (nextRelative !== relativePath && await pathExists(nextTarget)) {
      throw new Error('An agent with that name already exists.')
    }
    const config = await readJson(target, {})
    if (nextRelative !== relativePath) await fs.rename(target, nextTarget)
    await atomicWrite(nextTarget, `${JSON.stringify({ ...config, name: newName }, null, 2)}\n`)
    return { path: nextRelative, project: await buildProjectSnapshot() }
  }

  if (/^assets\//i.test(relativePath) && IMAGE_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) {
    const target = resolveProjectPath(relativePath)
    const extension = path.extname(relativePath)
    const parent = path.posix.dirname(relativePath)
    const nextRelative = `${parent}/${slugify(newName)}${extension}`
    const nextTarget = resolveProjectPath(nextRelative)
    if (nextRelative !== relativePath && await pathExists(nextTarget)) {
      throw new Error('An asset with that name already exists.')
    }
    if (nextRelative !== relativePath) await fs.rename(target, nextTarget)
    await rewriteRelativeLinks(relativePath, nextRelative)
    return { path: nextRelative, project: await buildProjectSnapshot() }
  }

  const target = resolveProjectPath(relativePath)
  const stat = await fs.stat(target)
  const parent = path.posix.dirname(relativePath)
  const nextBase = stat.isDirectory() ? slugify(newName) : `${slugify(newName)}.md`
  const nextRelative = `${parent}/${nextBase}`
  const nextTarget = resolveProjectPath(nextRelative)
  if (await pathExists(nextTarget)) throw new Error('An item with that name already exists.')
  await fs.rename(target, nextTarget)
  if (stat.isFile()) {
    const current = await fs.readFile(nextTarget, 'utf8')
    const updated = /^#\s+.+$/m.test(current)
      ? current.replace(/^#\s+.+$/m, `# ${newName}`)
      : `# ${newName}\n\n${current}`
    await atomicWrite(nextTarget, updated)
  }
  await rewriteRelativeLinks(relativePath, nextRelative)
  return { path: nextRelative, project: await buildProjectSnapshot() }
}

export async function deleteEntry(relativePath) {
  const relative = normalizeRelative(relativePath)
  if (relative === 'TIMELINE.md' || relative === 'story' || relative === 'lore' || relative === 'agents' || relative === 'assets') {
    throw new Error('That project item cannot be deleted.')
  }
  await fs.rm(resolveProjectPath(relative), { recursive: true, force: false })
  return buildProjectSnapshot()
}

export async function readDocument(relativePath) {
  const relative = normalizeRelative(relativePath)
  const isMarkdown = relative.toLowerCase().endsWith('.md')
  const isAgent = relative.startsWith('agents/') && relative.toLowerCase().endsWith('.json')
  const isAsset = relative.startsWith('assets/') && IMAGE_EXTENSIONS.has(path.extname(relative).toLowerCase())
  if (isAsset) {
    await fs.access(resolveProjectPath(relative))
    await updateRecent(getActiveRoot(), activeProject, relative)
    return { path: relative, content: '', kind: 'asset' }
  }
  if (!isMarkdown && !isAgent) throw new Error('That project document cannot be opened.')
  const content = await fs.readFile(resolveProjectPath(relative), 'utf8')
  await updateRecent(getActiveRoot(), activeProject, relative)
  return { path: relative, content }
}

export async function writeDocument(payload) {
  const relative = normalizeRelative(payload.path)
  const isMarkdown = relative.toLowerCase().endsWith('.md')
  const isAgent = relative.startsWith('agents/') && relative.toLowerCase().endsWith('.json')
  if (!isMarkdown && !isAgent) throw new Error('That project document cannot be saved.')
  const content = String(payload.content ?? '')
  if (isAgent) {
    const config = JSON.parse(content)
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid agent configuration.')
  }
  await atomicWrite(resolveProjectPath(relative), content)
  await updateRecent(getActiveRoot(), activeProject, relative)
  return { savedAt: new Date().toISOString() }
}

function safeAssetFilename(value, fallback = 'image') {
  const parsed = path.parse(String(value || fallback))
  const extension = IMAGE_EXTENSIONS.has(parsed.ext.toLowerCase()) ? parsed.ext.toLowerCase() : '.jpg'
  return `${slugify(parsed.name || fallback)}${extension}`
}

async function uniqueAssetPath(filename) {
  await fs.mkdir(resolveProjectPath('assets'), { recursive: true })
  const parsed = path.parse(safeAssetFilename(filename))
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index ? `_${index + 1}` : ''
    const relative = `assets/${parsed.name}${suffix}${parsed.ext}`
    if (!await pathExists(resolveProjectPath(relative))) return relative
  }
  throw new Error('Could not create a unique asset filename.')
}

export async function chooseAndImportAssets(mainWindow) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Add images to assets',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: [...IMAGE_EXTENSIONS].map(extension => extension.slice(1)) }]
  })
  if (result.canceled || !result.filePaths.length) return { assets: [], project: await buildProjectSnapshot() }

  const assets = []
  for (const filePath of result.filePaths) {
    const extension = path.extname(filePath).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(extension)) continue
    const relative = await uniqueAssetPath(path.basename(filePath))
    await fs.copyFile(filePath, resolveProjectPath(relative))
    assets.push({ path: relative, label: path.basename(relative), kind: 'asset' })
  }
  return { assets, project: await buildProjectSnapshot() }
}
