import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'

const api = () => window.storywriter

export const loadRecents = createAsyncThunk('workspace/loadRecents', () => api().getRecentProjects())

export const openProject = createAsyncThunk('workspace/openProject', () => api().openProject())

export const openProjectPath = createAsyncThunk('workspace/openProjectPath', root => api().openProjectPath(root))

export const createProject = createAsyncThunk('workspace/createProject', title => api().createProject(title))

export const refreshProject = createAsyncThunk('workspace/refreshProject', () => api().refreshProject())

export const persistPreferences = createAsyncThunk('workspace/persistPreferences', payload => api().updateWorkspace(payload))

export const updateProjectTypography = createAsyncThunk(
  'workspace/updateProjectTypography',
  payload => api().updateProjectTypography(payload)
)

export const loadDocument = createAsyncThunk('workspace/loadDocument', path => api().readDocument(path))

export const saveActiveDocument = createAsyncThunk(
  'workspace/saveActiveDocument',
  async (_, { getState }) => {
    const { activePath, content } = getState().workspace
    if (!activePath) return null
    return api().writeDocument({ path: activePath, content })
  }
)

export const createEntry = createAsyncThunk('workspace/createEntry', async payload => {
  const result = await api().createEntry(payload)
  const document = /\.(md|json)$/i.test(result.path || '') ? await api().readDocument(result.path) : null
  return { ...result, document }
})

export const renameEntry = createAsyncThunk('workspace/renameEntry', async payload => {
  const result = await api().renameEntry(payload)
  const document = /\.(md|json)$/i.test(result.path || '') ? await api().readDocument(result.path) : null
  return { ...result, document, oldPath: payload.path }
})

export const deleteEntry = createAsyncThunk('workspace/deleteEntry', async path => ({
  path,
  project: await api().deleteEntry(path)
}))

const initialState = {
  recents: [],
  project: null,
  activePath: null,
  content: '',
  dirty: false,
  saveStatus: 'idle',
  wordCount: 0,
  preferences: {},
  busy: false,
  error: null
}

function errorMessage(action) {
  return action.error?.message || 'The operation failed.'
}

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState,
  reducers: {
    setDraft(state, action) {
      if (state.content === action.payload.content) {
        state.wordCount = action.payload.wordCount ?? state.wordCount
        return
      }
      state.content = action.payload.content
      state.wordCount = action.payload.wordCount ?? state.wordCount
      state.dirty = true
      state.saveStatus = 'unsaved'
      if (state.activePath?.startsWith('agents/') && state.project?.tree.agents) {
        try {
          const name = String(JSON.parse(state.content).name || '').trim()
          const agent = state.project.tree.agents.find(item => item.path === state.activePath)
          if (agent && name) agent.label = name
        } catch {
          // The agent editor will surface malformed external JSON.
        }
      }
    },
    setPreferences(state, action) {
      const payload = action.payload
      state.preferences = { ...state.preferences, ...payload }
      if (payload.documentPath && payload.view) {
        state.preferences.documentViews = {
          ...(state.preferences.documentViews || {}),
          [payload.documentPath]: {
            ...(state.preferences.documentViews?.[payload.documentPath] || {}),
            ...payload.view
          }
        }
      }
      delete state.preferences.documentPath
      delete state.preferences.view
    },
    clearError(state) {
      state.error = null
    },
    closeProject(state) {
      state.project = null
      state.activePath = null
      state.content = ''
      state.dirty = false
      state.saveStatus = 'idle'
      state.preferences = {}
    }
  },
  extraReducers: builder => {
    builder
      .addCase(loadRecents.fulfilled, (state, action) => {
        state.recents = action.payload
      })
      .addCase(openProject.pending, state => { state.busy = true })
      .addCase(openProjectPath.pending, state => { state.busy = true })
      .addCase(createProject.pending, state => { state.busy = true })
      .addCase(refreshProject.fulfilled, (state, action) => {
        state.project = action.payload
        state.preferences = action.payload.preferences ?? state.preferences
      })
      .addCase(loadDocument.pending, state => {
        state.busy = true
      })
      .addCase(loadDocument.fulfilled, (state, action) => {
        state.busy = false
        state.activePath = action.payload.path
        state.content = action.payload.content
        state.dirty = false
        state.saveStatus = 'saved'
        state.wordCount = action.payload.content.trim() ? action.payload.content.trim().split(/\s+/).length : 0
      })
      .addCase(saveActiveDocument.pending, state => {
        state.saveStatus = 'saving'
      })
      .addCase(saveActiveDocument.fulfilled, state => {
        state.dirty = false
        state.saveStatus = 'saved'
      })
      .addCase(createEntry.fulfilled, (state, action) => {
        state.project = action.payload.project
        if (action.payload.document) {
          state.activePath = action.payload.document.path
          state.content = action.payload.document.content
          state.dirty = false
          state.saveStatus = 'saved'
        }
      })
      .addCase(renameEntry.fulfilled, (state, action) => {
        state.project = action.payload.project
        if (action.payload.document) {
          state.activePath = action.payload.document.path
          state.content = action.payload.document.content
          state.dirty = false
          state.saveStatus = 'saved'
        } else if (state.activePath?.startsWith(`${action.payload.oldPath}/`)) {
          state.activePath = `${action.payload.path}${state.activePath.slice(action.payload.oldPath.length)}`
        }
      })
      .addCase(deleteEntry.fulfilled, (state, action) => {
        state.project = action.payload.project
        if (state.activePath === action.payload.path || state.activePath?.startsWith(`${action.payload.path}/`)) {
          state.activePath = null
          state.content = ''
          state.dirty = false
          state.saveStatus = 'idle'
        }
      })
      .addCase(persistPreferences.fulfilled, (state, action) => {
        state.preferences = action.payload
      })
      .addCase(updateProjectTypography.fulfilled, (state, action) => {
        state.project = action.payload
      })
      .addMatcher(
        action => [openProject.fulfilled.type, openProjectPath.fulfilled.type, createProject.fulfilled.type].includes(action.type),
        (state, action) => {
          state.busy = false
          if (!action.payload) return
          state.project = action.payload
          state.preferences = action.payload.preferences ?? {}
          state.activePath = null
          state.content = ''
          state.dirty = false
          state.saveStatus = 'idle'
        }
      )
      .addMatcher(
        action => action.type.startsWith('workspace/') && action.type.endsWith('/rejected'),
        (state, action) => {
          state.busy = false
          state.saveStatus = state.dirty ? 'unsaved' : state.saveStatus
          state.error = errorMessage(action)
        }
      )
  }
})

export const { setDraft, setPreferences, clearError, closeProject } = workspaceSlice.actions
export default workspaceSlice.reducer
