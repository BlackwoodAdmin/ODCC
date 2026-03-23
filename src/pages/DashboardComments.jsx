import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import useNotification from '../hooks/useNotification';
import { formatDateTime } from '../utils/formatters';

export default function DashboardComments() {
  const { notify } = useNotification();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchComments = async () => {
    setLoading(true);
    try {
      const data = await api.get('/comments/all');
      setComments(data.comments || []);
    } catch (err) { notify(err.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchComments(); }, []);

  const approveComment = async (id) => {
    try {
      await api.put(`/comments/${id}/approve`);
      notify('Comment approved');
      fetchComments();
    } catch (err) { notify(err.message, 'error'); }
  };

  const deleteComment = async (id) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await api.delete(`/comments/${id}`);
      notify('Comment deleted');
      fetchComments();
    } catch (err) { notify(err.message, 'error'); }
  };

  const filtered = filter === 'pending'
    ? comments.filter(c => !c.approved)
    : filter === 'approved'
    ? comments.filter(c => c.approved)
    : comments;

  const pendingCount = comments.filter(c => !c.approved).length;

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        <Link to="/dashboard" className="text-sage text-sm hover:underline">← Dashboard</Link>
        <div className="flex items-center justify-between mt-2 mb-6">
          <h1 className="text-3xl font-bold text-charcoal">Comments</h1>
          {pendingCount > 0 && (
            <span className="bg-amber-100 text-amber-700 text-sm font-medium px-3 py-1 rounded-full">
              {pendingCount} pending approval
            </span>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {['all', 'pending', 'approved'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                filter === f ? 'bg-sage text-white' : 'bg-white text-charcoal hover:bg-sage/10'
              }`}
            >
              {f}{f === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto"></div></div>
        ) : filtered.length > 0 ? (
          <div className="space-y-4">
            {filtered.map(c => (
              <div key={c.id} className={`bg-white rounded-xl p-6 shadow-md border-l-4 ${
                c.approved ? 'border-sage' : 'border-amber-400'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-charcoal">{c.author_name}</span>
                      <span className="text-xs text-gray-400">{formatDateTime(c.created_at)}</span>
                      {!c.approved && (
                        <span className="bg-amber-100 text-amber-600 text-xs px-2 py-0.5 rounded-full font-medium">Pending</span>
                      )}
                    </div>
                    {c.post_title && (
                      <p className="text-sm text-sage mb-2">
                        On: <Link to={`/blog/${c.post_slug}`} className="hover:underline">{c.post_title}</Link>
                      </p>
                    )}
                    <p className="text-gray-600">{c.content}</p>
                  </div>
                  <div className="flex gap-3 ml-4">
                    {!c.approved && (
                      <button
                        onClick={() => approveComment(c.id)}
                        className="text-sage hover:underline text-sm font-medium"
                      >
                        Approve
                      </button>
                    )}
                    <button
                      onClick={() => deleteComment(c.id)}
                      className="text-red-500 hover:underline text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-xl">
            <p className="text-gray-500">
              {filter === 'pending' ? 'No pending comments.' : filter === 'approved' ? 'No approved comments.' : 'No comments yet.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
