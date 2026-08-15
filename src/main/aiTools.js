import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { SUMMARIES_DIRECTORY } from './constants.js'
import { resolveProjectPath } from './projectService.js'
import { atomicWrite, pathExists, readJson } from './storage.js'
import { normalizeRelative } from './utils.js'

const MAX_READ_LINES = 500
const MAX_FIND_RESULTS = 100
const TOOL_NAMES = new Set([
  'list',
  'find',
  'read',
  'write_story',
  'write_lore',
  'add_timeline_event',
  'remove_timeline_event',
  'edit_timeline_event',
  'select_range',
  'get_summary'
])

let eventSink = () => {}

export function configureAiToolEvents(sink) {
  eventSink = typeof sink === 'function' ? sink : () => {}
}

function notify(type, payload) {
  eventSink(type, payload)
}

function markdownPath(value, scopes = ['story', 'lore']) {
  const relative = normalizeRelative(value)
  if (relative.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('Path contains an invalid segment.')
  }
  const inScope = scopes.some(scope => relative.startsWith(`${scope}/`))
  if (!inScope || !relative.toLowerCase().endsWith('.md') || relative.includes('\0')) {
    throw new Error(`Path must be a Markdown file inside ${scopes.join(' or ')}.`)
  }
  resolveProjectPath(relative)
  return relative
}

function storyPath(value) {
  const relative = markdownPath(value, ['story'])
  if (!/^story\/chapter_\d+\.md$/i.test(relative)) {
    throw new Error('Story files must be named story/chapter_{number}.md.')
  }
  return relative
}

function directoryPath(value) {
  const relative = normalizeRelative(value).replace(/\/+$/, '')
  if (relative.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('Directory contains an invalid segment.')
  }
  if (!/^(story|lore)(\/.*)?$/i.test(relative) || relative.includes('\0')) {
    throw new Error('Directory must be story, lore, or a folder inside one of them.')
  }
  resolveProjectPath(relative)
  return relative
}

function contentLines(content) {
  const normalized = String(content).replaceAll('\r\n', '\n')
  if (!normalized) return []
  const lines = normalized.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

async function collectMarkdown(relativeDirectory, recursive = true) {
  const absoluteDirectory = resolveProjectPath(relativeDirectory)
  const entries = await fs.readdir(absoluteDirectory, { withFileTypes: true })
  const result = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))) {
    if (entry.name.startsWith('.')) continue
    const relative = `${relativeDirectory}/${entry.name}`
    if (entry.isDirectory()) {
      result.push({ path: relative, type: 'folder' })
      if (recursive) result.push(...await collectMarkdown(relative, true))
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      result.push({ path: relative, type: 'file' })
    }
  }
  return result
}

function tool(name, description, properties, required = []) {
  return {
    type: 'function',
    name,
    description,
    parameters: {
      type: 'object',
      properties,
      required,
      additionalProperties: false
    }
  }
}

