import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import useNotification from '../hooks/useNotification';
import Turnstile from '../components/common/Turnstile';

export default function Register() {
  const { register } = useAuth();
  const { notify } = useNotification();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isSetup = searchParams.get('setup') === 'true';
  const prefillEmail = searchParams.get('email') || '';
  const [form, setForm] = useState({ name: '', email: prefillEmail, password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { notify('Passwords do not match', 'error'); return; }
    setLoading(true);
    try {
      await register(form.name, form.email, form.password, turnstileToken);
      notify(isSetup ? 'Password set! Welcome!' : 'Account created! Welcome!');
      navigate('/dashboard');
    } catch (err) {
      if (err.data?.code === 'TURNSTILE_REQUIRED' || err.data?.code === 'TURNSTILE_FAILED') {
        setTurnstileReset(prev => prev + 1);
      }
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-cream">
      <div className="w-full max-w-md mx-4">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-charcoal">{isSetup ? 'Set Your Password' : 'Create Account'}</h1>
            <p className="text-gray-500 mt-2">{isSetup ? 'Choose a name and password to complete your account' : 'Join our church community'}</p>
          </div>
          {isSetup && (
            <div className="bg-sage/10 text-sage p-4 rounded-lg mb-6 text-sm">
              You subscribed with <strong>{prefillEmail}</strong>. Set a name and password below to start commenting on blog posts.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">Name</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="w-full border border-gray-200 rounded-lg px-4 py-3" />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required readOnly={isSetup} className={`w-full border border-gray-200 rounded-lg px-4 py-3 ${isSetup ? 'bg-gray-50 text-gray-500' : ''}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">Password</label>
              <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required minLength={6} className="w-full border border-gray-200 rounded-lg px-4 py-3" />
            </div>
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">Confirm Password</label>
              <input type="password" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} required className="w-full border border-gray-200 rounded-lg px-4 py-3" />
            </div>
            <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />
            <button type="submit" disabled={loading || !turnstileToken} className="btn-primary w-full !py-4">{loading ? (isSetup ? 'Setting up...' : 'Creating...') : !turnstileToken ? 'Verifying...' : (isSetup ? 'Set Password' : 'Create Account')}</button>
          </form>
          <p className="text-center text-gray-500 mt-6">Already have an account? <Link to="/login" className="text-sage font-semibold hover:underline">Sign In</Link></p>
        </div>
      </div>
    </div>
  );
}
