import React from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import useFetch from '../hooks/useFetch';

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats } = useFetch('/dashboard/stats');

  const profileCard = { to: '/dashboard/profile', label: 'My Profile', count: null, icon: '👤', color: 'bg-slate-50 text-slate-600' };
  const directoryCard = { to: '/dashboard/directory', label: 'Church Directory', count: null, icon: '📖', color: 'bg-cyan-50 text-cyan-600' };
  const donationCard = { to: '/dashboard/donations', label: 'My Donations', count: stats?.donations?.total || 0, icon: '💝', color: 'bg-rose-50 text-rose-600' };
  const donationAdminCard = { to: '/dashboard/admin/donations', label: 'Donation Reports', count: null, icon: '📊', color: 'bg-emerald-50 text-emerald-600' };

  const adminCards = [
    { to: '/dashboard/posts', label: 'Blog Posts', count: stats?.posts?.total || 0, icon: '📝', color: 'bg-blue-50 text-blue-600' },
    { to: '/dashboard/events', label: 'Events', count: stats?.events?.total || 0, icon: '📅', color: 'bg-green-50 text-green-600' },
    { to: '/dashboard/comments', label: 'Comments', count: stats?.comments?.total || 0, icon: '💬', color: 'bg-purple-50 text-purple-600' },
    { to: '/dashboard/messages', label: 'Messages', count: stats?.messages?.total || 0, unread: Number(stats?.messages?.unread) || 0, icon: '✉️', color: 'bg-orange-50 text-orange-600' },
    { to: '/dashboard/users', label: 'Users', count: stats?.users?.total || 0, icon: '👥', color: 'bg-pink-50 text-pink-600' },
    { to: '/dashboard/newsletter', label: 'Newsletter', count: null, icon: '📰', color: 'bg-amber-50 text-amber-600' },
    { to: '/dashboard/email', label: 'Email', count: null, icon: '📧', color: 'bg-teal-50 text-teal-600' },
    { to: '/dashboard/admin/email', label: 'Email Admin', count: null, icon: '⚙️', color: 'bg-indigo-50 text-indigo-600' },
    donationCard,
    donationAdminCard,
    directoryCard,
    profileCard,
  ];

  const emailCard = { to: '/dashboard/email', label: 'Email', count: null, icon: '📧', color: 'bg-teal-50 text-teal-600' };
  const contributorCards = [...adminCards.filter(c => ['/dashboard/posts', '/dashboard/events'].includes(c.to)), emailCard, donationCard, directoryCard, profileCard];
  const subscriberCards = [emailCard, donationCard, directoryCard, profileCard];
  const cards = user?.role === 'admin' ? adminCards : user?.role === 'contributor' ? contributorCards : subscriberCards;

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        <div className="mb-10">
          <h1 className="text-4xl font-bold text-charcoal mb-2">Dashboard</h1>
          <p className="text-gray-500">Welcome back, {user?.name}! <span className="bg-sage/10 text-sage px-2 py-1 rounded text-xs font-semibold uppercase">{user?.role}</span></p>
        </div>

        {cards.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {cards.map(card => (
              <Link key={card.to} to={card.to} className="bg-white rounded-xl p-6 shadow-md hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${card.color}`}>{card.icon}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-bold text-charcoal">{card.count}</span>
                    {card.unread > 0 && (
                      <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">{card.unread} new</span>
                    )}
                  </div>
                </div>
                <h3 className="font-semibold text-charcoal">{card.label}</h3>
                <p className="text-sm text-gray-400 mt-1">{card.count !== null ? `${card.count} total` : 'Open'}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl p-8 shadow-md">
            <h3 className="text-xl font-bold text-charcoal mb-2">Subscriber Account</h3>
            <p className="text-gray-600">As a subscriber, you can leave comments on blog posts and receive our newsletter. Visit the <Link to="/blog" className="text-sage font-semibold hover:underline">blog</Link> to join the conversation!</p>
          </div>
        )}
      </div>
    </div>
  );
}
