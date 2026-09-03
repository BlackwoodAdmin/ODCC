import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

const SUGGESTIONS = [
  { to: '/', icon: '🏠', label: 'Home', blurb: 'Start from the front door.' },
  { to: '/services', icon: '⛪', label: 'Service Times', blurb: 'Sunday and Wednesday worship, including the drive-in.' },
  { to: '/events', icon: '📅', label: 'Events', blurb: 'What is coming up at the church.' },
  { to: '/blog', icon: '📝', label: 'Blog', blurb: 'Sermons, devotionals, and news.' },
  { to: '/give', icon: '💝', label: 'Give', blurb: 'Support the ministry online.' },
  { to: '/contact', icon: '✉️', label: 'Contact Us', blurb: 'Send a message or a prayer request.' },
];

export default function NotFound() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1;

  return (
    <div>
      <Helmet>
        <title>Page Not Found - Open Door Christian Church</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      <section className="relative py-24 bg-charcoal text-white">
        <div className="container-custom text-center">
          <p className="text-7xl font-bold text-sage-400 mb-2" aria-hidden="true">404</p>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">We couldn't find that page</h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            The address <code className="bg-white/10 rounded px-2 py-0.5 text-cream-300 break-all">{pathname}</code> doesn't exist,
            may have moved, or the link had a typo.
          </p>
          <p className="mt-6 text-gray-400 italic">"Seek, and you will find." — Matthew 7:7</p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-custom max-w-5xl">
          <div className="flex flex-wrap justify-center gap-3 mb-12">
            <Link to="/" className="btn-primary">Go to the homepage</Link>
            {canGoBack && (
              <button type="button" onClick={() => navigate(-1)} className="btn-secondary">Go back</button>
            )}
          </div>
          <h2 className="text-2xl font-bold text-charcoal text-center mb-8">Maybe you were looking for one of these</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {SUGGESTIONS.map((s) => (
              <Link key={s.to} to={s.to} className="bg-cream rounded-xl p-6 hover:shadow-md transition-shadow">
                <div className="text-3xl mb-2" aria-hidden="true">{s.icon}</div>
                <h3 className="font-bold text-charcoal">{s.label}</h3>
                <p className="text-sm text-gray-600 mt-1">{s.blurb}</p>
              </Link>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-12">
            Still stuck? Email <a href="mailto:hello@opendoorchristian.church" className="text-sage hover:underline">hello@opendoorchristian.church</a> and tell us what you were looking for.
          </p>
        </div>
      </section>
    </div>
  );
}
