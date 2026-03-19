import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import Turnstile from './common/Turnstile';

export default function RegisterModal({ isOpen, onClose }) {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTurnstileToken = useCallback((token) => setTurnstileToken(token), []);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setEmail('');
      setPassword('');
      setPhone('');
      setError('');
      setTurnstileKey(k => k + 1);
      setTurnstileToken('');
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !password) {
      setError('Name, email, and password are required');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password, turnstileToken, phone.trim() || undefined);
      onClose();
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Registration failed');
      if (err.data?.code === 'TURNSTILE_REQUIRED' || err.data?.code === 'TURNSTILE_FAILED') {
        setTurnstileKey(k => k + 1);
        setTurnstileToken('');
      }
    } finally {
      setLoading(false);
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
        {/* Header */}
        <div className="bg-sage px-6 py-5 text-center">
          <h2 className="text-xl font-bold text-white">Join Our Community</h2>
          <p className="text-white/80 text-sm mt-1">Create your account at Open Door Christian Church</p>
        </div>

        {/* Already logged in notice */}
        {user ? (
          <div className="p-6 text-center">
            <div className="text-5xl mb-4">&#9989;</div>
            <h3 className="text-lg font-bold text-charcoal mb-2">You're Already Signed Up!</h3>
            <p className="text-gray-600 mb-6">You're logged in as <strong>{user.name || user.email}</strong>.</p>
            <div className="flex flex-col gap-3">
              <button onClick={() => { onClose(); navigate('/dashboard'); }} className="w-full py-2.5 bg-sage text-white font-semibold rounded-lg hover:bg-sage/90 transition-colors">
                Go to Dashboard
              </button>
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-charcoal">Close</button>
            </div>
          </div>
        ) : (
        /* Form */
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-charcoal mb-1">Full Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="John Doe"
              maxLength={255}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-charcoal mb-1">Email *</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="john@example.com"
              maxLength={255}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-charcoal mb-1">Password *</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 6 characters"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-charcoal mb-1">Phone <span className="text-gray-400 font-normal">(optional)</span></label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(386) 555-1234"
              maxLength={20}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none"
            />
          </div>

          <div>
            <Turnstile onToken={handleTurnstileToken} resetKey={turnstileKey} />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading || !turnstileToken}
            className="w-full py-3 bg-sage text-white font-semibold rounded-lg hover:bg-sage/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Creating Account...' : 'Sign Up'}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <button type="button" onClick={() => { onClose(); navigate('/login'); }} className="text-sage font-semibold hover:underline">
              Log in
            </button>
          </p>
        </form>
        )}

        {/* Close button */}
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
