import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Router } from 'wouter'
import { registerSW } from 'virtual:pwa-register'
import './index.scss'
import './views/shared.css'
import { App } from '@app/app'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <App />
    </Router>
  </StrictMode>,
)
