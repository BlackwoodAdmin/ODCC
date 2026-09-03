import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import api from '../services/api';
import useNotification from '../hooks/useNotification';
import Turnstile from '../components/common/Turnstile';

// Jr Chili Cook-Off sign-up — Free Family Fall Festival, Saturday Oct 17, 2026.
// Facts on this page come from the printed flyer; the server enforces the
// registration window, capacity, and validation.

const EMPTY_COOK = { cook_first_name: '', age: '', chili_name: '', notes: '' };
const EMPTY_PARENT = { parent_name: '', parent_email: '', parent_phone: '' };
const AGES = Array.from({ length: 13 }, (_, i) => 7 + i);
const DIVISION_LABEL = { junior: 'Ages 7–12', teen: 'Ages 13–19' };
const INPUT = 'w-full border border-gray-200 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-sage/40';
const LABEL = 'block text-sm font-medium text-charcoal mb-2';

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className={LABEL}>{label}{required && ' *'}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function DetailCard({ icon, title, children }) {
  return (
    <div className="bg-cream rounded-xl p-5">
      <h3 className="font-bold text-charcoal mb-1">{icon} {title}</h3>
      <div className="text-gray-600 text-sm space-y-1">{children}</div>
    </div>
  );
}

export default function ChiliCookoff() {
  const { notify } = useNotification();
  const [status, setStatus] = useState(null);          // null while loading
  const [form, setForm] = useState({ ...EMPTY_COOK, ...EMPTY_PARENT, consent: false });
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [done, setDone] = useState(null);              // { cook, chili, division, email }

  useEffect(() => {
    api.get('/chili-cookoff/status')
      .then(setStatus)
      .catch(() => setStatus({ open: true, reason: null, message: null })); // server still enforces on submit
  }, []);

  const update = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/chili-cookoff/entries', { ...form, age: Number(form.age), turnstileToken });
      setDone({
        cook: form.cook_first_name.trim(),
        chili: form.chili_name.trim(),
        division: res.division,
        email: form.parent_email.trim(),
      });
      setStatus((s) => (s ? { ...s, count: (s.count || 0) + 1 } : s));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err.data?.code === 'TURNSTILE_REQUIRED' || err.data?.code === 'TURNSTILE_FAILED') {
        setTurnstileReset((p) => p + 1);
      }
      if (err.status === 403 && err.data?.reason) {
        setStatus((s) => ({ ...(s || {}), open: false, reason: err.data.reason, message: err.data.error }));
      }
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const registerAnother = () => {
    setForm((f) => ({ ...f, ...EMPTY_COOK, consent: false }));
    setDone(null);
    setTurnstileToken('');
    setTurnstileReset((p) => p + 1);
  };

  const isOpen = status?.open !== false;

  return (
    <div>
      <Helmet>
        <title>Jr Chili Cook-Off Sign-Up - Open Door Christian Church</title>
      </Helmet>

      <section className="relative py-20 bg-charcoal text-white">
        <div className="container-custom text-center">
          <p className="uppercase tracking-widest text-sm text-cream-400 mb-3">Free Family Fall Festival · Celebrating 40 Years</p>
          <h1 className="text-5xl font-bold mb-4">Jr Chili Cook-Off</h1>
          <p className="text-xl text-gray-300">Saturday, October 17, 2026 · 9 AM – 3 PM · Open Door Christian Church, DeLand</p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-custom">
          <div className="grid lg:grid-cols-5 gap-12 max-w-6xl mx-auto">
            <div className="lg:col-span-3">
              {done ? (
                <div className="bg-sage-50 border border-sage-200 rounded-2xl p-8">
                  <h2 className="text-3xl font-bold text-charcoal mb-2">🎉 {done.cook} is registered!</h2>
                  <p className="text-gray-600 mb-6">
                    <strong>{done.chili}</strong> is entered in the <strong>{DIVISION_LABEL[done.division] || done.division}</strong> division.
                    A confirmation is on its way to <strong>{done.email}</strong>.
                  </p>
                  <h3 className="font-bold text-charcoal mb-2">On festival day</h3>
                  <ul className="list-disc pl-5 text-gray-600 space-y-1 mb-8">
                    <li>Bring your chili to the Jr Chili Cook-Off table by <strong>11:45 AM</strong>.</li>
                    <li>Voting begins at <strong>noon</strong> and ends by <strong>2:00 PM</strong>, or while supplies last.</li>
                    <li>1700 South Clara Ave, DeLand, FL 32720.</li>
                  </ul>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={registerAnother} className="btn-primary">Register another cook</button>
                    <Link to="/" className="btn-secondary">Back to home</Link>
                  </div>
                </div>
              ) : status === null ? (
                <div className="text-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto"></div></div>
              ) : !isOpen ? (
                <div className="bg-cream rounded-2xl p-8">
                  <h2 className="text-3xl font-bold text-charcoal mb-3">
                    {status.reason === 'full' ? 'Pre-registration is full' : status.reason === 'deadline' ? 'Pre-registration has closed' : 'Registration is closed'}
                  </h2>
                  <p className="text-gray-600 mb-4">{status.message}</p>
                  <p className="text-gray-600 text-sm">
                    Questions? Email <a href="mailto:hello@opendoorchristian.church" className="text-sage hover:underline">hello@opendoorchristian.church</a>.
                  </p>
                </div>
              ) : (
                <>
                  <h2 className="text-3xl font-bold text-charcoal mb-2">Sign up your young chef</h2>
                  <p className="text-gray-600 mb-8">
                    Open to ages 7–19. Pre-register by <strong>October 12</strong>. Walk-ins are welcome on the day if there is space.
                  </p>
                  <form onSubmit={handleSubmit} className="space-y-8">
                    <fieldset className="space-y-5">
                      <legend className="text-lg font-bold text-charcoal mb-1">Junior cook</legend>
                      <div className="grid sm:grid-cols-3 gap-5">
                        <div className="sm:col-span-2">
                          <Field label="First name" required>
                            <input type="text" value={form.cook_first_name} onChange={update('cook_first_name')} required maxLength={100} autoComplete="off" className={INPUT} />
                          </Field>
                        </div>
                        <Field label="Age" required>
                          <select value={form.age} onChange={update('age')} required className={INPUT + ' bg-white'}>
                            <option value="">Select</option>
                            {AGES.map((a) => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </Field>
                      </div>
                      <Field label="Chili name" required hint="Give it a name the judges will remember.">
                        <input type="text" value={form.chili_name} onChange={update('chili_name')} required maxLength={150} className={INPUT} />
                      </Field>
                    </fieldset>

                    <fieldset className="space-y-5">
                      <legend className="text-lg font-bold text-charcoal mb-1">Parent or guardian</legend>
                      <Field label="Your name" required>
                        <input type="text" value={form.parent_name} onChange={update('parent_name')} required maxLength={150} autoComplete="name" className={INPUT} />
                      </Field>
                      <div className="grid sm:grid-cols-2 gap-5">
                        <Field label="Email" required hint="We'll send your confirmation here.">
                          <input type="email" value={form.parent_email} onChange={update('parent_email')} required maxLength={255} autoComplete="email" className={INPUT} />
                        </Field>
                        <Field label="Phone">
                          <input type="tel" value={form.parent_phone} onChange={update('parent_phone')} maxLength={20} autoComplete="tel" className={INPUT} />
                        </Field>
                      </div>
                      <Field label="Anything we should know?" hint="Optional — allergies, ingredients, or questions.">
                        <textarea value={form.notes} onChange={update('notes')} rows={3} maxLength={500} className={INPUT + ' resize-none'} />
                      </Field>
                    </fieldset>

                    <label className="flex items-start gap-3 text-sm text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={form.consent} onChange={update('consent')} required className="mt-1 w-4 h-4 rounded border-gray-300 text-sage-500 focus:ring-sage-500" />
                      <span>I am the parent or guardian of this junior cook and give permission for them to take part in the Jr Chili Cook-Off. *</span>
                    </label>

                    <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />
                    <button type="submit" disabled={submitting || !turnstileToken} className="btn-primary w-full !py-4">
                      {submitting ? 'Registering...' : !turnstileToken ? 'Verifying...' : 'Register for the Cook-Off'}
                    </button>
                    <p className="text-xs text-gray-400 text-center">
                      We only use this information to run the cook-off. Questions? <a href="mailto:hello@opendoorchristian.church" className="underline">hello@opendoorchristian.church</a>
                    </p>
                  </form>
                </>
              )}
            </div>

            <aside className="lg:col-span-2 space-y-5">
              <a href="/fall-festival-2026.jpg" target="_blank" rel="noopener noreferrer" title="Open the full flyer">
                <img src="/fall-festival-2026.webp" alt="Free Family Fall Festival flyer — October 17, 9 AM to 3 PM, with Jr Chili Cook-Off" className="w-full rounded-xl shadow-md" loading="lazy" />
              </a>
              <DetailCard icon="📅" title="When">
                <p>Saturday, October 17, 2026</p>
                <p>Festival 9:00 AM – 3:00 PM</p>
              </DetailCard>
              <DetailCard icon="📍" title="Where">
                <p>Open Door Christian Church<br />1700 South Clara Ave, DeLand, FL 32720</p>
                <a href="https://www.google.com/maps/search/?api=1&query=Open+Door+Christian+Church+1700+S+Clara+Ave+DeLand+FL+32720" target="_blank" rel="noopener noreferrer" className="text-sage font-semibold hover:underline">Open in Google Maps</a>
              </DetailCard>
              <DetailCard icon="🌶️" title="Divisions">
                <p><strong>Ages 7–12</strong> and <strong>Ages 13–19</strong></p>
                <p>Young chefs, big flavor!</p>
              </DetailCard>
              <DetailCard icon="⏰" title="On the day">
                <p>Bring your chili by <strong>11:45 AM</strong>.</p>
                <p>Voting begins at noon and ends by 2:00 PM, or while supplies last.</p>
              </DetailCard>
              <DetailCard icon="🗓️" title="Deadline">
                <p>Pre-register by <strong>October 12</strong>.</p>
                <p>Walk-ins welcome if there is space.</p>
              </DetailCard>
              <p className="text-sm text-gray-500">
                Also at the festival: smoker grill, bounce houses, yard Jenga, cornhole, and more. Everyone is welcome!
              </p>
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
