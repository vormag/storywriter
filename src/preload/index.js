import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('storywriter', {
  getAiStatus: () => ipcRenderer.invoke('ai:status'),
  setOpenAiKey: key => ipcRenderer.invoke('ai:key:set', key),
  sendAiMessage: payload => ipcRenderer.invoke('ai:chat', payload),
  getAiConversations: () => ipcRenderer.invoke('ai:conversations:list'),
  readAiConversation: id => ipcRenderer.invoke('ai:conversations:read', id),
  saveAiConversation: payload => ipcRenderer.invoke('ai:conversations:save', payload),
  deleteAiConversation: id => ipcRenderer.invoke('ai:conversations:delete', id),
  onAiProjectChanged: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('ai:project-changed', listener)
    return () => ipcRenderer.removeListener('ai:project-changed', listener)
  },
  onAiSelectRange: callback => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('ai:select-range', listener)
    return () => ipcRenderer.removeListener('ai:select-range', listener)
  },
  openExternalLink: url => ipcRenderer.invoke('system:openExternal', url),
  exportStoryPdf: () => ipcRenderer.invoke('export:pdf'),
  getPdfExportData: () => ipcRenderer.invoke('export:pdfData'),
  signalPdfExportReady: error => ipcRenderer.send('export:pdfReady', error),
  getSystemFonts: () => ipcRenderer.invoke('system:fonts'),
  getRecentProjects: () => ipcRenderer.invoke('settings:recents'),
  openProject: () => ipcRenderer.invoke('project:open'),
  openProjectPath: root => ipcRenderer.invoke('project:openPath', root),
  createProject: title => ipcRenderer.invoke('project:create', title),
  refreshProject: () => ipcRenderer.invoke('project:refresh'),
  updateWorkspace: payload => ipcRenderer.invoke('workspace:update', payload),
  updateProjectTypography: payload => ipcRenderer.invoke('project:updateTypography', payload),
  runGit: payload => ipcRenderer.invoke('git:run', payload),
  createEntry: payload => ipcRenderer.invoke('entry:create', payload),
  renameEntry: payload => ipcRenderer.invoke('entry:rename', payload),
  deleteEntry: relativePath => ipcRenderer.invoke('entry:delete', relativePath),
  readDocument: relativePath => ipcRenderer.invoke('document:read', relativePath),
  writeDocument: payload => ipcRenderer.invoke('document:write', payload)
})
