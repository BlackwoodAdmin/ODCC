import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import useNotification from '../hooks/useNotification';
import { formatDate, formatDateTime } from '../utils/formatters';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'contact', label: 'Contact' },
  { key: 'prayer', label: 'Prayer' },
  { key: 'visit', label: 'Visitors' },
];

export default function DashboardMessages() {
  const { notify } = useNotification();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('all');

  const fetchMessages = async () => {
    try {
      const data = await api.get('/contact');
      setMessages(data.messages || []);
    } catch (err) { notify(err.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMessages(); }, []);

  const unreadCount = messages.filter(m => !m.read).length;
  const filtered = messages.filter(m => filter === 'all' || (m.type || 'contact') === filter);

  const markAsRead = async (id) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, read: true } : m));
    try {
      await api.put(`/contact/${id}/read`);
    } catch { /* persists on next page load */ }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/contact/read-all');
      setMessages(prev => prev.map(m => ({ ...m, read: true })));
      notify('All messages marked as read');
    } catch (err) { notify(err.message, 'error'); }
  };

  const toggleExpand = (m) => {
    const opening = expandedId !== m.id;
    setExpandedId(opening ? m.id : null);
    if (opening && !m.read) {
      markAsRead(m.id);
    }
  };

  const toggleFollowedUp = async (m) => {
    const next = !m.followed_up;
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, followed_up: next } : x));
    try {
      await api.put(`/contact/${m.id}/followed-up`, { followedUp: next });
    } catch (err) {
      setMessages(prev => prev.map(x => x.id === m.id ? { ...x, followed_up: !next } : x));
      notify(err.message, 'error');
    }
  };

  const deleteMessage = async (id) => {
    if (!window.confirm('Delete this message?')) return;
    try {
      await api.delete(`/contact/${id}`);
      notify('Message deleted');
      if (expandedId === id) setExpandedId(null);
      setMessages(prev => prev.filter(m => m.id !== id));
    } catch (err) { notify(err.message, 'error'); }
  };

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        <Link to="/dashboard" className="text-sage text-sm hover:underline">← Dashboard</Link>
        <div className="flex items-center justify-between mt-2 mb-8">
          <h1 className="text-3xl font-bold text-charcoal">Messages</h1>
          {unreadCount > 0 && (
            <button onClick={markAllAsRead} className="text-sm text-sage hover:text-sage-700 font-medium">
              Mark All as Read ({unreadCount})
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {FILTERS.map(f => {
            const count = f.key === 'all' ? messages.length : messages.filter(m => (m.type || 'contact') === f.key).length;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-sm font-medium px-4 py-1.5 rounded-full transition-colors ${filter === f.key ? 'bg-sage text-white' : 'bg-white text-charcoal hover:bg-sage/10'}`}
              >
                {f.label} ({count})
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="text-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto"></div></div>
        ) : filtered.length > 0 ? (
          <div className="space-y-3">
            {filtered.map(m => {
              const isExpanded = expandedId === m.id;
              const isUnread = !m.read;
              return (
                <div
                  key={m.id}
                  className={`bg-white rounded-xl shadow-md overflow-hidden border-l-3 ${isUnread ? 'border-l-sage-500' : 'border-l-transparent'}`}
                >
                  <div
                    onClick={() => toggleExpand(m)}
                    className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-cream-50 transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-3 min-w-0">
                      <span className={`truncate ${isUnread ? 'font-semibold text-charcoal' : 'text-gray-700'}`}>{m.name}</span>
                      {m.type === 'prayer' && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">Prayer</span>}
                      {m.type === 'visit' && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Visitor</span>}
                      {m.type === 'visit' && m.followed_up && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ Followed up</span>}
                      <span className={`text-sm truncate ${isUnread ? 'text-gray-600' : 'text-gray-500'}`}>{m.email}</span>
                      {m.phone && <span className="text-sm text-gray-400 truncate">{m.phone}</span>}
                    </div>
                    <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                      <span className={`text-xs ${isUnread ? 'font-semibold text-charcoal' : 'text-gray-400'}`}>{formatDateTime(m.created_at)}</span>
                      <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="px-6 pb-4 border-t border-gray-100">
                      {m.type === 'visit' && m.visit_date && (
                        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-4 inline-block">
                          📅 Planning to visit: <span className="font-semibold">{formatDate(m.visit_date)}</span>
                        </p>
                      )}
                      <p className="text-gray-600 mt-4 whitespace-pre-wrap">{m.message}</p>
                      <div className="mt-4 flex items-center justify-end gap-4">
                        {m.type === 'visit' && (
                          <button
                            onClick={() => toggleFollowedUp(m)}
                            className={`text-sm font-medium ${m.followed_up ? 'text-gray-400 hover:text-charcoal' : 'text-sage hover:underline'}`}
                          >
                            {m.followed_up ? 'Undo follow-up' : 'Mark followed up'}
                          </button>
                        )}
                        <button onClick={() => deleteMessage(m.id)} className="text-red-500 hover:underline text-sm">Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-xl"><p className="text-gray-500">No messages yet.</p></div>
        )}
      </div>
    </div>
  );
}
