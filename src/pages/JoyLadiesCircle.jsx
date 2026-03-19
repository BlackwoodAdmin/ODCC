import React from 'react';
import { Link } from 'react-router-dom';

export default function JoyLadiesCircle() {
  return (
    <div>
      <section className="relative py-24 bg-charcoal text-white">
        <div className="container-custom text-center">
          <h1 className="text-5xl font-bold mb-4">J.O.Y. Ladies Circle</h1>
          <p className="text-xl text-gray-300">Jesus · Others · Yourself</p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-custom max-w-4xl">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-sage/10 rounded-full mb-6">
              <span className="text-5xl">🌺</span>
            </div>
            <h2 className="text-4xl font-bold text-charcoal mb-4">Welcome to J.O.Y.</h2>
            <div className="w-20 h-1 bg-sage mx-auto mb-6"></div>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              The J.O.Y. Ladies Circle is a vibrant ministry of women dedicated to putting 
              <strong> Jesus first, Others second, and Yourself last</strong> — the true path to joy.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-12">
            <div className="bg-cream rounded-xl p-8 text-center">
              <div className="text-4xl mb-3 font-bold text-sage">J</div>
              <h3 className="text-xl font-bold text-charcoal mb-2">Jesus</h3>
              <p className="text-gray-600 text-sm">Putting Christ at the center of all we do, growing together in faith and devotion.</p>
            </div>
            <div className="bg-cream rounded-xl p-8 text-center">
              <div className="text-4xl mb-3 font-bold text-sage">O</div>
              <h3 className="text-xl font-bold text-charcoal mb-2">Others</h3>
              <p className="text-gray-600 text-sm">Serving our church, community, and neighbors with the love and compassion of Christ.</p>
            </div>
            <div className="bg-cream rounded-xl p-8 text-center">
              <div className="text-4xl mb-3 font-bold text-sage">Y</div>
              <h3 className="text-xl font-bold text-charcoal mb-2">Yourself</h3>
              <p className="text-gray-600 text-sm">Finding renewal and strength through fellowship, prayer, and sisterhood in Christ.</p>
            </div>
          </div>

          <div className="bg-sage/10 rounded-2xl p-10">
            <h3 className="text-2xl font-bold text-charcoal mb-4">What We Do</h3>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start gap-3"><span className="text-sage mt-1">✓</span> Bible study and devotional time</li>
              <li className="flex items-start gap-3"><span className="text-sage mt-1">✓</span> Community service and outreach projects</li>
              <li className="flex items-start gap-3"><span className="text-sage mt-1">✓</span> Fellowship meals and gatherings</li>
              <li className="flex items-start gap-3"><span className="text-sage mt-1">✓</span> Supporting church events and ministries</li>
              <li className="flex items-start gap-3"><span className="text-sage mt-1">✓</span> Prayer support and encouragement</li>
            </ul>
          </div>

          <div className="text-center mt-12">
            <p className="text-lg text-gray-600 mb-6">All women are welcome to join the J.O.Y. Ladies Circle!</p>
            <Link to="/contact" className="btn-primary">Contact Us to Learn More</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
