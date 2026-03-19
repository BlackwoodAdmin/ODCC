import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import Turnstile from './common/Turnstile';

export default function PrayerRequestModal({ isOpen, onClose }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [resultMsg, setResultMsg] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileKey, setTurnstileKey] = useState(0);

  const handleToken = useCallback((token) => setTurnstileToken(token), []);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setEmail('');
      setMessage('');
      setResult(null);
      setResultMsg('');
      setTurnstileToken('');
      setTurnstileKey(k => k + 1);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      await api.post('/contact/prayer', { name, email, message, turnstileToken });
      setResult('success');
      setResultMsg('Your prayer request has been received. We are praying with you.');
      setTimeout(() => onClose(), 2500);
    } catch (err) {
      if (err.data?.code === 'TURNSTILE_REQUIRED' || err.data?.code === 'TURNSTILE_FAILED') {
        setTurnstileKey(k => k + 1);
        setTurnstileToken('');
      }
      setResult('error');
      setResultMsg(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-sage px-6 py-5 text-center">
          <h2 className="text-xl font-bold text-white">Prayer Request</h2>
          <p className="text-white/80 text-sm mt-1">Let us pray with you</p>
        </div>

        {result === 'success' ? (
          <div className="p-8 text-center">
            <div className="text-5xl mb-4">🙏</div>
            <h3 className="text-lg font-bold text-charcoal mb-2">Thank You</h3>
            <p className="text-gray-600">{resultMsg}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {result === 'error' && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{resultMsg}</div>
            )}

            <div>
              <label className="block text-sm font-semibold text-charcoal mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                maxLength={255}
                placeholder="Your name"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-charcoal mb-1">Email *</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                maxLength={255}
                placeholder="your@email.com"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-charcoal mb-1">How can we pray for you? *</label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                required
                maxLength={5000}
                rows={4}
                placeholder="Share your prayer request..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none resize-none"
              />
            </div>

            <Turnstile onToken={handleToken} resetKey={turnstileKey} />

            <button
              type="submit"
              disabled={submitting || !turnstileToken}
              className="w-full py-3 bg-sage text-white font-semibold rounded-lg hover:bg-sage/90 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Prayer Request'}
            </button>
          </form>
        )}

        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-white/70 hover:text-white p-1"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
