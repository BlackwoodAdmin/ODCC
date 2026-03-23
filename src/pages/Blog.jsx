import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import useFetch from '../hooks/useFetch';
import { formatDate } from '../utils/formatters';

export default function Blog() {
  const { data, loading } = useFetch('/posts');

  return (
    <div>
      <Helmet>
        <title>Blog - Open Door Christian Church</title>
        <meta name="description" content="Read blog posts, devotionals, and updates from Open Door Christian Church in DeLand, Florida." />
        <meta property="og:title" content="Blog - Open Door Christian Church" />
        <meta property="og:description" content="Read blog posts, devotionals, and updates from Open Door Christian Church in DeLand, Florida." />
        <meta property="og:image" content="https://church.cloud.webstack.ceo/uploads/church-header.jpg" />
        <meta property="og:url" content="https://opendoorchristian.church/blog" />
        <meta property="og:type" content="website" />
        <meta name="twitter:title" content="Blog - Open Door Christian Church" />
        <meta name="twitter:description" content="Read blog posts, devotionals, and updates from Open Door Christian Church in DeLand, Florida." />
        <meta name="twitter:image" content="https://church.cloud.webstack.ceo/uploads/church-header.jpg" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <section className="relative py-24 bg-charcoal text-white">
        <div className="container-custom text-center">
          <h1 className="text-5xl font-bold mb-4">Blog</h1>
          <p className="text-xl text-gray-300">News, devotionals, and updates from our church family</p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-custom">
          {loading ? (
            <div className="text-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto"></div></div>
          ) : data?.posts?.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {data.posts.map(post => (
                <Link key={post.id} to={`/blog/${post.slug}`} className="card group">
                  {post.featured_image ? (
                    <div className="h-52 overflow-hidden">
                      <img src={post.featured_image} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                  ) : (
                    <div className="h-52 bg-gradient-to-br from-sage/20 to-earth/20 flex items-center justify-center">
                      <span className="text-6xl">✂️</span>
                    </div>
                  )}
                  <div className="p-6">
                    <p className="text-sage text-sm font-medium mb-2">{formatDate(post.published_at || post.created_at)} · By {post.author_name}</p>
                    <h3 className="text-xl font-bold text-charcoal mb-2 group-hover:text-sage transition-colors">{post.title}</h3>
                    <p className="text-gray-600 text-sm">{post.excerpt || post.content?.replace(/<[^>]*>/g, '').substring(0, 120)}...</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📝</div>
              <h3 className="text-2xl font-bold text-charcoal mb-2">No Posts Yet</h3>
              <p className="text-gray-500">Blog posts will appear here soon!</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}