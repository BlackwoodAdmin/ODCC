import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../services/api';
import Turnstile from './Turnstile';

const DISMISS_DAYS = 7;
const SUBMIT_DAYS = 30;
const STORAGE_KEY = 'exitPopupDismissed';
const EXCLUDED_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

function isSuppressed() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return false;
    const { at, type } = JSON.parse(stored);
    const days = type === 'submit' ? SUBMIT_DAYS : DISMISS_DAYS;
    return Date.now() - at < days * 86400000;
  } catch {
    return false;
  }
}

function suppress(type) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: Date.now(), type }));
}

export default function ExitPopup({ open, onClose }) {
  const { pathname } = useLocation();
  const [mode, setMode] = useState('subscribe');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [resultMsg, setResultMsg] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);
  const cardRef = useRef(null);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        suppress('dismiss');
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open && !isSuppressed() && !EXCLUDED_PATHS.includes(pathname)) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open, pathname]);

  // TODO: restore suppression after testing
  if (!open) return null;

  const handleOverlayClick = (e) => {
    if (cardRef.current && !cardRef.current.contains(e.target)) {
      suppress('dismiss');
      onClose();
    }
  };

  const handleDismiss = () => {
    suppress('dismiss');
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      if (mode === 'subscribe') {
        await api.post('/newsletter', { email, turnstileToken });
        setResultMsg('Thank you for subscribing!');
      } else {
        await api.post('/contact/prayer', { name, email, message, turnstileToken });
        setResultMsg('Your prayer request has been received. We are praying with you.');
      }
      setTurnstileToken('');
      setResult('success');
      suppress('submit');
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      if (err.data?.code === 'TURNSTILE_REQUIRED' || err.data?.code === 'TURNSTILE_FAILED') {
        setTurnstileReset(prev => prev + 1);
      }
      setResult('error');
      setResultMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity"
      onClick={handleOverlayClick}
    >
      <div
        ref={cardRef}
        className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4 relative transform transition-transform scale-100"
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-gray-400 hover:text-charcoal transition-colors"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-2xl font-bold text-charcoal text-center mb-2">Before You Go...</h2>
        <p className="text-gray-500 text-center text-sm mb-6">We'd love to stay connected with you</p>

        {result === 'success' ? (
          <div className="bg-green-50 text-green-700 p-4 rounded-lg text-center">
            <p className="font-semibold">{resultMsg}</p>
          </div>
        ) : (
          <>
            {/* Mode toggle */}
            <div className="flex rounded-lg overflow-hidden mb-6 border border-gray-200">
              <button
                type="button"
                onClick={() => setMode('subscribe')}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${mode === 'subscribe' ? 'bg-sage text-white' : 'bg-gray-50 text-charcoal hover:bg-gray-100'}`}
              >
                Stay Connected
              </button>
              <button
                type="button"
                onClick={() => setMode('prayer')}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${mode === 'prayer' ? 'bg-sage text-white' : 'bg-gray-50 text-charcoal hover:bg-gray-100'}`}
              >
                Prayer Request
              </button>
            </div>

            {result === 'error' && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{resultMsg}</div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'prayer' && (
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm"
                    placeholder="Your name"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-charcoal mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm"
                  placeholder="your@email.com"
                />
              </div>

              {mode === 'prayer' && (
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1">How can we pray for you?</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    maxLength={5000}
                    rows={3}
                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm resize-none"
                    placeholder="Share your prayer request..."
                  />
                </div>
              )}

              <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />

              <button
                type="submit"
                disabled={submitting}
                className="btn-primary w-full !py-3 text-sm"
              >
                {submitting
                  ? 'Submitting...'
                  : mode === 'subscribe'
                    ? 'Subscribe to Newsletter'
                    : 'Submit Prayer Request'
                }
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
