import { configureStore } from '@reduxjs/toolkit'
import workspace from './workspaceSlice'

export const store = configureStore({
  reducer: { workspace }
})
