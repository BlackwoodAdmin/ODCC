import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

// Smoke test: the Fall Festival pages must render without throwing. Catches
// runtime mistakes (undefined identifiers, bad hook usage) that the build
// does not. Effects do not run under renderToString, so no network is hit.

const { NotificationProvider } = await import('../../src/contexts/NotificationContext.jsx');
const { default: ChiliCookoff } = await import('../../src/pages/ChiliCookoff.jsx');
const { default: DashboardChiliCookoff } = await import('../../src/pages/DashboardChiliCookoff.jsx');

function render(Component) {
  return renderToString(
    React.createElement(HelmetProvider, null,
      React.createElement(NotificationProvider, null,
        React.createElement(MemoryRouter, null, React.createElement(Component))))
  );
}

describe('Fall Festival pages', () => {
  it('public sign-up page renders', () => {
    const html = render(ChiliCookoff);
    expect(html).toContain('Jr Chili Cook-Off');
    expect(html).toContain('Saturday, October 17, 2026');
    expect(html).toContain('/fall-festival-2026.webp');
    expect(html).toContain('Awards ceremony at <strong>2:30 PM</strong>');
  });

  it('admin roster page renders', () => {
    const html = render(DashboardChiliCookoff);
    expect(html).toContain('Jr Chili Cook-Off');
    expect(html).toContain('/chili-cookoff');
  });
});
