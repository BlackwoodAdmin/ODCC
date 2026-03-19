import React from 'react';
import { useSearchParams } from 'react-router-dom';
import DonationForm from '../components/DonationForm';

export default function Give() {
  const [searchParams] = useSearchParams();
  const showSuccess = searchParams.get('success') === 'true';

  return (
    <div>
      <section className="relative py-24 bg-charcoal text-white">
        <div className="container-custom text-center">
          <h1 className="text-5xl font-bold mb-4">Give</h1>
          <p className="text-xl text-gray-300">Support the ministry of Open Door Christian Church</p>
        </div>
      </section>

      <section className="pt-8 md:pt-12 pb-16 md:pb-24 px-4 bg-white">
        <div className="max-w-5xl mx-auto text-center mb-12">
          <div className="bg-sage/20 rounded-2xl p-8">
            <p className="text-lg md:text-xl font-bold text-charcoal italic leading-relaxed">
              "Remember this: Whoever sows sparingly will also reap sparingly, and whoever sows generously will also reap generously. Each of you should give what you have decided in your heart to give, not reluctantly or under compulsion, for God loves a cheerful giver. And God is able to bless you abundantly, so that in all things at all times, having all that you need, you will abound in every good work."
            </p>
            <p className="text-sage font-semibold mt-4 text-lg">2 Corinthians 9:6-8</p>
          </div>
        </div>

        <div className="container-custom max-w-3xl">

          {/* Online Donation Form */}
          {showSuccess ? (
            <div className="text-center py-8 mb-12">
              <div className="text-6xl mb-4">🙏</div>
              <h3 className="text-2xl font-bold text-charcoal mb-3">Thank You for Your Generous Gift!</h3>
              <p className="text-gray-600 mb-2">Your donation has been received. A receipt has been sent to your email.</p>
              <p className="text-sage italic mt-4 text-lg">"God loves a cheerful giver." — 2 Corinthians 9:7</p>
            </div>
          ) : (
            <div className="mb-12">
              <h2 className="text-3xl font-bold text-charcoal mb-2 text-center">Give Online</h2>
              <div className="w-20 h-1 bg-sage mx-auto mb-8"></div>
              <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg p-8 border border-gray-100">
                <DonationForm />
              </div>
            </div>
          )}

          {/* Other ways to give */}
          <h2 className="text-3xl font-bold text-charcoal mb-6 text-center">Other Ways to Give</h2>
          <div className="w-20 h-1 bg-sage mx-auto mb-8"></div>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="card p-8 text-center">
              <div className="text-5xl mb-4">⛪</div>
              <h3 className="text-xl font-bold text-charcoal mb-3">In Person</h3>
              <p className="text-gray-600">Tithes and offerings can be given during any of our Sunday services. Offering is collected during the worship service.</p>
            </div>
            <div className="card p-8 text-center">
              <div className="text-5xl mb-4">✉️</div>
              <h3 className="text-xl font-bold text-charcoal mb-3">By Mail</h3>
              <p className="text-gray-600">Send your contribution to:</p>
              <p className="text-charcoal font-medium mt-2">
                Open Door Christian Church<br />
                1700 S Clara Ave<br />
                DeLand, FL 32720
              </p>
            </div>
          </div>

          <div className="mt-12 bg-cream rounded-2xl p-8 text-center">
            <h3 className="text-2xl font-bold text-charcoal mb-4">Your Generosity Makes a Difference</h3>
            <p className="text-gray-600 max-w-xl mx-auto">
              Your tithes and offerings support our worship services, community outreach,
              building maintenance, and ministry programs. Thank you for your faithful giving!
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
