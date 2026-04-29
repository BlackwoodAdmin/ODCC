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

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        <Link to="/dashboard" className="text-sage text-sm hover:underline">← Dashboard</Link>
        <h1 className="text-3xl font-bold text-charcoal mt-2 mb-8">Comments</h1>

        {loading ? (
          <div className="text-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto"></div></div>
        ) : comments.length > 0 ? (
          <div className="space-y-4">
            {comments.map(c => (
              <div key={c.id} className="bg-white rounded-xl p-6 shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-charcoal">{c.author_name}</span>
                      <span className="text-xs text-gray-400">{formatDateTime(c.created_at)}</span>
                    </div>
                    {c.post_title && <p className="text-sm text-sage mb-2">On: <Link to={`/blog/${c.post_id}`} className="hover:underline">{c.post_title}</Link></p>}
                    <p className="text-gray-600">{c.content}</p>
                  </div>
                  <button onClick={() => deleteComment(c.id)} className="text-red-500 hover:underline text-sm ml-4">Delete</button>
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
