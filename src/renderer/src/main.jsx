import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import AppRoot from './AppRoot'
import PdfExportView from './components/PdfExportView'
import { store } from './state/store'
import './styles.css'

const pdfExport = new URLSearchParams(window.location.search).has('pdf-export')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {pdfExport
      ? <PdfExportView />
      : <Provider store={store}><AppRoot /></Provider>}
  </StrictMode>
)
