import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import { InitialDataProvider } from './ssr/initial-data';

// Compared against the client build's <meta name="build-id"> at boot so a
// partial deploy (dist/ without dist-ssr/, or vice versa) disables SSR
// loudly instead of hydration-mismatching silently.
export const BUILD_ID = import.meta.env.VITE_BUILD_ID || 'dev';

export function render(url, initialData = {}) {
  const helmetContext = {};
  const html = renderToString(
    <HelmetProvider context={helmetContext}>
      <InitialDataProvider data={initialData}>
        <StaticRouter location={url}>
          <App />
        </StaticRouter>
      </InitialDataProvider>
    </HelmetProvider>
  );
  return { html, helmet: helmetContext.helmet };
}
