import { createTheme } from '@mui/material/styles'

export const createAppTheme = mode => createTheme({
  cssVariables: true,
  palette: {
    mode,
    primary: { main: mode === 'dark' ? '#79a7d3' : '#315d8a' },
    background: mode === 'dark'
      ? { default: '#202327', paper: '#292d32' }
      : { default: '#e4e6e9', paper: '#f8f9fa' },
    divider: mode === 'dark' ? '#3b4148' : '#d1d5da'
  },
  shape: { borderRadius: 4 },
  typography: {
    fontFamily: 'Inter, Segoe UI, Arial, sans-serif',
    fontSize: 13
  },
  components: {
    MuiButton: {
      defaultProps: { size: 'small', disableElevation: true },
      styleOverrides: { root: { minHeight: 28, textTransform: 'none' } }
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontSize: 16, padding: '14px 16px 8px' } }
    },
    MuiDialogContent: {
      styleOverrides: { root: { padding: '8px 16px' } }
    },
    MuiDialogActions: {
      styleOverrides: { root: { padding: '8px 16px 12px' } }
    },
    MuiIconButton: {
      defaultProps: { size: 'small' }
    },
    MuiMenuItem: {
      defaultProps: { dense: true }
    },
    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' }
    },
    MuiToolbar: {
      styleOverrides: { dense: { minHeight: 40 } }
    }
  }
})
