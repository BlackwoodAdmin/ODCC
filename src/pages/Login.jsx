import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import useNotification from '../hooks/useNotification';
import Turnstile from '../components/common/Turnstile';

export default function Login() {
  const { login } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password, turnstileToken);
      notify('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      if (err.message === 'Please register first to set a password') {
        navigate(`/register?email=${encodeURIComponent(form.email)}&setup=true`);
      } else {
        if (err.data?.code === 'TURNSTILE_REQUIRED' || err.data?.code === 'TURNSTILE_FAILED') {
          setTurnstileReset(prev => prev + 1);
        }
        notify(err.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-cream">
      <div className="w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-charcoal">Welcome Back</h1>
            <p className="text-gray-500 mt-2">Sign in to your account</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required className="w-full border border-gray-200 rounded-lg px-4 py-3" placeholder="your@email.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">Password</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required className="w-full border border-gray-200 rounded-lg px-4 py-3" placeholder="••••••••" />
            </div>
            <div className="text-right">
              <Link to="/forgot-password" className="text-sm text-sage hover:underline">Forgot your password?</Link>
            </div>
            <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />
            <button type="submit" disabled={loading || !turnstileToken} className="btn-primary w-full !py-4">{loading ? 'Signing in...' : !turnstileToken ? 'Verifying...' : 'Sign In'}</button>
          </form>
          <p className="text-center text-gray-500 mt-6">Don't have an account? <Link to="/register" className="text-sage font-semibold hover:underline">Register</Link></p>
        </div>
      </div>
    </div>
  );
}
