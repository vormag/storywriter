import { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  AppBar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  LinearProgress,
  MenuItem,
  Snackbar,
  TextField,
  Toolbar,
  Tooltip,
  Typography
} from '@mui/material'
import ProjectTree from './components/ProjectTree'
import DocumentEditor from './components/DocumentEditor'
import TimelineEditor from './components/TimelineEditor'
import AssistantPanel from './components/AssistantPanel'
import AgentEditor from './components/AgentEditor'
import Welcome from './components/Welcome'
import {
  clearError,
  closeProject,
  createEntry,
  createProject,
  deleteEntry,
  loadDocument,
  loadRecents,
  openProject,
  openProjectPath,
  refreshProject,
  renameEntry,
  saveActiveDocument,
  setDraft,
  setPreferences,
  persistPreferences,
  updateProjectTypography
} from './state/workspaceSlice'

function flattenLore(items, result = { files: [], folders: [] }) {
  for (const item of items || []) {
    if (item.kind === 'folder') {
      result.folders.push(item)
      flattenLore(item.children, result)
    } else if (item.kind === 'lore') {
      result.files.push(item)
    }
  }
  return result
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))

function resolveProjectLink(href, sourcePath) {
  const value = String(href || '').trim()
  if (!value) return null
  if (/^(https?:|mailto:)/i.test(value)) return { external: value }
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('#')) return null

  let pathname
  try {
    pathname = decodeURIComponent(value.split('#')[0].split('?')[0]).replaceAll('\\', '/')
  } catch {
    return null
  }
  const rooted = pathname.startsWith('/') || /^(story|lore)\//i.test(pathname) || pathname === 'TIMELINE.md'
  const segments = rooted ? [] : String(sourcePath || '').split('/').slice(0, -1)
  for (const segment of pathname.replace(/^\/+/, '').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (!segments.length) return null
      segments.pop()
    } else {
      segments.push(segment)
    }
  }
  const path = segments.join('/')
  if (path !== 'TIMELINE.md' && !/^(story|lore)\/.*\.md$/i.test(path)) return null
  return { path }
}

function TextDialog({ dialog, loreFolders, onClose, onSubmit }) {
  const [value, setValue] = useState(dialog?.initial || '')
  const [category, setCategory] = useState(dialog?.category || loreFolders[0]?.path || 'lore/notes')
  const submit = event => {
    event.preventDefault()
    onSubmit({ value: value.trim(), category })
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <Box component="form" onSubmit={submit}>
        <DialogTitle>{dialog.title}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.5, pt: '8px !important' }}>
          <TextField autoFocus label={dialog.label || 'Name'} value={value} onChange={event => setValue(event.target.value)} />
          {dialog.type === 'lore' && (
            <TextField select label="Category" value={category} onChange={event => setCategory(event.target.value)}>
              {loreFolders.map(folder => <MenuItem key={folder.path} value={folder.path}>{folder.label}</MenuItem>)}
              {!loreFolders.length && <MenuItem value="lore/notes">notes</MenuItem>}
            </TextField>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!value.trim()}>{dialog.action || 'Create'}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}

