import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import StripeProvider from './StripeProvider';
import Turnstile from './common/Turnstile';
import useAuth from '../hooks/useAuth';
import api from '../services/api';

function PaymentStep({ amount, isRecurring, onSuccess, onBack }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message);
      setProcessing(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/give?success=true`,
      },
      redirect: 'if_required',
    });

    if (confirmError) {
      setError(confirmError.message);
      setProcessing(false);
    } else {
      onSuccess();
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="mb-6 bg-sage/10 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Donation Amount</span>
          <span className="text-2xl font-bold text-charcoal">${amount}</span>
        </div>
        <p className="text-sm text-gray-500 mt-1">{isRecurring ? 'Monthly recurring gift' : 'One-time gift'}</p>
      </div>

      <div className="mb-6">
        <PaymentElement />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-3 px-6 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={!stripe || processing}
          className="flex-1 py-3 px-6 rounded-lg bg-sage text-white font-semibold hover:bg-sage/90 transition-colors disabled:opacity-50"
        >
          {processing ? 'Processing...' : 'Complete Donation'}
        </button>
      </div>
    </form>
  );
}

export default function DonationForm() {
  const { user } = useAuth();
  const formRef = useRef(null);
  const [step, setStep] = useState('details'); // details | payment | success
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('one_time');
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [note, setNote] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [clientSecret, setClientSecret] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (formRef.current) {
      const top = formRef.current.getBoundingClientRect().top + window.scrollY - 110;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }, [step]);

  const handleTurnstileToken = useCallback((token) => setTurnstileToken(token), []);

  const needsAuth = type === 'recurring' && !user;

  const handleContinue = async (e) => {
    e.preventDefault();
    setError(null);

    if (!amount || isNaN(Number(amount)) || Number(amount) < 1 || Number(amount) > 50000) {
      setError('Please enter a valid amount between $1.00 and $50,000.00');
      return;
    }
    if (!name.trim()) { setError('Please enter your name'); return; }
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email'); return; }

    setLoading(true);
    try {
      const res = await api.post('/donations/create-payment-intent', {
        amount: Number(amount).toFixed(2),
        type,
        name: name.trim(),
        email: email.trim(),
        note: note.trim() || undefined,
        turnstileToken,
      });
      setClientSecret(res.clientSecret);
      setStep('payment');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
      setTurnstileKey(k => k + 1);
      setTurnstileToken('');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'success') {
    return (
      <div ref={formRef} className="text-center py-8">
        <div className="text-6xl mb-4">🙏</div>
        <h3 className="text-2xl font-bold text-charcoal mb-3">Thank You for Your Generous Gift!</h3>
        <p className="text-gray-600 mb-2">Your donation has been received. A receipt has been sent to your email.</p>
        <p className="text-sage italic mt-4 text-lg">
          "God loves a cheerful giver." — 2 Corinthians 9:7
        </p>
        <button
          onClick={() => { setStep('details'); setClientSecret(null); setAmount(''); setNote(''); setTurnstileKey(k => k + 1); setTurnstileToken(''); }}
          className="mt-6 text-sage font-semibold hover:underline"
        >
          Make another donation
        </button>
      </div>
    );
  }

  if (step === 'payment' && clientSecret) {
    return (
      <div ref={formRef}>
      <StripeProvider clientSecret={clientSecret}>
        <PaymentStep
          amount={Number(amount).toFixed(2)}
          isRecurring={type === 'recurring'}
          onSuccess={() => setStep('success')}
          onBack={() => { setStep('details'); setClientSecret(null); }}
        />
      </StripeProvider>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleContinue}>
      {/* Amount */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-charcoal mb-2">Donation Amount</label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg font-semibold">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg text-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none"
          />
        </div>
      </div>

      {/* Frequency toggle */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-charcoal mb-2">Frequency</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setType('one_time')}
            className={`py-3 rounded-lg font-semibold border-2 transition-colors ${
              type === 'one_time'
                ? 'border-sage bg-sage/10 text-sage'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            One-Time Gift
          </button>
          <button
            type="button"
            onClick={() => setType('recurring')}
            className={`py-3 rounded-lg font-semibold border-2 transition-colors ${
              type === 'recurring'
                ? 'border-sage bg-sage/10 text-sage'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            Monthly Gift
          </button>
        </div>
        {needsAuth && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
            To set up monthly giving, please{' '}
            <Link to="/register" className="font-semibold underline">create an account</Link> or{' '}
            <Link to="/login" className="font-semibold underline">log in</Link>{' '}
            so you can manage your subscription later.
          </div>
        )}
      </div>

      {/* Name */}
      <div className="mb-4">
        <label className="block text-sm font-semibold text-charcoal mb-2">Full Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="John Doe"
          maxLength={255}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none"
        />
      </div>

      {/* Email */}
      <div className="mb-4">
        <label className="block text-sm font-semibold text-charcoal mb-2">Email Address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="john@example.com"
          maxLength={255}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none"
        />
      </div>

      {/* Note */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-charcoal mb-2">Note <span className="text-gray-400 font-normal">(optional)</span></label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Building fund, missions, etc."
          maxLength={500}
          rows={2}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sage focus:border-sage outline-none resize-none"
        />
        <p className="text-xs text-gray-400 mt-1">{note.length}/500</p>
      </div>

      {/* Turnstile */}
      <div className="mb-4">
        <Turnstile onToken={handleTurnstileToken} resetKey={turnstileKey} />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <button
        type="submit"
        disabled={loading || needsAuth || !turnstileToken}
        className="w-full py-3 px-6 rounded-lg bg-sage text-white font-semibold text-lg hover:bg-sage/90 transition-colors disabled:opacity-50"
      >
        {loading ? 'Preparing...' : 'Continue to Payment'}
      </button>

      <p className="text-xs text-gray-400 text-center mt-4">
        Payments processed securely by Stripe. Your card information never touches our servers.
      </p>
    </form>
  );
}