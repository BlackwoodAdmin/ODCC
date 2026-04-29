import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import useNotification from '../hooks/useNotification';
import { formatDateTime } from '../utils/formatters';

export default function DashboardComments() {
  const { notify } = useNotification();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchComments = async () => {
    try {
      const data = await api.get('/comments/all');
      setComments(data.comments || data || []);
    } catch (err) { notify(err.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchComments(); }, []);

  const deleteComment = async (id) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      await api.delete(`/comments/${id}`);
      notify('Comment deleted');
      fetchComments();
    } catch (err) { notify(err.message, 'error'); }
  };

  const approveComment = async (id) => {
    try {
      await api.put(`/comments/${id}/approve`);
      notify('Comment approved');
      fetchComments();
    } catch (err) { notify(err.message, 'error'); }
  };

  const pending = comments.filter(c => !c.approved);
  const approved = comments.filter(c => c.approved);
  const ordered = [...pending, ...approved];

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        <Link to="/dashboard" className="text-sage text-sm hover:underline">← Dashboard</Link>
        <div className="flex items-baseline justify-between mt-2 mb-8">
          <h1 className="text-3xl font-bold text-charcoal">Comments</h1>
          {pending.length > 0 && <span className="text-sm text-amber-700 bg-amber-100 px-3 py-1 rounded-full">{pending.length} pending</span>}
        </div>

        {loading ? (
          <div className="text-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto"></div></div>
        ) : ordered.length > 0 ? (
          <div className="space-y-4">
            {ordered.map(c => (
              <div key={c.id} className={`rounded-xl p-6 shadow-md ${c.approved ? 'bg-white' : 'bg-amber-50 border border-amber-200'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="font-semibold text-charcoal">{c.author_name}</span>
                      <span className="text-xs text-gray-400">{formatDateTime(c.created_at)}</span>
                      {!c.approved && <span className="text-xs text-amber-700 bg-amber-200 px-2 py-0.5 rounded-full">Pending</span>}
                    </div>
                    {c.post_title && <p className="text-sm text-sage mb-2">On: <Link to={`/blog/${c.post_slug || c.post_id}`} className="hover:underline">{c.post_title}</Link></p>}
                    <p className="text-gray-600">{c.content}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-4">
                    {!c.approved && <button onClick={() => approveComment(c.id)} className="text-sage hover:underline text-sm font-semibold">Approve</button>}
                    <button onClick={() => deleteComment(c.id)} className="text-red-500 hover:underline text-sm">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-xl"><p className="text-gray-500">No comments yet.</p></div>
        )}
      </div>
    </div>
  );
}
