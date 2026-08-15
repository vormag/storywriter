import { app } from 'electron'
import path from 'node:path'
import { atomicWrite, readJson } from './storage.js'
import { normalizeRelative, validateConversationId } from './utils.js'

const SETTINGS_FILE = 'settings.json'
const MAX_RECENTS = 12
let settingsMutation = Promise.resolve()

function mutateSettings(operation) {
  const result = settingsMutation.catch(() => {}).then(operation)
  settingsMutation = result.catch(() => {})
  return result
}

function settingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

async function readSettings() {
  const settings = await readJson(settingsPath(), { recentProjects: [] })
  return {
    recentProjects: Array.isArray(settings.recentProjects)
      ? settings.recentProjects.slice(0, MAX_RECENTS)
      : []
  }
}

async function writeSettings(settings) {
  await atomicWrite(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`)
}

export async function getRecentProjects() {
  return (await readSettings()).recentProjects
}

export async function updateRecent(root, project, lastDocument) {
  return mutateSettings(async () => {
    const settings = await readSettings()
    const previous = settings.recentProjects.find(item => item.path === root)
    settings.recentProjects = [
      {
        path: root,
        title: project.title,
        lastOpenedAt: new Date().toISOString(),
        lastDocument: lastDocument ?? previous?.lastDocument ?? null,
        workspace: previous?.workspace ?? {}
      },
      ...settings.recentProjects.filter(item => item.path !== root)
    ].slice(0, MAX_RECENTS)
    await writeSettings(settings)
  })
}

export async function getWorkspacePreferences(root) {
  const settings = await readSettings()
  return settings.recentProjects.find(item => item.path === root)?.workspace ?? {}
}

export async function updateWorkspacePreferences(root, payload = {}) {
  return mutateSettings(async () => {
    const settings = await readSettings()
    const index = settings.recentProjects.findIndex(item => item.path === root)
    if (index < 0) throw new Error('The open project is missing from recent projects.')

    const current = settings.recentProjects[index].workspace ?? {}
    const next = { ...current }
    if (current.documentViews) {
      next.documentViews = Object.fromEntries(
        Object.entries(current.documentViews).map(([key, view]) => [
          key,
          Object.fromEntries(Object.entries(view).filter(([name]) => name !== 'zoom'))
        ])
      )
    }
    if (typeof payload.leftOpen === 'boolean') next.leftOpen = payload.leftOpen
    if (typeof payload.rightOpen === 'boolean') next.rightOpen = payload.rightOpen
    if (payload.timelineMode === 'view' || payload.timelineMode === 'edit') next.timelineMode = payload.timelineMode
    if (payload.lastConversationId === null) next.lastConversationId = null
    else if (typeof payload.lastConversationId === 'string') {
      next.lastConversationId = validateConversationId(payload.lastConversationId)
    }
    if (Number.isFinite(payload.leftWidth)) {
      next.leftWidth = Math.round(Math.min(480, Math.max(160, payload.leftWidth)))
    }
    if (Number.isFinite(payload.rightWidth)) {
      next.rightWidth = Math.round(Math.min(640, Math.max(220, payload.rightWidth)))
    }
    if (Number.isFinite(payload.zoom)) {
      next.zoom = Math.min(2, Math.max(0.5, payload.zoom))
    }

    const documentPath = normalizeRelative(payload.documentPath)
    if (documentPath && payload.view && typeof payload.view === 'object') {
      const currentView = current.documentViews?.[documentPath] ?? {}
      const currentDocumentView = Object.fromEntries(Object.entries(currentView).filter(([key]) => key !== 'zoom'))
      const documentView = Object.fromEntries(Object.entries(payload.view).filter(([key]) => key !== 'zoom'))
      next.documentViews = {
        ...(next.documentViews ?? current.documentViews ?? {}),
        [documentPath]: { ...currentDocumentView, ...documentView }
      }
    }

    settings.recentProjects[index] = { ...settings.recentProjects[index], workspace: next }
    await writeSettings(settings)
    return next
  })
}
