import { BrowserWindow, dialog, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getStoryExportData } from './projectService.js'

let exportInProgress = false

export function getPdfExportData() {
  return getStoryExportData()
}

function safeFilename(value) {
  return [...String(value || 'story')]
    .map(character => character.charCodeAt(0) < 32 ? '_' : character)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '') || 'story'
}

function waitForExportView(pdfWindow) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('PDF export view timed out.')), 20000)
    const onReady = (event, error) => {
      if (event.sender.id !== pdfWindow.webContents.id) return
      finish(error ? new Error(error) : null)
    }
    const onClosed = () => finish(new Error('PDF export view closed unexpectedly.'))
    const finish = error => {
      clearTimeout(timeout)
      ipcMain.removeListener('export:pdfReady', onReady)
      pdfWindow.removeListener('closed', onClosed)
      if (error) reject(error)
      else resolve()
    }
    ipcMain.on('export:pdfReady', onReady)
    pdfWindow.once('closed', onClosed)
  })
}

async function loadExportView(pdfWindow, rendererUrl, rendererHtml) {
  if (rendererUrl) {
    const url = new URL(rendererUrl)
    url.searchParams.set('pdf-export', '1')
    await pdfWindow.loadURL(url.toString())
  } else {
    await pdfWindow.loadFile(rendererHtml, { query: { 'pdf-export': '1' } })
  }
}

export async function exportStoryPdf({ parent, preloadPath, rendererUrl, rendererHtml }) {
  if (exportInProgress) throw new Error('A PDF export is already running.')
  exportInProgress = true
  let pdfWindow
  try {
    const data = await getStoryExportData()
    if (!data.chapters.length) throw new Error('The project has no story chapters to export.')
    const selection = await dialog.showSaveDialog(parent, {
      title: 'Export story as PDF',
      defaultPath: path.join(data.root, `${safeFilename(data.title)}.pdf`),
      filters: [{ name: 'PDF document', extensions: ['pdf'] }]
    })
    if (selection.canceled || !selection.filePath) return null

    pdfWindow = new BrowserWindow({
      parent,
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    })
    const ready = waitForExportView(pdfWindow)
    await loadExportView(pdfWindow, rendererUrl, rendererHtml)
    await ready

    const rightMargin = Math.round((Number(data.page?.marginsMm?.right) || 25) * 96 / 25.4)
    const pdf = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      generateDocumentOutline: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="box-sizing:border-box;width:100%;padding-right:${rightMargin}px;color:#777;font:11px Arial,sans-serif;text-align:right;"><span class="pageNumber"></span></div>`
    })
    await fs.writeFile(selection.filePath, pdf)
    return selection.filePath
  } finally {
    if (pdfWindow && !pdfWindow.isDestroyed()) pdfWindow.destroy()
    exportInProgress = false
  }
}
