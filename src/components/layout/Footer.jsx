import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import Turnstile from '../common/Turnstile';

export default function Footer() {
  const [email, setEmail] = useState('');
  const [subMsg, setSubMsg] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);

  const subscribe = async (e) => {
    e.preventDefault();
    try {
      await api.post('/newsletter', { email, turnstileToken });
      setSubMsg('Thank you for subscribing!');
      setEmail('');
      setTimeout(() => setSubMsg(''), 3000);
    } catch (err) {
      if (err.data?.code === 'TURNSTILE_REQUIRED' || err.data?.code === 'TURNSTILE_FAILED') {
        setTurnstileReset(prev => prev + 1);
      }
      setSubMsg(err.message);
    }
  };

  return (
    <footer className="bg-charcoal text-gray-300">
      <div className="container-custom py-16">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <h3 className="text-cream text-xl font-bold mb-4">Open Door Christian Church</h3>
            <p className="text-sm leading-relaxed mb-4 italic">"We have no book but the Bible, have no creed but Christ."</p>
            <div className="flex gap-3">
              <a href="http://www.facebook.com/OpenDoorChurchDeland/" target="_blank" rel="noopener noreferrer" className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-sage transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
            </div>
          </div>

          <div>
            <h4 className="text-cream font-semibold mb-4">Quick Links</h4>
            <div className="flex flex-col gap-2 text-sm">
              <Link to="/about" className="hover:text-cream transition-colors">About Us</Link>
              <Link to="/services" className="hover:text-cream transition-colors">Service Times</Link>
              <Link to="/events" className="hover:text-cream transition-colors">Events</Link>
              <Link to="/blog" className="hover:text-cream transition-colors">Blog</Link>
              <Link to="/give" className="hover:text-cream transition-colors">Give</Link>
              <Link to="/contact" className="hover:text-cream transition-colors">Contact</Link>
            </div>
          </div>

          <div>
            <h4 className="text-cream font-semibold mb-4">Visit Us</h4>
            <div className="text-sm space-y-2">
              <p>1700 S Clara Ave</p>
              <p>DeLand, FL 32720</p>
              <p className="mt-3">Phone: <a href="tel:3867348200" className="hover:text-cream">(386) 734-8200</a></p>
              <p className="mt-3 font-medium text-cream">Sunday Services</p>
              <p>8:30 AM · Drive-In (87.9 FM)</p>
              <p>9:30 AM · Bible Study</p>
              <p>10:30 AM · Chapel</p>
              <p className="mt-2 font-medium text-cream">Wednesday</p>
              <p>6:00 PM · Bible Study</p>
            </div>
          </div>

          <div>
            <h4 className="text-cream font-semibold mb-4">Stay Connected</h4>
            <p className="text-sm mb-4">Subscribe to our newsletter for updates and encouragement.</p>
            <form onSubmit={subscribe} className="flex flex-col gap-2">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Your email" required className="bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-400 focus:border-sage" />
              <button type="submit" className="bg-sage text-white rounded-lg py-2 text-sm font-semibold hover:bg-opacity-90 transition-colors">Subscribe</button>
            </form>
            <Turnstile onToken={setTurnstileToken} resetKey={turnstileReset} />
            {subMsg && <p className="text-sm text-sage mt-2">{subMsg}</p>}
          </div>
        </div>

        <div className="border-t border-white/10 mt-12 pt-8 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} Open Door Christian Church · Founded 1986 · DeLand, Florida</p>
        </div>
      </div>
    </footer>
  );
}