const DEFINITIONS = {
  list: tool('list', 'List Markdown files and folders in story or lore.', {
    directory: { type: 'string', description: 'Project-relative directory: story, lore, or a subfolder within either.' },
    recursive: { type: 'boolean', description: 'Whether to include nested contents. Defaults to true.' }
  }, ['directory']),
  find: tool('find', 'Search for literal text in story and lore Markdown files and return matching lines.', {
    query: { type: 'string', description: 'Literal text to search for.' },
    directory: { type: 'string', description: 'Optional story/lore directory to limit the search.' },
    case_sensitive: { type: 'boolean', description: 'Defaults to false.' },
    max_results: { type: 'integer', minimum: 1, maximum: MAX_FIND_RESULTS, description: 'Maximum matches to return.' }
  }, ['query']),
  read: tool('read', 'Read an inclusive 1-based line range from a story or lore Markdown file. The result always includes the total line count.', {
    path: { type: 'string', description: 'Project-relative story or lore Markdown path.' },
    start_line: { type: 'integer', minimum: 1, description: 'First line to read, inclusive.' },
    end_line: { type: 'integer', minimum: 1, description: `Last line to read, inclusive. At most ${MAX_READ_LINES} lines per call.` }
  }, ['path', 'start_line', 'end_line']),
  write_story: tool('write_story', 'Create a chapter or replace all or a line range in an existing story chapter. For a new file, content becomes the complete file and line fields are ignored. For an existing file, omit both line fields to replace the whole file. To insert before a line, set end_line to start_line - 1.', {
    path: { type: 'string', description: 'Path matching story/chapter_{number}.md.' },
    content: { type: 'string', description: 'Markdown content to write.' },
    start_line: { type: 'integer', minimum: 1, description: 'Optional first line of an inclusive replacement.' },
    end_line: { type: 'integer', minimum: 0, description: 'Optional last line of an inclusive replacement.' }
  }, ['path', 'content']),
  write_lore: tool('write_lore', 'Create a lore page or replace all or a line range in an existing lore file. For a new file, content becomes the complete file and line fields are ignored. For an existing file, omit both line fields to replace the whole file. To insert before a line, set end_line to start_line - 1.', {
    path: { type: 'string', description: 'Markdown path inside lore.' },
    content: { type: 'string', description: 'Markdown content to write.' },
    start_line: { type: 'integer', minimum: 1, description: 'Optional first line of an inclusive replacement.' },
    end_line: { type: 'integer', minimum: 0, description: 'Optional last line of an inclusive replacement.' }
  }, ['path', 'content']),
  add_timeline_event: tool('add_timeline_event', 'Add an event to TIMELINE.md and automatically order events by date and optional time.', {
    date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Required calendar date in YYYY-MM-DD format.' },
    time: { type: 'string', pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$', description: 'Optional 24-hour time in HH:mm format.' },
    event: { type: 'string' },
    lore: { type: 'string', description: 'Optional lore Markdown path.' }
  }, ['date', 'event']),
  remove_timeline_event: tool('remove_timeline_event', 'Remove the single timeline row whose event name exactly matches.', {
    event: { type: 'string', description: 'Exact event name.' }
  }, ['event']),
  edit_timeline_event: tool('edit_timeline_event', 'Edit the single timeline row whose event name exactly matches and automatically order events by date and optional time.', {
    event: { type: 'string', description: 'Current exact event name.' },
    date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Replacement date in YYYY-MM-DD format.' },
    time: { type: 'string', description: 'Replacement optional 24-hour time in HH:mm format; use an empty string to clear it.' },
    new_event: { type: 'string', description: 'Replacement event name.' },
    lore: { type: 'string', description: 'Replacement lore path; use an empty string to clear it.' }
  }, ['event']),
  select_range: tool('select_range', 'Open a story or lore file, select exact visible text in the editor, and scroll it into view. Use text without Markdown formatting markers.', {
    path: { type: 'string', description: 'Project-relative story or lore Markdown path.' },
    text: { type: 'string', description: 'Exact visible text to select.' },
    occurrence: { type: 'integer', minimum: 1, description: 'Which occurrence to select. Defaults to 1.' }
  }, ['path', 'text']),
  get_summary: tool('get_summary', 'Get a cached summary of a story or lore file. A stale or missing summary is regenerated automatically.', {
    path: { type: 'string', description: 'Project-relative story or lore Markdown path.' }
  }, ['path'])
}

export function getAiToolDefinitions(names) {
  const selected = [...new Set(Array.isArray(names) ? names.map(String) : [])]
  return selected.filter(name => TOOL_NAMES.has(name)).map(name => DEFINITIONS[name])
}

async function listFiles(args) {
  const directory = directoryPath(args.directory)
  const absolute = resolveProjectPath(directory)
  const stat = await fs.stat(absolute).catch(() => null)
  if (!stat?.isDirectory()) throw new Error(`Directory not found: ${directory}`)
  return { directory, entries: await collectMarkdown(directory, args.recursive !== false) }
}

async function findText(args) {
  const query = String(args.query ?? '')
  if (!query) throw new Error('Search query cannot be empty.')
  const directories = args.directory ? [directoryPath(args.directory)] : ['story', 'lore']
  const maxResults = Math.min(MAX_FIND_RESULTS, Math.max(1, Number(args.max_results) || 50))
  const needle = args.case_sensitive ? query : query.toLocaleLowerCase()
  const matches = []
  let filesSearched = 0
  let truncated = false
  for (const directory of directories) {
    const files = (await collectMarkdown(directory, true)).filter(item => item.type === 'file')
    for (const file of files) {
      filesSearched += 1
      const lines = contentLines(await fs.readFile(resolveProjectPath(file.path), 'utf8'))
      for (let index = 0; index < lines.length; index += 1) {
        const haystack = args.case_sensitive ? lines[index] : lines[index].toLocaleLowerCase()
        if (!haystack.includes(needle)) continue
        if (matches.length >= maxResults) {
          truncated = true
          break
        }
        matches.push({ path: file.path, line: index + 1, text: lines[index] })
      }
      if (truncated) break
    }
    if (truncated) break
  }
  return { query, matches, metadata: { filesSearched, truncated, maxResults } }
}

async function readRange(args) {
  const relative = markdownPath(args.path)
  const lines = contentLines(await fs.readFile(resolveProjectPath(relative), 'utf8'))
  const start = Number(args.start_line)
  const requestedEnd = Number(args.end_line)
  if (!Number.isInteger(start) || !Number.isInteger(requestedEnd) || requestedEnd < start) {
    throw new Error('Provide a valid inclusive line range.')
  }
  if (requestedEnd - start + 1 > MAX_READ_LINES) throw new Error(`A read is limited to ${MAX_READ_LINES} lines.`)
  if (start > Math.max(1, lines.length)) throw new Error(`start_line exceeds the file's ${lines.length} lines.`)
  const end = Math.min(requestedEnd, lines.length)
  return {
    path: relative,
    content: lines.slice(start - 1, end).join('\n'),
    metadata: { startLine: start, endLine: end, totalLines: lines.length }
  }
}

async function writeMarkdown(args, scope) {
  const relative = scope === 'story' ? storyPath(args.path) : markdownPath(args.path, ['lore'])
  const target = resolveProjectPath(relative)
  const exists = await pathExists(target)
  const hasStart = args.start_line !== undefined
  const hasEnd = args.end_line !== undefined
  if (exists && hasStart !== hasEnd) throw new Error('Provide both start_line and end_line, or neither.')

  let nextContent = String(args.content ?? '').replaceAll('\r\n', '\n')
  if (exists && hasStart) {
    const currentLines = contentLines(await fs.readFile(target, 'utf8'))
    const start = Number(args.start_line)
    const end = Number(args.end_line)
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start - 1 || end > currentLines.length || start > currentLines.length + 1) {
      throw new Error(`Invalid replacement range for a file with ${currentLines.length} lines.`)
    }
    currentLines.splice(start - 1, end - start + 1, ...contentLines(nextContent))
    nextContent = currentLines.length ? `${currentLines.join('\n')}\n` : ''
  }
  await atomicWrite(target, nextContent)
  notify('project-changed', { path: relative })
  return { path: relative, created: !exists, metadata: { totalLines: contentLines(nextContent).length } }
}

