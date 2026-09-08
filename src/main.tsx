import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/fonts.css'
import './ui/tokens.css'
import { App } from './ui/App'
import { ErrorBoundary } from './ui/ErrorBoundary'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}
