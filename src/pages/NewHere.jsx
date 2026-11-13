import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import useNotification from '../hooks/useNotification';
import Turnstile from '../components/common/Turnstile';

const SUNDAY_TIMELINE = [
  {
    time: '8:30 AM', name: 'Fellowship Time', place: 'Chapel',
    desc: 'Coffee, breakfast foods, and friendly faces. A relaxed way to arrive early and say hello.',
  },
  {
    time: '9:00 AM', name: 'Drive-In Service', place: 'Garden · FM 87.9',
    desc: 'Our beloved tradition — worship from your car with the radio tuned to 87.9 FM, or sit outside near the speakers.',
    highlight: true,
  },
  {
    time: '10:15 AM', name: 'Bible Study', place: 'Chapel',
    desc: 'Bring your Bible, your questions, and an open heart. Newcomers are always welcome to just listen.',
  },
  {
    time: '11:00 AM', name: 'Indoor Chapel Service', place: 'Chapel',
    desc: 'Hymns, communion, prayer, and the message in the air-conditioned chapel. Same sermon as the drive-in.',
    highlight: true,
  },
];

const FAQS = [
  {
    icon: '👕', q: 'What should I wear?',
    a: "Come as you are — there's no dress code. At the drive-in you'll see everything from Sunday best to pajamas, and all of it is welcome.",
  },
  {
    icon: '🚗', q: 'How does the drive-in work?',
    a: 'Pull into the garden, tune your car radio to 87.9 FM, and worship from your seat. Outdoor speakers are set up if you prefer a chair under the sky, and the fellowship hall is open before and after.',
  },
  {
    icon: '⛪', q: 'Which service should I pick?',
    a: 'The 9:00 drive-in and the 11:00 chapel service share the same sermon, so choose whichever fits you best — or come at 8:30 and make a whole morning of it.',
  },
  {
    icon: '🍞', q: 'What about communion?',
    a: "We celebrate the Lord's Supper every Sunday at both services, remembering Christ's sacrifice and our unity as His body.",
  },
  {
    icon: '🙋', q: 'Will I be put on the spot?',
    a: "Never. No one will single you out, ask you to stand, or pressure you to give. You're free to simply be our guest.",
  },
  {
    icon: '📞', q: 'Still have questions?',
    a: 'Call us at (386) 734-8200 — the office is open Tuesday through Friday, 9:00 AM to 2:00 PM — or use the form below and we\'ll get right back to you.',
  },
];

