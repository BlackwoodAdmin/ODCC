import React, { useState } from 'react';
import api from '../services/api';
import useNotification from '../hooks/useNotification';
import Turnstile from '../components/common/Turnstile';

export default function Contact() {
  const { notify } = useNotification();
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/contact', { ...form, turnstileToken });
      notify('Message sent! We\'ll be in touch soon.');
      setForm({ name: '', email: '', phone: '', message: '' });
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
      <section className="relative py-24 bg-charcoal text-white">
        <div className="container-custom text-center">
          <h1 className="text-5xl font-bold mb-4">Contact Us</h1>
          <p className="text-xl text-gray-300">We'd love to hear from you</p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-custom">
          <div className="grid lg:grid-cols-2 gap-16 max-w-6xl mx-auto">
            <div>
              <h2 className="text-3xl font-bold text-charcoal mb-8">Get in Touch</h2>
              <form onSubmit={handleSubmit} className="space-y-6">
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
                  <label className="block text-sm font-medium text-charcoal mb-2">Message *</label>
                  <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} rows={5} required className="w-full border border-gray-200 rounded-lg px-4 py-3 resize-none" />
                </div>
                <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />
                <button type="submit" disabled={submitting} className="btn-primary w-full !py-4">{submitting ? 'Sending...' : 'Send Message'}</button>
              </form>
            </div>

            <div>
              <h2 className="text-3xl font-bold text-charcoal mb-8">Visit Us</h2>
              <div className="space-y-6">
                <div className="bg-cream rounded-xl p-6">
                  <h3 className="font-bold text-charcoal mb-2">📍 Address</h3>
                  <p className="text-gray-600">1700 S Clara Ave<br />DeLand, FL 32720</p>
                </div>
                <div className="bg-cream rounded-xl p-6">
                  <h3 className="font-bold text-charcoal mb-2">📞 Phone</h3>
                  <p className="text-gray-600"><a href="tel:3867348200" className="hover:text-sage">(386) 734-8200</a></p>
                </div>
                <div className="bg-cream rounded-xl p-6">
                  <h3 className="font-bold text-charcoal mb-2">🕒 Service Times</h3>
                  <div className="text-gray-600 text-sm space-y-1">
                    <p><strong>Sunday:</strong> 8:30 AM Drive-In, 9:45 AM Bible Study, 10:30 AM Chapel</p>
                    <p><strong>Wednesday:</strong> 6:00 PM Bible Study</p>
                  </div>
                </div>
                <div className="bg-cream rounded-xl p-6">
                  <h3 className="font-bold text-charcoal mb-2">🏢 Office Hours</h3>
                  <p className="text-gray-600 text-sm">Tuesday – Thursday · 9:00 AM – 1:00 PM</p>
                </div>
                <div className="bg-cream rounded-xl p-6">
                  <h3 className="font-bold text-charcoal mb-2">🌐 Social Media</h3>
                  <a href="http://www.facebook.com/OpenDoorChurchDeland/" target="_blank" rel="noopener noreferrer" className="text-sage hover:underline">Follow us on Facebook</a>
                </div>
              </div>

              <div className="mt-8 rounded-xl overflow-hidden shadow-md">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3489.649830670975!2d-81.31071022448573!3d28.997745775467287!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x88e71b1d5858f469%3A0x16eac2a65f57561d!2sOpen%20Door%20Christian%20Church!5e0!3m2!1sen!2sus!4v1773540065514!5m2!1sen!2sus"
                  width="100%" height="300" style={{ border: 0 }}
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
        </div>
      </section>
    </div>
  );
}
