import React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import App from './App'
import { InitialDataProvider } from './ssr/initial-data'
import './index.css'

const container = document.getElementById('root')

const app = (
  <React.StrictMode>
    <HelmetProvider>
      <InitialDataProvider data={typeof window !== 'undefined' ? window.__INITIAL_DATA__ || {} : {}}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </InitialDataProvider>
    </HelmetProvider>
  </React.StrictMode>
)

// SSR pages arrive with rendered children in #root → hydrate. The dev server
// and the SPA-shell fallback serve an empty root (the <!--ssr-outlet-->
// comment is not an element) → plain client render.
if (container.firstElementChild) {
  hydrateRoot(container, app)
} else {
  createRoot(container).render(app)
}
