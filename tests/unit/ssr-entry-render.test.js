// Renders every public route through the real SSR entry under Node.
// Doubles as the import canary: it pulls the whole App graph into Node, so
// any module-level window/document access in a page or dependency fails here.
import { describe, it, expect } from 'vitest';
import { render } from '../../src/entry-server.jsx';

const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
const MONTH = et.getMonth() + 1;
const YEAR = et.getFullYear();

const POST = {
  id: 1,
  slug: 'ssr-fixture-post',
  title: 'SSR Fixture Post Title',
  excerpt: 'A fixture excerpt for SSR tests',
  content: '<p>Fixture body with <strong>bold text</strong> inside.</p>',
  featured_image: null,
  status: 'published',
  published_at: '1760000000000',
  created_at: '1760000000000',
  author_name: 'Fixture Author',
};

const EVENT = {
  id: 1,
  title: 'SSR Fixture Event',
  description: 'Fixture event description',
  location: 'Fellowship Hall',
  event_date: `${YEAR}-${String(MONTH).padStart(2, '0')}-15`,
  event_time: '18:00:00',
  end_time: null,
  recurrence: null,
  author_name: 'Fixture Author',
};

const COMMENT = { id: 1, post_id: 1, author_name: 'Fixture Commenter', content: 'A fixture comment', created_at: '1760000000000' };

const STATIC_ROUTES = [
  '/about', '/our-pastor', '/services', '/give', '/contact',
  '/chili-cookoff', '/joy-ladies-circle', '/login', '/register',
  '/forgot-password', '/reset-password', '/unsubscribe',
];

describe('entry-server render', () => {
  it('renders the homepage with preloaded posts and events', () => {
    const { html } = render('/', {
      '/posts?limit=3': { posts: [POST], total: 1, page: 1, limit: 3 },
      '/events?days=10': { events: [EVENT] },
    });
    expect(html).toContain('Open Door');
    expect(html).toContain('SSR Fixture Post Title');
    expect(html).toContain('SSR Fixture Event');
  });

  it('renders the events calendar with preloaded month data and no spinner', () => {
    const { html } = render('/events', {
      [`/events?month=${MONTH}&year=${YEAR}`]: { events: [EVENT] },
    });
    expect(html).toContain('SSR Fixture Event');
    expect(html).not.toContain('animate-spin');
  });

  it('renders the blog list with preloaded page 1', () => {
    const { html } = render('/blog', {
      '/posts?limit=18&page=1': { posts: [POST], total: 1, page: 1, limit: 18 },
    });
    expect(html).toContain('SSR Fixture Post Title');
    expect(html).not.toContain('animate-spin');
  });

  it('renders a blog post with content, comments, and no spinner', () => {
    const { html } = render('/blog/ssr-fixture-post', {
      '/posts/ssr-fixture-post': { post: POST },
      '/comments/post/ssr-fixture-post': { comments: [COMMENT] },
    });
    expect(html).toContain('SSR Fixture Post Title');
    expect(html).toContain('<strong>bold text</strong>');
    expect(html).toContain('Fixture Commenter');
    expect(html).not.toContain('animate-spin');
  });

  for (const route of STATIC_ROUTES) {
    it(`renders ${route} without data`, () => {
      const { html } = render(route, {});
      expect(html).toContain('Open Door');
      expect(html.length).toBeGreaterThan(2000);
    });
  }

  it('renders the NotFound page for unknown URLs', () => {
    const { html } = render('/no-such-page', {});
    // React escapes the apostrophe in "couldn't" as &#x27;
    expect(html).toContain('find that page');
  });

  it('renders the dashboard as a spinner only (never SSR content)', () => {
    const { html } = render('/dashboard', {});
    expect(html).toContain('animate-spin');
  });
});