export default function NewHere() {
  const { notify } = useNotification();
  const [form, setForm] = useState({ name: '', email: '', phone: '', visitDate: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/contact/visit', { ...form, turnstileToken });
      setSubmitted(true);
    } catch (err) {
      if (err.data?.code === 'TURNSTILE_REQUIRED' || err.data?.code === 'TURNSTILE_FAILED') {
        setTurnstileReset(prev => prev + 1);
      }
      notify(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative py-24 bg-charcoal text-white">
        <div className="container-custom text-center">
          <p className="text-sage-light text-sm font-semibold uppercase tracking-wider mb-3">Welcome, friend</p>
          <h1 className="text-5xl font-bold mb-4">New to Open Door?</h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto">
            We'd love to meet you. Here's everything you need for your first visit — no dress code, no pressure, just a warm welcome.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <a href="#plan-visit" className="btn-primary">Plan My Visit</a>
            <a href="#first-sunday" className="btn-secondary">What to Expect</a>
          </div>
        </div>
      </section>

      {/* Quick facts bar */}
      <section className="bg-sage text-white py-5">
        <div className="container-custom">
          <div className="flex flex-wrap justify-center gap-6 md:gap-12 text-center text-sm md:text-base">
            <div><span className="font-bold">Sundays</span> <span className="opacity-80">8:30 AM – 12:00 PM</span></div>
            <div><span className="font-bold">Drive-In</span> <span className="opacity-80">9:00 AM · FM 87.9</span></div>
            <div><span className="font-bold">Chapel</span> <span className="opacity-80">11:00 AM</span></div>
            <div><span className="font-bold">📍</span> <span className="opacity-80">1700 S Clara Ave, DeLand</span></div>
          </div>
        </div>
      </section>

      {/* Your first Sunday */}
      <section id="first-sunday" className="section-padding bg-white">
        <div className="container-custom max-w-4xl">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-charcoal mb-4">Your First Sunday</h2>
            <div className="w-20 h-1 bg-sage mx-auto mb-6"></div>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Come for one service or stay for the whole morning — there's no wrong way to do it.
              Many folks start with coffee at 8:30 and find their rhythm from there.
            </p>
          </div>
          <div className="space-y-4">
            {SUNDAY_TIMELINE.map((s, i) => (
              <div key={i} className={`rounded-2xl p-6 ${s.highlight ? 'bg-sage/10 border-2 border-sage' : 'bg-cream'}`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
                  <div className="sm:w-28 flex-shrink-0">
                    <span className="text-xl font-bold text-charcoal">{s.time}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-charcoal">{s.name}</h3>
                      <span className="bg-sage text-white px-2.5 py-0.5 rounded-full text-xs font-semibold">{s.place}</span>
                    </div>
                    <p className="text-gray-600 text-sm leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-gray-500 text-sm mt-6">
            Also: Wednesday Bible study at 6:00 PM, if midweek suits you better.{' '}
            <Link to="/services" className="text-sage font-medium hover:underline">See all service times</Link>
          </p>
        </div>
      </section>

      {/* What to expect / FAQs */}
      <section className="section-padding bg-cream">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-charcoal mb-4">What to Expect</h2>
            <div className="w-20 h-1 bg-sage mx-auto"></div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {FAQS.map((f, i) => (
              <div key={i} className="bg-white rounded-xl shadow-md p-6">
                <div className="text-3xl mb-3">{f.icon}</div>
                <h3 className="font-bold text-charcoal mb-2">{f.q}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Find us */}
      <section className="section-padding bg-white">
        <div className="container-custom">
          <div className="grid lg:grid-cols-2 gap-12 max-w-5xl mx-auto items-start">
            <div>
              <h2 className="text-3xl font-bold text-charcoal mb-6">Finding Us</h2>
              <div className="space-y-4">
                <div className="bg-cream rounded-xl p-6">
                  <h3 className="font-bold text-charcoal mb-2">📍 Address</h3>
                  <p className="text-gray-600">1700 S Clara Ave<br />DeLand, FL 32720</p>
                </div>
                <div className="bg-cream rounded-xl p-6">
                  <h3 className="font-bold text-charcoal mb-2">🅿️ Parking</h3>
                  <p className="text-gray-600 text-sm">Joining the 9:00 drive-in? Pull right into the garden and tune to 87.9 FM. For chapel services, park in the lot and come on in — someone will be glad to point the way.</p>
                </div>
                <div className="bg-cream rounded-xl p-6">
                  <h3 className="font-bold text-charcoal mb-2">📞 Phone</h3>
                  <p className="text-gray-600"><a href="tel:3867348200" className="hover:text-sage">(386) 734-8200</a></p>
                  <p className="text-gray-500 text-sm mt-1">Office hours: Tuesday – Friday · 9:00 AM – 2:00 PM</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl overflow-hidden shadow-md">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3489.649830670975!2d-81.31071022448573!3d28.997745775467287!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x88e71b1d5858f469%3A0x16eac2a65f57561d!2sOpen%20Door%20Christian%20Church!5e0!3m2!1sen!2sus!4v1773540065514!5m2!1sen!2sus"
                width="100%" height="420" style={{ border: 0 }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Open Door Christian Church - 1700 S Clara Ave, DeLand, FL 32720"
              ></iframe>
              <div className="bg-gray-50 p-3 text-center">
                <a
                  href="https://www.google.com/maps/search/?api=1&query=Open+Door+Christian+Church+1700+S+Clara+Ave+DeLand+FL+32720"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sage text-sm font-semibold hover:underline"
                >
                  Open in Google Maps
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Plan my visit form */}
      <section id="plan-visit" className="section-padding bg-sage/10">
        <div className="container-custom max-w-2xl">
          <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12">
            {submitted ? (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">🎉</div>
                <h2 className="text-3xl font-bold text-charcoal mb-4">We can't wait to meet you!</h2>
                <p className="text-gray-600 leading-relaxed mb-6">
                  Check your inbox — we just sent you everything you need for your first visit,
                  including directions and a note from Pastor Presley.
                </p>
                <Link to="/our-pastor" className="btn-primary">Meet Our Pastor</Link>
              </div>
            ) : (
              <>
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-charcoal mb-3">Plan My Visit</h2>
                  <p className="text-gray-600">
                    Tell us you're coming and we'll save you a warm welcome — plus send you
                    everything you need before Sunday.
                  </p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-2">Name *</label>
                      <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="w-full border border-gray-200 rounded-lg px-4 py-3" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-2">Email *</label>
                      <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required className="w-full border border-gray-200 rounded-lg px-4 py-3" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-2">Phone</label>
                      <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full border border-gray-200 rounded-lg px-4 py-3" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-2">When are you planning to visit?</label>
                      <input type="date" value={form.visitDate} onChange={e => setForm({ ...form, visitDate: e.target.value })} className="w-full border border-gray-200 rounded-lg px-4 py-3" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-2">Anything we should know?</label>
                    <textarea
                      value={form.message}
                      onChange={e => setForm({ ...form, message: e.target.value })}
                      rows={4}
                      placeholder="Questions, who's coming with you, accessibility needs — anything at all."
                      className="w-full border border-gray-200 rounded-lg px-4 py-3 resize-none"
                    />
                  </div>
                  <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />
                  <button type="submit" disabled={submitting || !turnstileToken} className="btn-primary w-full !py-4">
                    {submitting ? 'Sending...' : !turnstileToken ? 'Verifying...' : "I'm Coming — Save Me a Seat"}
                  </button>
                  <p className="text-center text-gray-400 text-xs">
                    No commitment, no follow-up pressure — plans change, and our doors stay open.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
