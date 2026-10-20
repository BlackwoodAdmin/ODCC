// SSR route table for the public pages: per-page head tags (the former
// STATIC_OG_PAGES) plus, where a page fetches data on mount, a loader.
//
// SSR contract (see CLAUDE.md): a loader's keys must byte-match the URL the
// page passes to useFetch, and values are the exact API response envelope
// (e.g. { events: [...] }), never a bare array.
import { getPublicEvents, getPublishedPosts, currentMonthET } from './lib/page-data.js';
import { SITE_URL } from './ssr.js';

export const DEFAULT_HEAD = {
  title: 'Open Door Christian Church - DeLand, FL',
  description: 'Welcome to Open Door Christian Church in DeLand, Florida. Join us for worship services, community events, and fellowship.',
};

export const SSR_PAGES = [
  {
    path: '/',
    head: { ...DEFAULT_HEAD, urlPath: '/' },
    loader: async () => ({
      '/posts?limit=3': await getPublishedPosts({ page: 1, limit: 3 }),
      '/events?days=10': { events: await getPublicEvents({ days: 10 }) },
    }),
  },
  {
    path: '/events',
    head: {
      title: 'Events - Open Door Christian Church',
      description: 'See upcoming worship services, community events, and fellowship opportunities at Open Door Christian Church in DeLand, Florida.',
      urlPath: '/events',
    },
    loader: async () => {
      const { month, year } = currentMonthET();
      // Unpadded month/year: must byte-match the client's template literal
      return { [`/events?month=${month}&year=${year}`]: { events: await getPublicEvents({ month, year }) } };
    },
  },
  {
    path: '/blog',
    head: {
      title: 'Blog - Open Door Christian Church',
      description: 'Read the latest from Open Door Christian Church — sermons, devotionals, community news, and reflections on faith.',
      urlPath: '/blog',
    },
    loader: async () => ({
      '/posts?limit=18&page=1': await getPublishedPosts({ page: 1, limit: 18 }),
    }),
  },
  {
    path: '/about',
    head: {
      title: 'About Our Church - Open Door Christian Church',
      description: 'Founded in 1986, Open Door Christian Church serves DeLand, Florida with Scripture-based, Christ-centered worship — including our beloved drive-in service on 87.9 FM.',
      urlPath: '/about',
    },
  },
  {
    path: '/services',
    head: {
      title: 'Service Times - Open Door Christian Church',
      description: 'Join us for worship at Open Door Christian Church in DeLand, Florida. Communion every Sunday and our unique drive-in service tradition.',
      urlPath: '/services',
    },
  },
  {
    path: '/give',
    head: {
      title: 'Give - Open Door Christian Church',
      description: 'Support the ministry of Open Door Christian Church through online giving. Your generosity helps us serve DeLand and beyond.',
      urlPath: '/give',
    },
  },
  {
    path: '/contact',
    head: {
      title: 'Contact Us - Open Door Christian Church',
      description: 'Get in touch with Open Door Christian Church in DeLand, Florida. Submit a prayer request or send us a message.',
      urlPath: '/contact',
    },
  },
  {
    path: '/joy-ladies-circle',
    head: {
      title: 'J.O.Y. Ladies Circle - Open Door Christian Church',
      description: 'Jesus · Others · Yourself. All women are welcome at the J.O.Y. Ladies Circle of Open Door Christian Church in DeLand, Florida.',
      urlPath: '/joy-ladies-circle',
    },
  },
  {
    path: '/chili-cookoff',
    head: {
      title: 'Jr Chili Cook-Off Sign-Up - Fall Festival 2026 - Open Door Christian Church',
      description: 'Register your junior chef (ages 7-19) for the Jr Chili Cook-Off at our Free Family Fall Festival, Saturday, October 17, 2026, 9 AM - 3 PM in DeLand, Florida. Online sign-up open until festival morning.',
      image: `${SITE_URL}/fall-festival-2026.jpg`,
      urlPath: '/chili-cookoff',
    },
    // No loader: the page is past its event and slated for retirement;
    // its status check stays client-side.
  },
  {
    path: '/our-pastor',
    head: {
      title: 'Meet Pastor Stephen Presley - Open Door Christian Church',
      description: 'Pastor Stephen Presley serves Open Door Christian Church in DeLand, Florida — a calling forty years in the making.',
      image: `${SITE_URL}/our-pastor.webp`,
      type: 'profile',
      urlPath: '/our-pastor',
    },
  },
];
