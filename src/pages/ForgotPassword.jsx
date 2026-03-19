import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Turnstile from '../components/common/Turnstile';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email, turnstileToken });
      setSent(true);
    } catch (err) {
      if (err.data?.code === 'TURNSTILE_REQUIRED' || err.data?.code === 'TURNSTILE_FAILED') {
        setTurnstileReset(prev => prev + 1);
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-cream">
      <div className="w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-charcoal">Forgot Password</h1>
            <p className="text-gray-500 mt-2">Enter your email to reset your password</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>
          )}

          {sent ? (
            <div className="space-y-4">
              <div className="bg-green-50 text-green-700 p-4 rounded-lg text-sm">
                <p className="font-semibold mb-2">Check your email!</p>
                <p>If an account exists for <strong>{email}</strong>, we've sent a password reset link. Check your inbox and spam folder.</p>
              </div>
              <p className="text-center mt-4">
                <Link to="/login" className="text-sage font-semibold hover:underline">Back to Login</Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full border border-gray-200 rounded-lg px-4 py-3"
                  placeholder="your@email.com"
                />
              </div>
              <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />
              <button type="submit" disabled={loading} className="btn-primary w-full !py-4">
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <p className="text-center text-gray-500">
                Remember your password? <Link to="/login" className="text-sage font-semibold hover:underline">Sign In</Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
