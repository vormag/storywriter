import { useMemo, useState } from 'react'
import { CssBaseline, ThemeProvider } from '@mui/material'
import App from './App'
import { createAppTheme } from './theme'

export default function AppRoot() {
  const [mode, setMode] = useState(() => localStorage.getItem('storywriter-theme') === 'dark' ? 'dark' : 'light')
  const theme = useMemo(() => createAppTheme(mode), [mode])
  const toggleTheme = () => {
    setMode(current => {
      const next = current === 'dark' ? 'light' : 'dark'
      localStorage.setItem('storywriter-theme', next)
      return next
    })
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App themeMode={mode} onThemeToggle={toggleTheme} />
    </ThemeProvider>
  )
}
