import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// Only macOS draws its window buttons over the app: the top bar makes room for them there.
document.documentElement.dataset.mac = String(navigator.userAgent.includes('Macintosh'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
