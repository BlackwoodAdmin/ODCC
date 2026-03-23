import React from 'react';
import { Link } from 'react-router-dom';

export default function Services() {
  const services = [
    {
      time: '8:30 AM', name: 'Drive-In Service', day: 'Sunday',
      desc: 'Our unique outdoor service where the preacher and praise team lead from the 2nd floor balcony. Tune your car radio to 87.9 FM or enjoy the outdoor speakers on the grounds. The fellowship hall is open before and after.',
      icon: '🚗', highlight: true
    },
    {
      time: '9:30 AM', name: 'Bible Study', day: 'Sunday',
      desc: 'Join us for in-depth study of God\'s Word. Classes available for all ages. Grow deeper in your understanding of Scripture with fellow believers.',
      icon: '📖'
    },
    {
      time: '10:30 AM', name: 'Chapel Service', day: 'Sunday',
      desc: 'Our main worship gathering featuring praise and worship, prayer, communion, and Biblical teaching. Communion is served every Sunday.',
      icon: '⛪'
    },
    {
      time: '6:00 PM', name: 'Wednesday Bible Study', day: 'Wednesday',
      desc: 'Midweek study and prayer time. Recharge your faith and stay connected with your church family throughout the week.',
      icon: '🗓️'
    }
  ];

  return (
    <div>
      <section className="relative py-24 bg-charcoal text-white">
        <div className="container-custom text-center">
          <h1 className="text-5xl font-bold mb-4">Service Times</h1>
          <p className="text-xl text-gray-300">Join us for worship throughout the week</p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-custom max-w-4xl">
          <div className="space-y-8">
            {services.map((s, i) => (
              <div key={i} className={`rounded-2xl p-8 ${s.highlight ? 'bg-sage/10 border-2 border-sage' : 'bg-cream'} transition-all`}>
                <div className="flex flex-col md:flex-row md:items-start gap-6">
                  <div className="text-5xl">{s.icon}</div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <span className="bg-sage text-white px-3 py-1 rounded-full text-sm font-semibold">{s.day}</span>
                      <span className="text-2xl font-bold text-charcoal">{s.time}</span>
                      {s.highlight && <span className="bg-earth text-white px-3 py-1 rounded-full text-xs font-semibold">87.9 FM</span>}
                    </div>
                    <h3 className="text-2xl font-bold text-charcoal mb-3">{s.name}</h3>
                    <p className="text-gray-600 leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-cream">
        <div className="container-custom text-center">
          <h2 className="text-3xl font-bold text-charcoal mb-4">Communion Every Sunday</h2>
          <p className="text-gray-600 max-w-2xl mx-auto mb-8">We celebrate the Lord’s Supper every Sunday as a central part of our worship, remembering Christ’s sacrifice and our unity as His body.</p>
          <Link to="/contact" className="btn-primary">Plan Your Visit</Link>
        </div>
      </section>
    </div>
  );
}
