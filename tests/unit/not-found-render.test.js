import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

const { default: NotFound } = await import('../../src/pages/NotFound.jsx');

describe('NotFound page', () => {
  it('renders the requested path and recovery links', () => {
    const html = renderToString(
      React.createElement(HelmetProvider, null,
        React.createElement(MemoryRouter, { initialEntries: ['/no-such-page'] }, React.createElement(NotFound)))
    );
    expect(html).toContain('404');
    expect(html).toContain("We couldn&#x27;t find that page");
    expect(html).toContain('/no-such-page');
    expect(html).toContain('href="/contact"');
  });
});
