import React from 'react';
import { Link } from 'react-router-dom';

export default function About() {
  return (
    <div>
      <section className="relative py-24 bg-charcoal text-white">
        <div className="container-custom text-center">
          <h1 className="text-5xl font-bold mb-4">About Our Church</h1>
          <p className="text-xl text-gray-300">Serving DeLand, Florida since 1986</p>
        </div>
      </section>

      <section className="section-padding bg-white">
        <div className="container-custom">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-charcoal mb-4">Our Story</h2>
              <div className="w-20 h-1 bg-sage mx-auto"></div>
            </div>
            <div className="prose prose-lg max-w-none text-gray-600">
              <p className="text-xl leading-relaxed mb-6">
                Open Door Christian Church was founded in 1986 with a simple mission: to open our doors wide
                to all who seek Christ. For nearly four decades, we have been a cornerstone of the DeLand
                community, welcoming families and individuals with the love of Jesus.
              </p>
              <p className="leading-relaxed mb-6">
                Our guiding principle has always been clear: <em className="text-charcoal font-semibold">
                "We have no book but the Bible, have no creed but Christ."</em> This commitment to
                Scripture-based worship and Christ-centered living guides everything we do.
              </p>
              <p className="leading-relaxed mb-6">
                We celebrate communion every Sunday, gathering as one body to remember Christ's sacrifice.
                Our unique drive-in service, where the preacher and praise team lead worship from the
                2nd floor balcony while congregants tune in on 87.9 FM, has become a beloved tradition
                that brings our church family together in a truly special way.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section-padding bg-cream">
        <div className="container-custom">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-charcoal mb-4">What We Believe</h2>
            <div className="w-20 h-1 bg-sage mx-auto"></div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { icon: '📖', title: 'The Bible', text: 'We believe the Bible is the inspired, authoritative Word of God and our sole guide for faith and practice.' },
              { icon: '✝️', title: 'Jesus Christ', text: 'We believe in Jesus Christ as the Son of God, our Lord and Savior, and the only way to salvation.' },
              { icon: '🍞🍷', title: 'Communion', text: 'We celebrate the Lord\'s Supper every Sunday as a central act of worship and remembrance.' },
              { icon: '🌊', title: 'Baptism', text: 'We practice believer\'s baptism by immersion as an expression of faith and obedience.' },
              { icon: '🤝', title: 'Fellowship', text: 'We are committed to loving community where every member is valued and cared for.' },
              { icon: '🌍', title: 'Service', text: 'We are called to serve our neighbors, our community, and the world with the love of Christ.' },
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-xl p-8 shadow-md text-center">
                <div className="text-4xl mb-4">{item.icon}</div>
                <h3 className="text-xl font-bold text-charcoal mb-3">{item.title}</h3>
                <p className="text-gray-600">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-sage text-white text-center">
        <div className="container-custom">
          <h2 className="text-4xl font-bold mb-6">Come Visit Us</h2>
          <p className="text-xl mb-8 opacity-90 max-w-2xl mx-auto">We'd love to meet you and your family. Join us this Sunday!</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/services" className="bg-white text-sage px-8 py-4 rounded-lg font-semibold hover:bg-cream transition-colors text-lg">Service Times</Link>
            <Link to="/contact" className="border-2 border-white px-8 py-4 rounded-lg font-semibold hover:bg-white hover:text-sage transition-colors text-lg">Contact Us</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
