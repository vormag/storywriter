import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getFonts } from 'font-list'
import appIconIco from '../../build/icon.ico?asset'
import appIconPng from '../../build/icon.png?asset'
import {
  deleteAiConversation,
  getAiStatus,
  listAiConversations,
  readAiConversation,
  saveAiConversation,
  sendAiMessage
} from './aiService.js'
import { configureAiToolEvents } from './aiTools.js'
import { setOpenAiKey } from './credentialService.js'
import { runGit } from './gitService.js'
import { exportStoryPdf, getPdfExportData } from './pdfService.js'
import {
  activateProject,
  chooseAndCreateProject,
  chooseAndOpenProject,
  createEntry,
  deleteEntry,
  readDocument,
  refreshProject,
  renameEntry,
  updateProjectTypography,
  updateWorkspacePreferences,
  writeDocument
} from './projectService.js'
import { getRecentProjects } from './settingsService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const preloadPath = path.join(__dirname, '../preload/index.cjs')
const rendererHtml = path.join(__dirname, '../renderer/index.html')
let mainWindow = null

function registerIpc() {
  ipcMain.handle('ai:status', () => getAiStatus())
  ipcMain.handle('ai:key:set', (_event, key) => setOpenAiKey(key))
  ipcMain.handle('ai:chat', (_event, payload) => sendAiMessage(payload))
  ipcMain.handle('ai:conversations:list', () => listAiConversations())
  ipcMain.handle('ai:conversations:read', (_event, id) => readAiConversation(id))
  ipcMain.handle('ai:conversations:save', (_event, payload) => saveAiConversation(payload))
  ipcMain.handle('ai:conversations:delete', (_event, id) => deleteAiConversation(id))
  ipcMain.handle('system:fonts', async () => {
    const fonts = await getFonts({ disableQuoting: true })
    return [...new Set(fonts)].sort((a, b) => a.localeCompare(b))
  })
  ipcMain.handle('system:openExternal', (_event, value) => {
    const url = new URL(String(value || ''))
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error('Unsupported link type.')
    return shell.openExternal(url.toString())
  })
  ipcMain.handle('export:pdfData', () => getPdfExportData())
  ipcMain.handle('export:pdf', () => exportStoryPdf({
    parent: mainWindow,
    preloadPath,
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    rendererHtml
  }))
  ipcMain.handle('settings:recents', () => getRecentProjects())
  ipcMain.handle('project:open', () => chooseAndOpenProject(mainWindow))
  ipcMain.handle('project:openPath', (_event, root) => activateProject(root))
  ipcMain.handle('project:create', (_event, title) => chooseAndCreateProject(mainWindow, title))
  ipcMain.handle('project:refresh', () => refreshProject())
  ipcMain.handle('workspace:update', (_event, payload) => updateWorkspacePreferences(payload))
  ipcMain.handle('project:updateTypography', (_event, payload) => updateProjectTypography(payload))
  ipcMain.handle('git:run', (_event, payload) => runGit(payload))
  ipcMain.handle('entry:create', (_event, payload) => createEntry(payload))
  ipcMain.handle('entry:rename', (_event, payload) => renameEntry(payload))
  ipcMain.handle('entry:delete', (_event, relativePath) => deleteEntry(relativePath))
  ipcMain.handle('document:read', (_event, relativePath) => readDocument(relativePath))
  ipcMain.handle('document:write', (_event, payload) => writeDocument(payload))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 650,
    backgroundColor: '#dfe2e6',
    icon: process.platform === 'win32' ? appIconIco : appIconPng,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  configureAiToolEvents((type, payload) => {
    if (!mainWindow?.isDestroyed()) mainWindow.webContents.send(`ai:${type}`, payload)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(rendererHtml)
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.storywriter.app')
  if (process.platform === 'darwin') app.dock?.setIcon(appIconPng)
  Menu.setApplicationMenu(null)
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
