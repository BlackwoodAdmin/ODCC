import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../hooks/useFetch';
import useAuth from '../hooks/useAuth';
import { formatDate } from '../utils/formatters';
import RegisterModal from '../components/RegisterModal';

export default function Home() {
  const { data: postsData } = useFetch('/posts?limit=3');
  const { data: eventsData } = useFetch('/events?days=10');
  const { user } = useAuth();
  const [registerOpen, setRegisterOpen] = useState(false);

  return (
    <div>
      {/* Hero */}
      <section className="relative h-[85vh] min-h-[600px] flex items-center justify-center">
        <div className="absolute inset-0">
          <img src="/uploads/church-header.jpg" alt="Open Door Christian Church" className="w-full h-full object-cover" />
          <div className="hero-overlay absolute inset-0"></div>
        </div>
        <div className="relative z-10 text-center text-white px-4 max-w-4xl">
          <p className="text-sage-light text-lg md:text-xl font-medium mb-4 tracking-wider uppercase">Welcome to</p>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">Open Door<br />Christian Church</h1>
          <p className="text-xl md:text-2xl mb-4 font-light italic text-cream/90">"We have no book but the Bible, have no creed but Christ."</p>
          <p className="text-lg mb-10 text-cream/75">Serving DeLand, Florida since 1986</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/services" className="btn-primary text-lg !px-8 !py-4">Join Us This Sunday</Link>
            <Link to="/about" className="btn-secondary text-lg !px-8 !py-4">Learn More</Link>
          </div>
        </div>
      </section>

      {/* Service Times Quick View */}
      <section className="bg-sage text-white py-6">
        <div className="container-custom">
          <div className="flex flex-wrap justify-center gap-6 md:gap-12 text-center text-sm md:text-base">
            <div><span className="font-bold">Drive-In</span> <span className="opacity-80">Sun 8:30 AM · 87.9 FM</span></div>
            <div><span className="font-bold">Bible Study</span> <span className="opacity-80">Sun 9:30 AM</span></div>
            <div><span className="font-bold">Chapel</span> <span className="opacity-80">Sun 10:30 AM</span></div>

            <div><span className="font-bold">Wednesday</span> <span className="opacity-80">6:00 PM</span></div>
          </div>
        </div>
      </section>

      {/* Welcome Section */}
      <section className="section-padding bg-white">
        <div className="container-custom">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-charcoal mb-6">Welcome Home</h2>
            <div className="w-20 h-1 bg-sage mx-auto mb-8"></div>
            <p className="text-lg text-gray-600 leading-relaxed mb-6">
              At Open Door Christian Church, you'll find a warm, welcoming community rooted in God's Word. 
              Whether you join us in the chapel or from your car during our unique drive-in service, 
              there's a place here for you and your family.
            </p>
            <p className="text-lg text-gray-600 leading-relaxed mb-8">
              We celebrate communion every Sunday and gather throughout the week for fellowship, 
              Bible study, and worship. Come as you are — our doors are always open.
            </p>
            <Link to="/about" className="btn-primary">About Our Church</Link>
          </div>
        </div>
      </section>

      {/* Sign Up CTA Banner */}
      <section className="bg-sage/10 py-12">
        <div className="container-custom">
          <div className="bg-white rounded-2xl shadow-lg p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-charcoal mb-2">Join Our Church Community</h2>
              <p className="text-gray-600 text-lg">Sign up to receive updates, access your giving history, and stay connected with our church family.</p>
            </div>
            <button
              onClick={() => setRegisterOpen(true)}
              className="btn-primary text-lg !px-10 !py-4 whitespace-nowrap flex-shrink-0"
            >
              Sign Up
            </button>
          </div>
        </div>
      </section>

      {/* Drive-In Feature */}
      <section className="section-padding bg-cream">
        <div className="container-custom">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-sage font-semibold text-sm uppercase tracking-wider">Unique to ODCC</span>
              <h2 className="text-4xl font-bold text-charcoal mt-2 mb-6">Drive-In Church Service</h2>
              <p className="text-gray-600 leading-relaxed mb-4">
                Every Sunday at 8:30 AM, our preacher and praise team take to the 2nd floor balcony to lead 
                worship outdoors. Tune your car radio to <strong>87.9 FM</strong> and enjoy the service from 
                the comfort of your vehicle.
              </p>
              <p className="text-gray-600 leading-relaxed mb-4">
                Speakers are also placed on the grounds for those who prefer to sit outside. 
                The fellowship hall is open before and after the service for coffee and conversation.
              </p>
              <p className="text-gray-600 leading-relaxed mb-6">
                Rain or shine, this beloved tradition brings our church family together in a truly special way.
              </p>
              <Link to="/services" className="btn-primary">View All Services</Link>
            </div>
            <div className="bg-white rounded-2xl shadow-lg p-8">
              <div className="bg-sage/10 rounded-xl p-8 text-center">
                <div className="text-6xl mb-4">📻</div>
                <h3 className="text-2xl font-bold text-charcoal mb-2">87.9 FM</h3>
                <p className="text-sage font-semibold mb-2">Drive-In Radio Frequency</p>
                <p className="text-gray-500 text-sm">Tune in from the parking lot every Sunday at 8:30 AM</p>
                <div className="mt-6 border-t border-sage/20 pt-6">
                  <p className="text-charcoal font-medium">What to Expect:</p>
                  <ul className="text-gray-600 text-sm mt-2 space-y-1">
                    <li>• Praise team on the balcony</li>
                    <li>• Outdoor speakers available</li>
                    <li>• Fellowship hall open</li>
                    <li>• Communion served</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Latest Events */}
      {eventsData?.events?.length > 0 && (
        <section className="section-padding bg-white">
          <div className="container-custom">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-charcoal mb-4">Upcoming Events</h2>
              <div className="w-20 h-1 bg-sage mx-auto"></div>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {eventsData.events.map(event => (
                <div key={event.id} className="card p-6">
                  <div className="bg-sage/10 rounded-lg p-3 inline-block mb-4">
                    <span className="text-sage font-bold">{formatDate(event.event_date)}</span>
                  </div>
                  <h3 className="text-xl font-bold text-charcoal mb-2">{event.title}</h3>
                  <p className="text-gray-600 text-sm mb-3">{event.description?.substring(0, 120)}...</p>
                  {event.location && <p className="text-sm text-sage"><span className="font-medium">Location:</span> {event.location}</p>}
                </div>
              ))}
            </div>
            <div className="text-center mt-10">
              <Link to="/events" className="btn-primary">View All Events</Link>
            </div>
          </div>
        </section>
      )}

      {/* Latest Blog Posts */}
      {postsData?.posts?.length > 0 && (
        <section className="section-padding bg-cream">
          <div className="container-custom">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-charcoal mb-4">From Our Blog</h2>
              <div className="w-20 h-1 bg-sage mx-auto"></div>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {postsData.posts.map(post => (
                <Link key={post.id} to={`/blog/${post.slug}`} className="card group">
                  {post.featured_image && (
                    <div className="h-48 overflow-hidden">
                      <img src={post.featured_image} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                  )}
                  <div className="p-6">
                    <p className="text-sage text-sm font-medium mb-2">{formatDate(post.published_at || post.created_at)}</p>
                    <h3 className="text-xl font-bold text-charcoal mb-2 group-hover:text-sage transition-colors">{post.title}</h3>
                    <p className="text-gray-600 text-sm">{post.excerpt?.substring(0, 100)}...</p>
                  </div>
                </Link>
              ))}
            </div>
            <div className="text-center mt-10">
              <Link to="/blog" className="btn-primary">Read More</Link>
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="bg-charcoal text-white section-padding">
        <div className="container-custom text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Come Worship With Us</h2>
          <p className="text-xl text-gray-300 mb-4 max-w-2xl mx-auto">1700 S Clara Ave, DeLand, FL 32720</p>
          <p className="text-gray-400">Phone: (386) 734-8200</p>
          <p className="text-gray-400 mb-8">Office Hours: Tues – Fri, 9:00 AM – 1:00 PM</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/contact" className="btn-primary">Get Directions</Link>
            <Link to="/services" className="btn-secondary">Service Times</Link>
            <button onClick={() => setRegisterOpen(true)} className="btn-secondary">Sign Up</button>
          </div>
        </div>
      </section>

      <RegisterModal isOpen={registerOpen} onClose={() => setRegisterOpen(false)} />
    </div>
  );
}