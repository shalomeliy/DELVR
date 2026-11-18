import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { applyIdentity, identityFor, modeFor } from './company/mode'
import { installGlobalHandlers, logInfo } from './services/log'

installGlobalHandlers()
logInfo('app_start', { build: import.meta.env.VITE_BUILD ?? 'dev' })

// A new deploy replaces the cached app and reloads the page, so a refresh always shows the latest version.
registerSW({ immediate: true, onRegisteredSW: (_url, reg) => { if (reg) setInterval(() => reg.update(), 60_000) } })

// Company mode loads in its own chunks, so the solo app at "/" stays as light as before.
const AdminApp = lazy(() => import('./company/admin/AdminApp'))
const CourierApp = lazy(() => import('./company/courier/CourierApp'))

const mode = modeFor(location.pathname, location.hostname)
const identity = identityFor(mode)
if (identity) applyIdentity(identity)
const root = mode === 'admin' ? <AdminApp /> : mode === 'courier' ? <CourierApp /> : <App />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>{root}</Suspense>
  </StrictMode>,
)
