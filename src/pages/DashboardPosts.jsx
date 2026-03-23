import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import useAuth from '../hooks/useAuth';
import useNotification from '../hooks/useNotification';
import { formatDate } from '../utils/formatters';

const RichTextEditor = lazy(() => import('../components/editors/RichTextEditor'));
const AiAssistant = lazy(() => import('../components/editors/AiAssistant'));

export default function DashboardPosts() {
  const { user } = useAuth();
  const { notify } = useNotification();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: '', content: '', excerpt: '', slug: '', status: 'published' });
  const [imageFile, setImageFile] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const editorRef = useRef(null);

  // Check AI availability
  useEffect(() => {
    api.get('/ai/status').then(data => setAiAvailable(data.available)).catch(() => {});
  }, []);

  // Unsaved changes warning
  useEffect(() => {
    if (!dirty) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const fetchPosts = async () => {
    try {
      const data = await api.get('/posts/all');
      setPosts(data.posts || []);
    } catch (err) { notify(err.message, 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchPosts(); }, []);

  const handleContentChange = useCallback((html) => {
    setForm(f => ({ ...f, content: html }));
    setDirty(true);
  }, []);

  const generateSlugFromTitle = (title) => {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  };

  const handleTitleChange = (e) => {
    const newTitle = e.target.value;
    setForm(f => ({ ...f, title: newTitle }));
    setDirty(true);
  };

  const handleSlugChange = (e) => {
    const newSlug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-|-$/g, '');
    setForm(f => ({ ...f, slug: newSlug }));
    setDirty(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('title', form.title);
      formData.append('content', form.content);
      formData.append('excerpt', form.excerpt);
      formData.append('slug', form.slug);
      formData.append('status', form.status);
      if (imageFile) formData.append('image', imageFile);

      if (editing) {
        await api.put(`/posts/${editing}`, formData);
        notify('Post updated!');
      } else {
        await api.post('/posts', formData);
        notify('Post created!');
      }
      resetForm();
      fetchPosts();
    } catch (err) { notify(err.message, 'error'); }
  };

  const deletePost = async (id) => {
    if (!window.confirm('Delete this post?')) return;
    try {
      await api.delete(`/posts/${id}`);
      notify('Post deleted');
      fetchPosts();
    } catch (err) { notify(err.message, 'error'); }
  };

  const editPost = (post) => {
    setForm({ title: post.title, content: post.content, excerpt: post.excerpt || '', slug: post.slug || '', status: post.status });
    setEditing(post.id);
    setShowForm(true);
    setDirty(false);
  };

  const resetForm = () => {
    setForm({ title: '', content: '', excerpt: '', slug: '', status: 'published' });
    setEditing(null);
    setShowForm(false);
    setImageFile(null);
    setDirty(false);
    setShowAi(false);
  };

  const handleAiInsert = useCallback((html) => {
    setForm(f => ({ ...f, content: f.content + html }));
    setDirty(true);
  }, []);

  return (
    <div className="section-padding bg-cream">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link to="/dashboard" className="text-sage text-sm hover:underline">&larr; Dashboard</Link>
            <h1 className="text-3xl font-bold text-charcoal mt-2">Blog Posts</h1>
          </div>
          <button onClick={() => { resetForm(); setShowForm(!showForm); }} className="btn-primary">
            {showForm ? 'Cancel' : '+ New Post'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl shadow-md p-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-charcoal">{editing ? 'Edit Post' : 'New Post'}</h2>
              {aiAvailable && (
                <button
                  type="button"
                  onClick={() => setShowAi(!showAi)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${showAi ? 'bg-sage text-white' : 'border border-sage text-sage hover:bg-sage/10'}`}
                >
                  AI Assistant
                </button>
              )}
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">Title *</label>
                <input type="text" value={form.title} onChange={handleTitleChange} required className="w-full border border-gray-200 rounded-lg px-4 py-3" />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">URL Slug *</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={handleSlugChange}
                  placeholder={form.title ? generateSlugFromTitle(form.title) : 'post-slug'}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Used in the post URL. Letters, numbers, and hyphens only.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">Excerpt</label>
                <input type="text" value={form.excerpt} onChange={e => { setForm({ ...form, excerpt: e.target.value }); setDirty(true); }} className="w-full border border-gray-200 rounded-lg px-4 py-3" placeholder="Brief summary..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">Content *</label>
                <Suspense fallback={<div className="border border-gray-200 rounded-lg p-8 text-center text-gray-500">Loading editor...</div>}>
                  <RichTextEditor value={form.content} onChange={handleContentChange} />
                </Suspense>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-2">Featured Image</label>
                  <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files[0])} className="w-full text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-2">Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border border-gray-200 rounded-lg px-4 py-3">
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary">{editing ? 'Update' : 'Publish'}</button>
                <button type="button" onClick={resetForm} className="px-6 py-3 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto"></div></div>
        ) : posts.length > 0 ? (
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-charcoal">Title</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-charcoal hidden md:table-cell">Author</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-charcoal hidden md:table-cell">Status</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-charcoal hidden md:table-cell">Date</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-charcoal">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {posts.map(post => (
                  <tr key={post.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <Link to={`/blog/${post.slug}`} className="font-medium text-charcoal hover:text-sage">{post.title}</Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 hidden md:table-cell">{post.author_name}</td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${post.status === 'published' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>{post.status}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 hidden md:table-cell">{formatDate(post.created_at)}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => editPost(post)} className="text-sage hover:underline text-sm mr-3">Edit</button>
                      <button onClick={() => deletePost(post.id)} className="text-red-500 hover:underline text-sm">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-xl">
            <p className="text-gray-500">No posts yet. Create your first post!</p>
          </div>
        )}
      </div>

      {showAi && (
        <Suspense fallback={null}>
          <AiAssistant type="blog" currentContent={form.content} onInsert={handleAiInsert} onClose={() => setShowAi(false)} />
        </Suspense>
      )}
    </div>
  );
}