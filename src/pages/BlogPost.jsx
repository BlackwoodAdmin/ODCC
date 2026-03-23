import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import useFetch from '../hooks/useFetch';
import useAuth from '../hooks/useAuth';
import useNotification from '../hooks/useNotification';
import api from '../services/api';
import { formatDate, formatDateTime } from '../utils/formatters';

export default function BlogPost() {
  const { id: slug } = useParams();
  const { user } = useAuth();
  const { notify } = useNotification();
  const { data, loading, refetch } = useFetch(`/posts/${slug}`);
  const post = data?.post;
  const { data: commentsResponse, refetch: refetchComments } = useFetch(`/comments/post/${slug}`);
  const comments = commentsResponse?.comments || [];
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submitComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/comments/post/${slug}`, { content: comment });
      setComment('');
      refetchComments();
      notify('Comment posted!');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage"></div></div>;
  if (!post) return <div className="text-center py-24"><h2 className="text-2xl font-bold">Post not found</h2><Link to="/blog" className="text-sage mt-4 inline-block">Back to Blog</Link></div>;

  const pageUrl = `https://opendoorchristian.church/blog/${slug}`;
  const ogImage = post.featured_image || 'https://church.cloud.webstack.ceo/uploads/church-header.jpg';
  const description = post.excerpt || post.content?.replace(/<[^>]*>/g, '').substring(0, 160);

  return (
    <div>
      <Helmet>
        <title>{post.title} - Open Door Christian Church</title>
        <meta name="description" content={description} />
        
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={pageUrl} />
        
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />
      </Helmet>

      <section className="relative py-24 bg-charcoal text-white">
        <div className="container-custom text-center max-w-3xl">
          <p className="text-sage text-sm font-medium mb-4">{formatDate(post.published_at || post.created_at)} · By {post.author_name}</p>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{post.title}</h1>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-custom max-w-3xl">
          {post.featured_image && (
            <img src={post.featured_image} alt={post.title} className="w-full rounded-xl mb-8 shadow-md" />
          )}
          <div className="prose prose-lg max-w-none text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: post.content }} />

          {/* Comments */}
          <div className="mt-16 border-t border-gray-200 pt-12">
            <h3 className="text-2xl font-bold text-charcoal mb-8">Comments ({comments.length})</h3>

            {user ? (
              <form onSubmit={submitComment} className="mb-10">
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Share your thoughts..."
                  rows={4}
                  className="w-full border border-gray-200 rounded-xl p-4 text-gray-700 resize-none"
                  required
                />
                <button type="submit" disabled={submitting} className="btn-primary mt-3">
                  {submitting ? 'Posting...' : 'Post Comment'}
                </button>
              </form>
            ) : (
              <div className="bg-cream rounded-xl p-6 mb-10 text-center">
                <p className="text-gray-600"><Link to="/login" className="text-sage font-semibold hover:underline">Log in</Link> or <Link to="/register" className="text-sage font-semibold hover:underline">register</Link> to leave a comment.</p>
              </div>
            )}

            <div className="space-y-6">
              {comments.map(c => (
                <div key={c.id} className="bg-cream rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-sage text-white rounded-full flex items-center justify-center font-bold">{c.author_name?.[0]?.toUpperCase()}</div>
                    <div>
                      <p className="font-semibold text-charcoal">{c.author_name}</p>
                      <p className="text-xs text-gray-400">{formatDateTime(c.created_at)}</p>
                    </div>
                  </div>
                  <p className="text-gray-600">{c.content}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-12">
            <Link to="/blog" className="text-sage font-semibold hover:underline">← Back to Blog</Link>
          </div>
        </div>
      </section>
    </div>
  );
}