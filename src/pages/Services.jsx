import React from 'react';
import { Link } from 'react-router-dom';

export default function Services() {
  const services = [
    {
      time: '8:30 AM', name: 'Fellowship Time (Chapel)', day: 'Sunday',
      desc: 'Coffee, breakfast foods, and good fellowship to start the day.',
      icon: '🌅'
    },
    {
      time: '9:00 AM', name: 'Drive-In Service (Garden, FM 87.9)', day: 'Sunday',
      desc: 'Worship right from your car. Roll the windows down, tune in, and let the morning come to you. Pajamas welcome. Coffee in hand. Kids in the back seat. No dress code, no pressure — just worship under the Florida sky.',
      icon: '🚗', highlight: true
    },
    {
      time: '10:15 AM', name: 'Bible Study (Chapel)', day: 'Sunday',
      desc: 'Bring your Bible, your questions, and an open heart.',
      icon: '📖'
    },
    {
      time: '11:00 AM', name: 'Indoor Chapel Service (Chapel)', day: 'Sunday',
      desc: 'Our full worship service in the air-conditioned chapel — hymns, communion, prayer, and the message. The same sermon as the drive-in, so come whichever way fits you best.',
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