export default function App({ themeMode, onThemeToggle }) {
  const dispatch = useDispatch()
  const workspace = useSelector(state => state.workspace)
  const [textDialog, setTextDialog] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [gitBusy, setGitBusy] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [aiConfigured, setAiConfigured] = useState(null)
  const [selectionRequest, setSelectionRequest] = useState(null)
  const [editorSelection, setEditorSelection] = useState(null)
  const [documentRevision, setDocumentRevision] = useState(0)
  const [resizingPanel, setResizingPanel] = useState(null)
  const viewSaveTimerRef = useRef(null)
  const pendingViewSaveRef = useRef(null)
  const resizeCleanupRef = useRef(null)
  const leftOpen = workspace.preferences.leftOpen ?? true
  const rightOpen = workspace.preferences.rightOpen ?? true
  const leftWidth = workspace.preferences.leftWidth ?? 232
  const rightWidth = workspace.preferences.rightWidth ?? 278

  const lore = useMemo(() => flattenLore(workspace.project?.tree.lore), [workspace.project])

  useEffect(() => {
    dispatch(loadRecents())
    window.storywriter.getAiStatus()
      .then(status => setAiConfigured(status.configured))
      .catch(() => setAiConfigured(false))
  }, [dispatch])

  useEffect(() => {
    if (!workspace.project || workspace.activePath) return
    const recent = workspace.recents.find(item => item.path === workspace.project.root)
    const available = [
      ...workspace.project.tree.story.map(item => item.path),
      'TIMELINE.md',
      ...lore.files.map(item => item.path),
      ...(workspace.project.tree.agents || []).map(item => item.path)
    ]
    const target = available.includes(recent?.lastDocument) ? recent.lastDocument : available[0]
    if (target) dispatch(loadDocument(target))
  }, [dispatch, workspace.project, workspace.activePath, workspace.recents, lore.files])

  useEffect(() => () => {
    window.clearTimeout(viewSaveTimerRef.current)
    resizeCleanupRef.current?.()
  }, [])

  useEffect(() => {
    if (!workspace.dirty || !workspace.activePath) return undefined
    const timer = window.setTimeout(() => dispatch(saveActiveDocument()), 550)
    return () => window.clearTimeout(timer)
  }, [dispatch, workspace.dirty, workspace.activePath, workspace.content])

  useEffect(() => {
    if (!workspace.project) return undefined
    const refresh = () => dispatch(refreshProject())
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [dispatch, workspace.project])

  useEffect(() => {
    if (!workspace.project) return undefined
    const unsubscribeChanged = window.storywriter.onAiProjectChanged(async payload => {
      try {
        await dispatch(refreshProject()).unwrap()
        if (payload?.path === workspace.activePath) {
          await dispatch(loadDocument(payload.path)).unwrap()
          setDocumentRevision(value => value + 1)
        }
      } catch (error) {
        setNotice(error.message || 'Could not refresh the changed document.')
      }
    })
    const unsubscribeSelect = window.storywriter.onAiSelectRange(async payload => {
      try {
        if (workspace.dirty) await dispatch(saveActiveDocument()).unwrap()
        if (payload.path !== workspace.activePath) await dispatch(loadDocument(payload.path)).unwrap()
        setSelectionRequest(payload)
      } catch (error) {
        setNotice(error.message || 'Could not select the requested text.')
      }
    })
    return () => {
      unsubscribeChanged()
      unsubscribeSelect()
    }
  }, [dispatch, workspace.project, workspace.activePath, workspace.dirty])

  const openDocument = async path => {
    if (path === workspace.activePath) return
    if (workspace.dirty) await dispatch(saveActiveDocument()).unwrap()
    dispatch(loadDocument(path))
  }

  const navigateLink = async (href, sourcePath = '') => {
    const target = resolveProjectLink(href, sourcePath)
    if (!target) {
      setNotice('This link cannot be opened.')
      return
    }
    try {
      if (target.external) await window.storywriter.openExternalLink(target.external)
      else await openDocument(target.path)
    } catch (error) {
      setNotice(error.message || 'Could not open the link.')
    }
  }

  const persistPreference = payload => {
    dispatch(setPreferences(payload))
    dispatch(persistPreferences(payload))
  }

  const captureVisibleSelection = event => {
    const target = event.target
    let text = ''
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      const start = target.selectionStart
      const end = target.selectionEnd
      if (Number.isInteger(start) && Number.isInteger(end) && end > start) {
        text = target.value.slice(start, end).trim()
      }
    } else {
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed) text = selection.toString().trim()
    }
    setEditorSelection(text ? { path: workspace.activePath, text } : null)
  }

  const resizePanel = (side, event) => {
    event.preventDefault()
    resizeCleanupRef.current?.()
    const startX = event.clientX
    const startWidth = side === 'left' ? leftWidth : rightWidth
    const key = side === 'left' ? 'leftWidth' : 'rightWidth'
    let finalWidth = startWidth

    const onMove = moveEvent => {
      const otherWidth = side === 'left' ? (rightOpen ? rightWidth : 0) : (leftOpen ? leftWidth : 0)
      const maximum = Math.max(side === 'left' ? 160 : 220, window.innerWidth - otherWidth - 430)
      const delta = moveEvent.clientX - startX
      finalWidth = Math.round(clamp(startWidth + (side === 'left' ? delta : -delta), side === 'left' ? 160 : 220, Math.min(side === 'left' ? 480 : 640, maximum)))
      dispatch(setPreferences({ [key]: finalWidth }))
    }
    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      resizeCleanupRef.current = null
      setResizingPanel(null)
    }
    const finish = () => {
      cleanup()
      dispatch(persistPreferences({ [key]: finalWidth }))
    }

    setResizingPanel(side)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    resizeCleanupRef.current = cleanup
  }

  const updateDocumentView = view => {
    if (!workspace.activePath) return
    const payload = {}
    if (Number.isFinite(view.zoom)) payload.zoom = view.zoom
    const documentView = Object.fromEntries(Object.entries(view).filter(([key]) => key !== 'zoom'))
    if (Object.keys(documentView).length) {
      payload.documentPath = workspace.activePath
      payload.view = documentView
    }
    dispatch(setPreferences(payload))
    const pending = pendingViewSaveRef.current ?? {}
    pendingViewSaveRef.current = {
      ...pending,
      ...payload,
      view: payload.view
        ? { ...(pending.documentPath === payload.documentPath ? pending.view : {}), ...payload.view }
        : pending.view,
      documentPath: payload.documentPath ?? pending.documentPath
    }
    window.clearTimeout(viewSaveTimerRef.current)
    viewSaveTimerRef.current = window.setTimeout(() => {
      const next = pendingViewSaveRef.current
      pendingViewSaveRef.current = null
      if (next) dispatch(persistPreferences(next))
    }, 350)
  }

  const runGit = async (operation, message = '') => {
    setGitBusy(true)
    try {
      if (workspace.dirty) await dispatch(saveActiveDocument()).unwrap()
      const output = await window.storywriter.runGit({ operation, message })
      setNotice(output || `Git ${operation} completed.`)
      if (operation === 'pull') {
        await dispatch(refreshProject()).unwrap()
        if (workspace.activePath) await dispatch(loadDocument(workspace.activePath)).unwrap()
      }
    } catch (error) {
      setNotice(error.message || `Git ${operation} failed.`)
    } finally {
      setGitBusy(false)
    }
  }

  const exportPdf = async () => {
    setExportBusy(true)
    try {
      if (workspace.dirty) await dispatch(saveActiveDocument()).unwrap()
      const target = await window.storywriter.exportStoryPdf()
      if (target) setNotice(`PDF exported to ${target}`)
    } catch (error) {
      setNotice(error.message || 'PDF export failed.')
    } finally {
      setExportBusy(false)
    }
  }

  const changeTypography = async typography => {
    if (workspace.dirty) await dispatch(saveActiveDocument()).unwrap()
    dispatch(updateProjectTypography(typography))
  }

  const submitTextDialog = ({ value, category }) => {
    const dialog = textDialog
    setTextDialog(null)
    if (dialog.type === 'project') dispatch(createProject(value))
    if (dialog.type === 'category') dispatch(createEntry({ kind: 'category', title: value }))
    if (dialog.type === 'lore') dispatch(createEntry({ kind: 'lore', title: value, category }))
    if (dialog.type === 'agent') dispatch(createEntry({ kind: 'agent', title: value }))
    if (dialog.type === 'rename') dispatch(renameEntry({ path: dialog.item.path, newName: value }))
    if (dialog.type === 'commit') runGit('commit', value)
  }

  const confirmDelete = () => {
    if (deleteTarget) dispatch(deleteEntry(deleteTarget.path))
    setDeleteTarget(null)
  }

  if (!workspace.project) {
    return (
      <>
        {workspace.busy && <LinearProgress sx={{ position: 'fixed', inset: '0 0 auto 0', zIndex: 10 }} />}
        <Welcome
          recents={workspace.recents}
          busy={workspace.busy}
          onCreate={() => setTextDialog({ type: 'project', title: 'New project', label: 'Project title' })}
          onOpen={() => dispatch(openProject())}
          onOpenRecent={root => dispatch(openProjectPath(root))}
          themeMode={themeMode}
          onThemeToggle={onThemeToggle}
        />
        {textDialog && <TextDialog key={`${textDialog.type}-${textDialog.initial || ''}`} dialog={textDialog} loreFolders={[]} onClose={() => setTextDialog(null)} onSubmit={submitTextDialog} />}
        <Snackbar open={Boolean(workspace.error)} message={workspace.error} onClose={() => dispatch(clearError())} />
      </>
    )
  }

  const isTimeline = workspace.activePath === 'TIMELINE.md'
  const isAgent = /^agents\/.*\.json$/i.test(workspace.activePath || '')

  return (
    <Box className="app-shell">
      <AppBar position="static" color="inherit" elevation={0} className="topbar">
        <Toolbar variant="dense" disableGutters sx={{ px: 0.75, minHeight: '40px !important' }}>
          <Tooltip title="Toggle project tree"><IconButton size="small" onClick={() => {
            const next = !leftOpen
            persistPreference({ leftOpen: next })
          }}>☰</IconButton></Tooltip>
          <Typography variant="body2" sx={{ fontWeight: 600, ml: 0.5 }} noWrap>{workspace.project.title}</Typography>
          {workspace.activePath && <Typography variant="caption" color="text.secondary" noWrap sx={{ ml: 1 }}>— {workspace.activePath}</Typography>}
          <Box sx={{ flex: 1 }} />
          <Button disabled={exportBusy} onClick={exportPdf} sx={{ minWidth: 0, px: 0.75 }}>PDF</Button>
          <Button disabled={gitBusy} onClick={() => runGit('pull')} sx={{ minWidth: 0, px: 0.75 }}>↓ Pull</Button>
          <Button disabled={gitBusy} onClick={() => setTextDialog({ type: 'commit', title: 'Commit changes', label: 'Commit message', action: 'Commit' })} sx={{ minWidth: 0, px: 0.75 }}>✓ Commit</Button>
          <Button disabled={gitBusy} onClick={() => runGit('push')} sx={{ minWidth: 0, px: 0.75 }}>↑ Push</Button>
          <Tooltip title={themeMode === 'dark' ? 'Use light theme' : 'Use dark theme'}>
            <IconButton size="small" onClick={onThemeToggle}>{themeMode === 'dark' ? '☀' : '☾'}</IconButton>
          </Tooltip>
          <Tooltip title="New project"><IconButton size="small" onClick={() => setTextDialog({ type: 'project', title: 'New project', label: 'Project title' })}>＋</IconButton></Tooltip>
          <Tooltip title="Open project"><IconButton size="small" onClick={() => dispatch(openProject())}>↗</IconButton></Tooltip>
          <Tooltip title="Toggle assistant"><IconButton size="small" onClick={() => {
            const next = !rightOpen
            persistPreference({ rightOpen: next })
          }} sx={{ fontSize: 11, fontWeight: 700 }}>AI</IconButton></Tooltip>
          <Tooltip title="Close project"><IconButton size="small" onClick={() => dispatch(closeProject())}>×</IconButton></Tooltip>
        </Toolbar>
      </AppBar>
      <Box
        className={`workspace-grid${resizingPanel ? ' resizing' : ''}`}
        sx={{
          gridTemplateColumns: `${leftOpen ? `${leftWidth}px 5px` : '0px 0px'} minmax(0, 1fr) ${rightOpen ? `5px ${rightWidth}px` : '0px 0px'}`
        }}
      >
        <Box className="left-panel" sx={{ visibility: leftOpen ? 'visible' : 'hidden' }}>
          <ProjectTree
            project={workspace.project}
            activePath={workspace.activePath}
            onOpen={openDocument}
            onCreateChapter={() => dispatch(createEntry({ kind: 'chapter' }))}
            onCreateLore={category => setTextDialog({ type: 'lore', title: 'New lore page', category })}
            onCreateCategory={() => setTextDialog({ type: 'category', title: 'New lore category' })}
            onCreateAgent={() => setTextDialog({ type: 'agent', title: 'New agent', label: 'Agent name' })}
            onRename={item => setTextDialog({ type: 'rename', title: 'Rename', initial: item.label, action: 'Rename', item })}
            onDelete={setDeleteTarget}
            onRefresh={() => dispatch(refreshProject())}
          />
        </Box>
        <Box
          className="panel-resizer"
          role="separator"
          aria-label="Resize project tree"
          aria-orientation="vertical"
          tabIndex={leftOpen ? 0 : -1}
          onPointerDown={event => resizePanel('left', event)}
          onDoubleClick={() => persistPreference({ leftWidth: 232 })}
        />
        <Box
          className="center-panel"
          onMouseUp={captureVisibleSelection}
          onKeyUp={captureVisibleSelection}
          onSelect={captureVisibleSelection}
        >
          {workspace.activePath && isTimeline && (
            <TimelineEditor
              key={`${workspace.activePath}-${documentRevision}`}
              content={workspace.content}
              loreItems={lore.files}
              saveStatus={workspace.saveStatus}
              mode={workspace.preferences.timelineMode || 'view'}
              onModeChange={timelineMode => persistPreference({ timelineMode })}
              onOpen={openDocument}
              onChange={(content, wordCount) => dispatch(setDraft({ content, wordCount }))}
            />
          )}
          {workspace.activePath && isAgent && (
            <AgentEditor
              key={workspace.activePath}
              content={workspace.content}
              saveStatus={workspace.saveStatus}
              onChange={(content, wordCount) => dispatch(setDraft({ content, wordCount }))}
            />
          )}
          {workspace.activePath && !isTimeline && !isAgent && (
            <DocumentEditor
              key={`${workspace.activePath}-${workspace.project.marker.typography?.fontFamily || 'Literata'}-${workspace.project.marker.typography?.baseSize || 16}-${documentRevision}`}
              filePath={workspace.activePath}
              content={workspace.content}
              page={workspace.project.marker.page}
              typography={workspace.project.marker.typography}
              onTypographyChange={changeTypography}
              wordCount={workspace.wordCount}
              saveStatus={workspace.saveStatus}
              view={{
                ...workspace.preferences.documentViews?.[workspace.activePath],
                zoom: workspace.preferences.zoom ?? 1
              }}
              onViewChange={updateDocumentView}
              selectionRequest={selectionRequest}
              onSelectionChange={selection => setEditorSelection(
                selection ? { ...selection, path: workspace.activePath } : null
              )}
              onOpenLink={href => navigateLink(href, workspace.activePath)}
              onChange={(content, wordCount) => dispatch(setDraft({ content, wordCount }))}
            />
          )}
          {!workspace.activePath && <Box sx={{ p: 2, color: 'text.secondary' }}><Typography variant="body2">Select a document.</Typography></Box>}
        </Box>
        <Box
          className="panel-resizer"
          role="separator"
          aria-label="Resize assistant"
          aria-orientation="vertical"
          tabIndex={rightOpen ? 0 : -1}
          onPointerDown={event => resizePanel('right', event)}
          onDoubleClick={() => persistPreference({ rightWidth: 278 })}
        />
        <Box className="right-panel" sx={{ visibility: rightOpen ? 'visible' : 'hidden' }}>
          <AssistantPanel
            key={workspace.project.root}
            configured={aiConfigured}
            agents={workspace.project.tree.agents || []}
            initialConversationId={workspace.preferences.lastConversationId || null}
            onConversationChange={lastConversationId => persistPreference({ lastConversationId })}
            onBeforeSend={() => workspace.dirty ? dispatch(saveActiveDocument()).unwrap() : Promise.resolve()}
            editorContext={{
              activeFile: workspace.activePath,
              selectedText: editorSelection?.path === workspace.activePath ? editorSelection.text : ''
            }}
            onNavigate={href => navigateLink(href)}
            onConfiguredChange={setAiConfigured}
          />
        </Box>
      </Box>

      {textDialog && <TextDialog key={`${textDialog.type}-${textDialog.initial || ''}`} dialog={textDialog} loreFolders={lore.folders} onClose={() => setTextDialog(null)} onSubmit={submitTextDialog} />}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete {deleteTarget?.label}?</DialogTitle>
        <DialogContent><DialogContentText>This removes the item from disk. A lore category also removes everything inside it.</DialogContentText></DialogContent>
        <DialogActions><Button onClick={() => setDeleteTarget(null)}>Cancel</Button><Button color="error" onClick={confirmDelete}>Delete</Button></DialogActions>
      </Dialog>
      <Snackbar
        open={Boolean(workspace.error || notice)}
        message={workspace.error || notice}
        onClose={() => { dispatch(clearError()); setNotice('') }}
      />
    </Box>
  )
}