function splitTableRow(line) {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells = []
  let current = ''
  let escaped = false
  for (const character of inner) {
    if (escaped) {
      current += character
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += character
    }
  }
  cells.push(current.trim())
  return cells
}

function tableCell(value) {
  return String(value ?? '').replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('\n', ' ')
}

async function readTimeline() {
  const content = await fs.readFile(resolveProjectPath('TIMELINE.md'), 'utf8')
  const rows = contentLines(content)
  const legacy = splitTableRow(rows[0] || '')[0]?.toLowerCase() === 'time'
  return rows.slice(2).map(splitTableRow).map(cells => {
    const [date = '', time = '', event = '', loreCell = ''] = legacy
      ? [cells[0], '', cells[1], cells[2]]
      : cells
    return {
      date,
      time,
      event,
      lore: loreCell.match(/^\[.*?]\((.*?)\)$/)?.[1] || ''
    }
  }).filter(item => item.event)
}

function timelineLoreCell(relative) {
  if (!relative) return ''
  const label = relative.split('/').at(-1).replace(/\.md$/i, '').replaceAll('_', ' ')
  return `[${tableCell(label)}](${relative})`
}

async function writeTimeline(events) {
  events.sort((a, b) => {
    const date = a.date.localeCompare(b.date, undefined, { numeric: true, sensitivity: 'base' })
    return date || a.time.localeCompare(b.time, undefined, { numeric: true, sensitivity: 'base' })
  })
  const rows = events.map(item => `| ${tableCell(item.date)} | ${tableCell(item.time)} | ${tableCell(item.event)} | ${timelineLoreCell(item.lore)} |`)
  await atomicWrite(resolveProjectPath('TIMELINE.md'), `| Date | Time | Event | Lore |\n| --- | --- | --- | --- |\n${rows.length ? `${rows.join('\n')}\n` : ''}`)
  notify('project-changed', { path: 'TIMELINE.md' })
  return { path: 'TIMELINE.md', eventCount: events.length }
}

function exactEvent(events, name) {
  const matches = events.map((item, index) => ({ item, index })).filter(({ item }) => item.event === name)
  if (!matches.length) throw new Error(`Timeline event not found: ${name}`)
  if (matches.length > 1) throw new Error(`Multiple timeline events are named: ${name}`)
  return matches[0]
}

function validateTimelineDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Timeline dates must use YYYY-MM-DD format.')
  const parsed = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid timeline date: ${value}`)
  }
}

function validateTimelineTime(value) {
  if (value && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error('Timeline times must use 24-hour HH:mm format.')
  }
}

async function addTimelineEvent(args) {
  const date = String(args.date ?? '').trim()
  const time = String(args.time ?? '').trim()
  const event = String(args.event ?? '').trim()
  if (!date || !event) throw new Error('Timeline date and event are required.')
  validateTimelineDate(date)
  validateTimelineTime(time)
  const lore = args.lore ? markdownPath(args.lore, ['lore']) : ''
  const events = await readTimeline()
  if (events.some(item => item.event === event)) throw new Error(`Timeline event already exists: ${event}`)
  events.push({ date, time, event, lore })
  return writeTimeline(events)
}

async function removeTimelineEvent(args) {
  const events = await readTimeline()
  const match = exactEvent(events, String(args.event ?? '').trim())
  events.splice(match.index, 1)
  return writeTimeline(events)
}

async function editTimelineEvent(args) {
  const events = await readTimeline()
  const match = exactEvent(events, String(args.event ?? '').trim())
  if (args.date === undefined && args.time === undefined && args.new_event === undefined && args.lore === undefined) {
    throw new Error('Provide at least one timeline field to change.')
  }
  const next = { ...match.item }
  if (args.date !== undefined) next.date = String(args.date).trim()
  if (args.time !== undefined) next.time = String(args.time).trim()
  if (args.new_event !== undefined) next.event = String(args.new_event).trim()
  if (args.lore !== undefined) next.lore = args.lore ? markdownPath(args.lore, ['lore']) : ''
  if (!next.date || !next.event) throw new Error('Timeline date and event cannot be empty.')
  validateTimelineDate(next.date)
  validateTimelineTime(next.time)
  if (events.some((item, index) => index !== match.index && item.event === next.event)) {
    throw new Error(`Timeline event already exists: ${next.event}`)
  }
  events[match.index] = next
  return writeTimeline(events)
}

async function selectRange(args) {
  const relative = markdownPath(args.path)
  const text = String(args.text ?? '')
  if (!text) throw new Error('Text to select cannot be empty.')
  await fs.access(resolveProjectPath(relative))
  const occurrence = Math.max(1, Number(args.occurrence) || 1)
  notify('select-range', { path: relative, text, occurrence, requestId: Date.now() })
  return { path: relative, selectionRequested: true, occurrence }
}

async function getSummary(args, context) {
  const relative = markdownPath(args.path)
  const content = await fs.readFile(resolveProjectPath(relative), 'utf8')
  const checksum = createHash('sha256').update(content).digest('hex')
  const cacheKey = createHash('sha256').update(relative).digest('hex')
  const cachePath = resolveProjectPath(`${SUMMARIES_DIRECTORY}/${cacheKey}.json`)
  const cached = await readJson(cachePath, null)
  if (cached?.checksum === checksum && typeof cached.summary === 'string') {
    return { path: relative, summary: cached.summary, metadata: { cached: true, checksum } }
  }
  const response = await context.client.responses.create({
    model: 'gpt-5.6-luna',
    reasoning: { effort: 'low' },
    instructions: 'Summarize this fiction project file concisely. Preserve important characters, places, events, relationships, chronology, unresolved threads, and concrete facts. Do not invent details.',
    input: `Project path: ${relative}\n\n${content}`,
    store: false
  })
  const summary = response.output_text?.trim()
  if (!summary) throw new Error('OpenAI returned an empty file summary.')
  await atomicWrite(cachePath, `${JSON.stringify({
    schemaVersion: 1,
    path: relative,
    checksum,
    model: 'gpt-5.6-luna',
    summary,
    updatedAt: new Date().toISOString()
  }, null, 2)}\n`)
  return { path: relative, summary, metadata: { cached: false, checksum } }
}

const HANDLERS = {
  list: listFiles,
  find: findText,
  read: readRange,
  write_story: args => writeMarkdown(args, 'story'),
  write_lore: args => writeMarkdown(args, 'lore'),
  add_timeline_event: addTimelineEvent,
  remove_timeline_event: removeTimelineEvent,
  edit_timeline_event: editTimelineEvent,
  select_range: selectRange,
  get_summary: getSummary
}

export async function executeAiTool(name, args, context) {
  if (!TOOL_NAMES.has(name) || !HANDLERS[name]) throw new Error(`Unknown tool: ${name}`)
  return HANDLERS[name](args ?? {}, context)
}
