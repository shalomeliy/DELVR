import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { installGlobalHandlers, logInfo } from './services/log'

installGlobalHandlers()
logInfo('app_start', { build: import.meta.env.VITE_BUILD ?? 'dev' })

// A new deploy replaces the cached app and reloads the page, so a refresh always shows the latest version.
registerSW({ immediate: true, onRegisteredSW: (_url, reg) => { if (reg) setInterval(() => reg.update(), 60_000) } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
